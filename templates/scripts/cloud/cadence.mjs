#!/usr/bin/env node
// scripts/cloud/cadence.mjs: the cadence presets. One word, the repo variable NEXUS_CADENCE, sets how hard the loop
// runs: the 24h commit ceiling, how deep a shipped tick may chain, how many idle scheduled no-ops come before the idle
// probe skips the model, and how many hours without a successful march tick the heartbeat calls a flatline. The cron
// line is the one thing a variable cannot change (GitHub reads it from the file): bootstrap, the CLI's Cloud step or a
// hand edit writes it, through the same functions this file exports.
//
//   node scripts/cloud/cadence.mjs resolve [--cadence <word>] [--dial <word>] [--ceiling <N>] [--chain-max <N>]
//                                          [--idle-backoff <N>] [--heartbeat-hours <N|none>]
//   node scripts/cloud/cadence.mjs apply <word> [--march <path>] [--heartbeat <path>] [--cron <expr>]
//                                        [--ceiling <N>] [--write]
//   node scripts/cloud/cadence.mjs realized --runs <file> [--march <path> | --cron <expr>] [--since <ISO>]
//                                           [--now <ISO>] [--hours <N>] [--floor <0..1>]
//   node scripts/cloud/cadence.mjs show
//
// | Preset | Cron written   | Heartbeat h | Ceiling | Chain max | Idle backoff |
// |--------|----------------|-------------|---------|-----------|--------------|
// | calm   | 17 */6 * * *   | 20          | 8       | 0         | 3            |
// | steady | 17 */3 * * *   | 14          | 12      | 0         | 3            |
// | eager  | 17 */3 * * *   | 10          | 20      | 3         | 3            |
// | sprint | 17 */3 * * *   | 10          | 30      | 8         | 3            |
// | off    | no schedule    | none        | 12      | 0         | 0            |
//
// resolve: the Cadence step every march job (and heartbeat) runs first. Each field is, in order: its own repo variable
// when set (NEXUS_DAILY_CEILING, NEXUS_CHAIN_MAX, NEXUS_IDLE_BACKOFF, NEXUS_HEARTBEAT_HOURS: a per-field variable
// overrides the preset), else the preset NEXUS_CADENCE names (unset: the one --dial names, the improvement dial's
// cadence from `node scripts/plan/improve.mjs --cloud Cadence`), else empty: the workflow's own literal or the script's
// default stands (an upgraded v1 repo with no NEXUS_CADENCE keeps its cron and ceiling literals, and chains nothing).
// Sets the outputs `cadence`, `ceiling`, `chain_max`, `idle_backoff` and `heartbeat_hours` (`none`: the off preset,
// no schedule to watch), and writes one `cadence: ...` line to the step summary. An unknown word is a warning and
// reads as unset. Never fails the job.
//
// apply: writes a preset into the files: the march.yml cron line (off: the schedule comes out, and a later preset
// puts it back), its `ceiling=<N>` line, and heartbeat.yml's `march_hours=<N>` line. --cron and --ceiling override
// the preset's. Dry run by default (prints what would change); --write writes. Never commits.
//
// realized: heartbeat.yml's realized-cadence alarm. --runs is `gh run list --workflow march --event schedule --json
// createdAt,event`; the cron comes from --cron or the march.yml at --march (default .github/workflows/march.yml);
// --since (the commit that last changed the cron line) cuts the window's start. Prints one line, writes the outputs
// `realized_runs`, `realized_slots`, `realized_pct` and `realized_alarm` and the line to the step summary, and exits 3
// when the schedule delivered under --floor (default 0.4) of the slots in the last --hours (default 72); 0 otherwise,
// an unreadable input included (never a false alarm).
//
// Zero dependencies.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The five presets. `cron: null` and `heartbeatHours: null`: no schedule, nothing for the heartbeat to watch. */
export const PRESETS = Object.freeze({
  calm: Object.freeze({ cron: '17 */6 * * *', heartbeatHours: 20, ceiling: 8, chainMax: 0, idleBackoff: 3 }),
  steady: Object.freeze({ cron: '17 */3 * * *', heartbeatHours: 14, ceiling: 12, chainMax: 0, idleBackoff: 3 }),
  eager: Object.freeze({ cron: '17 */3 * * *', heartbeatHours: 10, ceiling: 20, chainMax: 3, idleBackoff: 3 }),
  sprint: Object.freeze({ cron: '17 */3 * * *', heartbeatHours: 10, ceiling: 30, chainMax: 8, idleBackoff: 3 }),
  off: Object.freeze({ cron: null, heartbeatHours: null, ceiling: 12, chainMax: 0, idleBackoff: 0 }),
});
export const CADENCES = Object.freeze(Object.keys(PRESETS));
/** What bootstrap writes on a new adoption. */
export const DEFAULT_CADENCE = 'steady';
/** The line the off preset leaves where the schedule was, so a later preset knows where to put it back. */
export const OFF_MARKER = '  # schedule: none (NEXUS_CADENCE off: dispatch and nudge only)';

