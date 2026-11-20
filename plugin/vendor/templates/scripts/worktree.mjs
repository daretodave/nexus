// scripts/worktree.mjs: cut a worktree in one step, close a linked one without reaching past it, and list them for /tidy.
//
// Every build runs in its own worktree, so worktrees pile up, and closing one is where work gets lost. git for Windows
// follows a junction when it deletes a worktree: a plain `git worktree remove` has deleted the file behind a junction to
// an outside folder (npm's workspace links are junctions) and exited 0, and a junction back into the worktree sent it
// recursing until "Filename too long". It also stops at its first failure after it has already unregistered the
// worktree, leaving the rest on disk. So a worktree closes only through this script (the guard hook refuses a bare
// `git worktree remove`):
//   - `cut` resolves a base ref to a sha, then adds the worktree there — detached, or on a new branch when `--branch`
//     is given — in one node call: the multi-step `base=$(git rev-parse …)` a shell needs (bash/POSIX-only syntax a
//     PowerShell session can't run as written) collapses to a command a skill can show once and any shell can run.
//   - `close` refuses the main checkout, a locked worktree, the folder this shell stands in, and one holding work git
//     doesn't (uncommitted or untracked files);
//   - it unlinks every link in the worktree first (an unlink never touches what a link points at), lets git remove it,
//     finishes any folder git left once git no longer lists it, and deletes the branch only when main or origin/main
//     holds it (a branch main doesn't hold is kept and named).
//   - `list` reports every linked worktree: branch, locked, dirty files, commits beyond origin/main, and a verdict
//     (`safe` to close, `holds work`, `locked`), so /tidy can offer the safe ones in one question. A locked one's
//     reason naming a pid says whether that pid still lives (a dead one is a stale lock: `git worktree unlock` it).
//
//   node scripts/worktree.mjs cut <path> --ref <ref> [--branch <name>] [--repo <checkout>]
//   node scripts/worktree.mjs close <path> [<path> …] [--repo <checkout>]
//   node scripts/worktree.mjs list [--json] [--repo <checkout>]
//
// --repo is a checkout of the repository (by default the one holding this script). Exits 1 when a path isn't a linked
// worktree of it, is refused, or is still there after the close — or, for `cut`, the ref doesn't resolve or the add
// fails. NEXUS_MAIN_BRANCH names main (default `main`).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAIN = process.env.NEXUS_MAIN_BRANCH || 'main';
const USAGE = 'usage: node scripts/worktree.mjs cut <path> --ref <ref> [--branch <name>] [--repo <checkout>]\n       node scripts/worktree.mjs close <path> [<path> …] [--repo <checkout>]\n       node scripts/worktree.mjs list [--json] [--repo <checkout>]';

function git(cwd, ...args) {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { ok: res.status === 0, out: (res.stdout ?? '').trim(), err: (res.stderr ?? '').trim() };
}

/**
 * One spelling per folder: the real path of its nearest existing ancestor plus the rest (so a Windows 8.3 short name
 * such as RUNNER~1, a symlinked /tmp or a junction spells as git's own listing does), case-folded where the file
 * system ignores case.
 */
function real(p) {
  let at = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(at), ...rest);
    } catch {
      const up = path.dirname(at);
      if (up === at) return path.resolve(p);
      rest.unshift(path.basename(at));
      at = up;
    }
  }
}
const norm = (p) => (process.platform === 'win32' ? real(p).toLowerCase() : real(p));
const within = (p, dir) => norm(p) === norm(dir) || norm(p).startsWith(norm(dir) + path.sep);

/** The repository's worktrees (`git worktree list --porcelain`), the main checkout first. */
export function worktrees(repo) {
  const res = git(repo, 'worktree', 'list', '--porcelain');
  if (!res.ok) throw new Error(`git worktree list in ${repo}: ${res.err}`);
  return parseWorktrees(res.out);
}

/**
 * The porcelain listing as { path, head, branch, locked, lockReason, pid, prunable }, the main checkout first. `pid` is
 * the number a lock's reason names (`pid 4242`, `pid=4242`, `PID: 4242`, as an agent harness locks its worktree), or
 * null.
 */
