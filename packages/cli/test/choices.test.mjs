// The wand (0.5.1, server/choices.mjs): the reply read leniently, the spec's own recommendation never lost and put
// first, the cache (a hit never calls the model; a changed question or Design asks again; Ask again skips it), the
// fallbacks said plainly, what is refused (a secret, an unknown id), a wand pressed while its spec drafts joining that
// call, a big spec split at ten, and a slow call answered with the row's own choices. The SDK's query() is stubbed:
// no test calls a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChoices, fallbackNote, mergeRec, parseReply, REC_WHY, REFUSED, CHOICES_FILE, openSection, buildPrompt } from '../server/choices.mjs';
import { parseRequest } from '../server/secrets.mjs';
import { questionsIn } from '../server/repo.mjs';

// ---- the reply -------------------------------------------------------------------------------

test('parseReply: a fence and prose around the JSON are fine; more than four are cut; duplicates and junk go', () => {
  const text = 'Here you go:\n```json\n{"a:1": [{"label": "Warn", "why": "Shared pitches are real."}, {"label": "warn!", "why": "dupe"}, {"label": "Block", "why": "Safer."}, {"label": "Ask the venue", "why": "x"}, {"label": "Do nothing", "why": "y"}, {"label": "Fifth", "why": "z"}], "b:2": [{"label": "Only one"}], "x:9": [{"label": "unasked"}, {"label": "too"}]}\n```\nHope that helps.';
  const r = parseReply(text, ['a:1', 'b:2', 'c:3']);
  assert.deepEqual(r.choices['a:1'].map((o) => o.label), ['Warn', 'Block', 'Ask the venue', 'Do nothing'], 'dupes dropped, four kept');
  assert.equal(r.choices['a:1'][0].why, 'Shared pitches are real.');
  assert.equal(r.errors['b:2'], 'the reply had too few choices');
  assert.ok(r.errors['c:3'], 'a missing id is an error for that id');
  assert.ok(!('x:9' in r.choices), 'an id nobody asked about is dropped');
  const junk = parseReply('I cannot help with that.', ['a:1']);
  assert.deepEqual(junk.choices, {});
  assert.equal(junk.errors['a:1'], 'the reply was not readable');
  // Labels are cleaned: quotes, pictographs and spaces; clipped to the limit.
  const long = 'x'.repeat(300);
  const c = parseReply(JSON.stringify({ q: [{ label: '  "Warn   them"  \u{1F600}', why: long }, { label: long, why: 'w' }] }), ['q']).choices.q;
  assert.equal(c[0].label, 'Warn them');
  assert.ok(c[0].why.length <= 140 && c[0].why.endsWith('...'));
  assert.ok(c[1].label.length <= 120);
});

test('mergeRec: the spec\'s own recommendation is matched or added, never lost, and goes first', () => {
  const opts = [{ label: 'Block the save', why: 'a' }, { label: 'Warn, and let the organiser confirm', why: 'b' }, { label: 'Ask the venue', why: 'c' }];
  const matched = mergeRec(opts, 'warn, and let the organiser confirm with a reason');
  assert.equal(matched[0].label, 'Warn, and let the organiser confirm', 'matched by containment, moved to the top');
  assert.equal(matched[0].rec, true);
  assert.equal(matched.filter((o) => o.rec).length, 1);
  const added = mergeRec(opts, 'Leave it to the league');
  assert.deepEqual(added[0], { label: 'Leave it to the league', why: REC_WHY, rec: true }, 'added, first');
  assert.equal(added.length, 4);
  const four = [...opts, { label: 'Fourth', why: 'd' }];
  const replaced = mergeRec(four, 'Leave it to the league');
  assert.equal(replaced.length, 4, 'a fourth gives way');
  assert.ok(!replaced.some((o) => o.label === 'Fourth'));
  assert.deepEqual(mergeRec(opts, null).map((o) => o.label), opts.map((o) => o.label), 'no rec: as given');
  // A model that marked a different option rec is corrected.
  assert.equal(mergeRec([{ label: 'A', why: '', rec: true }, { label: 'B', why: '' }], 'B').find((o) => o.rec).label, 'B');
});

test('fallback notes say what happened, in plain words', () => {
  assert.equal(fallbackNote('unavailable', '', true), "Claude isn't available here, so these are the choices the question already names.");
  assert.equal(fallbackNote('off', '', true), 'AI helpers are off in Settings, so these are the choices the question already names.');
  assert.equal(fallbackNote('failed', 'took too long', true), "Couldn't get suggestions (took too long). These are the choices the question already names.");
  assert.match(fallbackNote('failed', 'took too long', false), /and this question names none\. Write your answer\.$/);
});

