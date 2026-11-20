// cloud/nudge-check.mjs (the event tick): a collaborator's issue labeled bug, or any issue the owner labels loop:do,
// dispatches one march run with reason=issue-<n>; an outsider's issue, the loop's own mirror and a loop-filed issue
// dispatch none. It skips while a march or night run is queued or pending (a dispatch would cancel it) and once
// NEXUS_EVENT_MAX event ticks started in 24h. node:test, gh stubbed with `gh run list` JSON.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  budgetCheck, decide, eventMaxOf, eventTicks, issueCheck, issueFacts, main, queueCheck, repeatCheck, supportCheck,
  supportOf, triggerCheck, urgentOf,
} from '../cloud/nudge-check.mjs';

const NOW = new Date('2026-10-25T12:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();

/** An issues event payload: a collaborator's bug by default. */
function payload({ action = 'opened', number = 85, association = 'COLLABORATOR', author = 'pat', sender = 'User', labels = ['bug'], added, body = 'The GUI hangs.', pull = false } = {}) {
  return {
    action,
    issue: {
      number,
      author_association: association,
      user: { login: author },
      labels: labels.map((name) => ({ name })),
      body,
      ...(pull ? { pull_request: { url: 'x' } } : {}),
    },
    ...(added !== undefined ? { label: { name: added } } : {}),
    sender: { type: sender, login: author },
  };
}

/** A stubbed gh: `runs` maps a workflow file to its run list (null makes gh fail); every call is recorded. */
function gh(runs = {}, { dispatchOk = true } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'run' && args[1] === 'list') {
      const wf = args[args.indexOf('--workflow') + 1];
      const list = wf in runs ? runs[wf] : [];
      return list === null ? { ok: false, stdout: '', stderr: 'HTTP 502' } : { ok: true, stdout: JSON.stringify(list), stderr: '' };
    }
    if (args[0] === 'workflow' && args[1] === 'run') return dispatchOk ? { ok: true, stdout: '', stderr: '' } : { ok: false, stdout: '', stderr: 'HTTP 403: Resource not accessible' };
    return { ok: false, stdout: '', stderr: 'unexpected' };
  };
  return { run, calls };
}

/** Run the command on a payload with the nexus knobs; returns { code, calls, dispatched } (gh's calls, and the dispatches among them). */
async function nudge(p, { runs, argv = [], night = true, dispatchOk } = {}) {
  const g = gh(runs, { dispatchOk });
  const env = {};
  const log = console.log;
  console.log = () => {};
  let code;
  try {
    code = await main(['--event-file', 'event.json', '--support', 'fix-all', '--trust', 'collaborators', '--urgent', 'loop:do bug', '--loop-actor', 'owner', '--max', '6', ...argv], {
      env,
      run: g.run,
      now: NOW,
      exists: (f) => night && /night\.yml$/.test(f),
      readFile: (f) => {
        if (f !== 'event.json') throw new Error(`unexpected read ${f}`);
        return JSON.stringify(p);
      },
    });
  } finally {
    console.log = log;
  }
  return { code, calls: g.calls, dispatched: g.calls.filter((c) => c.startsWith('workflow run')) };
}

describe('the knobs', () => {
  it('NEXUS_SUPPORT: the four levels; unset or unknown is null (no event ticks)', () => {
    for (const v of ['off', 'triage-only', 'fix-small', 'fix-all', 'FIX-ALL']) assert.equal(supportOf(v), v.toLowerCase());
    for (const v of ['', undefined, 'yes', 'all']) assert.equal(supportOf(v), null, String(v));
    assert.equal(supportCheck({ support: null }).ok, false);
    assert.equal(supportCheck({ support: 'off' }).ok, false);
    assert.equal(supportCheck({ support: 'triage-only' }).ok, true);
  });

  it('NEXUS_URGENT_LABELS: space-separated; unset is loop:do bug; none is no label nudges', () => {
    assert.deepEqual([...urgentOf('')], ['loop:do', 'bug']);
    assert.deepEqual([...urgentOf(undefined)], ['loop:do', 'bug']);
    assert.deepEqual([...urgentOf('urgent  p0')], ['urgent', 'p0']);
    assert.equal(urgentOf('none').size, 0);
  });

  it('NEXUS_EVENT_MAX: a whole number from 0; anything else is 6', () => {
    assert.equal(eventMaxOf('3'), 3);
    assert.equal(eventMaxOf('0'), 0);
    for (const v of ['', undefined, 'many', '-1', '2.5']) assert.equal(eventMaxOf(v), 6, String(v));
  });
});

