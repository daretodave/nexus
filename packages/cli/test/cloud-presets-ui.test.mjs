// The Cloud step offers the five cadence presets (spec 55, A9): step 4's picker (CloudSetup.jsx SchedulePicker,
// schedOptions, nextLine) rendered alone from GET /api/actions' schedule, the cron each option sends
// (cloudFlow.js cronFor), and Launch's Cloud line for what was turned on. Static renders; nothing is fetched.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const { SchedulePicker, schedOptions, nextLine } = await import('../src/screens/onboarding/CloudSetup.jsx');
const { CADENCES, cronFor, cadenceSub, pickSched } = await import('../src/screens/onboarding/cloudFlow.js');
const { cloudLine } = await import('../src/screens/onboarding/Launch.jsx');

const FOUND = { path: '.github/workflows/march.yml', crons: ['0 2,8,14,20 * * *'], cron: '0 2,8,14,20 * * *', human: 'every 6 hours (02:00, 08:00, 14:00, 20:00 UTC)', label: 'Every 6 hours (02:00, 08:00, 14:00, 20:00 UTC)', raw: false, next: null };
const NONE = { path: '.github/workflows/march.yml', crons: [], cron: null, human: 'on demand', raw: false, next: null };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const render = (found, picked = null) => {
  const sched = pickSched(picked, found);
  return { sched, html: renderToStaticMarkup(createElement(SchedulePicker, { options: schedOptions(found), sched, found, onPick() {} })) };
};

test('a repo with no loop workflow: the five presets then overnight, steady selected', () => {
  const { sched, html } = render(null);
  assert.equal(sched, 'steady');
  const ids = [...html.matchAll(/id="sc-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['calm', 'steady', 'eager', 'sprint', 'off', 'night']);
  assert.match(html, /id="sc-steady" name="sched" checked=""/);
  assert.equal((html.match(/checked=""/g) || []).length, 1);
  for (const label of ['Calm', 'Steady', 'Eager', 'Sprint', 'Off', 'Overnight']) assert.match(html, new RegExp(`<b>${label}</b>`));
  const t = text(html);
  assert.match(t, /Eager every 3 hours · chains up to 3 · 20 commits a day/);
  assert.match(t, /Calm every 6 hours · 8 commits a day/);
  assert.match(t, /Off no schedule · when you press Run one pass/);
  assert.match(t, /Overnight custom: every hour at :30/);
  assert.match(t, /cron 17 \*\/3 \* \* \* · sets NEXUS_CADENCE to steady/, 'the line under the options names the cron and the variable');
});

test('a workflow with a schedule keeps it first and selected; one with none has off as its current', () => {
  const kept = render(FOUND);
  assert.equal(kept.sched, 'current');
  assert.match(kept.html, /^<div class="sched"[^>]*><input type="radio" id="sc-current" name="sched" checked=""/);
  assert.match(text(kept.html), /Current: every 6 hours .* Turn on keeps it/);
  const none = render(NONE);
  assert.equal(none.sched, 'off');
  assert.match(text(none.html), /Off current: no schedule; Turn on keeps it/);
  assert.doesNotMatch(none.html, /id="sc-current"/);
  const picked = render(FOUND, 'sprint');
  assert.match(picked.html, /id="sc-sprint" name="sched" checked=""/);
  assert.match(text(picked.html), /sets NEXUS_CADENCE to sprint/);
});

test('each option sends its own cron: a preset the table\'s, overnight the converted one, current the found one', () => {
  for (const [k, c] of Object.entries(CADENCES)) assert.equal(cronFor(k), c.cron || '', k);
  assert.equal(cronFor('night', { night: '30 0-5 * * *' }), '30 0-5 * * *');
  assert.equal(cronFor('current', { found: FOUND }), FOUND.cron);
  assert.equal(cronFor('nope'), '');
  assert.equal(cadenceSub('nope'), '');
  assert.match(nextLine('off', NONE), /No schedule\. .* sets NEXUS_CADENCE to off/);
  assert.equal(nextLine('nope', NONE), '');
});

test('Launch says what was turned on: the preset, its first run, and a variable still to set', () => {
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: true, sched: 'steady', cadenceSet: true }), 'Steady, every 3 hours · first run within three hours');
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: true, sched: 'calm', cadenceSet: true }), 'Calm, every 6 hours · first run within six hours');
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: true, sched: 'off', cadenceSet: true }), 'Off, only on demand · runs when you press Run one pass');
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: true, sched: 'eager', cadenceSet: false }), 'Eager, every 3 hours, chains up to 3 · first run within three hours · NEXUS_CADENCE still to set');
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: true, sched: 'night' }), 'Overnight, 01:30 to 06:30 · first run tonight');
  assert.equal(cloudLine({ cloud: 'on', cloudSaved: false, sched: null }), 'Steady, every 3 hours · finish it in Cloud loop');
  assert.equal(cloudLine({ cloud: 'skipped' }), 'Off · it runs on this machine only');
});
