// Tug state (spec 41, A2): sent (on the board), seen (the hand-over marker), applied (the session's next reply or
// ledger beat after it), derived from fixture .nexus folders, plus the SDK stream's in-memory log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';
import { claudeSlug } from '../server/sessions.mjs';
import { createTugLog, deriveTugs, handovers, lineKey, parseBoard, replyAfter, tugOf, tugState } from '../server/tugs.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const A = 'aaaa1111-0000-4000-8000-000000000001';
const B = 'bbbb2222-0000-4000-8000-000000000002';
const G = 'gggg3333-0000-4000-8000-000000000003';
const T0 = Date.parse('2026-10-21T12:00:00Z');

const BOARD = [
  '# Announcements',
  '<!-- next 6 -->',
  `- **1** · 2026-10-21T11:50Z · owner · @${A} check the docs`,
  `- **2** · 2026-10-21T11:52Z · owner · @${B} Parked question answered: "Which table?". Change to: accounts`,
  '- **3** · 2026-10-21T11:53Z · owner · every loop reads this',
  `- **4** · 2026-10-21T11:54Z · session aaaa1111 · @${B} news, not a tug`,
  '- **5** · 2026-10-21T11:58Z · owner · @vega rebase first',
].join('\n');

function mark(root, dir, a, at) {
  const d = path.join(root, '.nexus', 'steered', dir);
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, lineKey(a));
  fs.writeFileSync(f, '');
  fs.utimesSync(f, new Date(at), new Date(at));
}

test('the board key is announce.mjs\'s own', async () => {
  const board = await import(pathToFileURL(path.join(KIT, 'templates', 'scripts', 'announce.mjs')).href);
  const lines = parseBoard(BOARD);
  assert.deepEqual(lines, board.parse(BOARD));
  for (const a of lines) assert.equal(lineKey(a), board.lineKey(a));
});

test('state: sent until handed over, seen until the session moves after it, then applied', () => {
  assert.deepEqual(tugState({}), { state: 'sent', appliedAt: null });
  assert.deepEqual(tugState({ seenAt: T0, beatAt: T0 - 1000 }), { state: 'seen', appliedAt: null }, 'a beat before the hand-over is not a move on it');
  assert.deepEqual(tugState({ seenAt: T0, beatAt: T0 + 9000, replyAt: T0 + 4000 }), { state: 'applied', appliedAt: T0 + 4000 });
  assert.deepEqual(tugState({ seenAt: T0, beatAt: T0 + 9000 }), { state: 'applied', appliedAt: T0 + 9000 });
});

