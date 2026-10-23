// Plan answers go back to the session that asked (spec 53, A1): the answer store and its routes (kept, reloaded,
// dropped when the plan drops or rewords its question), the defaults a question names ("Default if unanswered:" and
// the rest), Batch-answer filling only what is unanswered, where a spec's Continue goes, and the Continue itself:
// one message with every answer to that session, never one per answer, never the home session. Stub providers only.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startServer } from '../server/server.mjs';
import { applyAnswers, markSentIn, pruneAnswers, readStoreAt, textHash, PLAN_ANSWERS_FILE } from '../server/plan-answers.mjs';
import { answersPrompt, questionsIn } from '../server/repo.mjs';
import { batchEligible, fromDurable, recommendedDefault, restOfSentence } from '../src/screens/headsdown-inbox/inboxModel.js';
import {
  continueBody, continueChoices, continueLabel, continueTarget, keptDone, namesSpec, NEW_SESSION, sendable, steerable,
} from '../src/screens/headsdown-inbox/planAnswers.js';
import { removeTree } from './helpers/tmp.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const ISSUE_81 = 'Which platform comes first? Default if unanswered: a cross-platform phone app first (background audio and lock-screen controls matter most there), with the web for development.';
const SPEC = [
  '# 60 — Listen anywhere',
  '',
  '## Open questions',
  '',
  `- ${ISSUE_81}`,
  '- Which store? **Default if unanswered:** SQLite on the device. Sync later.',
  '- What do we call it?',
  '',
].join('\n');

// ---- the store, pure ---------------------------------------------------------

test('the store: an answer keeps its question\'s hash; a reworded or dropped question loses its answer; sent is marked', () => {
  const qs = [{ id: 'plan/60-x.md:5', text: 'Which store?' }, { id: 'plan/60-x.md:6', text: 'Name?' }];
  let { store, skipped } = applyAnswers({}, { 'plan/60-x.md:5': { answer: ' SQLite ', how: 'default' }, 'plan/60-x.md:9': { answer: 'x' }, 'plan/60-x.md:6': { answer: 'nexus', how: 'weird' } }, qs, { at: 1 });
  assert.deepEqual(skipped, ['plan/60-x.md:9'], 'a question the plan does not list is not kept');
  assert.deepEqual(store['plan/60-x.md:5'], { answer: 'SQLite', how: 'default', hash: textHash('Which store?'), at: 1 });
  assert.equal(store['plan/60-x.md:6'].how, 'answered');
  assert.equal(textHash('Which  store?\n'), textHash('Which store?'), 'whitespace does not count');
  store = markSentIn(store, ['plan/60-x.md:5'], 'sess1', 2);
  assert.equal(store['plan/60-x.md:5'].sent, 2);
  assert.equal(store['plan/60-x.md:5'].to, 'sess1');
  // A changed answer goes again: its sent mark clears.
  assert.equal(applyAnswers(store, { 'plan/60-x.md:5': { answer: 'Postgres' } }, qs).store['plan/60-x.md:5'].sent, undefined);
  assert.deepEqual(Object.keys(pruneAnswers(store, [{ id: 'plan/60-x.md:5', text: 'Which store, now?' }, qs[1]])), ['plan/60-x.md:6'], 'reworded: dropped');
  assert.deepEqual(Object.keys(pruneAnswers(store, [qs[0]])), ['plan/60-x.md:5'], 'gone from the plan: dropped');
  assert.deepEqual(applyAnswers(store, { 'plan/60-x.md:6': null }, qs).store['plan/60-x.md:6'], undefined, 'null clears');
});

// ---- the defaults a question names ---------------------------------------------

