// promote.mjs (aged promotion behind a Held veto): the knobs read from bearings with conservative defaults; the pick
// is the best aged (or twice re-evidenced) candidate over the floor, capped per week with vetoes counted; the Held line
// keeps the spec out of every pick; the sweep vetoes on a closed issue and releases an open one past its window, and
// the plan it leaves passes plan-check. node:test, no deps, no gh: issue states are injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkHistory, checkPlan, loadPlanDir } from '../plan-check.mjs';
import { lanes } from '../plan/order.mjs';
import {
  KNOBS, addHeld, apply, autoHeld, capCut, cutStale, cuts, decide, heldLine, knobs, main, parseCandidates, pick, reevidence, rejectCandidate,
} from '../plan/promote.mjs';

const row = (score, title, proposed, extra = []) => [`### [ ] [score ${score}] ${title}`, `- proposed: ${proposed} (expand pass 3)`, ...extra, '- rationale: x', ''].join('\n');

const CANDIDATES = [
  '# Candidates', '', '> Last pass: 2026-10-20', '> Pass count: 4', '> Posture: bold', '',
  '## Pending', '',
  row('7.5', 'Old and strong', '2026-09-01'),
  row('7.5', 'Older and as strong', '2026-08-01'),
  row('8.0', 'Fresh but loud', '2026-10-20', ['  re-evidenced 2026-10-21, 2026-10-22']),
  row('9.0', 'Fresh and quiet', '2026-10-20', ['- last re-evidenced: 2026-10-22']),
  row('5.0', 'Old and weak', '2026-07-01'),
  '## Promoted', '', '(empty — populated as `/oversight` promotes candidates to the', 'build plan)', '',
  '## Rejected', '', '(empty — populated as `/oversight` rejects candidates)', '',
].join('\n');

const AGED = knobs('- Promote: aged\n- promote_after_days: 14\n- promote_per_week: 2');

describe('knobs', () => {
  it('reads each key in plain or bold form, and defaults to owner', () => {
    assert.deepEqual(knobs(''), KNOBS);
    assert.equal(KNOBS.promote, 'owner');
    const k = knobs('## Plan expansion posture\n\n- **Promote:** aged\n- `promote_after_days`: 14\n- promote_floor: 6.5\n- promote_per_week: 2\n- veto_days: 3\n');
    assert.deepEqual(k, { promote: 'aged', afterDays: 14, floor: 6.5, perWeek: 2, vetoDays: 3, pendingCap: 15 });
    assert.equal(knobs('Promote: whenever').promote, 'owner');
  });
});

describe('parseCandidates', () => {
  it('reads Pending rows with their re-evidence dates, and every auto-promotion date', () => {
    const { pending, auto } = parseCandidates(`${CANDIDATES}\n- promoted: 2026-10-24, auto (expand pass 3), veto #9\n`);
    assert.equal(pending.length, 5);
    assert.deepEqual(pending.map((c) => c.reEvidence), [0, 0, 2, 1, 0]);
    assert.equal(pending[0].proposed, '2026-09-01');
    assert.deepEqual(auto, ['2026-10-24']);
  });
});

describe('pick', () => {
  const c = parseCandidates(CANDIDATES);
  it('changes nothing under Promote: owner', () => {
    assert.equal(pick(c, KNOBS, { date: '2026-10-25' }).pick, null);
    assert.match(pick(c, KNOBS, { date: '2026-10-25' }).reason, /owner/);
  });
  it('takes the best score over the floor that is aged or re-evidenced twice, ties to the oldest', () => {
    const r = pick(c, AGED, { date: '2026-10-25' });
    assert.equal(r.pick.title, 'Fresh but loud');
    const noLoud = { ...c, pending: c.pending.filter((x) => x.title !== 'Fresh but loud') };
    assert.equal(pick(noLoud, AGED, { date: '2026-10-25' }).pick.title, 'Older and as strong');
    const young = { ...c, pending: c.pending.filter((x) => x.title === 'Fresh and quiet' || x.title === 'Old and weak') };
    assert.equal(pick(young, AGED, { date: '2026-10-25' }).pick, null);
  });
  it('caps at promote_per_week in 7 days, vetoed promotions included', () => {
    assert.equal(pick({ ...c, auto: ['2026-10-20', '2026-10-24'] }, AGED, { date: '2026-10-25' }).pick, null);
    assert.ok(pick({ ...c, auto: ['2026-10-18', '2026-10-24'] }, AGED, { date: '2026-10-25' }).pick);
  });
  it('a contributor gets one needs-user ask instead of a promotion', () => {
    const r = pick(c, AGED, { date: '2026-10-25', owner: false });
    assert.equal(r.pick, null);
    assert.equal(r.ask.title, 'Fresh but loud');
  });
});