/** A preset's name from a variable's value (trimmed, any case), or null for empty or unknown. */
export function presetOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return Object.hasOwn(PRESETS, s) ? s : null;
}

const whole = (v, min) => {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= min ? n : null;
};

/**
 * Each field from its own variable, else the preset, else '' (the workflow's literal or the script's default).
 * NEXUS_CHAIN_MAX and NEXUS_IDLE_BACKOFF pass through as set (chain.mjs and idle.mjs read their own values, and read
 * a bad one conservatively); the ceiling and the heartbeat hours are checked here, and a bad one falls to the next.
 */
export function resolve({ cadence, ceiling, chainMax, idleBackoff, heartbeatHours, dial } = {}) {
  const warnings = [];
  const word = String(cadence ?? '').trim();
  const set = presetOf(word);
  if (word && !set) warnings.push(`NEXUS_CADENCE ${JSON.stringify(word)} is not one of ${CADENCES.join(' | ')}: read as unset`);
  // Unset, the improvement dial's cadence stands in (scripts/plan/improve.mjs --cloud Cadence: only under an
  // `Improve:` line other than gentle); the variable always wins.
  const fromDial = set ? null : presetOf(dial);
  const name = set ?? fromDial;
  const p = name ? PRESETS[name] : null;
  const out = { cadence: name ?? '', ceiling: '', chain_max: '', idle_backoff: '', heartbeat_hours: '' };
  const from = { ceiling: '', chain_max: '', idle_backoff: '', heartbeat_hours: '' };

  const c = whole(ceiling, 1);
  if (String(ceiling ?? '').trim() && c === null) warnings.push(`NEXUS_DAILY_CEILING ${JSON.stringify(String(ceiling).trim())} is not a whole number from 1: ignored`);
  if (c !== null) [out.ceiling, from.ceiling] = [String(c), 'NEXUS_DAILY_CEILING'];
  else if (p) [out.ceiling, from.ceiling] = [String(p.ceiling), name];

  if (String(chainMax ?? '').trim()) [out.chain_max, from.chain_max] = [String(chainMax).trim(), 'NEXUS_CHAIN_MAX'];
  else if (p) [out.chain_max, from.chain_max] = [String(p.chainMax), name];

  if (String(idleBackoff ?? '').trim()) [out.idle_backoff, from.idle_backoff] = [String(idleBackoff).trim(), 'NEXUS_IDLE_BACKOFF'];
  else if (p) [out.idle_backoff, from.idle_backoff] = [String(p.idleBackoff), name];

  const hRaw = String(heartbeatHours ?? '').trim().toLowerCase();
  const h = hRaw === 'none' ? 'none' : whole(hRaw, 1);
  if (hRaw && h === null) warnings.push(`NEXUS_HEARTBEAT_HOURS ${JSON.stringify(hRaw)} is not a whole number from 1 or none: ignored`);
  if (h !== null) [out.heartbeat_hours, from.heartbeat_hours] = [String(h), 'NEXUS_HEARTBEAT_HOURS'];
  else if (p) [out.heartbeat_hours, from.heartbeat_hours] = [p.heartbeatHours === null ? 'none' : String(p.heartbeatHours), name];

  return { ...out, from, warnings, dial: Boolean(fromDial) };
}