test('the detector reads every phrasing, bold or not, and takes the rest of that sentence with its parentheticals', () => {
  assert.equal(recommendedDefault(ISSUE_81), 'a cross-platform phone app first (background audio and lock-screen controls matter most there), with the web for development', 'the exact #81 text');
  assert.equal(recommendedDefault('Which? **Default if unanswered:** the web (fast to ship). Then phones.'), 'the web (fast to ship)');
  assert.equal(recommendedDefault('Which? **Default if unanswered**: the web. Then phones.'), 'the web');
  assert.equal(recommendedDefault('Which? _Default:_ keep it, e.g. the old one. More.'), 'keep it, e.g. the old one');
  assert.equal(recommendedDefault('Port? Defaults to 4000 (the usual one). Later.'), '4000 (the usual one)');
  assert.equal(recommendedDefault('Port? It **defaults to** 4000.'), '4000');
  assert.equal(recommendedDefault('Monday (default), Friday or Sunday?'), 'Monday');
  assert.equal(recommendedDefault('Keep it? Recommendation: keep it. Others disagree.'), 'keep it');
  assert.equal(recommendedDefault('Keep it? **Recommendation**: keep it.'), 'keep it');
  assert.equal(recommendedDefault('Run nightly or hourly (recommended)?'), 'hourly');
  assert.equal(recommendedDefault('Does the default branch stay main?'), null, '"default" as a word is not one');
  assert.equal(recommendedDefault('Should it default to main?'), null, '"default to" in a question is not one');
  assert.equal(restOfSentence('a (b. c) d. e'), 'a (b. c) d', 'a period inside parentheses does not end it');
});

test('Batch-answer with defaults fills only the unanswered plan questions that name one', () => {
  const items = fromDurable(questionsIn(SPEC, 'plan/60-listen.md'));
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.hasDefault), [true, true, false]);
  // The first one is answered (kept): batch takes only the second.
  const kept = keptDone(items, { [items[0].raw.id]: { answer: 'the web', how: 'answered', hash: 'x' } });
  const open = items.filter((x) => !kept[x.id]);
  assert.deepEqual(batchEligible(open).map((i) => i.opts[0]), ['SQLite on the device']);
});

// ---- where a Continue goes -------------------------------------------------------

const row = (o) => ({ id: o.id, name: o.name || o.id, live: true, state: 'live', beat: '2026-10-22T10:00:00.000Z', ...o });

test('the target: the live session that names the spec, else the most recent live one, else a new session', () => {
  const group = { n: '60', file: 'plan/60-listen.md' };
  const older = row({ id: 'a', name: 'vega', hosted: true, beat: '2026-10-22T09:00:00.000Z', lastPrompt: '/plot a listening app' , last: { kind: 'text', text: 'Wrote plan/60-listen.md with three open questions.' } });
  const newer = row({ id: 'b', name: 'sirius', hosted: true, beat: '2026-10-22T11:00:00.000Z', lastPrompt: '/next' });
  const terminal = row({ id: 'c', name: 'deneb', linked: false, beat: '2026-10-22T12:00:00.000Z', lastPrompt: 'spec 60' });
  assert.deepEqual(continueTarget(group, [newer, older, terminal]), { kind: 'session', id: 'a', name: 'vega', why: 'asked' }, '(a) its last message names the spec file');
  assert.equal(continueTarget(group, [row({ id: 'd', linked: true, chunk: { id: '60.1', step: 'build' } }), newer]).id, 'd', '(a) its ledger chunk is the spec\'s');
  assert.equal(continueTarget(group, [row({ id: 'e', hosted: true, lastPrompt: 'answer spec 60 for me' })]).why, 'asked', '(a) its last prompt names the spec number');
  assert.deepEqual(continueTarget(group, [older.lastPrompt && { ...older, last: null, lastPrompt: '/plot' }, newer]), { kind: 'session', id: 'b', name: 'sirius', why: 'recent' }, '(b) the most recent live one');
  assert.equal(continueTarget(group, [terminal]).kind, 'new', 'an unlinked terminal session cannot be reached: (c)');
  assert.deepEqual(continueTarget(group, []), NEW_SESSION, '(c) a new session');
  assert.equal(continueTarget(group, [row({ id: 'f', hosted: true, ended: true })]).kind, 'new', 'an ended session is not live');
  assert.ok(!namesSpec(row({ id: 'g', lastPrompt: 'port 600 and 6.0' }), group), 'another number is not the spec');
  assert.ok(namesSpec(row({ id: 'h', lastPrompt: '/next 60.2' }), group), 'a chunk of it');
  assert.ok(!steerable(row({ id: 'i', state: 'fallen', linked: true })), 'a fallen terminal session is not live');
  assert.deepEqual(continueChoices([older, newer, terminal]).map((c) => c.id), ['b', 'a', 'new'], 'the picker: reachable ones, newest first, then a new one');
});

