// The transcript's scroll pin (spec 47): it opens and stays at the newest message while it streams; scrolled up,
// it stays put (no yank) until the person comes back to the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICK_SLACK, atBottom, pinAfterScroll, stickTarget } from '../src/screens/cockpit/stick.js';

const box = (scrollTop, scrollHeight = 2000, clientHeight = 500) => ({ scrollTop, scrollHeight, clientHeight });

test('the bottom, give or take the slack, is the bottom', () => {
  assert.equal(atBottom(box(1500)), true);
  assert.equal(atBottom(box(1500 - STICK_SLACK)), true);
  assert.equal(atBottom(box(1500 - STICK_SLACK - 1)), false);
  assert.equal(atBottom(box(0, 300, 500)), true, 'a short transcript is always at its bottom');
  assert.equal(atBottom(box(1499.5)), true, 'a fractional scrollTop still counts');
});

test('pinned, a streamed message scrolls to the new bottom', () => {
  let pinned = true;
  let m = box(1500);
  m = { ...m, scrollHeight: 2300 }; // a message streamed in
  const top = stickTarget(pinned, m);
  assert.equal(top, 1800);
  pinned = pinAfterScroll({ ...m, scrollTop: top }); // the scroll that setting it fires
  assert.equal(pinned, true);
});

test('scrolled up, a streamed message leaves the reader where they are; back at the bottom, it pins again', () => {
  let pinned = pinAfterScroll(box(900)); // the person scrolled up
  assert.equal(pinned, false);
  assert.equal(stickTarget(pinned, box(900, 2600)), null, 'no yank');
  pinned = pinAfterScroll(box(2100, 2600));
  assert.equal(pinned, true);
  assert.equal(stickTarget(pinned, box(2100, 2900)), 2400);
});

test('the first render opens at the newest message', () => {
  assert.equal(stickTarget(true, box(0)), 1500);
  assert.equal(stickTarget(true, box(0, 300, 500)), 0);
});