export function parseWorktrees(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const field = (name) => lines.find((l) => l.startsWith(`${name} `))?.slice(name.length + 1);
      const locked = lines.some((l) => l === 'locked' || l.startsWith('locked '));
      const lockReason = field('locked') ?? null;
      const pid = Number(lockReason?.match(/\bpid\s*[:=#]?\s*(\d+)/i)?.[1]) || null;
      return {
        path: field('worktree'),
        head: field('HEAD'),
        branch: field('branch')?.replace(/^refs\/heads\//, ''),
        locked,
        lockReason,
        pid,
        prunable: lines.some((l) => l === 'prunable' || l.startsWith('prunable ')),
      };
    })
    .filter((w) => w.path);
}

/**
 * Whether a process lives: true, false, or null for no pid. Signal 0 only asks (Node maps it to OpenProcess and
 * GetExitCodeProcess on Windows, so no tasklist is needed); EPERM is a live process someone else owns.
 */
export function pidAlive(pid) {
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

/** Every link under `dir` (a symlink, or a junction on Windows), never descending into one. */
export function links(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) found.push(p);
      else if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return found;
}

/** Unlinks every link under `dir`, then deletes it: nothing a link points at is touched. Returns the links unlinked. */
export function finish(dir) {
  const found = links(dir);
  for (const p of found) fs.unlinkSync(p);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  return found.length;
}

/** What /tidy needs per linked worktree: dirty files, commits beyond origin/main, and a verdict. */
export function survey(repo) {
  const all = worktrees(repo);
  const home = all[0].path;
  const base = git(home, 'rev-parse', '--verify', '--quiet', `origin/${MAIN}`).ok ? `origin/${MAIN}` : MAIN;
  return all.slice(1).map((w) => {
    const exists = fs.existsSync(w.path);
    const dirty = exists ? git(w.path, 'status', '--porcelain', '--untracked-files=all').out.split(/\r?\n/).filter(Boolean).length : 0;
    const ahead = w.head ? Number(git(home, 'rev-list', '--count', `${base}..${w.head}`).out) || 0 : 0;
    const verdict = w.locked ? 'locked' : !exists ? 'orphan' : dirty || ahead ? 'holds work' : 'safe';
    return { ...w, pidAlive: w.locked ? pidAlive(w.pid) : null, exists, dirty, ahead, base, verdict };
  });
}

/**
 * Resolves `ref` to a sha in `repo`, then adds a worktree at `targetPath` there — detached, or on a new branch when
 * `branch` is given — in one call. Replaces a shell's `base=$(git rev-parse <ref>)` followed by a bare
 * `git worktree add ... "$base"`: one node invocation a PowerShell session runs the same as a bash one.
 */
export function cut(repo, targetPath, { ref, branch } = {}) {
  const resolved = git(repo, 'rev-parse', ref);
  if (!resolved.ok) throw new Error(`${ref}: doesn't resolve in ${repo} (${resolved.err})`);
  const sha = resolved.out;
  const added = git(repo, 'worktree', 'add', ...(branch ? ['-b', branch] : ['--detach']), targetPath, sha);
  if (!added.ok) throw new Error(`git worktree add ${targetPath} ${sha}: ${added.err}`);
  return { sha, path: targetPath, branch: branch ?? null };
}

/** Closes one worktree and says what it did, step by step; throws when it refuses or fails. */
export function close(target, repo) {
  const all = worktrees(repo);
  const wt = all.find((w) => norm(w.path) === norm(target));
  if (!wt) throw new Error(`${target}: not a worktree of ${repo} (git worktree list)`);
  if (wt === all[0]) throw new Error(`${target}: that's the main checkout; close removes only linked worktrees`);
  if (wt.locked) throw new Error(`${wt.path}: locked (git worktree unlock it first if it should go)`);
  if (within(process.cwd(), wt.path)) throw new Error(`${wt.path}: this shell is inside it; run close from elsewhere`);
  const home = all[0].path;
  const said = [];
  let unlinked = 0;
  let forced = false;
  if (fs.existsSync(wt.path)) {
    const st = git(wt.path, 'status', '--porcelain', '--untracked-files=all');
    if (!st.ok) throw new Error(`${wt.path}: git status failed: ${st.err}`);
    if (st.out) throw new Error(`${wt.path}: holds work git doesn't (commit or drop it first):\n${st.out}`);
    // A link git tracks (a committed symlink) is unlinked too, which leaves it deleted in git's eyes: git would then
    // refuse the remove as modified. The status above was clean, so --force forgives exactly those deletions.
    const tracked = new Set(
      git(wt.path, 'ls-files', '-s', '-z').out.split('\0').filter((e) => e.startsWith('120000 ')).map((e) => e.split('\t')[1]),
    );
    const found = links(wt.path);
    for (const p of found) fs.unlinkSync(p);
    unlinked = found.length;
    forced = found.some((p) => tracked.has(path.relative(wt.path, p).split(path.sep).join('/')));
    said.push(`unlinked ${unlinked} link${unlinked === 1 ? '' : 's'}`);
  }
  const removed = git(home, 'worktree', 'remove', ...(forced ? ['--force'] : []), wt.path);
  git(home, 'worktree', 'prune');
  if (worktrees(repo).some((w) => norm(w.path) === norm(wt.path))) {
    throw new Error(`${wt.path}: git kept it (${removed.err}); its ${unlinked} links are unlinked (npm install puts npm's back)`);
  }
  let left = null;
  if (fs.existsSync(wt.path)) {
    // git unregistered it, then stopped at its first failure: what's left are files git had already let go of.
    try {
      finish(wt.path);
      said.push(`finished the folder git left (${removed.err.split('\n').pop()})`);
    } catch (err) {
      // Another process holds it (a shell or an editor standing in it: Windows refuses that delete). git has let it
      // go, so the branch step still runs; the close then fails, naming what's left.
      left = `${wt.path}: still on disk (${err?.code ?? err}): a shell or an editor may have it open; delete it once nothing does`;
    }
  }
  if (!left) said.push('removed');
  if (wt.branch && wt.branch !== MAIN) {
    // origin/main counts too: a chunk lands with `git push origin HEAD:main` from its worktree, so a primary checkout
    // that can't fast-forward has a main that lags what landed.
    const held = [MAIN, `origin/${MAIN}`].some((ref) => git(home, 'merge-base', '--is-ancestor', wt.branch, ref).ok);
    if (!held) said.push(`kept branch ${wt.branch}: ${MAIN} doesn't hold it`);
    else {
      // -D, since -d asks only HEAD or the branch's upstream, and main or origin/main was just checked to hold it.
      const del = git(home, 'branch', '-D', wt.branch);
      said.push(del.ok ? `deleted branch ${wt.branch}` : `kept branch ${wt.branch}: ${del.err}`);
    }
  }
  if (left) throw new Error(`${left}; ${said.join('; ')}`);
  return said;
}

/** ` · locked`, plus the lock's pid and whether it lives when the reason names one. */
// git locks a worktree "initializing" while `git worktree add` runs; one still locked so is an add cut short (nexus
// stopped mid-way), which the nexus GUI finishes in place when it next starts.
const lockNote = (r) => (!r.locked ? '' : /initializ/i.test(r.lockReason || '') ? ' · interrupted add (nexus repairs it on start)' : r.pid ? ` · locked by pid ${r.pid} (${r.pidAlive ? 'alive' : 'dead'})` : ' · locked');

export function main(argv,{ out = console.log, err = console.error } = {}) {
  const [cmd, ...rest] = argv;
  let repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let ref = null;
  let branch = null;
  const targets = [];
  let bad = false;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') json = true;
    else if (rest[i] === '--repo') { if (rest[i + 1] === undefined) bad = true; else repo = path.resolve(rest[++i]); }
    else if (rest[i] === '--ref') { if (rest[i + 1] === undefined) bad = true; else ref = rest[++i]; }
    else if (rest[i] === '--branch') { if (rest[i + 1] === undefined) bad = true; else branch = rest[++i]; }
    else targets.push(rest[i]);
  }
  if (cmd === 'cut') {
    if (bad || targets.length !== 1 || !ref) {
      err(USAGE);
      return 2;
    }
    try {
      const r = cut(repo, path.resolve(targets[0]), { ref, branch });
      out(`${r.path}: cut from ${ref} (${r.sha.slice(0, 10)})${r.branch ? ` on branch ${r.branch}` : ' detached'}`);
      return 0;
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
      return 1;
    }
  }
  if (cmd === 'list' && !bad && !targets.length) {
    const rows = survey(repo);
    if (json) out(JSON.stringify(rows, null, 2));
    else if (!rows.length) out('worktree: no linked worktrees');
    else for (const r of rows) out(`${r.verdict.padEnd(10)} ${r.path} · ${r.branch ?? '(detached)'} · ${r.dirty} dirty · ${r.ahead} ahead of ${r.base}${lockNote(r)}`);
    return 0;
  }
  if (bad || cmd !== 'close' || !targets.length) {
    err(USAGE);
    return 2;
  }
  let failed = 0;
  for (const target of targets) {
    try {
      out(`${target}: ${close(target, repo).join('; ')}`);
    } catch (e) {
      failed++;
      err(e instanceof Error ? e.message : String(e));
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
