// The model and effort on screen (spec 54, A1): the cockpit's badge and its menu (effort limited to the model's
// levels, none for a model without effort, the pending switch named), the Fleet tile's model line, and Settings'
// "Model / Effort for new sessions" with the helpers' model named.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// src/data/client.js reads its token from the address bar when it loads (the Fleet tile pulls it in).
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const VIEW = {
  models: [
    { id: 'claude-fable-5-1', label: 'Fable 5.1', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { id: 'claude-opus-5-5', label: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', efforts: ['low', 'medium', 'high'] },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5', efforts: [] },
  ],
  helper: { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  lastModel: 'claude-opus-5-5',
};
const routed = (el) => renderToStaticMarkup(createElement(MemoryRouter, null, el));

test('the badge reads the SDK\'s model and effort, and "model: starting…" before it', async () => {
  const { default: ModelBadge } = await import('../src/screens/cockpit/ModelBadge.jsx');
  const on = renderToStaticMarkup(createElement(ModelBadge, { model: 'claude-opus-5-5', effort: 'high', view: VIEW }));
  assert.match(on, /class="btn btn-s model-badge"/);
  assert.match(on, /Opus 5\.5 · high/);
  assert.match(on, /title="claude-opus-5-5"/);
  const starting = renderToStaticMarkup(createElement(ModelBadge, { model: null, effort: null }));
  assert.match(starting, /model: starting…/);
  assert.match(starting, /is-starting/);
  const noEffort = renderToStaticMarkup(createElement(ModelBadge, { model: 'claude-haiku-5-5', effort: null }));
  assert.match(noEffort, />Haiku 5\.5</, 'a model without effort shows no effort');
  const pend = renderToStaticMarkup(createElement(ModelBadge, { model: 'claude-opus-5-5', effort: 'high', pending: { model: 'claude-sonnet-5-5', effort: 'low' } }));
  assert.match(pend, /Opus 5\.5 · high/, 'the badge keeps what runs until the SDK confirms');
  assert.match(pend, /applies from the next turn/);
});

test('the menu: the list with the default first, the model\'s own effort levels, none for Haiku, the pending switch said', async () => {
  const { ModelMenu, modelMenu, levelsIn } = await import('../src/screens/cockpit/ModelBadge.jsx');
  const m = modelMenu({ model: 'claude-opus-5-5[1m]', effort: 'high', view: VIEW });
  assert.deepEqual(m.models.map((x) => x.label), ['Claude Code\'s default', 'Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
  assert.equal(m.models.find((x) => x.active).label, 'Opus 5.5');
  assert.deepEqual(m.efforts.map((x) => x.id), ['', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(m.efforts.find((x) => x.active).id, 'high');
  assert.equal(m.note, null);
  assert.match(m.models[0].desc, /resolved to Opus 5\.5/);

  const sonnet = modelMenu({ model: 'claude-opus-5-5', effort: 'high', pending: { model: 'claude-sonnet-5-5', effort: 'low' }, view: VIEW });
  assert.deepEqual(sonnet.efforts.map((x) => x.id), ['', 'low', 'medium', 'high'], 'the pending model\'s levels');
  assert.equal(sonnet.note, 'Sonnet 5.5 · low applies from the next turn');

  const haiku = modelMenu({ model: 'claude-haiku-5-5', effort: null, view: VIEW });
  assert.deepEqual(haiku.efforts, [], 'a model without effort offers none');
  assert.deepEqual(levelsIn(null, 'claude-sonnet-5-5'), ['low', 'medium', 'high', 'xhigh', 'max'], 'unknown: all five');

  const picks = [];
  const html = renderToStaticMarkup(createElement(ModelMenu, { model: 'claude-haiku-5-5', view: VIEW, onPick: (p) => picks.push(p) }));
  assert.match(html, /aria-label="Model and effort"/);
  assert.doesNotMatch(html, /Effort/, 'no effort section for Haiku');
  assert.equal((html.match(/role="menuitemradio"/g) || []).length, 5);
  const full = renderToStaticMarkup(createElement(ModelMenu, { model: 'claude-opus-5-5', effort: 'low', view: VIEW }));
  assert.match(full, /aria-label="Effort"/);
  assert.match(full, /class="model-effort is-active"[^>]*>low</);
});

test('the cockpit top bar draws the badge for a hosted session only', async () => {
  const { default: CockpitTop } = await import('../src/screens/cockpit/CockpitTop.jsx');
  const base = { session: { id: 'a', name: 'vega', kind: 'local' }, sessions: [], repo: 'r', owner: true, runMode: 'size', onRunMode() {}, pause: { state: 'run' }, onPause() {} };
  const hosted = routed(createElement(CockpitTop, { ...base, model: { model: 'claude-sonnet-5-5', effort: 'low', view: VIEW, onPick() {} } }));
  assert.match(hosted, /Sonnet 5\.5 · low/);
  const terminal = routed(createElement(CockpitTop, { ...base, model: null }));
  assert.doesNotMatch(terminal, /model-badge/);
  const src = read('../src/screens/Cockpit.jsx');
  assert.match(src, /api\(`\$\{base\}\/model`, pick\)/, 'a pick goes to POST /api/sessions/:id/model');
  assert.match(src, /live\.status\?\.model/, 'the badge reads the session channel\'s status');
});

test('a Fleet tile shows a hosted session\'s model small; a terminal one shows none', async () => {
  const { default: SessionTile } = await import('../src/screens/fleet/SessionTile.jsx');
  const train = { active: false, isPaused: () => false };
  const row = { id: 'a', session: { id: 'a', name: 'vega', kind: 'local' }, name: 'vega', kind: 'local', state: 'live', git: {}, mode: 'owner' };
  const on = routed(createElement(SessionTile, { s: { ...row, model: 'claude-opus-5-5', effort: 'high' }, train, now: Date.now() }));
  assert.match(on, /class="tile-model"[^>]*>Opus 5\.5 · high</);
  const starting = routed(createElement(SessionTile, { s: { ...row, model: null, effort: null }, train, now: Date.now() }));
  assert.match(starting, /class="tile-model">model: starting…</);
  const terminal = routed(createElement(SessionTile, { s: { ...row, kind: 'terminal', state: 'observing' }, train, now: Date.now() }));
  assert.doesNotMatch(terminal, /tile-model/);
});

test('Settings: Model for new sessions (the default labelled, the four), Effort limited to the model, the helpers named', async () => {
  const { ModelPrefs, modelChoices, effortChoices } = await import('../src/screens/cloud-settings/model-pref.jsx');
  assert.deepEqual(modelChoices(VIEW).map((c) => [c.value, c.label]), [
    ['', 'Claude Code\'s default'], ['claude-fable-5-1', 'Fable 5.1'], ['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5'],
  ]);
  assert.match(modelChoices(VIEW)[0].sub, /Opus 5\.5 on the last session/);
  assert.doesNotMatch(modelChoices(null)[0].sub, /last session/);
  assert.deepEqual(effortChoices('', VIEW).map((c) => c.value), ['', 'low', 'medium', 'high', 'xhigh', 'max'], 'the default: all five');
  assert.deepEqual(effortChoices('claude-sonnet-5-5', VIEW).map((c) => c.value), ['', 'low', 'medium', 'high']);
  assert.deepEqual(effortChoices('claude-haiku-5-5', VIEW), []);

  const html = (props) => renderToStaticMarkup(createElement(ModelPrefs, { view: VIEW, ...props }));
  const def = html({});
  assert.match(def, /aria-label="Model for new sessions"/);
  assert.equal((def.match(/name="model-pref"/g) || []).length, 5);
  assert.match(def, /checked="" value=""/);
  assert.match(def, /aria-label="Effort for new sessions"/);
  assert.match(def, /Explode and summaries: Haiku 5\.5/);
  const sonnet = html({ model: 'claude-sonnet-5-5', effort: 'max' });
  assert.match(sonnet, /checked="" value="claude-sonnet-5-5"/);
  assert.doesNotMatch(sonnet, /id="model-pref-effort-max"/, 'Sonnet 5.5 offers no max');
  const haiku = html({ model: 'claude-haiku-5-5' });
  assert.match(haiku, /Haiku 5\.5 takes no effort level/);
  assert.doesNotMatch(haiku, /aria-label="Effort for new sessions"/);

  const src = read('../src/screens/Settings.jsx');
  assert.match(src, /Model for new sessions/);
  assert.match(src, /import '\.\.\/styles\/model\.css'/);
  const css = read('../src/styles/model.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'tokens only, so both themes follow');
});
