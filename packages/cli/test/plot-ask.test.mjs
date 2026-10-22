// Onboarding's plot session's asks reach the person (spec 47, A15): while the session the Plot step started waits on
// a permission or a question, the Plot, Cloud and Launch steps show it with Allow and Deny inline (never "Always
// allow"), and Launch's "Open the cockpit" opens that session while it still works instead of starting another.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { toolArg, toolArgFromJson } from '../shared/tool-arg.mjs';
import { permissionLine, permissionArgs, pendingAsk, plotWorking, launchTarget } from '../src/screens/onboarding/plotAsk.js';

// The data client reads its launch token from the page at import: a bare page for the screens imported here.
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const perm = { id: 'p1', tool: 'Bash', summary: JSON.stringify({ command: 'npm run claims -- list', description: 'list claims' }), reason: null, canAlways: true };
const ask = { id: 'a1', questions: [{ question: 'Which spec number?', options: [] }, { question: 'Asap?', options: [] }] };
const live = (o = {}) => ({ status: { state: 'idle' }, asks: [], permissions: [], ...o });

test('permissionLine names what the tool would touch, and survives a clipped summary', () => {
  assert.equal(permissionLine(perm), 'Bash: npm run claims -- list');
  assert.equal(permissionLine({ tool: 'Write', summary: JSON.stringify({ file_path: 'plan/48-x.md', content: 'x' }) }), 'Write: plan/48-x.md');
  const clipped = permissionLine({ tool: 'Bash', summary: '{"command":"git status && git log --oneline -5' });
  assert.equal(clipped, 'Bash: git status && git log --oneline -5');
  assert.equal(permissionLine({ tool: 'Bash', summary: JSON.stringify({ command: 'x'.repeat(300) }) }).length, 'Bash: '.length + 120);
  assert.equal(permissionLine(null), '');
});

