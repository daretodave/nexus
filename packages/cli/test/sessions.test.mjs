// Live local sessions and steering a linked one (spec 41 A1): the list merges the ledgers with Claude Code's session
// files, a tug or an answer reaches a linked terminal session through an owner line addressed to it (and its steer
// hook hands it to that session only), a GUI-owned session takes it on the SDK stream, and an answered parked question
// leaves the ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../server/server.mjs';
import { claudeSlug, dropParked, mergeSessions, parkedAnswer, parkedItem } from '../server/sessions.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const A = 'aaaa1111-0000-4000-8000-000000000001';
const B = 'bbbb2222-0000-4000-8000-000000000002';
const G = 'gggg3333-0000-4000-8000-000000000003';
const NOW = Date.parse('2026-10-21T12:00:00Z');

test('Claude Code names a project folder by its path, every other character a dash', () => {
  const dir = path.resolve('/work/my.repo_x');
  assert.equal(claudeSlug(dir), dir.replace(/[^A-Za-z0-9]/g, '-'));
  assert.doesNotMatch(claudeSlug(dir), /[^A-Za-z0-9-]/);
});

test('the list merges ledgers with session files, keeps only live ones, and marks the GUI\'s own', () => {
  const beat = new Date(NOW - 60000).toISOString();
  const stale = new Date(NOW - 60 * 60000).toISOString();
  const list = mergeSessions({
    ledgers: [
      { id: A, star: 'vega', state: 'live', beat, chunk: '41.1', step: 'build', parked: ['which?', { q: 'done', state: 'approved' }] },
      { id: 'old', star: 'sirius', state: 'ended', beat },
      { id: 'quiet', star: 'polaris', state: 'live', beat: stale },
      { id: 'nexus-1', star: 'rigel', state: 'live', beat: stale, claude: B },
    ],
    claude: [{ id: B, cwd: '/r', branch: 'main', at: beat }, { id: G, cwd: '/r', at: beat }],
    gui: G,
    linked: new Set([A]),
    now: NOW,
  });
  const by = Object.fromEntries(list.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ['aaaa1111-0000-4000-8000-000000000001', 'gggg3333-0000-4000-8000-000000000003', 'nexus-1', 'quiet']);
  assert.equal(by[A].name, 'vega');
  assert.equal(by[A].kind, 'terminal');
  assert.equal(by[A].linked, true);
  assert.equal(by[A].parked, 1, 'only pending parked questions count');
  assert.deepEqual(by[A].chunk, { id: '41.1', step: 'build' });
  assert.equal(by.quiet.state, 'fallen');
  assert.equal(by['nexus-1'].state, 'live', 'a stale ledger whose Claude session still writes is live');
  assert.equal(by['nexus-1'].claude, B);
  assert.equal(by[G].kind, 'local');
  assert.equal(by[G].steer, 'sdk');
  assert.equal(by[G].linked, true);
});

test('a parked question is read in any shape and leaves the list by index, checked', () => {
  assert.deepEqual(parkedItem('which?'), { q: 'which?', alts: [], state: 'pending' });
  assert.deepEqual(parkedItem({ question: 'q', options: [{ label: 'b' }], default: 'a' }).alts, ['a', 'b']);
  const l = { parked: ['one', { q: 'two', alts: ['x', 'y'] }] };
  assert.deepEqual(dropParked(l, 1).ledger.parked, ['one']);
  assert.match(dropParked(l, 5).error, /no such/);
  assert.match(dropParked(l, 0, 'two').error, /changed/);
  assert.match(parkedAnswer(parkedItem({ q: 'two', alts: ['x', 'y'] }), { action: 'change', pick: 1 }), /Change to: y/);
  assert.match(parkedAnswer(parkedItem({ q: 'two', alts: ['x', 'y'] }), { action: 'approve' }), /Keep the default you took \(x\)/);
});

