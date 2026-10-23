// An answer's words and images, from the box to the session (0.5.1): the store keeps content-named images that are on
// disk (at most six), image-only and "You decide" answers, and `decide` round-trips; the prompt keeps an answer's line
// breaks, names each image by its absolute path, asks for them to be read, and says a decided one as such; the upload
// route checks type and size and names a file by its content; the hand-off gives a new session and a session hosted
// here image blocks, and past the message cap the rest go as paths with a note. Stub providers only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { applyAnswers, textHash } from '../server/plan-answers.mjs';
import { answersPrompt, questionsIn } from '../server/repo.mjs';
import { DECIDE_TEXT, IMAGE_ONLY_TEXT } from '../shared/choices.mjs';
import { removeTree } from './helpers/tmp.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const IMG = (n) => `${String(n).repeat(16).slice(0, 16)}.png`;
const QS = [{ id: 'plan/60-x.md:5', text: 'Which store?' }, { id: 'plan/60-x.md:6', text: 'Name?' }];

// ---- the store ---------------------------------------------------------------------------------

test('the store keeps images that are there, drops bad names and missing files, and keeps at most six', () => {
  const there = new Set([IMG(1), IMG(2), ...[3, 4, 5, 6, 7, 8].map(IMG)]);
  const images = [{ file: IMG(1), name: 'mock.png', mediaType: 'image/png' }, { file: '../etc/passwd' }, { file: 'abc.png' }, { file: IMG(9), name: 'gone.png' }, ...[2, 3, 4, 5, 6, 7, 8].map((n) => ({ file: IMG(n) }))];
  const { store } = applyAnswers({}, { [QS[0].id]: { answer: 'SQLite', images } }, QS, { at: 1, imageOk: (f) => there.has(f) });
  const kept = store[QS[0].id].images;
  assert.equal(kept.length, 6, 'at most six');
  assert.equal(kept[0].file, IMG(1));
  assert.equal(kept[0].name, 'mock.png');
  assert.ok(!kept.some((k) => k.file === IMG(9)), 'a file not on disk is dropped');
  assert.ok(!kept.some((k) => /passwd|abc/.test(k.file)), 'a name that is not a content name is dropped');
  // Without imageOk nothing is taken on trust.
  assert.equal(applyAnswers({}, { [QS[0].id]: { answer: 'x', images } }, QS).store[QS[0].id].images, undefined);
});

test('an image-only answer and a "You decide" with no words are kept; decide round-trips', () => {
  const { store } = applyAnswers({}, {
    [QS[0].id]: { answer: '', images: [{ file: IMG(1) }] },
    [QS[1].id]: { answer: '', how: 'decide' },
  }, QS, { at: 2, imageOk: () => true });
  assert.equal(store[QS[0].id].answer, IMAGE_ONLY_TEXT);
  assert.equal(store[QS[1].id].answer, DECIDE_TEXT);
  assert.equal(store[QS[1].id].how, 'decide');
  assert.equal(store[QS[1].id].hash, textHash('Name?'));
  const words = applyAnswers({}, { [QS[1].id]: { answer: 'pick the cheaper one', how: 'decide' } }, QS).store[QS[1].id];
  assert.deepEqual([words.answer, words.how], ['pick the cheaper one', 'decide']);
  assert.equal(applyAnswers(store, { [QS[0].id]: { answer: '' } }, QS).store[QS[0].id], undefined, 'no words and no images clears');
});

// ---- the prompt --------------------------------------------------------------------------------

test('the prompt keeps line breaks, names images by absolute path, asks to Read them, and says a decided one', () => {
  const answers = [
    { file: 'plan/11-s.md', line: 119, text: 'Referral\nreward?', answer: 'No credit.\nJust a note.\n\nBecause P11.', images: [{ path: 'Z:/repo/.nexus/uploads/oversight/3fa1c0d2e9b8a7f6.png', name: 'login-mock.png' }] },
    { file: 'plan/11-s.md', line: 124, text: 'Name?', answer: DECIDE_TEXT, how: 'decide' },
    { file: 'plan/11-s.md', line: 128, text: 'Colours?', answer: 'club colours', how: 'decide' },
  ];
  for (const resume of [false, true]) {
    const p = answersPrompt(answers, true, { resume });
    assert.match(p, /- plan\/11-s\.md:119 -- "Referral reward\?"\n {2}answer: No credit\.\n {4}Just a note\.\n {4}\n {4}Because P11\./, 'continuation lines indent four spaces');
    assert.match(p, /\n {2}images: Z:\/repo\/\.nexus\/uploads\/oversight\/3fa1c0d2e9b8a7f6\.png \(login-mock\.png\)/);
    assert.match(p, /Some answers carry images: open each listed file with Read before you apply that answer\./);
    assert.match(p, /:124 -- "Name\?"\n {2}answer: \(left to you\) take the option you judge best, record which and why\.\n/);
    assert.doesNotMatch(p, /:124[^\n]*\n[^\n]*\n {2}Notes:/, 'no words: no notes');
    assert.match(p, /:128 -- "Colours\?"\n {2}answer: \(left to you\)[^\n]*\n {2}Notes: club colours/);
  }
  assert.match(answersPrompt(answers, true), /^\/oversight apply/);
  assert.match(answersPrompt(answers, true, { resume: true }), /continue where you left off/);
  assert.doesNotMatch(answersPrompt([{ file: 'a', line: 1, text: 'q', answer: 'a' }], true), /with Read/, 'no images: no Read line');
});

