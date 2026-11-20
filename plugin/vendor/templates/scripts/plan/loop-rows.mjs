// scripts/plan/loop-rows.mjs: /iterate's dimension I, the loop itself. Its rows turn one lever, at most one ships a week.
//
// Dimension I audits how the loop runs, not what it builds: the motion pulse (`node scripts/pulse.mjs --motion`) and
// the tick summaries' no-op, ceiling-skip and support-latency lines. Its findings are tunings, filed in
// plan/AUDIT.md (skills/iterate.md, dimension I):
//
//   ### [I, <score>] <line>
//   - category: loop-config
//   - impact: <0-10>, ease: <0-6>
//   - evidence: <the pulse or summary line it read>
//   - next: <ONE lever: a repo variable (NEXUS_CADENCE, ...) or a plan/bearings.md line (`stall_action`, ...)>
//
// Ease is capped at 6, so a tuning never outscores real work on ease alone. A tuning that needs a YAML edit (a
// workflow's cron or literal) is never made: its row reads `### [I, <score>] [needs-user-call] <line>`, its next names
// the file, and it carries a lock line (`- lock: <slug> · since: <date> · until: <condition> · max_age: <n>d`) that
// scripts/plan/locks.mjs ages. A shipped row reads `### [x] [I, <score>] <line> — closed <YYYY-MM-DD>`, and at most
// one ships per 7 days.
//
// `loop: on | off` in plan/bearings.md (under `## Plan expansion posture`) turns the dimension on; a missing line
// takes the improvement dial's (`Improve:`, scripts/plan/improve.mjs: steady and bold on), and with no dial line
// reads `off`, so an upgraded repo stays as it was until its owner opts in.
//
//   node scripts/plan/loop-rows.mjs check  [--file plan/AUDIT.md]
//   node scripts/plan/loop-rows.mjs status [--file plan/AUDIT.md] [--today YYYY-MM-DD]
//
// `check` prints one line per breach and `<n> breaches`, or `clean (<n> I rows)`; exit 1 on a breach. `status` prints
// `loop: on|off (<why>)` and `ship: room` or `ship: wait until <date> (last shipped <date>)`; exit 0. 64 on bad
// usage. Text only: nothing runs, nothing is fetched.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLock } from '../plan-check.mjs';
import { addDays, daysBetween, today } from './promote.mjs';
import { knobOf } from './improve.mjs';

export const CATEGORY = 'loop-config';
export const EASE_CAP = 6;
export const SHIP_DAYS = 7;
/** The repo variables the loop reads (cadence presets, the quota governor, chaining, idle skip, Support). */
export const REPO_VARS = Object.freeze([
  'NEXUS_CADENCE', 'NEXUS_CHAIN_MAX', 'NEXUS_QUOTA_MAX', 'NEXUS_IDLE_BACKOFF', 'NEXUS_IDLE_WAKE_EVERY',
  'NEXUS_HEARTBEAT_HOURS', 'NEXUS_DAILY_CEILING', 'NEXUS_SUPPORT',
]);
/** The plan/bearings.md lines a loop-config row may turn (a `## Generators` line counts too). */
export const BEARINGS_KEYS = Object.freeze([
  'Promote', 'promote_after_days', 'promote_floor', 'promote_per_week', 'veto_days', 'pending_cap',
  'Motion floor', 'stall_action', 'Lock max age', 'Lanes off', 'Support', 'sla_hours', 'escalate_days', 'asap_cap',
]);

const HEAD = /^### (?:\[[ x]\] )?\[I, ?(\d+(?:\.\d+)?)\]\s*(.*)$/i;
const ASK = /^\[needs-user-call\]\s*/i;
const CLOSED = /\bclosed (\d{4}-\d{2}-\d{2})\b/;
const YAML = /\.ya?ml\b/i;
const VAR = /\bNEXUS_[A-Z0-9_]+\b/g;
const GENERATOR = /^-?\s*([\w-]+) · (?:tick|daily|weekly|\d+d) · target \d+ · cap \d+\/wk$/;

