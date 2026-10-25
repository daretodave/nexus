// motion.mjs (the motion pulse and the heartbeat's motion alarm) and the motion generator: shipped units counted per
// ISO week from feat/fix/content commits and chunk closes, the last full week judged against the 4-week baseline
// under `Motion floor`, the idle-tick ratio from `gh run list` JSON, ONE deduped `Heartbeat: motion stalled` issue
// over an adopter's Sep-Oct decline, a recovery that closes it, stall_action's promote/alert/off at the tick, and a
// generator that files one row per stalled week. node:test, no deps; git log and gh injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  addDays,
  archiveCloses,
  cloudRunIds,
  effectiveAction,
  floorPct,
  lines,
  main,
  measure,
  mondayOf,
  report,
  ships,
  stallAction,
  STALL_TITLE,
  unitsOf,
  weekKey,
} from '../plan/motion.mjs';
import * as generator from '../generators/motion.mjs';

// One adopter's build-verb commits per week, Jul to Oct (the spec's Why): ISO weeks 2026-W28 (Mon 07-06) to W40.
const SERIES = [32, 25, 28, 13, 7, 9, 1, 0, 1, 1, 0, 0, 0];
const FIRST_MONDAY = '2026-07-06';
const NOISE = ['audit: pass 12', 'digest: 2026-09-02', 'expand: pass 4 — 0 new, 1 re-evidenced', 'plan: veto sweep', 'critique: pass 3', 'triage: #12', 'jot: a note', 'docs: wording'];

/** A `git log --format=%x1e%cI%x1f%s` text: the series' units on Wednesdays, housekeeping commits every day. */
function seriesLog(series = SERIES, extra = []) {
  const recs = [];
  series.forEach((n, w) => {
    const wed = addDays(FIRST_MONDAY, 7 * w + 2);
    for (let i = 0; i < n; i++) recs.push([`${wed}T1${i % 10}:00:00-04:00`, i % 3 === 0 ? 'fix(cli): a fix' : 'feat: a feature']);
  });
  for (let d = 0; d < 7 * 16; d++) recs.push([`${addDays(FIRST_MONDAY, d)}T06:00:00Z`, NOISE[d % NOISE.length]]);
  recs.push(...extra);
  return recs.map(([iso, s]) => `\x1e${iso}\x1f${s}\n`).join('');
}

const fakeLog = (text, bodies = '') => (args) => (args.includes('--format=%B') ? bodies : text);

