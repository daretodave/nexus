// Safe worktree repairs after nexus stopped part way (repair.mjs, fleet.mjs formPlace): an add cut short is finished
// in place and keeps the person's edits, formPlace never calls a half-made place ready, a hook that never finished
// runs again, and a folder deleted from disk comes back from its branch with its commit, never read as "ended".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/server.mjs';
import { cleanGit, formPlace, startLedger, writeStartLedger } from '../server/fleet.mjs';
import { MARKER, gitDirOf, placeState, repairPlace, sweep, sweepHooksTemp } from '../server/repair.mjs';
import { isEnded } from '../server/fleet-home.mjs';
import { removeTree } from './helpers/tmp.mjs';
import { git, commit, tmpRepo, fakes, call, readLedger } from './helpers/restart.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const noHooks = async () => ({ args: [] });

/** A worktree as a killed `git worktree add` leaves it: locked "initializing", a stale index.lock, no index, files gone. */
function halfMade(dir, wt, branch) {
  git(dir, 'worktree', 'add', '-q', '-b', branch, wt, 'HEAD');
  const gd = gitDirOf(wt);
  fs.writeFileSync(path.join(gd, 'locked'), 'initializing');
  fs.rmSync(path.join(gd, 'index'));
  fs.writeFileSync(path.join(gd, 'index.lock'), '');
  const old = new Date(Date.now() - 5 * 60000);
  fs.utimesSync(path.join(gd, 'index.lock'), old, old);
  fs.rmSync(path.join(wt, 'README.md'));
  return gd;
}

test('an add cut short is finished in place: unlocked, the lock gone, missing files back, the person\'s own edits kept', async () => {
  const t = tmpRepo();
  try {
    commit(t.dir, 'b.txt', 'b\n', 'b');
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    const gd = halfMade(t.dir, wt, 'nexus/vega-1');
    fs.writeFileSync(path.join(wt, 'b.txt'), 'my edit\n');
    fs.writeFileSync(path.join(wt, 'new.txt'), 'mine\n');
    assert.equal(placeState(wt).interrupted, true);
    assert.match(git(t.dir, 'worktree', 'list', '--porcelain'), /locked initializing/);

    const r = await repairPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit, hooks: noHooks });
    assert.equal(r.ok, true, r.error);
    assert.ok(fs.existsSync(path.join(wt, 'README.md')), 'the missing file is back');
    assert.equal(fs.readFileSync(path.join(wt, 'b.txt'), 'utf8'), 'my edit\n', 'an edit survives');
    assert.equal(fs.readFileSync(path.join(wt, 'new.txt'), 'utf8'), 'mine\n', 'a new file survives');
    assert.ok(!fs.existsSync(path.join(gd, 'locked')));
    assert.ok(!fs.existsSync(path.join(gd, 'index.lock')));
    assert.ok(fs.existsSync(path.join(gd, MARKER)));
    assert.doesNotMatch(git(t.dir, 'worktree', 'list', '--porcelain'), /locked/);
    assert.match(git(wt, 'status', '--porcelain'), /M b\.txt/);

    // A fresh index.lock may be a git still running: left alone.
    const wt2 = path.join(t.parent, 'repo-wt', 'deneb-1');
    const gd2 = halfMade(t.dir, wt2, 'nexus/deneb-1');
    fs.utimesSync(path.join(gd2, 'index.lock'), new Date(), new Date());
    const busy = await repairPlace(t.dir, { worktree: wt2, branch: 'nexus/deneb-1' }, { git: cleanGit, hooks: noHooks });
    assert.equal(busy.ok, false);
    assert.match(busy.error, /still working/);
  } finally {
    await removeTree(t.parent);
  }
});

test('the startup sweep finishes a GUI session\'s half-made worktree; formPlace repairs a half-made place instead of calling it ready', async () => {
  const t = tmpRepo();
  try {
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    halfMade(t.dir, wt, 'nexus/vega-1');
    writeStartLedger(t.dir, { ...startLedger({ id: 'beef0001', name: 'vega', cwd: wt, place: { worktree: wt, branch: 'nexus/vega-1' } }), state: 'parked' });
    const lines = [];
    const out = await sweep(t.dir, [readLedger(t.dir, 'beef0001')], { git: cleanGit, hooks: noHooks, log: (l) => lines.push(l) });
    assert.equal(out.length, 1);
    assert.equal(out[0].ok, true, out[0].error);
    assert.match(lines[0], /finished making vega's worktree/);
    assert.ok(fs.existsSync(path.join(wt, 'README.md')));

    const wt2 = path.join(t.parent, 'repo-wt', 'sirius-1');
    halfMade(t.dir, wt2, 'nexus/sirius-1');
    const f = await formPlace(t.dir, { worktree: wt2, branch: 'nexus/sirius-1' }, { git: cleanGit, hooks: noHooks });
    assert.equal(f.ok, true, f.error);
    assert.ok(f.repaired?.length, 'it repaired, it did not just say ok');
    assert.equal(placeState(wt2).interrupted, false);
    assert.ok(fs.existsSync(path.join(wt2, 'README.md')));

    // A formed place carries the marker; formPlace on it again is a no-op.
    const wt3 = path.join(t.parent, 'repo-wt', 'deneb-1');
    assert.equal((await formPlace(t.dir, { worktree: wt3, branch: 'nexus/deneb-1' }, { git: cleanGit, hooks: noHooks })).ok, true);
    assert.equal(placeState(wt3).formed, true);
    assert.deepEqual(await formPlace(t.dir, { worktree: wt3, branch: 'nexus/deneb-1' }, { git: cleanGit, hooks: noHooks }), { ok: true });
  } finally {
    await removeTree(t.parent);
  }
});

test('a post-checkout hook that never finished runs again on a retry', async () => {
  const t = tmpRepo();
  try {
    const hooks = path.join(t.dir, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, 'post-checkout'), '#!/bin/sh\necho ran >> installed.txt\n', { mode: 0o755 });
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
    fs.rmSync(path.join(wt, 'installed.txt'), { force: true }); // as if the hook was killed before it finished
    assert.equal(placeState(wt).formed, false, 'no marker: made by git, never finished by nexus');
    const f = await formPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit });
    assert.equal(f.ok, true, f.error);
    assert.ok(fs.existsSync(path.join(wt, 'installed.txt')), 'post-checkout ran again');
    assert.equal(placeState(wt).formed, true);
  } finally {
    await removeTree(t.parent);
  }
});

