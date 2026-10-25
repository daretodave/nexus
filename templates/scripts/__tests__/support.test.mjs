// support.mjs (spec 54): the Support level (NEXUS_SUPPORT over bearings, triage-only when neither), the routing table
// (a collaborator's bug to skills/bug.md under fix-small and fix-all, a small enhancement too under fix-all, an
// outsider's issue triaged only unless loop:do), the asap_cap count of issue-born Asap chunks, and march Step 1's
// continue-or-return on half the tick budget; user rows aged into the queue (A4) and the SLA step (A5); a landed
// fix told and closed, a published package's fix held open for its release (A6).
// node:test, no deps, no git, no network: gh and the Asap check are injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseSpec } from '../plan-check.mjs';
import { agedScore, asapCap, bearingsLevel, capacity, closingRefs, gitCommit, heldPackages, issueBorn, keepGoing, main, placed, refsIssue, route, slaDue, slaHours, supportLevel, tellPlan, trust, userBonus, userRows } from '../plan/support.mjs';

const readme = (asap) => ['## Lanes', '', '**Asap** (built before the table):', '', ...asap, '', '**Held** (waits):', '', '- (none)', '', '## Specs', ''].join('\n');
const spec = (num, chunks) => parseSpec(`${num}-x.md`, ['## Acceptance', '- **A1** x', '## Chunks', 'Measure: 1 open · 0 closed · next A2', ...chunks].join('\n'));

describe('the level', () => {
  it('reads Support from bearings, bullet or plain, with a trailing comment', () => {
    assert.equal(bearingsLevel('Support: fix-all        # nexus: fix-all'), 'fix-all');
    assert.equal(bearingsLevel('- Support: fix-small'), 'fix-small');
    assert.equal(bearingsLevel('- **Support:** off'), 'off');
    assert.equal(bearingsLevel('Support: loud'), null);
    assert.equal(bearingsLevel(''), null);
  });

  it('is triage-only when neither the variable nor bearings sets it (the adopter default)', () => {
    assert.deepEqual(supportLevel('', {}), { level: 'triage-only', source: 'default', note: null });
  });

  it('lets a set NEXUS_SUPPORT win over bearings and notes the disagreement', () => {
    const l = supportLevel('Support: triage-only', { NEXUS_SUPPORT: 'fix-all' });
    assert.equal(l.level, 'fix-all');
    assert.equal(l.source, 'env');
    assert.match(l.note, /overrides Support: triage-only/);
    assert.equal(supportLevel('Support: fix-all', { NEXUS_SUPPORT: 'fix-all' }).note, null);
  });

  it('ignores an empty or unknown NEXUS_SUPPORT and keeps bearings', () => {
    assert.equal(supportLevel('Support: fix-small', { NEXUS_SUPPORT: '' }).level, 'fix-small');
    const l = supportLevel('Support: fix-small', { NEXUS_SUPPORT: 'max' });
    assert.equal(l.level, 'fix-small');
    assert.match(l.note, /not a level/);
  });

  it('trusts collaborators unless NEXUS_SUPPORT_TRUST is everyone', () => {
    assert.equal(trust({}), 'collaborators');
    assert.equal(trust({ NEXUS_SUPPORT_TRUST: 'everyone' }), 'everyone');
    assert.equal(trust({ NEXUS_SUPPORT_TRUST: 'nobody' }), 'collaborators');
  });

  it('reads asap_cap, 3 when absent', () => {
    assert.equal(asapCap('asap_cap: 5   # nexus: 3'), 5);
    assert.equal(asapCap('- asap_cap: 0'), 0);
    assert.equal(asapCap(''), 3);
  });
});

