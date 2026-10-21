// The board's grip and Reassign's picker (spec 40 A12), as pure rules: the keyboard reorder (arrows move the preview,
// Enter places, Escape puts back), the drag preview, the call a move makes, and who a claim can be reassigned to.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveTo, moveOf, gripKey, dragOrder, inOrder, gripSays, reassignTargets, reassignBody, PRIVILEGED,
} from '../src/screens/board/model.js';

const LIST = ['07.2', '07.3', '07.4', '07.5'];

test('moveTo and moveOf: a move is one chunk, named by the open chunk it follows', () => {
  assert.deepEqual(moveTo(LIST, '07.2', 2), ['07.3', '07.4', '07.2', '07.5']);
  assert.deepEqual(moveTo(LIST, '07.5', -3), ['07.5', '07.2', '07.3', '07.4']);
  assert.deepEqual(moveTo(LIST, '07.9', 0), LIST);
  assert.deepEqual(moveOf(LIST, ['07.3', '07.4', '07.2', '07.5'], '07.2'), { id: '07.2', after: '07.4' });
  assert.deepEqual(moveOf(LIST, ['07.5', '07.2', '07.3', '07.4'], '07.5'), { id: '07.5', after: null });
  assert.equal(moveOf(LIST, LIST, '07.2'), null);
  // two chunks moved is not one move
  assert.equal(moveOf(LIST, ['07.3', '07.2', '07.5', '07.4'], '07.2'), null);
});

test('the keyboard: arrows move the preview, Home and End jump, Enter places, Escape puts it back', () => {
  let r = gripKey(null, 'ArrowDown', LIST, '07.2');
  assert.equal(r.handled, true);
  assert.deepEqual(r.st, { id: '07.2', order: ['07.3', '07.2', '07.4', '07.5'] });
  r = gripKey(r.st, 'ArrowDown', LIST, '07.2');
  assert.deepEqual(r.st.order, ['07.3', '07.4', '07.2', '07.5']);
  assert.equal(gripSays(r.st), '07.2: place 3 of 4. Enter places it, Escape puts it back.');
  // the ends clamp
  assert.deepEqual(gripKey(r.st, 'End', LIST, '07.2').st.order, ['07.3', '07.4', '07.5', '07.2']);
  assert.deepEqual(gripKey({ id: '07.2', order: LIST }, 'ArrowUp', LIST, '07.2').st.order, LIST);
  assert.deepEqual(gripKey(null, 'Home', LIST, '07.4').st.order, ['07.4', '07.2', '07.3', '07.5']);
  // Enter places: the call it makes
  const placed = gripKey(r.st, 'Enter', LIST, '07.2');
  assert.deepEqual(placed, { st: null, commit: { id: '07.2', after: '07.4' }, handled: true });
  assert.deepEqual(gripKey(r.st, ' ', LIST, '07.2').commit, { id: '07.2', after: '07.4' });
  // back where it was: nothing to call
  const back = gripKey(gripKey(r.st, 'ArrowUp', LIST, '07.2').st, 'ArrowUp', LIST, '07.2');
  assert.equal(gripKey(back.st, 'Enter', LIST, '07.2').commit, null);
  // Escape puts it back; Enter on a grip at rest calls nothing
  assert.deepEqual(gripKey(r.st, 'Escape', LIST, '07.2'), { st: null, handled: true });
  assert.equal(gripKey(null, 'Enter', LIST, '07.2').commit, null);
  // another chunk's grip starts from the list, not the other preview
  assert.deepEqual(gripKey(r.st, 'ArrowDown', LIST, '07.4').st, { id: '07.4', order: ['07.2', '07.3', '07.5', '07.4'] });
  // keys that aren't the grip's pass through; a chunk not in the list (closed) never moves
  assert.equal(gripKey(r.st, 'Tab', LIST, '07.2').handled, false);
  assert.equal(gripKey(null, 'ArrowDown', LIST, '07.1').handled, false);
});