describe('who starts a tick', () => {
  const check = (p, { loopActor = 'owner', trust = 'collaborators', urgent = 'loop:do bug' } = {}) => {
    const facts = issueFacts(p);
    const i = issueCheck({ facts, loopActor });
    return i.ok ? triggerCheck({ facts, trust, urgent: urgentOf(urgent) }) : i;
  };

  it('a collaborator, member or owner opening an issue labeled bug or loop:do', () => {
    for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) assert.equal(check(payload({ association })).ok, true, association);
    assert.equal(check(payload({ labels: ['loop:do'] })).ok, true);
    assert.equal(check(payload({ action: 'reopened' })).ok, true, 'reopened counts as opened');
  });

  it('not an outsider, unless trust is everyone or the owner labels it loop:do', () => {
    for (const association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', '']) {
      assert.equal(check(payload({ association })).ok, false, association);
    }
    assert.equal(check(payload({ association: 'NONE' }), { trust: 'everyone' }).ok, true);
    assert.equal(check(payload({ action: 'labeled', association: 'NONE', labels: ['loop:do'], added: 'loop:do' })).ok, true, 'loop:do lifts it');
  });

  it('not an issue without an urgent label, nor any label nudge when the set is none', () => {
    assert.equal(check(payload({ labels: [] })).ok, false);
    assert.equal(check(payload({ labels: ['enhancement'] })).ok, false);
    assert.equal(check(payload({ labels: ['bug'] }), { urgent: 'none' }).ok, false);
    assert.equal(check(payload({ labels: ['p0'] }), { urgent: 'p0' }).ok, true);
  });

  it('labeled passes only for loop:do', () => {
    assert.equal(check(payload({ action: 'labeled', labels: ['bug'], added: 'bug' })).ok, false, 'labeled bug: the opened event already nudged');
    assert.equal(check(payload({ action: 'labeled', labels: ['triage:loop-queued'], added: 'triage:loop-queued' })).ok, false);
    assert.equal(check(payload({ action: 'edited' })).ok, false);
  });

  it('not the loop\'s own mirror (loop:opened)', () => {
    const r = check(payload({ association: 'OWNER', labels: ['bug', 'loop:opened'] }));
    assert.equal(r.ok, false);
    assert.match(r.why, /loop:opened/);
    assert.equal(check(payload({ action: 'labeled', labels: ['loop:opened', 'loop:do'], added: 'loop:do' })).ok, false);
  });

  it('not a loop-filed issue: the loop actor\'s login AND a Cloud-Run: line', () => {
    const body = 'Tick blocked on the gate.\n\nCloud-Run: https://github.com/o/r/actions/runs/1';
    const r = check(payload({ association: 'OWNER', author: 'owner', body }));
    assert.equal(r.ok, false);
    assert.match(r.why, /loop-filed/);
    assert.equal(check(payload({ association: 'OWNER', author: 'Owner', body })).ok, false, 'logins compare case-blind');
    assert.equal(check(payload({ action: 'labeled', association: 'OWNER', author: 'owner', body, labels: ['loop:do'], added: 'loop:do' })).ok, false, 'a loop:do on it starts nothing either');
    assert.equal(check(payload({ association: 'OWNER', author: 'owner' })).ok, true, 'the owner\'s own issue, no marker');
    assert.equal(check(payload({ author: 'pat', body })).ok, true, 'a collaborator quoting a run line is not the loop');
    assert.equal(check(payload({ association: 'OWNER', author: 'nexus-bot', body }), { loopActor: 'nexus-bot' }).ok, false, 'NEXUS_LOOP_ACTOR names the PAT login');
  });

  it('not a bot sender, a pull request or a payload without a whole issue number', () => {
    assert.equal(check(payload({ sender: 'Bot' })).ok, false);
    assert.equal(check(payload({ pull: true })).ok, false);
    assert.equal(issueCheck({ facts: issueFacts({}), loopActor: 'owner' }).ok, false);
    assert.equal(issueCheck({ facts: issueFacts(payload({ number: 'x' })), loopActor: 'owner' }).ok, false);
  });
});

