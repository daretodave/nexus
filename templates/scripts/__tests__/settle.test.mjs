// settle.mjs: a close takes its chunk out of the plan and appends its archive line; edits apply exactly once;
// decisions get numbers; footgun sightings climb the ladder. Pure functions on strings, no git (the run itself is
// settle-run.test.mjs). node:test, no deps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeConfig } from '../plan/config.mjs';
import { lintFootguns } from '../plan/footguns.mjs';
import {
  applyEdits,
  bumpFootgun,
  closeChunk,
  dropNeeds,
  footgunsRefusal,
  ladderChunk,
  ladderSpec,
  laneEntry,
  makeRoom,
  numberDecisions,
  openLadderRows,
  closeLadderRows,
  recountMeasure,
  renumber,
  setLeft,
  settleFootguns,
  stillNamed,
  tidyAhead,
  tidyLine,
} from '../plan/settle.mjs';


const SPEC = [
  '# 07 — Search',
  '',
  '## Acceptance',
  '',
  '- **A6** A query finds places',
  '  with a zip.',
  '- **A7** Near you',
  '- **A8** The index',
  '',
  '## Chunks',
  '',
  'Measure: 3 open · 5 closed · next A9',
  '',
  '- [ ] **07.3** Where an office is · S · closes A6 · needs —',
  '  - Contract first: the resolver.',
  '- [ ] **07.4** Near you · M · closes A7, A8 (partial) · needs 07.3',
  '- [ ] **07.5** The index · M · closes A8 · needs 07.4, 07.3',
  '',
].join('\n');

const README = [
  '# Roadmap',
  '',
  '## Lanes',
  '',
  '**Asap** (built before the table):',
  '',
  '- **07.3** · the resolver first.',
  '- 07.4, then 07.5: near me.',
  '',
  '**Held** (waits on the owner):',
  '',
  '- (none)',
  '',
  '## Specs',
  '',
  '| # | Initiative | Spec | Status | Progress |',
  '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | in progress (07.3 to 07.5) | 3 left |',
  '',
].join('\n');

describe('closing a chunk', () => {
  it('takes out its block, the A-IDs it closes and the needs naming it, and recounts the measure', () => {
    const done = closeChunk(SPEC, '07.3');
    assert.deepEqual(done.closes, ['A6']);
    assert.ok(!done.text.includes('07.3**'));
    assert.ok(!done.text.includes('A6'));
    assert.ok(!done.text.includes('with a zip'));
    assert.ok(!done.text.includes('Contract first'));
    assert.match(done.text, /\*\*07\.4\*\* Near you · M · closes A7, A8 \(partial\) · needs —/);
    assert.match(done.text, /\*\*07\.5\*\* The index · M · closes A8 · needs 07\.4$/m);
    assert.match(done.text, /^Measure: 2 open · 6 closed · next A9$/m);
  });

  it('keeps a partial A-ID for the chunk that finishes it, and says null for a chunk the spec lacks', () => {
    const done = closeChunk(SPEC, '07.4');
    assert.deepEqual(done.closes, ['A7']);
    assert.match(done.text, /\*\*A8\*\*/);
    assert.equal(closeChunk(SPEC, '07.9'), null);
  });

  it('drops a closed id from a wrapped needs list, writing needs — once it is empty', () => {
    const spec = '- [ ] **08.1** x · S · closes A1 · needs\n  07.3, 07.4\n- [ ] **08.2** y · S · closes A2 · needs\n  07.3\n';
    assert.equal(dropNeeds(spec, '07.3'), '- [ ] **08.1** x · S · closes A1 · needs\n  07.4\n- [ ] **08.2** y · S · closes A2 · needs —\n');
  });

  it('recounts a measure from the A-IDs listed, and sets only its row\'s N left', () => {
    assert.match(recountMeasure('Measure: 2 open · 0 closed · next A3\n- **A1** x\n- **A2** y', 'Measure: 2 open · 0 closed · next A3\n- **A2** y'), /Measure: 1 open · 1 closed · next A3/);
    const r = setLeft(README, '07-search.md', 2);
    assert.match(r, /\| 2 left \|$/m);
  });
});

