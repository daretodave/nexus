// Git per session and the repo's git panel (spec 40 A6). Read-only: nothing here
// closes a worktree, deletes a branch or writes a tracked file. Worktree
// verdicts (safe, holds work, locked, orphan, a lock's pid alive) come from the
// repo's own `scripts/worktree.mjs list --json`, never a second copy of its
// rules; the /tidy dry run only lists what /tidy would offer.
//
// git runs without a shell (its format strings carry `%`, which sh.mjs's
// Windows path refuses). Every gh call takes `{ run }` (the server's injected
// ghRun), so tests stub gh as a function and never shadow it on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { run as shRun, json, track } from './sh.mjs';
import { findScript, kitScripts } from './repo.mjs';
import { listClaims as readClaims } from './claims.mjs';

export const WORKTREE_SCRIPTS = kitScripts('worktree.mjs');
export const MAIN = process.env.NEXUS_MAIN_BRANCH || 'main';
const US = '\x1f';

/** git in `cwd`, no shell: { ok, out }. */
export function git(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    track(execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() });
    }));
  });
}

/** One spelling per folder, so a ledger's path and git's listing compare equal. */
export function samePath(p) {
  if (!p) return '';
  let r = path.resolve(String(p));
  try { r = fs.realpathSync.native(r); } catch { /* a folder that is gone keeps its spelling */ }
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/**
 * A pull request's CI from gh's statusCheckRollup: red when anything failed,
 * running while anything runs, queued while anything waits, green when all
 * passed (neutral and skipped count as passed), null with no checks.
 */
export function ciOf(rollup) {
  const list = Array.isArray(rollup) ? rollup : [];
  if (!list.length) return null;
  const states = list.map((c) => {
    if (c.__typename === 'StatusContext' || (c.state && !c.status)) {
      const s = String(c.state || '').toUpperCase();
      return s === 'SUCCESS' ? 'ok' : s === 'FAILURE' || s === 'ERROR' ? 'fail' : 'wait';
    }
    const st = String(c.status || '').toUpperCase();
    if (st !== 'COMPLETED') return st === 'IN_PROGRESS' ? 'run' : 'wait';
    const k = String(c.conclusion || '').toUpperCase();
    return ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(k) ? 'ok' : 'fail';
  });
  if (states.includes('fail')) return 'red';
  if (states.includes('run')) return 'running';
  if (states.includes('wait')) return 'queued';
  return 'green';
}

/** `git status --porcelain=v1 --branch` -> { branch, upstream, dirty, staged }: dirty counts unstaged and untracked files, staged the index. */
export function parseStatus(text) {
  const out = { branch: '', upstream: null, dirty: 0, staged: 0 };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const head = line.slice(3).replace(/\s+\[.*\]$/, '');
      const [br, up] = head.split('...');
      out.branch = br.startsWith('HEAD (no branch)') ? '' : br.replace(/^(No commits yet on|Initial commit on) /, '');
      out.upstream = up || null;
      continue;
    }
    const x = line[0];
    const y = line[1];
    if (x === '?' && y === '?') { out.dirty++; continue; }
    if (x !== ' ') out.staged++;
    if (y !== ' ') out.dirty++;
  }
  return out;
}

async function status(cwd) {
  const r = await git(cwd, ['status', '--porcelain=v1', '--branch', '--untracked-files=all']);
  return r.ok ? parseStatus(r.out) : null;
}