const README = [
  '# Roadmap', '', '## Lanes', '', '**Asap** (in order):', '', '', '**Held** (waits on the owner\'s word; never picked until the', 'line goes):', '', '- (none)', '',
  '## Specs', '', '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 07 | Search | [07-search.md](07-search.md) | planned | 1 left |',
  '| 59 | Thing | [59-thing.md](59-thing.md) | planned | not chunked |', '',
].join('\n');

describe('the Held line', () => {
  it('replaces (none), holds the spec out of every pick, and reads back', () => {
    const line = heldLine('59', 123, '2026-10-28', 3);
    assert.equal(line, '- 59 · auto-promoted, veto until 2026-10-28 (#123) · max_age: 3d · fallback: release');
    const r = addHeld(README, line);
    assert.ok(!r.includes('- (none)'));
    assert.deepEqual(lanes(r).held, ['59']);
    const two = addHeld(r, heldLine('60', 124, '2026-10-29', 3));
    assert.deepEqual(autoHeld(two).map((e) => [e.spec, e.issue, e.until]), [['59', 123, '2026-10-28'], ['60', 124, '2026-10-29']]);
  });
  it('the sweep: a closed issue vetoes, an open one releases only past its window', () => {
    const e = { until: '2026-10-28' };
    assert.equal(decide(e, 'CLOSED', '2026-10-26'), 'veto');
    assert.equal(decide(e, 'CLOSED', '2026-11-02'), 'veto');
    assert.equal(decide(e, 'OPEN', '2026-10-28'), 'wait');
    assert.equal(decide(e, 'OPEN', '2026-10-29'), 'release');
    assert.equal(decide(e, null, '2026-11-02'), 'wait');
  });
});

describe('rejectCandidate', () => {
  it('moves the promoted row to Rejected, marked vetoed, and drops the placeholder', () => {
    const text = CANDIDATES.replace('## Promoted\n\n(empty — populated as `/oversight` promotes candidates to the\nbuild plan)\n',
      '## Promoted\n\n### [promoted 2026-10-25 → spec 59] [score 7.5] Thing\n- promoted: 2026-10-25, auto (expand pass 4), veto #123\n');
    const r = rejectCandidate(text, '59', 123, '2026-10-26');
    assert.ok(r.moved);
    const rejected = r.text.slice(r.text.indexOf('## Rejected'));
    assert.match(rejected, /### \[vetoed 2026-10-26 \(#123\)\] \[score 7\.5\] Thing/);
    assert.ok(!rejected.includes('(empty'));
    assert.ok(!r.text.slice(0, r.text.indexOf('## Rejected')).includes('Thing'));
    assert.deepEqual(parseCandidates(r.text).auto, ['2026-10-25']);
  });
});

const SPEC_07 = '# 07 — Search\n\n## Acceptance\n\n- **A1** x.\n\n## Chunks\n\nMeasure: 1 open · 0 closed · next A2\n\n- [ ] **07.1** x · S · closes A1 · needs —\n';
const SPEC_59 = '# 59 — Thing\n\n## Acceptance\n\n- **A1** y.\n\n## Chunks\n\nMeasure: 1 open · 0 closed · next A2\n\nNot chunked yet.\n';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promote '));
  const plan = path.join(root, 'plan');
  fs.mkdirSync(plan);
  fs.writeFileSync(path.join(plan, 'README.md'), addHeld(README, heldLine('59', 123, '2026-10-28', 3)));
  fs.writeFileSync(path.join(plan, '07-search.md'), SPEC_07);
  fs.writeFileSync(path.join(plan, '59-thing.md'), SPEC_59);
  fs.writeFileSync(path.join(plan, 'ARCHIVE.md'), '# Archive\n\n- 2026-10-20 · 07.0 · x · abc\n');
  fs.writeFileSync(path.join(plan, 'bearings.md'), '## Plan expansion posture\n\n- Promote: aged\n- veto_days: 3\n');
  fs.writeFileSync(path.join(plan, 'CANDIDATES.md'), CANDIDATES.replace('## Promoted\n\n(empty — populated as `/oversight` promotes candidates to the\nbuild plan)\n',
    '## Promoted\n\n### [promoted 2026-10-25 → spec 59] [score 7.5] Thing\n- promoted: 2026-10-25, auto (expand pass 4), veto #123\n'));
  return root;
}

