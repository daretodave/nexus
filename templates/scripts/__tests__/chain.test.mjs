// cloud/chain.mjs (self-chaining): a tick that landed a commit while work is ready dispatches exactly one chained
// tick (reason=chain), and none when chain max, the ceiling, the quota (an unparseable one included), a queued or
// pending march or night run, or night's 30-minute window forbids it. One test per guard, then the command end to
// end. node:test, gh and git stubbed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  budgetGuard, budgetOf, ceilingOf, chainMaxOf, chainOf, cronFires, cronsIn, decide, depthGuard, issueWork, main,
  nightGuard, parseCron, queueGuard, quotaGuard, readBudget, readyGuard, shippedGuard,
} from '../cloud/chain.mjs';

const NIGHT = "on:\n  schedule:\n    - cron: '30 10 * * *'   # daily\n  workflow_dispatch:\n";
const at = (iso) => new Date(iso);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chain-'));

describe('the knobs', () => {
  it('chain max: a whole number from 0; unset or anything else is 0, so nothing chains by accident', () => {
    assert.equal(chainMaxOf('3'), 3);
    assert.equal(chainMaxOf('0'), 0);
    for (const v of ['', undefined, 'off', '-1', '2.5', 'three']) assert.equal(chainMaxOf(v), 0, String(v));
  });

  it('the chain input: empty is 0, a whole number is itself, anything else is unreadable', () => {
    assert.equal(chainOf(''), 0);
    assert.equal(chainOf(undefined), 0);
    assert.equal(chainOf('2'), 2);
    assert.equal(chainOf('x'), null);
    assert.equal(chainOf('-1'), null);
  });

  it('the ceiling: a positive whole number, none, or unreadable', () => {
    assert.equal(ceilingOf('20'), 20);
    assert.equal(ceilingOf('none'), 'none');
    assert.equal(ceilingOf(''), null);
    assert.equal(ceilingOf('lots'), null);
  });
});

describe('the guards', () => {
  it('depth: chain + 1 must be at or under NEXUS_CHAIN_MAX', () => {
    assert.equal(depthGuard({ chain: 0, max: 3 }).ok, true);
    assert.equal(depthGuard({ chain: 2, max: 3 }).ok, true);
    assert.equal(depthGuard({ chain: 3, max: 3 }).ok, false);
    assert.equal(depthGuard({ chain: 0, max: 0 }).ok, false, 'chain max 0 never chains');
    assert.equal(depthGuard({ chain: null, max: 3 }).ok, false, 'an unreadable chain input never chains');
  });

  it('shipped: a landed run chains; a lost run retries once; anything else does not', () => {
    assert.deepEqual(shippedGuard({ landed: 'true', lost: 'false', reason: '' }).next, 'chain');
    const lost = shippedGuard({ landed: 'false', lost: 'true', reason: 'chain' });
    assert.equal(lost.ok, true);
    assert.equal(lost.next, 'retry');
    assert.equal(shippedGuard({ landed: 'false', lost: 'true', reason: 'retry' }).ok, false, 'the retry is once');
    assert.equal(shippedGuard({ landed: 'false', lost: 'false', reason: '' }).ok, false);
    assert.equal(shippedGuard({ landed: '', lost: '', reason: '' }).ok, false);
  });

  it('quota: under NEXUS_QUOTA_MAX chains; at or above it, missing or unparseable does not (fails closed)', () => {
    assert.equal(quotaGuard({ quota: '0.5', max: '0.80' }).ok, true);
    assert.equal(quotaGuard({ quota: '0.80', max: '0.80' }).ok, false);
    assert.equal(quotaGuard({ quota: '0.88', max: '0.80' }).ok, false);
    assert.equal(quotaGuard({ quota: '', max: '0.80' }).ok, false, 'missing');
    assert.equal(quotaGuard({ quota: 'unknown', max: '0.80' }).ok, false, 'unparseable');
    assert.equal(quotaGuard({ quota: '0.96', max: 'off' }).ok, true, 'off falls back to the hard ceiling');
    assert.equal(quotaGuard({ quota: '0.97', max: 'off' }).ok, false);
  });

  it('budget: the weighted budget + 3 must be at or under the ceiling; unreadable fails closed', () => {
    assert.equal(budgetOf([{ chunk: true }, { chunk: false }, { chunk: true }]), 7);
    assert.equal(budgetGuard({ budget: 17, ceiling: 20 }).ok, true);
    assert.equal(budgetGuard({ budget: 18, ceiling: 20 }).ok, false);
    assert.equal(budgetGuard({ budget: 0, ceiling: null }).ok, false);
    assert.equal(budgetGuard({ budget: null, ceiling: 20 }).ok, false);
    assert.equal(budgetGuard({ budget: null, ceiling: 'none' }).ok, true, 'pull-request mode has no commit ceiling');
  });

  it("night: not within 30 minutes of night's cron slot, either side; an unparseable cron fails closed", () => {
    const crons = cronsIn(NIGHT);
    assert.deepEqual(crons, ['30 10 * * *']);
    assert.equal(nightGuard({ crons, now: at('2026-10-25T10:05:00Z') }).ok, false, '25 min before');
    assert.equal(nightGuard({ crons, now: at('2026-10-25T10:55:00Z') }).ok, false, '25 min after');
    assert.equal(nightGuard({ crons, now: at('2026-10-25T09:59:00Z') }).ok, true, '31 min before');
    assert.equal(nightGuard({ crons, now: at('2026-10-25T14:00:00Z') }).ok, true);
    assert.equal(nightGuard({ crons: null, now: at('2026-10-25T10:30:00Z') }).ok, true, 'no night workflow');
    assert.equal(nightGuard({ crons: ['30 10 * * MON'], now: at('2026-10-25T14:00:00Z') }).ok, false);
  });

  it('queue: a queued or pending march or night run forbids the chain; this run and finished runs do not', () => {
    const ok = queueGuard({ runs: { 'march.yml': [{ databaseId: 9, status: 'in_progress' }, { databaseId: 8, status: 'completed' }], 'night.yml': [] }, runId: '9' });
    assert.equal(ok.ok, true);
    for (const status of ['queued', 'pending', 'waiting', 'requested']) {
      assert.equal(queueGuard({ runs: { 'march.yml': [{ databaseId: 10, status }], 'night.yml': [] }, runId: '9' }).ok, false, `march ${status}`);
      assert.equal(queueGuard({ runs: { 'march.yml': [], 'night.yml': [{ databaseId: 11, status }] }, runId: '9' }).ok, false, `night ${status}`);
    }
    assert.equal(queueGuard({ runs: { 'march.yml': null }, runId: '9' }).ok, false, 'gh unreachable fails closed');
  });

  it('ready: a ready chunk, or an open loop:do or unlabeled issue without loop:opened', () => {
    assert.equal(readyGuard({ ready: 1, issues: 0 }).ok, true);
    assert.equal(readyGuard({ ready: 0, issues: 2 }).ok, true);
    assert.equal(readyGuard({ ready: 0, issues: 0 }).ok, false);
    assert.equal(readyGuard({ ready: null, issues: null }).ok, false, 'unknown is not ready');
    const issues = [
      { labels: [] },
      { labels: [{ name: 'loop:do' }] },
      { labels: [{ name: 'loop:opened' }, { name: 'loop:veto' }] },
      { labels: [{ name: 'loop:do' }, { name: 'loop:opened' }] },
      { labels: [{ name: 'triage:loop-queued' }] },
    ];
    assert.equal(issueWork(issues), 2);
  });
});

