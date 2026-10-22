// The claims rail's fold (spec 47 A9), as pure rules: a session's run of one spec's chunks is one line (first-last,
// how many, the age and time left once, from the oldest claim); a run of one or two stays rows; specs and sessions
// never fold together; the session header names its star when the claim tag or the live session row has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { foldClaims, railPeople, sessionOf, byChunkId, FOLD_MIN } from '../src/screens/board/model.js';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const ago = (m) => new Date(NOW - m * 60000).toISOString();
const ctx = { meWho: 'me', owner: true, ownerName: 'dave', sessions: [] };
const claim = (id, session, at, extra = {}) => ({ id, who: 'jun', session, at, state: 'live', ...extra });
const ids = (n, spec = '59', from = 10) => Array.from({ length: n }, (_, i) => `${spec}.${from + i}`);
const rail = (rows, c = ctx) => railPeople(rows, c, {}, {}, NOW);

test('chunk ids sort in plan order', () => {
  assert.deepEqual(['59.10', '59.9', '59', '6.2', '59.2'].sort(byChunkId), ['6.2', '59', '59.2', '59.9', '59.10']);
  assert.equal(FOLD_MIN, 3);
});

test('a run of one spec folds to one line, gaps and all, timed once from the oldest claim', () => {
  // 59.10 .. 59.49 with 59.11 missing: 39 chunks, claimed over the last hour and a half
  const list = ids(40).filter((id) => id !== '59.11');
  const rows = list.map((id, i) => claim(id, 'edee9af9', ago(i === 5 ? 86 : 30)));
  const [p] = rail(rows);
  const [s] = p.sessions;
  assert.equal(s.lines.length, 1);
  const [run] = s.lines;
  assert.equal(run.kind, 'run');
  assert.deepEqual([run.from, run.to, run.n, run.spec], ['59.10', '59.49', 39, '59']);
  assert.equal(run.exp, '1h 26m · 22h 34m left');
  assert.equal(run.key, 'edee9af9|59');
  assert.deepEqual(run.claims.map((c) => c.id), list);
  // the per-chunk rows are still there to open to
  assert.equal(s.claims.length, 39);
});

test('a run of one or two stays plain rows', () => {
  const [p] = rail([claim('59.2', 'a1', ago(5)), claim('59.1', 'a1', ago(5)), claim('60.1', 'a1', ago(5))]);
  assert.deepEqual(p.sessions[0].lines.map((l) => [l.kind, l.c.id]), [['claim', '59.1'], ['claim', '59.2'], ['claim', '60.1']]);
});

test('specs fold apart; a spec claim and a claim in review stay rows', () => {
  const rows = [
    ...ids(3, '60', 1).map((id) => claim(id, 'a1', ago(10))),
    claim('59', 'a1', ago(10)),
    ...ids(4, '59', 1).map((id) => claim(id, 'a1', ago(10))),
    claim('59.7', 'a1', ago(10), { pr: 12 }),
    claim('61.1', 'a1', ago(10)),
  ];
  const lines = rail(rows)[0].sessions[0].lines;
  const said = lines.map((l) => (l.kind === 'run' ? `run ${l.from}-${l.to} ${l.n}` : l.c.id));
  assert.deepEqual(said, ['spec 59', 'run 59.1-59.4 4', '59.7', 'run 60.1-60.3 3', '61.1']);
});

test('two sessions of one person fold apart', () => {
  const rows = [...ids(3).map((id) => claim(id, 'aaaa1111', ago(10))), ...ids(3, '59', 20).map((id) => claim(id, 'bbbb2222', ago(10)))];
  const [p] = rail(rows);
  assert.deepEqual(p.sessions.map((s) => [s.name, s.lines.map((l) => `${l.from}-${l.to}`)]), [['aaaa1111', ['59.10-59.12']], ['bbbb2222', ['59.20-59.22']]]);
});

test('a held run reads held once; a stale oldest claim reads stale', () => {
  const held = rail(ids(3).map((id) => ({ id, who: 'jun', held: 'jun', at: ago(10), state: 'held' })))[0].sessions[0].lines[0];
  assert.deepEqual([held.kind, held.exp, held.expKind], ['run', 'held · never expires', 'held']);
  const stale = rail(ids(3).map((id, i) => claim(id, 'a1', ago(i ? 10 : 1500), { state: i ? 'live' : 'stale' })))[0].sessions[0].lines[0];
  assert.equal(stale.expKind, 'stale');
  assert.match(stale.exp, /^stale · /);
});

test('the session header names its star, else its 8-char id', () => {
  // the claim tag's ~star
  assert.equal(rail([claim('59.1', 'ac8d4d87', ago(5), { star: 'vega' })])[0].sessions[0].name, 'vega');
  // no star anywhere: the 8-char id
  assert.equal(rail([claim('59.1', 'edee9af9-0000-4000-8000-000000000000', ago(5))])[0].sessions[0].name, 'edee9af9');
  // a claim made before the star, then one after: the header takes the star
  assert.equal(rail([claim('59.1', 'ac8d4d87', ago(9)), claim('59.2', 'ac8d4d87', ago(5), { star: 'vega' })])[0].sessions[0].name, 'vega');
  // the live session row's star, matched by the full id the claims tag cuts to 8 characters
  const sessions = [{ id: 'ac8d4d87-79b0-4d8a-a4cb-1b9c92d0c01b', claude: 'ac8d4d87-79b0-4d8a-a4cb-1b9c92d0c01b', name: 'sirius', kind: 'local', state: 'live' }];
  assert.equal(rail([claim('59.1', 'ac8d4d87', ago(5))], { ...ctx, sessions })[0].sessions[0].name, 'sirius');
  // a live row with no star names itself by its id: the claim tag's star wins over it
  const starless = [{ id: 'ac8d4d87-79b0', name: 'ac8d4d87', kind: 'terminal', state: 'live' }];
  assert.equal(rail([claim('59.1', 'ac8d4d87', ago(5), { star: 'deneb' })], { ...ctx, sessions: starless })[0].sessions[0].name, 'deneb');
});

test('sessionOf: by id, Claude Code id, claims session, else an 8-char cut of the id', () => {
  const list = [{ id: 'aaaa1111-x', claude: 'cccc3333-y' }, { id: 'bbbb', claimsSession: 'k1' }];
  assert.equal(sessionOf(list, 'aaaa1111-x'), list[0]);
  assert.equal(sessionOf(list, 'cccc3333-y'), list[0]);
  assert.equal(sessionOf(list, 'k1'), list[1]);
  assert.equal(sessionOf(list, 'cccc3333'), list[0]);
  // a cut shorter than 8 never matches by prefix
  assert.equal(sessionOf(list, 'aaaa'), null);
  assert.equal(sessionOf(list, ''), null);
});

test('foldClaims on its own: an empty session, and order kept by chunk id', () => {
  assert.deepEqual(foldClaims([]), []);
  assert.deepEqual(foldClaims(undefined), []);
});