function tmpRoot(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const bearings = (lines) => ['# Bearings', '', '## Plan expansion posture', '', ...lines.map((l) => `- ${l}`), '', '## Hard rules', ''].join('\n');

/** A gh that remembers one repo's issues: the stall issue the alarm opens and closes, every call logged. */
function fakeGh({ labelled = true } = {}) {
  const state = { open: null, created: [], closed: [], notified: [], next: 100 };
  const run = (cmd, args) => {
    if (cmd === 'node') {
      state.notified.push(args);
      return { ok: true, stdout: '', stderr: '' };
    }
    const a = args.join(' ');
    if (a.startsWith('issue list') && a.includes('--label loop:stall')) {
      return { ok: true, stdout: JSON.stringify(state.open && state.open.labelled ? [state.open] : []), stderr: '' };
    }
    if (a.startsWith('issue list') && a.includes('--author')) {
      return { ok: true, stdout: JSON.stringify(state.open ? [{ ...state.open, author: { login: 'app/github-actions' } }] : []), stderr: '' };
    }
    if (a.startsWith('label create')) return { ok: true, stdout: '', stderr: '' };
    if (a.startsWith('issue create')) {
      const withLabels = a.includes('--label');
      if (withLabels && !labelled) return { ok: false, stdout: '', stderr: 'label not found' };
      state.open = { number: state.next++, title: args[args.indexOf('--title') + 1], labelled: withLabels };
      state.created.push(args);
      return { ok: true, stdout: '', stderr: '' };
    }
    if (a.startsWith('issue close')) {
      state.closed.push(args[2]);
      state.open = null;
      return { ok: true, stdout: '', stderr: '' };
    }
    return { ok: false, stdout: '', stderr: `unexpected gh ${a}` };
  };
  return { state, run };
}

const quiet = () => {
  const out = [];
  return { out, log: (l) => out.push(l) };
};

describe('weeks and units', () => {
  it('reads ISO weeks, Monday to Sunday, across year ends', () => {
    assert.equal(weekKey('2026-10-25'), '2026-W43');
    assert.equal(weekKey('2026-10-26'), '2026-W44');
    assert.equal(mondayOf('2026-10-25'), '2026-10-19');
    assert.equal(weekKey('2021-01-03'), '2020-W53');
    assert.equal(weekKey('2026-01-01'), '2026-W01');
    assert.equal(mondayOf('2026-01-01'), '2025-12-29');
  });

  it('counts feat, fix and content, scope stripped, and nothing else', () => {
    for (const s of ['feat: x', 'fix(cli): y', 'content: z', 'feat!: breaking']) assert.ok(ships(s), s);
    for (const s of [...NOISE, 'ci: x', 'templates: y', 'Merge pull request #3', 'feature: x', 'refix: y']) assert.ok(!ships(s), s);
  });

  it('counts chunk closes in ARCHIVE.md, not spec-complete or veto lines', () => {
    const text = [
      '- 2026-10-25 · 57.3 · Generator contract, refill lane · 279c4b1e',
      '- 2026-10-24 · 57 · spec complete: Anti-lull · absorbed into identity · deleted in abc',
      '- 2026-10-24 · 61 · spec vetoed: X (#12) · plan only',
      '- 2026-01-15 · 01.1 · Project boots · a1b2c3d',
    ].join('\n');
    assert.deepEqual(archiveCloses(text), ['2026-10-25', '2026-01-15']);
    assert.deepEqual(unitsOf('\x1e2026-10-20T23:30:00-04:00\x1ffeat: late\n\x1e2026-10-20T10:00:00Z\x1faudit: no\n', text), ['2026-10-21', '2026-10-25', '2026-01-15']);
  });

  it('reads Motion floor and stall_action from bearings, with the conservative defaults', () => {
    assert.equal(floorPct(''), 50);
    assert.equal(floorPct(bearings(['Motion floor: 30%'])), 30);
    assert.equal(floorPct(bearings(['**Motion floor:** 0%'])), 0);
    assert.equal(stallAction(''), 'alert');
    assert.equal(stallAction(bearings(['stall_action: promote'])), 'promote');
    assert.equal(stallAction(bearings(['stall_action: sometimes'])), 'alert');
    assert.deepEqual(effectiveAction(bearings(['stall_action: promote', 'Promote: aged'])).action, 'promote');
    assert.deepEqual(effectiveAction(bearings(['stall_action: promote', 'Promote: owner'])).action, 'alert');
    assert.deepEqual(effectiveAction(bearings(['stall_action: promote'])).action, 'alert', 'no Promote key reads owner');
    assert.deepEqual(effectiveAction(bearings(['stall_action: off'])).action, 'off');
  });
});

describe('report', () => {
  const units = unitsOf(seriesLog());

  it('judges the last full week against the 4 before it, and prints the contract lines', () => {
    const r = report({ units, date: '2026-09-09' });
    assert.equal(r.week, '2026-W36');
    assert.deepEqual([r.shipped, r.series, r.baseline, r.floor, r.verdict], [1, [7, 9, 1, 0], 4.25, 2.13, 'stalled']);
    const [a, b] = lines(r);
    assert.match(a, /^shipped 1 \/ baseline 4\.25 · 2026-W36 against 2026-W32\.\.2026-W35 \(1 so far in 2026-W37\)$/);
    assert.match(b, /^floor 2\.13 · stalled /);
    assert.equal(lines(r).length, 2, 'no idle line without --runs');
  });

  it('reads ok in a healthy week and while nothing ever shipped', () => {
    assert.equal(report({ units, date: '2026-07-29' }).verdict, 'ok', 'W30 28 against 32,25 and two empty weeks');
    assert.equal(report({ units: [], date: '2026-09-09' }).verdict, 'ok');
    assert.equal(report({ units: ['2026-09-08'], date: '2026-09-09' }).verdict, 'ok', 'history only in the week in progress');
  });

  it('stays stalled when five full weeks shipped nothing after shipping before', () => {
    const r = report({ units, date: '2026-10-25' });
    assert.deepEqual([r.shipped, r.baseline, r.verdict], [0, 0, 'stalled']);
    assert.match(r.why, /nothing shipped in 5 full weeks/);
  });

  it('lets the week in progress clear a stall once it reaches the floor', () => {
    const more = [...units, '2026-09-08', '2026-09-08', '2026-09-08'];
    const r = report({ units: more, date: '2026-09-09' });
    assert.equal(r.verdict, 'ok');
    assert.match(r.why, /2026-W37 already reaches the floor/);
  });

  it('turns off at Motion floor 0%', () => {
    assert.equal(report({ units, date: '2026-10-25', pct: 0 }).verdict, 'ok');
  });

  it('counts idle ticks: successful runs of the last 7 days no Cloud-Run trailer names', () => {
    const runs = [
      { databaseId: 11, conclusion: 'success', createdAt: '2026-10-24T06:00:00Z' },
      { databaseId: 12, conclusion: 'success', createdAt: '2026-10-23T06:00:00Z' },
      { url: 'https://github.com/o/r/actions/runs/13', conclusion: 'success', createdAt: '2026-10-22T06:00:00Z' },
      { databaseId: 14, conclusion: 'success', createdAt: '2026-10-21T06:00:00Z' },
      { databaseId: 15, conclusion: 'failure', createdAt: '2026-10-21T12:00:00Z' },
      { databaseId: 16, conclusion: 'success', createdAt: '2026-10-01T06:00:00Z' },
    ];
    const cloud = cloudRunIds('feat: x\n\nCloud-Run: https://github.com/o/r/actions/runs/12\n\x1efix: y\n\nCloud-Run: https://github.com/o/r/actions/runs/13/attempts/2\n');
    const r = report({ units, date: '2026-10-25', runs, cloudRuns: cloud });
    assert.deepEqual(r.idle, { idle: 2, total: 4, pct: 50 });
    assert.match(lines(r)[2], /^idle ticks 50% \(2\/4 successful march runs/);
    assert.match(lines(report({ units, date: '2026-10-25', runs: [] }))[2], /^idle ticks n\/a/);
  });

  it('measures a repo through its git log, archive, bearings and runs file', () => {
    const root = tmpRoot({
      'plan/bearings.md': bearings(['Motion floor: 25%']),
      'plan/ARCHIVE.md': '- 2026-09-02 · 9.1 · A chunk · abc\n',
      'runs.json': JSON.stringify([{ databaseId: 7, conclusion: 'success', createdAt: '2026-09-08T00:00:00Z' }]),
    });
    const r = measure(root, { date: '2026-09-09', runsFile: 'runs.json', log: fakeLog(seriesLog(), 'Cloud-Run: https://x/actions/runs/7\n') });
    assert.deepEqual([r.shipped, r.pct, r.floor, r.verdict], [2, 25, 1.06, 'ok']);
    assert.deepEqual(r.idle, { idle: 0, total: 1, pct: 0 });
  });
});

describe('the heartbeat alarm', () => {
  const alarmAt = (root, gh, date, log = seriesLog()) =>
    main(['alarm', '--today', date], { root, run: gh.run, log: quiet().log, measureFn: (r, o) => measure(r, { ...o, log: fakeLog(log) }) });

  it("opens exactly one issue over an adopter's Sep-Oct decline, a heartbeat run every day", () => {
    const root = tmpRoot({ 'plan/bearings.md': bearings(['Motion floor: 50%', 'stall_action: alert']) });
    const gh = fakeGh();
    for (let date = '2026-09-01'; date <= '2026-10-25'; date = addDays(date, 1)) assert.equal(alarmAt(root, gh, date), 0);
    assert.equal(gh.state.created.length, 1);
    const args = gh.state.created[0];
    assert.equal(args[args.indexOf('--title') + 1], STALL_TITLE);
    assert.ok(args.join(' ').includes('--label loop:opened --label loop:stall'));
    assert.match(args[args.indexOf('--body') + 1], /shipped 0 \/ baseline 7\.5/);
    assert.deepEqual(gh.state.closed, []);
  });

  it('closes the issue when a week recovers, and never reopens it while it stays healthy', () => {
    const root = tmpRoot({ 'plan/bearings.md': bearings(['stall_action: alert']) });
    const gh = fakeGh();
    const recover = seriesLog(SERIES, Array.from({ length: 6 }, (_, i) => [`2026-10-0${6 + (i % 3)}T12:00:00Z`, 'feat: back']));
    for (let date = '2026-09-28'; date <= '2026-10-16'; date = addDays(date, 1)) alarmAt(root, gh, date, recover);
    assert.equal(gh.state.created.length, 1);
    assert.deepEqual(gh.state.closed, ['100']);
  });

  it('dedupes on the unlabelled issue its own token opened when the labels could not be set', () => {
    const root = tmpRoot({ 'plan/bearings.md': bearings([]) });
    const gh = fakeGh({ labelled: false });
    for (const date of ['2026-09-09', '2026-09-10', '2026-09-16']) alarmAt(root, gh, date);
    assert.equal(gh.state.created.length, 1);
  });

  it('alerts through notify.mjs when the repo has it, and says the issue is the alert when not', () => {
    const withNotify = tmpRoot({ 'plan/bearings.md': bearings([]), 'scripts/notify.mjs': '' });
    const gh = fakeGh();
    alarmAt(withNotify, gh, '2026-09-09');
    assert.equal(gh.state.notified.length, 1);
    assert.ok(gh.state.notified[0].includes('--priority'));
    const promote = fakeGh();
    alarmAt(tmpRoot({ 'plan/bearings.md': bearings(['stall_action: promote', 'Promote: aged']), 'scripts/notify.mjs': '' }), promote, '2026-09-09');
    assert.equal(promote.state.notified.length, 0, 'promote opens the issue, the tick acts');
    assert.match(promote.state.created[0].join(' '), /runs expand's aged promotion \(§6, Promote: aged\)/);
  });

  it('files nothing under stall_action off', () => {
    const gh = fakeGh();
    alarmAt(tmpRoot({ 'plan/bearings.md': bearings(['stall_action: off']) }), gh, '2026-09-09');
    assert.equal(gh.state.created.length, 0);
  });

  it('closes an issue opened before the owner switched stall_action to off, and files no new one', () => {
    const gh = fakeGh();
    gh.state.open = { number: 42, title: STALL_TITLE, labelled: true };
    const root = tmpRoot({ 'plan/bearings.md': bearings(['stall_action: off']) });
    alarmAt(root, gh, '2026-09-09');
    assert.deepEqual(gh.state.closed, ['42']);
    alarmAt(root, gh, '2026-09-10');
    assert.deepEqual(gh.state.closed, ['42']);
    assert.equal(gh.state.created.length, 0);
  });
});

describe('the tick reacts to an open stall issue', () => {
  const react = (b, open) => {
    const gh = fakeGh();
    if (open) gh.state.open = { number: 42, title: STALL_TITLE, labelled: true };
    const q = quiet();
    main(['react'], { root: tmpRoot({ 'plan/bearings.md': bearings(b) }), run: gh.run, log: q.log });
    return q.out.join('\n');
  };

  it('runs the aged promotion under stall_action promote, and alerts instead under Promote: owner', () => {
    assert.match(react(['stall_action: promote', 'Promote: aged'], true), /^promote #42 /);
    assert.match(react(['stall_action: promote', 'Promote: owner'], true), /^alert #42 \(stall_action promote under Promote: owner falls back to alert\)/);
    assert.match(react(['stall_action: alert', 'Promote: aged'], true), /^alert #42/);
    assert.match(react(['stall_action: off'], true), /^off #42/);
    assert.match(react(['stall_action: promote', 'Promote: aged'], false), /^none:/);
  });

  it('refuses bad usage', () => {
    assert.equal(main(['nope']), 64);
    assert.equal(main(['report', '--today', 'soon']), 64);
    assert.equal(main(['report', '--runs']), 64);
  });
});

describe('the motion generator', () => {
  const run = (root, argv, date) => {
    const q = quiet();
    const code = generator.main([...argv, '--today', date], { root, log: q.log, measureFn: (r, o) => measure(r, { ...o, log: fakeLog(seriesLog()) }) });
    return { code, last: q.out[q.out.length - 1], out: q.out };
  };

  it('files one row for a stalled week, writes nothing dry, and nothing twice', () => {
    const root = tmpRoot({ 'plan/AUDIT.md': '# Audit\n\n## Pending\n\n## Done\n' });
    const before = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    assert.deepEqual([run(root, [], '2026-09-09').last], ['filed 1 (dry run)']);
    assert.equal(fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8'), before);
    assert.equal(run(root, ['--write'], '2026-09-09').last, 'filed 1');
    const audit = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    assert.match(audit, /### \[loop\] \[HIGH\] motion stalled in 2026-W36: 1 shipped against a 4-week baseline of 4\.25/);
    assert.match(audit, /- generator: motion · filed 2026-09-09/);
    assert.ok(audit.indexOf('motion stalled') < audit.indexOf('## Done'), 'under Pending');
    assert.equal(run(root, ['--write'], '2026-09-10').last, 'clean', 'same week, already filed');
    assert.equal(run(root, ['--write'], '2026-09-16').last, 'filed 1', 'a new stalled week');
  });

  it('files nothing when motion is ok or the limit is 0', () => {
    const root = tmpRoot({ 'plan/AUDIT.md': '# Audit\n\n## Pending\n' });
    assert.equal(run(root, ['--write'], '2026-07-29').last, 'clean');
    assert.equal(run(root, ['--write', '--limit', '0'], '2026-09-09').last, 'clean');
  });

  it('breaks with exit 1 when the history is unreadable', () => {
    const code = generator.main(['--today', '2026-09-09'], { root: tmpRoot(), log: () => {}, measureFn: () => { throw new Error('not a git checkout'); } });
    assert.equal(code, 1);
  });
});
