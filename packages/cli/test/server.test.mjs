import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function fakeProvider() {
  const sent = [];
  return { kind: 'fake', sent, active: false, send(t) { sent.push(t); this.active = true; }, async interrupt() {}, async stop() { this.active = false; }, async fresh() { this.active = false; } };
}

function req(port, { method = 'GET', pathname, headers = {}, body, host = `127.0.0.1:${port}` }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

test('token, Host and Origin are enforced; a good call goes through', async () => {
  const provider = fakeProvider();
  const app = await startServer({ repo: tmpRepo(), provider, pollRuns: false, dist: NO_DIST });
  const { port, token } = app;
  const origin = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await req(port, { pathname: '/api/state' })).status, 403, 'no token');
    assert.equal((await req(port, { pathname: '/api/state', headers: { 'x-nexus-token': 'x'.repeat(token.length) } })).status, 403, 'bad token');
    assert.equal((await req(port, { pathname: '/api/state', headers: { 'x-nexus-token': token }, host: `evil.example:${port}` })).status, 403, 'rebinding host');
    assert.equal((await req(port, { pathname: '/api/state', headers: { 'x-nexus-token': token, origin: 'http://evil.example' } })).status, 403, 'foreign origin');
    const ok = await req(port, { pathname: '/api/state', headers: { 'x-nexus-token': token } });
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(ok.data).provider, 'fake');
    const post = { 'x-nexus-token': token, 'content-type': 'application/json' };
    assert.equal((await req(port, { method: 'POST', pathname: '/api/send', headers: post, body: '{"text":"hi"}' })).status, 403, 'POST needs an Origin');
    assert.equal((await req(port, { method: 'POST', pathname: '/api/send', headers: { ...post, origin, 'content-type': 'text/plain' }, body: '{"text":"hi"}' })).status, 415, 'json only');
    assert.equal((await req(port, { method: 'POST', pathname: '/api/send', headers: { ...post, origin }, body: '{"text":"/next top"}' })).status, 200);
    assert.deepEqual(provider.sent, ['/next top']);
    // a second send while the session runs is a tug
    await req(port, { method: 'POST', pathname: '/api/send', headers: { ...post, origin }, body: '{"text":"also check the docs"}' });
    assert.ok(app.hub.beats.some((b) => b.k === 'oversight' && b.p === 'tug'));
    assert.equal((await req(port, { pathname: '/' })).status, 200, 'placeholder index when unbuilt');
    assert.equal((await req(port, { pathname: '/../../etc/passwd.js' })).status, 404);
    assert.equal((await req(port, { pathname: '/%E0%A4%A' })).status, 400, 'malformed escape is a 400, not a 500');
  } finally {
    await app.close();
  }
});

test('SSE hello replays state', async () => {
  const app = await startServer({ repo: tmpRepo(), provider: fakeProvider(), pollRuns: false, dist: NO_DIST });
  try {
    app.hub.beat({ k: 'agent', p: 'start', id: 'main' });
    const text = await new Promise((resolve, reject) => {
      const r = http.get({ host: '127.0.0.1', port: app.port, path: `/api/events?t=${app.token}`, headers: { host: `127.0.0.1:${app.port}` } }, (res) => {
        assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
        res.once('data', (d) => { resolve(String(d)); r.destroy(); });
      });
      r.on('error', reject);
    });
    assert.match(text, /^event: hello/);
    assert.match(text, /"beats":\[\{"k":"agent"/);
  } finally {
    await app.close();
  }
});

test('live AskUserQuestion resolves with the clicked answers', async () => {
  let hooks;
  const app = await startServer({ repo: tmpRepo(), provider: (h) => { hooks = h; return fakeProvider(); }, pollRuns: false, dist: NO_DIST });
  try {
    const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
    const pending = hooks.onAsk({ id: 'tu_1', agent: 'main', questions: [{ question: 'Ship it?', header: 'Ship', options: [{ label: 'Yes', description: '' }, { label: 'No', description: '' }], multiSelect: false }] });
    const list = JSON.parse((await req(app.port, { pathname: '/api/oversight', headers })).data);
    assert.equal(list.live.length, 1);
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/ask/tu_1', headers, body: '{"answers":{"Ship it?":"Yes"}}' })).status, 200);
    assert.deepEqual(await pending, { 'Ship it?': 'Yes' });
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/ask/tu_1', headers, body: '{"answers":{}}' })).status, 404, 'answered once');
    const kinds = app.hub.beats.filter((b) => b.k === 'oversight').map((b) => b.p);
    assert.deepEqual(kinds, ['ask', 'answer']);
  } finally {
    await app.close();
  }
});

test('owner mode writes an excluded .owner file', async () => {
  const repo = tmpRepo();
  const app = await startServer({ repo, provider: fakeProvider(), pollRuns: false, dist: NO_DIST });
  try {
    const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
    await req(app.port, { method: 'POST', pathname: '/api/owner', headers, body: '{"on":true}' });
    assert.ok(fs.existsSync(path.join(repo, '.owner')));
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', '.owner never shows as untracked');
    await req(app.port, { method: 'POST', pathname: '/api/owner', headers, body: '{"on":false}' });
    assert.ok(!fs.existsSync(path.join(repo, '.owner')));
  } finally {
    await app.close();
  }
});
