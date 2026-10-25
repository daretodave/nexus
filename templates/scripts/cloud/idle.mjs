#!/usr/bin/env node
// scripts/cloud/idle.mjs: the idle probe and the no-op reason. A scheduled tick that finds the same repo the last
// no-op left behind spends a model call to learn nothing; this decides, before the model step, whether it may skip,
// and after every tick writes the one line that says why nothing landed.
//
//   node scripts/cloud/idle.mjs probe [--state <file>] [--event <name>] [--reason <why>] [--main <branch>]
//                                     [--backoff <K>] [--wake-every <N>]
//       Computes the fingerprint (counts and hashes only, never issue text: the origin/<main> sha, open issue counts
//       by label, the ready-chunk count, the newest issue updated_at) and decides. A scheduled tick skips the model
//       when the fingerprint is unchanged since the last no-op, the last K scheduled ticks were no-ops, nothing is
//       ready, and this is not every Nth skip (that one runs anyway). Dispatch, nudge and chain runs never skip; a
//       fingerprint it cannot compute never skips. Sets `skip`, `reason`, `ready` and `fingerprint` on
//       $GITHUB_OUTPUT and writes the state file. Never fails the job.
//   node scripts/cloud/idle.mjs record [--state <file>] [--event <name>] [--reason <why>] [--main <branch>]
//                                      --run-url <url>
//       After the model: fetches origin/<main>, asks whether a commit carries this run's `Cloud-Run:` trailer, and
//       keeps the fingerprint the tick left. A landed tick resets the count; a scheduled no-op adds one. Sets
//       `landed` (true|false).
//   node scripts/cloud/idle.mjs noop [--landed <bool>] [--ceiling <skip>] [--ceiling-reason <why>] [--quota-skip <skip>]
//                                    [--quota-reason <why>] [--idle-skip <skip>] [--idle-reason <why>] [--quota-status <status>]
//                                    [--resets <ISO>] [--lost <bool>] [--model <outcome>] [--ready <n>]
//                                    [--nothing-picked] [--land-failed <bool>] [<execution file>]
//       Writes `no-op reason: <why>` to the step summary when nothing landed (a lost-to-background run is already
//       marked by lost.mjs, so it adds no second line). Sets `reason`.
//
// The state file defaults to .nexus/idle.json: { fingerprint, noops, streak, parts, run } (actions/cache carries it
// between runs). Knobs: NEXUS_IDLE_BACKOFF (K, default 3, 0 = never skip), NEXUS_IDLE_WAKE_EVERY (N, default 4).
// Environment: GH_TOKEN for gh, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, GITHUB_EVENT_NAME, GITHUB_RUN_ID, RUNNER_TEMP.
// Zero dependencies beside quota.mjs and lost.mjs (and the plan's order.mjs for the ready count, when present).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { committedFor, resultText } from './lost.mjs';
import { parseMessages, runKind } from './quota.mjs';

export const STATE = '.nexus/idle.json';
export const DEFAULT_BACKOFF = 3;
export const DEFAULT_WAKE_EVERY = 4;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- the knobs -------------------------------------------------------------------------------------------------

/** NEXUS_IDLE_BACKOFF: a whole number from 0 (0 = never skip); anything else is the default. */
export function backoffOf(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= 0 ? n : DEFAULT_BACKOFF;
}

/** NEXUS_IDLE_WAKE_EVERY: a whole number from 1 (1 = every skip runs anyway); anything else is the default. */
export function wakeEveryOf(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= 1 ? n : DEFAULT_WAKE_EVERY;
}

// ---- the fingerprint -------------------------------------------------------------------------------------------

