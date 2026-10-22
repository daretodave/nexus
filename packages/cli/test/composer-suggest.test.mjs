// A17: plain text in the composer goes to the session as typed; a guessed route (/bug, /plot) is a chip the
// person can accept, never a command silently prefixed to their words.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { promptFor, routeFor, routeShowing, suggestFor } from '../src/screens/cockpit/compose.js';

// The two lines seen live, which went out as `/bug ...` and `/plot ...`.
const SEEN = [
  'This is a rendering test of the GUI. First use the Grep tool to find the word error, then fix nothing.',
  'Rendering test, no tools: reply with just the word ok. A list:\n- one\n- two',
];

test('send: plain text with no route armed goes exactly as typed, whatever the classifier thinks', () => {
  for (const text of [...SEEN, 'the export button is broken', 'add a dark mode toggle', 'why is it red?']) {
    const route = routeFor(text, null);
    assert.equal(route, null, 'nothing armed from a guess');
    assert.equal(promptFor(text, { route }), text.trim());
    assert.equal(promptFor(text, { route, plotMode: 'do' }), text.trim(), 'plan-it-and-do-it needs an armed /plot');
  }
});

test('a slash command routes as typed', () => {
  assert.equal(routeFor('/bug x', 'plot'), null);
  assert.equal(promptFor('/bug the save button\nis broken'), '/bug the save button\nis broken');
  assert.equal(promptFor('/explode one\ntwo'), '/messy one\ntwo');
});

test('the suggestion: bug-like text suggests /bug, task-like /plot; dismissed or armed, none', () => {
  assert.equal(suggestFor(SEEN[0], null, false), 'bug');
  assert.equal(suggestFor('add a dark mode toggle to settings', null, false), 'plot');
  assert.equal(suggestFor('why is the gate red?', null, false), null);
  assert.equal(suggestFor('/bug x', null, false), null);
  assert.equal(suggestFor(SEEN[0], null, true), null, 'dismissed');
  assert.equal(suggestFor(SEEN[0], 'ask', false), null, 'the person armed a route');
  assert.equal(routeShowing(SEEN[0], suggestFor(SEEN[0], null, false), 'normal'), true);
});

test('accepting the chip sends /bug <text>, the text intact, newlines kept', () => {
  const text = 'the save button is broken\n\nsteps:\n- open settings\n- press save';
  assert.equal(promptFor(text, { as: 'bug' }), `/bug ${text}`);
  assert.equal(promptFor(text, { as: 'plot' }), `/plot ${text}`);
});

test('an armed route is the person\'s and is kept: /plot (and do), nudge, ask', () => {
  assert.equal(routeFor('add export', 'plot'), 'plot');
  assert.equal(promptFor('add export', { route: 'plot' }), '/plot add export');
  assert.equal(promptFor('add export', { route: 'plot', plotMode: 'do' }), '/plot add export and do');
  assert.equal(promptFor('fix the crash', { route: 'nudge' }), 'fix the crash');
  assert.equal(promptFor('fix the crash', { route: 'ask' }), 'fix the crash');
  assert.equal(promptFor('fix it', { route: 'ask', as: 'bug' }), '/bug fix it', 'an accepted chip wins for that send');
});

test('the composer shows the chip for bug-like text and Enter is "send as typed"; accepting calls onSend(text, "bug")', async () => {
  const { Composer, SuggestChip } = await import('../src/ui/composer.jsx');
  const html = renderToStaticMarkup(createElement(Composer, { dock: true, value: SEEN[0], suggest: 'bug', onRoute() {}, onDismissSuggest() {} }));
  assert.match(html, /class="route-suggest"/);
  assert.match(html, /Looks like a bug/);
  assert.match(html, /send as<\/span><span class="cmd">\/bug<\/span>/);
  assert.match(html, /send as typed/);
  assert.match(html, /class="composer has-route"/);
  // No guess: no chip, no route row.
  const none = renderToStaticMarkup(createElement(Composer, { dock: true, value: SEEN[0] }));
  assert.doesNotMatch(none, /route-suggest|class="route[ "]/);
  // Armed: the chip is the person's route, not a suggestion.
  const armed = renderToStaticMarkup(createElement(Composer, { dock: true, value: 'add export', route: 'plot', suggest: 'plot', onRoute() {} }));
  assert.doesNotMatch(armed, /route-suggest"/);
  assert.match(armed, /<span class="cmd">\/plot<\/span>/);
  // The chip's own click hands the route back with the text.
  const sent = [];
  const el = SuggestChip({ route: 'bug', onAccept: () => sent.push(['x', 'bug']) });
  const send = el.props.children.find((c) => c?.props?.className === 'route route-suggest-send');
  send.props.onClick();
  assert.deepEqual(sent, [['x', 'bug']]);
});
