#!/usr/bin/env node
// scripts/cloud/probe-latency.mjs: does a dispatched run start on time, and how late are march's scheduled ones?
// Spec 55 (55.6). nexus only, owner-run: it dispatches workflows, so it never runs from a cloud tick.
//
//   node scripts/cloud/probe-latency.mjs dispatch [--count 10] [--gap-min 30] [--workflow probe.yml]
//       Dispatches the no-model probe workflow COUNT times, GAP minutes apart (the first at once). Foreground and
//       long: 10 x 30 min is four and a half hours. --dry-run prints the plan and dispatches nothing.
//   node scripts/cloud/probe-latency.mjs report [--workflow probe.yml] [--march .github/workflows/march.yml]
//       [--days 14] [--hook-run <run id>] [--json]
//       Dispatch latency: p50/p90 of run_started_at - created_at over the probe's workflow_dispatch runs.
//       Schedule lag: p50/p90 of created_at and run_started_at behind the cron slot each scheduled march run belongs
//       to, over the last DAYS days (the cron read from the march file). --hook-run reads that run's log for the
//       HOOK_PROBE_RESULT= line march.yml's Hook probe report step prints. Then the spec's decision rule, applied.
//
// gh is the only dependency (GH_REPO or the current checkout's origin picks the repo). Zero npm dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Spec 55's threshold: a dispatch that starts within this many minutes (p50) is trusted to chain. */
export const DISPATCH_P50_MAX_MIN = 10;
/** A3 asks for ten dispatched runs. */
export const WANT_RUNS = 10;

// ---- numbers --------------------------------------------------------------------------------------------------

/** Nearest-rank percentile of a list of numbers; null for an empty list. */
export function percentile(values, p) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * xs.length));
  return xs[rank - 1];
}

/** Seconds from a to b (ISO strings); null when either is missing or unparseable. */
export function secondsBetween(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? (tb - ta) / 1000 : null;
}

export function fmtDuration(sec) {
  if (sec === null || sec === undefined) return 'n/a';
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 90 * 60) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

// ---- cron -----------------------------------------------------------------------------------------------------

