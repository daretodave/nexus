// `nexus upgrade` on a v2 repo: the sync to the current kit (spec 58, "v2 to latest").
//
// The lock's `ref:` names the kit commit the repo follows, so every kit file has three versions: the kit at that ref
// (base: kitAt, from the nexus repo's own history in a dev checkout, else a shallow fetch of the kit repo), the kit
// now (theirs: the CLI's bundled kit, or templates/ in a dev checkout) and the repo's copy (ours). Placeholders are
// filled the same way in base and theirs before any comparison, so a filled-in copy reads as untouched.
//
//   ours == base               untouched: replaced with theirs
//   theirs == base             the kit has not changed it: ours stays
//   ours != base, both moved   a three-way merge (git merge-file); a clean one applies; a conflict goes to the
//                              assisted merge (`assist`, a helper-model session given base, theirs and ours that
//                              returns the merged file and one reason per hunk it kept from ours), shown as a diff
//                              and applied only with the repo's gate green, else left as ours and listed (an
//                              answer that keeps conflict markers or drops a line the repo wrote is not used)
//   no ours                    a vendored copy at another path (same name, mostly the same lines) counts as ours;
//                              else new content: a file new since the ref, of a kind the repo takes (followsOf),
//                              is added; any other is listed as available, and added only when code the repo keeps
//                              now imports it (a repo that vendored a few kit scripts by hand takes no others)
//   ours, no base              the kit now ships a file the repo already has its own of: ours stays, a warning
//   lanes files, custom skills never touched
//
// Code moves as a family: a script or test coupled by imports (through files that move) to one that stays as the
// repo's is held back with it, so a vendored test never runs ahead of its code.
//
// A knob the kit's templates name now but did not at the ref arrives at its conservative value (upgrade.mjs KNOBS),
// so behaviour does not change until the owner turns it up. The lock's `ref:` and `version:` move to the kit commit
// the CLI was built from (kitBuild), its other lines and comments kept. With --write the result is one commit,
// `plan: sync to nexus <version>`, on branch nexus/upgrade-<version>.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOBS, gitIn, knobsIn, lockField, mergeRows, packageManagerOf, projectName, writeKnobs } from './upgrade.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXUS_ROOT = path.resolve(PKG, '..', '..');

/** Where a published CLI fetches the kit at a lock's ref from (NEXUS_KIT_REPO overrides: a URL or a local path). */
export const KIT_REPO_URL = 'https://github.com/daretodave/nexus.git';
export const syncSubject = (version) => `plan: sync to nexus ${version}`;
export const syncBranch = (version) => `nexus/upgrade-${version}`;

const LF = (s) => String(s).replace(/\r\n/g, '\n');
const read = (dir, rel) => { try { return fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'); } catch { return null; } };
function writeFile(dir, rel, text) {
  const abs = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/** git with the output untrimmed (a file's bytes): { ok, status, raw, out, err }. */
function gitRaw(cwd, args, { env } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...(env ? { env } : {}) });
  return { ok: r.status === 0, status: r.status, raw: r.stdout || '', out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

const isGitDir = (dir) => !!dir && fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, 'templates'));

/** How many commits a build's trail names at most (a build past its tag by more reads as the tag's core alone). */
export const TRAIL_MAX = 2000;

/**
 * The kit commit a nexus checkout is at: { ref, version }. version is the newest `v*` tag's number, with `+<short
 * sha>` when the commit is past it (a shallow checkout with no tags: the template lock's version). Null outside git.
 * With `trail`, also `trail`: the 12-character shas of the commits past that tag (at most TRAIL_MAX), so a CLI with
 * no nexus history beside it can still tell a lock at `<core>+<short sha>` is behind its build (kitBehind).
 */
export function kitBuild(nexus = NEXUS_ROOT, { trail = false } = {}) {
  const sha = gitIn(nexus, ['rev-parse', 'HEAD']);
  if (!sha.ok || !/^[0-9a-f]{40}$/.test(sha.out)) return null;
  const tag = gitIn(nexus, ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']);
  const at = tag.ok && gitIn(nexus, ['rev-parse', `${tag.out}^{commit}`]).out === sha.out;
  const base = tag.ok ? tag.out.replace(/^v/, '') : lockField(read(nexus, 'templates/plan/nexus.lock'), 'version') || '0.0.0';
  const build = { ref: sha.out, version: at ? base : `${base}+${sha.out.slice(0, 7)}` };
  if (trail) {
    const r = gitIn(nexus, ['rev-list', `--max-count=${TRAIL_MAX}`, tag.ok ? `${tag.out}..HEAD` : 'HEAD']);
    build.trail = r.ok && r.out ? r.out.split(/\s+/).map((s) => s.slice(0, 12)) : [];
  }
  return build;
}

/** The sha a lock names: its `ref:` when that is one, else the `+<short sha>` its `version:` carries, else null. */
const lockSha = (lock) => {
  if (/^[0-9a-f]{7,40}$/.test(String(lock?.ref || ''))) return lock.ref;
  const m = /\+([0-9a-f]{7,40})$/.exec(String(lock?.version || ''));
  return m ? m[1] : null;
};
const sameSha = (a, b) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/**
 * Whether a v2 repo's lock ({ version, ref }, repo.mjs kitLock) is behind `build` (this CLI's kit: { ref, version,
 * trail? }), so a sync would move it forward. The GUI's Sync banner reads it on every state read, so it asks git only
 * of a nexus checkout beside the CLI (a dev run: is the lock's ref an ancestor of the build?) and otherwise reads the
 * build alone: a lock sha in the build's trail is behind; else the versions' semver cores; on equal cores, a lock at
 * the tag itself (no `+sha`) is behind a build past it. Unknown reads as not behind: the banner never offers a sync
 * the CLI cannot tell is forward (the sync itself still refuses to run backwards).
 */
export function kitBehind({ lock, build, nexus = null }) {
  if (!lock || !build?.ref) return false;
  const sha = lockSha(lock);
  if (sameSha(sha, build.ref) || (lock.version && lock.version === build.version)) return false;
  if (lock.ref && isGitDir(nexus)) {
    const at = gitIn(nexus, ['rev-parse', '--verify', '--quiet', `${lock.ref}^{commit}`]);
    if (at.ok && at.out) {
      if (at.out === build.ref) return false;
      const r = spawnSync('git', ['merge-base', '--is-ancestor', at.out, build.ref], { cwd: nexus, stdio: 'ignore', windowsHide: true });
      if (r.status === 0) return true;
      if (r.status === 1) return false;
    }
  }
  if (sha && Array.isArray(build.trail) && build.trail.some((t) => sameSha(t, sha))) return true;
  const a = semverCore(lock.version);
  const b = semverCore(build.version);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
  return !String(lock.version).includes('+') && String(build.version).includes('+');
}

let cliBuildMemo;
/**
 * The kit this CLI carries: { build, nexus }. build ({ ref, version, trail? }) is the bundled kit/upgrade/files.json's,
 * else (a dev run beside the nexus checkout) kitBuild of that checkout; nexus is the checkout kitBehind may ask, set
 * only in a dev run. Null when neither. Read once per process: the bundle never changes under a running CLI.
 */
export function cliBuild({ bundled = path.join(PKG, 'kit', 'upgrade'), nexus = NEXUS_ROOT, fresh = false } = {}) {
  if (cliBuildMemo !== undefined && !fresh) return cliBuildMemo;
  let out = null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(bundled, 'files.json'), 'utf8'));
    if (m.build?.ref) out = { build: m.build, nexus: null };
  } catch { /* no bundle: a dev run */ }
  if (!out && isGitDir(nexus)) {
    const build = kitBuild(nexus);
    if (build) out = { build, nexus };
  }
  if (!fresh) cliBuildMemo = out;
  return out;
}

