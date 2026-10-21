import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, replay, initialState, beatsFromMessage, newBeatContext, openAsks, isBeat, LANES, MAIN } from '../shared/beats.mjs';

const RUN = [
  { k: 'agent', p: 'start', id: MAIN, label: 'session' },
  { k: 'chunk', p: 'claim', id: '12.3' },
  { k: 'agent', p: 'start', id: 'a1', label: 'builder' },
  { k: 'chunk', p: 'build', id: '12.3' },
  { k: 'agent', p: 'tool', id: 'a1', tool: 'Edit' },
  { k: 'oversight', p: 'ask', id: 'q1', agent: MAIN },
  { k: 'oversight', p: 'answer', id: 'q1' },
  { k: 'oversight', p: 'tug', agent: MAIN },
  { k: 'agent', p: 'end', id: 'a1', ok: true },
  { k: 'chunk', p: 'gate', id: '12.3' },
  { k: 'loop', p: 'dispatch', id: '99', name: 'march' },
  { k: 'loop', p: 'run', id: '99' },
  { k: 'loop', p: 'conclude', id: '99', conclusion: 'success' },
  { k: 'chunk', p: 'archive', id: '12.3' },
  { k: 'agent', p: 'end', id: MAIN, ok: true },
];

test('replay is deterministic and split-invariant (refresh == watched from start)', () => {
  const full = replay(RUN);
  for (let i = 0; i <= RUN.length; i++) {
    assert.deepEqual(replay(RUN.slice(i), replay(RUN.slice(0, i))), full);
  }
  assert.deepEqual(replay(RUN), replay(RUN));
});

test('reduce does not mutate its input', () => {
  const s0 = initialState();
  const frozen = JSON.stringify(s0);
  reduce(s0, RUN[0]);
  assert.equal(JSON.stringify(s0), frozen);
});

test('final state reads as the run did', () => {
  const s = replay(RUN);
  assert.equal(s.agents[MAIN].state, 'done');
  assert.equal(s.agents.a1.state, 'done');
  assert.equal(s.agents.a1.tools, 1);
  assert.equal(s.agents.a1.parent, MAIN);
  assert.equal(s.chunks['12.3'].stage, 'archive');
  assert.equal(s.current, null);
  assert.equal(s.loops['99'].conclusion, 'success');
  assert.equal(s.tugs, 1);
  assert.equal(openAsks(s).length, 0);
  assert.equal(s.seq, RUN.length);
});

test('an open ask parks its agent in waiting', () => {
  const s = replay(RUN.slice(0, 6));
  assert.equal(openAsks(s).length, 1);
  assert.equal(s.agents[MAIN].state, 'waiting');
  assert.equal(replay(RUN.slice(0, 7)).agents[MAIN].state, 'running');
});

test('unknown beats are ignored and do not advance seq', () => {
  const s = replay([{ k: 'nope', p: 'x' }, { k: 'agent', p: 'dance' }, null]);
  assert.deepEqual(s, initialState());
  assert.equal(isBeat({ k: 'chunk', p: 'gate', id: '1' }), true);
});

test('child agents cycle through LANES slots; main is slot 0', () => {
  const beats = [{ k: 'agent', p: 'start', id: MAIN }];
  for (let i = 0; i < LANES + 2; i++) beats.push({ k: 'agent', p: 'start', id: `c${i}` });
  const s = replay(beats);
  assert.equal(s.agents[MAIN].slot, 0);
  assert.deepEqual(Array.from({ length: LANES + 2 }, (_, i) => s.agents[`c${i}`].slot), [1, 2, 3, 4, 5, 1, 2]);
});