/** Open issues as counts by label (`(none)` for unlabelled) and the newest updated_at. Never a title or a body. */
export function issueParts(issues) {
  const labels = {};
  let newest = '';
  for (const i of issues) {
    const names = (i?.labels ?? []).map((l) => String(l?.name ?? l)).filter(Boolean);
    for (const n of names.length ? names : ['(none)']) labels[n] = (labels[n] ?? 0) + 1;
    const u = String(i?.updatedAt ?? '');
    if (u > newest) newest = u;
  }
  const sorted = Object.fromEntries(Object.keys(labels).sort().map((k) => [k, labels[k]]));
  return { open: issues.length, labels: sorted, newest: newest || null };
}

/** The ready count from a simulated plan (order.mjs simulate): chunks whose needs are all closed now, plus specs
 * waiting to be chunked (the first /next that picks one chunks it). In-flight chunks are someone else's. */
export function readyOf(sim) {
  const open = new Set([...(sim.next ?? []), ...(sim.inFlight ?? []), ...(sim.blocked ?? [])].map((c) => c.id));
  const chunks = (sim.next ?? []).filter((c) => (c.needs ?? []).every((x) => !open.has(x))).length;
  return chunks + (sim.unchunked ?? []).length;
}

/** The fingerprint of { main, ready, issues }: a short sha256, or null when any part is unknown. */
export function fingerprint(parts) {
  if (!parts || parts.main == null || parts.ready == null || parts.issues == null) return null;
  const text = JSON.stringify({ main: parts.main, ready: parts.ready, issues: parts.issues });
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// ---- the decision ----------------------------------------------------------------------------------------------

/**
 * Whether this run skips the model: { skip, reason, state } where state is what the state file holds next.
 * `kind` is quota.mjs runKind (scheduled | chained | manual); `state` the last state file (null when none).
 */
export function decide({ kind, backoff, wakeEvery, state, fp, ready }) {
  const last = state && typeof state === 'object' ? state : {};
  const noops = Number.isInteger(last.noops) ? last.noops : 0;
  const streak = Number.isInteger(last.streak) ? last.streak : 0;
  const keep = (reason, s = streak) => ({ skip: false, reason, state: { ...last, noops, streak: s } });
  if (kind !== 'scheduled') return keep(`a ${kind} run never skips`);
  if (backoff === 0) return keep('NEXUS_IDLE_BACKOFF is 0 (never skip)');
  if (fp == null) return keep('the fingerprint could not be computed (the probe fails open)', 0);
  if (ready == null) return keep('the ready count is unknown (the probe fails open)', 0);
  if (ready > 0) return keep(`${ready} ready to build`, 0);
  if (!last.fingerprint || last.fingerprint !== fp) return keep('the repo changed since the last no-op', 0);
  if (noops < backoff) return keep(`${noops} of ${backoff} scheduled no-ops so far`, 0);
  const k = streak + 1;
  if (k % wakeEvery === 0) return keep(`wake: every ${wakeEvery}th idle skip runs anyway (skip ${k})`, k);
  return {
    skip: true,
    reason: `nothing changed since the last no-op and nothing is ready; ${noops} scheduled no-ops in a row (skip ${k}, every ${wakeEvery}th runs)`,
    state: { ...last, noops, streak: k },
  };
}

/** The state after a tick the model ran: a landed tick resets the count, a scheduled no-op adds one. */
export function recordState({ state, kind, landed, fp, parts, run }) {
  const last = state && typeof state === 'object' ? state : {};
  const noops = Number.isInteger(last.noops) ? last.noops : 0;
  const streak = Number.isInteger(last.streak) ? last.streak : 0;
  if (landed) return { fingerprint: fp, noops: 0, streak: 0, parts, run };
  if (kind === 'scheduled') return { fingerprint: fp, noops: noops + 1, streak, parts, run };
  return { fingerprint: fp, noops, streak, parts, run };
}

// ---- the no-op reason ------------------------------------------------------------------------------------------

const yes = (v) => /^(true|1|yes)$/i.test(String(v ?? '').trim());

/** The last non-empty line of a text, one line, at most `n` characters. */
export function excerpt(text, n = 160) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = (lines.at(-1) ?? '').replace(/\s+/g, ' ');
  return line.length > n ? `${line.slice(0, n - 3)}...` : line;
}