test('the drag preview and the rows it reorders, closed rows kept in their slots', () => {
  assert.deepEqual(dragOrder(LIST, '07.2', '07.4', false), ['07.3', '07.2', '07.4', '07.5']);
  assert.deepEqual(dragOrder(LIST, '07.2', '07.4', true), ['07.3', '07.4', '07.2', '07.5']);
  assert.deepEqual(dragOrder(LIST, '07.5', '07.2', false), ['07.5', '07.2', '07.3', '07.4']);
  assert.deepEqual(dragOrder(LIST, '07.2', '09.1', true), LIST);
  const rows = [{ id: '07.1', closed: true }, { id: '07.2' }, { id: '07.3' }, { id: '07.4' }];
  assert.deepEqual(inOrder(rows, ['07.4', '07.2', '07.3']).map((r) => r.id), ['07.1', '07.4', '07.2', '07.3']);
  assert.equal(inOrder(rows, null), rows);
});

const ROWS = [
  { id: '07.2', who: 'Sam Lee', session: 'sam00001', star: 'vega', state: 'live' },
  { id: '07.3', who: 'Sam Lee', session: 'sam00002', star: 'deneb', state: 'live' },
  { id: '07.4', who: 'Jun Park', session: 'jun00001', state: 'held', held: 'junpark' },
  { id: '07.5', who: PRIVILEGED, session: 'ownr0001', state: 'live', mine: true },
  { id: '07.6', who: 'nexus', session: 'cloud-123', state: 'live' },
  { id: '09', who: 'Ada', session: 'ada00001', star: 'altair', state: 'live' },
];
const OWNER = { owner: true, ownerName: 'you', meWho: PRIVILEGED };

test('the picker lists the owner, then each claimant by name, then someone else; never the holder or the loop', () => {
  const t = reassignTargets(ROWS, OWNER, '07.2');
  assert.deepEqual(t.map((x) => x.key), ['owner', 'p:Ada', 'p:Jun Park', 'other']);
  assert.deepEqual(t[0], { key: 'owner', owner: true, name: 'you', desc: 'the owner · held, never expires' });
  assert.equal(t[1].desc, 'GitHub login needed · 1 claim · altair');
  // a hold carries the person's login: one click
  assert.deepEqual(t[2], { key: 'p:Jun Park', name: 'Jun Park', to: 'Jun Park', login: 'junpark', desc: '@junpark · 1 claim' });
  // the owner's own claim: the owner row is left out, Sam (two sessions) is in
  const o = reassignTargets(ROWS, OWNER, '07.5');
  assert.deepEqual(o.map((x) => x.key), ['p:Ada', 'p:Jun Park', 'p:Sam Lee', 'other']);
  assert.equal(o[2].desc, 'GitHub login needed · 2 claims · vega, deneb');
  // a contributor's view names the owner by name
  assert.equal(reassignTargets(ROWS, { owner: false, ownerName: 'Dave' }, '07.2')[0].name, 'Dave');
});

test('the reassign call: the owner by flag, a person by login, nothing without one', () => {
  const [owner, , jun, other] = reassignTargets(ROWS, OWNER, '07.2');
  assert.deepEqual(reassignBody('07.2', owner), { id: '07.2', owner: true });
  assert.deepEqual(reassignBody('07.2', jun), { id: '07.2', login: 'junpark', to: 'Jun Park' });
  const ada = reassignTargets(ROWS, OWNER, '07.2')[1];
  assert.equal(reassignBody('07.2', ada), null);
  assert.deepEqual(reassignBody('07.2', ada, '@ada-l'), { id: '07.2', login: 'ada-l', to: 'Ada' });
  assert.equal(reassignBody('07.2', ada, 'not a login'), null);
  assert.deepEqual(reassignBody('07.2', other, 'kim'), { id: '07.2', login: 'kim' });
  assert.equal(reassignBody('07.2', null), null);
});
