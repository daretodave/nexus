// settle.mjs: a close takes its chunk out of the plan and appends its archive line; edits apply exactly once; adds
// are numbered and placed; decisions get numbers; footgun sightings climb the ladder. Pure functions on strings, no git
// (the run itself is settle-run.test.mjs). node:test, no deps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { makeConfig } from '../plan/config.mjs';
import { lintFootguns } from '../plan/footguns.mjs';
import { parsePending } from '../plan/pending.mjs';
import {
  applyEdits,
  addsWork,
  applyPlanChanges,
  bumpFootgun,
  closeChunk,
  dropNeeds,
  footgunsRefusal,
  ladderChunk,
  ladderSpec,
  laneEntry,
  makeRoom,
  nextChunkNumber,
  numberDecisions,
  openLadderRows,
  closeLadderRows,
  recountMeasure,
  renumber,
  setLeft,
  settleFootguns,
  settleOrder,
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

  it('takes the Acceptance heading out with the spec\'s last A-ID, never leaving it empty', () => {
    let text = SPEC;
    for (const id of ['07.3', '07.4', '07.5']) text = closeChunk(text, id).text;
    assert.ok(!text.includes('## Acceptance'));
    assert.equal(text, '# 07 — Search\n\n## Chunks\n\nMeasure: 0 open · 8 closed · next A9\n\n');
    // Prose under the heading is not empty: the heading stays with it.
    const prose = SPEC.replace('## Acceptance\n', '## Acceptance\n\nDone when a query finds a place.\n');
    assert.match(closeChunk(closeChunk(closeChunk(prose, '07.3').text, '07.4').text, '07.5').text, /## Acceptance\n\nDone when/);
  });

  it('drops a closed id from a wrapped needs list, writing needs — once it is empty', () => {
    const spec = '- [ ] **08.1** x · S · closes A1 · needs\n  07.3, 07.4\n- [ ] **08.2** y · S · closes A2 · needs\n  07.3\n';
    assert.equal(dropNeeds(spec, '07.3'), '- [ ] **08.1** x · S · closes A1 · needs\n  07.4\n- [ ] **08.2** y · S · closes A2 · needs —\n');
  });

  it('tidies a needs clause wrapped onto its own line under a joint', () => {
    const spec = '- [ ] **42.4** x · S · closes A8 ·\n  needs 42.2\n- [ ] **42.5** y · S · closes A9 ·\n  needs 42.2, 42.3\n';
    assert.equal(dropNeeds(spec, '42.2'), '- [ ] **42.4** x · S · closes A8 ·\n  needs —\n- [ ] **42.5** y · S · closes A9 ·\n  needs 42.3\n');
    // Prose that opens a wrapped line with "needs" under no joint stays as written.
    const prose = '- [ ] **42.6** z · S · closes A10 · needs — the sink\n  needs 42.2 in prose\n';
    assert.equal(dropNeeds(prose, '42.2'), prose);
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

  it('drops a lane entry the chunk heads without a middle dot, wrapped lines too, and keeps a two-id head', () => {
    const readme = README.replace('- **07.3** · the resolver first.', '- **07.3** the resolver first, now that\n  the GUI ships');
    const t = tidyAhead(readme, null, '07.3', ['07.4', '07.5']);
    assert.ok(!t.readme.includes('the resolver first') && !t.readme.includes('the GUI ships'));
    assert.match(t.readme, /- 07\.4, then 07\.5: near me\./);
    assert.deepEqual(stillNamed(t.readme, null, '07.3'), []);
    const two = README.replace('- **07.3** · the resolver first.', '- **07.3, 07.4** the resolver first.');
    const t2 = tidyAhead(two, null, '07.3', ['07.4', '07.5']);
    assert.match(t2.readme, /the resolver first\./);
    assert.ok(t2.readme.includes('07.4** the resolver'));
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
    const out = numberDecisions('# 2000\n', ['- **D?a** · 2000-10-14 · one', '- **D?b** · 2000-10-14 · two, after D?a'], 12);
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
  '- **clock-edge** · a test reads the wall clock → pass the time in · seen 1× · last 2000-10-01 · open',
  '',
  '## Watch (seen once: searched before adding a line, not read before building)',
  '',
  '- **old-trap** · an old trap → a rule · seen 1× · last 2000-01-01 · watch',
  '',
  '## Guarded',
  '',
  '- **guarded-one** · a trap → a rule · seen 3× · last 2000-09-01 · guarded by scripts/x.test.mjs',
  '',
].join('\n');

describe('footguns and the ladder', () => {
  it('bumps a sighting, keeps a later last date, and promotes a Watch line on its second sighting', () => {
    const b = bumpFootgun(FOOTGUNS, 'clock-edge', '2000-10-14');
    assert.equal(b.seen, 2);
    assert.match(b.text, /seen 2× · last 2000-10-14 · open/);
    assert.equal(bumpFootgun(FOOTGUNS, 'nope', '2000-10-14'), null);
    const w = bumpFootgun(FOOTGUNS, 'old-trap', '2000-10-14');
    assert.equal(w.promoted, true);
    assert.match(w.text, /## Open\n\n- \*\*clock-edge\*\*.*\n- \*\*old-trap\*\* .* · open\n/);
    assert.deepEqual(lintFootguns(w.text), []);
  });

  it('calls the ladder for a sighting that reaches 2× while open, and for a new open line arriving at 2×', () => {
    const s = settleFootguns(FOOTGUNS, { footguns: ['clock-edge'], date: '2000-10-14', today: '2000-10-14' });
    assert.deepEqual(s.ladder, [{ slug: 'clock-edge', seen: 2 }]);
    const n = settleFootguns(FOOTGUNS, { add: ['- **fresh** · a → b · seen 2× · last 2000-10-14 · open'], date: '2000-10-14', today: '2000-10-14' });
    assert.deepEqual(n.ladder, [{ slug: 'fresh', seen: 2 }]);
  });

  it('drops a Watch line unseen for watchDays, and demotes the coldest single sighting past the open budget', () => {
    const room = makeRoom(FOOTGUNS, '2000-06-01');
    assert.deepEqual(room.dropped.map((d) => d.slug), ['old-trap']);
    const cfg = makeConfig({ limits: { openFootguns: 0 } });
    const tight = makeRoom(FOOTGUNS, '2000-02-01', cfg);
    assert.deepEqual(tight.demoted, ['clock-edge']);
    assert.match(tight.text, /- \*\*clock-edge\*\* .* · watch/);
  });

  it('refuses a list the lint would newly refuse, before any write', () => {
    const cfg = makeConfig({ limits: { openFootguns: 1 } });
    const over = FOOTGUNS.replace('\n## Watch', '- **two** · a → b · seen 1× · last 2000-10-14 · open\n\n## Watch');
    assert.match(footgunsRefusal(FOOTGUNS, over, cfg), /2 open footguns \(budget 1\)/);
    assert.equal(footgunsRefusal(FOOTGUNS, FOOTGUNS, cfg), null);
  });

  it('opens the ladder spec with a chunk, once, and adds its row and lane entry', () => {
    const spec = ladderSpec(1);
    assert.match(spec, /^# 99 · Guard the traps/);
    assert.ok(!spec.includes('## Acceptance'), 'no A-ID yet: no heading yet');
    const add = ladderChunk(spec, 'clock-edge', 2, []);
    assert.match(add.text, /\n\n## Acceptance\n\n- \*\*A1\*\* `clock-edge` is guarded.*\n\n## Chunks\n/);
    assert.equal(add.id, '99.1');
    assert.match(add.text, /- \*\*A1\*\* `clock-edge` is guarded/);
    assert.match(add.text, /^Measure: 1 open · 0 closed · next A2$/m);
    assert.equal(ladderChunk(add.text, 'clock-edge', 3, []), null);
    assert.equal(ladderChunk(add.text, 'other', 2, ['99.4']).id, '99.5');
    // Its last A-ID closed took the heading out; the next trap brings it back, numbered on.
    const emptied = closeChunk(add.text, '99.1').text;
    assert.ok(!emptied.includes('## Acceptance'));
    const again = ladderChunk(emptied, 'other', 2, ['99.1']);
    assert.match(again.text, /## Acceptance\n\n- \*\*A2\*\* `other` is guarded.*\n\n## Chunks\n/);
    assert.match(again.text, /^Measure: 1 open · 1 closed · next A3$/m);
    const rows = openLadderRows({ readme: README, queue: null, root: null });
    assert.match(rows.readme, /\| 07 \| Search .*\n\| 99 \| Guard the traps.*\[99-guard-the-traps\.md\]\(99-guard-the-traps\.md\)/);
    assert.equal(rows.root, null);
    assert.ok(!closeLadderRows(rows).readme.includes('99-guard'));
    const lane = laneEntry(README, '99.1', 'clock-edge', 2);
    assert.match(lane, /- 07\.4, then 07\.5: near me\.\n- \*\*99\.1\*\* · automate footgun `clock-edge` \(seen 2×\), spec 99's ladder chunk\.\n/);
  });
});

// `## Add`: many branches add to one spec and never collide (learned from a mature adopter, where a dozen runs adding
// to one spec all quoted the same last chunk, Measure line and "N left", so only the first could settle). Each pending
// file quotes no text of the spec; settle numbers its A-IDs and chunks in turn and places them. A settle run over
// several of them, end to end, is in settle-run.test.mjs.
describe('## Add: new work for a spec, numbered at settle', () => {
  const ADD_SPEC = [
    '# 07 — Search',
    '',
    '## Design',
    '',
    '- The index is local.',
    '',
    '## Acceptance',
    '',
    '- **A17** The offline index.',
    '- **A18** Search by voice',
    '  in the browser.',
    '',
    '## Open questions',
    '',
    '- Fuzzy or exact?',
    '',
    '## Chunks',
    'Measure: 2 open · 16 closed · next A19',
    '',
    '- [ ] **07.7** The offline index · M · closes A17 · needs —',
    '- [ ] **07.8** Voice · S · closes A18 · needs 07.7',
    '  - Every browser.',
    '',
  ].join('\n');
  const ADD_README = '| 07 | Search | [07-search.md](07-search.md) | in progress | 2 left |\n';
  const ADD_ARCHIVE = '- 2026-10-12 · 07.9 · Search on the web · abc12345..def67890\n';

  /** A bug's pending file: no number and no quoted text of spec 07. */
  const bug = (slug, words, extra = '') =>
    [
      '---',
      'date: 2026-10-21',
      '---',
      '## Add plan/07-search.md',
      '~~~ acceptance',
      `- **A?${slug}** ${words} works.`,
      '~~~',
      '~~~ chunks',
      `- [ ] **07.?${slug}** ${words} · S · closes A?${slug} · needs —`,
      '  - Retest it.',
      '    A wrapped line under the sub-bullet.',
      '~~~',
      extra,
    ].join('\n');

  function files(spec = ADD_SPEC) {
    const store = new Map([
      ['plan/07-search.md', spec],
      ['plan/README.md', ADD_README],
      ['plan/ARCHIVE.md', ADD_ARCHIVE],
    ]);
    return { store, read: (q) => store.get(q) ?? null, write: (q, t) => store.set(q, t) };
  }

  it('takes thirteen additions in a row, each its own A-ID and chunk, none colliding (07.9 is archived)', () => {
    const f = files();
    const given = [];
    for (let i = 1; i <= 13; i++) {
      const p = parsePending(bug(`bug${i}`, `Bug ${i}`), `plan/pending/plot-bug${i}.md`);
      given.push(Object.fromEntries(applyPlanChanges(p, f.read, f.write)));
    }
    assert.deepEqual(given[0], { 'A?bug1': 'A19', '07.?bug1': '07.10' });
    assert.deepEqual(given[12], { 'A?bug13': 'A31', '07.?bug13': '07.22' });
    const spec = f.read('plan/07-search.md');
    assert.match(spec, /^Measure: 15 open · 16 closed · next A32$/m);
    assert.doesNotMatch(spec, /\?bug/);
    // The acceptance entries follow A18's wrapped line, in order, before Open questions.
    assert.ok(spec.includes('  in the browser.\n- **A19** Bug 1 works.\n- **A20** Bug 2'));
    assert.ok(spec.indexOf('**A31**') < spec.indexOf('## Open questions'));
    // The chunks follow 07.8's sub-bullet, each with its own lines at their depth.
    assert.ok(spec.includes('  - Every browser.\n- [ ] **07.10** Bug 1 · S · closes A19 · needs —\n  - Retest it.\n    A wrapped line'));
    assert.ok(spec.trimEnd().endsWith('- [ ] **07.22** Bug 13 · S · closes A31 · needs —\n  - Retest it.\n    A wrapped line under the sub-bullet.'));
    assert.equal(f.read('plan/README.md'), '| 07 | Search | [07-search.md](07-search.md) | in progress | 15 left |\n');
  });

  it('writes its numbers into its own Edit texts (an Asap lane entry) and places questions and section text', () => {
    const f = files();
    f.write('plan/README.md', `${ADD_README}\n**Asap lane**\n- 01.1 first\n`);
    const text = bug(
      'strip',
      'The strip',
      [
        '~~~ questions',
        '- A prompt?',
        '  Needs the version.',
        '~~~',
        '~~~ section Design',
        '- The strip compares a cached page with a served one.',
        '~~~',
        '~~~ section Contract',
        '`pageBuild` answers dev.',
        '~~~',
        '## Edit plan/README.md',
        '~~~ old',
        '- 01.1 first',
        '~~~',
        '~~~ new',
        '- 01.1 first',
        '- 07.?strip the strip (A?strip)',
        '~~~',
      ].join('\n'),
    );
    const numbers = applyPlanChanges(parsePending(text, 'plan/pending/plot-strip.md'), f.read, f.write);
    assert.deepEqual(Object.fromEntries(numbers), { 'A?strip': 'A19', '07.?strip': '07.10' });
    assert.ok(f.read('plan/README.md').includes('- 07.10 the strip (A19)'));
    assert.ok(f.read('plan/README.md').includes('| 3 left |'));
    const spec = f.read('plan/07-search.md');
    assert.ok(spec.includes('- Fuzzy or exact?\n- A prompt?\n  Needs the version.\n\n## Chunks'));
    assert.ok(spec.includes('- The index is local.\n\n- The strip compares a cached page with a served one.\n\n## Contract'));
    assert.ok(spec.includes('## Contract\n\n`pageBuild` answers dev.\n\n## Acceptance'));
  });

  it('numbers a question in a numbered Open questions list', () => {
    const f = files(ADD_SPEC.replace('- Fuzzy or exact?', '1. Fuzzy or exact?\n2. Which locale?'));
    const p = parsePending(['---', 'date: 2026-10-21', '---', '## Add plan/07-search.md', '~~~ questions', '- A prompt?', '  Its version.', '~~~'].join('\n'), 'q.md');
    applyPlanChanges(p, f.read, f.write);
    assert.ok(f.read('plan/07-search.md').includes('2. Which locale?\n3. A prompt?\n   Its version.\n'));
  });

  it('refuses a placeholder no Add defines, a chunk of another spec, a slug twice, an Add of nothing and a non-spec', () => {
    const head = '---\ndate: 2026-10-21\n---\n';
    assert.throws(() => parsePending(`${head}## Edit plan/README.md\n~~~ old\nx\n~~~\n~~~ new\n07.?nope\n~~~\n`, 'a.md'), /07\.\?nope is used but no "## Add" part defines it/);
    assert.throws(() => parsePending(`${head}## Add plan/07-search.md\n~~~ chunks\n- [ ] **15.?x** Wrong spec · S\n~~~\n`, 'b.md'), /a chunk starts "- \[ \] \*\*07\.\?<slug>\*\* "/);
    assert.throws(() => parsePending(`${head}## Add plan/07-search.md\n~~~ acceptance\n- **A?x** One\n- **A?x** Two\n~~~\n`, 'c.md'), /defines A\?x twice/);
    assert.throws(() => parsePending(`${head}## Add plan/07-search.md\n~~~ chunks\n~~~\n`, 'd.md'), /adds nothing/);
    assert.throws(() => parsePending(`${head}## Add plan/README.md\n~~~ questions\n- Q\n~~~\n`, 'e.md'), /an Add names a spec/);
    // A placeholder in the file's notes or decisions gets its number too, so it must be defined there as well.
    assert.throws(() => parsePending(`${head}## Add plan/07-search.md\n~~~ questions\n- Q\n~~~\n## Notes\n- see 07.?gone\n`, 'f.md'), /07\.\?gone is used but no "## Add" part defines it/);
  });

  it('refuses what an Add would drop or misplace: a misspelt part, a stray line, a heading inside a part', () => {
    const head = '---\ndate: 2026-10-21\n---\n## Add plan/07-search.md\n';
    const ok = '~~~ chunks\n- [ ] **07.?b** B · S\n~~~\n';
    assert.throws(() => parsePending(`${head}~~~ chunk\n- [ ] **07.?a** A · S\n~~~\n${ok}`, 'a.md'), /only ~~~ acceptance \/ chunks \/ questions \/ section <Heading> parts go here; read "~~~ chunk"/);
    assert.throws(() => parsePending(`${head}${ok}- [ ] **07.?c** Outside any part · S\n`, 'b.md'), /parts go here; read "- \[ \] \*\*07\.\?c\*\*/);
    assert.throws(() => parsePending(`${head}~~~ section Findings\nfoo\n## Chunks\nbar\n~~~\n`, 'c.md'), /a part holds no # or ## heading \(### and below only\); read "## Chunks"/);
    const deep = parsePending(`${head}\n~~~ section Findings\n### Root cause\nThe clock.\n~~~\n\n${ok}`, 'd.md');
    assert.equal(deep.adds[0].sections[0].text, '### Root cause\nThe clock.');
  });

  it('refuses a spec with no Measure line before writing anything', () => {
    const f = files(ADD_SPEC.replace(/^Measure:.*$/m, ''));
    assert.throws(() => applyPlanChanges(parsePending(bug('x', 'X'), 'x.md'), f.read, f.write), /no "Measure: /);
    assert.equal(f.read('plan/README.md'), ADD_README);
  });

  it('counts the next chunk past split ids and archived ones, a three-digit spec too', () => {
    assert.equal(nextChunkNumber('07', ['07.4b', '07.7'], '- 2026-10-12 · 07.9 · x · a..b\n- 2026-10-12 · 15.30 · y · a..b\n'), 10);
    assert.equal(nextChunkNumber('63', [], ''), 1);
    assert.equal(nextChunkNumber('100', ['100.2'], '- 2026-10-12 · 100.5a · x · a..b\n- 2026-10-12 · 10.9 · y · a..b\n'), 6);
  });

  it('puts a new Acceptance before Chunks when the spec has no Open questions', () => {
    const bare = ['# 07 — Search', '', '## Chunks', 'Measure: 0 open · 18 closed · next A19', '', '- [ ] **07.8** Voice · S · needs —', ''].join('\n');
    const f = files(bare);
    applyPlanChanges(parsePending(bug('x', 'X'), 'x.md'), f.read, f.write);
    const spec = f.read('plan/07-search.md');
    assert.ok(spec.indexOf('## Acceptance') < spec.indexOf('## Chunks'), spec);
    assert.ok(spec.includes('## Acceptance\n\n- **A19** X works.\n'), spec);
    assert.match(spec, /^Measure: 1 open · 18 closed · next A20$/m);
    assert.ok(spec.trimEnd().endsWith('    A wrapped line under the sub-bullet.'));
  });

  it("refuses an Add to the ladder spec, and one outside the config's editable", () => {
    const head = '---\ndate: 2026-10-21\n---\n';
    assert.throws(() => parsePending(`${head}## Add plan/99-guard-the-traps.md\n~~~ questions\n- Q\n~~~\n`, 'l.md'), /ladder spec takes no Add/);
    const cfg = makeConfig({ editable: ['plan/README.md'] });
    assert.throws(() => parsePending(`${head}## Add plan/07-search.md\n~~~ questions\n- Q\n~~~\n`, 'n.md', cfg), /settle edits only plan\/README\.md/);
  });

  it("applies a file's edits and adds before its close, in settle's loop", () => {
    const src = readFileSync(fileURLToPath(new URL('../plan/settle.mjs', import.meta.url)), 'utf8');
    const loop = src.slice(src.indexOf('const settleOne = (p) =>'));
    assert.ok(loop.indexOf('applyPlanChanges(p, r, w)') > 0);
    assert.ok(loop.indexOf('applyPlanChanges(p, r, w)') < loop.indexOf('closeChunk(r(specFile), p.close)'));
  });
});

describe('settle order: what adds goes before the closes of its date', () => {
  const head = (date, close = '') => `---\n${close ? `close: ${close}\nsays: It works\n` : ''}date: ${date}\n---\n`;
  const add = '## Add plan/07-search.md\n~~~ chunks\n- [ ] **07.?x** X · S · needs —\n~~~\n';
  const lane = '## Edit plan/README.md\n~~~ old\n- (none)\n~~~\n~~~ new\n- 07.4 first\n~~~\n';
  const decision = '## Decisions\n- **D?d** · 2026-10-21 · A call.\n';
  const p = (file, text) => ({ ...parsePending(text, file), file });

  it('settles a plot, an Add or a lane entry before the closes of the same date; dates still lead', () => {
    const files = [
      p('plan/pending/07.3.md', head('2026-10-21', '07.3')),
      p('plan/pending/07.4.md', head('2026-10-20', '07.4')),
      p('plan/pending/lone.md', head('2026-10-21') + decision),
      p('plan/pending/plot-x.md', head('2026-10-21') + add),
      p('plan/pending/plot-late.md', head('2026-10-22') + add.replace('?x', '?y')),
      p('plan/pending/b-lane.md', head('2026-10-21') + lane),
      p('plan/pending/07.5.md', head('2026-10-21', '07.5') + add.replace('?x', '?z')),
    ];
    assert.deepEqual(
      settleOrder(files).map((f) => path.basename(f.file, '.md')),
      ['07.4', '07.5', 'b-lane', 'plot-x', '07.3', 'lone', 'plot-late'],
    );
  });

  it('knows what adds: an Add, a README edit (a lane entry), a plot; not a lone close or decision', () => {
    assert.equal(addsWork(p('plan/pending/plot-x.md', head('2026-10-21') + add)), true);
    assert.equal(addsWork(p('plan/pending/b-lane.md', head('2026-10-21') + lane)), true);
    assert.equal(addsWork(p('plan/pending/plot-d.md', head('2026-10-21') + decision)), true);
    assert.equal(addsWork(p('plan/pending/07.3.md', head('2026-10-21', '07.3'))), false);
    assert.equal(addsWork(p('plan/pending/lone.md', head('2026-10-21') + decision)), false);
  });
});
