// Upgrade drills (a review's, made tests): a worktree a session moved to another branch is never switched back by a
// repair, a lock a stopped server's git left is not waited on for a minute, a 0.5.1 place is never re-formed, a slow
// hook never holds the first list, and a session a terminal took is never picked up beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/server.mjs';
import { cleanGit } from '../server/fleet.mjs';
import { gitDirOf, placeState, repairPlace } from '../server/repair.mjs';
import { removeTree, until } from './helpers/tmp.mjs';
import { git, commit, tmpRepo, fakes, call, readLedger } from './helpers/restart.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const noHooks = async () => ({ args: [] });
const ID = 'aaaaaaaa-1111-2222-3333-444444444444';

function ledger(dir, fields) {
  const at = new Date(Date.now() - 3600000).toISOString();
  fs.mkdirSync(path.join(dir, '.nexus', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.nexus', 'sessions', `${fields.id || ID}.json`), JSON.stringify({
    id: ID, star: 'vega', state: 'parked', claims: 'aaaaaaaa', started: at, beat: at, chunk: '', step: '', loop: '', claimed: [], parked: [], gui: true,
    ...fields,
  }));
}

/** A worktree whose session moved to its own branch and holds an edit that a checkout of the old branch would refuse. */
function moved(t) {
  commit(t.dir, 'a.txt', 'a\n', 'feat: a');
  const wt = path.join(t.parent, 'repo-wt', 'vega-1');
  git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
  git(wt, 'checkout', '-q', '-b', 'feature-x');
  commit(wt, 'a.txt', 'x\n', 'feat: x');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'my edit\n');
  return wt;
}

test('a repair runs the hooks on the branch the worktree is on now, never switching back (an edit kept, no abort)', async () => {
  const t = tmpRepo();
  try {
    const wt = moved(t);
    const hooks = path.join(t.dir, '.git', 'hooks');
    fs.writeFileSync(path.join(hooks, 'post-checkout'), '#!/bin/sh\necho ran >> .hook-ran\n', { mode: 0o755 });
    assert.equal(placeState(wt).formed, false);
    const r = await repairPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit, hooks: noHooks, restore: false });
    assert.equal(r.ok, true, r.error);
    assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feature-x');
    assert.equal(fs.readFileSync(path.join(wt, 'a.txt'), 'utf8'), 'my edit\n');
    assert.ok(fs.existsSync(path.join(wt, '.hook-ran')), 'post-checkout ran');
    assert.equal(placeState(wt).formed, true);
  } finally {
    await removeTree(t.parent);
  }
});

test('an index.lock a stopped server\'s git left is cleared within seconds when its owner is gone, and waited on otherwise', async () => {
  const t = tmpRepo();
  try {
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
    const gd = gitDirOf(wt);
    const lock = path.join(gd, 'index.lock');
    fs.writeFileSync(lock, '');
    const ten = new Date(Date.now() - 10000);
    fs.utimesSync(lock, ten, ten);
    const busy = await repairPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit, hooks: noHooks });
    assert.equal(busy.ok, false, 'a lock 10 s old may be a git still running');
    const r = await repairPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit, hooks: noHooks, orphaned: true });
    assert.equal(r.ok, true, r.error);
    assert.ok(!fs.existsSync(lock));
  } finally {
    await removeTree(t.parent);
  }
});

test('Pick up on a 0.5.1 worktree (no marker, no `marks`) never re-forms it, however new the server that stamped the ledger', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const f = fakes();
  let app = null;
  try {
    const wt = moved(t);
    ledger(t.dir, {
      cwd: wt, worktree: wt, branch: 'nexus/vega-1', claude: 'claude-vega', sent: 3, server: { pid: 999999, version: '0.5.2', started: new Date().toISOString() },
      stop: { at: new Date().toISOString(), by: 'server', why: 'stop', turn: 'working', paused: false, version: '0.5.2', queued: [], asks: 0 },
    });
    app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0, pickupIdle: false });
    const r = await call(app, `/api/sessions/${ID}/pickup`, {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.form, undefined, 'nothing to form');
    assert.equal(app.sessions.get(ID).form, null);
    assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feature-x');
    assert.deepEqual(f.by.get(ID).sent.length, 1, 'the carry-on line went');
    assert.equal(readLedger(t.dir, ID).marks, undefined);
  } finally {
    await removeTree(t.parent, { stop: app ? [() => app.close()] : [] });
  }
});