// One cron field as the set of values it allows: *, n, a-b, a-b/s, */s and comma lists. Throws on garbage.
export function cronField(src, lo, hi) {
  const out = new Set();
  for (const part of src.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`cron: cannot read "${part}"`);
    const step = m[4] ? Number(m[4]) : 1;
    const from = m[1] === '*' ? lo : Number(m[2]);
    const to = m[1] === '*' ? hi : m[3] !== undefined ? Number(m[3]) : m[4] ? hi : from;
    if (from < lo || to > hi || from > to || step < 1) throw new Error(`cron: "${part}" is out of range ${lo}-${hi}`);
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

/** A five-field UTC cron line as a matcher over Date. Day-of-month and day-of-week OR when both are restricted. */
export function parseCron(line) {
  const f = line.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron: want five fields, got "${line}"`);
  const min = cronField(f[0], 0, 59);
  const hour = cronField(f[1], 0, 23);
  const dom = cronField(f[2], 1, 31);
  const mon = cronField(f[3], 1, 12);
  const dow = cronField(f[4].replace(/\b7\b/g, '0'), 0, 6);
  const domAny = f[2] === '*';
  const dowAny = f[4] === '*';
  return (d) => {
    if (!min.has(d.getUTCMinutes()) || !hour.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
    const a = dom.has(d.getUTCDate());
    const b = dow.has(d.getUTCDay());
    if (domAny && dowAny) return true;
    if (domAny) return b;
    if (dowAny) return a;
    return a || b;
  };
}

/** The newest slot the cron fires at or before `at` (a Date), searched back up to 8 days; null if none. */
export function slotAtOrBefore(matches, at) {
  const t = new Date(at.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i <= 8 * 24 * 60; i++) {
    if (matches(t)) return new Date(t.getTime());
    t.setUTCMinutes(t.getUTCMinutes() - 1);
  }
  return null;
}

/** The schedule cron lines a workflow file declares (`- cron: '...'`). */
export function cronLines(yaml) {
  return [...yaml.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

// ---- the measures ---------------------------------------------------------------------------------------------

/** Dispatch latency over runs [{ created_at, run_started_at }]: how long each sat before a runner took it. */
export function dispatchLatency(runs) {
  const secs = runs.map((r) => secondsBetween(r.created_at, r.run_started_at)).filter((s) => s !== null && s >= 0);
  return { runs: secs.length, p50: percentile(secs, 50), p90: percentile(secs, 90) };
}

/** Schedule lag over scheduled runs: created_at and run_started_at behind the slot each belongs to. */
export function scheduleLag(runs, cronLine) {
  const matches = parseCron(cronLine);
  const created = [];
  const started = [];
  for (const r of runs) {
    const c = Date.parse(r.created_at);
    if (!Number.isFinite(c)) continue;
    const slot = slotAtOrBefore(matches, new Date(c));
    if (!slot) continue;
    created.push((c - slot.getTime()) / 1000);
    const s = secondsBetween(slot.toISOString(), r.run_started_at);
    if (s !== null) started.push(s);
  }
  return {
    runs: created.length,
    createdP50: percentile(created, 50), createdP90: percentile(created, 90),
    startedP50: percentile(started, 50), startedP90: percentile(started, 90),
  };
}

/** Spec 55's decision rule, applied to a measured dispatch p50 (seconds). */
export function decide(p50Sec) {
  if (p50Sec === null || p50Sec === undefined) {
    return { verdict: 'unmeasured', text: 'no dispatched run measured yet: 55.3 and 55.5 wait for the numbers' };
  }
  if (p50Sec <= DISPATCH_P50_MAX_MIN * 60) {
    return { verdict: 'ahead', text: `dispatch p50 ${fmtDuration(p50Sec)} is at or under ${DISPATCH_P50_MAX_MIN} min: 55.3 and 55.5 go ahead as written` };
  }
  return {
    verdict: 'hold',
    text: `dispatch p50 ${fmtDuration(p50Sec)} is over ${DISPATCH_P50_MAX_MIN} min: 55.3 still ships with nexus's NEXUS_CHAIN_MAX at 0, ` +
      "and 55.5's preset table is rewritten from the measured realized rate before 55.5 is built",
  };
}

/**
 * The hook probe answer out of a run log, as a "hook probe: ..." line, or null. The Hook probe report step echoes
 * HOOK_PROBE_RESULT=<answer>, but gh run view --log also prints the step's script in its "##[group]Run" header, so a
 * candidate that is still shell text (it holds a "$") is the script, never the answer. The last real match wins.
 */
export function hookLine(log) {
  let found = null;
  for (const m of String(log || '').matchAll(/HOOK_PROBE_RESULT=([^\r\n]*)/g)) {
    const answer = m[1].trim();
    if (answer && !answer.includes('$')) found = `hook probe: ${answer}`;
  }
  return found;
}

// ---- gh ---------------------------------------------------------------------------------------------------------

function defaultRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000 });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || (r.error ? String(r.error.message) : '') };
}

const TSV = '.workflow_runs[] | [.id, .event, .created_at, (.run_started_at // ""), .status] | @tsv';

/** A workflow's runs for one event, through gh api's pagination; throws when gh cannot say. */
export function listRuns(run, workflow, event, sinceIso) {
  const q = [`event=${event}`, 'per_page=100'];
  if (sinceIso) q.push(`created=>=${sinceIso.slice(0, 10)}`);
  const r = run('gh', ['api', '--paginate', `repos/{owner}/{repo}/actions/workflows/${workflow}/runs?${q.join('&')}`, '--jq', TSV]);
  if (!r.ok) throw new Error(`gh api (${workflow} ${event} runs) failed: ${r.stderr.trim().split('\n')[0]}`);
  return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => {
    const [id, ev, created_at, run_started_at, status] = l.split('\t');
    return { id: Number(id), event: ev, created_at, run_started_at: run_started_at || null, status };
  });
}