test('the bar: "Send N answers to <target> and continue", only kept and unsent ones, one body for them all', async () => {
  const items = fromDurable(questionsIn(SPEC, 'plan/60-listen.md'));
  const done = {
    [items[0].id]: { a: 'the web', how: 'answered', kept: true },
    [items[1].id]: { a: 'SQLite on the device', how: 'default', kept: true },
    [items[2].id]: { a: 'old', how: 'answered', kept: true, sent: true },
  };
  const list = sendable(items, done);
  assert.equal(list.length, 2);
  assert.equal(continueLabel(2, { kind: 'session', name: 'vega' }), 'Send 2 answers to vega and continue');
  assert.equal(continueLabel(1, NEW_SESSION), 'Send 1 answer to a new session and continue');
  const body = continueBody(list, done, { kind: 'session', id: 'a', name: 'vega' });
  assert.equal(body.session, 'a');
  assert.deepEqual(body.answers.map((a) => [a.file, a.line, a.answer]), [['plan/60-listen.md', 5, 'the web'], ['plan/60-listen.md', 6, 'SQLite on the device']]);
  assert.equal(continueBody(list, done, NEW_SESSION).session, 'new');

  const { ContinueBar } = await import('../src/screens/headsdown-inbox/ContinueBar.jsx');
  const html = renderToStaticMarkup(createElement(ContinueBar, { count: 2, target: { kind: 'session', id: 'a', name: 'vega' }, asked: true, choices: [], onPick() {}, onSend() {} }));
  assert.match(html, /class="pans-bar"/);
  assert.match(html, />Send 2 answers to vega and continue</);
  assert.match(html, /vega asked these/);
  assert.match(html, />send to…</);
  const none = renderToStaticMarkup(createElement(ContinueBar, { count: 0, target: NEW_SESSION, choices: [], onPick() {}, onSend() {} }));
  assert.match(none, /<button[^>]*disabled=""[^>]*>Send 0 answers to a new session and continue/, 'disabled at 0');
});

test('the prompt to the session that asked: every answer, then continue where it left off', () => {
  const rows = [{ file: 'plan/60-x.md', line: 5, text: 'Which?', answer: 'web' }, { file: 'plan/60-x.md', line: 6, text: 'Store?', answer: 'SQLite' }];
  const p = answersPrompt(rows, true, { resume: true });
  assert.match(p, /^Your open questions are answered \(2 answers/);
  assert.match(p, /continue where you left off/);
  assert.match(p, /plan\/60-x\.md:5[\s\S]*answer: web[\s\S]*plan\/60-x\.md:6[\s\S]*answer: SQLite/);
  assert.ok(answersPrompt(rows, true).startsWith('/oversight'), 'the other form still runs /oversight');
});

// ---- the server ----------------------------------------------------------------

function tmpRepo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plan-answers-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'plan', '60-listen.md'), SPEC);
  fs.mkdirSync(path.join(parent, 'claude-home'));
  return { parent, dir, home: path.join(parent, 'claude-home') };
}