/** The I rows in an audit file: [{ line, heading, score, title, ask, done, pending, closed, fields }] (1-based). */
export function parseRows(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  let section = '';
  let row = null;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) fence = !fence;
    if (fence) continue;
    if (/^#{1,3} /.test(l)) {
      row = null;
      if (/^## /.test(l)) section = l.slice(3).trim();
      const m = HEAD.exec(l);
      if (!m) continue;
      const done = /^### \[x\]/i.test(l) || /^Done\b/.test(section);
      const title = m[2].trim();
      row = {
        line: i + 1, heading: l, score: Number(m[1]), title: title.replace(ASK, ''), ask: ASK.test(title), done,
        pending: !done && /^Pending\b/.test(section), closed: CLOSED.exec(l)?.[1] ?? null, fields: {},
      };
      rows.push(row);
      continue;
    }
    if (!row) continue;
    const f = /^- ([\w-]+):\s*(.*)$/.exec(l);
    if (f) {
      row.key = f[1];
      row.fields[f[1]] = f[2];
    } else if (row.key && /^\s+\S/.test(l)) row.fields[row.key] += ` ${l.trim()}`;
  }
  return rows;
}

/** The levers a row's `next` names: repo variables, and backticked plan/bearings.md lines. { levers, unknown }. */
export function levers(next = '') {
  const found = new Set();
  const unknown = new Set();
  for (const v of next.match(VAR) ?? []) (REPO_VARS.includes(v) ? found : unknown).add(v);
  if (/plan\/bearings\.md/.test(next)) {
    for (const [, inner] of next.matchAll(/`([^`]+)`/g)) {
      const gen = GENERATOR.exec(inner.trim());
      if (gen) {
        found.add(`generator ${gen[1]}`);
        continue;
      }
      const key = inner.replace(/^-\s*/, '').replace(/\*\*/g, '').split(':')[0].trim();
      const hit = BEARINGS_KEYS.find((k) => k.toLowerCase() === key.toLowerCase());
      if (hit) found.add(hit);
    }
  }
  return { levers: [...found], unknown: [...unknown] };
}

/** A row's ease, from `- ease: n` or `- impact: n, ease: n`; null when it names none. */
export function easeOf(fields = {}) {
  const m = /\bease:\s*(\d+(?:\.\d+)?)/.exec(Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(' \n'));
  return m ? Number(m[1]) : null;
}

/** The shipped I rows (ticked, not an owner's ask), newest close first. */
export function shipped(rows) {
  return rows.filter((r) => r.done && !r.ask && r.closed).sort((a, b) => b.closed.localeCompare(a.closed));
}

/** May an I row ship today? { room, last, until }. */
export function room(rows, date = today()) {
  const last = shipped(rows)[0]?.closed ?? null;
  if (!last || daysBetween(last, date) >= SHIP_DAYS) return { room: true, last, until: null };
  return { room: false, last, until: addDays(last, SHIP_DAYS) };
}

/**
 * `loop:` through the improvement dial (scripts/plan/improve.mjs): on | off from its own line in plan/bearings.md,
 * else the `Improve:` dial's (steady and bold: on); no line and no dial line reads off.
 */
export function loopOn(bearings = '') {
  const k = knobOf(bearings, 'loop', { vars: {} });
  if (k.from === 'bearings') return { on: k.value === 'on', why: `loop: ${k.value}` };
  if (k.improve.source === 'bearings') return { on: k.value === 'on', why: `Improve: ${k.improve.value} sets loop ${k.value}` };
  return { on: false, why: 'no loop line in plan/bearings.md' };
}

/** The breaches in an audit file's text, `rel` naming it. */
export function checkRows(text, rel = 'plan/AUDIT.md') {
  const problems = [];
  const rows = parseRows(text);
  for (const r of rows) {
    const at = `${rel}:${r.line}`;
    if (r.done) {
      if (!r.ask && !r.closed) problems.push(`${at}: a shipped I row ends "— closed <YYYY-MM-DD>" (the 7-day rule reads it)`);
      continue; // a closed row keeps what it said when it shipped
    }
    if (r.fields.category !== CATEGORY) problems.push(`${at}: an I row's category is ${CATEGORY}`);
    if (!r.fields.evidence) problems.push(`${at}: an I row's evidence quotes the pulse or tick-summary line it read`);
    const ease = easeOf(r.fields);
    if (ease === null) problems.push(`${at}: an I row scores its ease (at most ${EASE_CAP})`);
    else if (ease > EASE_CAP) problems.push(`${at}: ease ${ease} over the cap of ${EASE_CAP}: tuning never crowds out real work`);
    const next = r.fields.next ?? '';
    const { levers: found, unknown } = levers(next);
    for (const v of unknown) problems.push(`${at}: ${v} is not a repo variable the loop reads (${REPO_VARS.join(', ')})`);
    if (r.ask) {
      if (!YAML.test(next)) problems.push(`${at}: a [needs-user-call] I row's next names the YAML file the owner edits`);
      const lock = r.fields.lock ? parseLock(`lock: ${r.fields.lock}`) : null;
      if (!lock?.slug || !lock.since || !lock.until) problems.push(`${at}: a [needs-user-call] I row carries "- lock: <slug> · since: <date> · until: <condition> · max_age: <n>d"`);
      continue;
    }
    if (YAML.test(next)) problems.push(`${at}: a tuning that edits YAML is filed "### [I, <score>] [needs-user-call] ...", never made`);
    else if (found.length === 0) problems.push(`${at}: next names no lever: one repo variable (${REPO_VARS.join(', ')}) or one backticked plan/bearings.md line`);
    else if (found.length > 1) problems.push(`${at}: next turns ${found.length} levers (${found.join(', ')}); a loop-config row turns one`);
  }
  const ships = shipped(rows);
  for (let i = 0; i + 1 < ships.length; i++) {
    const gap = daysBetween(ships[i + 1].closed, ships[i].closed);
    if (gap < SHIP_DAYS) problems.push(`${rel}:${ships[i].line}: shipped ${gap}d after the I row at line ${ships[i + 1].line}; at most one ships per ${SHIP_DAYS} days`);
  }
  return { problems, rows: rows.length };
}

