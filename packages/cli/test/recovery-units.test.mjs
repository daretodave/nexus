// The pure rules behind recovery across a restart or an upgrade: a malformed parked question never throws, a GUI
// ledger nobody runs reads stopped (never terminal), what "ended" means now, the fleet's calm copy for stopped
// sessions (its filters unchanged), the quiet needs row, prefs read by type, the park patch, and the stale tab's
// watcher (data/health.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { ledgerStatus, mergeSessions, parkedItem, stoppedWith } from '../server/sessions.mjs';
import { fleetRows, inboxItems, isEnded, markEnded } from '../server/fleet-home.mjs';
import { asksAsParked, autoPickable, parkPatch, sweepPatch } from '../server/recovery.mjs';
import { needsBar, needsFrom } from '../shared/needs.mjs';
import { readPrefs, writePrefs } from '../server/repo.mjs';
import { claimLock, readLast, writeLast } from '../server/instance.mjs';
import { startServer } from '../server/server.mjs';
import { VERSION } from '../server/version.mjs';
import { FILTERS, counts, norm, summary, trainOf } from '../src/screens/fleet/model.js';
import { tone } from '../src/screens/fleet/alive.js';
import { createHealth, healthWords, healthNow } from '../src/data/health.js';
import { removeTree } from './helpers/tmp.mjs';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const OLD = '2026-10-23T10:00:00.000Z';
const FRESH = '2026-10-23T11:59:00.000Z';

test('a malformed parked question reads, never throws: alts as a string, an object or a number, q an object', () => {
  assert.deepEqual(parkedItem({ q: 'Ties?', alts: 'points | goals' }).alts, ['points', 'goals']);
  assert.deepEqual(parkedItem({ q: 'Ties?', alts: 'a, b' }).alts, ['a', 'b']);
  assert.deepEqual(parkedItem({ q: 'Ties?', alts: { a: 1 } }).alts, []);
  assert.deepEqual(parkedItem({ q: 'Ties?', alts: 7 }).alts, []);
  assert.deepEqual(parkedItem({ q: 'Ties?', options: [{ label: 'x' }, 'y', 3, null] }).alts, ['x', 'y', '3']);
  assert.equal(parkedItem({ q: { text: 'An object q' } }).q, 'An object q');
  assert.equal(parkedItem({ question: { question: 'nested' } }).q, 'nested');
  assert.equal(parkedItem(42).q, '42');
  assert.equal(parkedItem(null).q, '');
  assert.equal(typeof parkedItem({ q: 'x', why: { text: 'because' } }).why, 'string');
  assert.equal(parkedItem({ q: 'x', state: 5 }).state, 'pending');
  // The inbox survives one bad ledger, and a numeric star.
  const items = inboxItems({ ledgers: [{ id: 'l1', star: 9, parked: [{ q: 'ok?', alts: 'yes|no' }] }, { id: 'l2', parked: [{ q: { q: 'deep' }, alts: 3 }] }] });
  assert.equal(items.length, 2);
  assert.equal(items[0].session.name, '9');
});

test('a numeric beat is no beat: the ledger falls; a strange state is read as live', () => {
  assert.equal(ledgerStatus({ state: 'live', beat: NOW }, NOW), 'fallen');
  assert.equal(ledgerStatus({ state: 'live', beat: FRESH }, NOW), 'live');
  assert.equal(ledgerStatus({ state: 7, beat: FRESH }, NOW), 'live');
});