/** The one summary line: `cadence: steady (ceiling 12, chain max 0, idle backoff 3, heartbeat 14h)`. */
export function describe(r) {
  const v = (k, unit = '') => (r[k] === '' ? 'the workflow default' : r[k] === 'none' ? 'none' : `${r[k]}${unit}`);
  const head = r.cadence ? `cadence: ${r.cadence}${r.dial ? ' (the Improve dial; NEXUS_CADENCE unset)' : ''}` : 'cadence: NEXUS_CADENCE unset';
  const over = Object.entries(r.from ?? {}).filter(([, s]) => s.startsWith('NEXUS_')).map(([, s]) => s);
  return `${head} (ceiling ${v('ceiling')}, chain max ${v('chain_max')}, idle backoff ${v('idle_backoff')}, heartbeat ${v('heartbeat_hours', 'h')})${over.length ? `; set by ${over.join(', ')}` : ''}`;
}

// ---- writing a preset into the files ---------------------------------------------------------------------------

const CRON_BLOCK = /\n {2}schedule:\n((?: {4}#.*\n)*) {4}- cron: '[^']*'\n/;
const OFF_LINE = /\n {2}# schedule: none \(NEXUS_CADENCE off[^\n]*\n/;

/** The workflow's cron line(s): null when it has no schedule. */
export function cronOf(yml) {
  const t = String(yml).replace(/\r\n/g, '\n');
  const m = CRON_BLOCK.exec(t);
  return m ? /- cron: '([^']*)'/.exec(m[0])[1] : null;
}

/**
 * The march.yml cron line set to `cron`, or (null) the schedule taken out behind OFF_MARKER. The comments above the
 * cron line stay. Returns { text, changed, found }: found false when neither the schedule nor the marker is there.
 */
export function setCron(yml, cron) {
  const t = String(yml).replace(/\r\n/g, '\n');
  const block = CRON_BLOCK.exec(t);
  const off = OFF_LINE.exec(t);
  if (!block && !off) return { text: t, changed: false, found: false };
  let text;
  if (cron === null) text = block ? t.replace(CRON_BLOCK, `\n${OFF_MARKER}\n`) : t;
  else if (block) text = t.replace(CRON_BLOCK, (_, notes) => `\n  schedule:\n${notes}    - cron: '${cron}'\n`);
  else text = t.replace(OFF_LINE, `\n  schedule:\n    - cron: '${cron}'\n`);
  return { text, changed: text !== t, found: true };
}

const CEILING_LINE = /\n( {10})ceiling=\d+\n/;

/** The ceiling step's `ceiling=<N>` literal (bootstrap's anchor) set to n. */
export function setCeiling(yml, n) {
  const t = String(yml).replace(/\r\n/g, '\n');
  if (!CEILING_LINE.test(t)) return { text: t, changed: false, found: false };
  const text = t.replace(CEILING_LINE, (_, pad) => `\n${pad}ceiling=${n}\n`);
  return { text, changed: text !== t, found: true };
}

const HOURS_LINE = /\n( +)march_hours=(?:\d+|none)\n/;

/** heartbeat.yml's `march_hours=<N>` literal (the fallback while NEXUS_CADENCE is unset) set to h (null: none). */
export function setHeartbeatHours(yml, h) {
  const t = String(yml).replace(/\r\n/g, '\n');
  if (!HOURS_LINE.test(t)) return { text: t, changed: false, found: false };
  const text = t.replace(HOURS_LINE, (_, pad) => `\n${pad}march_hours=${h === null ? 'none' : h}\n`);
  return { text, changed: text !== t, found: true };
}

/**
 * A preset written into the march.yml and heartbeat.yml texts given (either may be null). `cron` and `ceiling`
 * override the preset's (the manifest's schedule_cron and daily_ceiling). Returns the new texts and one note per
 * anchor it could not find.
 */
