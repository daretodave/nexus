// The answer box's pure half (0.5.1, ui/answer-logic.js; re-exported by ui/answer-box.jsx): picking a choice never
// loses your words, a picked choice reads picked, a kept answer is labelled by how it was given, the row's own
// choices stand in before the wand runs, the wand's id for each kind of question, and the source line. Plus the
// store's reading of a reply (data/choices.js entryOf) and the new CSS on tokens only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { choiceId, choicesOf, howOf, isPicked, rowOptions, shownOptions, sourceLine, splitPicks, togglePick } from '../src/ui/answer-logic.js';
import { choiceRefs, choicesWords } from '../shared/choices.mjs';
import { entryOf } from '../src/data/choices.js';
import { continueBody, continueLabel, keptDone, imageCount } from '../src/screens/headsdown-inbox/planAnswers.js';

const LABELS = ['Warn the organiser', 'Block the save'];

test('togglePick: several can be picked, each on its own line in the order of the choices; your words stay under them', () => {
  assert.equal(togglePick('', LABELS[0], LABELS), 'Warn the organiser');
  assert.equal(togglePick('  ', LABELS[0], LABELS), 'Warn the organiser');
  // A second pick adds to the first (Alt+1 then Alt+2 holds both), in the order of the choices whatever the order picked.
  assert.equal(togglePick('Warn the organiser', LABELS[1], LABELS), 'Warn the organiser\nBlock the save');
  assert.equal(togglePick('Block the save', LABELS[0], LABELS), 'Warn the organiser\nBlock the save');
  // Picking a picked one unpicks it.
  assert.equal(togglePick('Warn the organiser\nBlock the save', LABELS[0], LABELS), 'Block the save');
  assert.equal(togglePick('Warn the organiser', LABELS[0], LABELS), '');
  // Your words are kept, under the picks, through every toggle.
  assert.equal(togglePick('only on weekends', LABELS[0], LABELS), 'Warn the organiser\n\nonly on weekends');
  assert.equal(togglePick('Warn the organiser\n\nonly on weekends', LABELS[1], LABELS), 'Warn the organiser\nBlock the save\n\nonly on weekends');
  assert.equal(togglePick('Warn the organiser\n\nonly on weekends', LABELS[0], LABELS), 'only on weekends');
  assert.deepEqual(splitPicks('Block the save\nWarn the organiser\n\nsorta like the first', LABELS), { picked: [0, 1], words: 'sorta like the first' });
  assert.ok(isPicked('Warn the organiser\n\nonly on weekends', LABELS[0], LABELS));
  assert.ok(isPicked('Warn the organiser\nBlock the save', LABELS[1], LABELS));
  assert.ok(isPicked('Warn the organiser', LABELS[0]));
  assert.ok(!isPicked('Block the save', LABELS[0], LABELS));
  assert.ok(!isPicked('Warn the organiser, mostly', LABELS[0], LABELS), 'a label inside your words is not a pick');
  assert.ok(!isPicked('', ''));
});

test('choicesOf: a kept answer carries the choices shown and which were picked, cleaned', () => {
  const opts = LABELS.map((label) => ({ label }));
  assert.deepEqual(choicesOf('Warn the organiser\nBlock the save\n\nboth, in that order', opts), { options: LABELS, picked: [0, 1] });
  assert.deepEqual(choicesOf('sorta like the first', opts), { options: LABELS, picked: [] });
  assert.equal(choicesOf('anything', []), null, 'no choices shown: none carried');
  assert.deepEqual(choiceRefs({ options: ['a', 'b'], picked: [1, 1, 5, -1, 'x', 0] }), { options: ['a', 'b'], picked: [0, 1] });
  assert.equal(choiceRefs({ options: [] }), null);
  assert.equal(choiceRefs(null), null);
  assert.deepEqual(choicesWords({ options: ['a', 'b', 'c'], picked: [0, 2] }), { shown: '1) a; 2) b; 3) c', picked: '1, 3' });
  assert.equal(choicesWords({ options: ['a', 'b'], picked: [] }).picked, 'none');
});

const plan = { id: 'plan:plan/14-x.md:9', src: 'durable', kind: 'plan', raw: { id: 'plan/14-x.md:9', file: 'plan/14-x.md', line: 9 }, opts: ['warn'], hasDefault: true };
const parked = { id: 'parked:l1:0:abcdef12', src: 'inbox', kind: 'parked', opts: ['SQLite', 'Postgres'], hasDefault: true };