describe('routing (A2)', () => {
  const r = (level, association, kind, labels = [], who = 'collaborators') => route({ level, trust: who, association, kind, labels }).route;

  it('routes as today under triage-only and off, whoever filed it', () => {
    for (const level of ['off', 'triage-only']) {
      assert.equal(r(level, 'OWNER', 'bug'), 'stock');
      assert.equal(r(level, 'OWNER', 'enhancement'), 'stock');
    }
  });

  it('sends a collaborator bug to bug.md under fix-small and fix-all', () => {
    for (const level of ['fix-small', 'fix-all']) for (const a of ['OWNER', 'MEMBER', 'COLLABORATOR']) assert.equal(r(level, a, 'bug'), 'bug');
  });

  it('sends a collaborator enhancement to bug.md only under fix-all', () => {
    assert.equal(r('fix-small', 'OWNER', 'enhancement'), 'stock');
    assert.equal(r('fix-all', 'OWNER', 'enhancement'), 'bug');
    assert.match(route({ level: 'fix-all', association: 'OWNER', kind: 'enhancement' }).why, /scope or taste call is triage:needs-user/);
  });

  it('triages an outsider only, unless loop:do or trust everyone lifts it', () => {
    assert.equal(r('fix-all', 'NONE', 'bug'), 'stock');
    assert.equal(r('fix-all', 'CONTRIBUTOR', 'bug'), 'stock');
    assert.equal(r('fix-all', 'NONE', 'bug', ['loop:do']), 'bug');
    assert.equal(r('fix-all', 'NONE', 'bug', [], 'everyone'), 'bug');
  });

  it('reads the support label as a bug, and leaves docs, lessons and questions to stock routing', () => {
    assert.equal(r('fix-small', 'OWNER', 'docs', ['support']), 'bug');
    for (const kind of ['docs', 'lesson', 'question']) assert.equal(r('fix-all', 'OWNER', kind), 'stock');
  });
});

describe('the Asap cap', () => {
  const specs = [
    spec('54', [
      '- [ ] **54.9** Fix the cockpit badge (#91) · S · closes A1 · needs —',
      '- [ ] **54.10** Wrap the toast · M · closes A1 · needs —',
      '- [ ] **54.11** Contract first · S · closes A1 · needs —',
      '- [ ] **54.12** Theme flash · S · closes A1 · needs —',
    ]),
  ];

  it('counts an Asap chunk issue-born when its lane line or its title names the issue', () => {
    const plan = { readme: readme(['- 54.9', '- 54.10 (#92)', '- 54.11 (contract first)']), specs };
    assert.deepEqual(issueBorn(plan), [{ id: '54.9', issue: 91 }, { id: '54.10', issue: 92 }]);
  });

  it('skips a chunk a pending close already closes, and lines outside the Asap lane', () => {
    const plan = { readme: `${readme(['- 54.9', '- 54.10 (#92)'])}\n- 54.12 (#93)`, specs, closed: new Set(['54.9']) };
    assert.deepEqual(issueBorn(plan), [{ id: '54.10', issue: 92 }]);
  });

  it('is full at asap_cap open, with room under it (overflow goes to AUDIT)', () => {
    const plan = { readme: readme(['- 54.9', '- 54.10 (#92)', '- 54.12 (#93)']), specs };
    assert.equal(capacity(plan, '').room, false);
    assert.deepEqual(capacity(plan, 'asap_cap: 4'), { open: 3, cap: 4, room: true, ids: issueBorn(plan) });
  });
});

describe('march Step 1 keeps going (A3)', () => {
  const t0 = Date.parse('2026-10-25T12:00:00Z');
  const at = (min) => t0 + min * 60000;

  it('continues to 3a after a fix-now or an Asap chunk under half the budget', () => {
    assert.equal(keepGoing({ routed: 'fix', startedMs: t0, nowMs: at(4) }).next, 'continue');
    assert.equal(keepGoing({ routed: 'asap', startedMs: t0, nowMs: at(29) }).next, 'continue');
  });

  it('returns at half the budget, with nothing routed, or with no start', () => {
    assert.equal(keepGoing({ routed: 'asap', startedMs: t0, nowMs: at(30) }).next, 'return');
    assert.equal(keepGoing({ routed: 'none', startedMs: t0, nowMs: at(1) }).next, 'return');
    assert.equal(keepGoing({ routed: 'fix', startedMs: NaN, nowMs: at(1) }).next, 'return');
    assert.equal(keepGoing({ routed: 'fix', startedMs: t0, nowMs: at(12), budgetMin: 20 }).next, 'return');
  });
});