test('a slow post-checkout in a half-made worktree never holds the first session list', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const f = fakes();
  let app = null;
  try {
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
    fs.writeFileSync(path.join(gitDirOf(wt), 'locked'), 'initializing');
    fs.writeFileSync(path.join(t.dir, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\nsleep 6\n', { mode: 0o755 });
    ledger(t.dir, { state: 'live', beat: new Date().toISOString(), cwd: wt, worktree: wt, branch: 'nexus/vega-1', sent: 0 });
    app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0, pickupIdle: false });
    const t0 = Date.now();
    const list = (await call(app, '/api/sessions')).json;
    assert.ok(Date.now() - t0 < 4000, `the first list took ${Date.now() - t0} ms`);
    assert.equal(list.find((s) => s.name === 'vega')?.state, 'stopped');
    // A pick-up waits for its own place, then hosts it there, finished.
    const r = await call(app, `/api/sessions/${ID}/pickup`, {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(placeState(wt).interrupted, false);
  } finally {
    await removeTree(t.parent, { stop: app ? [() => app.close()] : [] });
  }
});

test('a GUI session a terminal took (/reboot-resume) is never picked up beside it, and a restart never sweeps it', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const f = fakes();
  let app = null;
  try {
    const now = new Date().toISOString();
    ledger(t.dir, { state: 'live', beat: now, cwd: t.dir, worktree: '', branch: '', claude: 'old-gui', sent: 2, runner: 'bbbbbbbb', runnerSince: now, server: { pid: 999999, version: '0.5.2', started: now } });
    app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
    const row = (await call(app, '/api/sessions')).json.find((s) => s.name === 'vega');
    assert.notEqual(row?.state, 'stopped');
    assert.notEqual(row?.steer, 'pickup');
    assert.equal(readLedger(t.dir, ID).state, 'live', 'not swept to parked');
    assert.equal(readLedger(t.dir, ID).stop, undefined);
    const r = await call(app, `/api/sessions/${ID}/pickup`, {});
    assert.equal(r.status, 409);
    assert.match(r.json.error, /terminal/);
    assert.equal(app.sessions.get(ID), undefined, 'no second agent hosted');
  } finally {
    await removeTree(t.parent, { stop: app ? [() => app.close()] : [] });
  }
});

test('a quick relaunch: a lock seconds old from a stopped server is waited out, then the place is finished', { timeout: 60000 }, async () => {
  const t = tmpRepo();
  try {
    const wt = path.join(t.parent, 'repo-wt', 'vega-1');
    git(t.dir, 'worktree', 'add', '-q', '-b', 'nexus/vega-1', wt, 'HEAD');
    const lock = path.join(gitDirOf(wt), 'index.lock');
    fs.writeFileSync(lock, '');
    const r = await repairPlace(t.dir, { worktree: wt, branch: 'nexus/vega-1' }, { git: cleanGit, hooks: noHooks, orphaned: true });
    assert.equal(r.ok, true, r.error);
    assert.ok(!fs.existsSync(lock));
  } finally {
    await removeTree(t.parent);
  }
});

test('a start writes its first prompt into the ledger while the worktree forms, and clears it once it went', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const f = fakes();
  let app = null;
  try {
    app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
    const a = (await call(app, '/api/sessions', { name: 'vega', prompt: 'build the importer' })).json;
    assert.equal(readLedger(t.dir, a.id).marks, true);
    const first = readLedger(t.dir, a.id).waiting;
    if (first) assert.deepEqual(first, [{ text: 'build the importer', steered: false }]);
    await until(() => app.sessions.get(a.id)?.form?.state === 'ready', { ms: 60000, what: 'the worktree formed' });
    await until(() => readLedger(t.dir, a.id).waiting === undefined, { what: 'the ledger copy cleared' });
    assert.deepEqual(f.by.get(a.id).sent, ['build the importer']);
  } finally {
    await removeTree(t.parent, { stop: app ? [() => app.close()] : [] });
  }
});