// ---- entry ------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--dry-run') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export async function main(argv, deps = {}) {
  const run = deps.run || defaultRun;
  const sleep = deps.sleep || sleepMs;
  const out = deps.out || ((s) => process.stdout.write(s + '\n'));
  const now = deps.now || new Date();
  const readFile = deps.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const opts = parseArgs(argv);
  const cmd = opts._[0];
  const workflow = opts.workflow || 'probe.yml';

  if (cmd === 'dispatch') {
    const count = Number(opts.count ?? WANT_RUNS);
    const gapMin = Number(opts['gap-min'] ?? 30);
    if (!(count >= 1) || !(gapMin >= 0)) {
      out('probe-latency: --count wants 1 or more, --gap-min 0 or more');
      return 2;
    }
    out(`probe-latency: ${count} dispatches of ${workflow}, ${gapMin} min apart${opts['dry-run'] ? ' (dry run)' : ''}`);
    let failed = 0;
    for (let i = 0; i < count; i++) {
      if (i > 0) await sleep(gapMin * 60 * 1000);
      const stamp = (deps.clock ? deps.clock() : new Date()).toISOString();
      if (opts['dry-run']) {
        out(`  ${i + 1}/${count} ${stamp} would run: gh workflow run ${workflow}`);
        continue;
      }
      const r = run('gh', ['workflow', 'run', workflow]);
      if (!r.ok) failed++;
      out(`  ${i + 1}/${count} ${stamp} ${r.ok ? 'dispatched' : `FAILED: ${r.stderr.trim().split('\n')[0]}`}`);
    }
    out(`probe-latency: done. Report with: node scripts/cloud/probe-latency.mjs report --workflow ${workflow}`);
    return failed ? 1 : 0;
  }

  if (cmd === 'report') {
    const days = Number(opts.days ?? 14);
    const marchFile = opts.march || '.github/workflows/march.yml';
    let crons = [];
    try {
      crons = cronLines(readFile(marchFile));
    } catch (err) {
      out(`probe-latency: cannot read ${marchFile}: ${err.message}`);
      return 2;
    }
    const since = new Date(now.getTime() - days * 86400 * 1000).toISOString();
    let probes;
    let scheduled;
    try {
      probes = listRuns(run, workflow, 'workflow_dispatch').filter((r) => r.status === 'completed' || r.run_started_at);
      scheduled = listRuns(run, 'march.yml', 'schedule', since).filter((r) => Date.parse(r.created_at) >= Date.parse(since));
    } catch (err) {
      out(`probe-latency: ${err.message}`);
      return 2;
    }
    const dispatch = dispatchLatency(probes);
    const lag = crons.length ? scheduleLag(scheduled, crons[0]) : null;
    let hook = null;
    if (opts['hook-run']) {
      const r = run('gh', ['run', 'view', String(opts['hook-run']), '--log']);
      hook = r.ok ? (hookLine(r.stdout) ?? 'hook probe: no line in that run (was it dispatched with hook_probe=true?)') : `hook probe: cannot read run ${opts['hook-run']}`;
    }
    const decision = decide(dispatch.p50);
    const report = { dispatch, schedule: lag && { cron: crons[0], days, ...lag }, hook, decision, measured: now.toISOString() };
    if (opts.json) {
      out(JSON.stringify(report, null, 2));
      return 0;
    }
    out(`dispatch start latency (${workflow}, ${dispatch.runs} runs): p50 ${fmtDuration(dispatch.p50)}, p90 ${fmtDuration(dispatch.p90)}` +
      (dispatch.runs < WANT_RUNS ? ` -- A3 wants ${WANT_RUNS} runs` : ''));
    if (lag) {
      out(`march schedule lag ('${crons[0]}', ${days} days, ${lag.runs} runs): created p50 ${fmtDuration(lag.createdP50)}, p90 ${fmtDuration(lag.createdP90)}; ` +
        `started p50 ${fmtDuration(lag.startedP50)}, p90 ${fmtDuration(lag.startedP90)}`);
    } else {
      out(`march schedule lag: ${marchFile} declares no cron`);
    }
    if (hook) out(hook);
    out(`decision: ${decision.text}`);
    return 0;
  }

  out('usage: probe-latency.mjs dispatch [--count N] [--gap-min M] [--workflow probe.yml] [--dry-run]\n' +
    '       probe-latency.mjs report [--workflow probe.yml] [--march <file>] [--days N] [--hook-run <id>] [--json]');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