describe('user rows age into the queue (A4)', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const ago = (h) => new Date(now - h * 3600000).toISOString();

  it('adds +1 per full 12 hours, cap +4, never under the flat +0.5', () => {
    assert.equal(userBonus(0), 0.5);
    assert.equal(userBonus(11), 0.5);
    assert.equal(userBonus(12), 1);
    assert.equal(userBonus(24), 2);
    assert.equal(userBonus(47), 3);
    assert.equal(userBonus(500), 4);
    assert.equal(userBonus(NaN), 0.5);
  });

  it('re-scores a #86-shaped row (impact 6, ease 4, 24h old) to 4.4, above every docs row under 4.4 and the 3.0 floor', () => {
    const audit = [
      '# Kit audit',
      '',
      '## Pending',
      '',
      '### [A, 4.3] a docs row',
      '- category: doc-drift',
      '- impact: 6, ease: 7',
      '',
      '### [user-issue #86] [MED] badge does not decrement',
      '- category: external-issue',
      '- impact: 6',
      '- ease: 4',
      '',
      '### [D, 2.8] a voice row',
      '- impact: 4, ease: 7',
      '',
      '## Done',
      '',
      '### [x] [user-issue #12] [LOW] closed, never aged',
      '- impact: 9, ease: 9',
    ].join('\n');
    const rows = userRows(audit, { opened: new Map([[86, ago(24)]]), now });
    assert.equal(rows.length, 1);
    assert.deepEqual({ issue: rows[0].issue, base: rows[0].base, bonus: rows[0].bonus, score: rows[0].score }, { issue: 86, base: 2.4, bonus: 2, score: 4.4 });
    assert.ok(rows[0].score > 4.3 && rows[0].score >= 3.0);
  });

  it('ages a /jot row from its user-spotted time, and caps the score at 10', () => {
    const critique = ['## Pending', '', '### [MED] general — a jot', '- observation: x', `- evidence: user-spotted at ${ago(36)}`, '- source: user', ''].join('\n');
    const [r] = userRows(critique, { now });
    assert.equal(r.base, null);
    assert.equal(r.bonus, 3);
    assert.equal(r.score, null);
    assert.equal(agedScore({ base: 9.5, hours: 100 }), 10);
  });

  it('leaves non-user rows alone', () => {
    assert.deepEqual(userRows('## Pending\n\n### [A, 5] drift\n- impact: 5, ease: 10\n', { now }), []);
  });
});

