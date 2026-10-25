// locks.mjs (lock timeouts): every Held line, lane lock and owner-blocked row is found with its since/until/max_age;
// one past its time relaxes to its fallback (release removes the line, and the plan stays green) or files exactly ONE
// needs-user ask, re-pinged weekly by comment and closed once the lock goes; an auto-promotion is the veto sweep's.
// node:test, no deps, no network: gh and notify.mjs go through an injected runner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkPlan, loadPlanDir } from '../plan-check.mjs';
import { ASK_TITLE, LOCK_LABEL, PING, action, defaultMaxAge, findLocks, judge, main, release } from '../plan/locks.mjs';
import { addDays } from '../plan/promote.mjs';

const README = [
  '# Roadmap', '', '## Lanes', '',
  '**Asap** (built before the table):', '', '- (none)', '',
  "**Held** (waits on a person's word; never picked until the", 'line goes):', '',
  '- **07.2** · blocked: the token lacks scope · since: 2026-10-01 · until: the owner rotates it · max_age: 14d',
  '- **07.3** · held: copy review · since: 2026-10-20', '  · until: PR #12 merges · max_age: 7d · fallback: release',
  '- 08 · auto-promoted, veto until 2026-10-28 (#123) · max_age: 3d · fallback: release',
  '',
  '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 7 | Search | [07-search.md](07-search.md) | planned | 2 left |',
  '| 8 | Next | [08-next.md](08-next.md) | planned | not chunked |',
  '',
].join('\n');

const SPEC7 = '# 07 — Search\n\n## Acceptance\n\n- **A1** x.\n- **A2** y.\n\n## Chunks\n\nMeasure: 2 open · 0 closed · next A3\n\n- [ ] **07.2** Two · S · closes A1 · needs —\n- [ ] **07.3** Three · S · closes A2 · needs —\n';
const SPEC8 = '# 08 — Next\n\n## Acceptance\n\n- **A1** x.\n\n## Chunks\n\nMeasure: 1 open · 0 closed · next A2\n\nNot chunked yet.\n';

const LANES = [
  '# March lanes', '',
  '<!--', '## lane: example', '- hook: pre', '- lock: example · since: 2026-01-01 · until: never · max_age: 1d', '-->', '',
  '## lane: snapshot', '- hook: pre', '- run: node scripts/snapshot.mjs',
  '- lock: gap-table · since: 2026-10-01 · until: the gap table reads zero · fallback: run the sweep once and log it', '',
].join('\n');

const AUDIT = [
  '# Audit', '', '## Pending', '',
  '### [ ] [6.0] [needs-user-call] pick the palette', '- category: design',
  '- lock: palette · since: 2026-10-10 · until: 2026-10-30 · max_age: 30d', '',
  '### [ ] [5.0] a row with a broken lock', '- lock: broken · until: later', '',
].join('\n');

const FILES = { 'plan/README.md': README, 'skills/march.lanes.md': LANES, 'plan/AUDIT.md': AUDIT };