export function applyPreset(name, { march = null, heartbeat = null, cron, ceiling } = {}) {
  const preset = PRESETS[presetOf(name) ?? ''];
  if (!preset) throw new Error(`cadence must be one of ${CADENCES.join(' | ')} (got ${JSON.stringify(name)})`);
  const notes = [];
  const out = { march, heartbeat, notes };
  if (march !== null) {
    const c = setCron(march, cron || preset.cron);
    if (!c.found) notes.push("march.yml: no `- cron: '...'` line (or the off marker) found; the template may have drifted");
    const k = setCeiling(c.text, whole(ceiling, 1) ?? preset.ceiling);
    if (!k.found) notes.push('march.yml: no `ceiling=<N>` line found; the template may have drifted');
    out.march = k.text;
  }
  if (heartbeat !== null) {
    const h = setHeartbeatHours(heartbeat, preset.heartbeatHours);
    if (!h.found) notes.push('heartbeat.yml: no `march_hours=<N>` line found; the template may have drifted');
    out.heartbeat = h.text;
  }
  return out;
}

// ---- the realized-cadence alarm --------------------------------------------------------------------------------
//
// GitHub may throttle or drop scheduled runs: a cron can promise 24 slots a day and deliver 6. heartbeat.yml counts
// the slots march.yml's cron promised in the last 72h (UTC, as GitHub reads it) against the schedule-event runs that
// actually started, and under 40% opens one issue. Schedule events only: chains, nudges and dispatches never mask a
// throttled schedule.

/** The window heartbeat measures, and the share of promised slots under which it alarms. */
export const REALIZED_HOURS = 72;
export const REALIZED_FLOOR = 0.4;
/** A window shorter than this (a cron line changed, or march.yml was added, inside the 72h) is not measured. */
export const REALIZED_MIN_HOURS = 24;

