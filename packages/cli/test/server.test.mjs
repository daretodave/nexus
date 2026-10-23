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

test('closing waits for what the server started, then kills what still runs as a tree (a timeout too)', async () => {
  const { run, settle } = await import('../server/sh.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-settle-'));
  const slash = (p) => p.split(path.sep).join('/');
  // A program that starts its own child (a shell's git, a script's git) and outlives the server's patience.
  const script = path.join(dir, 'tree.mjs');
  fs.writeFileSync(script, `
    import { spawn } from 'node:child_process';
    import fs from 'node:fs';
    const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    fs.writeFileSync(process.argv[2], String(kid.pid));
    setInterval(() => {}, 1000);
  `);
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const kidOf = async (file) => { while (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8')) await new Promise((r) => setTimeout(r, 25)); return Number(fs.readFileSync(file, 'utf8')); };
  const gone = async (pid) => { for (const end = Date.now() + 10000; alive(pid) && Date.now() < end;) await new Promise((r) => setTimeout(r, 50)); return !alive(pid); };
  try {
    const held = run('node', [slash(script), slash(path.join(dir, 'a.pid'))], { cwd: dir, timeout: 600000 });
    const a = await kidOf(path.join(dir, 'a.pid'));
    assert.equal(await settle({ ms: 200 }), 1, 'one program was still running');
    assert.equal((await held).ok, false);
    assert.ok(await gone(a), 'its child went with it');

    const timed = await run('node', [slash(script), slash(path.join(dir, 'b.pid'))], { cwd: dir, timeout: 1500 });
    assert.match(timed.stderr, /timed out/);
    assert.ok(await gone(Number(fs.readFileSync(path.join(dir, 'b.pid'), 'utf8'))), 'a timeout kills the whole tree');
    assert.equal(await settle({ ms: 100 }), 0, 'nothing left');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('GET /api/tool: an open row gets the fuller call the transcript only previews; the permission card gets it whole', async () => {
  let hooks;
  const app = await startServer({ repo: tmpRepo(), provider: (h) => { hooks = h; return fakeProvider(); }, pollRuns: false, dist: NO_DIST });
  try {
    const headers = { 'x-nexus-token': app.token };
    const input = { file_path: 'src/a.js', old_string: 'o'.repeat(9000), new_string: 'n'.repeat(9000) };
    hooks.onMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: 'M', content: [{ type: 'tool_use', id: 'T1', name: 'Edit', input }] } });
    const item = app.hub.transcript.find((t) => t.id === 'T1');
    assert.equal(item.more, true);
    assert.ok(item.input.old_string.length < 1000, 'the transcript holds a preview');
    const got = await req(app.port, { pathname: '/api/tool?id=T1', headers });
    assert.equal(got.status, 200);
    const d = JSON.parse(got.data);
    assert.deepEqual(d.input, input, 'the whole edit');
    assert.equal(d.clipped, null);
    assert.equal((await req(app.port, { pathname: '/api/tool?id=nope', headers })).status, 404, 'a call it no longer keeps');
    assert.equal((await req(app.port, { pathname: '/api/tool?id=T1&session=nobody', headers })).status, 404, 'another session');
    hooks.onPermission({ id: 'P1', agent: 'main', tool: 'Edit', input });
    const card = app.sessions.get(app.home).permissions.get('P1').view;
    assert.deepEqual(card.input, input, 'the permission card shows the real call, not a preview');
    assert.deepEqual(card.clipped, []);
  } finally {
    await app.close();
  }
});
