// The checkout's local settings: `.nexus/local.json` at the primary checkout's root (a worktree's sessions share
// it), untracked. The one writer of that file in the GUI; GET and POST /api/local go through here, and Settings,
// the cockpit's run-mode menu and onboarding all reach it through src/ui/run-mode.js or /api/local.
//
//   { ownerMode?: boolean, runMode?: 'size'|'sub'|'wf'|'both', phase?: 'short'|'std'|'night', worktreeRoot?: string,
//     ...kept }
//
// worktreeRoot is read only, by server/fleet.mjs: where a GUI session's worktree goes (relative to the primary
// checkout, or absolute); none set, the repo's own convention or the kit's ../<repo>-wt/.
//
// Owner mode reads as nexus scripts/owner.mjs decides it: an untracked `.owner` at the primary root makes the
// checkout the owner's, and `ownerMode: false` switches it off. This module never creates or removes `.owner`.
// Keys it does not know are kept as they are (other tools write the same file). A write takes a lock file, writes a
// temp file and renames it into place, so a reader never sees half a file.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_FILE = '.nexus/local.json';
export const OWNER_FILE = '.owner';
/** Run mode (decision 2): 'size' (S and M in one builder, L a workflow), or the overrides. Mirrors src/ui/run-mode.js. */
export const RUN_MODES = ['size', 'sub', 'wf', 'both'];
/** The working phase length Settings offers. */
export const PHASES = ['short', 'std', 'night'];

const LOCK_STALE_MS = 10000;
const LOCK_WAIT_MS = 3000;

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The primary checkout's root (a worktree's too): the folder holding the common .git. */
export function primaryRoot(repo) {
  try {
    return path.dirname(git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  } catch {
    return repo;
  }
}

/** The local settings, or {} when there are none or they do not parse. Never writes. */
export function readLocal(repo) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(primaryRoot(repo), LOCAL_FILE), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** An untracked `.owner` at the primary root (a committed one counts for no one). */
export function hasOwnerFile(repo) {
  const root = primaryRoot(repo);
  if (!fs.existsSync(path.join(root, OWNER_FILE))) return false;
  try {
    return git(root, ['ls-files', '--', OWNER_FILE]) === '';
  } catch {
    return false;
  }
}

/**
 * Effective owner mode, the one server-side owner check: an untracked `.owner` at the primary root and
 * `ownerMode` not switched off in its local settings. A worktree reads its primary checkout's.
 */
export function isOwner(repo) {
  return hasOwnerFile(repo) && readLocal(repo).ownerMode !== false;
}

/** What GET /api/local answers: { owner (.owner present), ownerMode (the switch), effective, runMode, phase }. */
export async function localView(repo) {
  const s = readLocal(repo);
  const owner = hasOwnerFile(repo);
  const ownerMode = s.ownerMode !== false;
  return {
    owner,
    ownerMode,
    effective: owner && ownerMode,
    runMode: RUN_MODES.includes(s.runMode) ? s.runMode : 'size',
    phase: PHASES.includes(s.phase) ? s.phase : 'std',
  };
}

/** The keys a patch may set, checked. Throws a 400-shaped error on a bad value; ignores keys it does not know. */
function clean(patch) {
  const out = {};
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!patch || typeof patch !== 'object') return out;
  if ('ownerMode' in patch) {
    if (typeof patch.ownerMode !== 'boolean') throw bad('ownerMode must be true or false');
    out.ownerMode = patch.ownerMode;
  }
  if ('runMode' in patch) {
    if (!RUN_MODES.includes(patch.runMode)) throw bad(`run mode must be one of ${RUN_MODES.join(', ')}`);
    out.runMode = patch.runMode;
  }
  if ('phase' in patch) {
    if (!PHASES.includes(patch.phase)) throw bad(`phase must be one of ${PHASES.join(', ')}`);
    out.phase = patch.phase;
  }
  return out;
}

const queues = new Map();

async function withLock(lock, fn) {
  const until = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.rmSync(lock, { force: true }); continue; }
      } catch { continue; }
      if (Date.now() > until) throw new Error(`${LOCAL_FILE} is locked by another writer`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/** Merge a checked patch into the local settings, whole (lock, temp file, rename). Returns localView. */
export function writeLocal(repo, patch) {
  let next;
  try { next = clean(patch); } catch (e) { return Promise.reject(e); }
  const root = primaryRoot(repo);
  const file = path.join(root, LOCAL_FILE);
  const prev = queues.get(file) || Promise.resolve();
  const job = prev.catch(() => {}).then(async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await withLock(`${file}.lock`, () => {
      const merged = { ...readLocal(root), ...next };
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`);
      fs.renameSync(tmp, file);
    });
    return localView(repo);
  });
  queues.set(file, job);
  return job;
}

/**
 * Once: carry a run mode the GUI prefs still hold ({ agents, workflows }) into the local settings, then drop it
 * from the prefs (`forget`). A run mode already in local.json wins; by size (neither set) needs no file.
 * Returns the run mode carried, or null.
 */
export async function migrateRunMode(repo, prefs, forget) {
  const a = !!prefs?.agents;
  const w = !!prefs?.workflows;
  const had = prefs && ('agents' in prefs || 'workflows' in prefs);
  if (RUN_MODES.includes(readLocal(repo).runMode) || !(a || w)) {
    if (had && forget) await forget();
    return null;
  }
  const rm = a && w ? 'both' : a ? 'sub' : 'wf';
  await writeLocal(repo, { runMode: rm });
  if (forget) await forget();
  return rm;
}