describe('the budget count', () => {
  it('counts the Cloud-Run trailer line only, never a message that mentions it in prose', () => {
    const dir = tmp();
    const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
    const git = (args) => {
      const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
      return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };
    git(['init', '-q', '-b', 'main']);
    fs.mkdirSync(path.join(dir, 'plan'));
    const land = (file, line, msg) => {
      fs.appendFileSync(path.join(dir, file), line + '\n');
      git(['add', '-A']);
      git(['commit', '-q', '-m', msg]);
    };
    land('plan/ARCHIVE.md', '- 2026-10-25 · 1.1 · a chunk · abc', 'feat: a cloud chunk\n\nCloud-Run: https://github.com/o/r/actions/runs/1');
    land('notes.md', 'x', 'fix: a cloud churn commit\n\nCloud-Run: https://github.com/o/r/actions/runs/2');
    land('plan/ARCHIVE.md', '- 2026-10-25 · 1.2 · a local chunk · def', "feat: a local chunk\n\nAn issue whose body carries a 'Cloud-Run: <url>' line starts no run.");
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    assert.equal(readBudget({ git, main: 'main', now: new Date(Date.now() + 60000) }), budgetOf([{ chunk: true }, { chunk: false }]));
  });
});

describe('cron', () => {
  it('parses steps, ranges and lists, and refuses what it cannot read', () => {
    const c = parseCron('17 */3 * * *');
    assert.ok(cronFires(c, at('2026-10-25T03:17:00Z')));
    assert.ok(!cronFires(c, at('2026-10-25T04:17:00Z')));
    assert.ok(cronFires(parseCron('0 2,8,14,20 * * *'), at('2026-10-25T14:00:00Z')));
    assert.ok(cronFires(parseCron('0 9 * * 1-5'), at('2026-10-26T09:00:00Z')), 'a Monday');
    assert.ok(!cronFires(parseCron('0 9 * * 1-5'), at('2026-10-25T09:00:00Z')), 'a Sunday');
    for (const bad of ['', '* * *', '61 * * * *', '0 9 * * MON', '*/0 * * * *']) assert.equal(parseCron(bad), null, bad);
  });
});

