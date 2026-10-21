import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { LEDGER_STARS, LOCAL_STARS, ghLoginOnce, heldNames, nextName, placeFor } from '../server/fleet.mjs';
import { withHosted } from '../server/sessions.mjs';
import { SESSIONS } from '../src/ui/stars.js';
import { STARS } from '../../../scripts/ledger.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

function tmpRepo({ commit = false } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-fleet-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (commit) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# r\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'], { cwd: dir });
  }
  return { parent, dir };
}

/** A provider factory: one fake per session, by the session id its hooks carry. */
function fakes() {
  const by = new Map();
  const factory = (hooks) => {
    const p = { kind: 'fake', sent: [], hooks, send(t) { this.sent.push(t); }, async interrupt() {}, async stop() {}, async fresh() {} };
    by.set(hooks.session, p);
    return p;
  };
  return { by, factory };
}

function call(app, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token };
    if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` });
    const r = http.request({ host: '127.0.0.1', port: app.port, method: body === undefined ? 'GET' : 'POST', path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* html */ } resolve({ status: res.statusCode, json, data }); });
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** The first SSE frame (hello) of a channel. */
function hello(app, session) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ t: app.token, ...(session ? { session } : {}) });
    const r = http.get({ host: '127.0.0.1', port: app.port, path: `/api/events?${q}`, headers: { host: `127.0.0.1:${app.port}` } }, (res) => {
      let buf = '';
      res.on('data', (d) => {
        buf += d;
        const end = buf.indexOf('\n\n');
        if (end < 0) return;
        r.destroy();
        resolve(JSON.parse(buf.slice(0, end).split('\n').find((l) => l.startsWith('data: ')).slice(6)));
      });
    });
    r.on('error', reject);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('one server hosts many sessions: each its own name, ledger, provider and channel', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  let asked = 0;
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => { asked += 1; return 'octo'; } });
  try {
    const a = await call(app, '/api/sessions', { worktree: false });
    const b = await call(app, '/api/sessions', { worktree: false });
    assert.equal(a.status, 200);
    assert.equal(a.json.name, 'vega');
    assert.equal(b.json.name, 'sirius', 'the next free star');
    assert.notEqual(a.json.id, b.json.id);
    assert.match(a.json.id, /^[0-9a-f]{8}$/);
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', `${a.json.id}.json`), 'utf8'));
    assert.equal(ledger.star, 'vega');
    assert.equal(ledger.state, 'live');

    // A prompt reaches the session it names, and only that one.
    assert.equal((await call(app, '/api/send', { text: 'hello a', session: a.json.id })).status, 200);
    assert.deepEqual(by.get(a.json.id).sent, ['hello a']);
    assert.deepEqual(by.get(b.json.id).sent, []);
    assert.equal((await call(app, '/api/send', { text: 'x', session: 'nope0000' })).status, 404);

    // Its environment: its own claims session, and the gh login asked once for the whole server.
    await call(app, '/api/send', { text: 'hello b', session: 'sirius' });
    assert.deepEqual(by.get(a.json.id).hooks.env(), { NEXUS_SESSION: a.json.id, NEXUS_GH_LOGIN: 'octo' });
    assert.deepEqual(by.get(b.json.id).hooks.env(), { NEXUS_SESSION: b.json.id, NEXUS_GH_LOGIN: 'octo' });
    assert.equal(asked, 1);

    // Each channel replays its own session.
    by.get(a.json.id).hooks.onMessage({ type: 'assistant', session_id: 'claude-a', message: { content: [{ type: 'text', text: 'from a' }] } });
    await wait(350);
    const ha = await hello(app, a.json.id);
    const hb = await hello(app, b.json.id);
    assert.ok(ha.transcript.some((t) => t.text === 'hello a'));
    assert.ok(!hb.transcript.some((t) => t.text === 'hello a'), 'b never sees a');
    assert.ok(hb.transcript.some((t) => t.text === 'hello b'));
    assert.deepEqual((await hello(app, 'claude-a')).transcript, ha.transcript, 'the Claude Code session id names it too');
    const quiet = await hello(app, 'some-terminal-session');
    assert.deepEqual(quiet.transcript, []);
    assert.equal(quiet.status.hosted, false, 'a session this server does not run gets a quiet channel');
    const home = await hello(app);
    assert.ok(!home.transcript.some((t) => t.text === 'hello a'), 'the home channel is its own');

    // Both show in the session list as local, steered through the SDK.
    const list = (await call(app, '/api/sessions')).json;
    const mine = list.filter((s) => s.hosted).map((s) => s.name).sort();
    assert.deepEqual(mine, ['sirius', 'vega']);
    assert.ok(list.filter((s) => s.hosted).every((s) => s.kind === 'local' && s.steer === 'sdk'));
    assert.equal((await call(app, `/api/sessions/${a.json.id}`)).json.name, 'vega');

    // The detail carries the times the stream saw (41.7): a claim dates the chunk's start; no plan, no estimate.
    by.get(a.json.id).hooks.onMessage({ type: 'assistant', session_id: 'claude-a', message: { content: [{ type: 'tool_use', id: 'B1', name: 'Bash', input: { command: 'node scripts/claims.mjs claim 3.1' } }] } });
    const d = (await call(app, `/api/sessions/${a.json.id}`)).json;
    assert.equal(d.chunk.id, '3.1');
    assert.ok(Number.isFinite(Date.parse(d.chunk.startedAt)));
    assert.equal(d.chunk.estimate, null);
    assert.ok(d.startedAt);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('questions and permissions are answered across sessions, tagged', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const s = (await call(app, '/api/sessions', { worktree: false })).json;
    const hooks = by.get(s.id).hooks;
    const pending = hooks.onAsk({ id: 'tu_9', agent: 'main', questions: [{ question: 'Go?', options: [] }] });
    const live = (await call(app, '/api/oversight')).json.live;
    assert.equal(live.length, 1);
    assert.equal(live[0].session, s.id);
    assert.equal((await call(app, '/api/ask/tu_9', { answers: { 'Go?': 'Yes' } })).status, 200);
    assert.deepEqual(await pending, { 'Go?': 'Yes' });
    const perm = hooks.onPermission({ id: 'p_1', agent: 'main', tool: 'Bash', input: { command: 'ls' } });
    assert.equal((await call(app, '/api/permission/p_1', { allow: true })).status, 200);
    assert.deepEqual(await perm, { allow: true, always: false });
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('pause waits for the turn, holds what is sent, and resume hands it over', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const s = (await call(app, '/api/sessions', { worktree: false })).json;
    const p = by.get(s.id);
    await call(app, '/api/send', { text: 'work', session: s.id });
    assert.equal((await call(app, `/api/sessions/${s.id}/pause`, {})).json.pause.state, 'pausing', 'mid-turn: after this step');
    assert.equal((await call(app, `/api/sessions/${s.id}`)).json.state, 'pausing');
    assert.equal((await call(app, '/api/send', { text: 'later', session: s.id })).json.held, true);
    p.hooks.onMessage({ type: 'result', session_id: 'c1', total_cost_usd: 0 });
    const detail = (await call(app, `/api/sessions/${s.id}`)).json;
    assert.equal(detail.state, 'paused');
    assert.ok(detail.pausedAt);
    assert.deepEqual(p.sent, ['work'], 'nothing reaches a paused session');
    const r = (await call(app, `/api/sessions/${s.id}/resume`, {})).json;
    assert.equal(r.pause.delivered, 1);
    assert.deepEqual(p.sent, ['work', 'later']);
    assert.equal((await call(app, '/api/sessions/terminal-only/pause', {})).status, 409, 'only a hosted session pauses here');
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('close ends the ledger and frees the star; the home session stays', async () => {
  const { parent, dir } = tmpRepo();
  const { factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const s = (await call(app, '/api/sessions', { worktree: false })).json;
    assert.equal((await call(app, `/api/sessions/${s.id}/close`, {})).status, 200);
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', `${s.id}.json`), 'utf8'));
    assert.equal(ledger.state, 'ended');
    assert.equal((await call(app, '/api/send', { text: 'x', session: s.id })).status, 404);
    assert.equal((await call(app, '/api/sessions', { worktree: false })).json.name, 'vega', 'a closed session frees its star');
    assert.equal((await call(app, '/api/sessions/main/close', {})).status, 409);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a session started from the GUI gets its own worktree and branch, and works there', async () => {
  const { parent, dir } = tmpRepo({ commit: true });
  const { by, factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const s = (await call(app, '/api/sessions', { name: 'deneb' })).json;
    assert.equal(s.name, 'deneb', 'a free name the screen picked is kept');
    assert.equal(s.branch, 'nexus/deneb-1');
    assert.equal(path.resolve(s.worktree), path.resolve(parent, '.nexus-wt', 'deneb-1'));
    assert.ok(fs.existsSync(path.join(s.worktree, 'README.md')));
    assert.equal(path.resolve(by.get(s.id).hooks.repo), path.resolve(s.worktree), 'the session works in its worktree');
    assert.equal(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: s.worktree, encoding: 'utf8' }).trim(), 'nexus/deneb-1');
    assert.equal((await call(app, '/api/sessions', { name: 'Bad Name' })).status, 400);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a deep link serves the app, and urlFor carries the token', async () => {
  const { parent, dir } = tmpRepo();
  const app = await startServer({ repo: dir, provider: fakes().factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    assert.equal((await call(app, '/s/abc.def')).status, 200);
    assert.match(app.urlFor('vega'), new RegExp(`^http://127\\.0\\.0\\.1:${app.port}/s/vega\\?t=`));
    const info = (await call(app, '/api/server')).json;
    assert.equal(info.nexus, true);
    assert.equal(info.pid, process.pid);
    assert.equal(info.home, app.home);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('star names follow the handoff, then the ledger order', () => {
  assert.deepEqual([...LOCAL_STARS], SESSIONS.map((s) => s.name));
  assert.deepEqual([...LEDGER_STARS], [...STARS]);
  assert.equal(nextName([]), 'vega');
  assert.equal(nextName(['vega', 'sirius']), 'deneb');
  assert.equal(nextName(LOCAL_STARS), 'polaris');
  assert.equal(nextName(LEDGER_STARS), 'vega-2');
  assert.deepEqual(heldNames([{ star: 'vega', state: 'ended' }, { star: 'sirius', state: 'parked' }], ['deneb']), ['sirius', 'deneb']);
  const p = placeFor(path.resolve('/x/repo'), 'vega', 2);
  assert.equal(p.branch, 'nexus/vega-2');
  assert.equal(p.worktree, path.join(path.resolve('/x'), '.nexus-wt', 'vega-2'));
});

