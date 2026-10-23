// The small spots that used to draw plain and now colour: the heads-down agents tree's last call, the stage caption's
// call (NodeCap), and a cron schedule in Cloud and Settings (inline code with its words beside it).
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cronTokens, cronWords, CRON_FIELDS } from '../src/ui/syntax/cron.js';

const html = (el) => renderToStaticMarkup(el);

test('the heads-down agents tree colours each agent\'s last call as the tape does', async () => {
  const { headsRows, toolSegs } = await import('../src/screens/headsdown-inbox/headsModel.js');
  assert.deepEqual(toolSegs({ name: 'Bash', summary: 'npm test' }).slice(0, 3), [['k', 'Bash'], ['', ' '], ['syn-cmd', 'npm']]);
  assert.deepEqual(toolSegs({ name: 'Read', summary: '' }), [['k', 'Read']], 'no argument, just the name');
  const now = Date.parse('2026-10-22T12:00:00Z');
  const stage = { agents: { main: { id: 'main', parent: null, label: 'session', state: 'running', tool: 'Bash' } }, order: ['main'], chunks: {}, chunkOrder: [] };
  const transcript = [{ kind: 'tool', name: 'Bash', agent: 'main', summary: 'npm test -- sync' }];
  const ui = { draft: '', links: { inbox: '/i', cockpitW: {}, inboxW: {}, planW: {}, fleetW: {} } };
  const rows = headsRows({ ledger: { name: 'vega', phase: 'working' }, live: { stage, transcript, status: {} }, now, ui, seenAt: {} });
  const tree = rows.find((r) => r.cells.map((c) => c.ch).join('').includes('npm test'));
  assert.ok(tree, 'the tree row shows the call');
  const at = tree.cells.map((c) => c.ch).join('').indexOf('npm');
  assert.equal(tree.cells[at].cls, 'syn-cmd', 'the command is coloured, not plain');
});

test('the stage caption colours its tool and the call it is on, cut to fit', async () => {
  const { NodeCap, CAP_ARG } = await import('../src/ui/agent.jsx');
  const out = html(createElement(NodeCap, { label: 'main', tool: 'Bash', call: { name: 'Bash', summary: 'npm run build && node scripts/check-bundle.mjs --strict' } }));
  assert.match(out, /<span class="syn-fn">Bash<\/span><span class="node-arg"><span class="syn-cmd">npm<\/span>/);
  assert.match(out, /…<\/span><\/span>/, 'a long call is cut');
  assert.match(out, /title="Bash npm run build/, 'the whole call on hover');
  const text = out.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  assert.ok(text.length <= 'mainBash'.length + CAP_ARG, `never wraps: ${text}`);
  assert.doesNotMatch(html(createElement(NodeCap, { tool: 'waiting on you' })), /syn-fn/, 'words stay words');
  assert.match(html(createElement(NodeCap, { tool: 'failed', toolBad: true })), /is-bad/);
  const { lastCalls, liveStage } = await import('../src/screens/cockpit/model.js');
  const calls = lastCalls([{ kind: 'tool', agent: 'main', name: 'Read', summary: 'a.js' }, { kind: 'tool', agent: 'main', name: 'Bash', summary: 'ls' }]);
  assert.deepEqual(calls, { main: { name: 'Bash', summary: 'ls' } }, 'the newest call wins');
  const stage = { agents: { main: { id: 'main', state: 'running', tool: 'Bash' } }, order: ['main'] };
  assert.deepEqual(liveStage(stage, { calls }).nodes[0].call, { name: 'Bash', summary: 'ls' });
  assert.equal(liveStage({ ...stage, agents: { main: { ...stage.agents.main, tool: 'Edit' } } }, { calls }).nodes[0].call, undefined, 'a call the agent has moved on from is not shown');
});

test('a cron: each field coloured and named, and said in words', async () => {
  const toks = cronTokens('*/15 2,8 * * 1-5');
  assert.equal(toks.map((t) => t.v).join(''), '*/15 2,8 * * 1-5', 'lossless');
  assert.deepEqual(toks.slice(0, 3), [{ t: 'op', v: '*', field: 0 }, { t: 'punct', v: '/', field: 0 }, { t: 'num', v: '15', field: 0 }]);
  assert.equal(CRON_FIELDS[toks.find((t) => t.v === '1').field], 'day of week');
  assert.equal(cronWords('30 3 * * *'), 'every day at 03:30 UTC');
  assert.equal(cronWords('0 9 * * 1-5'), 'weekdays at 09:00 UTC');
  assert.equal(cronWords('*/15 * * * *'), 'every 15 minutes');
  assert.equal(cronWords('0 2,14 * * *'), 'every day at 02:00, 14:00 UTC');
  assert.equal(cronWords('5 * * * 1,4'), 'every hour at :05 on Mondays and Thursdays');
  assert.equal(cronWords('0 0 1 * *'), '', 'a monthly one speaks for itself');
  assert.equal(cronWords('nope'), '');
  const { CronCode } = await import('../src/ui/code.jsx');
  const out = html(createElement(CronCode, { cron: '30 3 * * *' }));
  assert.match(out, /<span class="cron"><code class="cron-code"><span class="cron-field" title="minute"><span class="syn-num">30<\/span><\/span> <span class="cron-field" title="hour">/);
  assert.match(out, /<span class="cron-words">every day at 03:30 UTC<\/span><\/span>$/);
  assert.doesNotMatch(html(createElement(CronCode, { cron: '30 3 * * *', words: false })), /cron-words/, 'a place that already says it leaves the words out');
  assert.match(html(createElement(CronCode, { cron: '0 0 1 * *', words: 'monthly' })), /<span class="cron-words">monthly<\/span>/);
  const { CronList } = await import('../src/ui/code.jsx');
  const two = html(createElement(CronList, { schedule: { cron: '0 3 * * 1-5', crons: ['0 3 * * 1-5', '30 9 * * 0,6'] } })).replace(/<[^>]+>/g, '');
  assert.match(two, /^0 3 \* \* 1-5weekdays at 03:00 UTC and 30 9 \* \* 0,6/, 'every cron of the loop, each with its own words');
});

test('a finished agent\'s last call stays dim in the heads-down tree; a working one is coloured', async () => {
  const { headsRows } = await import('../src/screens/headsdown-inbox/headsModel.js');
  const stage = { agents: { main: { id: 'main', parent: null, label: 'session', state: 'running' }, s1: { id: 's1', parent: 'main', label: 'scout', state: 'done' } }, order: ['main', 's1'], chunks: {}, chunkOrder: [] };
  const transcript = [{ kind: 'tool', name: 'Bash', agent: 's1', summary: 'npm test' }];
  const ui = { draft: '', links: { inbox: '/i', cockpitW: {}, inboxW: {}, planW: {}, fleetW: {} } };
  const rows = headsRows({ ledger: { name: 'vega', phase: 'working' }, live: { stage, transcript, status: {} }, now: 0, ui, seenAt: {} });
  const tree = rows.find((r) => r.cells.map((c) => c.ch).join('').includes('scout'));
  const at = tree.cells.map((c) => c.ch).join('').indexOf('npm');
  assert.equal(tree.cells[at].cls, 'd', 'done reads quieter than working');
});