describe('the queue and the budget (A9)', () => {
  it('skips when a march or night run is queued, pending, waiting or requested; a run in progress is fine', () => {
    for (const status of ['queued', 'pending', 'waiting', 'requested']) {
      assert.equal(queueCheck({ runs: { 'march.yml': [{ databaseId: 1, status }], 'night.yml': [] } }).ok, false, `march ${status}`);
      assert.equal(queueCheck({ runs: { 'march.yml': [], 'night.yml': [{ databaseId: 2, status }] } }).ok, false, `night ${status}`);
    }
    assert.equal(queueCheck({ runs: { 'march.yml': [{ databaseId: 1, status: 'in_progress' }, { databaseId: 3, status: 'completed' }], 'night.yml': [] } }).ok, true);
    assert.equal(queueCheck({ runs: { 'march.yml': null } }).ok, false, 'gh failing fails closed');
  });

  it('skips once NEXUS_EVENT_MAX event ticks started in the last 24h; older and non-event runs do not count', () => {
    const tick = (h, n = 1) => ({ displayTitle: `march march issue-${n}`, createdAt: ago(h) });
    const five = [1, 2, 3, 4, 5].map((h) => tick(h, h));
    assert.equal(budgetCheck({ runs: five, max: 6, now: NOW }).ok, true);
    assert.equal(budgetCheck({ runs: [...five, tick(23, 9)], max: 6, now: NOW }).ok, false);
    const noise = [tick(25, 7), tick(30, 8), { displayTitle: 'march march', createdAt: ago(1) }, { displayTitle: 'march next chain', createdAt: ago(1) }, { displayTitle: 'march march issue-x', createdAt: ago(1) }];
    assert.equal(eventTicks([...five, ...noise], NOW).length, 5);
    assert.equal(budgetCheck({ runs: [...five, ...noise], max: 6, now: NOW }).ok, true);
    assert.equal(budgetCheck({ runs: [], max: 0, now: NOW }).ok, false, 'max 0 means no event ticks');
  });

  it('skips a second tick for the same issue within the hour', () => {
    const runs = [{ databaseId: 4, displayTitle: 'march march issue-85', createdAt: ago(0.5) }];
    assert.equal(repeatCheck({ runs, number: 85, now: NOW }).ok, false);
    assert.equal(repeatCheck({ runs, number: 8, now: NOW }).ok, true, 'issue-8 is not issue-85');
    assert.equal(repeatCheck({ runs: [{ ...runs[0], createdAt: ago(2) }], number: 85, now: NOW }).ok, true);
  });

  it('decide walks the checks in order and calls gh only once the payload passes', async () => {
    let listed = 0;
    const runs = () => {
      listed++;
      return { 'march.yml': [], 'night.yml': [] };
    };
    const base = { support: 'fix-all', trust: 'collaborators', urgent: '', loopActor: 'owner', max: '6', workflow: 'march.yml', now: NOW, runs };
    const no = await decide({ ...base, payload: payload({ association: 'NONE' }) });
    assert.equal(no.dispatch, false);
    assert.equal(no.check, 'trigger');
    assert.equal(listed, 0, 'an outsider costs no gh call');
    const unset = await decide({ ...base, support: '', payload: payload() });
    assert.equal(unset.check, 'support');
    const yes = await decide({ ...base, payload: payload() });
    assert.equal(yes.dispatch, true);
    assert.equal(yes.number, 85);
    assert.deepEqual(yes.checked.map((c) => c.check), ['support', 'issue', 'trigger', 'queue', 'repeat', 'budget']);
  });
});