describe('findLocks and judge', () => {
  const locks = findLocks(FILES);
  const by = (slug) => locks.find((l) => l.slug === slug);

  it('finds Held lines by id, lane locks and owner-blocked rows by lock:, and skips a commented example', () => {
    assert.deepEqual(locks.map((l) => [l.slug, l.kind]), [
      ['held-07.2', 'held'], ['held-07.3', 'held'], ['held-08', 'held'],
      ['palette', 'row'], ['broken', 'row'], ['gap-table', 'lane'],
    ]);
    assert.equal(by('held-07.3').span, 2, 'a wrapped Held line spans its continuation');
    assert.equal(by('held-07.3').fallback, 'release');
    assert.equal(by('gap-table').maxAge, 14, 'outside the Held lane, max_age defaults to Lock max age');
    assert.equal(by('broken').problem, 'lacks since: YYYY-MM-DD');
  });

  it('a lock is past its time once older than max_age or past an until date; an auto-promotion is the veto sweep\'s', () => {
    assert.equal(judge(by('held-07.2'), '2026-10-15').state, 'ok');
    assert.equal(judge(by('held-07.2'), '2026-10-16').state, 'due');
    assert.match(judge(by('held-07.2'), '2026-10-25').why, /24d old, past max_age 14d/);
    assert.equal(judge(by('palette'), '2026-10-30').state, 'ok');
    assert.equal(judge(by('palette'), '2026-10-31').state, 'due');
    assert.match(judge(by('palette'), '2026-10-31').why, /until 2026-10-30 has passed/);
    assert.equal(judge(by('held-08'), '2026-11-30').state, 'veto');
    assert.equal(judge(by('broken'), '2026-11-30').state, 'bad');
  });

  it('the fallback decides the action: release, a fallback for the tick, or one ask', () => {
    assert.equal(action(by('held-07.3')), 'release');
    assert.equal(action(by('gap-table')), 'fallback');
    assert.equal(action(by('held-07.2')), 'ask');
  });

  it('reads Lock max age from bearings, 14d when absent', () => {
    assert.equal(defaultMaxAge(''), 14);
    assert.equal(defaultMaxAge('- Lock max age: 21d\n'), 21);
    assert.equal(defaultMaxAge('- **Lock max age:** 10d\n'), 10);
    assert.equal(findLocks(FILES, { maxAge: 21 }).find((l) => l.slug === 'gap-table').maxAge, 21);
  });
});