test('the gh login is asked once, and an existing NEXUS_GH_LOGIN wins', async () => {
  let n = 0;
  const once = ghLoginOnce(async () => { n += 1; return 'me'; }, {});
  assert.equal(await once(), 'me');
  assert.equal(await once(), 'me');
  assert.equal(n, 1);
  assert.equal(await ghLoginOnce(async () => { throw new Error('never'); }, { NEXUS_GH_LOGIN: 'set' })(), 'set');
  assert.equal(await ghLoginOnce(async () => { throw new Error('gh broke'); }, {})(), '', 'gh failing is an empty login, not a throw');
});

test('withHosted folds the running sessions into the list', () => {
  const list = [{ id: 'led1', claude: 'c-1', name: 'vega', kind: 'terminal', state: 'fallen', steer: 'hook', linked: false, live: false, beat: '2026-01-01', git: { branch: '', worktree: '' }, sources: ['ledger'] }];
  const out = withHosted(list, [
    { id: 'led1', claude: null, name: 'vega', place: { worktree: '/w/vega-1', branch: 'nexus/vega-1' }, listed: true, pause: { state: 'run' } },
    { id: 'new1', claude: null, name: 'sirius', place: {}, listed: true, pause: { state: 'paused' }, at: '2026-01-02' },
    { id: 'home', claude: null, name: '', place: {}, listed: false, pause: { state: 'run' } },
  ], 'repo');
  const by = Object.fromEntries(out.map((s) => [s.id, s]));
  assert.equal(by.led1.kind, 'local');
  assert.equal(by.led1.state, 'live', 'a hosted session is never fallen');
  assert.equal(by.led1.git.worktree, '/w/vega-1');
  assert.equal(by.new1.state, 'paused');
  assert.equal(by.new1.repo, 'repo');
  assert.ok(!by.home, 'the home session shows once it has run');
  assert.equal(list[0].kind, 'terminal', 'the input is not changed');
});