test('a GUI ledger this server does not run reads stopped, kind local, whatever its beat or session file says', () => {
  const base = { gui: true, star: 'vega', worktree: '/w/vega-1', branch: 'nexus/vega-1' };
  const ledgers = [
    { ...base, id: 'g1', state: 'live', beat: FRESH }, // a fresh beat: before, "Running in another terminal"
    { ...base, id: 'g2', star: 'deneb', state: 'live', beat: OLD }, // stale: before, "fell over"
    { ...base, id: 'g3', star: 'mira', state: 'parked', beat: OLD, claude: 'c3', stop: { at: OLD, by: 'server', why: 'stop', turn: 'idle', queued: [{ text: 'x' }] } },
    { id: 't1', star: 'rigel', state: 'live', beat: FRESH }, // a terminal session: unchanged
  ];
  const claude = [{ id: 'c1', cwd: '/w/vega-1', branch: 'nexus/vega-1', at: FRESH, turn: 'working', last: { kind: 'text', text: 'hi' } }];
  const rows = mergeSessions({ ledgers, claude, now: NOW });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.g1.state, 'stopped');
  assert.equal(by.g1.kind, 'local');
  assert.equal(by.g1.steer, 'pickup');
  assert.equal(by.g1.last.text, 'hi', 'its session file still gives the tile its last words');
  assert.equal(by.g1.turn, undefined, 'never "working" from a file nobody writes now');
  assert.equal(by.g1.stop.clean, false, 'no stop marker: a crash');
  assert.equal(by.g2.state, 'stopped');
  assert.deepEqual([by.g3.state, by.g3.stop.clean, by.g3.stop.turn, by.g3.stop.queued, by.g3.stop.talked], ['stopped', true, 'idle', 1, true]);
  assert.equal(by.t1.kind, 'terminal');
  // Hosted here: as before.
  const hosted = mergeSessions({ ledgers, claude: [], gui: ['g1'], now: NOW });
  assert.notEqual(hosted.find((r) => r.id === 'g1').state, 'stopped');
  // A 'resuming' one whose pick-up never finished (stale, its runner nowhere) stopped too; a fresh one does not.
  assert.equal(stoppedWith({ ...base, id: 'r1', state: 'resuming', beat: OLD, runner: 'zz' }, {}, [], NOW)?.note, 'the last pick-up did not finish');
  assert.equal(stoppedWith({ ...base, id: 'r2', state: 'resuming', beat: FRESH, runner: 'zz' }, {}, [], NOW), null);
  assert.equal(stoppedWith({ ...base, id: 'e', state: 'ended' }, {}, [], NOW), null);
});

test('ended means nothing worth keeping: no conversation, loop, chunk, question or queued message, and git known clean', () => {
  const dead = { id: 'd', name: 'vega', gui: true, state: 'stopped', sources: ['ledger'], stop: { talked: false }, git: { ahead: 0, up: 0, dirty: 0, staged: 0, claims: 0 } };
  assert.equal(isEnded(dead), true);
  assert.equal(isEnded({ ...dead, stop: { talked: true } }), false, 'a conversation');
  assert.equal(isEnded({ ...dead, stop: { queued: 1 } }), false, 'a message waiting');
  assert.equal(isEnded({ ...dead, stop: { loop: true } }), false, 'a loop');
  assert.equal(isEnded({ ...dead, chunk: { id: '3.1' } }), false, 'a chunk');
  assert.equal(isEnded({ ...dead, parked: 1 }), false, 'a question');
  assert.equal(isEnded({ ...dead, git: { ...dead.git, claims: null } }), false, 'claims unknown');
  assert.equal(isEnded({ ...dead, git: { ...dead.git, missing: true, ahead: 2 } }), false, 'a missing folder whose branch holds commits');
  assert.equal(isEnded({ ...dead, git: { ...dead.git, missing: true, branchGone: true } }), true, 'folder and branch gone: nothing on disk');
  assert.equal(markEnded([dead])[0].ended, true);
  // A stopped row holding a question asks.
  const [r] = fleetRows([{ id: 'x', name: 'a', state: 'stopped', parked: 2, stop: {} }], { ledgers: [{ id: 'x', gui: true }] });
  assert.equal(r.state, 'asking');
  assert.equal(r.questions.total, 2);
});

test('the fleet: a stopped session is on This machine, not working, idle or in terminals; the topbar counts it calmly', () => {
  const rows = [
    { id: 'a', name: 'vega', kind: 'local', state: 'live', turn: 'working' },
    { id: 'b', name: 'deneb', kind: 'local', state: 'stopped', stop: { clean: true, turn: 'working' } },
    { id: 'c', name: 'mira', kind: 'local', state: 'stopped', stop: { clean: true, turn: 'idle' } },
  ].map(norm);
  const test_ = (v) => FILTERS.find((f) => f.value === v).test;
  assert.deepEqual(rows.filter(test_('here')).map((s) => s.name), ['vega', 'deneb', 'mira']);
  assert.deepEqual(rows.filter(test_('working')).map((s) => s.name), ['vega']);
  assert.deepEqual(rows.filter(test_('idle')).map((s) => s.name), []);
  assert.deepEqual(rows.filter(test_('terminals')).map((s) => s.name), []);
  assert.deepEqual(rows.filter(test_('fallen')).map((s) => s.name), []);
  assert.equal(summary(rows), '3 sessions · 1 working · 2 waiting to pick up');
  assert.equal(tone(rows[1]), 'stopped');
  const train = trainOf(rows.slice(1), false);
  assert.equal(train.stopped, 2);
  assert.equal(train.text, 'All 2 stopped with nexus. Pick up all to carry on where they left off.');
  assert.equal(counts(rows).here, 3);
  // The filter list itself is the one 0.5.1 shipped.
  assert.deepEqual(FILTERS.map((f) => f.value), ['here', 'needs', 'working', 'idle', 'terminals', 'fallen']);
});