describe('release', () => {
  it('removes the lock\'s lines, an emptied Held lane reads - (none), and plan-check stays green', () => {
    const locks = findLocks({ 'plan/README.md': README });
    const once = release({ 'plan/README.md': README }, [locks[1]])['plan/README.md'];
    assert.doesNotMatch(once, /07\.3|PR #12/);
    assert.match(once, /\*\*07\.2\*\*/);
    const all = release({ 'plan/README.md': README }, locks)['plan/README.md'];
    assert.match(all, /line goes\):\n\n- \(none\)\n\n## Specs/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locks-'));
    for (const [f, t] of [['README.md', once], ['07-search.md', SPEC7], ['08-next.md', SPEC8]]) fs.writeFileSync(path.join(dir, f), t);
    assert.deepEqual(checkPlan({ ...loadPlanDir(dir), manifest: undefined }), []);
    fs.writeFileSync(path.join(dir, 'README.md'), all);
    assert.deepEqual(checkPlan({ ...loadPlanDir(dir), manifest: undefined }), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a released row lock above the lane does not push the placeholder out of the lane', () => {
    const text = README
      .replace('- (none)\n\n**Held**', '- (none)\n\n- lock: freeze · since: 2026-10-01 · until: the owner thaws it\n  · max_age: 3d · fallback: release\n\n**Held**')
      .replace(/^- \*\*07\.2\*\*.*\n/m, '')
      .replace(/^- 08 · .*\n/m, '');
    const locks = findLocks({ 'plan/README.md': text });
    assert.deepEqual(locks.map((l) => [l.slug, l.kind]), [['held-07.3', 'held'], ['freeze', 'row']]);
    const out = release({ 'plan/README.md': text }, locks)['plan/README.md'];
    assert.doesNotMatch(out, /freeze|07\.3/);
    assert.match(out, /line goes\):\n\n- \(none\)\n\n## Specs/);
  });
});

/** A gh that keeps its issues in memory, on a clock the test moves. */
function fakeGh() {
  const gh = { now: '2026-10-25', login: 'loop-bot', issues: [], calls: [], notified: [], next: 1 };
  gh.run = (cmd, args) => {
    gh.calls.push([cmd, ...args]);
    if (cmd === 'node') {
      gh.notified.push(args[args.indexOf('--title') + 1]);
      return { ok: true, stdout: '', stderr: '' };
    }
    const [noun, verb] = args;
    if (noun === 'label') return { ok: true, stdout: '', stderr: '' };
    if (noun === 'issue' && verb === 'list') {
      const label = args[args.indexOf('--label') + 1];
      const open = gh.issues.filter((i) => i.state === 'OPEN' && i.labels.includes(label));
      return { ok: true, stdout: JSON.stringify(open.map(({ number, title, createdAt, author, comments }) => ({ number, title, createdAt, author, comments }))), stderr: '' };
    }
    if (noun === 'issue' && verb === 'create') {
      const labels = args.flatMap((a, i) => (args[i - 1] === '--label' ? [a] : []));
      gh.issues.push({ number: gh.next++, title: args[args.indexOf('--title') + 1], body: args[args.indexOf('--body') + 1], labels, state: 'OPEN', createdAt: `${gh.now}T06:00:00Z`, author: { login: gh.login }, comments: [] });
      return { ok: true, stdout: '', stderr: '' };
    }
    const issue = gh.issues.find((i) => i.number === Number(args[2]));
    if (noun === 'issue' && verb === 'comment') {
      issue.comments.push({ body: args[args.indexOf('--body') + 1], createdAt: `${gh.now}T06:00:00Z`, author: { login: gh.login } });
      return { ok: true, stdout: '', stderr: '' };
    }
    if (noun === 'issue' && verb === 'close') {
      issue.state = 'CLOSED';
      return { ok: true, stdout: '', stderr: '' };
    }
    return { ok: false, stdout: '', stderr: `unexpected gh ${args.join(' ')}` };
  };
  return gh;
}

function repo({ notify = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locks-repo-'));
  fs.mkdirSync(path.join(root, 'plan'));
  fs.mkdirSync(path.join(root, 'skills'));
  fs.writeFileSync(path.join(root, 'plan', 'README.md'), README);
  fs.writeFileSync(path.join(root, 'plan', '07-search.md'), SPEC7);
  fs.writeFileSync(path.join(root, 'plan', '08-next.md'), SPEC8);
  fs.writeFileSync(path.join(root, 'plan', 'AUDIT.md'), AUDIT);
  fs.writeFileSync(path.join(root, 'skills', 'march.lanes.md'), LANES);
  if (notify) {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'scripts', 'notify.mjs'), '');
  }
  return root;
}

describe('sweep', () => {
  it('without --write it prints what is due and touches neither the files nor gh', () => {
    const root = repo();
    const gh = fakeGh();
    const out = [];
    assert.equal(main(['sweep', '--today', '2026-10-28'], { root, run: gh.run, log: (l) => out.push(l) }), 0);
    assert.deepEqual(out, [
      'bad broken · plan/AUDIT.md:10 · lacks since: YYYY-MM-DD',
      'ask held-07.2 · plan/README.md:12 · 27d old, past max_age 14d',
      'release held-07.3 · plan/README.md:13 · 8d old, past max_age 7d',
      'fallback gap-table · skills/march.lanes.md:12 · 27d old, past max_age 14d · fallback: run the sweep once and log it',
      '3 of 6 locks past their time',
    ]);
    assert.equal(fs.readFileSync(path.join(root, 'plan', 'README.md'), 'utf8'), README);
    assert.deepEqual(gh.calls, []);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('files exactly one ask per lock, re-pings it weekly, and closes it once the lock goes', () => {
    const root = repo({ notify: true });
    const gh = fakeGh();
    const tick = (date) => {
      gh.now = date;
      const out = [];
      main(['sweep', '--write', '--today', date], { root, run: gh.run, log: (l) => out.push(l) });
      return out;
    };
    // Thirty daily ticks from the day held-07.2 timed out.
    for (let d = 0; d < 30; d++) tick(addDays('2026-10-16', d));
    // Two locks timed out with no fallback (07.2 by age, the palette row by its until date): one ask each.
    assert.deepEqual(gh.issues.map((i) => i.title), [`${ASK_TITLE}held-07.2`, `${ASK_TITLE}palette`], 'one ask per lock, however many ticks');
    const [ask, palette] = gh.issues;
    assert.equal(palette.createdAt.slice(0, 10), '2026-10-31');
    assert.deepEqual(palette.comments.map((c) => c.createdAt.slice(0, 10)), ['2026-11-07', '2026-11-14']);
    assert.deepEqual(ask.labels.sort(), ['loop:lock', 'loop:opened', 'triage:needs-user']);
    assert.match(ask.body, /blocked: the token lacks scope/);
    assert.deepEqual(ask.comments.map((c) => c.createdAt.slice(0, 10)), ['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13']);
    assert.ok(ask.comments.every((c) => c.body.startsWith(PING)));
    assert.equal(gh.notified.length, 8, 'notify.mjs on each open and each re-ping');
    // The release fallback took 07.3's lines on its first due tick; plan-check stays green.
    const readme = fs.readFileSync(path.join(root, 'plan', 'README.md'), 'utf8');
    assert.doesNotMatch(readme, /07\.3/);
    assert.deepEqual(checkPlan({ ...loadPlanDir(path.join(root, 'plan')), manifest: undefined }), []);
    // The owner answers by removing the lock: the next tick closes the ask.
    fs.writeFileSync(path.join(root, 'plan', 'README.md'), readme.replace(/^- \*\*07\.2\*\*.*\n/m, ''));
    const out = tick('2026-11-15');
    assert.ok(out.includes(`closed held-07.2 #${ask.number}`));
    assert.equal(ask.state, 'CLOSED');
    assert.equal(palette.state, 'OPEN', 'the other lock still asks');
    assert.equal(tick('2026-11-16').some((l) => /opened|closed/.test(l)), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('files nothing when gh cannot list the asks, and no notify without scripts/notify.mjs', () => {
    const root = repo();
    const out = [];
    const calls = [];
    main(['sweep', '--write', '--today', '2026-10-28'], { root, run: (...a) => (calls.push(a), { ok: false, stdout: '', stderr: 'no auth' }), log: (l) => out.push(l) });
    assert.ok(out.some((l) => /could not read the loop:lock issues; nothing filed/.test(l)));
    assert.equal(calls.filter(([, args]) => args[1] === 'create').length, 0);
    const gh = fakeGh();
    main(['sweep', '--write', '--today', '2026-10-28'], { root, run: gh.run, log: () => {} });
    assert.equal(gh.issues.length, 1);
    assert.equal(gh.notified.length, 0);
    assert.equal(gh.issues[0].labels.includes(LOCK_LABEL), true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a ping-worded comment from anyone but the ask\'s opener does not delay the next re-ping', () => {
    const root = repo();
    const gh = fakeGh();
    const tick = (date) => {
      gh.now = date;
      main(['sweep', '--write', '--today', date], { root, run: gh.run, log: () => {} });
    };
    tick('2026-10-16');
    const [ask] = gh.issues;
    assert.equal(ask.title, `${ASK_TITLE}held-07.2`);
    ask.comments.push({ body: `${PING} keep quiet`, createdAt: '2026-10-22T06:00:00Z', author: { login: 'stranger' } });
    tick('2026-10-23');
    assert.deepEqual(ask.comments.filter((c) => c.author.login === 'loop-bot').map((c) => c.createdAt.slice(0, 10)), ['2026-10-23']);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('list shows every lock and its state; bad usage exits 64', () => {
    const root = repo();
    const out = [];
    assert.equal(main(['list', '--today', '2026-10-21'], { root, log: (l) => out.push(l) }), 0);
    assert.deepEqual(out, [
      'due held-07.2 · plan/README.md:12 · 20d old, past max_age 14d',
      'ok held-07.3 · plan/README.md:13 · 1d of 7d, until PR #12 merges',
      'veto held-08 · plan/README.md:15 · auto-promoted: the veto sweep owns it (#123)',
      'ok palette · plan/AUDIT.md:7 · 11d of 30d, until 2026-10-30',
      'bad broken · plan/AUDIT.md:10 · lacks since: YYYY-MM-DD',
      'due gap-table · skills/march.lanes.md:12 · 20d old, past max_age 14d',
      '6 locks, 2 past their time',
    ]);
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal(main(['list', '--write'], { root }), 64);
      assert.equal(main(['sweep', '--today', 'soon'], { root }), 64);
      assert.equal(main(['nope'], { root }), 64);
    } finally {
      console.error = err;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
});
