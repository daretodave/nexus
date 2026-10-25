// cloud/quota.mjs (the quota governor): reads the seven_day reading out of a tick's output, caches it, and gates the
// next run. The fixtures are the shapes two real ticks carried: a weekly lockout (status rejected, utilization only in
// unifiedWindows) and a warning at 0.88. node:test, gh stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  decide, isoOf, lastQuota, main, parseMessages, pausedUntil, pauseTitle, quotaLine, runKind, softCap,
} from '../cloud/quota.mjs';

// A locked-out tick: the event, then the API error that carries the same info without utilization.
const REJECTED = [
  { type: 'system', subtype: 'init', session_id: 's' },
  {
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'rejected', resetsAt: 1792396800, rateLimitType: 'seven_day', overageStatus: 'rejected',
      overageDisabledReason: 'out_of_credits', isUsingOverage: false,
      unifiedWindows: { five_hour: { utilization: 0, resetsAt: 1792105200 }, seven_day: { utilization: 1, resetsAt: 1792396800 } },
    },
    uuid: 'u', session_id: 's',
  },
  {
    type: 'assistant', error: 'rate_limit', api_error_status: 429, api_error: 'usage_limit_reached',
    api_error_params: { rate_limit_info: { status: 'rejected', resetsAt: 1792396800, rateLimitType: 'seven_day', isUsingOverage: false } },
  },
  { type: 'result', subtype: 'error_during_execution', is_error: true },
];
const REJECTED_AT = '2026-10-19T08:00:00Z';

// A healthy tick near the cap.
const WARNING = [
  {
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed_warning', resetsAt: 1793001600, rateLimitType: 'seven_day', utilization: 0.88, surpassedThreshold: 0.75,
      unifiedWindows: { five_hour: { utilization: 0.01, resetsAt: 1792923600, status: 'allowed' }, seven_day: { utilization: 0.88, resetsAt: 1793001600, status: 'allowed_warning' } },
    },
  },
  { type: 'result', subtype: 'success', is_error: false, result: 'shipped' },
];
const WARNING_AT = '2026-10-26T08:00:00Z';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'quota-'));

/** A gh stub: answers by the first two args, records every call. */
function ghStub(answers = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = args.slice(0, 2).join(' ');
    const a = typeof answers[key] === 'function' ? answers[key](args) : answers[key];
    return a ?? { ok: true, stdout: '[]', stderr: '' };
  };
  return { run, calls };
}

function outputs(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
}

describe('reading a tick', () => {
  it('takes the lockout: rejected, utilization 1, the reset as ISO', () => {
    assert.deepEqual(lastQuota(REJECTED), { utilization: 1, status: 'rejected', resetsAt: REJECTED_AT });
  });

  it('takes the warning: utilization and its window status', () => {
    assert.deepEqual(lastQuota(WARNING), { utilization: 0.88, status: 'allowed_warning', resetsAt: WARNING_AT });
  });

  it('takes the last reading when a run carries several', () => {
    assert.equal(lastQuota([...WARNING, ...REJECTED]).status, 'rejected');
    assert.equal(lastQuota([...REJECTED, ...WARNING]).utilization, 0.88);
  });

  it('ignores a five_hour-only event and says unknown when nothing is there', () => {
    assert.equal(lastQuota([{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.4 } }]), null);
    assert.equal(lastQuota([{ type: 'result' }]), null);
    assert.match(quotaLine(null), /unknown/);
  });

  it('parses a JSON array, JSON lines and pretty objects in a row', () => {
    const lines = WARNING.map((m) => JSON.stringify(m)).join('\n');
    const pretty = WARNING.map((m) => JSON.stringify(m, null, 2)).join('\n');
    for (const text of [JSON.stringify(WARNING), lines, pretty]) assert.equal(lastQuota(parseMessages(text)).utilization, 0.88);
    assert.deepEqual(parseMessages(''), []);
    assert.deepEqual(parseMessages('not json at all'), []);
  });

  it('prints the summary line the spec names', () => {
    assert.equal(quotaLine(lastQuota(WARNING)), `seven_day utilization: 0.88 (allowed_warning, resets ${WARNING_AT})`);
  });

  it('reads seconds, milliseconds and ISO alike', () => {
    assert.equal(isoOf(1792396800), REJECTED_AT);
    assert.equal(isoOf(1792396800000), REJECTED_AT);
    assert.equal(isoOf(REJECTED_AT), REJECTED_AT);
    assert.equal(isoOf('soon'), null);
  });
});

