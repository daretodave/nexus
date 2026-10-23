// Needs you and the kept reads, through the live server: a question asked shows on GET /api/needs and as the
// `needs` event on the live channel at once, and goes when it is answered; with the kept reads on, a repeat read is
// served stale (x-nexus-stale) while a fresh one runs, `x-nexus-fresh` waits for it, and a write forgets them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-needs-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

const fakeProvider = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

/** Read the live channel until `pred` holds for a `needs` event's data (or the hello's). */
function waitNeeds(app, pred, ms = 5000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => { r.destroy(); reject(new Error(`no matching needs event; got:\n${buf.slice(-800)}`)); }, ms);
    const r = http.get({ host: '127.0.0.1', port: app.port, path: `/api/events?t=${app.token}`, headers: { host: `127.0.0.1:${app.port}` } }, (res) => {
      res.on('data', (d) => {
        buf += d;
        for (const block of buf.split('\n\n')) {
          const type = /^event: (\w+)/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!type || !data) continue;
          let v;
          try { v = JSON.parse(data); } catch { continue; }
          const needs = type === 'needs' ? v : type === 'hello' ? v.needs : null;
          if (needs && pred(needs)) { clearTimeout(timer); r.destroy(); resolve(needs); return; }
        }
      });
    });
    r.on('error', () => {});
  });
}

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const QS = [{ question: 'Which store?', header: 'Store', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }];

test('a question asked shows on the top bar now, live and on GET /api/needs, and goes when answered', async () => {
  let hooks;
  const app = await startServer({ repo: tmpRepo(), provider: (h) => { hooks = h; return fakeProvider(); }, pollRuns: false, dist: NO_DIST });
  const json = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    assert.deepEqual((await req(app.port, { pathname: '/api/needs', headers: json })).data.items, []);
    const live = waitNeeds(app, (n) => n.items.length === 1);
    const pending = hooks.onAsk({ id: 'tu_1', agent: 'main', questions: QS });
    const seen = await live;
    assert.equal(seen.items[0].what, 'question');
    assert.equal(seen.items[0].detail, 'Which store?');
    assert.match(seen.items[0].to, /^\/s\//);
    const got = (await req(app.port, { pathname: '/api/needs', headers: json })).data;
    assert.equal(got.items.length, 1);
    assert.equal(typeof got.at, 'number');
    const gone = waitNeeds(app, (n) => n.items.length === 0);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/ask/tu_1', headers: json, body: JSON.stringify({ answers: { 'Which store?': 'SQLite' } }) })).status, 200);
    await pending;
    await gone;
    assert.deepEqual((await req(app.port, { pathname: '/api/needs', headers: json })).data.items, []);
  } finally {
    await app.close();
  }
});

test('kept reads: a repeat read comes stale while a fresh one runs; fresh waits for it; a write forgets', async () => {
  const repo = tmpRepo();
  const app = await startServer({ repo, provider: fakeProvider(), pollRuns: false, dist: NO_DIST, swr: true });
  const h = { 'x-nexus-token': app.token };
  const post = { ...h, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    const first = await req(app.port, { pathname: '/api/state', headers: h });
    assert.equal(first.status, 200);
    assert.equal(first.headers['x-nexus-stale'], undefined, 'a first read is waited for');
    await new Promise((r) => setTimeout(r, 1700)); // past the fresh window
    const again = await req(app.port, { pathname: '/api/state', headers: h });
    assert.equal(again.headers['x-nexus-stale'], '1', 'served at once from the last read');
    const fresh = await req(app.port, { pathname: '/api/state', headers: { ...h, 'x-nexus-fresh': '1' } });
    assert.equal(fresh.headers['x-nexus-stale'], undefined, 'fresh waits for the read');
    // A write forgets: owner mode switched on shows on the very next read, not stale.
    assert.equal(fresh.data.info.owner, false);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/owner', headers: post, body: '{"on":true}' })).status, 200);
    const after = await req(app.port, { pathname: '/api/state', headers: h });
    assert.equal(after.headers['x-nexus-stale'], undefined);
    assert.equal(after.data.info.owner, true);
  } finally {
    await app.close();
  }
});