// ---- the routes --------------------------------------------------------------------------------

const SPEC = ['# 60 Listen anywhere', '', '## Open questions', '', '- Which store?', '- What do we call it?', ''].join('\n');

function tmpRepo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ans-img-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', '60-listen.md'), SPEC);
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
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
    const p = { kind: 'fake', sent: [], hooks, send(content) { this.sent.push(content); }, async interrupt() {}, async stop() {}, async fresh() {} };
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

// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const until = async (ok, ms = 10000) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50)); };

test('the upload route: a wrong type is 400, too big is 413, the same bytes name the same file', async () => {
  await withApp(async ({ dir, app }) => {
    const a = await call(app, 'POST', '/api/oversight/uploads', { name: 'dot.png', mediaType: 'image/png', data: PNG });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.match(a.json.file, /^[0-9a-f]{16}\.png$/);
    assert.ok(fs.existsSync(path.join(dir, '.nexus', 'uploads', 'oversight', a.json.file)));
    const b = await call(app, 'POST', '/api/oversight/uploads', { name: 'again.png', mediaType: 'image/png', data: PNG });
    assert.equal(b.json.file, a.json.file, 'named by its content');
    assert.equal((await call(app, 'POST', '/api/oversight/uploads', { name: 'x.svg', mediaType: 'image/svg+xml', data: PNG })).status, 400);
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64');
    assert.equal((await call(app, 'POST', '/api/oversight/uploads', { name: 'big.png', mediaType: 'image/png', data: big })).status, 413);
    // Kept with an answer only when it is there.
    const [q] = questionsIn(SPEC, 'plan/60-listen.md');
    const put = await call(app, 'PUT', '/api/plan-answers', { answers: { [q.id]: { answer: 'SQLite', images: [{ file: a.json.file, name: 'dot.png' }, { file: IMG(9) }] } } });
    assert.deepEqual(put.json.answers[q.id].images.map((i) => i.file), [a.json.file]);
  });
});

test('the hand-off: a new session gets the images as blocks in its first message, and is started from oversight', async () => {
  await withApp(async ({ app, by, dir }) => {
    const up = (await call(app, 'POST', '/api/oversight/uploads', { name: 'dot.png', mediaType: 'image/png', data: PNG })).json;
    const [q1, q2] = questionsIn(SPEC, 'plan/60-listen.md');
    const known = new Set(by.keys());
    const r = await call(app, 'POST', '/api/oversight/answer', { session: 'new', answers: [
      { file: q1.file, line: q1.line, text: q1.text, answer: 'SQLite\non the device', images: [{ file: up.file, name: 'dot.png' }] },
      { file: q2.file, line: q2.line, text: q2.text, answer: DECIDE_TEXT, how: 'decide' },
    ] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.origin, 'oversight');
    assert.ok(!known.has(r.json.session));
    await until(() => by.get(r.json.session)?.sent.length);
    const content = by.get(r.json.session).sent[0];
    assert.ok(Array.isArray(content), 'image blocks beside the text');
    assert.equal(content[0].type, 'image');
    assert.equal(content[0].source.data, PNG);
    const text = content.at(-1).text;
    assert.match(text, /^\/oversight apply/);
    assert.match(text, /answer: SQLite\n {4}on the device/);
    assert.match(text, new RegExp(`images: .*\\.nexus/uploads/oversight/${up.file} \\(dot\\.png\\)`));
    assert.match(text, /\(left to you\)/);
    // Its ledger says where it came from.
    const ledgers = fs.readdirSync(path.join(dir, '.nexus', 'sessions')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', f), 'utf8')));
    assert.ok(ledgers.some((l) => l.id === r.json.session && l.origin === 'oversight'));
  });
});

test('the hand-off to a session hosted here: blocks too; past the message cap the rest go as paths, with a note', async () => {
  await withApp(async ({ app, by, dir }) => {
    const s = (await call(app, 'POST', '/api/sessions', { worktree: false })).json;
    await until(() => by.get(s.id));
    // Five images of 4.5 MB each on disk: over 20 MB together, so the last goes as a path only.
    const updir = path.join(dir, '.nexus', 'uploads', 'oversight');
    fs.mkdirSync(updir, { recursive: true });
    const files = [1, 2, 3, 4, 5].map((n) => { const f = IMG(n); fs.writeFileSync(path.join(updir, f), Buffer.alloc(4.5 * 1024 * 1024, n)); return f; });
    const [q] = questionsIn(SPEC, 'plan/60-listen.md');
    const r = await call(app, 'POST', '/api/oversight/answer', { session: s.id, answers: [{ file: q.file, line: q.line, text: q.text, answer: 'see these', images: files.map((file) => ({ file })) }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.note, '1 image went as file paths only (over 20 MB together).');
    const content = by.get(s.id).sent.at(-1);
    assert.equal(content.filter((b) => b.type === 'image').length, 4);
    const text = content.at(-1).text;
    for (const f of files) assert.ok(text.includes(f), `every image is named by path: ${f}`);
    assert.match(text, /continue where you left off/);
  });
});
