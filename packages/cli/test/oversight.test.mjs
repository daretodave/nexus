// Oversight lists real questions, whole and grouped (spec 47, A7): the plan's questions are their own source
// ("In the plan", by spec), Cloud runs holds only what a cloud run parked, question text is markdown, and
// Batch-answer with defaults takes only questions that carry a default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  batchEligible, batchWhyLine, collect, fromDurable, fromInbox, planGroups, recommendedDefault,
} from '../src/screens/headsdown-inbox/inboxModel.js';
import { questionsIn } from '../server/repo.mjs';
import { inboxItems } from '../server/fleet-home.mjs';
import { parseInline } from '../src/ui/markdown.js';

const SPEC_47 = [
  '# 47 — The GUI on a mature adopter',
  '## Open questions',
  '- Should the **transcript** keep',
  '  `tool` rows folded? Recommendation: fold them.',
  '- Which port does the GUI take?',
  '- Settled 2026-10-13: the accounts are both live.',
].join('\n');
const SPEC_3 = ['# 3: Cloud loop', '## Open questions', '- Run nightly or hourly (recommended)?'].join('\n');
const AUDIT = ['# Audit', '## Open questions', '- **Hosting:** the site is live.', '- [ ] [needs-user-call] pick a release day'].join('\n');

const durable = () => [
  ...questionsIn(SPEC_47, 'plan/47-gui.md'),
  ...questionsIn(AUDIT, 'plan/AUDIT.md'),
  ...questionsIn(SPEC_3, 'plan/specs/03-cloud.md'),
];

test('a recommended default is named by Recommendation:, Default: or (recommended), and nothing else', () => {
  assert.equal(recommendedDefault('Keep it? Recommendation: keep it. Others disagree.'), 'keep it');
  assert.equal(recommendedDefault('Which host?\n  - **Default:** the current one\n  - another'), 'the current one');
  assert.equal(recommendedDefault('Run nightly or hourly (recommended)?'), 'hourly');
  assert.equal(recommendedDefault('Monday (recommended), Friday, or Sunday?'), 'Monday');
  assert.equal(recommendedDefault('Does the default branch stay main?'), null, '"default" as a word is not one');
  assert.equal(recommendedDefault('Which port does the GUI take?'), null);
});

test('plan questions are their own kind, never a cloud run; a recommendation is their one option', () => {
  const items = fromDurable(durable());
  assert.deepEqual(items.map((i) => [i.kind, i.hasDefault, i.opts[0] || null]), [
    ['plan', true, 'fold them'], ['plan', false, null], ['plan', false, null], ['plan', true, 'hourly'],
  ]);
  assert.equal(items[0].q, 'Should the **transcript** keep `tool` rows folded? Recommendation: fold them.', 'whole, markdown kept');
  assert.deepEqual(items[0].spec, { n: '47', title: 'The GUI on a mature adopter' });
  // served: the server tags the plan's rows kind 'plan'; only a cloud run's parked item is kind 'cloud'
  const served = inboxItems({ durable: durable() });
  assert.ok(served.every((r) => r.kind === 'plan'));
  const view = fromInbox([...served, { id: 'c1', kind: 'cloud', src: 'inbox', run: '41', question: 'Keep the copy?', options: ['keep'] }]);
  assert.deepEqual(view.map((i) => i.kind), ['plan', 'plan', 'plan', 'plan', 'cloud']);
  // the fallback (no /api/inbox) draws the same kinds
  const { items: fallback } = collect({ inbox: { status: 'error' }, live: {}, oversight: { status: 'ready', data: { durable: durable() } } });
  assert.ok(fallback.every((i) => i.kind === 'plan'));
});

test('In the plan groups by spec (number order), then other files by path', () => {
  const groups = planGroups(fromDurable(durable()));
  assert.deepEqual(groups.map((g) => [g.n, g.title, g.file, g.items.length]), [
    ['03', 'Cloud loop', 'plan/specs/03-cloud.md', 1],
    ['47', 'The GUI on a mature adopter', 'plan/47-gui.md', 2],
    ['', '', 'plan/AUDIT.md', 1],
  ]);
});

test('Batch-answer takes only questions with a default, never a secret; the button says why when it cannot', () => {
  const items = [
    ...fromDurable(durable()),
    ...fromDurable([{ id: 's', file: 'plan/AUDIT.md', line: 9, text: 'secret request 07.1: set A_KEY', secret: { chunk: '07.1', names: ['A_KEY'], missing: ['A_KEY'] } }]),
  ];
  assert.deepEqual(batchEligible(items).map((i) => i.opts[0]), ['fold them', 'hourly']);
  assert.deepEqual(batchEligible(fromDurable(questionsIn(AUDIT, 'plan/AUDIT.md'))), []);
  assert.match(batchWhyLine(0), /Default if unanswered:, Default:, Defaults to, Recommendation: or \(recommended\)/);
  assert.match(batchWhyLine(2), /2 questions/);
  assert.match(batchWhyLine(2), /list before/);
});

test('a row\'s question renders as markdown: no raw ** or backticks reach the page', () => {
  const [q] = fromDurable(durable());
  const html = renderToStaticMarkup(createElement('span', null, ...parseInline(q.q.replace(/\s*\n\s*/g, ' ')).map((n, i) => (
    n.type === 'strong' ? createElement('strong', { key: i }, n.children.map((c) => c.text).join(''))
      : n.type === 'code' ? createElement('code', { key: i }, n.text) : n.text))));
  assert.match(html, /<strong>transcript<\/strong>/);
  assert.match(html, /<code>tool<\/code>/);
  assert.doesNotMatch(html, /\*\*|`/);
});

test('the Oversight screen: honest sources, plan rows without a chip, text through the markdown renderer, a confirmed batch', () => {
  const src = fs.readFileSync(new URL('../src/screens/Inbox.jsx', import.meta.url), 'utf8');
  assert.match(src, /value: 'plan', label: `In the plan \$\{n\.plan\}`/);
  assert.match(src, /value: 'cloud', label: `Cloud runs \$\{n\.cloud\}`, title: n\.cloud \? undefined : 'No cloud run has parked a question'/);
  assert.match(src, /\{r\.kind === 'plan' \? null : <Tag x=\{r\} \/>\}/, 'no chip column on a plan row');
  assert.match(src, /<Markdown inline text=\{oneLine\(r\.q\)\} \/>/, 'the row: inline markdown');
  assert.match(src, /<Markdown className="pcard-q" text=\{x\.q\} \/>/, 'the detail: the whole question, drawn');
  assert.match(src, /onClick=\{\(\) => setConfirm\(true\)\} disabled=\{!batchable\}/, 'batch confirms before it sends');
  assert.doesNotMatch(src, /x\.src === 'durable'\) return <span className="sess-tag"/, 'no "plan" chip');
  assert.match(src, /import '\.\.\/styles\/oversight\.css';/);
});

test('oversight.css leans only on nexus.css tokens, so both themes follow', () => {
  const css = fs.readFileSync(new URL('../src/styles/oversight.css', import.meta.url), 'utf8');
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  for (const [, ref] of css.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(nexus.includes(`${ref}:`), `${ref} is a nexus.css token`);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no raw colours');
});