test('a permission reads like a cockpit tool row: the command itself, never the raw JSON, with the full text kept', () => {
  // Seen live: a Windows path in a long command, its JSON cut at 400 characters mid-string.
  const command = 'cd "C:\\Users\\me\\scratch\\repo" && node scripts/claims.mjs claim 48.1 --session vega && git status --short && ' + 'echo done; '.repeat(40);
  const summary = JSON.stringify({ command, description: 'Claim the chunk' }).slice(0, 400);
  const fromJson = permissionArgs({ tool: 'Bash', summary });
  assert.ok(fromJson.full.startsWith('cd "C:\\Users\\me\\scratch\\repo" && node scripts/claims.mjs'), fromJson.full.slice(0, 60));
  assert.doesNotMatch(fromJson.args, /\{"command"|\\"/);
  assert.equal(fromJson.args.length, 120);
  assert.ok(fromJson.args.endsWith('…'));
  // The server's view carries the argument whole (args), which wins over the clipped summary.
  const viewed = permissionArgs({ tool: 'Bash', summary, args: toolArg('Bash', { command }) });
  assert.equal(viewed.full, command);
  assert.equal(viewed.tool, 'Bash');
  // Bash: command, else description; other tools: the cockpit row's pick.
  assert.equal(toolArg('Bash', { description: 'List claims' }), 'List claims');
  assert.equal(toolArg('Grep', { pattern: 'TODO', path: 'src' }), 'TODO');
  assert.equal(toolArg('Read', { file_path: 'plan/README.md' }), 'plan/README.md');
  assert.equal(toolArgFromJson('Bash', '{"command":"echo \\u00e9 \\u00'), 'echo é ', 'a cut unicode escape is dropped');
  assert.equal(toolArgFromJson('Bash', '{"command":"echo a\\'), 'echo a', 'a cut escape is dropped');
  assert.equal(toolArgFromJson('Bash', '{"timeout":5'), '');
  assert.match(read('../server/session.mjs'), /args: toolArg\(tool, input\)/, 'the permission view carries the argument');
});

test('pendingAsk: nothing, a permission first, else the first question', () => {
  assert.equal(pendingAsk(live()), null);
  assert.equal(pendingAsk(undefined), null);
  assert.deepEqual(pendingAsk(live({ permissions: [perm], asks: [ask] })), { kind: 'perm', id: 'p1', line: 'Bash: npm run claims -- list', tool: 'Bash', args: 'npm run claims -- list', full: 'npm run claims -- list' });
  assert.deepEqual(pendingAsk(live({ asks: [ask] })), { kind: 'ask', id: 'a1', line: 'Which spec number? (+1 more)', tool: '', args: 'Which spec number? (+1 more)', full: 'Which spec number?' });
});

test('Launch opens the plot session while it still works, else adopts or starts a new one', () => {
  const plot = { id: 's-vega', name: 'vega' };
  assert.equal(plotWorking(live({ status: { state: 'running' } })), true);
  assert.equal(plotWorking(live({ permissions: [perm] })), true, 'waiting on the person is still working');
  assert.equal(plotWorking(live()), false);
  assert.equal(plotWorking(live({ status: { state: 'idle', hosted: false } })), false, 'a session this server does not run');
  assert.deepEqual(launchTarget({ adopted: true, plot, live: live({ status: { state: 'running' } }) }), { kind: 'plot', id: 's-vega', name: 'vega' });
  assert.deepEqual(launchTarget({ adopted: true, plot, live: live({ asks: [ask] }) }), { kind: 'plot', id: 's-vega', name: 'vega' });
  assert.deepEqual(launchTarget({ adopted: true, plot, live: live() }), { kind: 'new' }, 'a plot that finished: a session of its own');
  assert.deepEqual(launchTarget({ adopted: true, plot: null, live: live({ status: { state: 'running' } }) }), { kind: 'new' }, 'no plot session');
  assert.deepEqual(launchTarget({ adopted: false, plot: null, live: live() }), { kind: 'adopt' });
});

test('the strip: Allow and Deny for a permission (never Always allow), the cockpit for a question, nothing when idle', async () => {
  const { PlotAskStrip } = await import('../src/screens/onboarding/PlotAsk.jsx');
  const render = (props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PlotAskStrip, props)));
  const session = { id: 's-vega', name: 'vega' };
  const p = render({ session, live: live({ permissions: [perm] }) });
  assert.match(p, /class="plot-ask" role="status"/);
  assert.match(p, /vega<\/span> <span class="plot-ask-lead">is waiting for you:<\/span> <span class="plot-ask-what" title="npm run claims -- list"><span class="plot-ask-tool">Bash<\/span><span class="syn-cmd">npm<\/span> <span class="syn-cmd">run<\/span>|<span class="plot-ask-what" title="npm run claims -- list"><span class="plot-ask-tool">Bash<\/span><span class="syn-cmd">npm<\/span>/);
  assert.doesNotMatch(p, /\{&quot;command/, 'never the raw JSON');
  assert.match(p, />Allow<\/button>/);
  assert.match(p, />Deny<\/button>/);
  assert.doesNotMatch(p, /Always/);
  assert.match(p, /href="\/s\/s-vega"[^>]*>Open cockpit/);
  const q = render({ session, live: live({ asks: [ask] }) });
  assert.match(q, /Which spec number\? \(\+1 more\)/);
  assert.doesNotMatch(q, /Allow|Deny/, 'a question is answered in the cockpit');
  assert.match(q, /href="\/s\/s-vega"/);
  assert.equal(render({ session, live: live({ status: { state: 'running' } }) }), '');
  assert.equal(render({ session: null, live: live({ permissions: [perm] }) }), '', 'no plot session yet');
  // Inline answers go through the cockpit's endpoint with always = false.
  assert.match(read('../src/screens/onboarding/PlotAsk.jsx'), /answer = server\.answerPermission/);
  assert.match(read('../src/screens/onboarding/PlotAsk.jsx'), /await answer\(ask\.id, allow, false\)/);
});

test('the Plot, Cloud and Launch steps carry the strip, and Launch opens the target it chose', () => {
  for (const f of ['Plot.jsx', 'CloudSetup.jsx', 'Launch.jsx']) {
    const src = read(`../src/screens/onboarding/${f}`);
    assert.match(src, /const plot = usePlotLive\(d\);/, `${f} follows the plot session`);
    assert.match(src, /notice=\{<PlotAskStrip session=\{d\.plotSession\} live=\{plot\.live\} \/>\}/, `${f} shows the strip`);
  }
  const launch = read('../src/screens/onboarding/Launch.jsx');
  assert.match(launch, /if \(target\.kind === 'plot'\) \{\s+id = target\.id;/);
  assert.match(read('../src/ui/shell.jsx'), /\{notice \? <div className="ob-notice">\{notice\}<\/div> : null\}/);
  assert.match(read('../src/data/client.js'), /if \(off\) return undefined;/, 'no channel before the plot session exists');
});
