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

// ---- the session detail's times (server/session-times.mjs) ---------------------------

const { sessionTimes, createStepWatch } = await import('../server/session-times.mjs');
const { phaseBudget, estimateMinutes } = await import('../shared/times.mjs');

const PLAN = { hours: { S: 1, M: 2.5, L: 5 }, specs: [{ id: '12', chunks: [{ id: '12.3', title: 'Conflict resolution', size: 'M' }, { id: '12.2', title: 'Merge view', size: 'S' }] }] };

test('the chunk in flight carries its title, size, estimate and the start the stream saw', () => {
  const t = sessionTimes({
    ledger: { id: 'L', started: '2026-10-21T01:00:00.000Z', chunk: '12.3', step: 'building', done: ['12.2'], parked: [{ q: 'tie?', at: '2026-10-21T02:30:00.000Z' }, 'bare'] },
    beats: [{ k: 'chunk', p: 'claim', id: '12.2', at: Date.parse('2026-10-21T01:05:00Z') }, { k: 'chunk', p: 'archive', id: '12.2', at: Date.parse('2026-10-21T01:50:00Z') }, { k: 'chunk', p: 'claim', id: '12.3', at: Date.parse('2026-10-21T02:00:00Z') }],
    plan: PLAN, phase: 'std',
  });
  assert.equal(t.startedAt, '2026-10-21T01:00:00.000Z');
  assert.deepEqual(t.budget, { label: '3–4h', ms: 4 * 3600000 });
  assert.deepEqual(t.chunk, { id: '12.3', step: 'building', title: 'Conflict resolution', size: 'M', estimate: 150, startedAt: '2026-10-21T02:00:00.000Z' });
  assert.deepEqual(t.closed, [{ id: '12.2', title: 'Merge view', at: '2026-10-21T01:50:00.000Z' }]);
  assert.deepEqual(t.marks.map((m) => [m.kind, m.at]), [['closed', '2026-10-21T01:50:00.000Z'], ['parked', '2026-10-21T02:30:00.000Z']]);
});

test('what no one saw stays null: no beats, no plan, no phase', () => {
  const t = sessionTimes({ ledger: { id: 'L', chunk: '9.1', done: ['9.0'] } });
  assert.deepEqual(t.chunk, { id: '9.1', step: '', title: '', size: null, estimate: null, startedAt: null });
  assert.deepEqual(t.closed, [{ id: '9.0', title: '', at: null }]);
  assert.deepEqual([t.startedAt, t.budget, t.marks], [null, null, []]);
  assert.equal(sessionTimes({}).chunk, null);
});

test('a ledger watched across reads dates a chunk change and a close at its beat; the first read dates nothing', () => {
  const w = createStepWatch();
  const first = w.observe({ id: 'L', chunk: '7.1', done: [], beat: '2026-10-21T01:00:00.000Z' });
  assert.equal(first.starts.size, 0);
  w.observe({ id: 'L', chunk: '7.1', done: [], beat: '2026-10-21T01:10:00.000Z' });
  const later = w.observe({ id: 'L', chunk: '7.2', done: ['7.1'], beat: '2026-10-21T01:40:00.000Z' });
  assert.equal(later.starts.get('7.2'), '2026-10-21T01:40:00.000Z');
  assert.equal(later.closes.get('7.1'), '2026-10-21T01:40:00.000Z');
  assert.equal(later.starts.has('7.1'), false);
  const t = sessionTimes({ ledger: { id: 'L', chunk: '7.2', done: ['7.1'] }, watched: later });
  assert.equal(t.chunk.startedAt, '2026-10-21T01:40:00.000Z');
  assert.equal(t.closed[0].at, '2026-10-21T01:40:00.000Z');
});

test('the Working budget is the Settings phase; an estimate needs both a size and the hours table', () => {
  assert.deepEqual(['short', 'std', 'night', 'bogus'].map((p) => phaseBudget(p)?.label ?? null), ['2–3h', '3–4h', 'all night', null]);
  assert.deepEqual([estimateMinutes('S', PLAN.hours), estimateMinutes('L', PLAN.hours), estimateMinutes(null, PLAN.hours), estimateMinutes('M', null)], [60, 300, null, null]);
});

test('the cockpit counts a chunk\'s elapsed time from the start the server saw', async () => {
  const { ctxLayers } = await import('../src/screens/cockpit/model.js');
  const now = Date.parse('2026-10-21T02:18:42Z');
  const rows = ctxLayers({ ledger: { chunk: { id: '12.3', title: 'Conflicts', startedAt: '2026-10-21T02:00:00Z' } }, owner: true, phase: 'working', stage: null, info: {}, sessionName: 'vega', now });
  assert.equal(rows.find((r) => r.k === 'Now').m, '18:42');
});

// ---- the tug's default deadline ---------------------------------------------------------

const { createSession } = await import('../server/session.mjs');
const { askDefaults, countdown, ASK_DEFAULT_MS } = await import('../shared/times.mjs');

test('a live question takes its recommended default when its wait runs out, and says so', async () => {
  let hooks;
  let t = 5000;
  const s = await createSession({ id: 's1', cwd: '.', now: () => t, askDefaultMs: 30, provider: (h) => { hooks = h; return { kind: 'fake', send() {}, async stop() {} }; } });
  try {
    const answer = hooks.onAsk({ id: 'q1', agent: 'main', questions: [{ question: 'Tie?', options: [{ label: 'Server wins' }, { label: 'Keep both (recommended)' }] }] });
    const view = [...s.asks.values()][0].view;
    assert.equal(view.deadline, 5030);
    assert.deepEqual(await answer, { 'Tie?': 'Keep both' });
    assert.equal(s.asks.size, 0);
    assert.match(s.hub.transcript.at(-1).text, /^default taken after 0 min: Keep both$/);
    // An answer before the deadline wins and the timer never fires.
    const early = hooks.onAsk({ id: 'q2', questions: [{ question: 'Size?', options: ['S', 'M'] }] });
    s.answerAsk('q2', { 'Size?': 'M' });
    assert.deepEqual(await early, { 'Size?': 'M' });
    // A question with no options has no default: no deadline, it waits.
    hooks.onAsk({ id: 'q3', questions: [{ question: 'Name it', options: [] }] });
    assert.equal(s.asks.get('q3').view.deadline, null);
  } finally {
    await s.close();
  }
});

