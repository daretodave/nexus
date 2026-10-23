// Needs you on the top bar (shared/needs.mjs): one row per session waiting on the owner, the most pressing first,
// chips for the first three and "+N" for the rest, the open cockpit's own session left off; and the paths the
// shell reads (routes.js railOf, sessionIn). Pure rules only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsFrom, needsBar, needsSay } from '../shared/needs.mjs';
import { railOf, sessionIn } from '../src/routes.js';

const T = Date.parse('2026-10-23T10:00:00Z');
const ask = (id, at, ...qs) => ({ id, at, questions: qs.map((question) => ({ question, options: [{ label: 'Yes' }] })) });

test('a question, a permission and a fallen session each make one row, the permission first', () => {
  const rows = [
    { id: 'v', name: 'vega', kind: 'local', state: 'asking', questions: { answered: 0, total: 1 } },
    { id: 's', name: 'sirius', kind: 'local', state: 'live' },
    { id: 'd', name: 'deneb', kind: 'local', state: 'fallen', fell: { tool: 'Bash', chunk: '14.1', at: new Date(T - 60000).toISOString() } },
    { id: 'a', name: 'altair', kind: 'local', state: 'live' },
  ];
  const hosted = [
    { id: 'v', asks: [ask('q1', T - 5000, 'Ties on points: goal difference or head-to-head?')], permissions: [] },
    { id: 's', asks: [], permissions: [{ id: 'p1', tool: 'Bash', title: 'npm run build', at: T - 1000 }] },
    { id: 'a', asks: [], permissions: [] },
  ];
  const out = needsFrom(rows, hosted);
  assert.deepEqual(out.map((r) => [r.name, r.what]), [['sirius', 'permission'], ['vega', 'question'], ['deneb', 'fallen']]);
  assert.equal(out[0].label, 'Allow Bash?');
  assert.equal(out[0].detail, 'npm run build');
  assert.equal(out[0].to, '/s/s');
  assert.equal(out[1].label, 'a question');
  assert.match(out[1].detail, /^Ties on points/);
  assert.equal(out[2].label, 'fell over');
  assert.equal(out[2].detail, 'Fell over at Bash in 14.1. Resume it or clear it.');
  assert.equal(out[2].to, '/?show=fallen', 'a fallen one opens the fleet where Resume and Clear are');
});

test('a session with a permission and questions shows the permission; questions across asks are counted', () => {
  const rows = [{ id: 'v', name: 'vega', state: 'asking' }, { id: 's', name: 'sirius', state: 'asking' }];
  const hosted = [
    { id: 'v', asks: [ask('q1', T, 'A?')], permissions: [{ id: 'p', tool: 'Edit', at: T }, { id: 'p2', tool: 'Bash', at: T }] },
    { id: 's', asks: [ask('q2', T, 'A?', 'B?'), ask('q3', T, 'C?')], permissions: [] },
  ];
  const out = needsFrom(rows, hosted);
  assert.equal(out.length, 2, 'one row per session');
  assert.equal(out[0].what, 'permission');
  assert.equal(out[0].label, '2 permissions');
  assert.equal(out[1].count, 3);
  assert.equal(out[1].label, '3 questions');
});

test('a session asking that this server does not run still counts its open start questions', () => {
  const out = needsFrom([{ id: 'x', name: 'sirius', state: 'asking', questions: { answered: 2, total: 6 } }], []);
  assert.equal(out[0].count, 4);
  assert.equal(out[0].label, '4 questions');
});

test('nothing waits on the owner from a working, closed, resuming, ended or observing session', () => {
  const rows = [
    { id: 'a', name: 'vega', state: 'live' },
    { id: 'b', name: 'sirius', state: 'closed' },
    { id: 'c', name: 'deneb', state: 'resuming' },
    { id: 'd', name: 'altair', state: 'fallen', ended: true },
    { id: 'e', name: 'c0ffee12', kind: 'terminal', state: 'observing' },
    null,
  ];
  assert.deepEqual(needsFrom(rows, []), []);
  assert.deepEqual(needsFrom(undefined, undefined), []);
});

test('within a kind, whoever has waited longest comes first', () => {
  const rows = [{ id: 'a', name: 'vega', state: 'asking' }, { id: 'b', name: 'sirius', state: 'asking' }];
  const hosted = [{ id: 'a', asks: [ask('1', T, 'late?')] }, { id: 'b', asks: [ask('2', T - 60000, 'early?')] }];
  assert.deepEqual(needsFrom(rows, hosted).map((r) => r.name), ['sirius', 'vega']);
});

test('the bar: three chips, the rest behind +N, the open cockpit\'s session left off', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: `s${i}`, what: i === 4 ? 'fallen' : 'question' }));
  const bar = needsBar(rows);
  assert.deepEqual(bar.chips.map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(bar.more.map((r) => r.id), ['d', 'e']);
  assert.equal(bar.total, 5);
  assert.equal(bar.urgent, true);
  const here = needsBar(rows, { here: 'a' });
  assert.deepEqual(here.chips.map((r) => r.id), ['b', 'c', 'd']);
  assert.deepEqual(here.more.map((r) => r.id), ['e']);
  assert.equal(here.total, 5, 'still counted');
  assert.deepEqual(needsBar([{ id: 'x', what: 'fallen' }]).urgent, false, 'only a fallen session: not urgent');
  assert.deepEqual(needsBar(null), { chips: [], more: [], total: 0, urgent: false });
});

test('what a screen reader hears', () => {
  assert.equal(needsSay({ name: 'vega', what: 'question', label: 'a question', detail: 'Ties?' }), 'vega asks a question. Ties?');
  assert.equal(needsSay({ name: 'sirius', what: 'permission', label: 'Allow Bash?' }), 'sirius asks: Allow Bash?');
  assert.equal(needsSay({ name: 'deneb', what: 'fallen', label: 'fell over', detail: 'Resume it.' }), 'deneb fell over. Resume it.');
});

test('the rail item a path lights, and the session a cockpit path opens', () => {
  assert.equal(railOf('/'), 'fleet');
  assert.equal(railOf('/s/abc'), 'cockpit');
  assert.equal(railOf('/board'), 'board');
  assert.equal(railOf('/heads-down'), 'heads');
  assert.equal(railOf('/inbox'), 'inbox');
  assert.equal(railOf('/vault'), 'vault');
  assert.equal(railOf('/onboarding/welcome'), 'onboarding');
  assert.equal(railOf('/nowhere'), null);
  assert.equal(sessionIn('/s/a%2Eb'), 'a.b');
  assert.equal(sessionIn('/s/abc/extra'), 'abc');
  assert.equal(sessionIn('/board'), null);
});

test('a session this server runs that the list leaves out (the home session) still shows when it asks', () => {
  const out = needsFrom([], [{ id: 'home-1234567', name: '', asks: [ask('q', T, 'Which store?')], permissions: [] }, { id: 'quiet', asks: [], permissions: [] }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'home-123');
  assert.equal(out[0].to, '/s/home-1234567');
});