describe('the command', () => {
  it('a collaborator\'s bug dispatches march once with verb=march and reason=issue-<n> (A8)', async () => {
    const r = await nudge(payload({ number: 85 }), { runs: { 'march.yml': [{ databaseId: 1, status: 'in_progress', displayTitle: 'march march', createdAt: ago(0.2) }], 'night.yml': [] } });
    assert.equal(r.code, 0);
    assert.deepEqual(r.dispatched, ['workflow run march.yml -f verb=march -f reason=issue-85']);
  });

  it('an outsider\'s issue, a loop:opened mirror and a loop-filed issue dispatch nothing, and list no runs (A8)', async () => {
    const body = 'blocked\n\nCloud-Run: https://github.com/o/r/actions/runs/9';
    for (const p of [payload({ association: 'NONE' }), payload({ labels: ['bug', 'loop:opened'] }), payload({ association: 'OWNER', author: 'owner', body })]) {
      const r = await nudge(p, { runs: { 'march.yml': [], 'night.yml': [] } });
      assert.deepEqual(r.calls, [], JSON.stringify(p.issue.labels));
    }
  });

  it('never cancels a pending night run: a pending night.yml run means no dispatch (A9)', async () => {
    const r = await nudge(payload(), { runs: { 'march.yml': [], 'night.yml': [{ databaseId: 7, status: 'pending' }] } });
    assert.deepEqual(r.dispatched, []);
    assert.ok(r.calls.includes('run list --workflow night.yml --json databaseId,status,displayTitle,createdAt --limit 100'));
  });

  it('a queued march run means no dispatch (A9)', async () => {
    const r = await nudge(payload(), { runs: { 'march.yml': [{ databaseId: 8, status: 'queued' }], 'night.yml': [] } });
    assert.deepEqual(r.dispatched, []);
  });

  it('six event ticks in 24h means no dispatch (A9)', async () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({ databaseId: n, status: 'completed', displayTitle: `march march issue-${n}`, createdAt: ago(n * 3) }));
    const r = await nudge(payload(), { runs: { 'march.yml': six, 'night.yml': [] } });
    assert.deepEqual(r.dispatched, []);
    const five = await nudge(payload(), { runs: { 'march.yml': six.slice(0, 5), 'night.yml': [] } });
    assert.equal(five.dispatched.length, 1);
  });

  it('fails closed when gh cannot list runs; skips night when the repo has no night.yml', async () => {
    const r = await nudge(payload(), { runs: { 'march.yml': null } });
    assert.deepEqual(r.dispatched, []);
    const noNight = await nudge(payload(), { runs: { 'march.yml': [], 'night.yml': null }, night: false });
    assert.equal(noNight.dispatched.length, 1, 'no night.yml file: night is not listed');
    assert.ok(!noNight.calls.some((c) => c.includes('night.yml')));
  });

  it('--dry-run prints the dispatch and runs none; a refused dispatch never fails the job', async () => {
    const dry = await nudge(payload(), { runs: { 'march.yml': [], 'night.yml': [] }, argv: ['--dry-run'] });
    assert.deepEqual(dry.dispatched, []);
    const refused = await nudge(payload(), { runs: { 'march.yml': [], 'night.yml': [] }, dispatchOk: false });
    assert.equal(refused.code, 0);
    assert.equal(refused.dispatched.length, 1);
  });

  it('an unreadable payload dispatches nothing', async () => {
    const g = gh({});
    const log = console.log;
    console.log = () => {};
    try {
      await main(['--support', 'fix-all'], { env: {}, run: g.run, now: NOW, exists: () => false, readFile: () => '{not json' });
    } finally {
      console.log = log;
    }
    assert.deepEqual(g.calls, []);
  });
});
