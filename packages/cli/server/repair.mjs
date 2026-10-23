// Safe repairs for the worktrees GUI sessions work in, after nexus stopped part way (an upgrade, a closed terminal, a
// kill). Every repair goes through git and keeps the person's work: nothing here deletes a file git does not track,
// discards an edit, or removes a worktree (closing one is scripts/worktree.mjs close's job, never a bare
// `git worktree remove`).
//
//   interrupted add   `git worktree add` killed part way leaves git's `locked` file reading "initializing", maybe a
//                     stale index.lock, an empty index and files missing. Repaired in place: unlock, the stale lock
//                     removed, a mixed reset (the index only; files untouched), only the files git reports deleted
//                     checked out again, and the repo's post-checkout hook run again (a same-branch checkout).
//   formed marker     formPlace writes `nexus-formed` in the worktree's own git folder once `git worktree add` and its
//                     hooks finished. A place nexus made without the marker never finished its hooks: they run again.
//   folder gone       the folder was deleted or moved while its branch stayed: `git worktree prune` (it drops only the
//                     registrations whose folder is gone), then the branch is checked out there again (formPlace).
//   hooks temp        each form wraps the repo's hooks in a temp folder (cloud.mjs safeHooks); a killed form leaves
//                     it behind, so folders older than a day are swept at start.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MARKER = 'nexus-formed';
/** An index.lock younger than this may belong to a git still running: left alone. */
export const LOCK_STALE_MS = 60000;
/**
 * The same, once the server that ran that git is gone (a stop or a kill: its children were stopped with it, or settled
 * within 5 s on Ctrl+C), so a relaunch moments after an upgrade stop finishes the place instead of waiting a minute.
 */
export const LOCK_ORPHAN_MS = 8000;

const slash = (p) => String(p).replace(/\\/g, '/');

