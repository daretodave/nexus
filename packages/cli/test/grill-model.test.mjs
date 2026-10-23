// Grill me's pure half (0.5.1, screens/grill/model.js and keys.js): the queue's order (specs by number, questions in
// file order, other files last, secrets out and counted), steps across spec boundaries, skips and resume (including a
// saved question that vanished), the hand-off merging every "new session" spec into one request, and a partial
// failure keeping the unsent answers kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffPlan, progress, queueOf, readGrillAt, resumeTarget, runHandoff, standing, step, grillLeft } from '../src/screens/grill/model.js';
import { keyAction } from '../src/screens/grill/keys.js';
import { fromDurable, planGroups } from '../src/screens/headsdown-inbox/inboxModel.js';

const d = (file, line, text, n, title) => ({ id: `${file}:${line}`, file, line, text, source: 'plan', ...(n ? { spec: { n, title } } : {}) });
const ROWS = [
  d('plan/14-clash.md', 96, 'Email says?', '14', 'Fixture clashes'),
  d('plan/14-clash.md', 88, 'Warn or block? Recommendation: warn.', '14', 'Fixture clashes'),
  d('plan/AUDIT.md', 41, 'Real team names?'),
  d('plan/11-share.md', 124, 'Gift name?', '11', 'Sharing'),
  d('plan/11-share.md', 119, 'Referral reward?', '11', 'Sharing'),
  { ...d('plan/pending/s.md', 5, 'secret request 15.4: set VERCEL_TOKEN in your terminal'), secret: { chunk: '15.4', names: ['VERCEL_TOKEN'], missing: ['VERCEL_TOKEN'] } },
];
const items = fromDurable(ROWS);
const groups = planGroups(items);
const id = (file, line) => `plan:${file}:${line}`;

test('the queue: specs by number, questions in file order, other files last, secrets left out and counted', () => {
  const q = queueOf(groups, {}, { all: items });
  assert.deepEqual(q.specs.map((s) => s.key), ['spec:11', 'spec:14', 'file:plan/AUDIT.md']);
  assert.deepEqual(q.ids, [id('plan/11-share.md', 119), id('plan/11-share.md', 124), id('plan/14-clash.md', 88), id('plan/14-clash.md', 96), id('plan/AUDIT.md', 41)]);
  assert.equal(q.secrets, 1);
  assert.deepEqual(queueOf(groups, {}, { specs: ['spec:14'] }).ids, [id('plan/14-clash.md', 88), id('plan/14-clash.md', 96)]);
  // Kept but not sent stays; sent leaves.
  const done = { [id('plan/11-share.md', 119)]: { kept: true, how: 'answered' }, [id('plan/11-share.md', 124)]: { kept: true, sent: true } };
  assert.deepEqual(queueOf(groups, done).specs[0].ids, [id('plan/11-share.md', 119)]);
});

test('steps: a spec boundary shows the breath between, the end shows the review; prev, jump and spec keys move', () => {
  const q = queueOf(groups, {});
  let st = { view: 'q', id: q.ids[0] };
  st = step(st, { type: 'keep' }, q);
  assert.deepEqual(st, { view: 'q', id: q.ids[1] });
  st = step(st, { type: 'skip' }, q);
  assert.deepEqual(st, { view: 'between', id: q.ids[2], from: 'spec:11' }, 'leaving spec 11');
  st = step(st, { type: 'go' }, q);
  assert.deepEqual(st, { view: 'q', id: q.ids[2] });
  assert.deepEqual(step(st, { type: 'prev' }, q), { view: 'q', id: q.ids[1] }, 'back has no screen between');
  assert.deepEqual(step(st, { type: 'nextSpec' }, q), { view: 'q', id: q.ids[4] });
  assert.deepEqual(step(st, { type: 'prevSpec' }, q), { view: 'q', id: q.ids[0] });
  assert.deepEqual(step({ view: 'q', id: q.ids[4] }, { type: 'decide' }, q), { view: 'review', id: q.ids[4] });
  assert.deepEqual(step(st, { type: 'jump', id: 'nope' }, q), st);
  assert.deepEqual(step({ view: 'q', id: q.ids[1] }, { type: 'next' }, q), { view: 'q', id: q.ids[2] }, 'arrow keys pass the breath by');
});

test('progress and standing: answered, left to the session, skipped, left', () => {
  const q = queueOf(groups, {});
  const done = { [q.ids[0]]: { kept: true, how: 'answered' }, [q.ids[1]]: { kept: true, how: 'decide' } };
  const p = progress(q, done, [q.ids[2]]);
  assert.deepEqual([p.answered, p.decided, p.skipped, p.left, p.total], [1, 1, 1, 2, 5]);
  assert.deepEqual(p.perSpec['spec:11'], { answered: 1, decided: 1, skipped: 0, left: 0, total: 2 });
  assert.equal(standing(q.ids[2], done, [q.ids[2]]), 'skipped');
  // A skipped question kept later is answered, not skipped.
  assert.equal(standing(q.ids[2], { [q.ids[2]]: { kept: true } }, [q.ids[2]]), 'kept');
});