function call(app, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token };
    if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` });
    const r = http.request({ host: '127.0.0.1', port: app.port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* none */ } resolve({ status: res.statusCode, json }); });
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function withApp(fn) {
  const t = tmpRepo();
  const by = new Map();
  const factory = (hooks) => {
    const p = { kind: 'fake', sent: [], hooks, send(text) { this.sent.push(text); }, async interrupt() {}, async stop() {}, async fresh() {} };
    by.set(hooks.session, p);
    return p;
  };
  const app = await startServer({ repo: t.dir, provider: factory, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home });
  try {
    await fn({ ...t, by, app });
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
}

test('plan-answers routes: kept, read back after a reload, dropped once the plan drops or rewords the question', async () => {
  await withApp(async ({ dir, app }) => {
    const ids = questionsIn(SPEC, 'plan/60-listen.md').map((q) => q.id);
    assert.deepEqual((await call(app, 'GET', '/api/plan-answers')).json, { answers: {} });
    const put = await call(app, 'PUT', '/api/plan-answers', { answers: { [ids[0]]: { answer: 'the web', how: 'answered' }, [ids[1]]: { answer: 'SQLite on the device', how: 'default' }, 'plan/nope.md:1': { answer: 'x' } } });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json.skipped, ['plan/nope.md:1']);
    assert.ok(fs.existsSync(path.join(dir, PLAN_ANSWERS_FILE)), 'kept on disk under .nexus/');
    // A reload (a fresh read): still answered, not sent.
    const got = (await call(app, 'GET', '/api/plan-answers')).json.answers;
    assert.deepEqual(Object.keys(got).sort(), [ids[0], ids[1]].sort());
    assert.equal(got[ids[0]].answer, 'the web');
    assert.equal(got[ids[1]].how, 'default');
    assert.ok(!got[ids[0]].sent);
    assert.equal((await call(app, 'POST', '/api/plan-answers', { answers: [] })).status, 400);
    // The second question reworded, the first gone (settled): both answers drop.
    fs.writeFileSync(path.join(dir, 'plan', '60-listen.md'), SPEC.replace(`- ${ISSUE_81}`, `- Settled: ${ISSUE_81}`).replace('Which store?', 'Which store, really?'));
    assert.deepEqual((await call(app, 'GET', '/api/plan-answers')).json.answers, {});
    assert.deepEqual(readStoreAt(dir), {}, 'pruned on disk too');
  });
});

test('plan-answers routes: a secret request is never kept', async () => {
  await withApp(async ({ dir, app }) => {
    fs.writeFileSync(path.join(dir, 'plan', 'AUDIT.md'), '# Audit\n\n- [ ] [needs-user-call] secret request 07.1: set VERCEL_TOKEN (deploys)\n');
    const r = await call(app, 'PUT', '/api/plan-answers', { answers: { 'plan/AUDIT.md:3': { answer: 'PASTED_VALUE' } } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.skipped, ['plan/AUDIT.md:3']);
    assert.ok(!JSON.stringify(readStoreAt(dir)).includes('PASTED_VALUE'));
  });
});

test('Continue: one message with every answer to the session that asked, none to the home session; then marked sent', async () => {
  await withApp(async ({ app, by }) => {
    const qs = questionsIn(SPEC, 'plan/60-listen.md');
    await call(app, 'PUT', '/api/plan-answers', { answers: { [qs[0].id]: { answer: 'the web', how: 'answered' }, [qs[1].id]: { answer: 'SQLite on the device', how: 'default' } } });
    const s = (await call(app, 'POST', '/api/sessions', { worktree: false })).json;
    const asker = by.get(s.id);
    const homes = [...by.entries()].filter(([id]) => id !== s.id).map(([, p]) => p);
    const before = asker.sent.length;
    const homeBefore = homes.reduce((t, p) => t + p.sent.length, 0);
    const answers = qs.slice(0, 2).map((q, i) => ({ file: q.file, line: q.line, text: q.text, answer: ['the web', 'SQLite on the device'][i] }));
    const r = await call(app, 'POST', '/api/oversight/answer', { answers, session: s.id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(asker.sent.length - before, 1, 'one message, not one per answer');
    const msg = String(asker.sent.at(-1));
    assert.match(msg, /continue where you left off/);
    assert.match(msg, /answer: the web[\s\S]*answer: SQLite on the device/);
    assert.equal(homes.reduce((t, p) => t + p.sent.length, 0), homeBefore, 'nothing to the hidden home session');
    const kept = (await call(app, 'GET', '/api/plan-answers')).json.answers;
    assert.ok(kept[qs[0].id].sent && kept[qs[1].id].sent, 'marked sent, kept until the plan drops them');
    assert.equal(kept[qs[0].id].to, s.id);
  });
});

test('Continue with no live session: a new one starts, running /oversight with them all', async () => {
  await withApp(async ({ app, by }) => {
    const [q] = questionsIn(SPEC, 'plan/60-listen.md');
    await call(app, 'PUT', '/api/plan-answers', { answers: { [q.id]: { answer: 'the web' } } });
    const known = new Set(by.keys());
    const r = await call(app, 'POST', '/api/oversight/answer', { answers: [{ file: q.file, line: q.line, text: q.text, answer: 'the web' }], session: 'new' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.session && !known.has(r.json.session), 'a new session');
    // What it was sent goes once its provider starts.
    const until = Date.now() + 10000;
    while (!(by.get(r.json.session)?.sent.length) && Date.now() < until) await new Promise((ok) => setTimeout(ok, 50));
    const fresh = by.get(r.json.session);
    assert.ok(fresh, 'its provider started');
    assert.equal(fresh.sent.length, 1);
    assert.ok(String(fresh.sent[0]).startsWith('/oversight'));
    assert.match(String(fresh.sent[0]), /answer: the web/);
    assert.ok((await call(app, 'GET', '/api/plan-answers')).json.answers[q.id].sent);
  });
});