/**
 * Why nothing landed: { reason, printed } (printed: lost.mjs already wrote the line), or null when the tick landed.
 * The first cause that holds names it: a skip before the model, a lockout mid-tick, lost work, a failed model step,
 * an empty plan, else the result's own last line.
 */
export function noopReason(o) {
  if (yes(o.landed)) return null;
  if (yes(o.ceiling)) return { reason: `ceiling (${o.ceilingReason || 'the 24h cloud commit budget is spent'})` };
  if (yes(o.quotaSkip)) return { reason: `quota (${o.quotaReason || 'the quota gate skipped the model'})` };
  if (yes(o.idleSkip)) return { reason: `idle skip (${o.idleReason || 'nothing changed since the last no-op'})` };
  if (o.quotaStatus === 'rejected') return { reason: `quota (the weekly quota ran out during the tick${o.resets ? `; it resets ${o.resets}` : ''})` };
  if (yes(o.lost)) return { reason: 'lost-to-background', printed: true };
  if (yes(o.landFailed)) return { reason: 'the land job failed (its fence step names any path it refused)' };
  if (o.nothingPicked) return { reason: 'no ready work (no ready chunk, every candidate claimed, or the loop PR limit reached; see the pick step)' };
  if (o.model === 'failure' || o.model === 'cancelled') return { reason: `the model step ${o.model === 'failure' ? 'failed' : 'was cancelled'} (see the run log)` };
  const ready = o.ready === '' || o.ready == null ? null : Number(o.ready);
  const said = excerpt(o.text);
  if (ready === 0) return { reason: `no ready work${said ? ` ("${said.replace(/"/g, "'")}")` : ''}` };
  return { reason: `nothing landed${said ? ` ("${said.replace(/"/g, "'")}")` : ''}` };
}

// ---- reading the repo ------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

const gitRun = (args) => shRun('git', args);

/** The ready count through the plan's own order.mjs on origin/<main>; null when it cannot say (no plan scripts). */
export async function planReady(cwd, main) {
  try {
    const order = path.join(HERE, '..', 'plan', 'order.mjs');
    if (!fs.existsSync(order)) return null;
    const { load, simulate } = await import(pathToFileURL(order).href);
    return readyOf(simulate(await load(cwd, `origin/${main}`, { vault: false })));
  } catch {
    return null;
  }
}

/** The fingerprint's parts: { main, ready, issues }, each null when it cannot be read. */
export async function readParts({ main, run, git, ready, fetch = false }) {
  if (fetch) git(['fetch', '--quiet', 'origin', main]);
  const sha = git(['rev-parse', '--verify', '--quiet', `origin/${main}`]);
  let issues = null;
  const r = run('gh', ['issue', 'list', '--state', 'open', '--limit', '1000', '--json', 'labels,updatedAt']);
  if (r.ok) {
    try {
      issues = issueParts(JSON.parse(r.stdout || '[]'));
    } catch {
      issues = null;
    }
  }
  let n = null;
  try {
    n = await ready(main);
  } catch {
    n = null;
  }
  return { main: sha.ok && sha.stdout.trim() ? sha.stdout.trim() : null, ready: Number.isInteger(n) ? n : null, issues };
}

// ---- the commands ----------------------------------------------------------------------------------------------

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (!m) out._.push(rest[i]);
    else if (m[1] === 'nothing-picked') out[m[1]] = true;
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

/** A state file's object, or null when missing or unparseable. */
export function readState(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    console.log(`idle: could not write ${file} (${e.message})`);
  }
}