// ---- the server, end to end ------------------------------------------------------

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

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-steer-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.mkdirSync(path.join(repo, 'scripts'));
  for (const f of ['announce.mjs', 'ledger.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, 'templates', 'scripts', f), path.join(repo, 'scripts', f));
  fs.mkdirSync(path.join(repo, '.nexus', 'sessions'), { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(repo, '.nexus', 'sessions', `${A}.json`), JSON.stringify({ id: A, star: 'vega', state: 'live', beat: now, chunk: '41.1', parked: [{ q: 'Which table?', alts: ['users', 'accounts'] }, 'Keep the old flag?'] }));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-claude-'));
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim();
  const folder = path.join(home, 'projects', claudeSlug(top));
  fs.mkdirSync(folder, { recursive: true });
  for (const id of [A, B, G]) fs.writeFileSync(path.join(folder, `${id}.jsonl`), `${JSON.stringify({ sessionId: id, cwd: top, gitBranch: 'main' })}\n`);
  return { repo, home, root: top };
}

async function hookFor(root, session, event = 'PreToolUse') {
  const { respond } = await import(pathToFileURL(path.join(KIT, 'templates', 'claude', 'hooks', 'steer.mjs')).href);
  const board = await import(`${pathToFileURL(path.join(root, 'scripts', 'announce.mjs')).href}?t=${Date.now()}`);
  return respond({ hook_event_name: event, session_id: session, cwd: root }, { env: {}, root, board });
}

test('a tug reaches the linked terminal session only, and a GUI-owned session takes it on the SDK stream', async () => {
  const { repo, home, root } = fixture();
  const sent = [];
  let hooks = null;
  const app = await startServer({
    repo, pollRuns: false, dist: NO_DIST, claudeHome: home,
    provider: (h) => { hooks = h; return { kind: 'fake', send: (t) => sent.push(t), async interrupt() {}, async stop() {}, async fresh() {} }; },
  });
  const call = (m, p, b) => req(app.port, app.token, m, p, b);
  try {
    hooks.onMessage({ type: 'system', subtype: 'init', session_id: G });
    const list = (await call('GET', '/api/sessions')).data;
    const by = Object.fromEntries(list.map((s) => [s.id, s]));
    assert.equal(by[A].name, 'vega');
    assert.equal(by[A].kind, 'terminal');
    assert.equal(by[B].kind, 'terminal');
    assert.equal(by[G].steer, 'sdk');

    // Not linked yet: refused, nothing on the board.
    const refused = await call('POST', `/api/sessions/${A}/steer`, { text: 'check the docs' });
    assert.equal(refused.status, 409);
    assert.equal(fs.existsSync(path.join(root, '.announcements.md')), false);

    assert.equal((await call('POST', `/api/sessions/${A}/link`, { on: true })).status, 200);
    assert.equal((await call('GET', '/api/sessions')).data.find((s) => s.id === A).linked, true);
    const ok = await call('POST', `/api/sessions/${A}/steer`, { text: 'stop and\ncheck the docs' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.via, 'board');
    assert.match(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8'), new RegExp(`· owner · @${A} stop and check the docs`));

    // The steer hook: B (a live session on the same repo) gets nothing; A is interrupted with the line, once.
    assert.equal(await hookFor(root, B), null);
    const out = await hookFor(root, A);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /stop and check the docs/);
    assert.equal(await hookFor(root, A, 'PostToolUse'), null);

    // The GUI's own session: the SDK stream, the text whole, nothing posted.
    const before = fs.readFileSync(path.join(root, '.announcements.md'), 'utf8');
    const sdk = await call('POST', `/api/sessions/${G}/steer`, { text: 'line one\nline two' });
    assert.equal(sdk.data.via, 'sdk');
    assert.deepEqual(sent, ['line one\nline two']);
    assert.equal(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8'), before);

    assert.equal((await call('POST', '/api/sessions/nobody-here/steer', { text: 'x' })).status, 404);
    assert.equal((await call('GET', '/api/sessions/nobody-here')).status, 404);
  } finally {
    await app.close();
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('an answered parked question leaves the ledger and reaches its session', async () => {
  const { repo, home, root } = fixture();
  const app = await startServer({ repo, pollRuns: false, dist: NO_DIST, claudeHome: home, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} } });
  const call = (m, p, b) => req(app.port, app.token, m, p, b);
  const ledger = () => JSON.parse(fs.readFileSync(path.join(root, '.nexus', 'sessions', `${A}.json`), 'utf8'));
  try {
    const detail = (await call('GET', `/api/sessions/${A}`)).data;
    assert.deepEqual(detail.parked.map((p) => p.q), ['Which table?', 'Keep the old flag?']);
    assert.equal((await call('POST', `/api/sessions/${A}/parked`, { index: 0, q: 'Keep the old flag?', action: 'change', pick: 1 })).status, 409, 'a stale index is refused');
    const r = await call('POST', `/api/sessions/vega/parked`, { index: 0, action: 'change', pick: 1 });
    assert.equal(r.status, 200);
    assert.deepEqual(ledger().parked, ['Keep the old flag?']);
    assert.match(fs.readFileSync(path.join(root, '.announcements.md'), 'utf8'), new RegExp(`@${A} Parked question answered: "Which table\\?". Change to: accounts`));
    assert.match((await hookFor(root, A, 'UserPromptSubmit')).hookSpecificOutput.additionalContext, /Change to: accounts/);
    assert.equal(await hookFor(root, B, 'UserPromptSubmit'), null);
    // Approving the default it took tells the session nothing new; the question still leaves the list.
    assert.equal((await call('POST', `/api/sessions/${A}/parked`, { index: 0, action: 'approve' })).status, 200);
    assert.deepEqual(ledger().parked, []);
  } finally {
    await app.close();
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