describe('apply', () => {
  it('a veto deletes the spec, its row and Held line, rejects the candidate, and plan-check stays green', () => {
    const root = repo();
    const plan = path.join(root, 'plan');
    const before = loadPlanDir(plan);
    assert.deepEqual(checkPlan(before), []);
    const [entry] = autoHeld(fs.readFileSync(path.join(plan, 'README.md'), 'utf8'));
    apply(root, entry, 'veto', '2026-10-26');
    assert.ok(!fs.existsSync(path.join(plan, '59-thing.md')));
    const readme = fs.readFileSync(path.join(plan, 'README.md'), 'utf8');
    assert.ok(!readme.includes('59'));
    assert.ok(readme.includes('- (none)'));
    assert.match(fs.readFileSync(path.join(plan, 'CANDIDATES.md'), 'utf8'), /\[vetoed 2026-10-26 \(#123\)\]/);
    assert.match(fs.readFileSync(path.join(plan, 'ARCHIVE.md'), 'utf8'), /^- 2026-10-26 · 59 · spec vetoed: Thing \(#123\) · plan only$/m);
    const after = loadPlanDir(plan);
    assert.deepEqual(checkPlan(after), []);
    assert.deepEqual(checkHistory(before.specs, after.specs, after.archive), []);
  });
  it('a release removes only the Held line; the spec is picked as usual', () => {
    const root = repo();
    const plan = path.join(root, 'plan');
    const [entry] = autoHeld(fs.readFileSync(path.join(plan, 'README.md'), 'utf8'));
    apply(root, entry, 'release', '2026-10-29');
    const readme = fs.readFileSync(path.join(plan, 'README.md'), 'utf8');
    assert.deepEqual(lanes(readme).held, []);
    assert.ok(fs.existsSync(path.join(plan, '59-thing.md')));
    assert.ok(readme.includes('[59-thing.md]'));
    assert.deepEqual(checkPlan(loadPlanDir(plan)), []);
  });
});

describe('main', () => {
  it('sweep without --write prints and writes nothing; with --write it applies', () => {
    const root = repo();
    const readmeFile = path.join(root, 'plan', 'README.md');
    const was = fs.readFileSync(readmeFile, 'utf8');
    const out = [];
    const opts = { root, state: () => 'CLOSED', log: (l) => out.push(l), owner: () => true };
    assert.equal(main(['sweep', '--today', '2026-10-26'], opts), 0);
    assert.deepEqual(out, ['veto 59 #123', '1 of 1 auto-promoted Held lines due']);
    assert.equal(fs.readFileSync(readmeFile, 'utf8'), was);
    out.length = 0;
    assert.equal(main(['sweep', '--today', '2026-10-26', '--write'], { ...opts, state: () => 'OPEN' }), 0);
    assert.deepEqual(out, ['wait 59 #123 until 2026-10-28', '0 of 1 auto-promoted Held lines applied']);
    out.length = 0;
    main(['sweep', '--today', '2026-10-29', '--write'], { ...opts, state: () => 'OPEN' });
    assert.deepEqual(out, ['release 59 #123', '1 of 1 auto-promoted Held lines applied']);
    out.length = 0;
    main(['sweep'], opts);
    assert.deepEqual(out, ['clean']);
  });
  it('pick reads bearings and candidates; hold writes the Held line veto_days out', () => {
    const root = repo();
    const out = [];
    const opts = { root, log: (l) => out.push(l), owner: () => true };
    main(['pick', '--today', '2026-10-25'], opts);
    assert.match(out[0], /^none: 1 auto-promotion in the last 7 days \(cap 1\)$/);
    main(['pick', '--today', '2026-10-25'], { ...opts, owner: () => false });
    assert.match(out[1], /^ask \[score 8\] Fresh but loud/);
    main(['hold', '60', '124', '--today', '2026-10-25'], opts);
    assert.equal(out[2], '- 60 · auto-promoted, veto until 2026-10-28 (#124) · max_age: 3d · fallback: release');
    assert.deepEqual(lanes(fs.readFileSync(path.join(root, 'plan', 'README.md'), 'utf8')).held, ['59', '60']);
    assert.equal(main(['hold', 'x'], opts), 64);
  });
});

describe('reevidence: Pending stays live', () => {
  const ROW = ['## Pending', '', '### [ ] [score 6.0] Lean thing', '- proposed: 2026-08-01 (expand pass 3)', '  wrapped', '- source signals: AUDIT row #12, commit abc1234', '- rationale: x', '', '## Rejected', ''].join('\n');
  it('an independent signal adds +0.5, records the filed score, and counts toward the aging trigger', () => {
    const r = reevidence(ROW, 'lean', 'B', '#40', { date: '2026-10-25', note: 'critique · pass 9' });
    assert.equal(r.independent, true);
    assert.deepEqual([r.from, r.to], [6, 6.5]);
    assert.match(r.text, /^### \[ \] \[score 6\.5\] Lean thing$/m);
    assert.match(r.text, /- proposed: 2026-08-01 \(expand pass 3\)\n {2}wrapped\n- filed score: 6\.0\n/);
    assert.match(r.text, /- re-evidence:\n {2}- 2026-10-25 · B #40 · independent, \+0\.5 · critique - pass 9\n/);
    const [c] = parseCandidates(r.text).pending;
    assert.equal(c.score, 6.5);
    assert.equal(c.reEvidence, 1);
  });
  it('the same letter with no new ref, or a ref the row already cites, adds nothing and does not count', () => {
    const once = reevidence(ROW, 'Lean thing', 'B', '#40', { date: '2026-10-25' }).text;
    for (const ref of [null, '#40', '#12', 'abc1234ffff']) {
      const r = reevidence(once, 'Lean thing', 'B', ref, { date: '2026-10-26' });
      assert.equal(r.independent, false, String(ref));
      assert.equal(r.to, 6.5);
      assert.match(r.text, /2026-10-26 · B.* · same source, \+0/);
      assert.equal(parseCandidates(r.text).pending[0].reEvidence, 1);
    }
    const fresh = reevidence(once, 'Lean thing', 'B', '#41', { date: '2026-10-26' });
    assert.equal(fresh.to, 7);
    assert.equal(parseCandidates(fresh.text).pending[0].reEvidence, 2);
    assert.equal(reevidence(once, 'Lean thing', 'D', null, { date: '2026-10-26' }).to, 7);
  });
  it('caps at +2 over the filed score; capped signals still count', () => {
    let text = ROW;
    for (const [letter, ref] of [['A', null], ['B', null], ['C', null], ['D', null], ['E', null], ['A', '#99']]) text = reevidence(text, 'Lean', letter, ref, { date: '2026-10-25' }).text;
    assert.match(text, /\[score 8\.0\] Lean thing/);
    assert.match(text, /· D · independent, \+0\.5\n {2}- 2026-10-25 · E · independent, capped at \+2\n {2}- 2026-10-25 · A #99 · independent, capped at \+2/);
    assert.equal((text.match(/- filed score:/g) ?? []).length, 1);
    assert.equal(parseCandidates(text).pending[0].reEvidence, 6);
  });
  it('a title matching no row, or several, is an error', () => {
    assert.match(reevidence(ROW, 'nothing like it', 'A').error, /no Pending row/);
    assert.match(reevidence(CANDIDATES, 'old', 'A').error, /3 Pending rows match/);
    assert.equal(reevidence(CANDIDATES, 'Old and strong', 'A', null, { date: '2026-10-25' }).title, 'Old and strong');
  });
});

describe('the pending cap', () => {
  const many = (n, proposed = '2026-07-01') => [
    '# Candidates', '', '## Pending', '',
    ...Array.from({ length: n }, (_, i) => row(`${(5 + (i % 10) / 2).toFixed(1)}`, `Row ${i}`, i === 0 ? '2026-10-01' : proposed)),
    '## Promoted', '', '## Rejected', '', '(empty — populated as `/oversight` rejects candidates)', '',
  ].join('\n');
  const K = knobs('- pending_cap: 15');
  it('defaults to 15 and reads pending_cap', () => {
    assert.equal(KNOBS.pendingCap, 15);
    assert.equal(knobs('- pending_cap: 4').pendingCap, 4);
  });
  it('at or under the cap, cuts nothing', () => {
    assert.deepEqual(capCut(parseCandidates(many(15)), K, '2026-10-25').cut, []);
  });
  it('over the cap, cuts the lowest scores 60+ days old, at most 5 a pass, ties to the oldest', () => {
    const text = many(32);
    const r = capCut(parseCandidates(text), K, '2026-10-25');
    assert.equal(r.over, 17);
    assert.deepEqual(r.cut.map((c) => c.title), ['Row 10', 'Row 20', 'Row 30', 'Row 1', 'Row 11']);
    assert.ok(r.cut.every((c) => c.age >= 60));
    const after = cutStale(text, r.cut.map((c) => c.title), '2026-10-25');
    assert.equal(parseCandidates(after).pending.length, 27);
    assert.match(after, /### \[rejected 2026-10-25\] \[score 5\.0\] Row 10\n- reason: stale: below cap cut 2026-10-25\n- proposed: 2026-07-01/);
    assert.ok(!after.includes('(empty'));
    assert.deepEqual(cuts(after, '2026-10-25').map((c) => c.title), r.cut.map((c) => c.title));
    assert.deepEqual(cuts(after, '2026-10-26'), []);
    let drained = after;
    for (let pass = 0; pass < 3; pass++) {
      const c = capCut(parseCandidates(drained), K, '2026-10-25');
      drained = cutStale(drained, c.cut.map((x) => x.title), '2026-10-25');
    }
    assert.equal(parseCandidates(drained).pending.length, 15, 'four passes drain 32 to 15');
    assert.ok(parseCandidates(drained).pending.some((c) => c.title === 'Row 0'), 'a row under 60 days old is never cut');
  });
  it('young rows are never cut, even far over the cap', () => {
    assert.deepEqual(capCut(parseCandidates(many(30, '2026-10-01')), K, '2026-10-25').cut, []);
  });
  it('main: cap prints, and writes only with --write; cuts lists them; reevidence writes only with --write', () => {
    const root = repo();
    const file = path.join(root, 'plan', 'CANDIDATES.md');
    fs.writeFileSync(file, many(17));
    fs.writeFileSync(path.join(root, 'plan', 'bearings.md'), '- pending_cap: 15\n');
    const out = [];
    const opts = { root, log: (l) => out.push(l), owner: () => true };
    assert.equal(main(['cap', '--today', '2026-10-25'], opts), 0);
    assert.equal(out.length, 3);
    assert.equal(out[0], 'cut [score 5] Row 10 · proposed 2026-07-01 (116d) · stale: below cap cut 2026-10-25');
    assert.equal(out[2], '17 Pending, cap 15: 2 of 2 over due');
    assert.equal(fs.readFileSync(file, 'utf8'), many(17));
    out.length = 0;
    main(['cap', '--today', '2026-10-25', '--write'], opts);
    assert.equal(out[2], '17 Pending, cap 15: 2 of 2 over cut');
    out.length = 0;
    main(['cap', '--today', '2026-10-25'], opts);
    assert.deepEqual(out, ['clean: 15 Pending (cap 15)']);
    out.length = 0;
    main(['cuts', '--since', '2026-10-20'], opts);
    assert.deepEqual(out, ['cut 2026-10-25 [score 5] Row 10', 'cut 2026-10-25 [score 5.5] Row 1']);
    out.length = 0;
    const was = fs.readFileSync(file, 'utf8');
    assert.equal(main(['reevidence', 'Row 2', 'B', '#7', '--today', '2026-10-25', '--note', 'x'], opts), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), was);
    assert.equal(main(['reevidence', 'Row 2', 'B', '#7', '--today', '2026-10-25', '--write'], opts), 0);
    assert.deepEqual(out, ['would re-evidence Row 2 · B #7 · independent · score 6.0 → 6.5', 're-evidenced Row 2 · B #7 · independent · score 6.0 → 6.5']);
    assert.match(fs.readFileSync(file, 'utf8'), /\[score 6\.5\] Row 2\n/);
    assert.equal(main(['reevidence', 'Row', 'B'], opts), 1);
    assert.equal(main(['reevidence', 'Row 2', 'Z'], opts), 64);
    assert.equal(main(['reevidence', 'Row 2', 'H', '--today', '2026-10-25'], opts), 0, 'the template reads signals A-H');
    assert.equal(main(['reevidence', 'Row 2', 'B', 'not-a-ref'], opts), 64);
  });
});