describe('read', () => {
  it('writes the cache, the outputs and the summary', async () => {
    const d = tmp();
    const exec = path.join(d, 'exec.json');
    fs.writeFileSync(exec, JSON.stringify(WARNING));
    const env = { GITHUB_OUTPUT: path.join(d, 'out'), GITHUB_STEP_SUMMARY: path.join(d, 'sum'), GITHUB_RUN_ID: '40172824384' };
    const cache = path.join(d, '.nexus', 'quota.json');
    assert.equal(await main(['read', exec, '--cache', cache], { env }), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(cache, 'utf8')), { utilization: 0.88, status: 'allowed_warning', resetsAt: WARNING_AT, run: 40172824384 });
    assert.deepEqual(outputs(env.GITHUB_OUTPUT), { quota: '0.88', status: 'allowed_warning', resets: WARNING_AT });
    assert.match(fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /^seven_day utilization: 0\.88 \(allowed_warning/);
  });

  it('a missing file writes no cache and empty outputs, and still exits 0', async () => {
    const d = tmp();
    const env = { GITHUB_OUTPUT: path.join(d, 'out'), RUNNER_TEMP: d };
    const cache = path.join(d, 'quota.json');
    assert.equal(await main(['read', '--cache', cache], { env }), 0);
    assert.equal(fs.existsSync(cache), false);
    assert.deepEqual(outputs(env.GITHUB_OUTPUT), { quota: '', status: '', resets: '' });
  });
});

describe('the gate decides', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const rejected = { utilization: 1, status: 'rejected', resetsAt: REJECTED_AT };
  const pause = { number: 80, title: pauseTitle(REJECTED_AT) };

  it('skips every kind of run while the pause issue is open and its reset is ahead', () => {
    for (const kind of ['scheduled', 'chained', 'manual']) {
      const d = decide({ cache: rejected, pause, kind, max: 0.9, now });
      assert.equal(d.skip, true, kind);
      assert.equal(d.close, null);
    }
  });

  it('after the reset, closes the pause issue and runs', () => {
    const d = decide({ cache: rejected, pause, kind: 'scheduled', max: 0.9, now: new Date('2026-10-19T08:00:01Z') });
    assert.equal(d.skip, false);
    assert.equal(d.close, pause);
  });

  it('skips on a cached lockout even when no issue is open (gh unreachable, or the issue step failed)', () => {
    assert.equal(decide({ cache: rejected, pause: null, kind: 'scheduled', max: null, now }).skip, true);
  });

  it('the soft cap stops scheduled and chained runs at or above the max, never manual ones', () => {
    const cache = { utilization: 0.9, status: 'allowed_warning', resetsAt: WARNING_AT };
    assert.equal(decide({ cache, pause: null, kind: 'scheduled', max: 0.9, now }).skip, true);
    assert.equal(decide({ cache, pause: null, kind: 'chained', max: 0.9, now }).skip, true);
    assert.equal(decide({ cache, pause: null, kind: 'manual', max: 0.9, now }).skip, false);
    assert.equal(decide({ cache: { ...cache, utilization: 0.89 }, pause: null, kind: 'scheduled', max: 0.9, now }).skip, false);
    assert.equal(decide({ cache, pause: null, kind: 'scheduled', max: null, now }).skip, false, 'off disables the cap');
  });

  it('a lockout whose reset has passed no longer counts against the cap', () => {
    assert.equal(decide({ cache: rejected, pause: null, kind: 'scheduled', max: 0.9, now: new Date('2026-10-20T00:00:00Z') }).skip, false);
  });

  it('fails open on no cache', () => {
    assert.equal(decide({ cache: null, pause: null, kind: 'scheduled', max: 0.9, now }).skip, false);
  });

  it('names the run kinds and reads the cap', () => {
    assert.equal(runKind('schedule', ''), 'scheduled');
    assert.equal(runKind('workflow_dispatch', 'chain'), 'chained');
    assert.equal(runKind('workflow_dispatch', 'nudge'), 'manual');
    assert.equal(runKind('workflow_dispatch', ''), 'manual');
    assert.equal(softCap('off'), null);
    assert.equal(softCap('0.80'), 0.8);
    assert.equal(softCap(''), 0.9);
    assert.equal(softCap('lots'), 0.9);
    assert.equal(pausedUntil(pauseTitle(REJECTED_AT)), REJECTED_AT);
    assert.equal(pausedUntil('Cloud march tick crashed'), null);
  });
});

