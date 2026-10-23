// Upgrading: POST /api/shutdown (what a newer launch's --replace calls) needs the token and parks every session the
// safe way; a launch that finds this repo's nexus running another version says so plainly, and opens it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.mjs';
import { writeInstance } from '../server/instance.mjs';
import { removeTree, until } from './helpers/tmp.mjs';
import { tmpRepo, fakes, call, readLedger } from './helpers/restart.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nexus.mjs');

test('POST /api/shutdown needs the token, then parks every session and stops the server', { timeout: 120000 }, async () => {
  const t = tmpRepo();
  const f = fakes();
  const app = await startServer({ repo: t.dir, provider: f.factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
  try {
    const s = (await call(app, '/api/sessions', { name: 'vega', worktree: false, prompt: 'hello' })).json;
    f.by.get(s.id).hooks.onMessage({ type: 'system', subtype: 'init', session_id: 'claude-vega', model: 'm' });
    const refused = await call({ ...app, token: 'nope' }, '/api/shutdown', {});
    assert.equal(refused.status, 403);
    const r = await call(app, '/api/shutdown', {});
    assert.equal(r.status, 200);
    assert.equal(r.json.stopping, true);
    await until(() => readLedger(t.dir, s.id).state === 'parked', { what: 'the ledger parked' });
    const l = readLedger(t.dir, s.id);
    assert.equal(l.stop.why, 'replace');
    assert.equal(l.stop.turn, 'working');
    assert.equal(l.claude, 'claude-vega');
    await until(() => new Promise((res) => {
      const q = http.get({ host: '127.0.0.1', port: app.port, path: '/api/hello', headers: { host: `127.0.0.1:${app.port}` } }, () => res(false));
      q.on('error', () => res(true));
    }), { what: 'the server to stop listening' });
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
});

/** A stand-in for a running server on `version`: it answers as nexus for this root, and 404s /api/shutdown when old. */
async function runningAs(t, version, { shutdown = false } = {}) {
  const fake = http.createServer((req, res) => {
    if (req.url.startsWith('/api/shutdown') && !shutdown) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not found"}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ nexus: true, root: t.dir, version }));
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const port = fake.address().port;
  await writeInstance(t.dir, { pid: process.pid, port, token: 'tok', url: `http://127.0.0.1:${port}/?t=tok`, repo: t.dir, root: t.dir, started: new Date().toISOString(), version });
  return { fake, port };
}

async function launch(t, args = []) {
  const child = spawn(process.execPath, [BIN, '--repo', t.dir, '--no-open', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((r) => child.on('exit', r));
  return { code, out, child };
}

test('a launch that finds this repo\'s nexus on another version says so, names --replace, and opens it', { timeout: 60000 }, async () => {
  const t = tmpRepo();
  const { fake, port } = await runningAs(t, '9.0.0', { shutdown: true });
  let child = null;
  try {
    const r = await launch(t);
    child = r.child;
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /already running/);
    assert.match(r.out, /This repo's nexus runs 9\.0\.0; you launched \d+\.\d+\.\d+\. Stop it \(Ctrl\+C where it runs\), then launch again/);
    assert.match(r.out, /--replace/);
    assert.match(r.out, new RegExp(`127\\.0\\.0\\.1:${port}`));
  } finally {
    await new Promise((r) => fake.close(r));
    await removeTree(t.parent, { children: child ? [child] : [] });
  }
});

test('a server older than 0.5.2, which has no safe stop, is never offered --replace, and --replace says to stop it where it runs', { timeout: 60000 }, async () => {
  const t = tmpRepo();
  const { fake } = await runningAs(t, '0.4.0');
  const kids = [];
  try {
    const plain = await launch(t);
    kids.push(plain.child);
    assert.equal(plain.code, 0, plain.out);
    assert.match(plain.out, /This repo's nexus runs 0\.4\.0/);
    assert.doesNotMatch(plain.out, /--replace/);
    const started = Date.now();
    const rep = await launch(t, ['--replace']);
    kids.push(rep.child);
    assert.equal(rep.code, 1, rep.out);
    assert.match(rep.out, /nexus 0\.4\.0 cannot be stopped from here\. Stop it with Ctrl\+C where it runs/);
    assert.ok(Date.now() - started < 20000, 'it says so at once, not after a 30 s wait');
  } finally {
    await new Promise((r) => fake.close(r));
    await removeTree(t.parent, { children: kids });
  }
});