describe('tidying a closed chunk out of the roadmap', () => {
  it('drops a lane entry the chunk heads, takes it out of lists and narrows a range', () => {
    const listed = ['07.4', '07.5'];
    const t = tidyAhead(README, null, '07.3', listed);
    assert.ok(!t.readme.includes('- **07.3**'));
    assert.match(t.readme, /- 07\.4, then 07\.5: near me\./);
    assert.match(t.readme, /in progress \(07\.4 and 07\.5\)/);
    assert.equal(t.queue, null);
    assert.deepEqual(stillNamed(t.readme, null, '07.3'), []);
    const t2 = tidyAhead(t.readme, null, '07.4', ['07.5']);
    assert.match(t2.readme, /- 07\.5: near me\./);
  });

  it('keeps an id named in prose, never writing broken prose, and names the line for a hand', () => {
    assert.equal(tidyLine("the canvas for 07.2's view is in", '07.2', []), "the canvas for 07.2's view is in");
    const readme = README.replace('- 07.4, then 07.5: near me.', '- wait until 07.3 lands, then the rest.');
    const t = tidyAhead(readme, null, '07.3', ['07.4', '07.5']);
    assert.deepEqual(stillNamed(t.readme, null, '07.3'), ['plan/README.md:7']);
  });

  it('tidies a build queue when the config names one', () => {
    const cfg = makeConfig({ queue: 'plan/queue.md' });
    const queue = '**Product**\n- [ ] Phase 07 · 07.3, then 07.4 ([07](../07-search.md))\n';
    const t = tidyAhead(README, queue, '07.3', ['07.4', '07.5'], cfg);
    assert.match(t.queue, /Phase 07 · 07\.4 \(/);
  });
});

describe('edits, decisions and notes', () => {
  it('applies an edit found once, and refuses a missing or repeated old text', () => {
    const files = { 'a.md': 'one two two\n' };
    const r = (p) => files[p] ?? null;
    const w = (p, t) => (files[p] = t);
    applyEdits([{ path: 'a.md', old: 'one', new: 'ONE' }], r, w);
    assert.equal(files['a.md'], 'ONE two two\n');
    assert.throws(() => applyEdits([{ path: 'a.md', old: 'two', new: 'x' }], r, w), /more than once/);
    assert.throws(() => applyEdits([{ path: 'a.md', old: 'three', new: 'x' }], r, w), /isn't there/);
    assert.throws(() => applyEdits([{ path: 'b.md', old: 'x', new: 'y' }], r, w), /no such file/);
  });

  it('takes whole lines out with their newline, so a table stays one table', () => {
    const files = { 't.md': '| a |\n| b |\n| c |\n' };
    applyEdits([{ path: 't.md', old: '| b |', new: '' }], (p) => files[p], (p, t) => (files[p] = t));
    assert.equal(files['t.md'], '| a |\n| c |\n');
  });

  it('numbers decisions after the highest and rewrites their placeholders, never a longer slug', () => {
    const out = numberDecisions('# 2026\n', ['- **D?a** · 2026-10-14 · one', '- **D?b** · 2026-10-14 · two, after D?a'], 12);
    assert.equal(out.numbers.get('D?a'), 'D13');
    assert.equal(out.numbers.get('D?b'), 'D14');
    assert.match(out.text, /two, after D13/);
    assert.equal(renumber('D?a and D?a-long', out.numbers), 'D13 and D?a-long');
  });
});

const FOOTGUNS = [
  '# Footguns',
  '',
  '## Open',
  '',
  '- **clock-edge** · a test reads the wall clock → pass the time in · seen 1× · last 2026-10-01 · open',
  '',
  '## Watch (seen once: searched before adding a line, not read before building)',
  '',
  '- **old-trap** · an old trap → a rule · seen 1× · last 2026-01-01 · watch',
  '',
  '## Guarded',
  '',
  '- **guarded-one** · a trap → a rule · seen 3× · last 2026-09-01 · guarded by scripts/x.test.mjs',
  '',
].join('\n');

describe('footguns and the ladder', () => {
  it('bumps a sighting, keeps a later last date, and promotes a Watch line on its second sighting', () => {
    const b = bumpFootgun(FOOTGUNS, 'clock-edge', '2026-10-14');
    assert.equal(b.seen, 2);
    assert.match(b.text, /seen 2× · last 2026-10-14 · open/);
    assert.equal(bumpFootgun(FOOTGUNS, 'nope', '2026-10-14'), null);
    const w = bumpFootgun(FOOTGUNS, 'old-trap', '2026-10-14');
    assert.equal(w.promoted, true);
    assert.match(w.text, /## Open\n\n- \*\*clock-edge\*\*.*\n- \*\*old-trap\*\* .* · open\n/);
    assert.deepEqual(lintFootguns(w.text), []);
  });

  it('calls the ladder for a sighting that reaches 2× while open, and for a new open line arriving at 2×', () => {
    const s = settleFootguns(FOOTGUNS, { footguns: ['clock-edge'], date: '2026-10-14', today: '2026-10-14' });
    assert.deepEqual(s.ladder, [{ slug: 'clock-edge', seen: 2 }]);
    const n = settleFootguns(FOOTGUNS, { add: ['- **fresh** · a → b · seen 2× · last 2026-10-14 · open'], date: '2026-10-14', today: '2026-10-14' });
    assert.deepEqual(n.ladder, [{ slug: 'fresh', seen: 2 }]);
  });

  it('drops a Watch line unseen for watchDays, and demotes the coldest single sighting past the open budget', () => {
    const room = makeRoom(FOOTGUNS, '2026-06-01');
    assert.deepEqual(room.dropped.map((d) => d.slug), ['old-trap']);
    const cfg = makeConfig({ limits: { openFootguns: 0 } });
    const tight = makeRoom(FOOTGUNS, '2026-02-01', cfg);
    assert.deepEqual(tight.demoted, ['clock-edge']);
    assert.match(tight.text, /- \*\*clock-edge\*\* .* · watch/);
  });

  it('refuses a list the lint would newly refuse, before any write', () => {
    const cfg = makeConfig({ limits: { openFootguns: 1 } });
    const over = FOOTGUNS.replace('\n## Watch', '- **two** · a → b · seen 1× · last 2026-10-14 · open\n\n## Watch');
    assert.match(footgunsRefusal(FOOTGUNS, over, cfg), /2 open footguns \(budget 1\)/);
    assert.equal(footgunsRefusal(FOOTGUNS, FOOTGUNS, cfg), null);
  });

  it('opens the ladder spec with a chunk, once, and adds its row and lane entry', () => {
    const spec = ladderSpec(1);
    assert.match(spec, /^# 99 · Guard the traps/);
    const add = ladderChunk(spec, 'clock-edge', 2, []);
    assert.equal(add.id, '99.1');
    assert.match(add.text, /- \*\*A1\*\* `clock-edge` is guarded/);
    assert.match(add.text, /^Measure: 1 open · 0 closed · next A2$/m);
    assert.equal(ladderChunk(add.text, 'clock-edge', 3, []), null);
    assert.equal(ladderChunk(add.text, 'other', 2, ['99.4']).id, '99.5');
    const rows = openLadderRows({ readme: README, queue: null, root: null });
    assert.match(rows.readme, /\| 07 \| Search .*\n\| 99 \| Guard the traps.*\[99-guard-the-traps\.md\]\(99-guard-the-traps\.md\)/);
    assert.equal(rows.root, null);
    assert.ok(!closeLadderRows(rows).readme.includes('99-guard'));
    const lane = laneEntry(README, '99.1', 'clock-edge', 2);
    assert.match(lane, /- 07\.4, then 07\.5: near me\.\n- \*\*99\.1\*\* · automate footgun `clock-edge` \(seen 2×\), spec 99's ladder chunk\.\n/);
  });
});

