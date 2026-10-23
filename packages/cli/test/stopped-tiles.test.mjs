// The tiles of sessions that stopped with nexus (a restart, an upgrade), rendered on the server: calm (no red, no
// flag), "stopped with nexus", the words for each way it stopped, Pick up first and Put away where nothing is
// mid-flight; and the tiles that were already there (fell over, ended, in a terminal) unchanged.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { norm } from '../src/screens/fleet/model.js';

globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
const { default: SessionTile, stoppedWords } = await import('../src/screens/fleet/SessionTile.jsx');

const routed = (el) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const train = { active: false, isPaused: () => false };
const AT = '2026-10-23T11:58:00.000Z';
const stopped = (stop, over = {}) => norm({
  id: 'd1', name: 'deneb', kind: 'local', state: 'stopped', gui: true, git: { branch: 'nexus/deneb-1', worktree: '/wt/deneb-1', ahead: 0, up: 0, dirty: 0, claims: 0 },
  last: { kind: 'text', text: 'Sweeping the venues.', at: AT }, stop: { at: AT, clean: true, turn: 'idle', queued: 0, ...stop }, ...over,
});
const tile = (s) => routed(createElement(SessionTile, { s, train, now: Date.parse('2026-10-23T12:00:00Z'), onPickup: () => {}, onPutAway: () => {} }));

test('a stopped tile is calm: "stopped with nexus", its last words, Pick up then Put away; never fell over', () => {
  const html = tile(stopped({}));
  assert.match(html, /stopped with nexus/);
  assert.match(html, /Stopped when nexus restarted\. Its conversation and worktree are kept\./);
  assert.match(html, /Sweeping the venues\./, 'its last words stay');
  assert.match(html, />Pick up</);
  assert.match(html, />Put away</);
  assert.match(html, /tone-stopped/);
  assert.doesNotMatch(html, /fell over|st-fallen|flag/i);
  assert.match(html, /href="\/s\/d1"/, 'it opens its own cockpit, never an empty Recover');
});

test('each way of stopping says so, and Put away waits while something is mid-flight', () => {
  assert.deepEqual(stoppedWords(stopped({ turn: 'working' })), { lines: ['Stopped mid-step when nexus restarted. Pick up to finish the step.'], away: false });
  assert.deepEqual(stoppedWords(stopped({ turn: 'forming', queued: 1 })).lines, ['Stopped while its worktree was being made. Pick up to finish it and send your message.', '1 message waiting to send.']);
  assert.match(stoppedWords(stopped({ clean: false, turn: null })).lines[0], /closed without saying goodbye/);
  assert.match(stoppedWords(stopped({ clean: false, turn: null, legacy: true })).lines[0], /^Stopped when the older nexus closed/, 'a 0.5.1 ledger never reads as a crash');
  assert.match(stoppedWords(stopped({ turn: 'idle', train: true })).lines[0], /Parked by its reboot train/);
  assert.match(stoppedWords(stopped({ note: 'the last pick-up did not finish' })).lines[0], /The last pick-up did not finish/);
  assert.match(stoppedWords(stopped({ paused: true })).lines[0], /^Paused when nexus restarted/);
  assert.match(stoppedWords(stopped({}, { git: { missing: true } })).lines[1], /worktree folder is gone; Pick up brings it back/);
  const working = tile(stopped({ turn: 'working' }));
  assert.match(working, />Pick up</);
  assert.doesNotMatch(working, />Put away</);
});

test('a stopped session holding a question asks to be answered to pick up', () => {
  const html = tile(norm({ id: 'a', name: 'altair', kind: 'local', state: 'asking', questions: { answered: 0, total: 1 }, stop: { clean: true, turn: 'asking' } }));
  assert.match(html, /Answer 1 to pick up/);
  const fresh = tile(norm({ id: 'b', name: 'sirius', kind: 'local', state: 'asking', questions: { answered: 0, total: 2 } }));
  assert.match(fresh, /Answer 2 to start/, 'a start question still reads as before');
});

test('the tiles that were already there are unchanged: fell over, ended, in a terminal', () => {
  const fallen = tile(norm({ id: 'f', name: 'rigel', kind: 'terminal', state: 'fallen', fell: { chunk: '7.6' } }));
  assert.match(fallen, /fell over/);
  assert.match(fallen, />Resume</);
  const ended = routed(createElement(SessionTile, { s: norm({ id: 'e', name: 'mira', gui: true, state: 'stopped', ended: true, git: { ahead: 0 } }), train, now: Date.now(), onClose: () => {} }));
  assert.match(ended, /clearing it loses nothing/);
  assert.match(ended, />Clear</);
  const term = tile(norm({ id: 't', name: 'c0ffee12', kind: 'terminal', state: 'live' }));
  assert.match(term, /Running in another terminal/);
});

test('the error card blames an update only when a screen\'s code could not be fetched', async () => {
  const { codeGone } = await import('../src/ui/ErrorBoundary.jsx');
  assert.equal(codeGone(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:1/assets/Fleet-abc.js')), true);
  assert.equal(codeGone(new TypeError('Importing a module script failed.')), true);
  assert.equal(codeGone(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
});
