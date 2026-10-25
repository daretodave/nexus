#!/usr/bin/env node
// scripts/cloud/quota.mjs: the quota governor. Every loop on one Claude subscription shares its `seven_day` window;
// a weekly lockout fails every tick until the reset. Each tick's model output carries the subscription's
// `rate_limit_event` (utilization, status, reset time); this reads it, keeps the newest value for the next run
// (actions/cache), and lets that run skip the model before it spends anything.
//
//   node scripts/cloud/quota.mjs read [<execution file>] [--cache <file>] [--run <id>]
//       The last seven_day reading in claude-code-action's execution_file (a JSON array), or a CLI run's
//       stream-json lines; default file $RUNNER_TEMP/claude-execution-output.json. Writes the cache file, prints
//       `seven_day utilization: <u> (<status>, resets <ISO>)` to stdout and the step summary, and sets the outputs
//       `quota`, `status` and `resets` (all empty when the run carried no reading). Never fails the job.
//   node scripts/cloud/quota.mjs gate [--cache <file>] [--event <name>] [--reason <why>] [--max <0.90|off>]
//       Whether this run skips the model: `skip=true|false` and `reason` on $GITHUB_OUTPUT. Skips while the pause
//       issue is open and its reset is ahead (after it, closes the issue and runs), while the cache says `rejected`
//       with a reset ahead, for every run when the cached utilization is at or above the hard ceiling HARD_MAX (0.97,
//       a constant, not a knob: support, loop:do and hand-dispatched runs included), and, for a scheduled or chained
//       run only, when it is at or above --max. Fails open: a missing or unparseable cache, or gh unreachable, runs
//       the tick.
//   node scripts/cloud/quota.mjs dispatch [--event <name>] [--run-id <id>] [--max <N>]
//       The dispatch ceiling: `skip=true|false` and `reason` on $GITHUB_OUTPUT. A workflow_dispatch run skips once
//       --max (NEXUS_DISPATCH_MAX, default 12) other workflow_dispatch runs, of any workflow in the repository,
//       started in the last 24 hours. It bounds a tick that dispatches runs itself (a prompt-injected `gh workflow
//       run`), a nudge storm and chained runs alike; a scheduled run never skips here. Fails open when gh cannot say.
//   node scripts/cloud/quota.mjs pause [--cache <file>] [--resets <ISO>] [--run-url <url>]
//       Open, or retitle, the ONE `Loop paused: weekly quota until <ISO>` issue (label loop:paused-quota).
//   node scripts/cloud/quota.mjs show [--cache <file>]
//       The cached reading as one line (/digest prints it).
//
// The cache file defaults to .nexus/quota.json: { utilization, status, resetsAt (ISO), run }. Environment: GH_TOKEN
// for gh, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, RUNNER_TEMP, GITHUB_RUN_ID. Zero dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CACHE = '.nexus/quota.json';
export const PAUSE_LABEL = 'loop:paused-quota';
export const PAUSE_PREFIX = 'Loop paused: weekly quota until';
export const DEFAULT_MAX = 0.9;
/** The hard ceiling: at or above it every run exits before the model, whatever its event, verb, reason or label. */
export const HARD_MAX = 0.97;
/** workflow_dispatch runs per 24 hours, repository-wide, before a dispatched run exits clean (NEXUS_DISPATCH_MAX). */
export const DEFAULT_DISPATCH_MAX = 12;

// ---- reading the model's output ------------------------------------------------------------------------------

/** Every top-level JSON value in a text: one JSON document (array or object), JSON lines, or pretty objects in a row. */
export function parseMessages(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  } catch {}
  const out = [];
  let depth = 0;
  let start = -1;
  let str = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (str) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"' && depth > 0) str = true;
    else if (c === '{' || c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if ((c === '}' || c === ']') && depth > 0) {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(t.slice(start, i + 1));
          out.push(...(Array.isArray(v) ? v : [v]));
        } catch {}
      }
    }
  }
  return out;
}

/** Each `rate_limit_info` object in document order, however deep (an event, or an API error's params). */
function infos(value, out = []) {
  if (Array.isArray(value)) for (const v of value) infos(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'rate_limit_info' && v && typeof v === 'object') out.push(v);
      else infos(v, out);
    }
  }
  return out;
}

/** Seconds since the epoch, milliseconds, or a date string, as ISO; null otherwise. */
export function isoOf(v) {
  if (v == null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.000Z$/, 'Z');
}