const CRON_NAMES = {
  month: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  dow: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

function cronField(spec, min, max, names) {
  const val = (s) => {
    const i = names ? names.indexOf(s.toLowerCase()) : -1;
    const n = i >= 0 ? i + (min === 1 ? 1 : 0) : Number(s);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`cron: ${JSON.stringify(s)} is out of range ${min}-${max}`);
    return n;
  };
  const out = new Set();
  for (const part of spec.split(',')) {
    const m = /^(\*|[\w]+(?:-[\w]+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron: cannot read ${JSON.stringify(part)}`);
    const step = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) throw new Error(`cron: step ${m[2]} must be at least 1`);
    let lo;
    let hi;
    if (m[1] === '*') [lo, hi] = [min, max];
    else if (m[1].includes('-')) [lo, hi] = m[1].split('-').map(val);
    else [lo, hi] = [val(m[1]), m[2] === undefined ? val(m[1]) : max];
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** A five-field cron expression (`*`, lists, ranges, steps, month and day names), or a thrown Error. */
export function parseCron(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron: ${JSON.stringify(String(expr))} needs five fields`);
  const dow = cronField(f[4], 0, 7, CRON_NAMES.dow);
  if (dow.has(7)) dow.add(0);
  return {
    minute: cronField(f[0], 0, 59),
    hour: cronField(f[1], 0, 23),
    dom: cronField(f[2], 1, 31),
    month: cronField(f[3], 1, 12, CRON_NAMES.month),
    dow,
    domAny: f[2] === '*',
    dowAny: f[4] === '*',
  };
}

/** Whether a parsed cron fires at this UTC minute. Day of month and day of week both restricted: either matches. */
export function cronFires(c, date) {
  if (!c.minute.has(date.getUTCMinutes()) || !c.hour.has(date.getUTCHours()) || !c.month.has(date.getUTCMonth() + 1)) return false;
  const dom = c.dom.has(date.getUTCDate());
  const dow = c.dow.has(date.getUTCDay());
  if (c.domAny || c.dowAny) return dom && dow;
  return dom || dow;
}

/** The slots the cron lines promise in (fromMs, toMs]: each minute counted once, however many lines fire in it. */
export function cronSlots(crons, fromMs, toMs) {
  const parsed = crons.map(parseCron);
  let n = 0;
  for (let t = Math.floor(fromMs / 60000) * 60000 + 60000; t <= toMs; t += 60000) {
    const d = new Date(t);
    if (parsed.some((c) => cronFires(c, d))) n++;
  }
  return n;
}

/** Every `- cron: '...'` line a workflow's schedule holds (march.yml has one; a hand-edited file may have more). */
export function cronsOf(yml) {
  const t = String(yml).replace(/\r\n/g, '\n');
  const block = /\n {2}schedule:\n((?: {4}(?:#.*|- cron: .*)\n)+)/.exec(t);
  if (!block) return [];
  return [...block[1].matchAll(/- cron: ['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/**
 * The realized cadence: schedule-event runs started in the window against the slots the crons promised. The window
 * is the last `hours`, cut to start no earlier than `since` (the commit that last changed march.yml's cron line, so a
 * new cron is measured only against itself). Returns { measured, why, slots, runs, ratio, alarm, start, end }:
 * measured false (no alarm) when there is no cron, the window is under REALIZED_MIN_HOURS, or it promised nothing.
 */
export function realized({ crons, runs, now = Date.now(), since, hours = REALIZED_HOURS, floor = REALIZED_FLOOR, minHours = REALIZED_MIN_HOURS }) {
  const end = typeof now === 'number' ? now : Date.parse(now);
  let start = end - hours * 3600000;
  const s = since ? Date.parse(since) : NaN;
  if (Number.isFinite(s) && s > start) start = s;
  const base = { measured: false, alarm: false, slots: 0, runs: 0, ratio: null, start, end, hours, floor };
  if (!crons?.length) return { ...base, why: 'no schedule in march.yml - nothing to measure' };
  if (end - start < minHours * 3600000) {
    return { ...base, why: `the cron line changed ${new Date(start).toISOString()}, under ${minHours}h ago - measured once ${minHours}h have passed` };
  }
  const slots = cronSlots(crons, start, end);
  const count = (runs ?? []).filter((r) => {
    if (r?.event && r.event !== 'schedule') return false;
    const t = Date.parse(r?.createdAt ?? '');
    return t > start && t <= end;
  }).length;
  if (!slots) return { ...base, runs: count, why: 'the cron promised no slot in the window - nothing to measure' };
  const ratio = count / slots;
  return { ...base, measured: true, slots, runs: count, ratio, alarm: ratio < floor, why: '' };
}

/** The one line: `march realized cadence: 18 of 72 promised slots ran in 72h (25%, alarm under 40%; cron '0 * * * *')`. */
export function describeRealized(r, crons = []) {
  const cron = crons.length ? `; cron ${crons.map((c) => `'${c}'`).join(', ')}` : '';
  if (!r.measured) return `march realized cadence: not measured (${r.why})`;
  const h = Math.round((r.end - r.start) / 3600000);
  return `march realized cadence: ${r.runs} of ${r.slots} promised slots ran in ${h}h (${Math.round(r.ratio * 100)}%, alarm under ${Math.round(r.floor * 100)}%${cron})`;
}

// ---- the command -----------------------------------------------------------------------------------------------

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (!m) out._.push(rest[i]);
    else if (m[1] === 'write') out.write = true;
    else out[m[1]] = rest[++i] ?? '';
  }
  return out;
}

const USAGE = 'usage: node scripts/cloud/cadence.mjs resolve [--cadence <word>] [--dial <word>] [--ceiling <N>] [--chain-max <N>] [--idle-backoff <N>] [--heartbeat-hours <N|none>] | apply <word> [--march <path>] [--heartbeat <path>] [--cron <expr>] [--ceiling <N>] [--write] | realized --runs <file> [--march <path> | --cron <expr>] [--since <ISO>] [--now <ISO>] [--hours <N>] [--floor <0..1>] | show';

export function main(argv, { env = process.env, log = console.log, warn = console.error } = {}) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  if (cmd === 'show') {
    log('| Preset | Cron written | Heartbeat h | Ceiling | Chain max | Idle backoff |');
    log('|---|---|---|---|---|---|');
    for (const [n, p] of Object.entries(PRESETS)) {
      log(`| ${n} | ${p.cron ?? 'no schedule'} | ${p.heartbeatHours ?? 'none'} | ${p.ceiling} | ${p.chainMax} | ${p.idleBackoff} |`);
    }
    return 0;
  }
  if (cmd === 'resolve' && !f._.length) {
    const r = resolve({ cadence: f.cadence, ceiling: f.ceiling, chainMax: f['chain-max'], idleBackoff: f['idle-backoff'], heartbeatHours: f['heartbeat-hours'], dial: f.dial });
    for (const w of r.warnings) warn(`cadence: ${w}`);
    const line = describe(r);
    log(line);
    const outputs = ['cadence', 'ceiling', 'chain_max', 'idle_backoff', 'heartbeat_hours'].map((k) => `${k}=${String(r[k]).replace(/[\r\n]+/g, ' ')}`);
    try {
      if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, outputs.join('\n') + '\n');
    } catch {}
    try {
      if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n');
    } catch {}
    return 0;
  }
  if (cmd === 'realized' && !f._.length) {
    let crons;
    if (f.cron) crons = [f.cron];
    else {
      const p = f.march || '.github/workflows/march.yml';
      if (!fs.existsSync(p)) {
        log(`march realized cadence: not measured (no ${p})`);
        return 0;
      }
      crons = cronsOf(fs.readFileSync(p, 'utf8'));
    }
    let runs;
    try {
      runs = JSON.parse(fs.readFileSync(f.runs, 'utf8'));
      if (!Array.isArray(runs)) throw new Error('not a JSON array');
    } catch (e) {
      log(`march realized cadence: not measured (cannot read the run list ${f.runs || '(no --runs)'}: ${e.message})`);
      return 0;
    }
    const num = (v, d) => (v === undefined || String(v).trim() === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const at = f.now ? Date.parse(f.now) : NaN;
    let r;
    try {
      r = realized({ crons, runs, now: Number.isFinite(at) ? at : Date.now(), since: f.since, hours: num(f.hours, REALIZED_HOURS), floor: num(f.floor, REALIZED_FLOOR) });
    } catch (e) {
      log(`march realized cadence: not measured (${e.message})`);
      return 0;
    }
    const line = describeRealized(r, crons);
    log(line);
    const pct = r.ratio === null ? '' : String(Math.round(r.ratio * 100));
    try {
      if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `realized_runs=${r.runs}\nrealized_slots=${r.slots}\nrealized_pct=${pct}\nrealized_alarm=${r.alarm}\n`);
    } catch {}
    try {
      if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n');
    } catch {}
    return r.alarm ? 3 : 0;
  }
  if (cmd === 'apply' && f._.length === 1) {
    const read = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
    const marchPath = f.march || '.github/workflows/march.yml';
    const hbPath = f.heartbeat || '.github/workflows/heartbeat.yml';
    const before = { march: read(marchPath), heartbeat: read(hbPath) };
    if (before.march === null && before.heartbeat === null) {
      warn(`cadence: neither ${marchPath} nor ${hbPath} exists`);
      return 1;
    }
    let r;
    try {
      r = applyPreset(f._[0], { ...before, cron: f.cron, ceiling: f.ceiling });
    } catch (e) {
      warn(`cadence: ${e.message}`);
      return 2;
    }
    for (const n of r.notes) warn(`cadence: ${n}`);
    for (const [key, p] of [['march', marchPath], ['heartbeat', hbPath]]) {
      if (before[key] === null) continue;
      const same = r[key] === before[key].replace(/\r\n/g, '\n');
      if (same) log(`${p}: already ${f._[0]}`);
      else if (f.write) {
        fs.writeFileSync(p, r[key]);
        log(`${p}: wrote the ${f._[0]} preset (commit it; then gh variable set NEXUS_CADENCE --body ${presetOf(f._[0])})`);
      } else log(`${p}: would write the ${f._[0]} preset (dry run; --write writes)`);
    }
    return 0;
  }
  warn(USAGE);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    // resolve never fails a tick: an error here leaves every field to the workflow's own default.
    console.error(`cadence: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 0;
  }
}
