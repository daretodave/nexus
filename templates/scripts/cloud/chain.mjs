#!/usr/bin/env node
// scripts/cloud/chain.mjs: self-chaining. A tick that shipped, and leaves work ready behind it, dispatches the next
// tick at once instead of leaving that work to wait for the next cron slot. It runs as march.yml's last step ("Chain
// next tick") and dispatches at most one run, only when every guard holds; the first guard that fails names the
// reason, and nothing is dispatched. It fails closed: a value it cannot read means no chain.
//
//   node scripts/cloud/chain.mjs [--landed <bool>] [--lost <bool>] [--reason <why>] [--chain <N>] [--chain-max <M>]
//                                [--quota <u>] [--quota-max <0.90|off>] [--ceiling <N|none>] [--main <branch>]
//                                [--workflow <file>] [--night <path>] [--issues <bool>] [--run-id <id>] [--dry-run]
//
// The guards, in the order checked (the cheap ones first, so a repo with NEXUS_CHAIN_MAX 0 never calls gh):
//
//   depth    --chain (this run's input, 0 when empty) + 1 is at or under --chain-max (NEXUS_CHAIN_MAX; anything
//            but a whole number reads as 0, so the variable alone decides whether a repo chains).
//   shipped  --landed: this run landed a commit carrying its Cloud-Run trailer (pull-request mode: the land job
//            succeeded). Or --lost: it was marked lost-to-background and --reason is not already `retry`; then the
//            next run is dispatched with reason=retry, once.
//   quota    --quota (this run's seven_day utilization, the Quota read step's output) parses as a number under
//            --quota-max (NEXUS_QUOTA_MAX; `off` falls back to quota.mjs HARD_MAX). Missing or unparseable: no chain.
//   budget   the weighted 24h ceiling budget (a Cloud-Run commit that adds a plan/ARCHIVE.md line counts 3, any other
//            1; read from origin/<main>) plus 3 is at or under --ceiling. `none`: the mode has no commit ceiling
//            (pull-request mode), and spec 54's dispatch ceiling bounds the chain instead.
//   night    now is not within 30 minutes of a cron slot in --night (default .github/workflows/night.yml; no file,
//            no night guard). A cron it cannot parse: no chain.
//   queue    no run of --workflow (default march.yml) or of night.yml is queued, pending, waiting or requested.
//            GitHub keeps one pending run per concurrency group and a new one cancels the old, so this guard is what
//            keeps a chain from cancelling a pending night digest.
//   ready    scripts/plan/order.mjs finds a chunk ready now (an Asap row included) or a spec waiting to be chunked,
//            or (unless --issues false) an open issue labeled loop:do, or carrying no label at all, without
//            loop:opened. Counts and labels only, never issue text.
//
// When they all hold: `gh workflow run <workflow> --ref <main> -f chain=<N+1> -f reason=chain|retry` (--dry-run
// prints it instead). Sets the outputs `chained` (true|false), `guard` (the one that failed, empty when chained) and
// `reason`, and writes one `chain: ...` line to the step summary. Never fails the job.
//
// Environment: GH_TOKEN for gh (actions: write to dispatch), GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, GITHUB_RUN_ID.
// Zero dependencies beside quota.mjs and idle.mjs (and the plan's order.mjs for the ready count, when present).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planReady } from './idle.mjs';
import { HARD_MAX, softCap } from './quota.mjs';

export const NIGHT_WINDOW_MIN = 30;
/** The weighted cost of a chunk-shipping commit: the next chained tick may ship one. */
export const CHUNK_COST = 3;
export const PENDING = new Set(['queued', 'pending', 'waiting', 'requested']);
export const OPENED_LABEL = 'loop:opened';
export const DO_LABEL = 'loop:do';

const yes = (v) => /^(true|1|yes)$/i.test(String(v ?? '').trim());

// ---- the knobs -------------------------------------------------------------------------------------------------

/** NEXUS_CHAIN_MAX: a whole number from 0; anything else (unset included) is 0, so nothing chains by accident. */
export function chainMaxOf(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= 0 ? n : 0;
}

