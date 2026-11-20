#!/usr/bin/env node
// scripts/cloud/nudge-check.mjs: the event tick. nudge.yml runs it when an issue is opened, reopened or labeled; it
// decides whether that issue starts a march tick now instead of waiting for the next cron slot, and dispatches at
// most one: `gh workflow run march.yml -f verb=march -f reason=issue-<number>`. No model, no issue text in or out:
// only the issue NUMBER crosses into the tick, which triages the issue as data (spec 54).
//
//   node scripts/cloud/nudge-check.mjs [--event-file <path>] [--support <level>] [--dial <level>]
//                                      [--trust <collaborators|everyone>]
//                                      [--urgent "<label> <label>"] [--loop-actor <login>] [--max <N>]
//                                      [--workflow <file>] [--night <path>] [--dry-run]
//
// The checks, in order; the first that fails names the reason and nothing is dispatched.
//
//   support   --support (NEXUS_SUPPORT) is set and not `off`. Unset, --dial stands in: the Support level the
//             improvement dial resolves (`node scripts/plan/improve.mjs --cloud Support`, which prints one only under
//             an `Improve:` line other than gentle). Neither: no event ticks (the adopter default).
//   issue     the event payload (--event-file, default $GITHUB_EVENT_PATH) is an issues event with a whole issue
//             number, the sender is not a Bot, the issue carries no loop:opened label (the loop's own mirror), and it
//             is not loop-filed: authored by --loop-actor (NEXUS_LOOP_ACTOR, default the repository owner) AND its
//             body holds a `Cloud-Run:` line (the marker march.yml's prompt rule puts on every issue a tick opens).
//   trigger   `labeled` passes only when the label added is loop:do: applying a label takes triage rights, so the
//             owner's loop:do lifts an outsider's issue to the collaborator row. `opened` and `reopened` pass only
//             when the author is OWNER, MEMBER or COLLABORATOR (any author when --trust is `everyone`) and the issue
//             carries a label from --urgent (NEXUS_URGENT_LABELS, space-separated, default `loop:do bug`; `none`
//             means no label nudges).
//   queue     no run of --workflow (march.yml) or of night.yml (--night, when the file exists) is queued, pending,
//             waiting or requested. GitHub keeps one pending run per concurrency group and a new one cancels the old,
//             so a dispatch now would cancel a pending night digest; and a pending march triages the issue anyway.
//             A march run in progress is fine: the dispatch waits behind it as the one pending run.
//   repeat    no march run titled `issue-<this number>` started in the last hour: an issue opened with loop:do
//             fires `opened` and `labeled` both, and one tick is enough.
//   budget    fewer than --max (NEXUS_EVENT_MAX, default 6) march runs whose title carries `issue-<n>` (march.yml's
//             run-name shows the reason) started in the last 24 hours.
//
// It fails closed: a payload it cannot read, or a run list gh cannot give, dispatches nothing (the cron tick still
// triages the issue). The workflow's job `if:` holds the cheap checks too, so most issues never start a runner;
// this script repeats them, so they are tested. Sets the outputs `dispatched` (true|false), `check` (the one that
// failed, empty when dispatched) and `reason`, and writes one `nudge: ...` line to the step summary. Never fails
// the job.
//
// Environment: GH_TOKEN for gh (actions: write to list and dispatch), GITHUB_EVENT_PATH, GITHUB_OUTPUT,
// GITHUB_STEP_SUMMARY. Zero dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OPENED_LABEL = 'loop:opened';
export const DO_LABEL = 'loop:do';
export const LOOP_FILED = 'Cloud-Run:';
export const DEFAULT_URGENT = 'loop:do bug';
export const DEFAULT_EVENT_MAX = 6;
export const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const PENDING = new Set(['queued', 'pending', 'waiting', 'requested']);
export const LEVELS = new Set(['off', 'triage-only', 'fix-small', 'fix-all']);
/** An event tick's run title: march.yml's run-name ends with the reason the nudge dispatched it with. */
export const EVENT_TITLE = /(?:^|\s)issue-\d+(?:\s|$)/;