test('each hosted session keeps its own tug log, fed by its own stream; a steer through it logs a tug', async () => {
  const { parent, dir } = tmpRepo();
  const { by, factory } = fakes();
  const app = await startServer({ repo: dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '' });
  try {
    const a = (await call(app, '/api/sessions', { worktree: false })).json;
    const b = (await call(app, '/api/sessions', { worktree: false })).json;
    const pa = by.get(a.id);
    await call(app, '/api/send', { text: 'start', session: a.id });
    pa.hooks.onMessage({ type: 'system', session_id: 'claude-a' });
    assert.equal((await call(app, `/api/sessions/${a.id}/steer`, { text: 'also the docs' })).status, 200);
    assert.deepEqual(pa.sent, ['start', 'also the docs'], 'the steer reaches its own session');
    let tugs = (await call(app, `/api/sessions/${a.id}`)).json.tugs;
    assert.equal(tugs.length, 1);
    assert.equal(tugs[0].text, 'also the docs');
    assert.equal(tugs[0].state, 'sent');
    assert.equal(tugs[0].session.id, a.id);
    assert.deepEqual((await call(app, `/api/sessions/${b.id}`)).json.tugs, [], 'another session draws none of them');
    pa.hooks.onMessage({ type: 'result', session_id: 'claude-a' });
    pa.hooks.onMessage({ type: 'assistant', session_id: 'claude-a', message: { content: [] } });
    tugs = (await call(app, `/api/sessions/${a.id}`)).json.tugs;
    assert.equal(tugs[0].state, 'seen', 'taken at the next turn, from its own stream');
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