async function probe(f, deps) {
  const { env } = deps;
  const file = f.state || STATE;
  const kind = runKind(f.event ?? env.GITHUB_EVENT_NAME, f.reason);
  const main = f.main || 'main';
  const parts = await readParts({ main, run: deps.run, git: deps.git, ready: deps.ready });
  const fp = fingerprint(parts);
  const state = readState(file);
  const d = decide({ kind, backoff: backoffOf(f.backoff), wakeEvery: wakeEveryOf(f['wake-every']), state, fp, ready: parts.ready });
  writeState(file, d.state);
  console.log(`Idle probe (${kind} run): ${d.skip ? 'skip' : 'run'} - ${d.reason}; fingerprint ${fp ?? 'unknown'}, ready ${parts.ready ?? 'unknown'}`);
  emit(env, { skip: d.skip ? 'true' : 'false', reason: d.reason, ready: parts.ready ?? '', fingerprint: fp ?? '' });
  return 0;
}

async function record(f, deps) {
  const { env } = deps;
  const file = f.state || STATE;
  const kind = runKind(f.event ?? env.GITHUB_EVENT_NAME, f.reason);
  const main = f.main || 'main';
  const parts = await readParts({ main, run: deps.run, git: deps.git, ready: deps.ready, fetch: true });
  const landed = committedFor(f['run-url'] || '', { git: deps.git });
  const fp = fingerprint(parts);
  const runId = Number(env.GITHUB_RUN_ID) || env.GITHUB_RUN_ID || null;
  const next = recordState({ state: readState(file), kind, landed, fp, parts, run: runId });
  writeState(file, next);
  console.log(`Idle record (${kind} run): ${landed ? 'landed' : 'nothing landed'}; ${next.noops} scheduled no-op(s) in a row; fingerprint ${fp ?? 'unknown'}`);
  emit(env, { landed: landed ? 'true' : 'false' });
  return 0;
}

function noop(f, { env }) {
  let text = '';
  if (f._[0]) {
    try {
      text = resultText(parseMessages(fs.readFileSync(f._[0], 'utf8')));
    } catch {
      text = '';
    }
  }
  const r = noopReason({
    landed: f.landed,
    ceiling: f.ceiling,
    ceilingReason: f['ceiling-reason'],
    quotaSkip: f['quota-skip'],
    quotaReason: f['quota-reason'],
    idleSkip: f['idle-skip'],
    idleReason: f['idle-reason'],
    quotaStatus: f['quota-status'],
    resets: f.resets,
    lost: f.lost,
    landFailed: f['land-failed'],
    nothingPicked: f['nothing-picked'] === true,
    model: f.model,
    ready: f.ready,
    text,
  });
  if (!r) {
    console.log('no-op reason: none (the tick landed work)');
    emit(env, { reason: '' });
    return 0;
  }
  const line = `no-op reason: ${r.reason}`;
  console.log(r.printed ? `${line} (marked by the Lost-to-background check)` : line);
  emit(env, { reason: r.reason }, r.printed ? '' : line);
  return 0;
}

export async function main(argv, { env = process.env, run = shRun, git = gitRun, ready = (m) => planReady(process.cwd(), m) } = {}) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  switch (cmd) {
    case 'probe':
      return probe(f, { env, run, git, ready });
    case 'record':
      return record(f, { env, run, git, ready });
    case 'noop':
      return noop(f, { env });
    default:
      console.error('usage: node scripts/cloud/idle.mjs probe [--state <file>] [--event <name>] [--reason <why>] [--main <branch>] [--backoff <K>] [--wake-every <N>] | record [--state <file>] [--event <name>] [--reason <why>] [--main <branch>] --run-url <url> | noop [--landed <bool>] [--ceiling <skip>] [--ceiling-reason <why>] [--quota-skip <skip>] [--quota-reason <why>] [--idle-skip <skip>] [--idle-reason <why>] [--quota-status <status>] [--resets <ISO>] [--lost <bool>] [--model <outcome>] [--ready <n>] [--nothing-picked] [--land-failed <bool>] [<execution file>]');
      return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      // The probe never fails a tick: an error here reads as "run".
      console.error(`idle: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 0;
    },
  );
}