// ---- the knobs -------------------------------------------------------------------------------------------------

/** NEXUS_SUPPORT: one of the four levels, or null when unset or unknown (no event ticks either way). */
export function supportOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return LEVELS.has(s) ? s : null;
}

/** NEXUS_EVENT_MAX: a whole number from 0; anything else is the default. */
export function eventMaxOf(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= 0 ? n : DEFAULT_EVENT_MAX;
}

/** NEXUS_URGENT_LABELS: the label set; unset is the default, `none` (or `-`) is the empty set. */
export function urgentOf(v) {
  const s = String(v ?? '').trim();
  if (s === '') return new Set(DEFAULT_URGENT.split(' '));
  if (/^(none|-)$/i.test(s)) return new Set();
  return new Set(s.split(/\s+/));
}

const labelNames = (labels) => (Array.isArray(labels) ? labels : []).map((l) => String(l?.name ?? l ?? ''));

// ---- the checks ------------------------------------------------------------------------------------------------
// Each returns { ok, why }.

export function supportCheck({ support, dial = null }) {
  if (support === null && dial === 'off') return { ok: false, why: 'NEXUS_SUPPORT is unset and the Improve dial sets Support off' };
  if (support === null && dial) return { ok: true, why: `NEXUS_SUPPORT is unset; the Improve dial sets Support ${dial}` };
  if (support === null) return { ok: false, why: 'NEXUS_SUPPORT is unset: no event ticks' };
  if (support === 'off') return { ok: false, why: 'NEXUS_SUPPORT is off' };
  return { ok: true, why: `NEXUS_SUPPORT is ${support}` };
}

/** The payload's facts, labels and markers only: the body is tested for the loop-filed marker and never kept. */
export function issueFacts(payload) {
  const issue = payload?.issue;
  if (!issue || typeof issue !== 'object') return null;
  const number = Number(issue.number);
  return {
    action: String(payload.action ?? ''),
    number: Number.isInteger(number) && number > 0 ? number : null,
    association: String(issue.author_association ?? '').toUpperCase(),
    author: String(issue.user?.login ?? ''),
    senderType: String(payload.sender?.type ?? ''),
    labels: labelNames(issue.labels),
    added: payload.label ? String(payload.label.name ?? '') : null,
    loopFiled: String(issue.body ?? '').includes(LOOP_FILED),
    pull: Boolean(issue.pull_request),
  };
}

export function issueCheck({ facts, loopActor }) {
  if (!facts) return { ok: false, why: 'the event payload holds no issue (the nudge fails closed)' };
  if (facts.number === null) return { ok: false, why: 'the issue number is not a whole number (the nudge fails closed)' };
  if (facts.pull) return { ok: false, why: `#${facts.number} is a pull request` };
  if (facts.senderType === 'Bot') return { ok: false, why: `#${facts.number}: the sender is a bot` };
  if (facts.labels.includes(OPENED_LABEL)) return { ok: false, why: `#${facts.number} is the loop's own mirror (${OPENED_LABEL})` };
  if (facts.loopFiled && loopActor && facts.author.toLowerCase() === String(loopActor).toLowerCase()) {
    return { ok: false, why: `#${facts.number} is loop-filed (by ${facts.author}, with a ${LOOP_FILED} line)` };
  }
  return { ok: true, why: `#${facts.number} is not the loop's own` };
}