// ---- the engine ------------------------------------------------------------------------------

const SPEC = (design = 'Clashes are found as fixtures are made.') => [
  '# 14 Fixture clashes',
  '',
  '## Design',
  '',
  design,
  '',
  '## Open questions',
  '',
  '- When two fixtures share a pitch, warn or block? Recommendation: warn, and let the organiser confirm.',
  '- What does the clash email say?',
  '',
].join('\n');

function tmpRepo(spec = SPEC()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-choices-'));
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), spec);
  return dir;
}

const until = async (ok, ms = 5000) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 10)); };
const idsIn = (prompt) => [...String(prompt).matchAll(/^## Question (\S+)$/gm)].map((m) => m[1]);

/** A stub query(): answers every asked id with three choices; `hold` keeps it from answering until released. */
function stub({ hold = false, fail = false } = {}) {
  const calls = [];
  let release;
  const gate = hold ? new Promise((r) => { release = r; }) : Promise.resolve();
  const query = ({ prompt, options }) => {
    calls.push({ prompt, options });
    return (async function* run() {
      await gate;
      if (fail) { yield { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' }; return; }
      const out = {};
      for (const id of idsIn(prompt)) out[id] = [{ label: `First for ${id}`, why: 'one' }, { label: 'Second', why: 'two' }, { label: 'Third', why: 'three' }];
      yield { type: 'result', subtype: 'success', result: JSON.stringify(out), total_cost_usd: 0.001 };
    })();
  };
  return { query, calls, release: () => release?.() };
}

const engine = (dir, o = {}) => createChoices({
  repo: dir,
  questions: () => questionsIn(fs.readFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), 'utf8'), 'plan/14-fixture-clashes.md'),
  isSecret: (t) => !!parseRequest(t),
  ...o,
});

test('the cache: a hit never calls the model; a changed question or Design asks again; fresh skips it', async () => {
  const dir = tmpRepo();
  try {
    const s = stub();
    const e = engine(dir, { query: s.query });
    const [q1, q2] = questionsIn(SPEC(), 'plan/14-fixture-clashes.md');
    const r = await e.ask([q1.id, q2.id]);
    assert.equal(s.calls.length, 1, 'one call for the spec');
    assert.equal(r.choices[q1.id].by, 'ai');
    assert.equal(r.choices[q1.id].options[0].rec, true, "the spec's recommendation folded in, first");
    assert.match(r.choices[q1.id].options[0].label, /^warn, and let the organiser confirm/i);
    assert.equal(r.choices[q2.id].options.length, 3);
    // The call's options: no tools, one turn, no settings, the helper model.
    const o = s.calls[0].options;
    assert.deepEqual([o.tools, o.allowedTools, o.settingSources, o.maxTurns, o.persistSession], [[], [], [], 1, false]);
    assert.match(s.calls[0].prompt, /## Open questions \(the whole section\)/);
    assert.match(s.calls[0].prompt, /Spec recommends: warn, and let the organiser confirm/);
    assert.ok(fs.existsSync(path.join(dir, CHOICES_FILE)));
    // A hit.
    await e.ask([q1.id]);
    assert.equal(s.calls.length, 1, 'a cache hit calls nothing');
    assert.equal((await e.cached()).choices[q2.id].by, 'ai', 'GET reads the cache');
    // fresh: asks again.
    await e.ask([q2.id], { fresh: true });
    assert.equal(s.calls.length, 2);
    // The Design changed: both miss.
    fs.writeFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), SPEC('Clashes are found nightly.'));
    assert.deepEqual((await e.cached()).choices, {}, 'nothing matches now');
    await e.ask([q1.id, q2.id]);
    assert.equal(s.calls.length, 3);
    // The question reworded: its id now names other words; it misses.
    fs.writeFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), SPEC('Clashes are found nightly.').replace('What does the clash email say?', 'What does the clash email say, and to whom?'));
    await e.ask([q2.id]);
    assert.equal(s.calls.length, 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fallbacks: no SDK gives the row\'s own choices with a note; none named gives none; helpers off never calls', async () => {
  const dir = tmpRepo();
  try {
    const [q1, q2] = questionsIn(SPEC(), 'plan/14-fixture-clashes.md');
    const r = await engine(dir, { query: false }).ask([q1.id, q2.id]);
    assert.equal(r.choices[q1.id].by, 'row');
    assert.deepEqual(r.choices[q1.id].options, [{ label: 'warn, and let the organiser confirm', why: REC_WHY, rec: true }]);
    assert.equal(r.choices[q1.id].note, "Claude isn't available here, so these are the choices the question already names.");
    assert.equal(r.choices[q2.id].by, 'none');
    assert.deepEqual(r.choices[q2.id].options, []);
    assert.match(r.choices[q2.id].note, /names none\. Write your answer\./);
    assert.ok(!r.errors, 'no SDK is not an error');
    const s = stub();
    const off = await engine(dir, { query: s.query, enabled: () => false }).ask([q1.id]);
    assert.equal(s.calls.length, 0, 'helpers off: the model is never asked');
    assert.equal(off.choices[q1.id].reason, 'off');
    assert.match(off.choices[q1.id].note, /^AI helpers are off in Settings/);
    assert.deepEqual(await engine(dir, { query: s.query, enabled: () => false }).cached(), { choices: {} });
    // A failed call: the row's choices and the error said.
    const bad = await engine(dir, { query: stub({ fail: true }).query }).ask([q1.id]);
    assert.equal(bad.errors[q1.id], 'it failed');
    assert.equal(bad.choices[q1.id].reason, 'failed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ids: a secret request and an unknown id are refused, never sent to the model', async () => {
  const dir = tmpRepo(`${SPEC()}- [ ] [needs-user-call] secret request 14.2: set VENUE_API_KEY (venue lookups)\n`);
  try {
    const qs = questionsIn(fs.readFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), 'utf8'), 'plan/14-fixture-clashes.md');
    const secret = qs.find((q) => parseRequest(q.text));
    assert.ok(secret, 'the fixture has a secret request');
    const s = stub();
    const r = await engine(dir, { query: s.query }).ask([secret.id, 'plan/nope.md:1', 'inbox:parked:x:0:00000000']);
    assert.equal(s.calls.length, 0);
    assert.deepEqual(r.choices, {});
    assert.deepEqual(r.errors, { [secret.id]: REFUSED, 'plan/nope.md:1': REFUSED, 'inbox:parked:x:0:00000000': REFUSED });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a wand pressed while its spec drafts joins that call; a spec past ten questions splits; a slow call falls back', async () => {
  const many = ['# 14 Fixture clashes', '', '## Design', '', 'd', '', '## Open questions', '', ...Array.from({ length: 12 }, (_, i) => `- Question number ${i + 1}?`), ''].join('\n');
  const dir = tmpRepo(many);
  try {
    const qs = questionsIn(many, 'plan/14-fixture-clashes.md');
    const s = stub({ hold: true });
    const e = engine(dir, { query: s.query });
    const spec = e.ask(qs.map((q) => q.id));
    await until(() => s.calls.length >= 2);
    assert.equal(s.calls.length, 2, 'twelve questions: two calls of at most ten');
    assert.deepEqual(s.calls.map((c) => idsIn(c.prompt).length).sort(), [10, 2]);
    const one = e.ask([qs[3].id]);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(s.calls.length, 2, 'the single wand joined the running call');
    s.release();
    const [a, b] = await Promise.all([spec, one]);
    assert.equal(Object.keys(a.choices).length, 12);
    assert.equal(b.choices[qs[3].id].by, 'ai');
    // Slow: the row's choices now, the call finishing into the cache.
    const slow = stub({ hold: true });
    const e2 = engine(dir, { query: slow.query, timeoutMs: { one: 30 } });
    const r = await e2.ask([qs[0].id], { fresh: true });
    assert.equal(r.errors[qs[0].id], 'took too long');
    assert.equal(r.choices[qs[0].id].by, 'none');
    assert.match(r.choices[qs[0].id].note, /^Couldn't get suggestions \(took too long\)/);
    slow.release();
  } finally { await new Promise((r) => setTimeout(r, 30)); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the prompt carries the spec, the question in place and the answers already kept for the spec', () => {
  const text = SPEC();
  assert.match(openSection(text), /^- When two fixtures/);
  const p = buildPrompt({ kind: 'spec', n: '14', title: 'Fixture clashes', file: 'plan/14-x.md', design: 'D', open: 'O', questions: [{ id: 'plan/14-x.md:9', text: 'Q?', around: 'ctx', rec: 'warn', kept: [{ q: 'Other?', a: 'yes' }] }] });
  assert.match(p, /^# Spec 14: Fixture clashes/);
  assert.match(p, /## Question plan\/14-x\.md:9\nQ\?/);
  assert.match(p, /Spec recommends: warn/);
  assert.match(p, /Already answered for this spec[\s\S]*- Other\? -> yes/);
  assert.match(buildPrompt({ kind: 'inbox', questions: [{ id: 'inbox:p', text: 'Q', block: '- [ ] **3.1** x', assumed: 'A' }] }), /The session assumed: A/);
});

// ---- 0.5.3: the plain restatement (#87) and the breakout (#85) ------------------------------

test('parseReply reads { plain, options } per id, and the bare list as before', () => {
  const r = parseReply(JSON.stringify({
    a: { plain: 'Whether the composer credits go in the player or only in the docs.', options: [{ label: 'Player', why: 'x' }, { label: 'Docs', why: 'y' }] },
    b: [{ label: 'One' }, { label: 'Two' }],
  }), ['a', 'b']);
  assert.equal(r.plain.a, 'Whether the composer credits go in the player or only in the docs.');
  assert.equal(r.plain.b, undefined);
  assert.deepEqual(r.choices.a.map((o) => o.label), ['Player', 'Docs']);
  assert.deepEqual(r.choices.b.map((o) => o.label), ['One', 'Two']);
});

test('a parked row\'s plain restatement is kept in the cache and served with its choices', async () => {
  const dir = tmpRepo();
  try {
    const row = { id: 'parked:l1:0:abcdef12', src: 'inbox', question: '01.13 (a) converted wording fixed, (c) AIVA/composer', options: ['as done'], chunk: '' };
    const query = ({ prompt }) => (async function* run() {
      const out = {};
      for (const id of idsIn(prompt)) out[id] = { plain: 'Approve the music-credit wording the session settled for chunk 01.13.', options: [{ label: 'Approve' }, { label: 'Reword' }] };
      yield { type: 'result', subtype: 'success', result: JSON.stringify(out) };
    })();
    const e = engine(dir, { query, inboxRows: async () => [row] });
    const r = await e.ask([`inbox:${row.id}`]);
    assert.match(r.choices[`inbox:${row.id}`].plain, /music-credit wording/);
    const again = await e.cached();
    assert.match(again.choices[`inbox:${row.id}`].plain, /music-credit wording/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the breakout answers about one question with its spec and the conversation; a refused id never reaches the model', async () => {
  const dir = tmpRepo();
  try {
    const calls = [];
    const query = ({ prompt, options }) => { calls.push({ prompt, options }); return (async function* run() { yield { type: 'result', subtype: 'success', result: 'It decides warn versus block.' }; })(); };
    const e = engine(dir, { query, inboxRows: async () => [{ id: 'tu1:0', src: 'ask', question: 'Push the branch?', options: ['Push it', 'Leave it'], why: 'so other sessions see it' }] });
    const [q1] = questionsIn(fs.readFileSync(path.join(dir, 'plan', '14-fixture-clashes.md'), 'utf8'), 'plan/14-fixture-clashes.md');
    const first = await e.explain(q1.id, []);
    assert.equal(first.reply, 'It decides warn versus block.');
    assert.match(calls[0].prompt, /Fixture clashes/);
    assert.match(calls[0].prompt, /Owner: Briefly: what is this question really asking/);
    assert.match(calls[0].options.systemPrompt, /one open question/);
    assert.deepEqual(calls[0].options.tools, []);

    await e.explain(q1.id, [{ role: 'claude', text: first.reply }, { role: 'you', text: 'What breaks if we block?' }]);
    assert.match(calls[1].prompt, /You: It decides warn versus block\.\nOwner: What breaks if we block\?/);

    // A live ask is the breakout's too (never the wand's).
    await e.explain('inbox:tu1:0', []);
    assert.match(calls[2].prompt, /asking it now/);
    assert.match(calls[2].prompt, /so other sessions see it/);
    assert.equal((await e.ask(['inbox:tu1:0'])).errors['inbox:tu1:0'], REFUSED);

    const n = calls.length;
    assert.deepEqual(await e.explain('plan/nope.md:1', []), { error: REFUSED });
    assert.deepEqual(await engine(dir, { query, enabled: () => false }).explain(q1.id, []), { error: 'AI helpers are off in Settings' });
    assert.equal(calls.length, n);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