/** The run's `chain` input: empty (a scheduled or hand run) is 0; anything but a whole number is null. */
export function chainOf(v) {
  const s = String(v ?? '').trim();
  if (s === '') return 0;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// ---- the guards ------------------------------------------------------------------------------------------------
// Each returns { ok, why }; shipped also returns the reason the next run is dispatched with.

export function depthGuard({ chain, max }) {
  if (chain === null) return { ok: false, why: 'the chain input is not a whole number' };
  if (chain + 1 > max) return { ok: false, why: `chain ${chain} + 1 is over NEXUS_CHAIN_MAX ${max}` };
  return { ok: true, why: `chain ${chain} + 1 is at or under NEXUS_CHAIN_MAX ${max}` };
}

export function shippedGuard({ landed, lost, reason }) {
  if (yes(landed)) return { ok: true, why: 'this run landed a commit', next: 'chain' };
  if (yes(lost)) {
    if (String(reason ?? '').trim() === 'retry') return { ok: false, why: 'lost to background work again, and this run was already the retry' };
    return { ok: true, why: 'lost to background work: one retry', next: 'retry' };
  }
  return { ok: false, why: 'this run landed nothing' };
}

/** The quota as a number, or null when it is missing or does not parse. */
export function quotaOf(v) {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function quotaGuard({ quota, max }) {
  const cap = softCap(max) ?? HARD_MAX;
  const u = quotaOf(quota);
  if (u === null) return { ok: false, why: 'this run carried no seven_day reading it could parse (the chain fails closed)' };
  if (u >= cap) return { ok: false, why: `seven_day utilization ${u} is at or above ${softCap(max) === null ? 'the hard ceiling' : 'NEXUS_QUOTA_MAX'} ${cap}` };
  return { ok: true, why: `seven_day utilization ${u} under ${cap}` };
}

/** The ceiling: a whole number, `none` (the mode has none), or null (unreadable). */
export function ceilingOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'none') return 'none';
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

/** The weighted budget of the last 24h's Cloud-Run commits: [{ chunk: bool }] -> chunk 3, churn 1. */
export function budgetOf(commits) {
  return (commits ?? []).reduce((n, c) => n + (c.chunk ? CHUNK_COST : 1), 0);
}

export function budgetGuard({ budget, ceiling }) {
  if (ceiling === 'none') return { ok: true, why: 'no commit ceiling in this mode (the dispatch ceiling bounds the chain)' };
  if (ceiling === null) return { ok: false, why: 'the ceiling could not be read (the chain fails closed)' };
  if (budget === null) return { ok: false, why: 'the 24h budget could not be counted (the chain fails closed)' };
  if (budget + CHUNK_COST > ceiling) return { ok: false, why: `budget ${budget} + ${CHUNK_COST} is over the ceiling ${ceiling}` };
  return { ok: true, why: `budget ${budget} + ${CHUNK_COST} is at or under the ceiling ${ceiling}` };
}

// ---- cron ------------------------------------------------------------------------------------------------------

const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

/** One cron field as a set of numbers, or null when it does not parse. `*` keeps a flag (day-of-month/week rule). */
function field(text, [lo, hi]) {
  const out = new Set();
  for (const part of String(text).split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    let a = lo;
    let b = hi;
    if (m[1] !== '*') {
      a = Number(m[2]);
      b = m[3] !== undefined ? Number(m[3]) : m[4] ? hi : a;
    }
    if (step < 1 || a < lo || b > hi || a > b) return null;
    for (let i = a; i <= b; i += step) out.add(i);
  }
  return out;
}

/** A five-field cron expression as { fields, domStar, dowStar }, or null when it does not parse (names unsupported). */
export function parseCron(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields = parts.map((p, i) => field(p, RANGES[i]));
  if (fields.some((f) => f === null)) return null;
  if (fields[4].has(7)) fields[4].add(0);
  return { fields, domStar: parts[2] === '*', dowStar: parts[4] === '*' };
}

/** Whether a parsed cron fires at this UTC minute (cron's rule: when both day fields are set, either matches). */
export function cronFires(cron, d) {
  const [min, hour, dom, mon, dow] = cron.fields;
  if (!min.has(d.getUTCMinutes()) || !hour.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
  const a = dom.has(d.getUTCDate());
  const b = dow.has(d.getUTCDay());
  if (cron.domStar && cron.dowStar) return true;
  if (cron.domStar) return b;
  if (cron.dowStar) return a;
  return a || b;
}

/** The `cron:` lines of a workflow file. */
export function cronsIn(text) {
  return [...String(text ?? '').matchAll(/^\s*-?\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

/** The night guard: `crons` null means no night workflow; a cron that does not parse fails closed. */
export function nightGuard({ crons, now, window = NIGHT_WINDOW_MIN }) {
  if (crons === null) return { ok: true, why: 'no night workflow' };
  const parsed = crons.map(parseCron);
  if (parsed.some((c) => c === null)) return { ok: false, why: `night's cron could not be parsed (${crons.join(', ')}; the chain fails closed)` };
  const t0 = Math.floor(now.getTime() / 60000) * 60000;
  for (let k = -window; k <= window; k++) {
    const d = new Date(t0 + k * 60000);
    const hit = parsed.find((c) => cronFires(c, d));
    if (hit) return { ok: false, why: `within ${window} min of night's slot ${d.toISOString().replace(/:00\.000Z$/, 'Z')}` };
  }
  return { ok: true, why: `no night slot within ${window} min` };
}

// ---- the queue -------------------------------------------------------------------------------------------------

/** The queue guard: `runs` maps a workflow file to its gh run list (null when gh could not say). */
export function queueGuard({ runs, runId }) {
  for (const [wf, list] of Object.entries(runs)) {
    if (list === null) return { ok: false, why: `gh could not list ${wf}'s runs (the chain fails closed)` };
    const waiting = list.filter((r) => PENDING.has(String(r?.status ?? '')) && String(r?.databaseId ?? '') !== String(runId ?? ''));
    if (waiting.length) return { ok: false, why: `${wf} already has a run ${waiting[0].status} (#${waiting[0].databaseId})` };
  }
  return { ok: true, why: `nothing queued or pending in ${Object.keys(runs).join(' or ')}` };
}

// ---- ready work ------------------------------------------------------------------------------------------------

/** Open issues that are loop work: labeled loop:do, or carrying no label; never loop:opened. Labels only. */
export function issueWork(issues) {
  return (issues ?? []).filter((i) => {
    const names = (i?.labels ?? []).map((l) => String(l?.name ?? l));
    if (names.includes(OPENED_LABEL)) return false;
    return names.length === 0 || names.includes(DO_LABEL);
  }).length;
}

/** `ready` is the plan's ready count (null when unknown), `issues` the issue-work count (null when unknown or off). */
export function readyGuard({ ready, issues }) {
  if (Number.isInteger(ready) && ready > 0) return { ok: true, why: `${ready} ready in the plan` };
  if (Number.isInteger(issues) && issues > 0) return { ok: true, why: `${issues} open loop:do or unlabeled issue(s)` };
  const parts = [ready === null ? 'the plan could not be read' : 'nothing ready in the plan'];
  if (issues === null) parts.push('no issue count');
  else parts.push('no loop:do or unlabeled issue');
  return { ok: false, why: parts.join(', ') };
}

// ---- the decision ----------------------------------------------------------------------------------------------

/**
 * Walk the guards in order; facts are gathered lazily (`facts.x` may be a function), so a guard that fails early
 * spares the calls behind it. Returns { chain, guard, reason, next, checked }.
 */
export async function decide(facts) {
  const get = async (k) => (typeof facts[k] === 'function' ? facts[k]() : facts[k]);
  const checked = [];
  let next = 'chain';
  const steps = [
    ['depth', async () => depthGuard({ chain: await get('chain'), max: await get('chainMax') })],
    ['shipped', async () => shippedGuard({ landed: await get('landed'), lost: await get('lost'), reason: await get('reason') })],
    ['quota', async () => quotaGuard({ quota: await get('quota'), max: await get('quotaMax') })],
    ['budget', async () => budgetGuard({ budget: await get('budget'), ceiling: await get('ceiling') })],
    ['night', async () => nightGuard({ crons: await get('nightCrons'), now: await get('now') })],
    ['queue', async () => queueGuard({ runs: await get('runs'), runId: await get('runId') })],
    ['ready', async () => readyGuard({ ready: await get('ready'), issues: await get('issues') })],
  ];
  for (const [name, check] of steps) {
    let r;
    try {
      r = await check();
    } catch (e) {
      r = { ok: false, why: `could not check (${e instanceof Error ? e.message : String(e)}; the chain fails closed)` };
    }
    checked.push({ guard: name, ...r });
    if (name === 'shipped' && r.next) next = r.next;
    if (!r.ok) return { chain: false, guard: name, reason: r.why, next, checked };
  }
  return { chain: true, guard: '', reason: checked.map((c) => c.why).join('; '), next, checked };
}

// ---- reading the repo ------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

const gitRun = (args) => shRun('git', args);

/** The weighted 24h budget on origin/<main>, as the ceiling step counts it; null when git cannot say. */
export function readBudget({ git, main, now }) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const log = git(['log', `origin/${main}`, `--since=${since}`, '--grep=Cloud-Run:', '--format=%H']);
  if (!log.ok) return null;
  const commits = [];
  for (const sha of log.stdout.split(/\s+/).filter(Boolean)) {
    const show = git(['show', '--format=', sha, '--', 'plan/ARCHIVE.md']);
    if (!show.ok) return null;
    commits.push({ chunk: /^\+- /m.test(show.stdout) });
  }
  return budgetOf(commits);
}

/** A workflow's recent runs ({ databaseId, status }), or null when gh cannot list them. */
export function readRuns(run, workflow) {
  const r = run('gh', ['run', 'list', '--workflow', workflow, '--json', 'databaseId,status', '--limit', '30']);
  if (!r.ok) return null;
  try {
    const v = JSON.parse(r.stdout || '[]');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The issue-work count, or null when gh cannot list the open issues. */
export function readIssues(run) {
  const r = run('gh', ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,labels']);
  if (!r.ok) return null;
  try {
    const v = JSON.parse(r.stdout || '[]');
    return Array.isArray(v) ? issueWork(v) : null;
  } catch {
    return null;
  }
}

// ---- the command -----------------------------------------------------------------------------------------------

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (!m) out._.push(rest[i]);
    else if (m[1] === 'dry-run') out[m[1]] = true;
    else out[m[1]] = rest[++i] ?? '';
  }
  return out;
}

function emit(env, outputs, summary) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v ?? '').replace(/[\r\n]+/g, ' ')}`);
  try {
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  } catch {}
  try {
    if (env.GITHUB_STEP_SUMMARY && summary) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary + '\n');
  } catch {}
}

export async function main(argv, { env = process.env, run = shRun, git = gitRun, ready = (m) => planReady(process.cwd(), m), now = new Date(), exists = fs.existsSync, readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const f = flags(argv);
  if (f._.length) {
    console.error('usage: node scripts/cloud/chain.mjs [--landed <bool>] [--lost <bool>] [--reason <why>] [--chain <N>] [--chain-max <M>] [--quota <u>] [--quota-max <0.90|off>] [--ceiling <N|none>] [--main <branch>] [--workflow <file>] [--night <path>] [--issues <bool>] [--run-id <id>] [--dry-run]');
    return 2;
  }
  const main = f.main || 'main';
  const workflow = f.workflow || 'march.yml';
  const nightPath = f.night || '.github/workflows/night.yml';
  const hasNight = exists(nightPath);
  const runId = f['run-id'] || env.GITHUB_RUN_ID || '';
  const chain = chainOf(f.chain);
  let fetched = false;
  const fetchMain = () => {
    if (!fetched) git(['fetch', '--quiet', 'origin', main]);
    fetched = true;
  };
  const d = await decide({
    chain,
    chainMax: chainMaxOf(f['chain-max']),
    landed: f.landed,
    lost: f.lost,
    reason: f.reason,
    quota: f.quota,
    quotaMax: f['quota-max'],
    ceiling: ceilingOf(f.ceiling),
    budget: () => {
      if (ceilingOf(f.ceiling) === 'none') return 0;
      fetchMain();
      return readBudget({ git, main, now });
    },
    nightCrons: () => (hasNight ? cronsIn(readFile(nightPath)) : null),
    now,
    runId,
    runs: () => {
      const runs = { [workflow]: readRuns(run, workflow) };
      if (hasNight) {
        const name = nightPath.split(/[\\/]/).pop();
        if (name !== workflow) runs[name] = readRuns(run, name);
      }
      return runs;
    },
    ready: async () => {
      fetchMain();
      try {
        const n = await ready(main);
        return Number.isInteger(n) ? n : null;
      } catch {
        return null;
      }
    },
    issues: () => (f.issues !== undefined && !yes(f.issues) ? null : readIssues(run)),
  });
  for (const c of d.checked) console.log(`  ${c.ok ? 'ok ' : 'NO '} ${c.guard}: ${c.why}`);
  if (!d.chain) {
    const line = `chain: no (${d.guard}: ${d.reason})`;
    console.log(line);
    emit(env, { chained: 'false', guard: d.guard, reason: d.reason }, line);
    return 0;
  }
  const n = chain + 1;
  const args = ['workflow', 'run', workflow, '--ref', main, '-f', `chain=${n}`, '-f', `reason=${d.next}`];
  if (f['dry-run']) {
    const line = `chain: would dispatch ${workflow} (chain=${n}, reason=${d.next}); dry run`;
    console.log(`${line}\n  gh ${args.join(' ')}`);
    emit(env, { chained: 'false', guard: '', reason: 'dry run' }, line);
    return 0;
  }
  const r = run('gh', args);
  if (!r.ok) {
    const why = `gh workflow run failed (${(r.stderr || '').trim().split('\n')[0] || 'no message'})`;
    const line = `chain: no (dispatch: ${why})`;
    console.log(line);
    emit(env, { chained: 'false', guard: 'dispatch', reason: why }, line);
    return 0;
  }
  const line = `chain: dispatched ${workflow} (chain=${n}, reason=${d.next})`;
  console.log(line);
  emit(env, { chained: 'true', guard: '', reason: d.reason }, line);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      // The chain never fails a tick: an error here reads as "no chain".
      console.error(`chain: no (${e instanceof Error ? e.message : String(e)})`);
      process.exitCode = 0;
    },
  );
}