/**
 * The kit at `ref`: { sha, from, read(kitPath) -> text | null, list(kitDir) -> names, remove() }. From the nexus
 * checkout's own history when it is one and knows the ref; else a shallow, blobless fetch of `url` with templates/
 * checked out into a temporary folder. Throws (code 2) when the ref cannot be had.
 */
export function kitAt(ref, { nexus = NEXUS_ROOT, url = process.env.NEXUS_KIT_REPO || KIT_REPO_URL } = {}) {
  if (isGitDir(nexus)) {
    const c = gitIn(nexus, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (c.ok && c.out) {
      return {
        sha: c.out,
        from: 'local',
        read: (kit) => { const r = gitRaw(nexus, ['show', `${c.out}:${kit}`]); return r.ok ? r.raw : null; },
        list: (dir) => { const r = gitIn(nexus, ['ls-tree', '--name-only', `${c.out}:${dir}`]); return r.ok && r.out ? r.out.split(/\r?\n/) : []; },
        remove() {},
      };
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-kit-at-'));
  const fail = (why) => { fs.rmSync(dir, { recursive: true, force: true }); throw Object.assign(new Error(`cannot read the kit at ${ref}: ${why}`), { code: 2 }); };
  const steps = [['init', '-q'], ['config', 'core.autocrlf', 'false'], ['remote', 'add', 'origin', url], ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', ref]];
  for (const s of steps) {
    const r = gitIn(dir, s);
    if (!r.ok) fail(r.err.split('\n').pop() || `git ${s[0]} failed`);
  }
  const sha = gitIn(dir, ['rev-parse', 'FETCH_HEAD^{commit}']);
  if (!sha.ok) fail('the fetch named no commit');
  const co = gitIn(dir, ['-c', 'advice.detachedHead=false', 'checkout', '-q', sha.out, '--', 'templates']);
  if (!co.ok) fail(co.err.split('\n').pop() || 'git checkout failed');
  return {
    sha: sha.out,
    from: 'fetched',
    read: (kit) => read(dir, kit),
    list: (d) => { try { return fs.readdirSync(path.join(dir, ...d.split('/'))); } catch { return []; } },
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** The semver core of a version ('2.1.0+abc' -> [2, 1, 0]), or null. */
const semverCore = (v) => { const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim()); return m ? m.slice(1).map(Number) : null; };

/**
 * Whether the kit at the lock's ref is ahead of this CLI's build, so a sync would run backwards. A local kit asks the
 * nexus checkout (`git merge-base --is-ancestor <build> <at>`, the two not equal); a fetched one, or a build the
 * checkout does not know, compares the lock's version core with the build's.
 */
export function kitAhead({ at, build, nexus = null, lockVersion = null }) {
  if (!at?.sha || !build?.ref || at.sha === build.ref) return false;
  const dir = nexus || (at.from === 'local' ? NEXUS_ROOT : null);
  if (isGitDir(dir)) {
    const r = spawnSync('git', ['merge-base', '--is-ancestor', build.ref, at.sha], { cwd: dir, stdio: 'ignore', windowsHide: true });
    if (r.status === 0) return true;
    if (r.status === 1) return false;
  }
  const a = semverCore(lockVersion);
  const b = semverCore(build.version);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** The four placeholders bootstrap fills, filled the same way in base and theirs (so a filled copy is untouched). */
export function fillKit(text, { project, branch = 'main', pm = 'npm' }) {
  return text.replaceAll('<PROJECT_PKG_PREFIX>', `@${project}`).replaceAll('<PROJECT>', project)
    .replaceAll('<DEFAULT_BRANCH>', branch).replaceAll('<PACKAGE_MANAGER>', pm);
}

const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.nexus']);
function walk(dir, rel = '', out = []) {
  let ents;
  try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

const lineSet = (t) => new Set(LF(t).split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
/** How much of `base` a candidate holds: the share of base's substantive lines found in it, 0..1. */
export function likeness(base, cand) {
  const a = lineSet(base);
  if (!a.size) return 0;
  const b = lineSet(cand);
  let n = 0;
  for (const l of a) if (b.has(l)) n += 1;
  return n / a.size;
}

/**
 * Where the repo keeps a kit file it has not got at the kit's path: a file of the same name elsewhere that holds at
 * least half of the base's lines (a vendored copy moved, with local edits). `taken` are paths that are kit files at
 * their own place. Returns the repo path or null.
 */
export function relocated(dir, f, base, { index, taken }) {
  if (base == null) return null;
  const name = path.posix.basename(f.repo);
  let best = null;
  for (const rel of index.get(name) || []) {
    if (taken.has(rel)) continue;
    const score = likeness(base, read(dir, rel) || '');
    if (score >= 0.5 && (!best || score > best.score)) best = { rel, score };
  }
  return best?.rel ?? null;
}

/** git merge-file over three texts: { text, conflicts } (LF). Throws when git cannot merge them at all. */
export function merge3({ ours, base, theirs, label = 'file' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-merge-'));
  try {
    const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, LF(t)); return p; };
    const a = f('ours', ours);
    const o = f('base', base);
    const b = f('theirs', theirs);
    const r = gitRaw(dir, ['merge-file', '-p', '-L', `${label} (repo)`, '-L', `${label} (kit at ref)`, '-L', `${label} (kit now)`, a, o, b]);
    if (r.status == null || r.status < 0 || r.status > 127) throw new Error(`git merge-file failed on ${label}: ${r.err}`);
    return { text: r.raw, conflicts: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** A unified diff from `a` to `b`, headed with the repo path. Empty when they match. */
export function diffOf(a, b, rel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-diff-'));
  try {
    fs.writeFileSync(path.join(dir, 'a'), LF(a));
    fs.writeFileSync(path.join(dir, 'b'), LF(b));
    const r = gitRaw(dir, ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-color', '-U2', '--', 'a', 'b']);
    const body = r.raw.split('\n');
    const at = body.findIndex((l) => l.startsWith('@@'));
    return at < 0 ? '' : [`--- a/${rel}`, `+++ b/${rel}`, ...body.slice(at)].join('\n').replace(/\n$/, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const MARKERS = /^(<{7}|={7}|>{7})( |$)/m;

/**
 * The repo's own lines an assisted merge left out: every line the repo wrote (in ours, in neither kit version) that
 * the merged file does not hold, whitespace trimmed. Nothing the adopter wrote is dropped: a merge that loses one is
 * not applied.
 */
export function droppedLines({ ours, base, theirs, merged }) {
  const set = (t) => new Set(LF(t).split('\n').map((l) => l.trim()).filter(Boolean));
  const kit = new Set([...set(base), ...set(theirs)]);
  const have = set(merged);
  return [...set(ours)].filter((l) => !kit.has(l) && !have.has(l));
}

/** The assisted merge's prompt: the three versions and git's conflicted merge, with the answer's exact shape. */
export function assistPrompt({ path: rel, base, theirs, ours, conflicted }) {
  const block = (name, t) => `<<<${name}\n${LF(t).replace(/\n?$/, '\n')}${name}>>>`;
  return [
    `You are merging one file of a repo that vendors the nexus kit: ${rel}.`,
    'BASE is the kit file at the version the repo last took. KIT is the kit file now. REPO is the repo\'s copy: its',
    'differences from BASE are the repo\'s own local edits (often marked with a comment naming the repo\'s patch).',
    'Produce the file that takes every kit change from BASE to KIT and keeps every local edit from BASE to REPO.',
    'Where both changed the same lines, keep the repo\'s intent and fold the kit\'s change around it. Never leave',
    'conflict markers. Change nothing else.',
    'Hard rule, checked mechanically: every line that is in REPO but in neither BASE nor KIT must appear in your',
    'answer exactly as it is, character for character (leading whitespace aside). If a kit change touches such a line,',
    'keep the line as the repo has it and say so in the reasons. An answer that drops or edits one is thrown away.',
    '',
    block('BASE', base),
    block('KIT', theirs),
    block('REPO', ours),
    block('CONFLICTED', conflicted),
    '',
    'Answer with exactly two parts and nothing else:',
    '<<<MERGED',
    '(the whole merged file)',
    'MERGED>>>',
    'REASONS:',
    '- <the hunk, by its first changed line or function>: <one line: what you kept from REPO and why>',
  ].join('\n');
}

/** The assisted merge's answer, parsed: { text, reasons } or null when it is not in the asked shape. */
export function parseAssist(answer) {
  const m = /<<<MERGED\r?\n([\s\S]*?)\r?\n?MERGED>>>/.exec(String(answer || ''));
  if (!m) return null;
  const after = String(answer).slice(m.index + m[0].length);
  const reasons = (/REASONS:\s*\n([\s\S]*)$/.exec(after)?.[1] || '').split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
  return { text: `${m[1].replace(/\n$/, '')}\n`, reasons };
}

/**
 * The default assisted merge: one headless turn (headless.mjs runOnce, the person's own Claude Code login) in an
 * empty folder, no tools needed. `query` is the Agent SDK seam (tests stub it). Returns { text, reasons } or throws.
 */
export async function modelAssist(input, { query, model } = {}) {
  const { runOnce } = await import('./headless.mjs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-assist-'));
  try {
    const r = await runOnce({ prompt: assistPrompt(input), cwd, permissionMode: 'default', query, model });
    if (r.is_error) throw new Error(String(r.result || 'the helper session ended in an error').split('\n')[0]);
    const parsed = parseAssist(r.result);
    if (!parsed) throw new Error('the helper session answered in another shape');
    return parsed;
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

/** The repo's own verify command: package.json `verify`, else `check`, else scripts/verify.mjs. [label, cmd, args]. */
export function repoVerify(dir) {
  let scripts = {};
  try { scripts = JSON.parse(read(dir, 'package.json') || '{}').scripts || {}; } catch { /* not JSON */ }
  const pm = packageManagerOf(dir);
  for (const s of ['verify', 'check']) if (typeof scripts[s] === 'string') return { label: `${pm} run ${s}`, command: `${pm} run ${s}`, shell: true };
  if (fs.existsSync(path.join(dir, 'scripts', 'verify.mjs'))) return { label: 'node scripts/verify.mjs', command: process.execPath, args: ['scripts/verify.mjs'] };
  return null;
}

/**
 * The installed dependencies of `local` (its node_modules folders, the root's and its workspaces' to two levels),
 * linked into the worktree `dir` so the repo's own gate can run there. Returns the links, for unlinkDeps.
 */
export function linkDeps(local, dir) {
  const links = [];
  if (!local || path.resolve(local) === path.resolve(dir)) return links;
  const tryLink = (rel) => {
    const from = path.join(local, ...rel.split('/'), 'node_modules');
    const to = path.join(dir, ...rel.split('/'), 'node_modules');
    if (!fs.existsSync(from) || fs.existsSync(to) || (rel && !fs.existsSync(path.join(dir, ...rel.split('/'))))) return;
    try { fs.symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir'); links.push(to); } catch { /* the gate says what is missing */ }
  };
  tryLink('');
  for (const top of ['apps', 'packages', 'libs', 'services']) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(local, top), { withFileTypes: true }); } catch { continue; }
    for (const e of ents) if (e.isDirectory()) tryLink(`${top}/${e.name}`);
  }
  return links;
}

/** Remove the links linkDeps made (the links only: never what they point at). */
export function unlinkDeps(links) {
  for (const l of links) { try { fs.unlinkSync(l); } catch { try { fs.rmdirSync(l); } catch { /* gone */ } } }
}

/**
 * The sync's gate in `dir`: the kit legs the repo already ran before the sync (`had`: plan-check, its test,
 * workflow-lint), then the repo's own verify command. [{ name, ok, out }].
 */
export function syncGate(dir, { had = {}, node = process.execPath, verify = true } = {}) {
  const tail = (r) => `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).slice(-20).join('\n');
  const run = (name, command, args, shell = false) => {
    const r = spawnSync(command, args || [], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 900000, maxBuffer: 64 * 1024 * 1024, shell, env: { ...process.env, CI: process.env.CI || '1' } });
    return { name, ok: r.status === 0, out: r.error ? r.error.message : tail(r) };
  };
  const rows = [];
  if (had.planCheck) rows.push(run('plan-check', node, ['scripts/plan-check.mjs']));
  if (had.planCheckTest) rows.push(run('plan-check test', node, ['--test', 'scripts/__tests__/plan-check.test.mjs']));
  if (had.workflowLint) rows.push(run('workflow-lint', node, ['scripts/workflow-lint.mjs']));
  const v = verify ? repoVerify(dir) : null;
  if (v) rows.push(run(v.label, v.command, v.args, v.shell));
  return rows;
}

/** The lock with `ref:` and `version:` moved to `to`; every other line, and any trailing comment, kept. */
export function bumpLock(text, { ref, version }) {
  let t = String(text);
  const set = (key, value) => {
    const re = new RegExp(`^(${key}:[ \\t]*)([^\\s#]*)`, 'm');
    if (re.test(t)) t = t.replace(re, (_, k) => `${k}${value}`);
    else t = `${t.replace(/\s*$/, '')}\n${key}: ${value}\n`;
  };
  set('version', version);
  set('ref', ref);
  return t;
}

const SKILL = /^skills\/[^/]+\.md$/;
/** The outcomes that move a file forward. */
const MOVES = new Set(['replaced', 'merged', 'assisted']);
/** LF text in the file's own line endings. */
const eol = (text, crlf) => { const t = LF(text); return crlf ? t.replace(/\n/g, '\r\n') : t; };
const CODE = /\.(mjs|js|cjs)$/;

/** Relative import specifiers in code (static, dynamic, `new URL(.., import.meta.url)`), comments left out. */
export function importsOf(text) {
  const code = String(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:\bfrom|\bimport\s*\(?|\bnew\s+URL\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
}

/** The family a kit file belongs to, for "does the repo take these": lanes go with skills, tests with scripts. */
export const groupOf = (f) => ({ lane: 'skill', test: 'script', action: 'workflow' }[f.kind] || f.kind);

/**
 * The families the repo takes from the kit: it holds at least 4 in 5 of the family's files the kit had at the ref
 * (a family with none then is taken). A repo that vendored a few kit scripts by hand does not take the rest, nor new
 * ones; a repo that took the kit's skills takes a new skill. `seen` rows: { f, baseText, raw }. A Set of groups.
 */
export function followsOf(seen) {
  const by = new Map();
  for (const { f, baseText, raw } of seen) {
    const g = groupOf(f);
    if (!by.has(g)) by.set(g, { base: 0, held: 0 });
    if (baseText == null) continue;
    by.get(g).base += 1;
    if (raw != null) by.get(g).held += 1;
  }
  return new Set([...by].filter(([, n]) => n.base === 0 || n.held / n.base >= 0.8).map(([g]) => g));
}

/** How many assisted merges run at once. */
export const ASSIST_AT_ONCE = 4;
/** How many more gate runs a red gate with the assisted merges may spend finding the ones it takes. */
export const GATE_TRIES = 6;

const isRed = (gate) => gate.some((g) => !g.ok);
/** A list in two halves (one when it has a single item). */
const halves = (list) => (list.length > 1 ? [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))] : [list]);

/**
 * The assisted merges in families: code coupled by imports (through files that move) goes together, every other
 * file alone. `near` is the import graph over the repo's kit code, `byWhere` its entries. [[entry, ..], ..].
 */
export function familiesOf(tried, near, byWhere) {
  const out = [];
  const done = new Set();
  for (const e of tried) {
    if (done.has(e)) continue;
    const fam = [e];
    done.add(e);
    if (near.has(e.where)) {
      const queue = [e.where];
      const seen = new Set(queue);
      while (queue.length) {
        for (const n of near.get(queue.shift())) {
          if (seen.has(n)) continue;
          seen.add(n);
          const r = byWhere.get(n);
          if (!MOVES.has(r.outcome) && !tried.includes(r)) continue;
          queue.push(n);
          if (tried.includes(r) && !done.has(r)) { done.add(r); fam.push(r); }
        }
      }
    }
    out.push(fam);
  }
  return out;
}

/** `fn` over `items`, at most `n` at a time; the results in the items' order. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
  return out;
}

/**
 * The sync, in the worktree `dir` (cut from the origin's default branch). `kit` is kitSource()'s, `ref` the lock's,
 * `base` a kitAt() result (or opts for one), `assist` the assisted merge (null: conflicts stay as ours). `gateFn`
 * (dir, had) -> rows is the gate seam. Returns { code, report } where report carries files, sync, knobs, gate,
 * warnings, and commit (with `write`).
 */
export async function sync({ dir, local = null, kit, ref, branch = 'main', today, write = false, assist = modelAssist, base = null, baseOpts = {}, gateFn = null, verify = true }) {
  const report = { files: [], warnings: [], gate: [], knobs: [], sync: null, commit: null, available: [] };
  const build = kit.build;
  if (!build?.ref) return { code: 2, report: { ...report, error: 'this kit names no build (files.json `build`): cannot tell which kit commit a sync moves to' } };
  let at = base;
  try { at = at || kitAt(ref, baseOpts); } catch (e) { return { code: 2, report: { ...report, error: e.message } }; }
  try {
    const to = { ref: build.ref, version: build.version };
    const from = { ref, sha: at.sha };
    if (at.sha === build.ref) return { code: 0, report: { ...report, sync: { from, to, counts: {}, assisted: [] }, message: `already on nexus ${build.version}`, why: `plan/nexus.lock's ref ${ref} is the kit this CLI carries` } };
    // Never backwards: an older CLI (a stale npx cache) on a repo a newer one already moved would undo the kit's
    // later changes and move the lock back. Refused before any write.
    const lockVersion = lockField(read(dir, 'plan/nexus.lock'), 'version');
    if (kitAhead({ at, build, nexus: baseOpts.nexus || kit.nexus || null, lockVersion })) {
      return { code: 0, report: { ...report, sync: { from, to, counts: {}, assisted: [] }, message: `this CLI's kit (${build.version}) is older than the repo's (${lockVersion || at.sha.slice(0, 12)})`, why: `plan/nexus.lock's ref ${ref} is past the kit this CLI carries; run the newest CLI` } };
    }
    const fills = { project: projectName(dir), branch, pm: packageManagerOf(dir) };
    const files = [...kit.files, ...(kit.sync || [])];
    const kitRepoPaths = new Set(files.map((f) => f.repo));
    const index = new Map();
    for (const rel of walk(dir)) {
      const n = path.posix.basename(rel);
      if (!index.has(n)) index.set(n, []);
      index.get(n).push(rel);
    }
    const had = { planCheck: !!read(dir, 'scripts/plan-check.mjs'), planCheckTest: !!read(dir, 'scripts/__tests__/plan-check.test.mjs'), workflowLint: !!read(dir, 'scripts/workflow-lint.mjs') };
    const kitText = (f) => fs.readFileSync(path.join(kit.root, ...f.kit.replace(/^templates\//, '').split('/')), 'utf8');
    const touched = new Set();
    const put = (rel, text, crlf) => { writeFile(dir, rel, eol(text, crlf)); touched.add(rel); };

    // Each kit file's three versions, and where the repo keeps its copy (at the kit's path, or vendored elsewhere).
    const seen = files.map((f) => {
      const baseRaw = at.read(f.kit);
      const baseText = baseRaw == null ? null : fillKit(LF(baseRaw), fills);
      let where = read(dir, f.repo) != null ? f.repo : null;
      if (!where && f.kind !== 'lane') where = relocated(dir, f, baseText, { index, taken: kitRepoPaths });
      return { f, baseText, where, raw: where ? read(dir, where) : null };
    });
    const follows = followsOf(seen);

    // One entry per kit file the repo holds, with its outcome and the text it moves to. A missing file is new
    // content: added when it is new since the ref and of a kind the repo takes, else listed as available.
    const entries = [];
    const fresh = [];
    const available = new Map();
    for (const { f, baseText, where, raw } of seen) {
      const theirs = fillKit(LF(kitText(f)), fills);
      if (raw == null) {
        const g = groupOf(f);
        if (baseText == null && follows.has(g)) fresh.push({ f, theirs });
        else available.set(f.repo, { f, theirs, note: baseText == null ? `new since ${ref}; the repo takes no kit ${g} files` : `the repo did not take it at ${ref}` });
        continue;
      }
      const e = { where, f, ours: LF(raw), crlf: /\r\n/.test(raw), base: baseText, theirs, moved: where !== f.repo ? `vendored at ${where}` : null };
      if (f.kind === 'lane') e.outcome = 'lane';
      else if (e.ours === theirs) e.outcome = 'same';
      else if (baseText == null) e.outcome = 'own';
      else if (e.ours === baseText) { e.outcome = 'replaced'; e.text = theirs; }
      else if (theirs === baseText) e.outcome = 'kept';
      else {
        const m = merge3({ ours: e.ours, base: baseText, theirs, label: where });
        if (!m.conflicts) { e.outcome = 'merged'; e.text = m.text; } else { e.outcome = 'conflict'; e.conflicted = m.text; e.n = m.conflicts; }
      }
      entries.push(e);
    }
    for (const x of fresh) put(x.f.repo, x.theirs, false);

    // New knobs: named by the kit's templates now but not at the ref, written at their conservative values.
    const flowsNow = (() => { try { return fs.readdirSync(path.join(kit.root, '.github', 'workflows')).filter((n) => /\.ya?ml$/.test(n)).map((n) => [n, fs.readFileSync(path.join(kit.root, '.github', 'workflows', n), 'utf8')]); } catch { return []; } })();
    const now = knobsIn({ flows: flowsNow, bearings: read(kit.root, 'plan/bearings.md') });
    const then = new Set(knobsIn({ flows: at.list('templates/.github/workflows').filter((n) => /\.ya?ml$/.test(n)).map((n) => [n, at.read(`templates/.github/workflows/${n}`) || '']), bearings: at.read('templates/plan/bearings.md') }).map((k) => k.knob));
    const newKnobs = new Set(now.map((k) => k.knob).filter((k) => !then.has(k)));
    const registry = KNOBS.filter((k) => newKnobs.has(k.knob));
    if (registry.some((k) => k.write)) {
      const bearings = read(dir, 'plan/bearings.md');
      const kn = writeKnobs(bearings, { today, registry, keeps: "this repo's" });
      report.knobs = kn.knobs;
      const wrote = kn.knobs.filter((k) => k.at !== 'var' && k.status === 'written');
      if (wrote.length) {
        if (bearings == null) report.warnings.push(`plan/bearings.md is missing: the new knobs (${wrote.map((k) => k.knob).join(', ')}) take the kit's defaults`);
        else {
          put('plan/bearings.md', kn.text, /\r\n/.test(bearings));
          report.files.push({ path: 'plan/bearings.md', status: 'knobs written', note: wrote.map((k) => (k.at === 'section' ? `## ${k.knob} ${k.value}` : `${k.knob}: ${k.value}`)).join(', ') });
        }
      }
    }

    // The lock: ref and version move; every other line and comment stays.
    const lock = read(dir, 'plan/nexus.lock');
    put('plan/nexus.lock', bumpLock(lock, to), /\r\n/.test(lock));
    report.files.push({ path: 'plan/nexus.lock', status: 'ref moved', note: `${ref} -> ${to.ref.slice(0, 12)} (${to.version}); its comments kept` });

    // Conflicts: the assisted merge. The helper sessions run a few at a time; each answer is judged on its own.
    const conflicts = entries.filter((e) => e.outcome === 'conflict');
    const answers = assist ? await pool(conflicts, ASSIST_AT_ONCE, async (c) => {
      try { return { r: await assist({ path: c.where, base: c.base, theirs: c.theirs, ours: c.ours, conflicted: c.conflicted }) }; } catch (e) { return { why: e.message }; }
    }) : [];
    for (const [i, c] of conflicts.entries()) {
      if (!assist) { c.outcome = 'stuck'; c.why = 'no assisted merge (--no-assist)'; continue; }
      let r = answers[i].r || null;
      let why = answers[i].why || null;
      if (r && (typeof r.text !== 'string' || MARKERS.test(r.text))) { why = 'the merged file still holds conflict markers'; r = null; }
      const lost = r ? droppedLines({ ours: c.ours, base: c.base, theirs: c.theirs, merged: r.text }) : [];
      if (lost.length) { why = `it dropped ${lost.length} line${lost.length === 1 ? '' : 's'} the repo wrote (${JSON.stringify(lost[0].slice(0, 80))}${lost.length > 1 ? ', ...' : ''})`; r = null; }
      if (!r) { c.outcome = 'stuck'; c.why = `the assisted merge failed: ${why}`; continue; }
      c.outcome = 'assisted';
      c.text = `${LF(r.text).replace(/\n*$/, '')}\n`;
      c.reasons = (r.reasons || []).map(String);
      c.diff = diffOf(c.ours, c.text, c.where);
    }

    // Code moves as a family: a script or test coupled by imports to one that stays as the repo's stays too (a test
    // moved past its code, or code moved past what imports it, fails). Then every kit file the repo had not taken
    // that code it keeps now imports comes in. Run again when the gate turns an assisted merge back.
    const byWhere = new Map(entries.filter((e) => CODE.test(e.where)).map((e) => [e.where, e]));
    const near = new Map([...byWhere.keys()].map((w) => [w, new Set()]));
    for (const e of byWhere.values()) {
      for (const t of [e.ours, e.text].filter(Boolean)) {
        for (const spec of importsOf(t)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(e.where), spec));
          if (target !== e.where && near.has(target)) { near.get(e.where).add(target); near.get(target).add(e.where); }
        }
      }
    }
    const deps = new Map();
    const materialize = () => {
      for (const e of entries) e.held = null;
      for (const s of entries.filter((e) => e.outcome === 'stuck' && near.has(e.where))) {
        const queue = [s.where];
        const seenAt = new Set(queue);
        while (queue.length) {
          for (const n of near.get(queue.shift())) {
            if (seenAt.has(n)) continue;
            seenAt.add(n);
            // A file that does not move is a barrier: the kit kept it as it was, so both sides still fit it.
            const r = byWhere.get(n);
            if (!MOVES.has(r.outcome)) continue;
            if (!r.held) r.held = s.where;
            queue.push(n);
          }
        }
      }
      for (const e of entries) {
        if (!MOVES.has(e.outcome) && !e.wasWritten) continue;
        const moving = MOVES.has(e.outcome) && !e.held;
        writeFile(dir, e.where, eol(moving ? e.text : e.ours, e.crlf));
        e.wasWritten = true;
      }
      for (const p of deps.keys()) fs.rmSync(path.join(dir, ...p.split('/')), { force: true });
      deps.clear();
      const queue = [...entries.map((e) => e.where), ...fresh.map((x) => x.f.repo)].filter((p) => CODE.test(p));
      while (queue.length) {
        const src = queue.shift();
        const text = read(dir, src);
        if (text == null) continue;
        for (const spec of importsOf(text)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(src), spec));
          const want = available.get(target);
          if (!want || deps.has(target) || read(dir, target) != null) continue;
          writeFile(dir, target, want.theirs);
          deps.set(target, src);
          if (CODE.test(target)) queue.push(target);
        }
      }
    };
    materialize();

    const links = linkDeps(local, dir);
    let gate;
    try {
      const runGate = () => (gateFn ? gateFn(dir, had) : syncGate(dir, { had, verify }));
      gate = runGate();
      const tried = entries.filter((e) => e.outcome === 'assisted' && !e.held);
      if (isRed(gate) && tried.length) {
        // Red with every assisted merge: find the ones the gate takes. The merges go in families (code coupled by
        // imports moves together; any other file alone), tried by halves, a few gate runs at most; a family the
        // gate never passed stays as the repo's.
        report.gateAssisted = gate;
        const setTo = (keep) => {
          for (const e of tried) {
            if (keep.has(e)) { e.outcome = 'assisted'; e.gateRed = false; e.why = null; } else { e.outcome = 'stuck'; e.gateRed = true; e.why = 'the gate was red with it'; }
          }
          materialize();
        };
        const fams = familiesOf(tried, near, byWhere);
        const accepted = new Set();
        let greenFor = null;
        const queue = fams.length > 1 ? halves(fams) : [];
        let runs = 0;
        while (queue.length && runs < GATE_TRIES) {
          const chunk = queue.shift();
          const trial = new Set([...accepted, ...chunk.flat()]);
          setTo(trial);
          const g = runGate();
          runs += 1;
          if (!isRed(g)) { for (const e of chunk.flat()) accepted.add(e); gate = g; greenFor = new Set(accepted); } else if (chunk.length > 1) queue.unshift(...halves(chunk));
        }
        setTo(accepted);
        if (!greenFor || greenFor.size !== accepted.size) gate = runGate();
        const left = tried.filter((e) => !accepted.has(e));
        report.warnings.push(`the gate was red with every assisted merge applied (${report.gateAssisted.filter((g) => !g.ok).map((g) => g.name).join(', ')}); ${accepted.size} of ${tried.length} pass it${left.length ? `, and ${left.map((e) => e.where).join(', ')} stay${left.length === 1 ? 's' : ''} as the repo's` : ''}`);
      }
    } finally { unlinkDeps(links); }

    // The report, from the entries as they ended.
    const counts = { replaced: 0, merged: 0, assisted: 0, new: fresh.length + deps.size, kept: 0, same: 0, held: 0, available: 0 };
    const hunks = (e) => `${e.n} conflicting hunk${e.n === 1 ? '' : 's'}`;
    for (const e of entries) {
      const row = (status, note) => report.files.push({ path: e.where, status, ...(note || e.moved ? { note: [e.moved, note].filter(Boolean).join('; ') } : {}) });
      if (e.outcome === 'same') { counts.same += 1; continue; }
      if (e.outcome === 'kept') { counts.kept += 1; continue; }
      if (e.outcome === 'lane') { counts.kept += 1; row('kept-custom', 'lanes file: never touched'); continue; }
      if (e.outcome === 'own') {
        counts.kept += 1;
        row('kept-custom', `the kit added its own ${e.f.repo} since ${ref}; the repo's is kept`);
        report.warnings.push(`${e.where}: the kit now ships a file of this name (new since ${ref}); the repo's own is kept: compare them by hand`);
        continue;
      }
      if (e.held) {
        counts.held += 1;
        row('held back', `${e.outcome === 'assisted' ? `${hunks(e)} merged by the helper, ` : ''}coupled by imports to ${e.held}, which stays as the repo's`);
        continue;
      }
      if (e.outcome === 'stuck') {
        row(e.gateRed ? 'assisted, not applied (gate red with it)' : 'conflict, left as ours', `${hunks(e)}; ${e.why}`);
        if (!e.gateRed) report.warnings.push(`${e.where}: ${hunks(e)} between the kit's change and the repo's own; left as the repo's (${e.why}): merge it by hand`);
        continue;
      }
      counts[e.outcome] += 1;
      if (e.outcome === 'replaced') row('replaced', 'untouched since the ref');
      else if (e.outcome === 'merged') row('merged', 'three-way, clean');
      else row('assisted', `${hunks(e)} merged by the helper`);
      touched.add(e.where);
    }
    for (const x of fresh) report.files.push({ path: x.f.repo, status: 'new', note: `new since ${ref}` });
    for (const [p, src] of deps) { report.files.push({ path: p, status: 'new', note: `needed by ${src}` }); touched.add(p); }
    for (const rel of walk(dir).filter((r) => SKILL.test(r) && !kitRepoPaths.has(r))) report.files.push({ path: rel, status: 'kept-custom', note: 'a skill the kit does not ship: never touched' });
    report.available = [...available.values()].filter((a) => !deps.has(a.f.repo)).map((a) => ({ path: a.f.repo, note: a.note })).sort((a, b) => (a.path < b.path ? -1 : 1));
    counts.available = report.available.length;
    const held = entries.filter((e) => e.held);
    if (held.length) report.warnings.push(`${held.length} kit file${held.length === 1 ? '' : 's'} held back with the code ${held.length === 1 ? 'it is' : 'they are'} coupled to (${[...new Set(held.map((e) => e.held))].join(', ')}): merge ${held.length === 1 ? 'that' : 'those'} by hand and sync again`);
    report.sync = { from, to, counts, assisted: entries.filter((e) => e.diff).map((e) => ({ path: e.where, reasons: e.reasons, diff: e.diff, applied: e.outcome === 'assisted' && !e.held, held: e.held || null })) };
    report.gate = gate;
    report.files = mergeRows(report.files);
    const written = touched;
    const red = gate.some((g) => !g.ok);
    if (red) return { code: 1, report };

    if (write) {
      const b = syncBranch(to.version);
      const steps = [['checkout', '-q', '-B', b], ['add', '-A', '--', ...[...written].sort()]];
      for (const s of steps) {
        const r = gitIn(dir, s);
        if (!r.ok) return { code: 1, report: { ...report, error: `git ${s[0]} failed: ${r.err}` } };
      }
      const c = counts;
      const body = [
        `The kit moves from ${ref} to ${to.ref.slice(0, 12)} (${to.version}).`,
        '',
        `${c.replaced} untouched kit file${c.replaced === 1 ? '' : 's'} replaced, ${c.merged} merged three-way, ${c.assisted} by the assisted merge, ${c.new} new.`,
        ...(report.sync.assisted.filter((a) => a.applied).flatMap((a) => [`${a.path}:`, ...a.reasons.map((r) => `  - ${r}`)])),
      ].join('\n');
      const r = gitIn(dir, ['commit', '-q', '-m', syncSubject(to.version), '-m', body]);
      if (!r.ok) return { code: 1, report: { ...report, error: `git commit failed: ${r.err}` } };
      report.commit = { sha: gitIn(dir, ['rev-parse', 'HEAD']).out, branch: b, subject: syncSubject(to.version) };
    }
    return { code: 0, report };
  } finally {
    if (!base) at.remove();
  }
}

/** The sync's report as the terminal reads it (render() calls this for a v2 repo). */
export function renderSync(report, { red = (s) => s } = {}) {
  const out = [];
  const s = report.sync;
  if (report.message) { out.push('', `${report.message}: ${report.why}. Nothing to sync.`); return out; }
  out.push(`  sync     nexus ${s.from.ref} (${s.from.sha.slice(0, 7)}) -> ${s.to.version} (${s.to.ref.slice(0, 7)})`);
  const c = s.counts;
  out.push('', `files (${report.files.length}; ${c.replaced} replaced, ${c.merged} merged, ${c.assisted} assisted, ${c.new} new, ${c.held ? `${c.held} held back, ` : ''}${c.kept + c.same} unchanged)`);
  const w = Math.max(8, ...report.files.map((f) => f.status.length));
  for (const f of report.files) out.push(`  ${f.status.padEnd(w)}  ${f.path}${f.note ? `  (${f.note})` : ''}`);
  const fresh = report.files.filter((f) => f.status === 'new');
  const avail = report.available || [];
  if (fresh.length || avail.length) {
    out.push('', `new content (${fresh.length} added, ${avail.length} available: the kit has them, the repo has not taken them)`);
    for (const f of fresh) out.push(`  + ${f.path}${f.note ? `  (${f.note})` : ''}`);
    for (const f of avail) out.push(`  ? ${f.path}  (${f.note}; copy it by hand to take it)`);
  }
  for (const a of s.assisted) {
    out.push('', `assisted merge: ${a.path}${a.applied ? '' : red(a.held ? `  (not applied: held back with ${a.held})` : '  (not applied: the gate was red with it)')}`);
    for (const r of a.reasons) out.push(`  kept: ${r}`);
    for (const l of a.diff.split('\n')) out.push(`  ${l}`);
  }
  if (report.knobs?.length) {
    out.push('', 'knobs (new since the ref, at their conservative values: behaviour does not change)');
    for (const k of report.knobs) {
      if (k.at === 'var') out.push(`  ${k.status === 'set' ? k.line : `leave ${k.knob} unset`}`);
      else out.push(`  ${k.status.padEnd(8)} ${k.at === 'section' ? `## ${k.knob}` : k.knob} ${k.value}`);
    }
  }
  out.push('', `warnings (${report.warnings.length})`);
  for (const wn of report.warnings) out.push(`  - ${wn}`);
  out.push('', 'gate');
  if (!report.gate.length) out.push('  (none: the repo has no verify command and ran no kit gate)');
  for (const g of report.gate) {
    out.push(`  ${g.ok ? 'green' : red('RED  ')}  ${g.name}`);
    if (!g.ok && g.out) for (const l of g.out.split('\n')) out.push(`         ${l}`);
  }
  if (report.gateAssisted) {
    out.push('', 'gate with every assisted merge applied (why some stay as the repo\'s)');
    for (const g of report.gateAssisted) {
      out.push(`  ${g.ok ? 'green' : red('RED  ')}  ${g.name}`);
      if (!g.ok && g.out) for (const l of g.out.split('\n')) out.push(`         ${l}`);
    }
  }
  return out;
}