export function triggerCheck({ facts, trust, urgent }) {
  const n = `#${facts.number}`;
  if (facts.action === 'labeled') {
    if (facts.added === DO_LABEL) return { ok: true, why: `${n} was labeled ${DO_LABEL}` };
    return { ok: false, why: `${n} was labeled ${facts.added || 'something'}, not ${DO_LABEL}` };
  }
  if (facts.action !== 'opened' && facts.action !== 'reopened') return { ok: false, why: `${n}: the ${facts.action || 'unknown'} action starts no tick` };
  const everyone = String(trust ?? '').trim().toLowerCase() === 'everyone';
  if (!everyone && !TRUSTED.has(facts.association)) return { ok: false, why: `${n}'s author is ${facts.association || 'unknown'}, not a collaborator (triaged on the next tick)` };
  const hit = facts.labels.find((l) => urgent.has(l));
  if (!hit) return { ok: false, why: urgent.size ? `${n} carries no label from NEXUS_URGENT_LABELS (${[...urgent].join(' ')})` : `${n}: NEXUS_URGENT_LABELS is none` };
  return { ok: true, why: `${n} was ${facts.action} by ${everyone ? 'an author (trust: everyone)' : `a ${facts.association.toLowerCase()}`} with ${hit}` };
}

/** `runs` maps a workflow file to its gh run list (null when gh could not say). */
export function queueCheck({ runs }) {
  for (const [wf, list] of Object.entries(runs)) {
    if (list === null) return { ok: false, why: `gh could not list ${wf}'s runs (the nudge fails closed)` };
    const waiting = list.filter((r) => PENDING.has(String(r?.status ?? '')));
    if (waiting.length) return { ok: false, why: `${wf} already has a run ${waiting[0].status} (#${waiting[0].databaseId}); it triages the issue` };
  }
  return { ok: true, why: `nothing queued or pending in ${Object.keys(runs).join(' or ')}` };
}

/** The event ticks in `runs` (march's gh run list) created in the 24 hours before `now`. */
export function eventTicks(runs, now) {
  const since = now.getTime() - 24 * 3600 * 1000;
  return (Array.isArray(runs) ? runs : []).filter((r) => {
    if (!EVENT_TITLE.test(String(r?.displayTitle ?? ''))) return false;
    const t = Date.parse(r?.createdAt);
    return Number.isFinite(t) && t >= since;
  });
}

export const REPEAT_MIN = 60;

export function repeatCheck({ runs, number, now }) {
  if (runs === null) return { ok: false, why: 'gh could not list the march runs (the nudge fails closed)' };
  const since = now.getTime() - REPEAT_MIN * 60000;
  const mine = `issue-${number}`;
  const hit = runs.find((r) => String(r?.displayTitle ?? '').split(/\s+/).includes(mine) && Date.parse(r?.createdAt) >= since);
  if (hit) return { ok: false, why: `a tick for issue-${number} already started in the last ${REPEAT_MIN} min (#${hit.databaseId})` };
  return { ok: true, why: `no tick for issue-${number} in the last ${REPEAT_MIN} min` };
}

export function budgetCheck({ runs, max, now }) {
  if (runs === null) return { ok: false, why: 'gh could not list the march runs (the nudge fails closed)' };
  const n = eventTicks(runs, now).length;
  if (n >= max) return { ok: false, why: `${n} event ticks started in the last 24h, at or above NEXUS_EVENT_MAX ${max}` };
  return { ok: true, why: `${n} event ticks in the last 24h, under NEXUS_EVENT_MAX ${max}` };
}

// ---- the decision ----------------------------------------------------------------------------------------------

/**
 * Walk the checks in order; facts are gathered lazily (`facts.x` may be a function), so the gh calls run only once
 * the payload passes. Returns { dispatch, check, reason, number, checked }.
 */
export async function decide(f) {
  const get = async (k) => (typeof f[k] === 'function' ? f[k]() : f[k]);
  const checked = [];
  let facts = null;
  const steps = [
    ['support', async () => supportCheck({ support: supportOf(await get('support')), dial: supportOf(await get('dial')) })],
    ['issue', async () => {
      facts = issueFacts(await get('payload'));
      return issueCheck({ facts, loopActor: await get('loopActor') });
    }],
    ['trigger', async () => triggerCheck({ facts, trust: await get('trust'), urgent: urgentOf(await get('urgent')) })],
    ['queue', async () => queueCheck({ runs: await get('runs') })],
    ['repeat', async () => repeatCheck({ runs: (await get('runs'))[await get('workflow')] ?? null, number: facts.number, now: await get('now') })],
    ['budget', async () => budgetCheck({ runs: (await get('runs'))[await get('workflow')] ?? null, max: eventMaxOf(await get('max')), now: await get('now') })],
  ];
  for (const [name, check] of steps) {
    let r;
    try {
      r = await check();
    } catch (e) {
      r = { ok: false, why: `could not check (${e instanceof Error ? e.message : String(e)}; the nudge fails closed)` };
    }
    checked.push({ check: name, ...r });
    if (!r.ok) return { dispatch: false, check: name, reason: r.why, number: facts?.number ?? null, checked };
  }
  return { dispatch: true, check: '', reason: checked.map((c) => c.why).join('; '), number: facts.number, checked };
}

