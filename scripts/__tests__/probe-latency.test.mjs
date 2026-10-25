// scripts/cloud/probe-latency.mjs (spec 55.6): dispatch latency, march's schedule lag, the hook probe line and the
// decision rule. node:test, gh stubbed: nothing is dispatched and no network is touched.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cronField, cronLines, decide, dispatchLatency, hookLine, main, parseCron, percentile, scheduleLag, slotAtOrBefore,
} from '../cloud/probe-latency.mjs';

const MARCH = "on:\n  schedule:\n    # 4 ticks/day\n    - cron: '0 2,8,14,20 * * *'\n  workflow_dispatch:\n";

/** A gh stub: answers by the joined argument string, records every call. */
function ghStub(table) {
  const calls = [];
  return {
    calls,
    run(cmd, args) {
      calls.push([cmd, ...args]);
      const key = args.join(' ');
      for (const [needle, answer] of table) if (key.includes(needle)) return { ok: true, stdout: answer, stderr: '' };
      return { ok: false, stdout: '', stderr: 'not stubbed' };
    },
  };
}

const tsv = (rows) => rows.map((r) => r.join('\t')).join('\n') + '\n';

describe('numbers', () => {
  it('nearest-rank percentiles', () => {
    assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
    assert.equal(percentile([], 50), null);
  });
});

describe('cron', () => {
  it('reads lists, ranges and steps', () => {
    assert.deepEqual([...cronField('2,8,14,20', 0, 23)], [2, 8, 14, 20]);
    assert.deepEqual([...cronField('*/6', 0, 23)], [0, 6, 12, 18]);
    assert.deepEqual([...cronField('1-5/2', 0, 23)], [1, 3, 5]);
    assert.throws(() => cronField('x', 0, 59));
    assert.throws(() => parseCron('0 2 * *'));
  });

  it('finds the slot a late run belongs to', () => {
    const m = parseCron('0 2,8,14,20 * * *');
    assert.equal(slotAtOrBefore(m, new Date('2026-10-20T11:54:00Z')).toISOString(), '2026-10-20T08:00:00.000Z');
    assert.equal(slotAtOrBefore(m, new Date('2026-10-20T01:10:00Z')).toISOString(), '2026-10-19T20:00:00.000Z');
    const off = parseCron('17 */3 * * *');
    assert.equal(slotAtOrBefore(off, new Date('2026-10-20T03:16:59Z')).toISOString(), '2026-10-20T00:17:00.000Z');
  });

  it('day-of-month and day-of-week OR when both are set', () => {
    const m = parseCron('0 0 1 * 1');
    assert.equal(m(new Date('2026-10-01T00:00:00Z')), true); // a Thursday, the 1st
    assert.equal(m(new Date('2026-10-05T00:00:00Z')), true); // a Monday
    assert.equal(m(new Date('2026-10-06T00:00:00Z')), false);
  });

  it('reads the cron lines of a workflow file', () => {
    assert.deepEqual(cronLines(MARCH), ['0 2,8,14,20 * * *']);
  });
});

describe('measures', () => {
  it('dispatch latency is run_started_at minus created_at', () => {
    const d = dispatchLatency([
      { created_at: '2026-10-25T00:00:00Z', run_started_at: '2026-10-25T00:00:20Z' },
      { created_at: '2026-10-25T00:30:00Z', run_started_at: '2026-10-25T00:31:00Z' },
      { created_at: '2026-10-25T01:00:00Z', run_started_at: null },
    ]);
    assert.deepEqual(d, { runs: 2, p50: 20, p90: 60 });
  });

  it('schedule lag counts from the cron slot', () => {
    const lag = scheduleLag([
      { created_at: '2026-10-20T11:54:00Z', run_started_at: '2026-10-20T11:55:00Z' },
      { created_at: '2026-10-20T14:30:00Z', run_started_at: '2026-10-20T14:30:30Z' },
    ], '0 2,8,14,20 * * *');
    assert.equal(lag.runs, 2);
    assert.equal(lag.createdP50, 30 * 60);
    assert.equal(lag.createdP90, (3 * 60 + 54) * 60);
    assert.equal(lag.startedP90, (3 * 60 + 55) * 60);
  });

  it('the decision rule splits at ten minutes', () => {
    assert.equal(decide(null).verdict, 'unmeasured');
    assert.equal(decide(600).verdict, 'ahead');
    assert.equal(decide(601).verdict, 'hold');
    assert.match(decide(601).text, /NEXUS_CHAIN_MAX at 0/);
  });

  it('pulls the hook probe answer out of a run log', () => {
    const log = 'march\tHook probe report\t2026-10-25T00:00:00Z HOOK_PROBE_RESULT=hooks loaded (2026-10-25T00:00:00Z guard.mjs pre-bash)\n';
    assert.equal(hookLine(log), 'hook probe: hooks loaded (2026-10-25T00:00:00Z guard.mjs pre-bash)');
    assert.equal(hookLine('nothing here'), null);
  });

  it('skips the step script gh echoes in the Run header and returns the output line', () => {
    const t = 'march\tHook probe report\t2026-10-25T00:00:00Z ';
    const log = [
      `${t}##[group]Run log="$RUNNER_TEMP/hook-probe.log"`,
      `${t}if [ -f "$log" ]; then`,
      `${t}  line="hook probe: hooks loaded ($(head -n 1 "$log"))"`,
      `${t}else`,
      `${t}  line="no hook call reached guard.mjs (project hooks did not load)"`,
      `${t}fi`,
      `${t}echo "HOOK_PROBE_RESULT=$line"`,
      `${t}echo "hook probe: $line" >> "$GITHUB_STEP_SUMMARY"`,
      `${t}##[endgroup]`,
      `${t}HOOK_PROBE_RESULT=no hook call reached guard.mjs (project hooks did not load)`,
      '',
    ].join('\n');
    assert.equal(hookLine(log), 'hook probe: no hook call reached guard.mjs (project hooks did not load)');
  });
});

