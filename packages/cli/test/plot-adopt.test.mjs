// Onboarding adopts before it plots (spec 52, A1): on a repo nexus is not in yet, the Plot step holds the kept ideas,
// offers Adopt now (the home session adopts, POST /api/adopt), and plots them once adoption lands, by itself when the
// person had already asked, else with one click. The spec line names no plan file in a repo with no plan.
// POST /api/plot's refusal (409 { adopt: true }) is in explode.test.mjs.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { nexusIn, plotGate, plotKeptLabel, needsAdopt } from '../src/screens/onboarding/plotGate.js';
import { DEFAULT_DRAFT } from '../src/screens/onboarding/draft.js';

// The data client reads its launch token from the page at import: a bare page for the screens imported here.
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const render = (node) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

test('nexusIn reads the state the way Detect does, plus a nexus.lock pin; unknown until the state loads', () => {
  assert.equal(nexusIn(null), null);
  assert.equal(nexusIn(undefined), null);
  assert.equal(nexusIn({ adopted: false, kit: null }), false);
  assert.equal(nexusIn({ adopted: true, kit: null }), true);
  assert.equal(nexusIn({ adopted: false, kit: { version: '2.0.0', ref: null } }), true);
});

test('the gate: hold and offer adopt, wait while adopting, then plot the held ideas (auto) or offer one click', () => {
  // Nothing to hold, already plotted, or state unknown: the step plots as it always did.
  assert.equal(plotGate({ nexus: false, kept: 0 }), 'open');
  assert.equal(plotGate({ nexus: false, kept: 2, plotted: true }), 'open');
  assert.equal(plotGate({ nexus: null, kept: 2 }), 'open');
  assert.equal(plotGate({ nexus: true, kept: 2 }), 'open');
  // A repo nexus is not in: the kept ideas are held, Adopt now offered.
  assert.equal(plotGate({ nexus: false, kept: 3 }), 'adopt');
  assert.equal(plotGate({ nexus: false, kept: 3, held: true }), 'adopt');
  // Adopt sent: waiting for the state to turn.
  assert.equal(plotGate({ nexus: false, kept: 3, adopt: 'sent' }), 'adopting');
  assert.equal(plotGate({ nexus: false, kept: 3, adopt: 'sent', held: true }), 'adopting');
  // Adoption landed: one click, or by itself when the person had pressed Next.
  assert.equal(plotGate({ nexus: true, kept: 3, adopt: 'sent' }), 'landed');
  assert.equal(plotGate({ nexus: true, kept: 3, adopt: 'sent', held: true }), 'auto');
  assert.equal(plotGate({ nexus: true, kept: 3, adopt: 'sent', held: true, plotted: true }), 'open');
  // The draft keeps both across a reload.
  assert.equal(DEFAULT_DRAFT.adopt, null);
  assert.equal(DEFAULT_DRAFT.plotHeld, false);
});

test('a 409 with the adopt flag reads as "adopt first"; other errors do not', () => {
  assert.equal(needsAdopt({ status: 409, data: { error: 'x', adopt: true } }), true);
  assert.equal(needsAdopt({ status: 409, data: { error: 'x' } }), false);
  assert.equal(needsAdopt({ status: 400, data: { adopt: true } }), false);
  assert.equal(needsAdopt(null), false);
  assert.equal(plotKeptLabel(3), 'Plot the 3 kept ideas');
  assert.equal(plotKeptLabel(1), 'Plot the kept idea');
});

test('the Plot step says nexus isn\'t here, offers Adopt now, waits, then offers to plot the kept ideas', async () => {
  const { AdoptGate } = await import('../src/screens/onboarding/Plot.jsx');
  const props = { kept: 3, held: false, err: null, plotting: false, onAdopt() {}, onPlot() {} };
  assert.equal(render(createElement(AdoptGate, { ...props, gate: 'open' })), '');

  const adopt = render(createElement(AdoptGate, { ...props, gate: 'adopt' }));
  assert.match(adopt, /nexus isn(&#x27;|')t in this repo yet/);
  assert.match(adopt, />Adopt now</);
  assert.match(adopt, /3 kept ideas stay here/);
  const held = render(createElement(AdoptGate, { ...props, gate: 'adopt', held: true }));
  assert.match(held, /3 kept ideas wait here and plot as soon as it lands/);

  const adopting = render(createElement(AdoptGate, { ...props, gate: 'adopting' }));
  assert.doesNotMatch(adopting, />Adopt now</, 'one adopt at a time');
  assert.match(adopting, /Adopting in the home session/);
  assert.match(adopting, /href="\/s\/main"/, 'watch the home session adopt');

  const landed = render(createElement(AdoptGate, { ...props, gate: 'landed' }));
  assert.match(landed, /nexus is in\./);
  assert.match(landed, />Plot the 3 kept ideas</);
  const auto = render(createElement(AdoptGate, { ...props, gate: 'auto' }));
  assert.match(auto, /Plotting your held ideas now/);
  assert.doesNotMatch(auto, /<button/);

  const failed = render(createElement(AdoptGate, { ...props, gate: 'adopt', err: 'no home session' }));
  assert.match(failed, /Adopt did not start: no home session/);
});

test('a repo with no plan names no plan file: "the first spec, once nexus is in"', async () => {
  const { specWords } = await import('../src/screens/onboarding/Plot.jsx');
  // explode proposes plan/01-... even with no plan; before adoption the step does not claim it.
  assert.deepEqual(specWords('plan/01-fix-login.md', { n: 1, prefix: 'plan/01-', fresh: true }, false), { code: null, words: 'the first spec (once nexus is in)' });
  assert.deepEqual(specWords('plan/04-fix-login.md', { n: 4, prefix: 'plan/04-', fresh: false }, false), { code: null, words: 'the first spec (once nexus is in)' });
  // Adopted, or not known yet: as before.
  assert.deepEqual(specWords('plan/48-x.md', null, true), { code: 'plan/48-x.md', words: '' });
  assert.deepEqual(specWords('plan/48-x.md', null, null), { code: 'plan/48-x.md', words: '' });
  assert.deepEqual(specWords('plan/48-x.md', null), { code: 'plan/48-x.md', words: '' });
  // The step wires the gate: Next holds instead of plotting, and the Planned cap drops the file.
  const src = read('../src/screens/onboarding/Plot.jsx');
  assert.match(src, /if \(gate === 'adopt' \|\| gate === 'adopting'\) \{ patch\(\{ plotHeld: true \}\); return; \}/);
  assert.match(src, /const specFile = nexus === false \? null/);
  assert.match(src, /server\.adopt\(\)/);
});