/** The worktree's own git folder (`.git/worktrees/<name>`), read from its `.git` file, or null. */
export function gitDirOf(wt) {
  try {
    const dotgit = path.join(wt, '.git');
    const st = fs.statSync(dotgit);
    if (st.isDirectory()) return dotgit;
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotgit, 'utf8'));
    return m ? path.resolve(wt, m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * What state a worktree folder is in: { exists, gitdir, locked (its words or null), indexLock (age in ms or null),
 * formed (the marker), interrupted (an add killed part way) }.
 */
export function placeState(wt, now = Date.now()) {
  const exists = !!wt && fs.existsSync(wt);
  const gitdir = exists ? gitDirOf(wt) : null;
  let locked = null;
  let indexLock = null;
  if (gitdir) {
    try { locked = fs.readFileSync(path.join(gitdir, 'locked'), 'utf8').trim() || 'locked'; } catch { /* not locked */ }
    try { indexLock = now - fs.statSync(path.join(gitdir, 'index.lock')).mtimeMs; } catch { /* none */ }
  }
  return {
    exists,
    gitdir,
    locked,
    indexLock,
    formed: !!gitdir && fs.existsSync(path.join(gitdir, MARKER)),
    interrupted: /initializ/i.test(locked || ''),
  };
}

/** Mark a worktree as made: `git worktree add` and its hooks finished. Lives in its git folder, never committed. */
export function markFormed(wt, info = {}) {
  const gitdir = gitDirOf(wt);
  if (!gitdir) return false;
  try {
    fs.writeFileSync(path.join(gitdir, MARKER), `${JSON.stringify({ at: new Date().toISOString(), ...info })}\n`);
    return true;
  } catch {
    return false;
  }
}

/** The paths git tracks that are missing from the folder (`git ls-files --deleted`), or null when git cannot say. */
async function deletedFiles(wt, git) {
  const r = await git(wt, ['ls-files', '--deleted', '-z']);
  if (!r.ok) return null;
  return [...new Set(String(r.out || '').split('\0').filter(Boolean))];
}

/**
 * Finish a worktree whose `git worktree add` was cut short, or whose hooks never finished. `restore`: check out the
 * files git reports deleted (only for a session that never ran, so a file it deleted on purpose never comes back).
 * `hooks(primary)` wraps the repo's hooks (cloud.mjs safeHooks); `rerun` runs post-checkout again.
 * -> { ok, did: [words], error? }
 */
export async function repairPlace(primary, place, { git, hooks, restore = true, rerun = true, now = null, log = () => {}, orphaned = false } = {}) {
  const wt = place?.worktree;
  let st = placeState(wt, now ?? Date.now());
  if (orphaned && now == null && st.indexLock != null && st.indexLock < LOCK_ORPHAN_MS) {
    // Its server stopped moments ago (a quick relaunch): the lock comes of age in a few seconds; wait, then look again.
    await new Promise((r) => setTimeout(r, LOCK_ORPHAN_MS - st.indexLock + 200));
    st = placeState(wt);
  }
  const did = [];
  if (!st.exists || !st.gitdir) return { ok: false, did, error: 'its worktree folder is not there' };
  // `orphaned`: the server that ran git there is gone, so a lock only seconds old is already nobody's.
  if (st.indexLock != null && st.indexLock < (orphaned ? LOCK_ORPHAN_MS : LOCK_STALE_MS)) return { ok: false, did, error: 'git is still working in it' };
  if (st.interrupted) {
    const u = await git(primary, ['worktree', 'unlock', slash(wt)]);
    if (!u.ok) {
      // An older git refuses: the lock file is git's own, read as "initializing", and nothing holds it now.
      try { fs.unlinkSync(path.join(st.gitdir, 'locked')); } catch { return { ok: false, did, error: 'could not unlock its worktree' }; }
    }
    did.push('unlocked');
  }
  if (st.indexLock != null) {
    try { fs.unlinkSync(path.join(st.gitdir, 'index.lock')); did.push('stale index.lock removed'); } catch { /* gone meanwhile */ }
  }
  if (st.interrupted || !st.formed) {
    // A mixed reset rebuilds the index from HEAD and leaves every file in the folder as it is.
    const idx = fs.existsSync(path.join(st.gitdir, 'index'));
    if (st.interrupted || !idx) {
      const r = await git(wt, ['reset', '-q']);
      if (!r.ok) return { ok: false, did, error: `git reset failed: ${String(r.err || '').trim().split(/\r?\n/).pop()}` };
      did.push('index rebuilt');
    }
    if (restore) {
      const gone = await deletedFiles(wt, git);
      if (gone && gone.length) {
        for (let i = 0; i < gone.length; i += 100) {
          const c = await git(wt, ['checkout', '--', ...gone.slice(i, i + 100)]);
          if (!c.ok) return { ok: false, did, error: `git checkout failed: ${String(c.err || '').trim().split(/\r?\n/).pop()}` };
        }
        did.push(`${gone.length} missing ${gone.length === 1 ? 'file' : 'files'} checked out`);
      }
    }
    if (rerun && place.branch) {
      // The hooks run again on what the worktree has checked out now (a checkout of itself): never a switch back to the
      // branch it began on, which would move a session that changed branches, or fail on an edit it holds.
      const head = await git(wt, ['symbolic-ref', '--short', '-q', 'HEAD']);
      const sha = head.ok && String(head.out || '').trim() ? null : await git(wt, ['rev-parse', '-q', '--verify', 'HEAD']);
      const target = head.ok && String(head.out || '').trim() ? String(head.out).trim() : sha?.ok && String(sha.out || '').trim() ? String(sha.out).trim() : place.branch;
      const h = hooks ? await hooks(primary) : { args: [] };
      try {
        const r = await git(wt, [...(h.args || []), 'checkout', '-q', target], { timeout: 10 * 60 * 1000 });
        if (!r.ok) return { ok: false, did, error: `its post-checkout hook failed: ${String(r.err || r.out || '').trim().split(/\r?\n/).pop()}` };
        did.push('post-checkout ran');
      } finally {
        h.cleanup?.();
      }
    }
    markFormed(wt, { repaired: true });
  }
  if (did.length) log(did);
  return { ok: true, did };
}

/** Is the branch there? */
export async function branchExists(primary, branch, git) {
  if (!branch) return false;
  return (await git(primary, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).ok;
}

/** Drop the registrations of worktrees whose folder is gone (only those: git prune never touches a folder). */
export async function prune(primary, git) {
  return (await git(primary, ['worktree', 'prune'])).ok;
}

/** Sweep the hook wrapper folders a killed form left in the temp folder (older than a day). */
export function sweepHooksTemp({ tmp = os.tmpdir(), now = Date.now(), ageMs = 24 * 3600 * 1000 } = {}) {
  let n = 0;
  let names = [];
  try { names = fs.readdirSync(tmp).filter((f) => f.startsWith('nexus-hooks-')); } catch { return 0; }
  for (const f of names) {
    const full = path.join(tmp, f);
    try {
      if (now - fs.statSync(full).mtimeMs < ageMs) continue;
      fs.rmSync(full, { recursive: true, force: true });
      n += 1;
    } catch { /* held or gone */ }
  }
  return n;
}

/**
 * The startup sweep: every GUI ledger this server does not run whose worktree an add left half made is finished in
 * place (repairPlace). A place whose session never ran gets its missing files back; one that ran keeps its files as
 * they are. `skip(id)`: a session this server forms or runs now. -> [{ id, star, worktree, did }]
 */
export async function sweep(primary, ledgers, { git, hooks, skip = () => false, log = () => {}, now = null, track = () => {}, orphaned = true } = {}) {
  const todo = [];
  for (const l of ledgers) {
    if (!l || l.gui !== true || ['ended', 'resumed'].includes(l.state) || skip(l.id)) continue;
    const wt = typeof l.worktree === 'string' ? l.worktree : '';
    if (!wt) continue;
    const st = placeState(wt, now ?? Date.now());
    if (!st.exists || !st.interrupted) continue;
    todo.push({ l, wt });
  }
  // One after another (hooks can be heavy); `track(id, promise)` hands each place's own repair to the caller at once,
  // so a pick-up waits for its own place only and the list waits for none.
  const out = [];
  let chain = Promise.resolve();
  for (const { l, wt } of todo) {
    const ran = (Number.isFinite(l.sent) && l.sent > 0) || !!l.claude;
    const job = chain.then(async () => {
      const r = await repairPlace(primary, { worktree: wt, branch: l.branch }, { git, hooks, restore: !ran, orphaned, ...(now != null ? { now } : {}) }).catch((e) => ({ ok: false, did: [], error: String(e?.message || e) }));
      out.push({ id: l.id, star: l.star, worktree: wt, ...r });
      if (r.ok) log(`nexus finished making ${l.star}'s worktree after the restart (${r.did.join(', ')})`);
      else log(`nexus could not finish ${l.star}'s worktree: ${r.error}`);
      return r;
    });
    chain = job.catch(() => null);
    track(l.id, job);
  }
  await chain;
  return out;
}
