// Answers save as typed and send as given (spec 51, A1), as drawn: a typed answer's Send button is always there,
// the cockpit's start bar starts from the first answer with the rest at their defaults, a plan or parked question
// goes the moment it is answered while a live ask's waits for Send, and the screens share one model.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sendsNow } from '../src/data/answers.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('a typed answer: its Send button is drawn from the start, disabled until there is text', async () => {
  const { AnswerField } = await import('../src/ui/answer-field.jsx');
  const html = renderToStaticMarkup(createElement(AnswerField, { onSend() {}, button: 'Send answer', placeholder: 'Your answer…' }));
  assert.match(html, /class="field tug-other"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Send answer/);
});

test('a pending tug with Other draws the Answer button beside the field', async () => {
  const { Tug } = await import('../src/ui/tug.jsx');
  const html = renderToStaticMarkup(createElement(Tug, { who: 'main', question: 'Ship it?', options: [{ label: 'Yes', rec: true }], onPick() {}, onOther() {}, draftKey: 'tu_1:0' }));
  assert.match(html, /class="ans-field"/);
  assert.match(html, />Answer</);
  const kept = renderToStaticMarkup(createElement(Tug, { state: 'answered', who: 'main', question: 'Ship it?', chosen: 'Yes', tail: 'It goes with Send; what you leave takes its default.' }));
  assert.match(kept, /It goes with Send/);
  assert.doesNotMatch(kept, /resumed/);
});

test('the cockpit start bar: from the first answer, start with the rest at their defaults', async () => {
  const { default: QuestionsStart } = await import('../src/screens/cockpit/QuestionsStart.jsx');
  const questions = [
    { q: 'Which store?', opts: ['Postgres', 'SQLite'], rec: 0, answer: 'SQLite', how: 'answered' },
    { q: 'Name it?', opts: ['nexus', 'hub'], rec: 0, answer: null },
    { q: 'Docs?', opts: ['yes', 'no'], rec: 0, answer: null },
  ];
  const html = renderToStaticMarkup(createElement(QuestionsStart, { name: 'vega', questions, onAnswer() {}, onDefaults() {}, onStart() {} }));
  assert.match(html, /Start with 1 answer · 2 take their defaults/);
  assert.match(html, />Answer</, 'the typed answer has its button');
  const none = renderToStaticMarkup(createElement(QuestionsStart, { name: 'vega', questions: questions.map((x) => ({ ...x, answer: null })), onAnswer() {}, onDefaults() {}, onStart() {} }));
  assert.match(none, /<button[^>]*disabled=""[^>]*>Start working/, 'nothing answered: locked as before');
});

test('a plan, parked, cloud or permission answer goes at once; a live ask waits for Send', () => {
  assert.equal(sendsNow({ src: 'durable' }), true);
  assert.equal(sendsNow({ src: 'inbox' }), true);
  assert.equal(sendsNow({ src: 'perm' }), true);
  assert.equal(sendsNow({ src: 'ask' }), false);
});

test('Oversight and the cockpit share one model: drafts, askSend, the Send bar', () => {
  const inbox = read('../src/screens/Inbox.jsx');
  const working = read('../src/screens/cockpit/Working.jsx');
  for (const src of [inbox, working]) {
    assert.match(src, /from '\.\.\/(\.\.\/)?data\/drafts\.js'/);
    assert.match(src, /askSend\(/);
    assert.match(src, /className="ans-send"/);
  }
  assert.doesNotMatch(inbox, /starts( working)? once all/, 'the all-or-nothing copy is gone');
  assert.doesNotMatch(working, /if \(Object\.keys\(next\)\.length < qs\.length\) return;/, 'a partial set is no longer held back');
  const nexus = read('../src/styles/nexus.css');
  assert.doesNotMatch(nexus, /\.ans-(field|send|state)/, 'the new classes live in answers.css, not nexus.css');
});
