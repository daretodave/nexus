// The one rule for terminal sessions in the cockpit's switcher (41.8, A8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switcherMenu, swDesc } from '../src/screens/cockpit/switcher.js';

// ---- the switcher rule --------------------------------------------------------

const S = [
  { id: 'v', name: 'vega', kind: 'local', phase: 'working', chunk: { id: '12.3' } },
  { id: 't', name: 'polaris', kind: 'terminal', chunk: { id: '9.1' }, linked: true },
  { id: 'd', name: 'deneb', kind: 'local', mode: 'owner', chunk: { id: '4.2' } },
  { id: 'u', name: 'orion', kind: 'terminal' },
  { id: 'o', name: 'jun', kind: 'other' },
  { id: 'a', name: 'altair', kind: 'local', state: 'fallen', chunk: { id: '14.1' } },
];

test('the switcher: local stars first, terminal sessions under a divider, never someone else\'s', () => {
  const m = switcherMenu(S, { id: 'v', name: 'vega', kind: 'local' });
  assert.deepEqual(m.stars.map((s) => s.id), ['v', 'd', 'a']);
  assert.deepEqual(m.terminals.map((s) => s.id), ['t', 'u']);
  // The button's small stars: the other local stars only, as the board draws them.
  assert.deepEqual(m.others.map((s) => s.id), ['d', 'a']);
});

test('the switcher from a terminal cockpit lists it, marked, in the terminal group', () => {
  const m = switcherMenu(S, { id: 't', name: 'polaris', kind: 'terminal' });
  assert.deepEqual(m.terminals.map((s) => s.id), ['t', 'u']);
  assert.deepEqual(m.others.map((s) => s.id), ['v', 'd', 'a']);
  const alone = switcherMenu(null, { id: 't', name: 'polaris', kind: 'terminal' });
  assert.deepEqual(alone.stars, []);
  assert.deepEqual(alone.terminals.map((s) => s.id), ['t']);
});

test('switcher rows read the chunk id, and a terminal row says linked or read-only', () => {
  assert.equal(swDesc(S[0]), 'Working · 12.3');
  assert.equal(swDesc(S[2]), 'Working · owner · 4.2');
  assert.equal(swDesc(S[5]), 'fell over in 14.1');
  assert.equal(swDesc(S[1]), 'terminal · linked · 9.1');
  assert.equal(swDesc(S[3]), 'terminal · read-only until linked');
  assert.equal(swDesc({ phase: 'start', waiting: 4, chunk: '13.4' }), 'Questions · 4 waiting');
  assert.equal(swDesc({ chunk: '13.4' }), 'Working · 13.4');
});