test('the row\'s own choices, the wand\'s id, and how a kept answer is labelled', () => {
  assert.deepEqual(rowOptions(plan), [{ label: 'warn', why: 'What the spec itself recommends.', rec: true }]);
  assert.deepEqual(rowOptions({ ...plan, opts: [], hasDefault: false }), []);
  assert.equal(rowOptions(parked)[0].assumed, true);
  assert.equal(rowOptions(parked).length, 2);
  assert.equal(choiceId(plan), 'plan/14-x.md:9');
  assert.equal(choiceId(parked), 'inbox:parked:l1:0:abcdef12');
  assert.equal(choiceId({ ...plan, secret: 'X' }), null, 'a secret request has no wand');
  assert.equal(choiceId({ src: 'ask', id: 'a:0' }), null, 'a live ask has no wand');
  const wand = { status: 'ready', options: [{ label: 'A' }, { label: 'B' }] };
  assert.equal(shownOptions(wand, plan), wand.options);
  assert.equal(shownOptions({ status: 'idle', options: [] }, plan)[0].label, 'warn');
  const opts = rowOptions(plan);
  assert.equal(howOf(plan, 'warn', opts), 'default', 'exactly the recommendation');
  assert.equal(howOf(plan, 'warn, mostly', opts), 'answered');
  assert.equal(howOf(plan, '', opts, true), 'decide');
  assert.equal(howOf(parked, 'SQLite', []), 'approved');
  assert.equal(howOf(parked, 'Postgres', []), 'changed');
});

test('the source line and the store\'s reading of a reply', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(sourceLine({ by: 'ai', at: now - 60000 }, now), 'suggested by Claude');
  assert.equal(sourceLine({ by: 'ai', at: now - 2 * 3600000 }, now), 'suggested 2h ago');
  assert.equal(sourceLine({ by: 'demo' }, now), 'Example choices (demo)');
  assert.equal(sourceLine({ by: 'row' }, now), '');
  assert.equal(entryOf({ by: 'ai', options: [{ label: 'a' }, { label: 'b' }] }).status, 'ready');
  assert.equal(entryOf({ by: 'row', options: [{ label: 'a' }], note: 'n', reason: 'unavailable' }).status, 'fallback');
  assert.equal(entryOf({ by: 'none', options: [], note: 'n' }, 'took too long').status, 'error');
  assert.equal(entryOf(null, 'boom').note, "Couldn't get suggestions (boom).");
});

test('kept answers carry how and images to the Continue, and its label counts the images', () => {
  const store = { 'plan/14-x.md:9': { answer: '(left to the session)', how: 'decide', images: [{ file: 'aaaaaaaaaaaaaaaa.png', name: 'm.png' }] } };
  const done = keptDone([plan], store);
  assert.equal(done[plan.id].how, 'decide');
  assert.equal(imageCount([plan], done), 1);
  const body = continueBody([{ ...plan, raw: { ...plan.raw, text: 'Warn?' } }], done, { kind: 'new' });
  assert.deepEqual(body.answers[0], { file: 'plan/14-x.md', line: 9, text: 'Warn?', answer: '(left to the session)', how: 'decide', images: [{ file: 'aaaaaaaaaaaaaaaa.png', name: 'm.png' }] });
  assert.equal(body.session, 'new');
  const ch = { options: ['Warn', 'Block'], picked: [1] };
  const withCh = keptDone([plan], { 'plan/14-x.md:9': { answer: 'Block', how: 'answered', choices: ch } });
  assert.deepEqual(continueBody([{ ...plan, raw: { ...plan.raw, text: 'Warn?' } }], withCh, { kind: 'new' }).answers[0].choices, ch, 'the choices shown go with the answer');
  assert.equal(continueLabel(3, { kind: 'session', name: 'vega' }, 2), 'Send 3 answers (2 images) to vega and continue');
  assert.equal(continueLabel(1, { kind: 'new' }, 1), 'Send 1 answer (1 image) to a new session and continue');
});

test('the new styles lean only on nexus.css tokens, so day and night both follow', () => {
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  for (const f of ['answer-card.css', 'grill.css', 'wand.css']) {
    const css = fs.readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8');
    for (const [, ref] of css.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(nexus.includes(`${ref}:`), `${f}: ${ref} is a nexus.css token`);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, `${f}: no raw colours`);
    assert.match(css, /prefers-reduced-motion: reduce/, `${f}: reduced motion is handled`);
  }
});