const USAGE = 'usage: node scripts/plan/loop-rows.mjs check|status [--file plan/AUDIT.md] [--today YYYY-MM-DD]';

export function main(argv, { root = process.cwd(), log = console.log } = {}) {
  const [cmd, ...rest] = argv;
  const opts = { file: 'plan/AUDIT.md', today: today() };
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i]?.replace(/^--/, '');
    if (!['file', 'today'].includes(k) || !rest[i + 1] || (cmd === 'check' && k === 'today')) return (console.error(USAGE), 64);
    opts[k] = rest[i + 1];
  }
  if (!['check', 'status'].includes(cmd) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) return (console.error(USAGE), 64);
  const abs = path.resolve(root, opts.file);
  const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
  if (cmd === 'status') {
    const bearings = path.join(root, 'plan/bearings.md');
    const on = loopOn(fs.existsSync(bearings) ? fs.readFileSync(bearings, 'utf-8') : '');
    const r = room(parseRows(text), opts.today);
    log(`loop: ${on.on ? 'on' : 'off'} (${on.why})`);
    log(r.room ? `ship: room${r.last ? ` (last shipped ${r.last})` : ''}` : `ship: wait until ${r.until} (last shipped ${r.last})`);
    return 0;
  }
  if (!text) {
    log(`clean (no ${opts.file})`);
    return 0;
  }
  const { problems, rows } = checkRows(text, opts.file);
  for (const p of problems) log(p);
  log(problems.length ? `${problems.length} breach${problems.length === 1 ? '' : 'es'}` : `clean (${rows} I row${rows === 1 ? '' : 's'})`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