/** { ahead, behind } of `a` against `b`, or nulls when either ref is unknown. */
export async function aheadBehind(cwd, a, b) {
  const r = await git(cwd, ['rev-list', '--left-right', '--count', `${a}...${b}`]);
  if (!r.ok) return { ahead: null, behind: null };
  const [ahead, behind] = r.out.split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

/** The last `n` commits on `ref` as the boards draw them: { sha, m, w } (w an ISO time). */
export async function commits(cwd, ref = 'HEAD', n = 5) {
  const r = await git(cwd, ['log', `-${n}`, `--format=%h${US}%s${US}%cI`, ref, '--']);
  if (!r.ok) return [];
  return r.out.split(/\r?\n/).filter(Boolean).map((l) => {
    const [sha, m, w] = l.split(US);
    return { sha, m, w };
  });
}

/** The base work is measured against: origin/<main> when the remote has it, else <main>. */
export async function baseRef(cwd) {
  return (await git(cwd, ['rev-parse', '--verify', '--quiet', `origin/${MAIN}`])).ok ? `origin/${MAIN}` : MAIN;
}

/** Open pull requests through gh: { ok, prs: [{ num, title, branch, author, draft, url, ci }] }. */
export async function openPrs(repo, { run = shRun } = {}) {
  const r = await run('gh', ['pr', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title,headRefName,author,isDraft,url,statusCheckRollup'], { cwd: repo });
  const rows = r.ok ? json(r.stdout) : null;
  if (!Array.isArray(rows)) return { ok: false, prs: [], error: r.missing ? 'gh is not installed' : (r.stderr || '').trim().slice(0, 300) || 'gh could not list pull requests' };
  return {
    ok: true,
    prs: rows.map((p) => ({ num: p.number, title: p.title || '', branch: p.headRefName || '', author: p.author?.login || '', draft: !!p.isDraft, url: p.url || '', ci: ciOf(p.statusCheckRollup) })),
  };
}

/** Branches of closed or merged pull requests, through gh: the remote side of /tidy. */
export async function closedPrBranches(repo, { run = shRun } = {}) {
  const r = await run('gh', ['pr', 'list', '--state', 'closed', '--limit', '100', '--json', 'headRefName'], { cwd: repo });
  const rows = r.ok ? json(r.stdout) : null;
  return Array.isArray(rows) ? { ok: true, branches: [...new Set(rows.map((p) => p.headRefName).filter(Boolean))] } : { ok: false, branches: [] };
}

/** The claims a session holds: a claim's session tag is a session id or its first eight characters. */
export function claimsOf(rows, s) {
  if (!Array.isArray(rows) || !s) return [];
  const ids = new Set([s.id, s.claude].filter(Boolean).flatMap((x) => [String(x), String(x).slice(0, 8)]));
  return rows.filter((c) => c && c.session && ids.has(String(c.session)));
}

/** The repo's worktrees through its own `worktree.mjs list --json`; without the script, git's bare listing (no verdicts). */
export async function listWorktrees(root) {
  const script = findScript(root, WORKTREE_SCRIPTS);
  if (script) {
    const rows = await new Promise((resolve) => {
      track(execFile(process.execPath, [script, 'list', '--json', '--repo', root], { cwd: root, timeout: 60000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : json(String(stdout)))));
    });
    if (Array.isArray(rows)) return { script, rows };
  }
  const r = await git(root, ['worktree', 'list', '--porcelain']);
  const blocks = r.ok ? r.out.split(/\r?\n\s*\r?\n/) : [];
  const rows = blocks.slice(1).map((b) => {
    const lines = b.split(/\r?\n/);
    const f = (n) => lines.find((l) => l.startsWith(`${n} `))?.slice(n.length + 1);
    return { path: f('worktree'), head: f('HEAD') || null, branch: f('branch')?.replace(/^refs\/heads\//, '') || null, locked: lines.some((l) => /^locked\b/.test(l)), exists: !!f('worktree') && fs.existsSync(f('worktree')), verdict: null };
  }).filter((w) => w.path);
  return { script: null, rows };
}

const FALLEN = new Set(['fallen', 'resume-failed']);

/**
 * One worktree row as the panel draws it, from worktree.mjs's verdict and the
 * session that names it. flag: active (a session works there, or a live pid
 * holds its lock), fallen (its session fell over), orphaned (git lists it, the
 * folder is gone), idle (nobody: what /tidy would look at).
 */
export function worktreeRow(w, s, { pr = null } = {}) {
  const fell = s && FALLEN.has(s.state);
  const parked = !!(s && s.state === 'paused' && s.held);
  const lockLive = w.locked && w.pidAlive === true;
  const flag = w.verdict === 'orphan' || w.exists === false ? 'orphaned' : fell ? 'fallen' : s || lockLive ? 'active' : 'idle';
  const act = [];
  if (w.verdict === 'orphan' || w.exists === false) act.push('folder gone');
  if (s?.kind === 'terminal') act.push('terminal session');
  if (parked) act.push('parked loop');
  if (fell) act.push('fell over');
  if (w.locked) act.push(w.pid ? `locked by pid ${w.pid} (${w.pidAlive ? 'alive' : 'dead'})` : 'locked');
  if (w.ahead) act.push(`${w.ahead} ${w.ahead === 1 ? 'commit' : 'commits'} beyond ${w.base || 'main'}`);
  if (w.dirty) act.push(`${w.dirty} uncommitted`);
  if (!act.length && w.verdict === 'safe') act.push('nothing beyond main');
  return {
    path: w.path,
    branch: w.branch || '(detached)',
    head: w.head || null,
    sessionId: s?.id || null,
    session: s ? { name: s.name, kind: s.kind || 'local' } : null,
    who: s ? s.name : lockLive ? `pid ${w.pid}` : 'no session',
    flag,
    verdict: w.verdict ?? null,
    exists: w.exists !== false,
    prunable: !!w.prunable,
    locked: !!w.locked,
    pid: w.pid ?? null,
    pidAlive: w.pidAlive ?? null,
    dirty: w.dirty || 0,
    ahead: w.ahead || 0,
    pr: pr ? { num: pr.num, ci: pr.ci, url: pr.url } : null,
    act: act.join(' · '),
    run: s?.run || null,
  };
}

/**
 * The /tidy dry run over the panel's rows: what `/tidy` would offer, never
 * done here. A worktree goes when it is idle and safe (or an orphan: git
 * still lists a folder that is gone) with no open pull request; every other
 * one is kept, with why. Branches: merged into the base and checked out
 * nowhere. Remote: next/, pkg/ and plot/ branches of closed pull requests.
 */
export function tidyPlan({ worktrees = [], merged = [], remote = [] } = {}) {
  const go = [];
  const keep = [];
  for (const w of worktrees) {
    if (w.flag === 'orphaned' && !w.sessionId) go.push({ branch: w.branch, path: w.path, why: 'its folder is gone; git still lists it.' });
    else if (w.flag === 'idle' && w.verdict === 'safe' && !w.pr && !w.locked) go.push({ branch: w.branch, path: w.path, why: 'no session, nothing uncommitted, nothing beyond main.' });
    else keep.push(w);
  }
  const holds = keep.filter((w) => w.verdict === 'holds work' && w.flag === 'idle');
  const keepNote = holds.length ? `${holds.length} idle ${holds.length === 1 ? 'one holds' : 'hold'} work (${holds.map((w) => w.branch).join(', ')}): /tidy asks before closing ${holds.length === 1 ? 'it' : 'them'}.` : '';
  return { worktrees: go, branches: merged, remote, prune: 0, keep: keep.length, keepNote, holds: holds.map((w) => ({ branch: w.branch, path: w.path, ahead: w.ahead, dirty: w.dirty })) };
}

/**
 * A time-boxed memo with in-flight sharing. Past `ms` the last value is still
 * served while a fresh one is read behind it, so a poll never waits on gh or
 * a claims fetch it already has an answer for; only the first read waits.
 */
function memo(ms, fn) {
  const cache = new Map();
  return (key, ...args) => {
    if (!ms) return Promise.resolve().then(() => fn(...args)).catch(() => null);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.p;
    const p = Promise.resolve().then(() => fn(...args)).catch(() => null);
    if (hit && hit.done) {
      cache.set(key, { ...hit, at: Date.now() });
      p.then((v) => cache.set(key, { at: Date.now(), p: Promise.resolve(v), done: true }));
      return hit.p;
    }
    const entry = { at: Date.now(), p, done: false };
    p.then(() => { entry.done = true; });
    cache.set(key, entry);
    return p;
  };
}

/**
 * The git view for one server.
 * @param {object} o
 * @param {string} o.repo
 * @param {() => Promise<string>} o.root           the primary checkout's root
 * @param {() => Promise<any[]>} o.sessions        the live session list (steering.list)
 * @param {function} [o.run]                        gh runner (the injected ghRun)
 * @param {(repo: string) => Promise<{rows?: any[]}>} [o.claims]  the claims list (tests stub it)
 */
export function createGitView({ repo, root, sessions, run = shRun, claims = readClaims, ttl = {} } = {}) {
  const prs = memo(ttl.prs ?? 30000, async () => openPrs(repo, { run }));
  const closed = memo(ttl.prs ?? 30000, async () => closedPrBranches(repo, { run }));
  const claimRows = memo(ttl.claims ?? 60000, async () => {
    const c = await claims(repo);
    return Array.isArray(c?.rows) ? c.rows : null;
  });
  const perCwd = memo(ttl.session ?? 3000, async (cwd) => {
    const st = await status(cwd);
    if (!st) return null;
    const base = st.upstream || (await baseRef(cwd));
    const [ab, log] = await Promise.all([aheadBehind(cwd, 'HEAD', base), commits(cwd, 'HEAD', 5)]);
    return { ...st, base, ahead: ab.ahead, behind: ab.behind, commits: log };
  });

  /** Where a session works: its worktree, else the worktree on its branch, else the primary checkout. */
  async function cwdOf(s, listed) {
    const g = s.git || {};
    if (g.worktree && fs.existsSync(g.worktree)) return g.worktree;
    if (s.cwd && fs.existsSync(s.cwd)) return s.cwd;
    if (g.branch) {
      const hit = (listed || []).find((w) => w.branch === g.branch && w.exists !== false);
      if (hit) return hit.path;
    }
    return root();
  }

  /** One session's git: branch, worktree, ahead/behind, dirty and staged, last five commits, PR and checks, claims held. */
  async function forSession(s, ctx = {}) {
    const cwd = await cwdOf(s, ctx.worktrees);
    const [g, pr, rows] = await Promise.all([perCwd(samePath(cwd), cwd), ctx.prs ?? prs('prs'), ctx.claims ?? claimRows('claims')]);
    const was = s.git || {};
    if (!g) return { ...was };
    const branch = g.branch || was.branch || '';
    const open = pr?.ok ? pr.prs.find((p) => p.branch && p.branch === branch) : null;
    const held = rows ? claimsOf(rows, s) : null;
    return {
      ...was,
      branch,
      worktree: was.worktree || (samePath(cwd) === samePath(await root()) ? '' : cwd),
      cwd,
      base: g.base,
      up: g.ahead ?? 0,
      down: g.behind ?? 0,
      ahead: g.ahead,
      behind: g.behind,
      dirty: g.dirty,
      staged: g.staged,
      commits: g.commits,
      pr: open ? { num: open.num, ci: open.ci, url: open.url, title: open.title } : null,
      claims: held ? held.length : null,
      claimIds: held ? held.map((c) => c.id) : null,
    };
  }

  /** The session list with each row's git filled in. */
  async function withGit(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return rows;
    const ctx = { prs: prs('prs'), claims: claimRows('claims') };
    return Promise.all(rows.map(async (s) => ({ ...s, git: await forSession(s, ctx) })));
  }

  /** Map each listed worktree to the session that names it (a closed one names none). */
  function bySession(list, rows) {
    const out = new Map();
    for (const s of rows || []) {
      if (s.state === 'closed') continue;
      const wt = s.git?.worktree;
      const hit = wt ? list.find((w) => samePath(w.path) === samePath(wt)) : s.git?.branch ? list.find((w) => w.branch === s.git.branch) : null;
      if (hit && !out.has(hit.path)) out.set(hit.path, s);
    }
    return out;
  }

  /** GET /api/git: every worktree, the primary checkout, main's recent commits, open PRs. */
  async function repoGit() {
    const top = await root();
    // A folder that is not a repo yet (place.mjs 'none'): an honest answer the panel draws as a pointer, not git's fatal.
    if (!(await git(top, ['rev-parse', '--git-dir'])).ok) {
      return { isGit: false, repo: path.basename(top), root: { path: top, branch: '', up: 0, down: 0, upstream: null, dirty: 0, staged: 0, pulled: null }, worktrees: [], main: { base: MAIN, ahead: 0, behind: 0, commits: [] }, prs: [], gh: false, note: 'This folder is not a git repo yet.' };
    }
    const [wl, list, pr, st, base, fetched] = await Promise.all([
      listWorktrees(top),
      sessions().catch(() => []),
      prs('prs'),
      status(top),
      baseRef(top),
      fs.promises.stat(path.join(top, '.git', 'FETCH_HEAD')).then((x) => x.mtime.toISOString(), () => null),
    ]);
    const owner = bySession(wl.rows, list);
    const prList = pr?.ok ? pr.prs : [];
    const worktrees = wl.rows.map((w) => worktreeRow(w, owner.get(w.path) || null, { pr: prList.find((p) => p.branch && p.branch === w.branch) || null }));
    await Promise.all(worktrees.map(async (w) => {
      if (!w.exists || !w.head) return;
      const c = await commits(top, w.head, 1);
      if (c[0]) { w.age = c[0].w; w.act = [`committed ${c[0].sha}`, w.act].filter(Boolean).join(' · '); }
    }));
    const up = st?.upstream ? await aheadBehind(top, 'HEAD', st.upstream) : { ahead: null, behind: null };
    const mainAb = base === MAIN ? { ahead: 0, behind: 0 } : await aheadBehind(top, MAIN, base);
    const bySessionWho = new Map(worktrees.filter((w) => w.session).map((w) => [w.branch, w.who]));
    return {
      repo: path.basename(top),
      worktreeScript: wl.script,
      root: { path: top, branch: st?.branch || '', up: up.ahead ?? 0, down: up.behind ?? 0, upstream: st?.upstream || null, dirty: st?.dirty ?? 0, staged: st?.staged ?? 0, pulled: fetched },
      worktrees,
      main: { base, ahead: mainAb.ahead ?? 0, behind: mainAb.behind ?? 0, commits: await commits(top, base, 8) },
      prs: prList.map((p) => ({ ...p, desc: [bySessionWho.get(p.branch), p.branch, p.author, p.draft ? 'draft' : ''].filter(Boolean).join(' · ') })),
      gh: !!pr?.ok,
      ...(pr && !pr.ok ? { ghNote: pr.error } : {}),
    };
  }

  /** GET /api/git/tidy: the /tidy dry run. Lists only; changes nothing. */
  async function tidyDry() {
    const top = await root();
    const panel = await repoGit();
    if (!panel.worktreeScript) return { available: false, error: 'no scripts/worktree.mjs in this repo: run /tidy dry in a terminal' };
    const base = panel.main.base;
    const out = new Set(panel.worktrees.map((w) => w.branch));
    const [m, rem, c] = await Promise.all([
      git(top, ['branch', '--merged', base, '--format=%(refname:short)']),
      git(top, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/next', 'refs/remotes/origin/pkg', 'refs/remotes/origin/plot']),
      closed('closed'),
    ]);
    const merged = (m.ok ? m.out.split(/\r?\n/) : []).map((b) => b.trim()).filter((b) => b && b !== MAIN && b !== panel.root.branch && !out.has(b));
    const gone = new Set(c?.ok ? c.branches : []);
    const remote = (rem.ok ? rem.out.split(/\r?\n/) : []).map((b) => b.trim().replace(/^origin\//, '')).filter((b) => b && gone.has(b));
    return { available: true, dry: true, ...tidyPlan({ worktrees: panel.worktrees, merged, remote }), ...(c?.ok ? {} : { note: 'gh could not list closed pull requests: remote branches skipped' }) };
  }

  /** POST /api/git/fetch: `git fetch --prune origin` at the primary checkout (refs only; no worktree or branch is touched). */
  async function fetchNow() {
    const top = await root();
    const r = await git(top, ['fetch', '--prune', 'origin'], { timeout: 120000 });
    return r.ok ? { ok: true } : { ok: false, error: r.err.slice(0, 400) || 'git fetch failed' };
  }

  return { forSession, withGit, repoGit, tidyDry, fetchNow };
}
