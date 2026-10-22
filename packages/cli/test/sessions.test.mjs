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
import { claudeSlug, dropParked, mergeSessions, parkedAnswer, parkedItem, promptText, samePlace, sessionActivity, transcriptActivity, withHosted } from '../server/sessions.mjs';

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
    assert.equal(await hookFor(root, A, 'UserPromptSubmit'), null);

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
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
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
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('an answer to a parked session waits for the session that resumes it, and says so', async () => {
  const { repo, home, root } = fixture();
  const D = 'dddd4444-0000-4000-8000-000000000004';
  const file = path.join(root, '.nexus', 'sessions', `${D}.json`);
  fs.writeFileSync(file, JSON.stringify({ id: D, star: 'deneb', state: 'parked', train: 't1', beat: new Date(Date.now() - 3600e3).toISOString(), parked: [{ q: 'Use sqlite?', default: 'yes' }] }));
  const app = await startServer({ repo, pollRuns: false, dist: NO_DIST, claudeHome: home, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} } });
  const call = (m, p, b) => req(app.port, app.token, m, p, b);
  try {
    const r = await call('POST', '/api/sessions/deneb/parked', { index: 0, q: 'Use sqlite?', action: 'change', answer: 'no, postgres' });
    assert.equal(r.status, 200);
    assert.equal(r.data.waits, 'resume', 'not reported as delivered: deneb has no turn to join');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).parked, []);
    assert.equal((await call('POST', `/api/sessions/${D}/link`, { on: true })).status, 200);
    const tug = await call('POST', `/api/sessions/${D}/steer`, { text: 'and keep the old flag', kind: 'answer' });
    assert.equal(tug.data.waits, 'resume');
    // B resumes deneb (reboot-resume: ledger.mjs take): the answer and the tug reach B, and only B.
    const { main } = await import(`${pathToFileURL(path.join(root, 'scripts', 'ledger.mjs')).href}?t=${Date.now()}`);
    assert.equal(main(['take', 'deneb'], { env: { CLAUDE_CODE_SESSION_ID: B }, root, out() {}, err() {} }), 0);
    assert.equal(await hookFor(root, A), null);
    const out = await hookFor(root, B);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /Change to: no, postgres/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /keep the old flag/);
  } finally {
    await app.close();
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

// ---- spec 47 A10: sessions are honest --------------------------------------------------------------------------

const at = (m) => new Date(NOW - m * 60000).toISOString();
const asst = (blocks, stop = null, extra = {}) => ({ type: 'assistant', timestamp: at(1), cwd: '/w/vega-1', gitBranch: 'nexus/vega-1', message: { content: blocks, stop_reason: stop }, ...extra });
const user = (content, extra = {}) => ({ type: 'user', timestamp: at(1), message: { content }, ...extra });

test('a session file says idle once its turn ended, working while a tool or a prompt waits', () => {
  const ended = sessionActivity([
    user('<command-name>/plot</command-name>\n<command-args>peek</command-args>'),
    asst([{ type: 'tool_use', name: 'Bash', input: { command: 'node scripts/plan/order.mjs' } }], 'tool_use'),
    user([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]),
    asst([{ type: 'text', text: '**Peek:** the plan has 3 ready chunks.\nMore below.' }], 'end_turn'),
    { type: 'system', subtype: 'turn_duration', durationMs: 900 },
    { type: 'cost-state', totalCostUSD: 1 },
  ]);
  assert.equal(ended.turn, 'idle');
  assert.deepEqual(ended.last, { kind: 'text', text: '**Peek:** the plan has 3 ready chunks.', at: at(1) });
  assert.equal(ended.lastPrompt, '/plot peek');
  assert.equal(ended.branch, 'nexus/vega-1', 'the branch comes from the last line that has one, not the very last line');

  const tool = sessionActivity([user('build it'), asst([{ type: 'text', text: 'On it.' }, { type: 'tool_use', name: 'Read', input: { file_path: 'src/a.js' } }], 'tool_use')]);
  assert.equal(tool.turn, 'working');
  assert.deepEqual(tool.last, { kind: 'tool', tool: 'Read', arg: 'src/a.js', at: at(1) });
  assert.equal(tool.lastPrompt, 'build it');

  assert.equal(sessionActivity([asst([{ type: 'tool_use', name: 'Bash', input: {} }], 'tool_use'), user([{ type: 'tool_result', content: 'x' }])]).turn, 'working');
  assert.equal(sessionActivity([asst([{ type: 'text', text: 'hi' }], 'end_turn'), user('[Request interrupted by user]')]).turn, 'idle');
  // A subagent's lines never move the main thread's turn or last word.
  const side = sessionActivity([asst([{ type: 'text', text: 'Main done.' }], 'end_turn'), asst([{ type: 'tool_use', name: 'Grep', input: { pattern: 'x' } }], 'tool_use', { isSidechain: true })]);
  assert.equal(side.turn, 'idle');
  assert.equal(side.last.text, 'Main done.');
  assert.deepEqual(sessionActivity([]), { turn: null, last: null, lastPrompt: '', cwd: '', branch: '' });
  assert.equal(promptText('<local-command-stdout>x</local-command-stdout>'), '');
});

test('a hosted session reads idle from its own state, its last word from its stream', () => {
  const tx = [
    { kind: 'user', text: '/plot peek', at: NOW - 5000 },
    { kind: 'tool', name: 'Bash', summary: 'node scripts/plan/order.mjs', agent: 'main', at: NOW - 4000 },
    { kind: 'tool', name: 'Grep', summary: 'deep', agent: 'toolu_sub', at: NOW - 3500 },
    { kind: 'text', text: 'Done: nothing to plot.', agent: 'main', at: NOW - 3000 },
  ];
  const idle = transcriptActivity(tx, { busy: false, held: 0 });
  assert.equal(idle.turn, 'idle');
  assert.deepEqual(idle.last, { kind: 'text', text: 'Done: nothing to plot.', at: new Date(NOW - 3000).toISOString() });
  assert.equal(idle.lastPrompt, '/plot peek');
  assert.equal(transcriptActivity(tx, { busy: true }).turn, 'working');
  assert.equal(transcriptActivity([], { held: 1 }).turn, 'working', 'a prompt held for a paused session is work queued');
  assert.deepEqual(transcriptActivity(tx.slice(0, 3), {}).last, { kind: 'tool', tool: 'Bash', arg: 'node scripts/plan/order.mjs', at: new Date(NOW - 4000).toISOString() });
});

test('one session is one row: its ledger, its session file and the server that runs it', () => {
  const C = 'cccc4444-0000-4000-8000-000000000004';
  const beat = at(1);
  // The ledger is keyed by the claims id the server gave it; the session file by its Claude Code id.
  const ledgers = [{ id: '1a2b3c4d', star: 'vega', state: 'live', beat, claims: '1a2b3c4d', worktree: '/w/.nexus-wt/vega-1', branch: 'nexus/vega-1', chunk: '47.11' }];
  const claude = [{ id: C, cwd: '/w/.nexus-wt/vega-1', branch: 'nexus/vega-1', at: beat, turn: 'idle', last: { kind: 'text', text: 'Done.' }, lastPrompt: '/plot peek' }];
  const merged = mergeSessions({ ledgers, claude, gui: ['1a2b3c4d', C], now: NOW });
  assert.equal(merged.length, 1, 'joined by where it works');
  assert.equal(merged[0].claimsSession, '1a2b3c4d');
  assert.equal(merged[0].last.text, 'Done.');
  // Even when the merge by place can't tell (a file from somewhere else), the server's own pair joins them.
  const apart = mergeSessions({ ledgers, claude: [{ ...claude[0], cwd: '/elsewhere', branch: 'main' }], gui: ['1a2b3c4d', C], now: NOW });
  assert.equal(apart.length, 2);
  const one = withHosted(apart, [{ id: '1a2b3c4d', claude: C, name: 'vega', place: { worktree: '/w/.nexus-wt/vega-1', branch: 'nexus/vega-1' }, listed: true, pause: { state: 'run' }, activity: { turn: 'idle', last: null, lastPrompt: '' } }], 'repo');
  assert.equal(one.length, 1);
  assert.equal(one[0].id, '1a2b3c4d', 'the ledger id stays: the cockpit and the claims know it');
  assert.equal(one[0].claude, C);
  assert.equal(one[0].name, 'vega');
  assert.equal(one[0].turn, 'idle');
  assert.equal(one[0].last.text, 'Done.', 'the file\'s last word stands in when the stream has none');
  assert.equal(one[0].git.branch, 'nexus/vega-1');
  assert.deepEqual(one[0].sources.sort(), ['claude', 'ledger', 'server']);
  // A trunk branch alone never joins two sessions.
  assert.equal(samePlace({ branch: 'main' }, { branch: 'main', cwd: '/r' }), false);
  assert.equal(samePlace({ branch: 'nexus/rigel-2' }, { branch: 'nexus/rigel-2', cwd: '/x' }), true);
});


test('a ledger taken by /reboot-resume is one tile with the session that runs it, even on main', () => {
  const E = 'e05dfd1c-0000-4000-8000-000000000005';
  const old = 'c5b0f488-0000-4000-8000-000000000006';
  const file = { id: E, cwd: '/r', branch: 'main', at: at(1), turn: 'working', last: { kind: 'tool', tool: 'Agent', arg: 'Build 60.10' } };
  const taken = { id: old, star: 'sirius', state: 'resuming', beat: at(40), claude: old, claims: 'c5b0f488', branch: 'main', chunk: '60.10', step: 'building', runner: 'e05dfd1c', runnerSince: at(2) };
  const one = mergeSessions({ ledgers: [taken], claude: [file], now: NOW });
  assert.equal(one.length, 1, 'the takeover and its ledger are one tile');
  assert.equal(one[0].id, old);
  assert.equal(one[0].name, 'sirius');
  assert.deepEqual(one[0].chunk, { id: '60.10', step: 'building' });
  assert.equal(one[0].claude, E, 'steering reaches the runner, not the session that stopped');
  assert.equal(one[0].state, 'live');
  assert.equal(one[0].live, true);
  assert.equal(one[0].held, true);
  assert.equal(one[0].runner, 'e05dfd1c');
  assert.equal(one[0].last.arg, 'Build 60.10', 'the runner\'s live activity');
  assert.deepEqual(one[0].sources.sort(), ['claude', 'ledger']);
  // After `done` the ledger reads resumed: still the runner's tile while its file is live, gone once it is not.
  const done = { ...taken, state: 'resumed', beat: at(1) };
  assert.equal(mergeSessions({ ledgers: [done], claude: [file], now: NOW }).length, 1);
  assert.equal(mergeSessions({ ledgers: [done], claude: [file], now: NOW })[0].state, 'live');
  assert.equal(mergeSessions({ ledgers: [done], claude: [], now: NOW }).length, 0);
  // Its runner's beats made it live again: the same one tile.
  const beating = mergeSessions({ ledgers: [{ ...taken, state: 'live', beat: at(1) }], claude: [file], now: NOW });
  assert.equal(beating.length, 1);
  assert.equal(beating[0].state, 'live');
  // A runner named by a whole NEXUS_SESSION id matches whole; another session's file stays its own tile.
  assert.equal(mergeSessions({ ledgers: [{ ...taken, runner: E }], claude: [file], now: NOW }).length, 1);
  assert.equal(mergeSessions({ ledgers: [{ ...taken, runner: 'ffff0000' }], claude: [file], now: NOW }).length, 2);
  assert.equal(mergeSessions({ ledgers: [{ ...taken, runner: undefined }], claude: [file], now: NOW }).length, 2, 'no runner, on main: still split');
});

test('a hosted session keeps its star and branch once it idles past its file and its ledger', () => {
  // Idle past the stale window: no session file; its ledger ended. The server still runs it.
  const place = { worktree: '/w/.nexus-wt/sirius-1', branch: 'nexus/sirius-1' };
  const activity = { turn: 'idle', last: { kind: 'text', text: 'All done.' }, lastPrompt: '/plot peek' };
  const out = withHosted([], [{ id: '1245bca0', claude: 'dddd', name: 'sirius', place, listed: true, pause: { state: 'run' }, activity }], 'repo');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'sirius');
  assert.equal(out[0].git.branch, 'nexus/sirius-1');
  assert.equal(out[0].turn, 'idle');
  assert.equal(out[0].lastPrompt, '/plot peek');
  // A ledger row with no branch of its own takes the server's.
  const row = { id: '1245bca0', claude: '1245bca0', name: 'sirius', state: 'fallen', git: { branch: '', worktree: '' }, sources: ['ledger'] };
  const led = withHosted([row], [{ id: '1245bca0', claude: 'dddd', name: 'sirius', place: { worktree: '/w/s', branch: 'nexus/sirius-1' }, listed: true, pause: { state: 'run' } }], 'repo');
  assert.equal(led[0].git.branch, 'nexus/sirius-1');
  assert.equal(led[0].state, 'live');
});