test('resume: the saved question, else the first open one at or after its old place', () => {
  const q = queueOf(groups, {});
  assert.deepEqual(resumeTarget(q, { id: q.ids[3], i: 3 }), { id: q.ids[3], moved: false });
  const done = { [q.ids[2]]: { kept: true } };
  assert.deepEqual(resumeTarget(q, { id: 'plan:gone.md:1', i: 2 }, done), { id: q.ids[3], moved: true }, 'vanished: the next open one');
  assert.deepEqual(resumeTarget(q, { id: 'plan:gone.md:1', i: 99 }, {}), { id: q.ids[4], moved: true }, 'past the end: the last place, when open');
  assert.deepEqual(resumeTarget(q, { id: 'plan:gone.md:1', i: 99 }, { [q.ids[4]]: { kept: true } }), { id: q.ids[0], moved: true }, 'nothing open after it: the first open one');
  assert.equal(resumeTarget(queueOf([], {}), { id: 'x' }), null);
  assert.equal(readGrillAt('{"specs":["spec:11"],"id":"plan:x:1","i":2}').i, 2);
  assert.equal(readGrillAt('nope'), null);
  assert.equal(grillLeft({ specs: ['spec:14'], id: 'x' }, items.filter((i) => !i.secret)), 2);
  assert.equal(grillLeft({ id: 'x' }, items.filter((i) => !i.secret)), 5);
});

test('the hand-off: one request per target, every new-session spec in one; a failure keeps its answers', async () => {
  const q = queueOf(groups, {});
  const specs = q.specs.map((s) => ({ ...s, items: s.ids.map((i) => q.byId[i].item) }));
  const done = Object.fromEntries(q.ids.map((i) => [i, { kept: true, a: 'x', how: 'answered' }]));
  const vega = { id: 'v1', name: 'vega', live: true, hosted: true, beat: '2026-10-22T10:00:00Z', lastPrompt: '/plot plan/11-share.md' };
  const plan = handoffPlan(specs, done, [vega], { 'spec:14': { kind: 'new', id: 'new', name: 'a new session' }, 'file:plan/AUDIT.md': { kind: 'new', id: 'new', name: 'a new session' } });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].target.id, 'v1', 'the session that asked about spec 11 first');
  assert.deepEqual(plan[0].keys, ['spec:11']);
  assert.equal(plan[1].target.kind, 'new');
  assert.deepEqual(plan[1].keys, ['spec:14', 'file:plan/AUDIT.md'], 'both new-session specs share one request');
  assert.equal(plan[1].items.length, 3);
  // Nothing live: everything goes in one new session.
  assert.equal(handoffPlan(specs, done, []).length, 1);
  // Already sent answers are not sent again.
  const sent = { ...done, [q.ids[0]]: { ...done[q.ids[0]], sent: true } };
  assert.equal(handoffPlan(specs, sent, []).at(0).items.length, 4);
  // A partial failure: each request runs; the failed one says so.
  const results = await runHandoff(plan, async (g) => (g.target.kind === 'new' ? { error: 'gh is down' } : { ok: true, session: 'v1' }));
  assert.deepEqual(results.map((r) => !!r.result.ok), [true, false]);
  assert.equal(results[1].result.error, 'gh is down');
});

test('keys: single keys only outside a text field, never while composing', () => {
  assert.equal(keyAction({ key: 's' }), 'skip');
  assert.equal(keyAction({ key: 's' }, { inField: true }), null);
  assert.equal(keyAction({ key: 'Enter', ctrlKey: true }, { inField: true }), 'keep');
  assert.deepEqual(keyAction({ key: '2', altKey: true }, { inField: true }), { pick: 1 });
  assert.deepEqual(keyAction({ key: '3' }), { pick: 2 });
  assert.equal(keyAction({ key: 'W' }), 'wandSpec');
  assert.equal(keyAction({ key: 'w' }), 'wand');
  assert.equal(keyAction({ key: ']' }), 'nextSpec');
  assert.equal(keyAction({ key: 'Tab' }), null);
  assert.equal(keyAction({ key: 'Tab' }, { bare: true }), 'focus');
  assert.equal(keyAction({ key: 'Enter', ctrlKey: true, isComposing: true }), null);
  // A bare Enter is Grill me's only when nothing has focus: on a focused button it stays the button's.
  assert.equal(keyAction({ key: 'Enter' }, { bare: true }), 'enter');
  assert.equal(keyAction({ key: 'Enter' }), null);
  assert.equal(keyAction({ key: 'Enter', ctrlKey: true }), 'keep', 'Ctrl+Enter keeps from anywhere');
});
