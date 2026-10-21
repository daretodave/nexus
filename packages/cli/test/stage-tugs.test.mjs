// The stage's oversight marks (spec 41, A2): age formatting, state mapping, which tugs and questions show, and the
// tug paths from the inbox to the session. Pure: no DOM, no React.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_MS, TUG_LOOK, age, questionMarks, tugFils, tugMarks, tugStateOf } from '../src/screens/cockpit/tugs.js';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const M = 60000;

test('an age is compact: now, minutes, hours (with minutes while short), days', () => {
  assert.equal(age(ago(20e3), NOW), 'now');
  assert.equal(age(ago(4 * M), NOW), '4m');
  assert.equal(age(ago(59 * M), NOW), '59m');
  assert.equal(age(ago(72 * M), NOW), '1h 12m');
  assert.equal(age(ago(120 * M), NOW), '2h');
  assert.equal(age(ago(5 * 60 * M + 7 * M), NOW), '5h');
  assert.equal(age(ago(50 * 60 * M), NOW), '2d');
  assert.equal(age(NOW - 3 * M, NOW), '3m', 'a number is a time in ms');
  assert.equal(age(ago(-5 * M), NOW), 'now', 'a clock a little ahead never reads negative');
  assert.equal(age(null, NOW), '');
  assert.equal(age('not a time', NOW), '');
});

test('each state has its own orb and word; an unknown state reads as sent', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TUG_LOOK).map(([k, v]) => [k, [v.orb, v.word]])), { sent: ['blocked', 'sent'], seen: ['thinking', 'seen'], applied: ['done', 'applied'] });
  assert.equal(tugStateOf({ state: 'seen' }), 'seen');
  assert.equal(tugStateOf({ state: 'lost' }), 'sent');
  assert.equal(tugStateOf(null), 'sent');
});

test('the stage marks open tugs and the freshly applied ones, newest first, three at most', () => {
  const vega = { id: 'a', name: 'vega', kind: 'terminal' };
  const tugs = [
    { id: 't5', state: 'sent', at: ago(1 * M), text: 'rebase first', session: vega, kind: 'tug' },
    { id: 't4', state: 'seen', at: ago(6 * M), seenAt: ago(2 * M), text: 'Parked question answered: "Which table?". Change to: accounts', session: vega, takenBy: { name: 'sirius', kind: 'local' }, kind: 'answer' },
    { id: 't3', state: 'applied', at: ago(30 * M), seenAt: ago(25 * M), appliedAt: ago(FRESH_MS + M), text: 'old news', session: vega },
    { id: 't2', state: 'applied', at: ago(9 * M), seenAt: ago(8 * M), appliedAt: ago(20e3), text: 'check the docs', session: vega },
    { id: 't1', state: 'sent', at: ago(40 * M), text: 'a fourth', session: vega },
  ];
  const marks = tugMarks(tugs, { now: NOW });
  assert.deepEqual(marks.map((m) => [m.key, m.state, m.word, m.orb, m.age]), [
    ['t5', 'sent', 'sent', 'blocked', '1m'],
    ['t4', 'seen', 'seen', 'thinking', '6m'],
    ['t2', 'applied', 'applied', 'done', '9m'],
  ], 'applied over ten minutes ago is gone; the fourth waits its turn');
  assert.equal(marks[0].sub, '');
  assert.equal(marks[1].sub, 'seen 2m ago');
  assert.equal(marks[2].sub, 'applied just now');
  assert.equal(marks[1].kind, 'answer');
  assert.equal(marks[1].takenBy.name, 'sirius', 'the session that took it, when another than the one it was aimed at');
  assert.equal(marks[0].takenBy, null);
  assert.ok(marks[1].text.length <= 48 && marks[1].text.endsWith('…'));
  assert.deepEqual(marks[0].session, { name: 'vega', kind: 'terminal' });
  assert.deepEqual(tugMarks(undefined, { now: NOW }), []);
  // A tug with no session of its own takes the cockpit's.
  assert.equal(tugMarks([{ id: 'x', state: 'sent', at: ago(M) }], { now: NOW, session: { name: 'deneb', kind: 'local' } })[0].session.name, 'deneb');
});

test('open questions: live asks first, then the pending parked ones (newest first), each with its age and session', () => {
  const me = { name: 'altair', kind: 'local' };
  const qs = questionMarks({
    asks: [{ id: 'k1', at: NOW - 3 * M, questions: [{ question: 'Which port?' }] }],
    parked: [{ q: 'Old flag?', at: ago(50 * M) }, { q: 'Settled', at: ago(5 * M), state: 'approved' }, { q: 'Which table?', at: ago(12 * M) }],
    session: me,
    now: NOW,
  });
  assert.deepEqual(qs.map((q) => [q.word, q.age, q.text, q.session.name]), [
    ['asking', '3m', 'Which port?', 'altair'],
    ['parked', '12m', 'Which table?', 'altair'],
    ['parked', '50m', 'Old flag?', 'altair'],
  ]);
  assert.deepEqual(questionMarks({ now: NOW }), []);
});

test('each tug path runs from the inbox to the session orb, styled by its state', () => {
  const fils = tugFils([{ key: 'a', state: 'sent' }, { key: 'b', state: 'seen' }, { key: 'c', state: 'applied' }]);
  assert.deepEqual(fils.map((f) => [f.tug, f.flow, f.quiet, f.cls]), [[true, true, false, 'is-sent'], [true, false, false, 'is-seen'], [false, false, true, 'is-applied']]);
  for (const f of fils) {
    assert.equal(f.l, '0');
    assert.equal(f.t, '30%');
    assert.equal(f.w, '50%');
    assert.match(f.d, /^M0 100C.* 100 0$/, 'drawn from the inbox end toward the session, so the pulse travels to it');
    assert.match(f.h, /var\(--tray-y\)/, 'the inbox end sits at the tray, through the token');
  }
  assert.notEqual(fils[0].h, fils[1].h, 'each tug its own line');
});