test('needs: stopped sessions never alarm; two or more get one quiet row', () => {
  const rows = [
    { id: 'b', name: 'deneb', state: 'stopped' },
    { id: 'c', name: 'mira', state: 'stopped' },
  ];
  const items = needsFrom(rows, []);
  assert.deepEqual(items.map((i) => [i.what, i.label, i.to]), [['stopped', 'stopped with nexus', '/?show=here']]);
  assert.equal(needsBar(items).urgent, false);
  assert.deepEqual(needsFrom(rows.slice(0, 1), []), [], 'one alone waits on its own tile');
});

test('the park patch: what a stopping server writes for each state', () => {
  const at = '2026-10-23T12:00:00.000Z';
  assert.deepEqual(parkPatch({ sent: 0, waiting: [], held: [], asks: [] }, {}, { at }), { end: true });
  const forming = parkPatch({ sent: 0, form: 'forming', waiting: [{ text: 'go', steered: false }], held: [], asks: [] }, {}, { at });
  assert.equal(forming.state, 'parked');
  assert.equal(forming.stop.turn, 'forming');
  assert.deepEqual(forming.stop.queued, [{ text: 'go', steered: false }]);
  const asking = parkPatch({ sent: 1, claude: 'c', cwd: '/w', busy: true, asks: [{ id: 'q1', questions: [{ question: 'Colour?', options: [{ label: 'blue', description: 'logo' }] }] }], waiting: [], held: [] }, { parked: [{ q: 'old', from: 'ask' }, { q: 'kept' }] }, { at, why: 'signal', version: '9.9.9' });
  assert.equal(asking.stop.turn, 'asking');
  assert.equal(asking.stop.why, 'signal');
  assert.equal(asking.claude, 'c');
  assert.deepEqual(asking.parked.map((p) => p.q), ['kept', 'Colour?'], 'an older ask is replaced, a skill\'s own parked question kept');
  assert.equal(asking.parked[1].default, 'blue');
  assert.equal(parkPatch({ sent: 2, busy: true, pause: 'paused', held: [{ text: 'later', steered: true, images: 1 }], waiting: [], asks: [] }, {}, { at }).stop.queued[0].note, '1 image not kept');
  assert.equal(asksAsParked([{ id: 'x', questions: [] }])[0].q, 'A question it asked');
  assert.equal(sweepPatch({ beat: OLD }).stop.why, 'sweep');
  assert.equal(autoPickable({ gui: true, state: 'parked', claude: 'c', stop: { by: 'server', turn: 'idle', queued: [] }, parked: [] }), true);
  assert.equal(autoPickable({ gui: true, state: 'parked', claude: 'c', stop: { by: 'server', turn: 'working', queued: [] } }), false);
  assert.equal(autoPickable({ gui: true, state: 'parked', claude: 'c', stop: { by: 'sweep', turn: 'idle' } }), false, 'a crash waits');
  assert.equal(autoPickable({ gui: true, state: 'parked', claude: 'c', stop: { by: 'server', turn: 'idle' }, parked: [{ q: 'open' }] }), false);
  assert.equal(autoPickable({ gui: true, state: 'parked', stop: { by: 'server', turn: 'idle' } }), false, 'no conversation to resume');
});

test('prefs are read by type: a string top level, a mistyped key and a future key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-prefs-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const file = path.join(dir, '.git', 'nexus-gui.json');
    fs.writeFileSync(file, '"just a string"');
    assert.equal((await readPrefs(dir)).changeFeed, true);
    assert.equal('0' in (await readPrefs(dir)), false, 'a string never spreads into keys');
    fs.writeFileSync(file, JSON.stringify({ changeFeed: 'off', model: 3, futureThing: { on: true }, aiSummaries: false }));
    const p = await readPrefs(dir);
    assert.equal(p.changeFeed, true, 'a mistyped value reads as the default, never as on by accident');
    assert.equal(p.model, '');
    assert.equal(p.aiSummaries, false);
    assert.deepEqual(p.futureThing, { on: true }, 'a newer version\'s key survives');
    assert.equal(p.pickupIdle, true);
    await writePrefs(dir, { pickupIdle: false });
    const q = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(q.pickupIdle, false);
    assert.deepEqual(q.futureThing, { on: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the last port is kept for the next launch, and one launch at a time holds the lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-last-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    assert.equal(readLast(dir), null);
    await writeLast(dir, { port: 41234, version: '0.5.2' });
    assert.equal(readLast(dir).port, 41234);
    const a = claimLock(dir);
    assert.equal(a.ok, true);
    const b = claimLock(dir, { pid: process.pid + 100000 });
    assert.equal(b.ok, false, 'a live holder keeps it');
    a.release();
    const c = claimLock(dir);
    assert.equal(c.ok, true);
    // A dead holder's lock is stale: taken over.
    fs.writeFileSync(path.join(dir, '.nexus', 'server.lock'), JSON.stringify({ pid: 999999, started: OLD }));
    assert.equal(claimLock(dir, { pid: process.pid }).ok, true);
  } finally {
    // claimLock keeps its file out of git in the background: removeTree waits out Windows' hold on the folder.
    await removeTree(dir);
  }
});

