// progress.mjs (/next status, /heads-down): a spec's chunks read from the spec and ARCHIVE.md (a pending close counts
// as closed), when the chunk under way began (its claim, or the release of the one before it in a group claim), and
// the view: the 24-character bar, closed chunks struck through, `<--- [here]`, and times only for the chunks the same
// loop holds; the same as data for --json (states closed, claimed, open). node:test, no deps, no git.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAR, archiveLine, bar, claimEvents, closedChunks, hours, openChunks, render, short, specData, startedAt } from '../plan/progress.mjs';

const H = 3_600_000;
const now = Date.parse('2026-10-20T18:00:00Z');
const loop = { who: 'privileged_agent_session', host: 'box', session: 'aaaa1111', at: new Date(now - H).toISOString(), pr: null, held: '', base: '' };

describe('reading a spec', () => {
  it('takes each open chunk with its size, a wrapped line joined and its sub-bullets left out', () => {
    const spec = [
      '## Chunks',
      'Measure: 3 open · 1 closed · next A5',
      '',
      '- [ ] **32.1** Armed-ness step and check_cadence in both',
      '  heartbeat files · M · closes A1, A2 · needs —',
      '  - A sub-bullet · L · never read as the size',
      '- [ ] **32.2** Loop-shapes: describe the new checks · S · closes A3 · needs 32.1',
      '- [x] **32.0** a ticked line is not open · S · closes A4 · needs —',
    ].join('\n');
    assert.deepEqual(openChunks(spec), [
      { id: '32.1', text: 'Armed-ness step and check_cadence in both heartbeat files', size: 'M' },
      { id: '32.2', text: 'Loop-shapes', size: 'S' },
    ]);
  });

  it('shortens a title at its first colon or semicolon, and to 64 characters', () => {
    assert.equal(short('The progress bar: a 24-character view'), 'The progress bar');
    assert.equal(short('A: too short a head to cut'), 'A: too short a head to cut');
    assert.equal(short('x'.repeat(80)).length, 66);
  });

  it("reads one spec's archive lines, a commit or range and `(this commit)` dropped", () => {
    const archive = [
      '- 2026-10-19 · 07.1 · Search box renders · a1b2c3d',
      '- 2026-10-20 · 07.2 · Results page lists hits · a1b2c3d..e4f5a6b',
      '- 2026-10-20 · 07.3 · Empty state shows · (this commit)',
      '- 2026-10-20 · 17.1 · Another spec · a1b2c3d',
      '- 2026-10-20 · 07 · spec complete: Search · deleted in a1b2c3d',
      '- 2026-10-20 · 07.4 · From a pending file',
    ].join('\n');
    assert.deepEqual(closedChunks(archive, '07').map((c) => `${c.id}:${c.text}`), [
      '07.1:Search box renders',
      '07.2:Results page lists hits',
      '07.3:Empty state shows',
      '07.4:From a pending file',
    ]);
  });

  it('parses an archive line by field: no range shape ever reaches the says', () => {
    const rows = [
      ['- 2026-10-21 · 39.4 · one PR-mode tick ran end to end in a scratch adopter · plan only', '39.4', 'one PR-mode tick ran end to end in a scratch adopter', 'plan only', null],
      ['- 2026-10-21 · 40.2 · The board reads order.mjs · 91beab70..cad98343', '40.2', 'The board reads order.mjs', '91beab70..cad98343', 'cad98343'],
      ['- 2026-07-02 · 02 · The kit\'s own verify gate · 84ea179', '02', "The kit's own verify gate", '84ea179', '84ea179'],
      ['- 2026-10-22 · 49.9 · The archive parses · (this commit)', '49.9', 'The archive parses', '(this commit)', null],
      ['- 2026-10-22 · 49.1 · Kept: the cron · read by field · ec8af4d', '49.1', 'Kept: the cron · read by field', 'ec8af4d', 'ec8af4d'],
      ['- 2026-10-22 · 49.2 · No range at all', '49.2', 'No range at all', null, null],
      ['- 2026-10-22 · 49.3 · Ends on a word · not a range', '49.3', 'Ends on a word · not a range', null, null],
      ['- 2026-10-21 · 34 · spec complete: three doors · 662485d0..3ef5002f', '34', 'spec complete: three doors', '662485d0..3ef5002f', '3ef5002f'],
      ['- 2026-01-20 · 01 · spec complete: Bootstrap · absorbed into identity · deleted in 4d5e6f7', '01', 'spec complete: Bootstrap · absorbed into identity', 'deleted in 4d5e6f7', '4d5e6f7'],
    ];
    for (const [line, id, says, range, commit] of rows) {
      const a = archiveLine(line);
      assert.deepEqual([a.id, a.says, a.range, a.commit], [id, says, range, commit], line);
      assert.ok(!/plan only|\(this commit\)|[0-9a-f]{7,}\.\.[0-9a-f]{7,}/.test(a.says), line);
    }
    assert.equal(archiveLine('Format: `- <date> · <chunk> · ...`'), null);
    assert.equal(archiveLine('- 2026-10-22 · not an id · x'), null);
  });

  it("drops the range from a closed chunk's title, plan only included, and keeps the closing commit", () => {
    const archive = [
      '- 2026-10-21 · 39.4 · one PR-mode tick ran end to end in a scratch adopter · plan only',
      '- 2026-10-22 · 39.5 · The tick lands · a1b2c3d..ec8af4d',
      '- 2026-10-22 · 39 · spec complete: ticks · a1b2c3d..ec8af4d',
    ].join('\r\n');
    assert.deepEqual(closedChunks(archive, '39'), [
      { id: '39.4', day: '2026-10-21', text: 'one PR-mode tick ran end to end in a scratch adopter', range: 'plan only', commit: null },
      { id: '39.5', day: '2026-10-22', text: 'The tick lands', range: 'a1b2c3d..ec8af4d', commit: 'ec8af4d' },
    ]);
  });
});