// ---- reading the repo ------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

/** A workflow's recent runs ({ databaseId, status, displayTitle, createdAt }), or null when gh cannot list them. */
export function readRuns(run, workflow) {
  const r = run('gh', ['run', 'list', '--workflow', workflow, '--json', 'databaseId,status,displayTitle,createdAt', '--limit', '100']);
  if (!r.ok) return null;
  try {
    const v = JSON.parse(r.stdout || '[]');
    return Array.isArray(v) ? v : null;
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

export async function main(argv, { env = process.env, run = shRun, now = new Date(), exists = fs.existsSync, readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const f = flags(argv);
  if (f._.length) {
    console.error('usage: node scripts/cloud/nudge-check.mjs [--event-file <path>] [--support <level>] [--dial <level>] [--trust <collaborators|everyone>] [--urgent "<labels>"] [--loop-actor <login>] [--max <N>] [--workflow <file>] [--night <path>] [--dry-run]');
    return 2;
  }
  const workflow = f.workflow || 'march.yml';
  const nightPath = f.night || '.github/workflows/night.yml';
  const eventFile = f['event-file'] || env.GITHUB_EVENT_PATH || '';
  let runs;
  const d = await decide({
    support: f.support,
    dial: f.dial,
    trust: f.trust,
    urgent: f.urgent,
    loopActor: f['loop-actor'],
    max: f.max,
    workflow,
    now,
    payload: () => {
      try {
        return JSON.parse(readFile(eventFile));
      } catch {
        return null;
      }
    },
    runs: () => {
      if (runs) return runs;
      runs = { [workflow]: readRuns(run, workflow) };
      const name = nightPath.split(/[\\/]/).pop();
      if (exists(nightPath) && name !== workflow) runs[name] = readRuns(run, name);
      return runs;
    },
  });
  for (const c of d.checked) console.log(`  ${c.ok ? 'ok ' : 'NO '} ${c.check}: ${c.why}`);
  if (!d.dispatch) {
    const line = `nudge: no (${d.check}: ${d.reason})`;
    console.log(line);
    emit(env, { dispatched: 'false', check: d.check, reason: d.reason }, line);
    return 0;
  }
  const args = ['workflow', 'run', workflow, '-f', 'verb=march', '-f', `reason=issue-${d.number}`];
  if (f['dry-run']) {
    const line = `nudge: would dispatch ${workflow} (reason=issue-${d.number}); dry run`;
    console.log(`${line}\n  gh ${args.join(' ')}`);
    emit(env, { dispatched: 'false', check: '', reason: 'dry run' }, line);
    return 0;
  }
  const r = run('gh', args);
  if (!r.ok) {
    const why = `gh workflow run failed (${(r.stderr || '').trim().split('\n')[0] || 'no message'})`;
    const line = `nudge: no (dispatch: ${why})`;
    console.log(line);
    emit(env, { dispatched: 'false', check: 'dispatch', reason: why }, line);
    return 0;
  }
  const line = `nudge: dispatched ${workflow} for issue-${d.number} (${d.reason})`;
  console.log(line);
  emit(env, { dispatched: 'true', check: '', reason: d.reason }, line);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      // The nudge never fails its job: an error here reads as "no dispatch"; the cron tick triages the issue.
      console.error(`nudge: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 0;
    },
  );
}