test('a worktree folder deleted from disk: its branch\'s commits keep it from reading ended, and Pick up brings the folder back', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const wt = path.join(t.parent, 'repo-wt', 'vega-1');
  git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
  commit(wt, 'work.txt', 'done\n', 'feat: the work');
  writeStartLedger(t.dir, { ...startLedger({ id: 'beef0002', name: 'vega', cwd: wt, place: { worktree: wt, branch: 'nexus/vega-1' } }), state: 'parked', stop: { at: new Date().toISOString(), by: 'server', why: 'stop', turn: 'working', queued: [] }, sent: 2 });
  fs.rmSync(wt, { recursive: true, force: true });
  const two = fakes();
  const app = await startServer({ repo: t.dir, provider: two.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0, pickupIdle: false });
  try {
    const row = (await call(app, '/api/sessions')).json.find((s) => s.id === 'beef0002');
    assert.equal(row.state, 'stopped');
    assert.equal(row.git.missing, true);
    assert.equal(row.git.ahead, 1, 'its branch is read, never the primary checkout');
    assert.equal(row.ended, undefined, 'a missing folder whose branch holds a commit is work');
    assert.equal(isEnded({ ...row, stop: { talked: false }, git: { ...row.git, claims: 0 } }), false);
    const refused = await call(app, '/api/sessions/beef0002/close', {});
    assert.equal(refused.status, 409, 'Clear is refused');

    const r = await call(app, '/api/sessions/beef0002/pickup', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const s = app.sessions.get('beef0002');
    for (let i = 0; i < 400 && s.form?.state !== 'ready' && s.form?.state !== 'failed'; i++) await new Promise((res) => setTimeout(res, 50));
    assert.equal(s.form.state, 'ready', JSON.stringify(s.form));
    assert.ok(fs.existsSync(path.join(wt, 'work.txt')), 'the folder is back with its commit');
    assert.match(git(wt, 'log', '-1', '--format=%s'), /the work/);
    assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'nexus/vega-1');
    assert.equal(readLedger(t.dir, 'beef0002').state, 'live');
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
});

test('hook wrapper folders a killed form left behind are swept after a day', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sweep-'));
  try {
    const old = path.join(tmp, 'nexus-hooks-old');
    const fresh = path.join(tmp, 'nexus-hooks-new');
    fs.mkdirSync(old);
    fs.mkdirSync(fresh);
    const day = new Date(Date.now() - 2 * 86400000);
    fs.utimesSync(old, day, day);
    assert.equal(sweepHooksTemp({ tmp }), 1);
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(fresh));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a branch already checked out in a live worktree is used there, never added twice (#88)', async () => {
  const t = tmpRepo();
  try {
    // The session's home, alive; its ledger names a chunk worktree it wrote and removed once the chunk landed.
    const home = path.join(t.parent, '.claude', 'repo', 'polaris-1');
    git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/polaris-1', home, 'HEAD');
    const gone = path.join(t.parent, 'repo-wt', '01.13');
    const lines = [];
    const r = await formPlace(t.dir, { worktree: gone, branch: 'nexus/polaris-1' }, { git: cleanGit, hooks: noHooks, onLine: (l) => lines.push(l) });
    assert.equal(r.ok, true, r.error);
    assert.equal(path.resolve(r.moved).toLowerCase(), path.resolve(home).toLowerCase());
    assert.ok(!fs.existsSync(gone), 'no second checkout');
    assert.match(lines.join('\n'), /already checked out/);

    // Its home deleted too (a stale registration): pruned, and the branch checks out at the planned place again.
    await removeTree(home);
    const again = await formPlace(t.dir, { worktree: gone, branch: 'nexus/polaris-1' }, { git: cleanGit, hooks: noHooks });
    assert.equal(again.ok, true, again.error);
    assert.equal(again.moved, undefined);
    assert.ok(fs.existsSync(path.join(gone, 'README.md')));
  } finally {
    await removeTree(t.parent);
  }
});
