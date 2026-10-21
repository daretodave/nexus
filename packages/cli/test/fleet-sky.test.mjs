// Each star's own seats and idle curve on its fleet tile (41.8, A8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatsFor, idleCurve, filFor, QUADS } from '../src/screens/fleet/sky.js';

// ---- idle curves -----------------------------------------------------------

test('an idle agent\'s filament leaves the main orb sideways: deneb\'s board curve', () => {
  assert.equal(idleCurve('M0 0C0 50 100 50 100 100'), 'M0 0C40 0 60 100 100 100');
  assert.equal(idleCurve('M100 100C100 50 0 50 0 0'), 'M100 100C60 100 40 0 0 0');
  assert.equal(idleCurve('M0 100C0 50 100 50 100 0'), 'M0 100C40 100 60 0 100 0');
});

test('each star seats its agents as its board draws it; others take the quadrants', () => {
  const deneb = seatsFor('deneb');
  assert.deepEqual(deneb.slice(0, 3).map((s) => [s.x, s.y]), [['26%', '26%'], ['76%', '24%'], ['78%', '70%']]);
  assert.deepEqual(deneb[2].fil, { l: '50%', t: '46%', w: '28%', h: '24%', d: 'M0 0C0 50 100 50 100 100' });
  assert.deepEqual(seatsFor('altair')[0], { x: '30%', y: '26%', fil: { l: '30%', t: '26%', w: '20%', h: '20%', d: 'M100 100C100 50 0 50 0 0' } });
  assert.deepEqual(seatsFor('vega'), QUADS);
  assert.deepEqual(seatsFor('sirius'), QUADS);
  assert.deepEqual(seatsFor('polaris'), QUADS);
  for (const n of ['vega', 'sirius', 'deneb', 'altair']) assert.equal(seatsFor(n).length, 4);
});

test('deneb\'s idle agent draws the board\'s quiet curve, from the session\'s own agents', () => {
  const seat = seatsFor('deneb')[2];
  assert.deepEqual(filFor(seat, { state: 'idle' }), { l: '50%', t: '46%', w: '28%', h: '24%', d: 'M0 0C40 0 60 100 100 100', kind: 'quiet', flow: false });
  const busy = filFor(seat, { state: 'tool' });
  assert.equal(busy.d, 'M0 0C0 50 100 50 100 100');
  assert.equal(busy.kind, undefined);
  assert.equal(busy.flow, true);
  // Unknown state: no idle curve is invented.
  const unknown = filFor(seat, {});
  assert.equal(unknown.d, seat.fil.d);
  assert.equal(unknown.kind, undefined);
  assert.equal(unknown.flow, false);
  // Observing (a terminal session): quiet on the plain curve, never the idle one.
  assert.equal(filFor(seat, { state: 'idle' }, { observing: true }).d, seat.fil.d);
  assert.equal(filFor(seat, { workflow: true }).kind, 'flow');
});