describe('gate over gh', () => {
  const withCache = (obj) => {
    const d = tmp();
    const cache = path.join(d, 'quota.json');
    if (obj !== undefined) fs.writeFileSync(cache, typeof obj === 'string' ? obj : JSON.stringify(obj));
    return { d, cache, env: { GITHUB_OUTPUT: path.join(d, 'out'), GITHUB_STEP_SUMMARY: path.join(d, 'sum') } };
  };

  it('a scheduled tick during the lockout skips, with the pause issue found by label', async () => {
    const { cache, env } = withCache({ utilization: 1, status: 'rejected', resetsAt: REJECTED_AT });
    const gh = ghStub({ 'issue list': { ok: true, stdout: JSON.stringify([{ number: 80, title: pauseTitle(REJECTED_AT) }]) } });
    await main(['gate', '--cache', cache, '--event', 'schedule', '--reason', '', '--max', '0.9'], { env, run: gh.run, now: new Date('2026-10-17T00:00:00Z') });
    assert.equal(outputs(env.GITHUB_OUTPUT).skip, 'true');
    assert.ok(!gh.calls.some((c) => c[2] === 'close'));
    assert.match(fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /Quota gate \(scheduled run\): skip/);
  });

  it('the first tick after the reset closes the issue and runs', async () => {
    const { cache, env } = withCache({ utilization: 1, status: 'rejected', resetsAt: REJECTED_AT });
    const gh = ghStub({ 'issue list': { ok: true, stdout: JSON.stringify([{ number: 80, title: pauseTitle(REJECTED_AT) }]) } });
    await main(['gate', '--cache', cache, '--event', 'schedule'], { env, run: gh.run, now: new Date('2026-10-19T09:00:00Z') });
    assert.equal(outputs(env.GITHUB_OUTPUT).skip, 'false');
    assert.ok(gh.calls.some((c) => c[1] === 'issue' && c[2] === 'close' && c[3] === '80'));
  });

  // Issue text is untrusted: a title match without the label counts only when the workflow token opened it.
  const byQuery = (labelled, titled) => ({
    'issue list': (args) => ({ ok: true, stdout: JSON.stringify(args.includes('--label') ? labelled : titled), stderr: '' }),
  });

  it("an outsider's unlabelled pause-titled issue never skips the gate, nor gets closed", async () => {
    const forged = { number: 99, title: pauseTitle('2099-01-01T00:00:00Z'), author: { login: 'mallory', is_bot: false } };
    for (const event of ['workflow_dispatch', 'schedule']) {
      const { cache, env } = withCache();
      const gh = ghStub(byQuery([], [forged]));
      await main(['gate', '--cache', cache, '--event', event, '--max', '0.9'], { env, run: gh.run, now: new Date('2026-10-25T00:00:00Z') });
      assert.equal(outputs(env.GITHUB_OUTPUT).skip, 'false', event);
      assert.ok(!gh.calls.some((c) => c[2] === 'close'));
      const titleQuery = gh.calls.find((c) => c.includes('--search'));
      assert.ok(titleQuery.includes('--author') && titleQuery.includes('app/github-actions'));
    }
    const past = { ...forged, title: pauseTitle('2026-10-01T00:00:00Z') };
    const { cache, env } = withCache();
    const gh = ghStub(byQuery([], [past]));
    await main(['gate', '--cache', cache, '--event', 'schedule'], { env, run: gh.run, now: new Date('2026-10-25T00:00:00Z') });
    assert.ok(!gh.calls.some((c) => c[2] === 'close'), 'an outsider issue is never closed by the gate');
  });

  it("the workflow token's own unlabelled pause issue still skips the gate", async () => {
    const own = { number: 81, title: pauseTitle('2099-01-01T00:00:00Z'), author: { login: 'app/github-actions', is_bot: true } };
    const { cache, env } = withCache();
    const gh = ghStub(byQuery([], [own]));
    await main(['gate', '--cache', cache, '--event', 'workflow_dispatch'], { env, run: gh.run, now: new Date('2026-10-25T00:00:00Z') });
    assert.equal(outputs(env.GITHUB_OUTPUT).skip, 'true');
  });

  it('fails open on an unparseable cache and gh failing', async () => {
    const { cache, env } = withCache('{ not json');
    const gh = ghStub({ 'issue list': { ok: false, stdout: '', stderr: 'gh: auth' } });
    await main(['gate', '--cache', cache, '--event', 'schedule', '--max', '0.5'], { env, run: gh.run, now: new Date() });
    assert.equal(outputs(env.GITHUB_OUTPUT).skip, 'false');
  });

  it('a manual run ignores the soft cap, a scheduled one honours it', async () => {
    const reading = { utilization: 0.93, status: 'allowed_warning', resetsAt: WARNING_AT };
    const a = withCache(reading);
    await main(['gate', '--cache', a.cache, '--event', 'workflow_dispatch', '--max', '0.9'], { env: a.env, run: ghStub().run, now: new Date('2026-10-25T00:00:00Z') });
    assert.equal(outputs(a.env.GITHUB_OUTPUT).skip, 'false');
    const b = withCache(reading);
    await main(['gate', '--cache', b.cache, '--event', 'schedule', '--max', '0.9'], { env: b.env, run: ghStub().run, now: new Date('2026-10-25T00:00:00Z') });
    assert.equal(outputs(b.env.GITHUB_OUTPUT).skip, 'true');
  });
});

