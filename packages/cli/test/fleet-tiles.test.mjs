// Fleet tiles that say what is true (spec 47, A10): idle reads idle, the phase bar draws only a reported phase and
// progress, a tile previews its last word or tool row and its chunk, and a claim holder no tile stands for gets a dim
// tile with its claims folded like the rail. Pure rules only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, FILTERS, counts, summary, phaseItems, idleLine, lastLine, chunkTitle, claimHolders } from '../src/screens/fleet/model.js';
import { rememberIdentity, identity } from '../src/screens/cockpit/model.js';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const at = (m) => new Date(NOW - m * 60000).toISOString();
const test_ = (value) => FILTERS.find((f) => f.value === value).test;

test('a session whose turn ended reads idle, not working, in the filters and the topbar', () => {
  const idle = norm({ id: 'a', name: 'vega', kind: 'local', state: 'live', turn: 'idle', lastPrompt: '/plot peek' });
  const busy = norm({ id: 'b', name: 'sirius', kind: 'local', state: 'live', turn: 'working' });
  const term = norm({ id: 'c', name: 'c0ffee12', kind: 'terminal', state: 'live', turn: 'idle' });
  const unknown = norm({ id: 'd', name: 'deneb', kind: 'local', state: 'live' });
  assert.equal(idle.idle, true);
  assert.equal(idle.orb, 'idle', 'its orb rests');
  assert.equal(term.state, 'observing');
  assert.equal(term.idle, true, 'a terminal session idles too');
  assert.equal(busy.idle, false);
  assert.equal(unknown.idle, false, 'unknown is not idle');
  assert.equal(test_('working')(idle), false);
  assert.equal(test_('idle')(idle), true);
  const list = [idle, busy, term, unknown];
  assert.equal(counts(list).working, 2);
  assert.equal(summary(list), '4 sessions · 2 working · 2 idle');
  assert.equal(summary(list, 3), '4 sessions · 2 working · 2 idle · 3 claimed, not attached');
  assert.equal(summary([], 1), '0 sessions · 1 claimed, not attached');
  assert.equal(idleLine(idle), 'Done · last: /plot peek');
  assert.equal(idleLine(busy), 'Idle');
  // A fallen session stays fallen whatever its file said last.
  assert.equal(norm({ id: 'e', name: 'rigel', state: 'fallen', turn: 'idle' }).idle, false);
});

test('the phase bar lights only a reported phase, and fills only to reported progress', () => {
  const none = phaseItems(norm({ id: 'a', name: 'vega', state: 'live' }));
  assert.ok(none.every((i) => i.state === undefined && i.p === undefined), 'no phase reported: nothing lit, no fraction');
  const working = phaseItems(norm({ id: 'a', name: 'vega', state: 'live', phase: 'working' }));
  assert.equal(working[1].state, 'now');
  assert.equal(working[1].p, '0%', 'no progress reported: an empty segment, not the half-full default');
  const half = phaseItems(norm({ id: 'a', name: 'vega', state: 'live', phase: 'working', progress: { pct: 40 } }));
  assert.equal(half[1].p, '40%');
  const idle = phaseItems(norm({ id: 'a', name: 'vega', state: 'live', phase: 'working', turn: 'idle' }));
  assert.ok(!idle.some((i) => i.state === 'now'), 'an idle session has no phase running');
  assert.equal(idle[0].state, 'done', 'what it finished stays done');
  const asking = phaseItems(norm({ id: 'a', name: 'vega', state: 'asking', turn: 'idle' }));
  assert.equal(asking[0].state, 'ask');
});

test('a tile previews its last word or its last tool row, and its chunk title from the plan', () => {
  assert.equal(lastLine({}), null);
  assert.deepEqual(lastLine({ last: { kind: 'text', text: '**Done:**   three\nchunks', at: 'x' } }), { kind: 'text', text: '**Done:** three chunks', at: 'x' });
  assert.deepEqual(lastLine({ last: { kind: 'tool', tool: 'Bash', arg: 'npm test' } }), { kind: 'tool', tool: 'Bash', arg: 'npm test', at: null });
  assert.equal(lastLine({ last: { kind: 'text', text: 'x'.repeat(400) } }, 50).text.length, 50);
  assert.equal(lastLine({ last: { kind: 'text', text: '   ' } }), null);
  const plan = { specs: [{ id: 59, chunks: [{ id: '59.10', title: 'Wire the river' }] }], chunks: [{ id: '60.1', t: 'Flat one' }] };
  assert.equal(chunkTitle(plan, '59.10'), 'Wire the river');
  assert.equal(chunkTitle(plan, '60.1'), 'Flat one');
  assert.equal(chunkTitle(plan, '61.1'), '');
  assert.equal(chunkTitle(null, '59.10'), '');
});

test('every claim holder no tile stands for gets one dim tile, its run of chunks folded like the rail', () => {
  const run = Array.from({ length: 39 }, (_, i) => ({ id: `59.${10 + i}`, who: 'dave', session: 'feedc0de-1111', star: 'polaris', at: at(180 - i), state: 'live' }));
  const rows = [
    ...run,
    { id: '60.2', who: 'dave', session: 'feedc0de-1111', at: at(10), state: 'live' },
    { id: '47.11', who: 'dave', session: 'a1b2c3d4', at: at(5), state: 'live' }, // a listed session's: no tile
    { id: '12.1', who: 'robin', session: '', at: at(60), state: 'stale' }, // no session tag: by person
    { id: '13.1', who: 'cloud', session: 'cloud-77', at: at(3) }, // the cloud loop: not a session tile
    { id: '14.1', who: 'dave', held: 'dave', at: at(3) }, // held: not a session
  ];
  const sessions = [{ id: 'a1b2c3d4', claude: 'uuid-1', name: 'vega' }];
  const holders = claimHolders(rows, sessions);
  assert.equal(holders.length, 2);
  const [big, robin] = holders;
  assert.equal(big.name, 'polaris', 'its star from the claim tag');
  assert.equal(big.n, 40);
  assert.equal(big.fold, '59.10-59.48 · 39 chunks, 60.2');
  assert.equal(big.at, Date.parse(at(180)), 'aged from its oldest claim');
  assert.equal(big.stale, false);
  assert.equal(robin.name, 'robin');
  assert.equal(robin.stale, true);
  // A session matched by its Claude Code id prefix or claims session has no holder tile.
  assert.equal(claimHolders([{ id: '1.1', session: 'uuid-1-x'.slice(0, 6), who: 'd' }], [{ id: 'x', claude: 'uuid-1', name: 'v', claimsSession: 'uuid-1' }]).length, 0);
  assert.deepEqual(claimHolders(null, []), []);
});

test('the cockpit keeps a session\'s star and branch when a read has none', () => {
  let kept = rememberIdentity(null, '1245bca0', { name: 'sirius', kind: 'local', git: { branch: 'nexus/sirius-1' } });
  assert.deepEqual(kept, { id: '1245bca0', name: 'sirius', kind: 'local', branch: 'nexus/sirius-1' });
  kept = rememberIdentity(kept, '1245bca0', null);
  assert.equal(identity('1245bca0', kept).name, 'sirius', 'a missed read keeps the star');
  kept = rememberIdentity(kept, '1245bca0', { name: '1245bca0', kind: 'local', git: { branch: '' } });
  assert.equal(kept.name, 'sirius', 'a row that names it by its raw id does not overwrite the star');
  assert.equal(kept.branch, 'nexus/sirius-1');
  assert.equal(rememberIdentity(kept, 'other', null), null, 'another session starts clean');
});
