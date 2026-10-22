// The /plot report card (spec 47, A6): the nexus-plot contract's validator (good, partial, wrong types), the block
// taken out of a message (prose kept, a streaming or broken block left as code), the exact line an action sends
// (the report's command plus the chosen answers), and the card rendered on the server from a fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { aheadLabel, answersLine, extractPlotReport, plotActions, plotCommand, validatePlotReport } from '../src/ui/plot-report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(here, 'fixtures', 'plot-peek.md'), 'utf8');
const good = () => ({
  task: 'Relative age on cards', mode: 'peek',
  chunks: [{ id: '12.?ago', title: 'Relative age', size: 'S', closes: 'A?ago', needs: '—' }],
  questions: [{ q: 'Which cards?', options: ['every card', 'claimed only'], default: 'every card' }],
  move: { plot: '/plot "age"', asap: '/plot asap "age"', doNow: '/plot "age" and do' },
});

test('a good report validates and normalizes: lists present, closes/needs as id lists, — as none', () => {
  const r = validatePlotReport(good());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.report.built, []);
  assert.deepEqual(r.report.chunks[0].closes, ['A?ago']);
  assert.deepEqual(r.report.chunks[0].needs, []);
  assert.deepEqual(r.report.chunks[0].files, []);
  assert.equal(r.report.order, null);
  assert.equal(r.report.spec, null);
  const s = validatePlotReport({ ...good(), chunks: [{ id: '3.1', title: 't', size: 'm', closes: ['A1', 'A2'], needs: '2.4, 2.5' }], built: ['a plain string item'] });
  assert.equal(s.ok, true);
  assert.equal(s.report.chunks[0].size, 'M');
  assert.deepEqual(s.report.chunks[0].needs, ['2.4', '2.5']);
  assert.deepEqual(s.report.built, [{ what: 'a plain string item', where: '' }]);
});

test('a partial report (the required keys missing) fails with each missing key named', () => {
  const r = validatePlotReport({ chunks: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('task')));
  assert.ok(r.errors.some((e) => e.startsWith('mode')));
  assert.equal(validatePlotReport(null).ok, false);
  assert.equal(validatePlotReport([]).ok, false);
  assert.equal(validatePlotReport('x').ok, false);
});

test('wrong types fail: a bad mode, size, list, ahead, default not among options, a command that is not /plot or /next', () => {
  const bad = (patch, key) => {
    const r = validatePlotReport({ ...good(), ...patch });
    assert.equal(r.ok, false, `${key} should fail`);
    assert.ok(r.errors.some((e) => e.startsWith(key)), `${key}: ${r.errors.join('; ')}`);
  };
  bad({ mode: 'maybe' }, 'mode');
  bad({ built: 'not a list' }, 'built');
  bad({ built: [{ where: 'x' }] }, 'built[0].what');
  bad({ chunks: [{ id: '1.1', title: 't', size: 'XL' }] }, 'chunks[0].size');
  bad({ chunks: [{ id: 3, title: 't', size: 'S' }] }, 'chunks[0].id');
  bad({ chunks: [{ id: '1', title: 't', size: 'S', closes: 7 }] }, 'chunks[0].closes');
  bad({ order: { before: 'a', after: [], lit: [], ahead: 1 } }, 'order.before');
  bad({ order: { before: [], after: [], lit: [], ahead: -1 } }, 'order.ahead');
  bad({ order: { before: [], after: [], lit: [], ahead: 1.5 } }, 'order.ahead');
  bad({ questions: [{ q: 'x', options: ['a'], default: 'b' }] }, 'questions[0].default');
  bad({ questions: [{ q: 'x', options: [], default: '' }] }, 'questions[0].options');
  bad({ spec: { file: 'plan/1-x.md', joined: 'yes' } }, 'spec.joined');
  bad({ move: { plot: 'rm -rf /' } }, 'move.plot');
  bad({ move: { doNow: '/plot x\n/next y' } }, 'move.doNow');
  bad({ move: { asap: '/deploy' } }, 'move.asap');
});

