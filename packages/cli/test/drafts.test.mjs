// Answers save as typed and send as given (spec 51, A1): the draft store and its routes (save, restore, a beacon's
// body, cleared once its ask is sent), a live ask answered with a partial set reaching the session whole, and the
// pure models the screens share (the saver's debounce and flush, the Send button's label and payload).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { applyDrafts, MAX_KEYS, readDraftsAt, DRAFTS_FILE } from '../server/drafts.mjs';
import { askDefault, completeAnswers, NO_ANSWER } from '../shared/times.mjs';
import { createDraftSaver } from '../src/data/drafts-model.js';
import { askSend, sendLabel, startLabel } from '../src/data/answers.js';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-drafts-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function fakeProvider() {
  return { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
}

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const QS = [
  { question: 'Which store?', header: 'Store', options: [{ label: 'Postgres (recommended)' }, { label: 'SQLite' }] },
  { question: 'Name it?', header: 'Name', options: [{ label: 'nexus' }, { label: 'hub' }] },
  { question: 'Anything else?', header: 'Else', options: [] },
];

test('applyDrafts: a text saves, empty or null clears, a bad key is skipped, the oldest go past the cap', () => {
  let s = applyDrafts({}, { a: 'one', b: 'two' }, 1);
  assert.deepEqual(s, { a: { text: 'one', at: 1 }, b: { text: 'two', at: 1 } });
  s = applyDrafts(s, { a: null, b: '  ', c: 'three', ['x'.repeat(400)]: 'long key' }, 2);
  assert.deepEqual(s, { c: { text: 'three', at: 2 } });
  let big = {};
  for (let i = 0; i < MAX_KEYS + 3; i++) big = applyDrafts(big, { [`k${i}`]: 't' }, i);
  assert.equal(Object.keys(big).length, MAX_KEYS);
  assert.ok(!big.k0 && !big.k2 && big.k3 && big[`k${MAX_KEYS + 2}`], 'the three oldest went');
});

test('drafts routes: save, restore, a beacon body, and an ask answered clears its drafts', async () => {
  let hooks;
  const repo = tmpRepo();
  const app = await startServer({ repo, provider: (h) => { hooks = h; return fakeProvider(); }, pollRuns: false, dist: NO_DIST });
  const origin = `http://127.0.0.1:${app.port}`;
  const json = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin };
  try {
    assert.deepEqual((await req(app.port, { pathname: '/api/drafts', headers: json })).data, { drafts: {} });
    const put = await req(app.port, { method: 'PUT', pathname: '/api/drafts', headers: json, body: JSON.stringify({ drafts: { 'tu_9:0': 'half a thou', 'plan:7': 'keep' } }) });
    assert.equal(put.status, 200);
    assert.equal((await req(app.port, { pathname: '/api/drafts', headers: json })).data.drafts['tu_9:0'].text, 'half a thou', 'restored');
    assert.ok(fs.existsSync(path.join(repo, DRAFTS_FILE)), 'kept on disk under .nexus/');
    // A beacon: POST, text/plain, the token in ?t= (sendBeacon sets no header but the Origin).
    const beacon = await req(app.port, { method: 'POST', pathname: `/api/drafts?t=${app.token}`, headers: { 'content-type': 'text/plain;charset=UTF-8', origin }, body: JSON.stringify({ drafts: { 'tu_9:0': 'half a thought, finished on the way out' } }) });
    assert.equal(beacon.status, 200);
    assert.equal(readDraftsAt(repo)['tu_9:0'].text, 'half a thought, finished on the way out');
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/drafts', headers: { 'content-type': 'text/plain', origin }, body: '{"drafts":{}}' })).status, 403, 'a beacon still needs the token');
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/send', headers: { 'x-nexus-token': app.token, 'content-type': 'text/plain', origin }, body: '{"text":"hi"}' })).status, 415, 'only the drafts route takes text/plain');
    assert.equal((await req(app.port, { method: 'PUT', pathname: '/api/drafts', headers: json, body: '{"drafts":[]}' })).status, 400);
    // The ask is answered: its drafts go, another's stay.
    const pending = hooks.onAsk({ id: 'tu_9', agent: 'main', questions: QS });
    assert.equal((await req(app.port, { method: 'POST', pathname: '/api/ask/tu_9', headers: json, body: JSON.stringify({ answers: { 'Which store?': 'SQLite' } }) })).status, 200);
    await pending;
    const left = (await req(app.port, { pathname: '/api/drafts', headers: json })).data.drafts;
    assert.deepEqual(Object.keys(left), ['plan:7']);
  } finally {
    await app.close();
  }
});