/** One rate_limit_info as a seven_day reading, or null when it says nothing about that window. */
export function sevenDay(info) {
  const own = info.rateLimitType === 'seven_day';
  const win = info.unifiedWindows?.seven_day ?? null;
  if (!own && !win) return null;
  const status = own ? info.status ?? null : win?.status ?? 'allowed';
  let utilization = typeof win?.utilization === 'number' ? win.utilization : own && typeof info.utilization === 'number' ? info.utilization : null;
  if (utilization === null && status === 'rejected') utilization = 1;
  return { utilization, status: status ?? 'allowed', resetsAt: isoOf(win?.resetsAt ?? (own ? info.resetsAt : null)) };
}

/** The last seven_day reading in a run's messages, or null. */
export function lastQuota(messages) {
  let last = null;
  for (const info of infos(messages)) last = sevenDay(info) ?? last;
  return last;
}

/** The step-summary line. */
export function quotaLine(q) {
  if (!q) return 'seven_day utilization: unknown (no rate_limit_event in this run)';
  const u = q.utilization === null || q.utilization === undefined ? 'unknown' : String(q.utilization);
  return `seven_day utilization: ${u} (${q.status || 'unknown'}, resets ${q.resetsAt || 'unknown'})`;
}

// ---- the gate --------------------------------------------------------------------------------------------------

/** The soft cap from NEXUS_QUOTA_MAX: a number in (0, 1], null for `off`; anything else is the default. */
export function softCap(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'off') return null;
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_MAX;
}

/** scheduled | chained | manual. Nudge, loop:do and hand-dispatched runs are manual: the soft cap leaves them be. */
export function runKind(event, reason) {
  if (event === 'schedule') return 'scheduled';
  if (String(reason ?? '').trim() === 'chain') return 'chained';
  return 'manual';
}

export const pauseTitle = (iso) => `${PAUSE_PREFIX} ${iso}`;

/** The reset an open pause issue's title names, as ISO; null when it names none. */
export function pausedUntil(title) {
  const m = /^Loop paused: weekly quota until (\S+)/.exec(String(title ?? ''));
  return m ? isoOf(m[1]) : null;
}