describe('main', () => {
  it('dispatch runs gh workflow run COUNT times with the gap between', async () => {
    const gh = ghStub([['workflow run probe.yml', '']]);
    const slept = [];
    const lines = [];
    const code = await main(['dispatch', '--count', '3', '--gap-min', '30'], {
      run: gh.run, sleep: async (ms) => slept.push(ms), out: (s) => lines.push(s),
    });
    assert.equal(code, 0);
    assert.equal(gh.calls.length, 3);
    assert.deepEqual(gh.calls[0], ['gh', 'workflow', 'run', 'probe.yml']);
    assert.deepEqual(slept, [1800000, 1800000]);
  });

  it('a dry run dispatches nothing', async () => {
    const gh = ghStub([]);
    const code = await main(['dispatch', '--count', '2', '--gap-min', '0', '--dry-run'], { run: gh.run, sleep: async () => {}, out: () => {} });
    assert.equal(code, 0);
    assert.equal(gh.calls.length, 0);
  });

  it('a failed dispatch exits 1', async () => {
    const gh = ghStub([]);
    assert.equal(await main(['dispatch', '--count', '1'], { run: gh.run, sleep: async () => {}, out: () => {} }), 1);
  });

  it('report prints both measures, the hook line and the decision', async () => {
    const gh = ghStub([
      ['workflows/probe.yml/runs', tsv([
        [1, 'workflow_dispatch', '2026-10-25T00:00:00Z', '2026-10-25T00:00:10Z', 'completed'],
        [2, 'workflow_dispatch', '2026-10-25T00:30:00Z', '2026-10-25T00:30:40Z', 'completed'],
      ])],
      ['workflows/march.yml/runs', tsv([
        [9, 'schedule', '2026-10-24T11:54:00Z', '2026-10-24T11:55:00Z', 'completed'],
        [8, 'schedule', '2026-10-01T03:00:00Z', '2026-10-01T03:00:30Z', 'completed'],
      ])],
      ['run view 77 --log', 'x\tHOOK_PROBE_RESULT=no hook call reached guard.mjs (project hooks did not load)\n'],
    ]);
    const lines = [];
    const code = await main(['report', '--hook-run', '77'], {
      run: gh.run, out: (s) => lines.push(s), readFile: () => MARCH, now: new Date('2026-10-25T12:00:00Z'),
    });
    assert.equal(code, 0);
    const text = lines.join('\n');
    assert.match(text, /dispatch start latency \(probe\.yml, 2 runs\): p50 10s, p90 40s -- A3 wants 10 runs/);
    assert.match(text, /march schedule lag \('0 2,8,14,20 \* \* \*', 14 days, 1 runs\): created p50 3\.9h/);
    assert.match(text, /hook probe: no hook call reached guard\.mjs/);
    assert.match(text, /decision: dispatch p50 10s is at or under 10 min/);
    const marchCall = gh.calls.find((c) => c.join(' ').includes('march.yml/runs'));
    assert.match(marchCall.join(' '), /event=schedule&per_page=100&created=>=2026-10-11/);
  });

  it('report --json carries the numbers', async () => {
    const gh = ghStub([
      ['workflows/probe.yml/runs', tsv([[1, 'workflow_dispatch', '2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z', 'completed']])],
      ['workflows/march.yml/runs', ''],
    ]);
    const lines = [];
    await main(['report', '--json'], { run: gh.run, out: (s) => lines.push(s), readFile: () => MARCH, now: new Date('2026-10-25T12:00:00Z') });
    const r = JSON.parse(lines.join('\n'));
    assert.equal(r.dispatch.p50, 1200);
    assert.equal(r.decision.verdict, 'hold');
    assert.equal(r.schedule.runs, 0);
  });

  it('report exits 2 when gh cannot list runs', async () => {
    const lines = [];
    const code = await main(['report'], { run: ghStub([]).run, out: (s) => lines.push(s), readFile: () => MARCH });
    assert.equal(code, 2);
    assert.match(lines.join('\n'), /gh api/);
  });
});