test('a live ask answered with a partial set reaches the session whole: the rest take their defaults', async () => {
  let hooks;
  const app = await startServer({ repo: tmpRepo(), provider: (h) => { hooks = h; return fakeProvider(); }, pollRuns: false, dist: NO_DIST });
  const json = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  try {
    const pending = hooks.onAsk({ id: 'tu_2', agent: 'main', questions: QS });
    const r = await req(app.port, { method: 'POST', pathname: '/api/ask/tu_2', headers: json, body: JSON.stringify({ answers: { 'Name it?': 'hub' } }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await pending, { 'Which store?': 'Postgres', 'Name it?': 'hub', 'Anything else?': NO_ANSWER });
    assert.ok(app.hub.transcript.some((t) => t.kind === 'system' && /^2 took their defaults: Postgres/.test(t.text)), 'the conversation says which took a default');
  } finally {
    await app.close();
  }
});

test('askDefault and completeAnswers', () => {
  assert.equal(askDefault(QS[0]), 'Postgres');
  assert.equal(askDefault(QS[1]), 'nexus');
  assert.equal(askDefault(QS[2]), null);
  assert.deepEqual(completeAnswers(QS, { 'Which store?': 'SQLite', 'Name it?': '  ' }), {
    answers: { 'Which store?': 'SQLite', 'Name it?': 'nexus', 'Anything else?': NO_ANSWER },
    taken: ['Name it?', 'Anything else?'],
  });
});

function fakeTimers() {
  let t = 0;
  const q = [];
  return {
    set: (fn, ms) => { const h = { fn, at: t + ms }; q.push(h); return h; },
    clear: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    advance(ms) { t += ms; for (const h of q.filter((x) => x.at <= t)) { this.clear(h); h.fn(); } },
    get pending() { return q.length; },
  };
}

test('the saver: debounced while typing, at once on blur, a flush beacons what is left, a sent answer clears', async () => {
  const puts = [];
  const beacons = [];
  const timers = fakeTimers();
  const states = [];
  const saver = createDraftSaver({
    put: async (patch) => { puts.push(patch); },
    beacon: (patch) => { beacons.push(patch); return true; },
    delay: 400, setTimer: timers.set, clearTimer: timers.clear,
    onState: (key, state) => states.push(`${key}=${state}`),
  });
  saver.change('a', 'h');
  saver.change('a', 'he');
  saver.change('a', 'hel');
  timers.advance(399);
  assert.equal(puts.length, 0, 'not while typing');
  timers.advance(1);
  await saver.idle();
  assert.deepEqual(puts, [{ a: 'hel' }], 'one save, the latest text');
  assert.equal(saver.state('a'), 'saved');
  saver.change('b', 'x');
  await saver.blur('b');
  assert.deepEqual(puts[1], { b: 'x' }, 'blur saves at once');
  assert.equal(timers.pending, 0, 'and drops its timer');
  saver.change('a', 'hello');
  saver.change('c', 'more');
  assert.equal(saver.flush({ beacon: true }), true);
  assert.deepEqual(beacons, [{ a: 'hello', c: 'more' }], 'leaving the page beacons every unsaved draft in one body');
  assert.equal(timers.pending, 0);
  assert.equal(saver.flush({ beacon: true }), false, 'nothing left to send');
  await saver.sent('a');
  assert.deepEqual(puts.at(-1), { a: null }, 'a sent answer clears its draft');
  assert.equal(saver.state('a'), 'sent');
  assert.ok(states.includes('a=saved') && states.includes('a=sent'));
});

test('the saver: a failed save stays pending and goes on the next flush', async () => {
  const timers = fakeTimers();
  let fail = true;
  const puts = [];
  const saver = createDraftSaver({ put: async (p) => { if (fail) throw new Error('offline'); puts.push(p); }, delay: 400, setTimer: timers.set, clearTimer: timers.clear });
  saver.change('a', 'kept');
  await saver.blur('a');
  assert.equal(saver.state('a'), 'unsaved');
  fail = false;
  await saver.flush();
  assert.deepEqual(puts, [{ a: 'kept' }]);
});

test('the Send button: how many go as given, how many take their defaults', () => {
  assert.equal(sendLabel({ total: 5, answered: 2, defaults: 3 }), 'Send 2 answers · 3 take their defaults');
  assert.equal(sendLabel({ total: 2, answered: 1, defaults: 1 }), 'Send 1 answer · 1 takes its default');
  assert.equal(sendLabel({ total: 3, answered: 3, defaults: 0 }), 'Send answers');
  assert.equal(sendLabel({ total: 3, answered: 1, defaults: 1, unanswered: 1 }), 'Send 1 answer · 1 takes its default · 1 unanswered');
  assert.equal(sendLabel({ total: 3, answered: 0, defaults: 3 }), null, 'nothing answered yet: no Send');
  assert.equal(startLabel({ total: 4, answered: 1 }), 'Start with 1 answer · 3 take their defaults');
});

test('askSend: the payload for a partial set, and what the label says of it', () => {
  const r = askSend(QS, { 'Name it?': 'hub' });
  assert.deepEqual(r.payload, { 'Name it?': 'hub' }, 'only what was answered: the server fills the rest');
  assert.deepEqual(r.answers, { 'Which store?': 'Postgres', 'Name it?': 'hub', 'Anything else?': null });
  assert.deepEqual(r.how, { 'Which store?': 'default', 'Name it?': 'answered', 'Anything else?': 'default' });
  assert.equal(r.label, 'Send 1 answer · 1 takes its default · 1 unanswered');
  assert.equal(askSend(QS, {}).label, null);
  assert.equal(askSend(QS.slice(0, 2), { 'Which store?': 'SQLite', 'Name it?': 'hub' }).label, 'Send answers');
});