test('GET /api/hello answers without a token, and says only that it is nexus, its version and when it started; /api/server names its version', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hello-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const app = await startServer({ repo: dir, provider: { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist'), ghLogin: async () => '', beatMs: 0 });
  const get = (p, headers = {}) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: app.port, path: p, headers: { host: `127.0.0.1:${app.port}`, ...headers } }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => res({ status: r.statusCode, json: JSON.parse(d) })); }).on('error', rej);
  });
  try {
    const h = await get('/api/hello');
    assert.equal(h.status, 200);
    assert.deepEqual(Object.keys(h.json).sort(), ['nexus', 'started', 'version']);
    assert.equal(h.json.version, VERSION);
    assert.equal((await get('/api/server')).status, 403, 'everything else still needs the token');
    const s = await get('/api/server', { 'x-nexus-token': app.token });
    assert.equal(s.json.version, VERSION);
    assert.equal((await new Promise((res) => { http.get({ host: '127.0.0.1', port: app.port, path: '/api/hello', headers: { host: 'evil.example' } }, (r) => { r.resume(); res(r.statusCode); }); })), 403, 'a strange host is refused');
  } finally {
    await removeTree(dir, { stop: [() => app.close()] });
  }
});

test('the stale tab: the bar shows after the channel is down 5 s, a new launch\'s token is taken over the channel, a 403 says restarted', async () => {
  const timers = [];
  const fakeTimers = {
    setTimeout: (fn, ms) => { const t = { fn, ms, kind: 'once' }; timers.push(t); return t; },
    clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const t = { fn, ms, kind: 'every' }; timers.push(t); return t; },
    clearInterval: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  let server = { started: 'S1', version: '0.5.1', token: 'old' };
  let up = true;
  const fetchImpl = async (url, o = {}) => {
    if (!up) throw new TypeError('down');
    if (url === '/api/hello') return { ok: true, json: async () => ({ nexus: true, started: server.started, version: server.version }) };
    return { ok: o.headers?.['x-nexus-token'] === server.token };
  };
  const posted = [];
  let listener = null;
  const channel = { post: (m) => posted.push(m), listen: (fn) => { listener = fn; }, close() {} };
  let token = 'old';
  const h = createHealth({ token: () => token, adopt: (t) => { token = t; }, fetchImpl, channel, timers: fakeTimers });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(posted[0], { token: 'old', started: 'S1', version: '0.5.1' }, 'a tab announces its own token for older tabs');
  h.down();
  assert.equal(healthNow().status, 'ok', 'a blip shows nothing');
  const once = timers.find((t) => t.kind === 'once');
  assert.equal(once.ms, 5000);
  once.fn();
  assert.equal(healthNow().status, 'down');
  assert.match(healthWords(healthNow()).text, /nexus stopped\. Launch it again/);
  // An upgrade: a new server, a new token. The old token gets 403: the bar says so and asks the other tabs.
  server = { started: 'S2', version: '0.5.2', token: 'new' };
  up = true;
  await h.look();
  assert.equal(healthNow().status, 'restarted');
  assert.match(healthWords(healthNow()).text, /restarted since this tab opened/);
  assert.deepEqual(posted.at(-1), { ask: true, started: 'S2' });
  // The new launch's tab answers on the channel: this tab takes the token and says it updated.
  await listener({ token: 'new', started: 'S2', version: '0.5.2' });
  assert.equal(token, 'new');
  assert.equal(healthNow().status, 'updated');
  assert.equal(healthWords(healthNow()).action, 'reload');
  assert.match(healthWords(healthNow()).text, /updated to 0\.5\.2/);
  // A hand-over for some other server is ignored.
  await listener({ token: 'stranger', started: 'S9' });
  assert.equal(token, 'new');
  h.stop();
});
