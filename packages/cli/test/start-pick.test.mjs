// Start heads-down asks first: infinite (/loop /next) or a spec (/heads-down <spec>), and a choice a running session
// already works on names that session instead of starting another. Pure rules only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INFINITE, startChoices, startPrompt, workingOn } from '../src/screens/fleet/startPick.js';
import { FOLLOW_DEFAULT, followLabel, followOf, followPrompt, parseFollow, serializeFollow, startLabel } from '../src/screens/fleet/follow.js';

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
  assert.deepEqual(c.find((x) => x.value === '65').running, { id: 'a', name: 'vega', follow: null });
  assert.deepEqual(c.find((x) => x.value === INFINITE).running, { id: 'b', name: 'rigel', follow: { mode: 'next', dry: 'stop' } });
  assert.equal(c.find((x) => x.value === '70').running, null, 'a fallen session is not on it');
});

test('what a session works on: its start prompt, else its chunk', () => {
  assert.equal(workingOn({ lastPrompt: '/march' }), INFINITE);
  assert.equal(workingOn({ lastPrompt: 'hello', chunk: { id: '65.9' } }), '65');
  assert.equal(workingOn({}), null);
});

test('a spec a terminal session is on is named, not opened: it can be started anyway', () => {
  const c = startChoices(PLAN, [{ id: 't', name: 'c0ffee12', kind: 'terminal', state: 'observing', chunk: { id: '65.9' } }]);
  assert.deepEqual(c.find((x) => x.value === '65').running, { id: 't', name: 'c0ffee12', terminal: true, follow: null });
});

test('start empty is offered beside the choice: no prompt, opened in its cockpit', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screens/fleet/StartPick.jsx', import.meta.url), 'utf8');
  assert.match(src, /act\('\/api\/sessions', \{\}\)/);
  assert.match(src, /navigate\(PATHS\.cockpit\(r\.data\.id\)\)/);
  assert.equal((src.match(/\{empty\}/g) || []).length, 2, 'folded and unfolded both offer it');
});

const SIX = [
  [{ mode: 'march', ideas: 'careful' }, '/loop /march careful'],
  [{ mode: 'march', ideas: 'balanced' }, '/loop /march'],
  [{ mode: 'march', ideas: 'bold' }, '/loop /march bold'],
  [{ mode: 'next', dry: 'stop' }, '/loop /next'],
  [{ mode: 'next', dry: 'expand' }, '/loop /next then expand'],
  [{ mode: 'next', dry: 'build' }, '/loop /next then build'],
];

test('each follow choice sends its exact prompt; infinite with no follow is still /loop /next', () => {
  for (const [f, prompt] of SIX) assert.equal(startPrompt(INFINITE, f), prompt);
  assert.equal(startPrompt(INFINITE), '/loop /next');
  assert.equal(startPrompt('65', { mode: 'march', ideas: 'bold' }), '/heads-down 65');
});

test('every infinite prompt reads as infinite, looped or not, with or without an interval', () => {
  for (const p of ['/loop /march', '/loop /march bold', '/loop 30m /march', '/march careful', '/loop /next then build', '/loop /next', ...SIX.map((x) => x[1])]) {
    assert.equal(workingOn({ lastPrompt: p }), INFINITE, p);
  }
  assert.equal(workingOn({ lastPrompt: '/next' }), null, 'a one-off /next is not infinite');
  assert.equal(workingOn({ lastPrompt: '/next', chunk: { id: '65.9' } }), '65');
  assert.equal(workingOn({ lastPrompt: '/marching orders' }), null);
});

test('followOf round-trips every choice through followPrompt', () => {
  for (const [f] of SIX) {
    const back = followOf(followPrompt(f));
    assert.equal(back.mode, f.mode);
    if (f.mode === 'march') assert.equal(back.ideas, f.ideas); else assert.equal(back.dry, f.dry);
  }
  assert.deepEqual(followOf('/loop 30m /march bold'), { mode: 'march', ideas: 'bold' });
});

test('the saved choice parses tolerantly and serializes stably', () => {
  for (const junk of ['', undefined, null, 'lol what', 'march sideways']) {
    const f = parseFollow(junk);
    assert.equal(f.ideas, FOLLOW_DEFAULT.ideas);
    assert.equal(f.dry, FOLLOW_DEFAULT.dry);
  }
  assert.deepEqual(parseFollow(''), { ...FOLLOW_DEFAULT });
  assert.deepEqual(parseFollow('march bold expand'), { mode: 'march', ideas: 'bold', dry: 'expand' });
  assert.equal(parseFollow('next balanced build', { owner: false }).dry, 'expand', 'a contributor never builds its own ideas');
  assert.equal(parseFollow('next balanced build').dry, 'build');
  for (const s of ['march bold expand', 'next careful build', '', 'garbage']) {
    const once = serializeFollow(parseFollow(s));
    assert.equal(serializeFollow(parseFollow(once)), once);
  }
});

test('the default is the next loop that proposes, never the wildest choice', () => {
  assert.equal(followPrompt(FOLLOW_DEFAULT), '/loop /next then expand');
  assert.notEqual(FOLLOW_DEFAULT.dry, 'build');
});

test('labels say the choice in plain words', () => {
  assert.equal(followLabel({ mode: 'march', ideas: 'bold' }), 'march, bold');
  assert.equal(followLabel({ mode: 'march', ideas: 'balanced' }), 'march');
  assert.equal(followLabel({ mode: 'next', dry: 'build' }), 'next loop, then build');
  assert.equal(followLabel({ mode: 'next', dry: 'stop' }), 'next loop');
  assert.deepEqual(SIX.map(([f]) => startLabel({ ...FOLLOW_DEFAULT, ...f })), [
    'Start march, careful', 'Start march', 'Start march, bold', 'Start the next loop', 'Start the loop, then propose', 'Start the loop, then build',
  ]);
});

test('a running march names how it runs, and the description still says what is first', () => {
  const c = startChoices(PLAN, [{ id: 'm', name: 'vega', state: 'live', lastPrompt: '/loop /march bold' }]);
  const inf = c.find((x) => x.value === INFINITE);
  assert.equal(inf.running.name, 'vega');
  assert.equal(inf.running.follow.ideas, 'bold');
  assert.match(inf.sub, /65\.9 first/);
});