describe('pause', () => {
  it('opens ONE labelled issue named for the reset', async () => {
    const d = tmp();
    const cache = path.join(d, 'quota.json');
    fs.writeFileSync(cache, JSON.stringify({ utilization: 1, status: 'rejected', resetsAt: REJECTED_AT }));
    const gh = ghStub();
    await main(['pause', '--cache', cache, '--run-url', 'https://x/runs/1'], { env: {}, run: gh.run });
    const create = gh.calls.filter((c) => c[1] === 'issue' && c[2] === 'create');
    assert.equal(create.length, 1);
    assert.ok(create[0].includes(`Loop paused: weekly quota until ${REJECTED_AT}`));
    assert.ok(create[0].includes('loop:paused-quota'));
  });

  it('falls back to an unlabelled issue when the label cannot be set', async () => {
    let n = 0;
    const gh = ghStub({ 'issue create': () => (n++ === 0 ? { ok: false, stdout: '', stderr: 'label not found' } : { ok: true, stdout: 'https://x/issues/9' }) });
    await main(['pause', '--resets', REJECTED_AT], { env: {}, run: gh.run });
    const create = gh.calls.filter((c) => c[2] === 'create' && c[1] === 'issue');
    assert.equal(create.length, 2);
    assert.ok(!create[1].includes('--label'));
  });

  it('updates the open one instead of opening a second', async () => {
    const later = '2026-10-26T08:00:00Z';
    const gh = ghStub({ 'issue list': { ok: true, stdout: JSON.stringify([{ number: 80, title: pauseTitle(REJECTED_AT) }]) } });
    await main(['pause', '--resets', later], { env: {}, run: gh.run });
    assert.ok(!gh.calls.some((c) => c[2] === 'create' && c[1] === 'issue'));
    assert.ok(gh.calls.some((c) => c[2] === 'edit' && c.includes(pauseTitle(later))));
  });

  it('opens nothing without a reset to name', async () => {
    const gh = ghStub();
    await main(['pause', '--cache', path.join(tmp(), 'none.json')], { env: {}, run: gh.run });
    assert.equal(gh.calls.length, 0);
  });
});