test('the countdown reads like the Tug board: 4:48 left of 6 minutes is 80%', () => {
  assert.equal(ASK_DEFAULT_MS, 360000);
  assert.deepEqual(countdown(1000 + 288000, 1000), { left: '4:48', pct: 80 });
  assert.equal(countdown(1000, 2000), null);
  assert.equal(countdown(null, 1000), null);
  assert.deepEqual(askDefaults([{ question: 'a', options: ['x', 'y'] }, { question: 'b', options: [{ label: 'p' }, { label: 'q (Recommended)' }] }]), { a: 'x', b: 'q' });
  assert.equal(askDefaults([{ question: 'a', options: [] }]), null);
});

test('the inbox carries a live question\'s deadline to its tug', async () => {
  const { fromInbox } = await import('../src/screens/headsdown-inbox/inboxModel.js');
  const [x] = fromInbox([{ id: 'q1:0', src: 'ask', askId: 'q1', kind: 'now', qText: 'Tie?', question: 'Tie?', options: ['A', 'B'], at: '2026-10-21T03:00:00Z', deadline: '2026-10-21T03:06:00Z', session: { name: 'vega' } }], Date.parse('2026-10-21T03:01:12Z'));
  assert.equal(x.deadline, '2026-10-21T03:06:00Z');
  assert.deepEqual(countdown(x.deadline, Date.parse('2026-10-21T03:01:12Z')), { left: '4:48', pct: 80 });
});

// ---- the cloud loop's "PRs opened" (GET /api/cloud) -------------------------------------

const { cloudLoop } = await import('../server/gh.mjs');

/** A fake gh: answers by the command's leading words; records every call. Never the PATH's gh. */
function fakeGh(answers) {
  const calls = [];
  const fn = async (cmd, args) => {
    assert.equal(cmd, 'gh');
    const key = args.join(' ');
    calls.push(key);
    const hit = Object.entries(answers).find(([k]) => key === k || key.startsWith(`${k} `));
    if (!hit) return { ok: false, code: 1, stdout: '', stderr: `unexpected: ${key}` };
    const v = hit[1];
    return v === null ? { ok: false, code: 1, stdout: '', stderr: 'HTTP 403' } : { ok: true, code: 0, stdout: JSON.stringify(v), stderr: '' };
  };
  fn.calls = calls;
  return fn;
}

const SINCE = Date.parse('2026-10-21T18:00:00Z');
const WORKFLOWS = [{ id: 7, name: 'ci', path: '.github/workflows/ci.yml', state: 'active' }, { id: 9, name: 'march', path: '.github/workflows/march.yml', state: 'active' }];

test('PRs opened tonight are the ones created while a loop run was going', async () => {
  const gh = fakeGh({
    'workflow list': WORKFLOWS,
    'run list --workflow 9': [
      { databaseId: 3, status: 'completed', createdAt: '2026-10-21T19:00:00Z', updatedAt: '2026-10-21T19:20:00Z' },
      { databaseId: 4, status: 'in_progress', createdAt: '2026-10-21T21:00:00Z', updatedAt: '2026-10-21T21:01:00Z' },
      { databaseId: 1, status: 'completed', createdAt: '2026-10-20T19:00:00Z', updatedAt: '2026-10-20T19:30:00Z' },
    ],
    'pr list': [
      { number: 50, createdAt: '2026-10-21T19:10:00Z' }, // in run 3
      { number: 51, createdAt: '2026-10-21T19:21:30Z' }, // just after run 3 ends: within the slack
      { number: 52, createdAt: '2026-10-21T20:00:00Z' }, // between runs: someone else's
      { number: 53, createdAt: '2026-10-21T21:05:00Z' }, // in the run still going
      { number: 40, createdAt: '2026-10-20T19:10:00Z' }, // last night
    ],
  });
  const r = await cloudLoop('.', { run: gh, now: Date.parse('2026-10-21T21:10:00Z'), since: SINCE });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tonight, { since: '2026-10-21T18:00:00.000Z', prs: 3 });
  assert.deepEqual([r.paused, r.running, r.workflow.id], [false, true, 9]);
  assert.ok(gh.calls.every((c) => !/^(workflow (enable|disable|run)|pr (create|merge))\b/.test(c)), 'reading never changes anything');
});

test('no loop workflow is not served; a gh that cannot list PRs leaves the count unknown', async () => {
  const none = await cloudLoop('.', { run: fakeGh({ 'workflow list': [WORKFLOWS[0]] }), since: SINCE });
  assert.deepEqual([none.ok, none.status], [false, 404]);
  const blind = await cloudLoop('.', { run: fakeGh({ 'workflow list': [{ ...WORKFLOWS[1], state: 'disabled_manually' }], 'run list': [], 'pr list': null }), since: SINCE });
  assert.deepEqual([blind.ok, blind.paused, blind.tonight.prs], [true, true, null]);
  const down = await cloudLoop('.', { run: fakeGh({}), since: SINCE });
  assert.equal(down.status, 502);
});

