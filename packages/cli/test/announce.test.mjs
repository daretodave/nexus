// Owner lines from the GUI go through the repo's own scripts/announce.mjs (spec 40 A8): POST /api/announce posts one
// line to every loop with its postTo, so the board keeps its format, its lock (.nexus/announcements.lock) and its
// whole-file write; the server never writes .announcements.md itself. A repo without a board, or with one too old to
// post from the GUI, gets a clear refusal and an untouched tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const FAKE = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };

function req(port, token, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${port}`, 'x-nexus-token': token };
    if (body !== undefined) Object.assign(headers, { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' });
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** A git repo with the kit's notice board scripts (or `scripts` to write instead) in `dir`, its root resolved by git. */
function fixture(scripts = ['announce.mjs', 'ledger.mjs', 'owner.mjs'], dir = 'scripts') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-announce-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.mkdirSync(path.join(repo, dir), { recursive: true });
  for (const f of scripts) fs.copyFileSync(path.join(KIT, 'templates', 'scripts', f), path.join(repo, dir, f));
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim();
  return { repo, root };
}

async function withServer(repo, fn) {
  const app = await startServer({ repo, pollRuns: false, dist: NO_DIST, provider: FAKE });
  try {
    return await fn((m, p, b) => req(app.port, app.token, m, p, b));
  } finally {
    await app.close();
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

const boardOf = (root) => import(`${pathToFileURL(path.join(root, 'scripts', 'announce.mjs')).href}?t=${Date.now()}${Math.random()}`);

test('an owner line posts through announce.mjs: its format, its numbering, no lock or temp file left', async () => {
  const { repo, root } = fixture();
  await withServer(repo, async (call) => {
    const one = await call('POST', '/api/announce', { text: '  pause the\nrelease train ' });
    assert.equal(one.status, 200);
    assert.equal(one.data.line, 1);
    assert.equal((await call('POST', '/api/announce', { text: 'resume it' })).data.line, 2);
    const text = fs.readFileSync(path.join(root, '.announcements.md'), 'utf8');
    const board = await boardOf(root);
    // The repo's own parser reads back exactly what was posted, as the owner, to every loop.
    assert.deepEqual(board.parse(text).map((a) => [a.n, a.from, a.text, board.addressee(a)]), [[1, 'owner', 'pause the release train', null], [2, 'owner', 'resume it', null]]);
    assert.match(text, /<!-- next 3 -->/);
    assert.equal(fs.existsSync(path.join(root, '.nexus', 'announcements.lock')), false, 'the lock is released');
    assert.deepEqual(fs.readdirSync(path.join(root, '.nexus')).filter((f) => f.endsWith('.tmp')), [], 'the board lands whole');

    // announce.mjs's own refusals come back as refusals, nothing posted.
    const at = await call('POST', '/api/announce', { text: '@vega only you' });
    assert.equal(at.status, 409);
    assert.match(at.data.error, /cannot start with "@vega"/);
    assert.equal((await call('POST', '/api/announce', { text: '   ' })).status, 400);
    assert.equal(board.parse(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8')).length, 2);
  });
});

test('a post waits for the board lock another writer holds, then lands; concurrent writers all land', async () => {
  const { repo, root } = fixture();
  const lock = path.join(root, '.nexus', 'announcements.lock');
  // Another writer (a live process, so its lock is not stale) holds the board for ~600ms.
  const holder = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    fs.mkdirSync(require('node:path').dirname(${JSON.stringify(lock)}), { recursive: true });
    fs.writeFileSync(${JSON.stringify(lock)}, process.pid + ' ' + new Date().toISOString() + '\\n', { flag: 'wx' });
    console.log('held');
    setTimeout(() => { fs.rmSync(${JSON.stringify(lock)}); console.log('freed'); }, 600);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  await new Promise((resolve) => holder.stdout.on('data', (d) => { out += d; if (out.includes('held')) resolve(); }));
  await withServer(repo, async (call) => {
    const t0 = Date.now();
    const r = await call('POST', '/api/announce', { text: 'after the lock' });
    assert.equal(r.status, 200);
    assert.ok(Date.now() - t0 >= 300, 'the post waited for the holder');
    await new Promise((resolve) => (holder.exitCode !== null ? resolve() : holder.on('exit', resolve)));
    assert.match(out, /freed/, 'the holder released its own lock: the post never broke a live one');

    // The CLI (a terminal, as the owner) and the GUI post at once: every line lands, each with its own number.
    const env = { ...process.env };
    delete env.NEXUS_SESSION;
    delete env.CLAUDE_CODE_SESSION_ID;
    const cli = Array.from({ length: 4 }, (_, i) => new Promise((resolve) => {
      spawn(process.execPath, [path.join(root, 'scripts', 'announce.mjs'), `from the terminal ${i}`], { cwd: root, env, stdio: 'ignore' }).on('exit', resolve);
    }));
    const gui = Array.from({ length: 4 }, (_, i) => call('POST', '/api/announce', { text: `from the gui ${i}` }));
    const codes = await Promise.all(cli);
    assert.deepEqual(codes, [0, 0, 0, 0]);
    assert.ok((await Promise.all(gui)).every((x) => x.status === 200));
    const lines = (await boardOf(root)).parse(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8'));
    assert.equal(lines.length, 9);
    assert.deepEqual(lines.map((a) => a.n).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(lines.every((a) => a.from === 'owner'));
  });
});

test('a board kept under scripts/dev/ is found: the line posts through it', async () => {
  const { repo, root } = fixture(undefined, 'scripts/dev');
  await withServer(repo, async (call) => {
    const r = await call('POST', '/api/announce', { text: 'from the dev folder' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.line, 1);
    const board = await import(`${pathToFileURL(path.join(root, 'scripts', 'dev', 'announce.mjs')).href}?t=${Date.now()}`);
    assert.deepEqual(board.parse(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8')).map((a) => a.text), ['from the dev folder']);
  });
});

test('no board, or one too old to post from the GUI: refused, nothing written', async () => {
  const bare = fixture([]);
  await withServer(bare.repo, async (call) => {
    const r = await call('POST', '/api/announce', { text: 'hello' });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /no notice board \(scripts\/announce\.mjs\)/);
    assert.equal(fs.existsSync(path.join(bare.root, '.announcements.md')), false);
  });
  const old = fixture([]);
  // An announce.mjs from before postTo: a CLI only. The server does not write its board for it.
  fs.writeFileSync(path.join(old.root, 'scripts', 'announce.mjs'), 'export function main() { return 0; }\n');
  await withServer(old.repo, async (call) => {
    const r = await call('POST', '/api/announce', { text: 'hello' });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /has no postTo/);
    assert.equal(fs.existsSync(path.join(old.root, '.announcements.md')), false);
  });
});
