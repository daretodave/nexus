// Start heads-down asks first: infinite (/loop /next) or a spec (/heads-down <spec>), and a choice a running session
// already works on names that session instead of starting another. Pure rules only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INFINITE, startChoices, startPrompt, workingOn } from '../src/screens/fleet/startPick.js';

const PLAN = {
  next: [{ id: '65.9', spec: '65', lane: 'asap' }],
  specs: [
    { id: '65', title: 'Heads-down GUI', chunks: [{ id: '65.8', state: 'closed' }, { id: '65.9', state: 'ready' }, { id: '65.10', state: 'ready' }] },
    { id: '54', title: 'Model and effort', chunks: [{ id: '54.1', state: 'closed' }] },
    { id: '70', title: 'Unchunked', unchunked: true, chunks: [] },
  ],
};

test('a choice starts the prompt it names', () => {
  assert.equal(startPrompt(INFINITE), '/loop /next');
  assert.equal(startPrompt('65'), '/heads-down 65');
});

test('infinite comes first, then every spec with work left; a finished spec is left out', () => {
  const c = startChoices(PLAN, []);
  assert.deepEqual(c.map((x) => x.value), [INFINITE, '65', '70']);
  assert.match(c[0].sub, /65\.9 first/);
  assert.equal(c[1].sub, '2 ready chunks');
  assert.match(c[2].sub, /not chunked yet/);
  assert.ok(c.every((x) => x.running === null));
});

test('a running session on a choice is named, so a second one is not started', () => {
  const sessions = [
    { id: 'a', name: 'vega', state: 'live', lastPrompt: '/heads-down 065' },
    { id: 'b', name: 'rigel', state: 'live', lastPrompt: '/loop /next' },
    { id: 'c', name: 'deneb', state: 'fallen', lastPrompt: '/heads-down 70' },
  ];
  const c = startChoices(PLAN, sessions);
  assert.deepEqual(c.find((x) => x.value === '65').running, { id: 'a', name: 'vega' });
  assert.deepEqual(c.find((x) => x.value === INFINITE).running, { id: 'b', name: 'rigel' });
  assert.equal(c.find((x) => x.value === '70').running, null, 'a fallen session is not on it');
});

test('what a session works on: its start prompt, else its chunk', () => {
  assert.equal(workingOn({ lastPrompt: '/march' }), INFINITE);
  assert.equal(workingOn({ lastPrompt: 'hello', chunk: { id: '65.9' } }), '65');
  assert.equal(workingOn({}), null);
});