describe('when the chunk under way began', () => {
  const log = [
    `${new Date(now - 1 * H).toISOString()}\trelease 07.1 · privileged_agent_session@box`,
    `${new Date(now - 3 * H).toISOString()}\tclaim 07.1, 07.2, 07.3 · privileged_agent_session@box`,
    `${new Date(now - 9 * H).toISOString()}\tclaim 09.1 · sam@pc`,
  ].join('\n');
  const events = claimEvents(log);

  it('parses the claims log newest first', () => {
    assert.deepEqual(events[1], { at: now - 3 * H, verb: 'claim', ids: ['07.1', '07.2', '07.3'] });
  });
  it('is the release of the chunk before it in a group claim', () => {
    assert.equal(startedAt('07.2', events), now - H);
  });
  it('is its own claim when nothing in its spec was released since', () => {
    assert.equal(startedAt('09.1', events), now - 9 * H);
  });
  it('is null for a chunk never claimed', () => {
    assert.equal(startedAt('11.1', events), null);
  });
});

describe('the view', () => {
  it('draws a 24-character ASCII bar', () => {
    const b = bar(2, 5);
    assert.equal(BAR, 24);
    assert.match(b, /^\[#{10}\.{14}\] 2 of 5 chunks · 40%$/);
    assert.equal(bar(0, 0), `[${'.'.repeat(24)}] 0 of 0 chunks · 0%`);
  });

  it('rounds hours to the half, minutes to five', () => {
    assert.equal(hours(0.3), '20 min');
    assert.equal(hours(2.4), '2.5 h');
  });

  const closed = [{ id: '07.1', day: '2026-10-20', text: 'Search box renders' }];
  const open = [
    { id: '07.2', text: 'Results page', size: 'M' },
    { id: '07.3', text: 'Empty state', size: 'S' },
    { id: '07.4', text: 'Paging', size: 'L' },
    { id: '07.5', text: 'Someone else', size: 'S' },
  ];
  const claims = { '07.2': loop, '07.3': loop, '07.4': loop, '07.5': { ...loop, who: 'sam', session: 'bbbb2222' } };
  const events = claimEvents(`${new Date(now - H).toISOString()}\tclaim 07.2, 07.3, 07.4 · privileged_agent_session@box`);
  const lines = render({ spec: '07', title: 'Search', closed, open, claims, events, now, mine: (c) => c?.session === 'aaaa1111' });

  it('strikes closed chunks through and marks the one under way with its elapsed time', () => {
    assert.equal(lines[0], 'Spec 07 · Search');
    assert.ok(lines.includes('- ~~07.1 Search box renders~~ (closed 10-20)'));
    assert.ok(lines.includes('- 07.2 Results page (M) · under way for about 1 h <--- [here]'));
  });
  it("times the loop's next chunks from their sizes, after what is left of the current one", () => {
    assert.ok(lines.includes('- 07.3 Empty state (S) · coming up in about 1.5 h'));
    assert.ok(lines.includes('- 07.4 Paging (L) · coming up in about 2.5 h'));
  });
  it("names another claimant's chunk instead of timing it", () => {
    assert.ok(lines.includes("- 07.5 Someone else (S) · sam's"));
  });
  it('says not claimed yet when no live claim holds a chunk', () => {
    const quiet = render({ spec: '07', closed, open, now });
    assert.ok(quiet.includes('- 07.2 Results page (M) · not claimed yet'));
    assert.ok(!quiet.some((l) => l.includes('<--- [here]')));
  });
});

describe('the data (--json)', () => {
  const closed = [{ id: '07.1', day: '2026-10-20', text: 'Search box renders' }];
  const open = [
    { id: '07.2', text: 'Results page', size: 'M' },
    { id: '07.3', text: 'Empty state', size: 'S' },
    { id: '07.4', text: 'Paging', size: null },
    { id: '07.5', text: 'Someone else', size: 'S' },
    { id: '07.6', text: 'Forgotten', size: 'L' },
  ];
  const claims = {
    '07.2': loop,
    '07.3': loop,
    '07.5': { ...loop, who: 'sam', session: 'bbbb2222', pr: 41 },
    '07.6': { ...loop, who: 'kim', session: 'cccc3333', at: new Date(now - 30 * H).toISOString() },
  };
  const events = claimEvents(`${new Date(now - H).toISOString()}\tclaim 07.2, 07.3 · privileged_agent_session@box`);
  const data = specData({ spec: '07', title: 'Search', file: '07-search.md', closed, open, claims, events, now, mine: (c) => c?.session === 'aaaa1111' });
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));

  it('lists every chunk with its state: closed, claimed (live claim or PR) or open (none, or a stale claim)', () => {
    assert.deepEqual(data.chunks.map((c) => `${c.id}:${c.state}`), ['07.1:closed', '07.2:claimed', '07.3:claimed', '07.4:open', '07.5:claimed', '07.6:open']);
    assert.deepEqual(byId['07.1'], { id: '07.1', title: 'Search box renders', size: null, state: 'closed', hours: null, closedOn: '2026-10-20', claim: null, underWay: null, comingUpIn: null });
    assert.equal(byId['07.6'].claim, null);
  });

  it('counts, percent, the estimate left and the chunk under way', () => {
    assert.deepEqual(
      [data.spec, data.title, data.file, data.status, data.percent, data.hoursLeft, data.here],
      ['07', 'Search', '07-search.md', 'chunked', 17, 2.5 + 1 + 2.5 + 1 + 5, '07.2'],
    );
    assert.deepEqual(data.counts, { closed: 1, claimed: 3, open: 2, total: 6 });
  });

  it('carries the times the view draws: under way, and coming up in the same loop', () => {
    assert.deepEqual(byId['07.2'].underWay, { since: new Date(now - H).toISOString(), hours: 1, left: 1.5 });
    assert.equal(byId['07.3'].comingUpIn, 1.5);
    assert.deepEqual(byId['07.2'].claim, { who: 'privileged_agent_session', mine: true, pr: null, held: null, wholeSpec: false });
    assert.deepEqual(byId['07.5'].claim, { who: 'sam', mine: false, pr: 41, held: null, wholeSpec: false });
    assert.equal(byId['07.5'].comingUpIn, null);
  });

  it("counts a hold on the spec's number as a claim on every chunk without its own", () => {
    const hold = { ...loop, who: 'dave', session: '', held: 'dave' };
    const d = specData({ spec: '07', closed: [], open: open.slice(0, 2), claims: { '07': hold }, now });
    assert.deepEqual(d.chunks.map((c) => [c.state, c.claim?.wholeSpec, c.claim?.held]), [['claimed', true, 'dave'], ['claimed', true, 'dave']]);
  });

  it('says unchunked or missing for a spec with no chunks, and serializes as plain JSON', () => {
    assert.equal(specData({ spec: '11', file: '11-docs.md', closed: [], open: [], now }).status, 'unchunked');
    const none = specData({ spec: '12', closed: [], open: [], now });
    assert.deepEqual([none.status, none.percent, none.counts.total, none.here], ['missing', 0, 0, null]);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  });
});