describe('decide', () => {
  const facts = (over = {}) => ({
    chain: 0, chainMax: 3, landed: 'true', lost: 'false', reason: '', quota: '0.5', quotaMax: '0.80', ceiling: 20, budget: 4,
    nightCrons: ['30 10 * * *'], now: at('2026-10-25T14:00:00Z'), runs: { 'march.yml': [], 'night.yml': [] }, runId: '9', ready: 1, issues: 0,
    ...over,
  });

  it('chains when every guard holds', async () => {
    const d = await decide(facts());
    assert.equal(d.chain, true);
    assert.equal(d.next, 'chain');
    assert.equal(d.checked.length, 7);
  });

  it('stops at the first failing guard and never reads what is behind it', async () => {
    let asked = 0;
    const d = await decide(facts({ chainMax: 0, runs: () => { asked++; return {}; }, ready: () => { asked++; return 1; } }));
    assert.equal(d.chain, false);
    assert.equal(d.guard, 'depth');
    assert.equal(asked, 0, 'NEXUS_CHAIN_MAX 0 alone decides: no gh call');
  });

  it('a lost run retries with reason=retry', async () => {
    const d = await decide(facts({ landed: 'false', lost: 'true' }));
    assert.equal(d.chain, true);
    assert.equal(d.next, 'retry');
  });

  it('a lost run retries even with nothing ready: the retry re-runs the lane or pass the lost tick had picked', async () => {
    let asked = 0;
    const d = await decide(facts({ landed: 'false', lost: 'true', ready: () => { asked++; return 0; }, issues: 0 }));
    assert.equal(d.chain, true);
    assert.equal(d.next, 'retry');
    assert.equal(asked, 0, 'the retry never reads the plan');
    assert.equal((await decide(facts({ ready: 0, issues: 0 }))).guard, 'ready', 'a shipped run still needs work ready');
  });

  it('a fact that throws fails closed', async () => {
    const d = await decide(facts({ runs: () => { throw new Error('boom'); } }));
    assert.equal(d.chain, false);
    assert.equal(d.guard, 'queue');
  });
});