/** A cache file's reading, or null when missing or unparseable. */
export function readCache(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * The gate's decision: { skip, reason, close } where close is the pause issue to close (its reset has passed).
 * `pause` is the open pause issue ({ number, title }) or null; `now` a Date.
 */
export function decide({ cache, pause, kind, max, now }) {
  const t = now.getTime();
  let close = null;
  if (pause) {
    const until = pausedUntil(pause.title) ?? (cache?.status === 'rejected' ? isoOf(cache.resetsAt) : null);
    if (until && t < Date.parse(until)) return { skip: true, reason: `paused: weekly quota until ${until} (issue #${pause.number})`, close: null };
    if (until) close = pause;
  }
  const resets = isoOf(cache?.resetsAt);
  if (cache?.status === 'rejected' && resets && t < Date.parse(resets)) {
    return { skip: true, reason: `the last run hit the weekly quota; it resets ${resets}`, close };
  }
  const u = typeof cache?.utilization === 'number' ? cache.utilization : null;
  const fresh = !(cache?.status === 'rejected' && resets && t >= Date.parse(resets));
  if (fresh && u !== null && u >= HARD_MAX) {
    return { skip: true, reason: `seven_day utilization ${u} is at or above the hard ceiling ${HARD_MAX} (every run, a ${kind} one included)`, close };
  }
  if (fresh && max !== null && u !== null && (kind === 'scheduled' || kind === 'chained') && u >= max) {
    return { skip: true, reason: `seven_day utilization ${u} is at or above NEXUS_QUOTA_MAX ${max} (a ${kind} run)`, close };
  }
  return { skip: false, reason: u === null ? 'no cached reading (the gate fails open)' : `seven_day utilization ${u} under the cap`, close };
}

// ---- the dispatch ceiling -------------------------------------------------------------------------------------

/** NEXUS_DISPATCH_MAX: a positive whole number; anything else is the default. */
export function dispatchMax(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_DISPATCH_MAX;
}

/** The workflow_dispatch runs in `runs` (gh run list JSON) created in the 24 hours before `now`, this run excluded. */
export function recentDispatches(runs, { now, runId }) {
  const since = now.getTime() - 24 * 3600 * 1000;
  return (Array.isArray(runs) ? runs : []).filter((r) => {
    if (!r || r.event !== 'workflow_dispatch') return false;
    if (runId && String(r.databaseId) === String(runId)) return false;
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t >= since;
  });
}

/** The dispatch ceiling's decision: { skip, reason }. `runs` is null when gh could not list them (it fails open). */
export function decideDispatch({ event, runs, max, now, runId }) {
  if (event !== 'workflow_dispatch') return { skip: false, reason: `a ${event || 'scheduled'} run is not a dispatch` };
  if (runs === null) return { skip: false, reason: 'gh could not list the runs (the dispatch ceiling fails open)' };
  const n = recentDispatches(runs, { now, runId }).length;
  if (n >= max) return { skip: true, reason: `${n} workflow_dispatch runs started in the last 24h, at or above NEXUS_DISPATCH_MAX ${max}` };
  return { skip: false, reason: `${n} workflow_dispatch runs in the last 24h, under NEXUS_DISPATCH_MAX ${max}` };
}

// ---- gh --------------------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

/** The workflow token's author login: the only author whose unlabelled pause issue counts. */
export const PAUSE_AUTHOR = 'app/github-actions';

/**
 * The open pause issue ({ number, title }); null when none, or when gh cannot say.
 * Issue text is untrusted: anyone can open an issue with the pause title. So it counts only
 * when it carries the loop:paused-quota label (only triage-level users can set one) or, the
 * unlabelled fallback, when the workflow's own token opened it.
 */
export function findPause(run) {
  for (const [args, trusted] of [
    [['issue', 'list', '--state', 'open', '--label', PAUSE_LABEL, '--json', 'number,title', '--limit', '5'], () => true],
    [
      ['issue', 'list', '--state', 'open', '--author', PAUSE_AUTHOR, '--search', `in:title "${PAUSE_PREFIX}"`, '--json', 'number,title,author', '--limit', '5'],
      (i) => i?.author?.login === PAUSE_AUTHOR,
    ],
  ]) {
    const r = run('gh', args);
    if (!r.ok) continue;
    try {
      const list = JSON.parse(r.stdout || '[]').filter((i) => String(i.title).startsWith(PAUSE_PREFIX) && trusted(i));
      if (list.length) return list.sort((a, b) => a.number - b.number)[0];
    } catch {}
  }
  return null;
}

// ---- the commands ----------------------------------------------------------------------------------------------

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (m) out[m[1]] = rest[++i] ?? '';
    else out._.push(rest[i]);
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

function read(f, { env }) {
  const file = f._[0] || path.join(env.RUNNER_TEMP || '.', 'claude-execution-output.json');
  let q = null;
  try {
    q = lastQuota(parseMessages(fs.readFileSync(file, 'utf8')));
  } catch {
    q = null;
  }
  const line = quotaLine(q);
  console.log(line);
  if (q) {
    const cache = f.cache || CACHE;
    try {
      fs.mkdirSync(path.dirname(path.resolve(cache)), { recursive: true });
      const run = Number(f.run || env.GITHUB_RUN_ID) || f.run || env.GITHUB_RUN_ID || null;
      fs.writeFileSync(cache, JSON.stringify({ utilization: q.utilization, status: q.status, resetsAt: q.resetsAt, run }, null, 2) + '\n');
    } catch (e) {
      console.log(`quota: could not write ${cache} (${e.message})`);
    }
  }
  emit(env, { quota: q?.utilization ?? '', status: q?.status ?? '', resets: q?.resetsAt ?? '' }, line);
  return 0;
}

function gate(f, { env, run, now }) {
  const cache = readCache(f.cache || CACHE);
  let pause = null;
  try {
    pause = findPause(run);
  } catch {
    pause = null;
  }
  const kind = runKind(f.event ?? env.GITHUB_EVENT_NAME, f.reason);
  const max = softCap(f.max);
  const d = decide({ cache, pause, kind, max, now });
  if (d.close) {
    const c = run('gh', ['issue', 'close', String(d.close.number), '--comment', `The weekly quota reset has passed (${pausedUntil(d.close.title) ?? 'its reset'}); the loop runs again.`]);
    console.log(c.ok ? `quota: closed pause issue #${d.close.number}` : `quota: could not close pause issue #${d.close.number}`);
  }
  const cached = cache ? `cached ${quotaLine(cache)}` : 'no cached seven_day reading';
  const line = `Quota gate (${kind} run): ${d.skip ? 'skip' : 'run'} - ${d.reason}; ${cached}`;
  console.log(line);
  emit(env, { skip: d.skip ? 'true' : 'false', reason: d.reason }, line);
  return 0;
}

function dispatch(f, { env, run, now }) {
  const event = f.event ?? env.GITHUB_EVENT_NAME ?? '';
  const max = dispatchMax(f.max);
  const runId = f['run-id'] || env.GITHUB_RUN_ID || '';
  let runs = null;
  if (event === 'workflow_dispatch') {
    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const r = run('gh', ['run', 'list', '--event', 'workflow_dispatch', '--created', `>=${since}`, '--json', 'databaseId,createdAt,event,workflowName', '--limit', String(Math.max(100, max * 4))]);
    if (r.ok) {
      try {
        const v = JSON.parse(r.stdout || '[]');
        runs = Array.isArray(v) ? v : null;
      } catch {
        runs = null;
      }
    }
  }
  const d = decideDispatch({ event, runs, max, now, runId });
  const line = `Dispatch ceiling: ${d.skip ? 'skip' : 'run'} - ${d.reason}`;
  console.log(d.skip ? `${line}. Exiting cleanly - no work this tick.` : line);
  emit(env, { skip: d.skip ? 'true' : 'false', reason: d.reason }, d.skip ? line : '');
  return 0;
}

function pauseCmd(f, { env, run }) {
  const cache = readCache(f.cache || CACHE);
  const resets = isoOf(f.resets) ?? isoOf(cache?.resetsAt);
  if (!resets) {
    console.log('quota: no reset time to name; no pause issue opened');
    return 0;
  }
  const title = pauseTitle(resets);
  const runUrl = f['run-url'] || '';
  const have = findPause(run);
  if (have) {
    if (have.title !== title) run('gh', ['issue', 'edit', String(have.number), '--title', title]);
    run('gh', ['issue', 'comment', String(have.number), '--body', `Still paused on the weekly quota until ${resets}.${runUrl ? ` Run: ${runUrl}` : ''}`]);
    console.log(`quota: pause issue #${have.number} now reads: ${title}`);
    return 0;
  }
  const body = [
    `The subscription's seven_day quota is used up (status rejected); every cloud tick would fail until ${resets}.`,
    'Scheduled and chained ticks exit before the model until then; the first tick after the reset closes this issue.',
    'Nothing to do unless the reset is far off: then pause the loop (gh workflow disable march) or free quota elsewhere.',
    runUrl ? `Run: ${runUrl}` : '',
  ].filter(Boolean).join('\n\n');
  run('gh', ['label', 'create', PAUSE_LABEL, '--color', 'C5DEF5', '--description', 'The cloud loop waits out a weekly quota lockout', '--force']);
  let c = run('gh', ['issue', 'create', '--title', title, '--body', body, '--label', PAUSE_LABEL]);
  if (!c.ok) c = run('gh', ['issue', 'create', '--title', title, '--body', body]);
  console.log(c.ok ? `quota: opened "${title}"` : `quota: could not open the pause issue (${(c.stderr || '').trim().split('\n')[0]})`);
  return 0;
}

function show(f) {
  const cache = readCache(f.cache || CACHE);
  console.log(cache ? quotaLine(cache) : 'seven_day utilization: unknown (no cached reading)');
  return 0;
}

export async function main(argv, { env = process.env, run = shRun, now = new Date() } = {}) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  switch (cmd) {
    case 'read':
      return read(f, { env });
    case 'gate':
      return gate(f, { env, run, now });
    case 'dispatch':
      return dispatch(f, { env, run, now });
    case 'pause':
      return pauseCmd(f, { env, run });
    case 'show':
      return show(f);
    default:
      console.error('usage: node scripts/cloud/quota.mjs read [<execution file>] [--cache <file>] [--run <id>] | gate [--cache <file>] [--event <name>] [--reason <why>] [--max <0.90|off>] | dispatch [--event <name>] [--run-id <id>] [--max <N>] | pause [--cache <file>] [--resets <ISO>] [--run-url <url>] | show [--cache <file>]');
      return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      // The governor never fails a tick: an error here reads as "run".
      console.error(`quota: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 0;
    },
  );
}