describe('the SLA step (A5)', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const ago = (h) => new Date(now - h * 3600000).toISOString();
  const specs = [
    spec('54', [
      '- [ ] **54.9** Fix the cockpit badge (#91) · S · closes A1 · needs —',
      '- [ ] **54.10** Theme flash (#94) · S · closes A1 · needs —',
      '- [ ] **54.11** Done already (#95) · S · closes A1 · needs —',
    ]),
  ];
  const issue = (number, hours, labels = ['triage:loop-queued']) => ({ number, createdAt: ago(hours), labels: labels.map((name) => ({ name })) });

  it('reads sla_hours, 24 when absent', () => {
    assert.equal(slaHours('sla_hours: 12   # nexus: 12'), 12);
    assert.equal(slaHours('- **sla_hours:** 6'), 6);
    assert.equal(slaHours(''), 24);
  });

  it('places an issue: in the Asap lane, done, an open chunk to lift, or nowhere', () => {
    const plan = { readme: readme(['- 54.9', '- (#96) plotted by hand']), specs, closed: new Set(['54.11']), archive: '- 53.2 fixed the toast (#97)\n' };
    assert.equal(placed(91, plan), 'asap');
    assert.equal(placed(96, plan), 'asap');
    assert.equal(placed(95, plan), 'done');
    assert.equal(placed(97, plan), 'done');
    assert.deepEqual(placed(94, plan), { lift: '54.10' });
    assert.equal(placed(98, plan), null);
    assert.equal(placed(9, plan), null);
  });

  it('plots an overdue queued issue whose work is not in the Asap lane, oldest first, and lifts a chunk that names it', () => {
    const plan = { readme: readme(['- 54.9']), specs, closed: new Set(['54.11']), archive: '' };
    const issues = [issue(98, 13), issue(94, 30), issue(91, 40), issue(95, 50), issue(99, 5), issue(100, 60, ['triage:loop-queued', 'loop:opened'])];
    const d = slaDue({ issues, plan, bearings: 'sla_hours: 12', now });
    assert.deepEqual(d.plot, [{ number: 94, hours: 30, lift: '54.10' }, { number: 98, hours: 13 }]);
    assert.deepEqual(d.wait, []);
  });

  it('waits past asap_cap: the open issue-born Asap chunks and this pass share the room', () => {
    const plan = { readme: readme(['- 54.9']), specs, closed: new Set(), archive: '' };
    const d = slaDue({ issues: [issue(98, 30), issue(99, 20)], plan, bearings: 'sla_hours: 12\nasap_cap: 2', now });
    assert.deepEqual(d.plot, [{ number: 98, hours: 30 }]);
    assert.deepEqual(d.wait, [{ number: 99, hours: 20 }]);
  });
});

describe('a fixed issue is told and closed (A6)', () => {
  const fix = (message, landed = true) => ({ sha: 'abc1234def', subject: message.split('\n')[0], message, landed });

  it('reads Refs #N and the closing keywords GitHub acts on', () => {
    assert.equal(refsIssue('fix: badge\n\nRefs #88', 88), true);
    assert.equal(refsIssue('Refs: #88', 88), true);
    assert.equal(refsIssue('Refs #881', 88), false);
    assert.equal(refsIssue('fix: badge #88', 88), false);
    assert.deepEqual(closingRefs('Closes #81\nfixes #9\nResolved: #7\nFix owner/repo#5\nRefs #3\nprefixes #2'), [81, 9, 7, 5]);
  });

  it('comments naming the commit and closes a landed fix', () => {
    const p = tellPlan({ number: 88, commit: fix('fix: the badge shows again\n\nRefs #88') });
    assert.equal(p.action, 'close');
    assert.equal(p.comment, 'Fixed in abc1234 (fix: the badge shows again), now on the default branch.');
  });

  it('holds a published package fix open for its release, reopening one a keyword closed', () => {
    const held = [{ dir: 'packages/cli', name: '@usenexus/cli' }];
    const p = tellPlan({ number: 86, commit: fix('fix: gui crash\n\nRefs #86'), held });
    assert.equal(p.action, 'hold');
    assert.match(p.comment, /^Fixed in abc1234 \(fix: gui crash\): lands in the next @usenexus\/cli release\./);
    assert.equal(p.reopen, false);
    const shut = tellPlan({ number: 81, commit: fix('fix: gui crash\n\nCloses #81'), held, state: 'CLOSED' });
    assert.equal(shut.action, 'hold');
    assert.equal(shut.reopen, true);
    assert.match(shut.why, /closes #81 by keyword: a fix carries Refs #81, never Closes or Fixes/);
  });

  it('refuses a commit that does not name the issue, and waits for one not yet landed', () => {
    assert.equal(tellPlan({ number: 88, commit: fix('fix: other\n\nRefs #87') }).action, 'refuse');
    const w = tellPlan({ number: 88, commit: fix('fix: badge\n\nRefs #88', false) });
    assert.equal(w.action, 'wait');
    assert.equal(w.comment, undefined);
  });

  it('holds only for a published package (named, not private)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'support-pkg-'));
    const pkg = (dir, json) => (fs.mkdirSync(path.join(root, 'packages', dir), { recursive: true }), fs.writeFileSync(path.join(root, 'packages', dir, 'package.json'), JSON.stringify(json)));
    pkg('cli', { name: '@usenexus/cli' });
    pkg('lab', { name: 'lab', private: true });
    fs.mkdirSync(path.join(root, 'packages', 'bare'), { recursive: true });
    const files = ['packages/cli/src/a.js', 'packages/cli/b.js', 'packages/lab/x.js', 'packages/bare/y.js', 'skills/bug.md'];
    assert.deepEqual(heldPackages(files, root), [{ dir: 'packages/cli', name: '@usenexus/cli' }]);
    assert.deepEqual(heldPackages(['skills/bug.md'], root), []);
  });

  it('reads a commit from git (stubbed): subject, body, files and whether the branch holds it', () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'log') return { status: 0, stdout: 'abc1234def\nfix: badge\nRefs #88\n' };
      if (args[0] === 'show') return { status: 0, stdout: 'packages/cli/a.js\nREADME.md\n' };
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { status: 0, stdout: 'origin/main\n' };
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'x\n' };
      if (args[0] === 'merge-base') return { status: 0, stdout: '' };
      return { status: 1, stdout: '' };
    };
    const c = gitCommit('HEAD', { run });
    assert.deepEqual(c, { sha: 'abc1234def', subject: 'fix: badge', message: 'fix: badge\n\nRefs #88\n', files: ['packages/cli/a.js', 'README.md'], landed: true });
    assert.ok(calls.includes('merge-base --is-ancestor abc1234def origin/main'));
    assert.equal(gitCommit('nope', { run: () => ({ status: 128, stdout: '' }) }), null);
  });
});

