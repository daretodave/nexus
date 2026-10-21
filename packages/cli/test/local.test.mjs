// /api/local (A11): run mode and owner mode in .nexus/local.json at the primary checkout, one writer
// (server/local.mjs), read and written by Settings and the cockpit through ui/run-mode.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { LOCAL_FILE, RUN_MODES as SERVER_MODES, PHASES, readLocal, writeLocal, localView, migrateRunMode } from '../server/local.mjs';
import { RUN_MODES, localRunMode, saveRunMode, runModeFromPrefs } from '../src/ui/run-mode.js';
import { startServer } from '../server/server.mjs';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-local-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

const file = (root) => path.join(root, LOCAL_FILE);
const read = (root) => JSON.parse(fs.readFileSync(file(root), 'utf8'));

test('the server and the page agree on the run modes', () => {
  assert.deepEqual(SERVER_MODES, RUN_MODES);
  assert.deepEqual(PHASES, ['short', 'std', 'night']);
});

test('no local settings: by size, owner mode switched on, no .owner', async () => {
  const repo = tmpRepo();
  assert.deepEqual(readLocal(repo), {});
  assert.deepEqual(await localView(repo), { owner: false, ownerMode: true, effective: false, runMode: 'size', phase: 'std' });
  assert.equal(fs.existsSync(file(repo)), false, 'a read never writes');
});

test('a write keeps the keys it does not know, drops bad values, and lands whole', async () => {
  const repo = tmpRepo();
  fs.mkdirSync(path.join(repo, '.nexus'), { recursive: true });
  fs.writeFileSync(file(repo), JSON.stringify({ ownerMode: false, other: 'kept' }));
  const out = await writeLocal(repo, { runMode: 'wf', phase: 'night', ownerMode: true, junk: 1 });
  assert.deepEqual(read(repo), { ownerMode: true, other: 'kept', runMode: 'wf', phase: 'night' });
  assert.equal(out.runMode, 'wf');
  await assert.rejects(writeLocal(repo, { runMode: 'agents' }), /run mode/);
  await assert.rejects(writeLocal(repo, { ownerMode: 'no' }), /ownerMode/);
  await assert.rejects(writeLocal(repo, { phase: 'forever' }), /phase/);
  assert.equal(read(repo).runMode, 'wf', 'a refused write changes nothing');
  assert.deepEqual(fs.readdirSync(path.join(repo, '.nexus')).sort(), ['local.json'], 'no temp or lock file left behind');
});

test('concurrent writes all land: one writer, serialized', async () => {
  const repo = tmpRepo();
  await Promise.all([writeLocal(repo, { runMode: 'sub' }), writeLocal(repo, { phase: 'short' }), writeLocal(repo, { ownerMode: false })]);
  assert.deepEqual(read(repo), { runMode: 'sub', phase: 'short', ownerMode: false });
});

test('a worktree reads and writes the primary checkout\'s local settings', async () => {
  const repo = tmpRepo();
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-local-wt-')), 'wt');
  execFileSync('git', ['worktree', 'add', '-q', '--detach', wt], { cwd: repo });
  await writeLocal(wt, { runMode: 'both' });
  assert.equal(read(repo).runMode, 'both');
  assert.equal(fs.existsSync(file(wt)), false);
  assert.equal((await localView(wt)).runMode, 'both');
});

test('owner mode follows scripts/owner.mjs: an untracked .owner, not switched off', async () => {
  const repo = tmpRepo(); // a temp repo's own .owner, never a real checkout's
  fs.writeFileSync(path.join(repo, '.owner'), 'owner\n');
  assert.deepEqual(await localView(repo), { owner: true, ownerMode: true, effective: true, runMode: 'size', phase: 'std' });
  await writeLocal(repo, { ownerMode: false });
  const off = await localView(repo);
  assert.equal(off.owner, true);
  assert.equal(off.ownerMode, false);
  assert.equal(off.effective, false);
  execFileSync('git', ['add', '-f', '.owner'], { cwd: repo });
  await writeLocal(repo, { ownerMode: true });
  assert.equal((await localView(repo)).owner, false, 'a committed .owner counts for no one');
});

test('the run mode moves out of the GUI prefs once', async () => {
  const repo = tmpRepo();
  let forgot = 0;
  const forget = async () => { forgot += 1; };
  assert.equal(await migrateRunMode(repo, { agents: true, workflows: false }, forget), 'sub');
  assert.equal(read(repo).runMode, 'sub');
  assert.equal(forgot, 1);
  // once: a later run mode in local.json wins over whatever prefs still say
  await writeLocal(repo, { runMode: 'wf' });
  assert.equal(await migrateRunMode(repo, { agents: true }, forget), null);
  assert.equal(read(repo).runMode, 'wf');
  // nothing to carry: by size stays the default and no file is made
  const bare = tmpRepo();
  assert.equal(await migrateRunMode(bare, { agents: false, workflows: false }, forget), null);
  assert.equal(fs.existsSync(file(bare)), false);
});

test('ui/run-mode.js reads and writes the run mode over /api/local', async () => {
  assert.equal(localRunMode(null), 'size');
  assert.equal(localRunMode({ runMode: 'both' }), 'both');
  assert.equal(localRunMode({ runMode: 'agents' }), 'size');
  const calls = [];
  const post = async (p, b) => { calls.push([p, b]); return { runMode: b.runMode }; };
  assert.deepEqual(await saveRunMode('wf', post), { runMode: 'wf' });
  assert.deepEqual(calls, [['/api/local', { runMode: 'wf' }]]);
  await assert.rejects(saveRunMode('workflows', post), /run mode/);
  assert.equal(runModeFromPrefs({ workflows: true }), 'wf');
});

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('GET and POST /api/local, and the prefs run mode migrated at start', async () => {
  const repo = tmpRepo();
  const prefsFile = path.join(repo, '.git', 'nexus-gui.json');
  fs.writeFileSync(prefsFile, JSON.stringify({ agents: false, workflows: true, onboarded: true }));
  const provider = { kind: 'fake', active: false, send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
  const app = await startServer({ repo, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist') });
  const { port, token } = app;
  const get = { 'x-nexus-token': token };
  const post = { ...get, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` };
  try {
    const first = await req(port, { pathname: '/api/local', headers: get });
    assert.equal(first.status, 200);
    assert.deepEqual(first.data, { owner: false, ownerMode: true, effective: false, runMode: 'wf', phase: 'std' });
    const prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    assert.equal('agents' in prefs || 'workflows' in prefs, false, 'the prefs copy is gone');
    assert.equal(prefs.onboarded, true, 'other prefs stay');
    const set = await req(port, { method: 'POST', pathname: '/api/local', headers: post, body: '{"runMode":"sub","phase":"short"}' });
    assert.equal(set.status, 200);
    assert.equal(set.data.runMode, 'sub');
    assert.deepEqual(read(repo), { runMode: 'sub', phase: 'short' });
    const bad = await req(port, { method: 'POST', pathname: '/api/local', headers: post, body: '{"runMode":"agents"}' });
    assert.equal(bad.status, 400);
    assert.equal(read(repo).runMode, 'sub');
    // /api/prefs no longer takes a run mode: one writer
    await req(port, { method: 'POST', pathname: '/api/prefs', headers: post, body: '{"agents":true}' });
    assert.equal('agents' in JSON.parse(fs.readFileSync(prefsFile, 'utf8')), false);
  } finally {
    await app.close();
  }
});
