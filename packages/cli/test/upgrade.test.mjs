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

test('a launch that finds this repo\'s nexus on another version says so, names --replace, and opens it', { timeout: 60000 }, async () => {
  const t = tmpRepo();
  // A stand-in for an older running server: it answers /api/server as nexus for this root.
  const fake = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ nexus: true, root: t.dir, version: '0.0.9' }));
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const port = fake.address().port;
  await writeInstance(t.dir, { pid: process.pid, port, token: 'tok', url: `http://127.0.0.1:${port}/?t=tok`, repo: t.dir, root: t.dir, started: new Date().toISOString(), version: '0.0.9' });
  const child = spawn(process.execPath, [BIN, '--repo', t.dir, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((r) => child.on('exit', r));
    assert.equal(code, 0, out);
    assert.match(out, /already running/);
    assert.match(out, /This repo's nexus runs 0\.0\.9; you launched \d+\.\d+\.\d+\. Stop it \(Ctrl\+C where it runs\), then launch again/);
    assert.match(out, /--replace/);
    assert.match(out, new RegExp(`127\\.0\\.0\\.1:${port}`));
  } finally {
    await new Promise((r) => fake.close(r));
    await removeTree(t.parent, { children: [child] });
  }
});
