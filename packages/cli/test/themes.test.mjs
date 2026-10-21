// Explode's theme cards (spec 40 A8): /messy's report, as its Step 6 pins it, parsed into one card per theme with its
// /plot line, from a fixture report and from a session transcript.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindOf, messyReport, parseThemes } from '../src/screens/onboarding/themes.js';

const REPORT = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'messy-report.txt'), 'utf8');

test('each theme line of a /messy report becomes a card with its /plot line', () => {
  assert.deepEqual(parseThemes(REPORT), [
    { title: 'Faster first run', became: 'spec 44', kind: 'new', spec: '44', plot: '/plot asap "cut the first-run wait under ten seconds"' },
    { title: 'Dark mode flicker', became: 'extends 40', kind: 'extends', spec: '40', plot: '/plot anytime "stop the dawn flash on load"' },
    { title: 'Export the board', became: 'built at packages/cli/src/screens/board/', kind: 'built', spec: null, plot: '/plot "export the plan board as markdown"' },
    { title: 'Offline docs', became: 'spec 45 (plan only)', kind: 'new', spec: '45', plot: '/plot worked out "bundle the docs for offline reading"' },
  ]);
});

test('lines without a /plot action, or outside a list, are not themes', () => {
  assert.deepEqual(parseThemes('Keep `/plot` lines short.\n- just a note\n2. Ship 44 first'), []);
  assert.deepEqual(parseThemes(''), []);
  assert.deepEqual(parseThemes(undefined), []);
  assert.equal(parseThemes('* `/plot asap "a bare action"`')[0].title, 'a bare action', 'no title: the action names it');
  assert.equal(kindOf('an extension of 12'), 'extends');
  assert.equal(kindOf('who knows'), null);
});

test('the report is the main agent\'s text in the last /messy turn, streamed in pieces', () => {
  const cut = REPORT.indexOf('- **Export'); // a text block ends at a line, as the stream's blocks do
  const [head, tail] = [REPORT.slice(0, cut), REPORT.slice(cut)];
  const tx = [
    { kind: 'user', text: '/messy an older dump' },
    { kind: 'text', id: 'm0:0', agent: 'main', text: '- **Old theme** · spec 9 · `/plot asap "old"`' },
    { kind: 'result' },
    { kind: 'user', text: '/explode faster first run, dark mode flicker, export, offline docs' },
    { kind: 'text', id: 'm1:0', agent: 'toolu_1', text: '- **A sub-agent draft** · spec 99 · `/plot asap "draft"`' },
    { kind: 'text', id: 'm1:1', agent: 'main', text: head },
  ];
  const mid = messyReport(tx);
  assert.equal(mid.sent, true);
  assert.equal(mid.done, false);
  assert.ok(mid.themes.every((t) => t.title !== 'A sub-agent draft' && t.title !== 'Old theme'));

  tx.push({ kind: 'text', id: 'm1:2', agent: 'main', text: tail }, { kind: 'result' });
  // A /plot sent from a card afterwards is its own turn: its text never adds a theme.
  tx.push({ kind: 'user', text: '/plot asap "cut the first-run wait under ten seconds"' }, { kind: 'text', id: 'm2:0', agent: 'main', text: '- **Planned** · spec 44 · `/plot asap "x"`' });
  const done = messyReport(tx);
  assert.equal(done.done, true);
  assert.deepEqual(done.themes.map((t) => t.title), ['Faster first run', 'Dark mode flicker', 'Export the board', 'Offline docs']);

  assert.deepEqual(messyReport([{ kind: 'user', text: 'hello' }]), { sent: false, done: false, themes: [] });
});