describe('the command', () => {
  /** gh and git stubs: runs per workflow, the issue list, the dispatch; git log and show for the budget. */
  function stubs({ runs = {}, issues = [], dispatchOk = true, logOk = true, commits = [] } = {}) {
    const calls = [];
    const run = (cmd, args) => {
      calls.push(`${cmd} ${args.join(' ')}`);
      if (args[0] === 'run' && args[1] === 'list') return { ok: true, stdout: JSON.stringify(runs[args[3]] ?? []) };
      if (args[0] === 'issue') return { ok: true, stdout: JSON.stringify(issues) };
      if (args[0] === 'workflow') return dispatchOk ? { ok: true, stdout: '' } : { ok: false, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' };
      return { ok: false, stdout: '' };
    };
    const git = (args) => {
      calls.push(`git ${args.join(' ')}`);
      if (args[0] === 'log') return logOk ? { ok: true, stdout: commits.map((c) => c.sha).join('\n') } : { ok: false, stdout: '' };
      if (args[0] === 'show') return { ok: true, stdout: commits.find((c) => c.sha === args[2])?.chunk ? '+- 55.3 shipped\n' : ' unchanged\n' };
      return { ok: true, stdout: '' };
    };
    return { run, git, calls };
  }

  async function cli(argv, s, { ready = 1, now = '2026-10-25T14:00:00Z', night = NIGHT } = {}) {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const sum = path.join(dir, 'summary');
    const env = { GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum, GITHUB_RUN_ID: '9' };
    const code = await main(argv, {
      env, run: s.run, git: s.git, ready: async () => ready, now: at(now),
      exists: (p) => night !== null && /night\.yml$/.test(p), readFile: () => night,
    });
    const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
    const outputs = Object.fromEntries(read(out).split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    return { code, outputs, summary: read(sum) };
  }

  const BASE = ['--landed', 'true', '--lost', 'false', '--reason', '', '--chain', '', '--chain-max', '3', '--quota', '0.5', '--quota-max', '0.80', '--ceiling', '20', '--main', 'main'];
  const dispatches = (calls) => calls.filter((c) => c.startsWith('gh workflow run'));

  it('a landed tick with work ready dispatches exactly one chained tick', async () => {
    const s = stubs({ commits: [{ sha: 'a', chunk: true }, { sha: 'b', chunk: false }] });
    const r = await cli(BASE, s);
    assert.equal(r.code, 0);
    assert.deepEqual(dispatches(s.calls), ['gh workflow run march.yml --ref main -f chain=1 -f reason=chain']);
    assert.equal(r.outputs.chained, 'true');
    assert.match(r.summary, /^chain: dispatched march\.yml \(chain=1, reason=chain\)/);
    assert.ok(s.calls.includes('gh run list --workflow night.yml --json databaseId,status --limit 30'), 'the night queue is read');
  });

  it('a chained tick passes its depth on', async () => {
    const s = stubs();
    const argv = BASE.map((v, i) => (BASE[i - 1] === '--chain' ? '2' : v));
    await cli(argv, s);
    assert.deepEqual(dispatches(s.calls), ['gh workflow run march.yml --ref main -f chain=3 -f reason=chain']);
    const s2 = stubs();
    await cli(argv.map((v, i) => (argv[i - 1] === '--chain' ? '3' : v)), s2);
    assert.deepEqual(dispatches(s2.calls), [], 'chain 3 + 1 is over 3');
  });

  it('no chain, and no gh call at all, when NEXUS_CHAIN_MAX is unset', async () => {
    const s = stubs();
    const r = await cli(BASE.map((v, i) => (BASE[i - 1] === '--chain-max' ? '' : v)), s);
    assert.deepEqual(s.calls, []);
    assert.equal(r.outputs.chained, 'false');
    assert.equal(r.outputs.guard, 'depth');
    assert.match(r.summary, /^chain: no \(depth: /);
  });

  it('no chain over the ceiling, with an unparseable quota, or with a run pending', async () => {
    const over = stubs({ commits: Array.from({ length: 6 }, (_, i) => ({ sha: `c${i}`, chunk: true })) });
    assert.equal((await cli(BASE, over)).outputs.guard, 'budget');
    assert.deepEqual(dispatches(over.calls), []);
    const badQuota = stubs();
    assert.equal((await cli(BASE.map((v, i) => (BASE[i - 1] === '--quota' ? 'unknown' : v)), badQuota)).outputs.guard, 'quota');
    const pending = stubs({ runs: { 'night.yml': [{ databaseId: 12, status: 'pending' }] } });
    assert.equal((await cli(BASE, pending)).outputs.guard, 'queue');
    assert.deepEqual(dispatches(pending.calls), []);
  });

  it("no chain in night's window", async () => {
    const s = stubs();
    const r = await cli(BASE, s, { now: '2026-10-25T10:10:00Z' });
    assert.equal(r.outputs.guard, 'night');
    assert.deepEqual(dispatches(s.calls), []);
  });

  it('nothing ready: no chain; an open loop:do issue is work', async () => {
    const idle = stubs({ issues: [{ number: 3, labels: [{ name: 'loop:opened' }] }] });
    assert.equal((await cli(BASE, idle, { ready: 0 })).outputs.guard, 'ready');
    const issue = stubs({ issues: [{ number: 4, labels: [{ name: 'loop:do' }] }] });
    assert.equal((await cli(BASE, issue, { ready: 0 })).outputs.chained, 'true');
    const off = stubs({ issues: [{ number: 4, labels: [{ name: 'loop:do' }] }] });
    assert.equal((await cli([...BASE, '--issues', 'false'], off, { ready: 0 })).outputs.guard, 'ready', 'pull-request mode counts chunks only');
  });

  it('pull-request mode: ceiling none skips the budget count', async () => {
    const s = stubs({ logOk: false });
    const r = await cli(BASE.map((v, i) => (BASE[i - 1] === '--ceiling' ? 'none' : v)), s);
    assert.equal(r.outputs.chained, 'true');
    assert.ok(!s.calls.some((c) => c.startsWith('git log')));
  });

  it('a failed dispatch is a line, never a failed job; a dry run dispatches nothing', async () => {
    const s = stubs({ dispatchOk: false });
    const r = await cli(BASE, s);
    assert.equal(r.code, 0);
    assert.equal(r.outputs.guard, 'dispatch');
    assert.match(r.summary, /HTTP 403/);
    const dry = stubs();
    const d = await cli([...BASE, '--dry-run'], dry);
    assert.deepEqual(dispatches(dry.calls), []);
    assert.match(d.summary, /would dispatch march\.yml \(chain=1, reason=chain\)/);
  });

  it('a stray argument prints usage', async () => {
    assert.equal(await main(['now'], { env: {} }), 2);
  });
});

describe('the dispatched tick', () => {
  // A chained or retried run is dispatched with GITHUB_TOKEN, so its actor is github-actions[bot]; the Claude
  // action refuses a bot actor it is not told about, and the chain would crash at the model step every time.
  it("march lets the chain's own bot actor through", () => {
    const yml = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '.github', 'workflows', 'march.yml'), 'utf8');
    assert.match(yml, /uses: anthropics\/claude-code-action@v1\r?\n\s+with:[\s\S]*?\n\s+allowed_bots: github-actions\r?\n/);
  });
});