test('the reply after a hand-over is the first main-thread assistant entry past it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tugs-tx-'));
  const file = path.join(dir, 't.jsonl');
  const row = (type, t, extra = {}) => JSON.stringify({ type, timestamp: new Date(t).toISOString(), ...extra });
  fs.writeFileSync(file, [row('assistant', T0 - 5000), row('user', T0 + 1000), row('assistant', T0 + 2000, { isSidechain: true }), row('assistant', T0 + 3000), row('assistant', T0 + 8000)].join('\n') + '\n');
  try {
    assert.equal(replyAfter(file, T0), T0 + 3000);
    assert.equal(replyAfter(file, T0 + 9000), null);
    assert.equal(replyAfter(path.join(dir, 'missing.jsonl'), T0), null);
    assert.equal(replyAfter(file, null), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('every owner line to one session is a tug with its path and state; lines to all and session news are not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tugs-'));
  try {
    const lines = parseBoard(BOARD);
    const at = (n) => lines.find((a) => a.n === n);
    mark(root, A, at(1), T0 + 1000); // A took line 1 ...
    mark(root, B, at(2), T0 + 2000); // ... B took line 2; line 5 (to vega) waits
    const tx = path.join(root, 'a.jsonl');
    fs.writeFileSync(tx, `${JSON.stringify({ type: 'assistant', timestamp: new Date(T0 + 4000).toISOString() })}\n`);
    const sessions = [
      { id: A, claude: A, name: 'vega', kind: 'terminal', held: true },
      { id: B, claude: B, name: 'sirius', kind: 'terminal', held: true },
    ];
    const ledgers = [{ id: B, star: 'sirius', state: 'live', beat: new Date(T0 + 1000).toISOString() }];
    const tugs = deriveTugs({ lines, handed: handovers(root), sessions, ledgers, transcripts: new Map([[A, tx]]) });
    assert.deepEqual(tugs.map((t) => [t.n, t.state]), [[5, 'sent'], [2, 'seen'], [1, 'applied']]);
    const [five, two, one] = tugs;
    assert.equal(five.session.name, 'vega', 'a star names the held ledger\'s session');
    assert.equal(five.takenBy, null);
    assert.equal(five.at, '2026-10-21T11:58:00.000Z');
    assert.equal(five.text, 'rebase first');
    assert.equal(two.kind, 'answer');
    assert.equal(two.takenBy.name, 'sirius');
    assert.equal(two.seenAt, new Date(T0 + 2000).toISOString());
    assert.equal(two.appliedAt, null, 'its ledger beat came before the hand-over');
    assert.equal(one.kind, 'tug');
    assert.equal(one.appliedAt, new Date(T0 + 4000).toISOString());
    assert.deepEqual(tugs.filter((t) => tugOf(t, sessions[0])).map((t) => t.n), [5, 1]);
    assert.deepEqual(tugs.filter((t) => tugOf(t, sessions[1])).map((t) => t.n), [2]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a tug on the SDK stream: seen when the turn that carries it starts, applied at its result', () => {
  let now = T0;
  const log = createTugLog({ now: () => now });
  log.sent('mid-turn nudge', { session: G, busy: true });
  log.onMessage({ type: 'assistant', session_id: G });
  assert.equal(log.list(G)[0].state, 'sent', 'the turn running when it was sent is not the one that reads it');
  now += 1000;
  log.onMessage({ type: 'result', session_id: G });
  assert.equal(log.list(G)[0].state, 'sent');
  now += 1000;
  log.onMessage({ type: 'system', subtype: 'init', session_id: G });
  assert.equal(log.list(G)[0].state, 'seen');
  assert.equal(log.list(G)[0].seenAt, new Date(T0 + 2000).toISOString());
  now += 1000;
  log.onMessage({ type: 'result', session_id: G });
  const [e] = log.list(G);
  assert.equal(e.state, 'applied');
  assert.equal(e.appliedAt, new Date(T0 + 3000).toISOString());
  assert.equal('wait' in e, false);
  assert.deepEqual(log.list('someone-else'), []);
  assert.equal(log.sent('   '), null);
});

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

test('GET /api/sessions/:id carries its tugs: sent, seen after the steer hook, applied after its reply', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-tugs-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.mkdirSync(path.join(repo, 'scripts'));
  for (const f of ['announce.mjs', 'ledger.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, 'templates', 'scripts', f), path.join(repo, 'scripts', f));
  fs.mkdirSync(path.join(repo, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(KIT, 'templates', 'claude', 'hooks', 'steer.mjs'), path.join(repo, '.claude', 'hooks', 'steer.mjs'));
  fs.mkdirSync(path.join(repo, '.nexus', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.nexus', 'sessions', `${A}.json`), JSON.stringify({ id: A, star: 'vega', state: 'live', beat: new Date().toISOString() }));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-claude-'));
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim();
  const folder = path.join(home, 'projects', claudeSlug(top));
  fs.mkdirSync(folder, { recursive: true });
  const tx = path.join(folder, `${A}.jsonl`);
  fs.writeFileSync(tx, `${JSON.stringify({ sessionId: A, cwd: top, gitBranch: 'main' })}\n`);
  let hooks = null;
  const app = await startServer({
    repo, pollRuns: false, dist: NO_DIST, claudeHome: home,
    provider: (h) => { hooks = h; return { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }; },
  });
  const call = (m, p, b) => req(app.port, app.token, m, p, b);
  const tugs = async (id) => (await call('GET', `/api/sessions/${id}`)).data.tugs;
  try {
    assert.deepEqual(await tugs(A), []);
    await call('POST', `/api/sessions/${A}/link`, { on: true });
    assert.equal((await call('POST', `/api/sessions/${A}/steer`, { text: 'check the docs' })).status, 200);
    let [t] = await tugs(A);
    assert.equal(t.state, 'sent');
    assert.equal(t.session.name, 'vega');
    assert.equal(t.text, 'check the docs');

    const { respond } = await import(pathToFileURL(path.join(KIT, 'templates', 'claude', 'hooks', 'steer.mjs')).href);
    const board = await import(`${pathToFileURL(path.join(top, 'scripts', 'announce.mjs')).href}?t=${Date.now()}`);
    assert.ok(respond({ hook_event_name: 'PreToolUse', session_id: A, cwd: top }, { env: {}, root: top, board }));
    [t] = await tugs(A);
    assert.equal(t.state, 'seen');
    assert.equal(t.takenBy.name, 'vega');

    fs.appendFileSync(tx, `${JSON.stringify({ type: 'assistant', timestamp: new Date(Date.parse(t.seenAt) + 1500).toISOString() })}\n`);
    [t] = await tugs(A);
    assert.equal(t.state, 'applied');

    // The GUI's own session: its tugs come from the stream log, drawn with its name.
    hooks.onMessage({ type: 'system', subtype: 'init', session_id: G });
    fs.writeFileSync(path.join(folder, `${G}.jsonl`), `${JSON.stringify({ sessionId: G, cwd: top })}\n`);
    await call('POST', `/api/sessions/${G}/steer`, { text: 'look again' });
    const [g] = await tugs(G);
    assert.equal(g.via, 'sdk');
    assert.equal(g.state, 'sent');
    hooks.onMessage({ type: 'assistant', session_id: G });
    assert.equal((await tugs(G))[0].state, 'seen');
    assert.equal((await tugs(A)).length, 1, 'a stream tug never shows on a terminal session');
  } finally {
    await app.close();
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