describe('the command', () => {
  const repo = (bearings, readmeText = readme(['- (none)']), specFiles = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'support-'));
    fs.mkdirSync(path.join(root, 'plan'));
    fs.writeFileSync(path.join(root, 'plan', 'bearings.md'), bearings);
    fs.writeFileSync(path.join(root, 'plan', 'README.md'), readmeText);
    for (const [n, t] of Object.entries(specFiles)) fs.writeFileSync(path.join(root, 'plan', n), t);
    return root;
  };
  const run = async (argv, opts) => {
    const out = [];
    const code = await main(argv, { log: (l) => out.push(l), ...opts });
    return { code, out };
  };

  it('prints the level and the note', async () => {
    const root = repo('- Support: fix-all\n');
    assert.deepEqual((await run(['level'], { root, env: {} })).out, ['fix-all · from bearings · trust collaborators']);
    const { out } = await run(['level'], { root, env: { NEXUS_SUPPORT: 'fix-small' } });
    assert.equal(out[0], 'fix-small · from env · trust collaborators');
    assert.match(out[1], /^note: NEXUS_SUPPORT \(fix-small\) overrides/);
  });

  it('routes through gh (stubbed), never reading issue text, and falls back to stock without gh', async () => {
    const root = repo('Support: fix-all\n');
    const seen = [];
    const gh = (n) => (seen.push(n), { association: 'OWNER', labels: ['bug'] });
    assert.deepEqual((await run(['route', '88', '--kind', 'bug'], { root, env: {}, gh })).out, ["bug #88 · support fix-all: a collaborator's bug goes to skills/bug.md (fix now or Asap)"]);
    assert.deepEqual(seen, ['88']);
    assert.match((await run(['route', '88', '--kind', 'bug'], { root, env: {}, gh: () => null })).out[0], /^stock #88 · gh unavailable/);
    const { out } = await run(['route', '9', '--kind', 'bug', '--association', 'NONE', '--labels', 'bug', '--json'], { root, env: {}, gh: () => assert.fail('gh called') });
    assert.equal(JSON.parse(out[0]).route, 'stock');
  });

  it('counts the cap from the plan on disk', async () => {
    const root = repo('asap_cap: 1\n', readme(['- 54.9']), { '54-x.md': ['## Acceptance', '- **A1** x', '## Chunks', 'Measure: 1 open · 0 closed · next A2', '- [ ] **54.9** Badge (#91) · S · closes A1 · needs —'].join('\n') });
    assert.deepEqual((await run(['cap'], { root, env: {} })).out, ['asap 1/1 · full · 54.9 (#91)']);
  });

  it('answers the Asap check and the continue step', async () => {
    const root = repo('');
    assert.deepEqual((await run(['asap'], { root, asap: async () => true })).out, ['ready']);
    const { out } = await run(['continue', '--routed', 'fix', '--started', '2026-10-25T12:00:00Z', '--now', '2026-10-25T12:03:30Z'], { root });
    assert.match(out[0], /^continue · 4 of 60 min used/);
  });

  it('stamps the tick start at Step 0 so continue needs no --started across fresh shells', async () => {
    const root = repo('');
    const started = await run(['start'], { root });
    assert.match(started.out[0], /^started · \d{4}-/);
    const { out } = await run(['continue', '--routed', 'asap'], { root });
    assert.match(out[0], /^continue · 0 of 60 min used/);
    const bare = repo('');
    assert.match((await run(['continue', '--routed', 'fix'], { root: bare })).out[0], /^return · no tick start/);
  });

  it('runs the SLA step only under fix-small or fix-all, reading queued issues from gh (stubbed) or a file', async () => {
    const issues = [{ number: 98, createdAt: '2026-10-24T00:00:00Z', labels: [{ name: 'triage:loop-queued' }] }];
    const off = repo('Support: triage-only\n');
    assert.deepEqual((await run(['sla'], { root: off, env: {}, list: () => assert.fail('gh called') })).out, ['off · support triage-only: no SLA step']);
    const root = repo('Support: fix-all\nsla_hours: 12\n');
    const seen = [];
    const list = (label) => (seen.push(label), issues);
    const { out } = await run(['sla', '--now', '2026-10-25T12:00:00Z'], { root, env: {}, list });
    assert.deepEqual(seen, ['triage:loop-queued']);
    assert.deepEqual(out, ['plot #98 · open 36h, SLA 12h: /plot asap, the title ending (#98)', 'due 1']);
    assert.deepEqual((await run(['sla'], { root, env: {}, list: () => null })).out, ['skip · gh unavailable: no SLA step this tick']);
    fs.writeFileSync(path.join(root, 'issues.json'), JSON.stringify([...issues, { number: 99, createdAt: '2026-10-20T00:00:00Z', labels: [] }]));
    const file = await run(['sla', '--issues', 'issues.json', '--now', '2026-10-25T12:00:00Z', '--json'], { root, env: {} });
    assert.deepEqual(JSON.parse(file.out[0]).plot, [{ number: 98, hours: 36 }]);
  });

  it('ages the user rows on disk, and scores one row from --base and --opened', async () => {
    const root = repo('');
    fs.writeFileSync(path.join(root, 'plan', 'AUDIT.md'), '## Pending\n\n### [user-issue #86] [MED] badge\n- impact: 6, ease: 4\n\n## Done\n');
    const list = () => [{ number: 86, createdAt: '2026-10-24T12:00:00Z', labels: [] }];
    const { out } = await run(['age', '--now', '2026-10-25T12:00:00Z'], { root, list });
    assert.deepEqual(out, ['4.4 · 2.4 +2 (24h) · AUDIT.md · [user-issue #86] [MED] badge', 'aged 1']);
    assert.deepEqual((await run(['age', '--base', '2.4', '--opened', '2026-10-24T12:00:00Z', '--now', '2026-10-25T12:00:00Z'], { root })).out, ['4.4 · 2.4 +2 (24h)']);
  });

  it('tells a landed fix through gh (stubbed): comment then close, or hold a package fix open', async () => {
    const root = repo('');
    const done = [];
    const act = (args) => (done.push(args), true);
    const commit = (sha) => ({ sha: 'abc1234def', subject: 'fix: badge', message: 'fix: badge\n\nRefs #88', files: ['skills/bug.md'], landed: true });
    const { out } = await run(['tell', '88', '--commit', 'abc1234'], { root, commit, state: () => 'OPEN', act });
    assert.deepEqual(out, ['close #88 · landed']);
    assert.deepEqual(done, [['comment', '88', '--body', 'Fixed in abc1234 (fix: badge), now on the default branch.'], ['close', '88']]);

    fs.mkdirSync(path.join(root, 'packages', 'cli'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'cli', 'package.json'), '{"name":"@usenexus/cli"}');
    done.length = 0;
    const cli = () => ({ sha: 'abc1234def', subject: 'fix: gui', message: 'fix: gui\n\nRefs #86', files: ['packages/cli/src/x.js'], landed: true });
    assert.match((await run(['tell', '86', '--commit', 'abc1234'], { root, commit: cli, state: () => 'OPEN', act })).out[0], /^hold #86 · touches packages\/cli/);
    assert.deepEqual(done.map((a) => a[0]), ['comment']);
    assert.match(done[0][3], /lands in the next @usenexus\/cli release/);
  });

  it('writes nothing on refuse, wait, dry-run or without gh', async () => {
    const root = repo('');
    const act = () => assert.fail('gh write');
    const c = (message, landed = true) => () => ({ sha: 'abc1234def', subject: 'fix: badge', message, files: [], landed });
    assert.match((await run(['tell', '88', '--commit', 'x'], { root, commit: c('fix: badge'), state: () => 'OPEN', act })).out[0], /^refuse #88/);
    assert.match((await run(['tell', '88', '--commit', 'x'], { root, commit: c('fix: badge\n\nRefs #88', false), state: () => 'OPEN', act })).out[0], /^wait #88/);
    assert.match((await run(['tell', '88', '--commit', 'x'], { root, commit: () => null, act })).out[0], /^refuse #88 · no commit x/);
    assert.match((await run(['tell', '88', '--commit', 'x'], { root, commit: c('Refs #88'), state: () => null, act })).out[0], /^skip #88 · gh unavailable/);
    const dry = await run(['tell', '88', '--commit', 'x', '--dry-run'], { root, commit: c('fix: badge\n\nRefs #88'), state: () => assert.fail('gh read'), act });
    assert.deepEqual(dry.out, ['close #88 · landed', 'would: gh issue comment 88 --body "Fixed in abc1234 (fix: badge), now on the default branch."', 'would: gh issue close 88']);
  });

  it('only comments on an issue a keyword already closed, and notes the keyword', async () => {
    const root = repo('');
    const done = [];
    const commit = () => ({ sha: 'abc1234def', subject: 'fix: badge', message: 'fix: badge\n\nFixes #88', files: [], landed: true });
    const { out } = await run(['tell', '88', '--commit', 'x'], { root, commit, state: () => 'CLOSED', act: (a) => (done.push(a[0]), true) });
    assert.match(out[0], /^close #88 · landed; abc1234 closes #88 by keyword/);
    assert.deepEqual(done, ['comment']);
  });

  it('exits 64 on bad usage', async () => {
    const root = repo('');
    for (const argv of [[], ['nope'], ['route'], ['route', 'x', '--kind', 'bug'], ['route', '5'], ['continue', '--routed', 'maybe'], ['continue', '--routed', 'fix', '--budget', '0'], ['sla', '--now', 'later'], ['age', '--base', 'x', '--opened', '2026-10-24'], ['tell', '88'], ['tell', 'x', '--commit', 'HEAD'], ['tell', '88', '--commit', '--dry-run']]) {
      const err = console.error;
      console.error = () => {};
      try {
        assert.equal((await run(argv, { root, env: {} })).code, 64, argv.join(' '));
      } finally {
        console.error = err;
      }
    }
  });
});
