// support.mjs (spec 54): the Support level (NEXUS_SUPPORT over bearings, triage-only when neither), the routing table
// (a collaborator's bug to skills/bug.md under fix-small and fix-all, a small enhancement too under fix-all, an
// outsider's issue triaged only unless loop:do), the asap_cap count of issue-born Asap chunks, and march Step 1's
// continue-or-return on half the tick budget.
// node:test, no deps, no git, no network: gh and the Asap check are injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseSpec } from '../plan-check.mjs';
import { asapCap, bearingsLevel, capacity, issueBorn, keepGoing, main, route, supportLevel, trust } from '../plan/support.mjs';

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

  it('exits 64 on bad usage', async () => {
    const root = repo('');
    for (const argv of [[], ['nope'], ['route'], ['route', 'x', '--kind', 'bug'], ['route', '5'], ['continue', '--routed', 'maybe'], ['continue', '--routed', 'fix', '--budget', '0']]) {
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
