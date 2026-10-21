// The boards' times, durations, diffstats and marks from real data (41.7, A7): the cockpit, heads-down and the
// inbox draw what the stream and the ledger carry, and an empty state when they do not. Pure models only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convoItems, liveStage, toolDur, clock } from '../src/screens/cockpit/model.js';
import { replay, MAIN } from '../shared/beats.mjs';

const AT = new Date(2026, 9, 21, 3, 9, 0).getTime();

test('a tool row carries its diffstat, its duration once its result is back, and the message its time', () => {
  const items = convoItems([
    { kind: 'user', text: 'keep merge.ts pure', at: AT - 60000 },
    { kind: 'text', id: 'm:0', agent: MAIN, text: 'Field-level merge is in.', at: AT },
    { kind: 'tool', id: 'E', agent: MAIN, name: 'Edit', summary: 'src/sync/merge.ts', diff: { add: 84, del: 12 }, at: AT },
    { kind: 'tool', id: 'T', agent: MAIN, name: 'Task', summary: 'tests', at: AT },
    { kind: 'tool', id: 'B', agent: MAIN, name: 'Bash', summary: 'npm test', at: AT },
    { kind: 'tool-done', id: 'E', agent: MAIN, ms: 1200, ok: true, at: AT + 1200 },
    { kind: 'tool-done', id: 'T', agent: MAIN, ms: 240000, ok: true, at: AT + 240000 },
  ], null);
  assert.equal(items[0].time, clock(AT - 60000));
  assert.equal(items[1].time, '03:09');
  const [edit, task, bash] = items[1].tools;
  assert.deepEqual([edit.diff, edit.ms, edit.done], [{ add: 84, del: 12 }, 1200, true]);
  assert.deepEqual([task.note, task.ms], ['delegated', 240000]);
  assert.deepEqual([bash.done, bash.ms, bash.at], [false, null, AT]);
  assert.deepEqual([toolDur(100), toolDur(1200), toolDur(42000), toolDur(240000), toolDur(null)], ['0.1s', '1.2s', '42s', '4m', '']);
});

test('a replayed transcript with no times draws no times and no durations', () => {
  const items = convoItems([{ kind: 'text', id: 'x', text: 'hi' }, { kind: 'tool', id: 'R', name: 'Read', summary: 'a' }], null);
  assert.equal(items[0].time, '');
  assert.deepEqual([items[0].tools[0].ms, items[0].tools[0].diff, items[0].tools[0].note], [null, null, '']);
});

test('a failed result marks its row failed', () => {
  const items = convoItems([{ kind: 'tool', id: 'B', name: 'Bash', summary: 'x', at: AT }, { kind: 'tool-done', id: 'B', ms: 50, ok: false }], null);
  assert.equal(items[0].tools[0].failed, true);
});

test('a Workflow call draws the junction, captioned with its agents, and they hang from it on dashed lines', () => {
  const stage = replay([
    { k: 'agent', p: 'start', id: MAIN, label: 'session' },
    { k: 'agent', p: 'start', id: 'W', parent: MAIN, label: 'review', junction: true },
    { k: 'agent', p: 'start', id: 'L', parent: 'W', label: 'lint' },
    { k: 'agent', p: 'start', id: 'Y', parent: 'W', label: 'types' },
    { k: 'agent', p: 'end', id: 'L', ok: true },
  ]);
  const v = liveStage(stage);
  const j = v.nodes.find((n) => n.key === 'W');
  assert.deepEqual([j.junction, j.label, j.tool], [true, 'review', 'workflow · 2 agents']);
  const kids = v.fils.filter((f) => f.key === 'L' || f.key === 'Y');
  assert.equal(kids.length, 2);
  assert.ok(kids.every((f) => f.dash && f.quiet));
  assert.equal(kids.find((f) => f.key === 'Y').flow, true);
  assert.equal(kids.find((f) => f.key === 'L').flow, false);
});