test('extraction: the prose above, the block taken out, the report validated', () => {
  const { prose, report, errors } = extractPlotReport(fixture);
  assert.deepEqual(errors, []);
  assert.ok(report);
  assert.equal(report.mode, 'peek');
  assert.equal(report.chunks[0].id, '12.?ago');
  assert.deepEqual(report.order.lit, ['12.?ago']);
  assert.match(prose, /^\*\*The task:\*\*/);
  assert.match(prose, /Retro: clean run\.$/);
  assert.doesNotMatch(prose, /nexus-plot/);
  assert.match(prose, /now: {3}Asap lane/, 'the other fenced block stays in the prose');
  assert.equal(extractPlotReport(fixture.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')).report?.task, report.task, 'CRLF text too');
});

test('extraction never throws: no block, a streaming (unclosed) block, bad JSON, a failing schema all leave the text whole', () => {
  assert.deepEqual(extractPlotReport('just prose'), { prose: 'just prose', report: null, errors: [] });
  assert.deepEqual(extractPlotReport(undefined), { prose: '', report: null, errors: [] });
  const streaming = fixture.slice(0, fixture.indexOf('"questions"'));
  assert.equal(extractPlotReport(streaming).report, null);
  assert.equal(extractPlotReport(streaming).prose, streaming);
  const broken = 'text\n\n```nexus-plot\n{ "task": \n```\n';
  const b = extractPlotReport(broken);
  assert.equal(b.report, null);
  assert.equal(b.prose, broken);
  assert.match(b.errors[0], /^not JSON/);
  const wrong = 'text\n```nexus-plot\n{ "task": "x", "mode": "later" }\n```';
  assert.equal(extractPlotReport(wrong).report, null);
  assert.ok(extractPlotReport(wrong).errors.length);
  assert.equal(extractPlotReport('```json\n{"task":"x","mode":"peek"}\n```').report, null, 'only the nexus-plot tag');
});

test('the line an action sends: the exact command, then the answers (defaults where nothing is picked)', () => {
  const { report } = extractPlotReport(fixture);
  assert.equal(plotCommand(report, 'plot'), '/plot "relative age on board cards" Answers: 1) every card 2) seconds');
  assert.equal(plotCommand(report, 'asap', { 1: 'minutes' }), '/plot asap "relative age on board cards" Answers: 1) every card 2) minutes');
  assert.equal(plotCommand(report, 'doNow', { 0: 'claimed only' }), '/plot "relative age on board cards" and do Answers: 1) claimed only 2) seconds');
  assert.equal(plotCommand(report, 'plot', { 0: 'not an option' }), '/plot "relative age on board cards" Answers: 1) every card 2) seconds');
  assert.equal(plotCommand({ ...report, questions: [] }, 'plot'), '/plot "relative age on board cards"');
  assert.equal(plotCommand({ ...report, move: {} }, 'plot'), '');
  assert.equal(answersLine([]), '');
  assert.equal(aheadLabel(5), 'behind 5 chunks');
  assert.equal(aheadLabel(1), 'behind 1 chunk');
  assert.equal(aheadLabel(0), 'next in line');
  assert.equal(aheadLabel(null), '');
});

test('the buttons by mode: peek offers all three, plotted only Build now, done none', () => {
  const { report } = extractPlotReport(fixture);
  assert.deepEqual(plotActions(report).map((a) => a.label), ['Plot it', 'Plot asap', 'Plot and build now']);
  const plotted = { ...report, mode: 'plotted', move: { doNow: '/next 12.4' } };
  assert.deepEqual(plotActions(plotted).map((a) => a.label), ['Build now']);
  assert.deepEqual(plotActions({ ...report, mode: 'done' }), []);
  assert.deepEqual(plotActions({ ...report, move: { plot: '/plot x' } }).map((a) => a.key), ['plot'], 'only commands it carries');
});

/** plot-card.jsx compiled for node (its imports are plain .js), then imported. */
async function loadCard() {
  const { transformWithOxc } = await import('vite');
  const src = path.join(here, '..', 'src', 'ui', 'plot-card.jsx');
  const { code } = await transformWithOxc(fs.readFileSync(src, 'utf8'), src, { jsx: { runtime: 'automatic' } });
  assert.doesNotMatch(code, /from\s+['"][^'"]+\.(jsx|css)['"]/, 'the card imports no .jsx or .css, so it renders on the server');
  const out = path.join(here, `.plot-card.${process.pid}.mjs`);
  const rewired = code.replace(/from\s+(['"])\.\/([^'"]+\.js)\1/g, (_, q, f) => `from ${q}${pathToFileURL(path.join(path.dirname(src), f)).href}${q}`);
  fs.writeFileSync(out, rewired);
  try { return await import(pathToFileURL(out).href); } finally { fs.rmSync(out, { force: true }); }
}

test('the card renders on the server from the fixture: task, mode, rows, chunk, lit lane, answer cards, buttons', async () => {
  const { PlotCard } = await loadCard();
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { report } = extractPlotReport(fixture);
  const html = renderToStaticMarkup(createElement(PlotCard, { report, onSend: async () => true }));
  assert.match(html, /class="plotc is-peek"/);
  assert.match(html, /Every board card shows how long ago its chunk last moved/);
  assert.match(html, /class="plotc-mode is-peek">Peek</);
  assert.match(html, /plotc-row is-built.*The card&#x27;s time label.*file-tag">src\/ui\/plan\.jsx/);
  assert.match(html, /plotc-row is-planned/);
  assert.match(html, /plotc-row is-new/);
  assert.match(html, /class="chunk-id">12\.\?ago</);
  assert.match(html, /class="size-tag"[^>]*>S</);
  assert.match(html, /<b>closes<\/b> A\?ago/);
  assert.match(html, /<b>needs<\/b> —/);
  assert.match(html, /joins <span class="file-tag">plan\/12-board\.md/);
  assert.equal((html.match(/plotc-id is-lit/g) || []).length, 1, 'only the new chunk is lit, only in the after lane');
  assert.match(html, /plotc-id is-lit">12\.\?ago</);
  assert.match(html, /behind 5 chunks/);
  assert.equal((html.match(/role="radio" aria-checked="true"/g) || []).length, 2, 'each question has its default chosen');
  assert.match(html, /aria-checked="true" class="is-on">every card<span class="plotc-def">default/);
  assert.match(html, />Plot it</);
  assert.match(html, />Plot asap</);
  assert.match(html, /btn btn-s btn-primary"[^>]*>Plot and build now</);
  assert.match(html, /Answers: 1\) every card 2\) seconds/);

  const plotted = renderToStaticMarkup(createElement(PlotCard, { report: { ...report, mode: 'plotted', move: { doNow: '/next 12.4' } }, onSend: async () => true }));
  assert.match(plotted, />Build now</);
  assert.doesNotMatch(plotted, /Plot asap/);
  const done = renderToStaticMarkup(createElement(PlotCard, { report: { ...report, mode: 'done' }, onSend: async () => true }));
  assert.doesNotMatch(done, /<footer/);
  assert.match(done, /Plotted and built/);
  const bare = renderToStaticMarkup(createElement(PlotCard, { report: validatePlotReport({ task: 'x', mode: 'peek' }).report }));
  assert.match(bare, /class="plotc is-peek"/, 'a minimal report still draws');
  assert.doesNotMatch(bare, /plotc-rows|plotc-order|<footer/);
});

test('the transcript routes a message through the card, and the cockpit sends its line by its own text', () => {
  const working = fs.readFileSync(path.join(here, '..', 'src', 'screens', 'cockpit', 'Working.jsx'), 'utf8');
  assert.match(working, /extractPlotReport\(text\)/);
  assert.match(working, /Full report/);
  assert.match(working, /import '\.\.\/\.\.\/styles\/plot-card\.css'/);
  const cockpit = fs.readFileSync(path.join(here, '..', 'src', 'screens', 'Cockpit.jsx'), 'utf8');
  assert.match(cockpit, /onSend=\{\(text\) => send\(text, \[\], \{ line: true \}\)\}/);
  assert.match(cockpit, /line \? routeFor\(text, null, running\) : route/);
});