test('beatsFromMessage: subagent spawn, nested tool, result, chunk heuristics', () => {
  const ctx = newBeatContext();
  const b = (m) => beatsFromMessage(m, ctx);
  const use = (id, name, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input }] } });
  assert.deepEqual(b({ type: 'system', subtype: 'init', session_id: 's' }), [{ k: 'agent', p: 'start', id: MAIN, label: 'session' }]);
  assert.deepEqual(b(use('t0', 'Bash', { command: 'node scripts/claims.mjs claim 12.3' })), [
    { k: 'agent', p: 'tool', id: MAIN, tool: 'Bash' },
    { k: 'chunk', p: 'claim', id: '12.3' },
  ]);
  assert.deepEqual(b(use('tA', 'Agent', { description: 'build 12.3' })), [
    { k: 'agent', p: 'start', id: 'tA', parent: MAIN, label: 'build 12.3' },
    { k: 'chunk', p: 'build', id: '12.3' },
  ]);
  // a task_started for an already-drawn spawn is not a second start
  assert.deepEqual(b({ type: 'system', subtype: 'task_started', tool_use_id: 'tA', description: 'x' }), []);
  assert.deepEqual(b(use('t1', 'Edit', { file_path: 'a.js' }, 'tA')), [{ k: 'agent', p: 'tool', id: 'tA', tool: 'Edit' }]);
  assert.deepEqual(b({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'tA' }] } }), [{ k: 'agent', p: 'end', id: 'tA', ok: true }]);
  assert.deepEqual(b(use('t2', 'Bash', { command: 'node scripts/verify.mjs' })), [
    { k: 'agent', p: 'tool', id: MAIN, tool: 'Bash' },
    { k: 'chunk', p: 'gate', id: '12.3' },
  ]);
  assert.deepEqual(b(use('t3', 'Write', { file_path: 'plan/pending/12.3.md' })), [
    { k: 'agent', p: 'tool', id: MAIN, tool: 'Write' },
    { k: 'chunk', p: 'archive', id: '12.3' },
  ]);
  assert.deepEqual(b({ type: 'result', is_error: false }), [{ k: 'agent', p: 'end', id: MAIN, ok: true }]);
});

test('a failed subagent reads failed after replay', () => {
  const ctx = newBeatContext();
  const msgs = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'x', name: 'Task', input: { description: 'scan' } }] } },
    { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true }] } },
    { type: 'result', is_error: false },
  ];
  const s = replay(msgs.flatMap((m) => beatsFromMessage(m, ctx)));
  assert.equal(s.agents.x.state, 'failed');
  assert.equal(s.agents[MAIN].state, 'done');
});

// ---- the workflow junction and chunk times (41.7) ----------------------------------

test('a Workflow call is a junction node its agents hang from, ended by its result', () => {
  const ctx = newBeatContext();
  const wf = beatsFromMessage({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'W1', name: 'Workflow', input: { script: '.claude/workflows/review.js' } }] } }, ctx);
  assert.deepEqual(wf, [{ k: 'agent', p: 'start', id: 'W1', parent: MAIN, label: 'review', junction: true }]);
  const kid = beatsFromMessage({ type: 'assistant', parent_tool_use_id: 'W1', message: { content: [{ type: 'tool_use', id: 'K1', name: 'Agent', input: { description: 'lint' } }] } }, ctx);
  assert.equal(kid[0].parent, 'W1');
  const end = beatsFromMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'W1' }] } }, ctx);
  assert.deepEqual(end, [{ k: 'agent', p: 'end', id: 'W1', ok: true }]);
  const s = replay([...wf, ...kid]);
  assert.equal(s.agents.W1.junction, true);
  assert.equal(s.agents.K1.parent, 'W1');
  const named = beatsFromMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'W2', name: 'Workflow', input: { name: 'audit' } }] } }, newBeatContext());
  assert.equal(named[0].label, 'audit');
});

test('stamped chunk beats keep the first claim and the close; unstamped ones keep none', () => {
  const s = replay([
    { k: 'chunk', p: 'claim', id: '7.1', at: 100 },
    { k: 'chunk', p: 'claim', id: '7.1', at: 150 },
    { k: 'chunk', p: 'build', id: '7.1', at: 200 },
    { k: 'chunk', p: 'archive', id: '7.1', at: 900 },
    { k: 'chunk', p: 'claim', id: '7.2' },
  ]);
  assert.equal(s.chunks['7.1'].claimedAt, 100);
  assert.equal(s.chunks['7.1'].closedAt, 900);
  assert.equal(s.chunks['7.2'].claimedAt, undefined);
});
