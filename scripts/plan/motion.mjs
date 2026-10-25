// scripts/plan/motion.mjs: the motion pulse (does the loop still ship?) and the heartbeat's motion alarm.
//
// Liveness says a tick ran; motion says it shipped. A shipped unit is a commit whose verb is `feat`, `fix` or
// `content` (a `(scope)` is stripped), plus a chunk close in plan/ARCHIVE.md (`- <date> · <NN.k> · …`). Every other
// verb (audit, digest, expand, critique, triage, plan, jot, docs, ci, …) is housekeeping and never counts. Units are
// counted per ISO week (Monday to Sunday, UTC).
//
// The judged week is the last full ISO week, against the trailing baseline: the mean of the 4 full weeks before it.
// The floor is `Motion floor` (plan/bearings.md, a percent of that baseline; 50% when absent, 0% turns the alarm
// off). The judged week is `stalled` when it shipped under the floor, or shipped nothing for five weeks running after
// shipping before; the week in progress clears a stall as soon as it reaches the floor (at least one unit). A repo
// that never shipped reads `ok`. Judging a full week keeps a quiet Monday from alarming.
//
// The idle-tick ratio stays offline too: with --runs <file> (the JSON of `gh run list --workflow march --json
// databaseId,conclusion,createdAt,url`), the successful runs of the last 7 days whose run id no `Cloud-Run:` trailer
// names are idle ticks.
//
//   node scripts/plan/motion.mjs report [--runs <file>] [--today YYYY-MM-DD] [--json]   (what pulse --motion prints)
//   node scripts/plan/motion.mjs alarm [--runs <file>] [--today YYYY-MM-DD]             (heartbeat.yml)
//   node scripts/plan/motion.mjs react                                                  (/march Step 0.5)
//
// `report` prints three lines: `shipped <n> / baseline <mean> · …`, `floor <n> · ok|stalled (…)` and, with --runs,
// `idle ticks <pct>% (…)`. `alarm` prints the same, then acts under `stall_action` (plan/bearings.md: alert, the
// default | promote | off): below the floor it opens the ONE `Heartbeat: motion stalled` issue (labels loop:opened and
// loop:stall; deduped while one is open) and, under alert, calls scripts/notify.mjs when the repo has it; a week that
// recovers closes the open one. `react` is the tick's half: with a motion-stall issue open it prints `promote #N`
// (stall_action promote under Promote aged or autonomous: run expand §6 aged promotion now), `alert #N` (promote under
// Promote owner falls back to the alert) or `off`; with none open, `none`. gh is read only, except alarm's issue
// writes; under stall_action off the alarm closes a stall issue left open. Always exit 0 (a report and an alarm,
// never a gate); 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { knobs } from './promote.mjs';
import { knobOf } from './improve.mjs';

export const SHIP_VERBS = Object.freeze(['feat', 'fix', 'content']);
export const BASELINE_WEEKS = 4;
export const FLOOR_PCT = 50;
export const STALL_ACTIONS = Object.freeze(['alert', 'promote', 'off']);
export const STALL_TITLE = 'Heartbeat: motion stalled';
export const STALL_LABEL = 'loop:stall';
export const OPENED_LABEL = 'loop:opened';
/** The workflow token's author login: the only author whose unlabelled stall issue counts. */
export const STALL_AUTHOR = 'app/github-actions';
const DAY = 86400000;

export const today = () => new Date().toISOString().slice(0, 10);
const toMs = (date) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date, n) => fromMs(toMs(date) + n * DAY);
const round = (n) => Math.round(n * 100) / 100;

/** The Monday (UTC) that opens the ISO week holding `date`. */
export function mondayOf(date) {
  const dow = (new Date(toMs(date)).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

/** The ISO week key, `2026-W43`, of `date`. */
export function weekKey(date) {
  const thursday = addDays(mondayOf(date), 3);
  const year = thursday.slice(0, 4);
  const week = 1 + Math.floor((toMs(thursday) - toMs(mondayOf(`${year}-01-04`))) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Whether a commit subject ships: `feat:`, `fix(scope):`, `content!:` … */
export function ships(subject = '') {
  const m = /^([a-z]+)(?:\([^)]*\))?!?:/.exec(subject.trim());
  return Boolean(m && SHIP_VERBS.includes(m[1]));
}

/** The chunk-close dates in plan/ARCHIVE.md: `- <date> · <NN.k> · …` lines (spec-complete and veto lines are not chunks). */
export function archiveCloses(text = '') {
  const out = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^- (\d{4}-\d{2}-\d{2}) · \d+\.\d+[a-z]? · /.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

const keyLine = (bearings, key) =>
  new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${key}[*\`]*[ \\t]*:[*\`]*[ \\t]*[*\`]*([^\\s*\`]+)`, 'mi').exec(bearings);

/** `Motion floor` from plan/bearings.md text, a percent of the baseline (50 when absent or unreadable). */
export function floorPct(bearings = '') {
  const m = keyLine(bearings, 'Motion floor');
  const n = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : FLOOR_PCT;
}

/**
 * `stall_action` through the improvement dial (scripts/plan/improve.mjs): alert | promote | off from its own line in
 * plan/bearings.md, else the `Improve:` dial's (alert with no dial line).
 */
export function stallAction(bearings = '') {
  const v = knobOf(bearings, 'stall_action', { vars: {} }).value;
  return STALL_ACTIONS.includes(v) ? v : 'alert';
}

/**
 * What follows a stall: { action: alert | promote | off, why }. `promote` needs a Promote knob that promotes (aged or
 * autonomous); under `Promote: owner` it falls back to `alert`.
 */
export function effectiveAction(bearings = '') {
  const want = stallAction(bearings);
  const promote = knobs(bearings).promote;
  if (want === 'promote' && promote === 'owner') return { action: 'alert', why: 'stall_action promote under Promote: owner falls back to alert' };
  return { action: want, why: `stall_action ${want}${want === 'promote' ? `, Promote: ${promote}` : ''}` };
}

/**
 * The motion report. `units` is every shipped unit's date (YYYY-MM-DD); `runs` the parsed `gh run list` JSON (or
 * null) and `cloudRuns` the run ids named by `Cloud-Run:` trailers.
 */
export function report({ units = [], date = today(), pct = FLOOR_PCT, runs = null, cloudRuns = new Set() } = {}) {
  const current = mondayOf(date);
  const judged = addDays(current, -7);
  const weeks = [];
  for (let k = BASELINE_WEEKS; k >= 1; k--) weeks.push(addDays(judged, -7 * k));
  const count = (from) => units.filter((d) => d >= from && d < addDays(from, 7)).length;
  const shipped = count(judged);
  const sofar = units.filter((d) => d >= current && d <= date).length;
  const series = weeks.map(count);
  const baseline = round(series.reduce((a, b) => a + b, 0) / BASELINE_WEEKS);
  const floor = round((pct / 100) * baseline);
  const history = units.some((d) => d < current);
  let verdict = 'ok';
  let why;
  if (pct <= 0) why = 'Motion floor 0%: the alarm is off';
  else if (!history) why = 'nothing shipped yet to measure against';
  else if (sofar >= Math.max(floor, 1)) why = `${weekKey(current)} already reaches the floor`;
  else if (shipped < floor) {
    verdict = 'stalled';
    why = `${shipped} is under ${pct}% of the baseline`;
  } else if (shipped === 0 && baseline === 0) {
    verdict = 'stalled';
    why = `nothing shipped in ${BASELINE_WEEKS + 1} full weeks`;
  } else why = `${pct}% of the baseline`;
  let idle = null;
  if (runs) {
    const end = toMs(date) + DAY;
    const recent = (Array.isArray(runs) ? runs : []).filter((r) => {
      const at = Date.parse(r?.createdAt ?? '');
      return (r?.conclusion ?? 'success') === 'success' && at < end && at >= end - 7 * DAY;
    });
    const ids = recent.map((r) => String(r.databaseId ?? /\/runs\/(\d+)/.exec(r.url ?? '')?.[1] ?? ''));
    const n = ids.filter((id) => !cloudRuns.has(id)).length;
    idle = { idle: n, total: recent.length, pct: recent.length ? Math.round((n / recent.length) * 100) : null };
  }
  return {
    week: weekKey(judged),
    from: weekKey(weeks[0]),
    to: weekKey(weeks[weeks.length - 1]),
    current: weekKey(current),
    shipped,
    sofar,
    series,
    baseline,
    pct,
    floor,
    verdict,
    why,
    idle,
  };
}

/** The report as the three lines pulse --motion prints (two without runs). */
export function lines(r) {
  const out = [
    `shipped ${r.shipped} / baseline ${r.baseline} · ${r.week} against ${r.from}..${r.to} (${r.sofar} so far in ${r.current})`,
    `floor ${r.floor} · ${r.verdict} (${r.why})`,
  ];
  if (r.idle) {
    out.push(r.idle.total
      ? `idle ticks ${r.idle.pct}% (${r.idle.idle}/${r.idle.total} successful march runs in 7 days shipped no Cloud-Run commit)`
      : 'idle ticks n/a (no successful march run in 7 days)');
  }
  return out;
}

// ---- reading the repo ------------------------------------------------------------------------------------------

function gitLog(root) {
  return (args) => {
    const r = spawnSync('git', ['log', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60000 });
    if (r.status !== 0) throw new Error(`git log failed: ${(r.stderr || '').trim().split('\n')[0] || 'not a git checkout?'}`);
    return r.stdout ?? '';
  };
}

/** Shipped-unit dates from the history (`git log`) and plan/ARCHIVE.md. */
export function unitsOf(log, archive = '') {
  const units = [];
  for (const rec of log.split('\x1e')) {
    const [iso, subject] = rec.replace(/^\s+/, '').split('\x1f');
    if (!iso || subject === undefined) continue;
    const ms = Date.parse(iso.trim());
    if (Number.isFinite(ms) && ships(subject)) units.push(fromMs(ms));
  }
  return [...units, ...archiveCloses(archive)];
}

/** The run ids `Cloud-Run: <run-url>` trailers name. */
export function cloudRunIds(bodies = '') {
  return new Set([...bodies.matchAll(/^Cloud-Run:\s*\S*?\/runs\/(\d+)/gm)].map((m) => m[1]));
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

/** The report for the repo at `root`. */
export function measure(root, { date = today(), runsFile = null, log = gitLog(root) } = {}) {
  const bearings = readSafe(path.join(root, 'plan', 'bearings.md'));
  const units = unitsOf(log(['--format=%x1e%cI%x1f%s']), readSafe(path.join(root, 'plan', 'ARCHIVE.md')));
  let runs = null;
  let cloudRuns = new Set();
  if (runsFile) {
    runs = JSON.parse(fs.readFileSync(path.resolve(root, runsFile), 'utf8'));
    cloudRuns = cloudRunIds(log([`--since=${addDays(date, -9)}T00:00:00Z`, '--format=%B']));
  }
  return report({ units, date, pct: floorPct(bearings), runs, cloudRuns });
}

// ---- gh --------------------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

/**
 * The open motion-stall issue ({ number, title }); null when none, or when gh cannot say. Issue text is untrusted:
 * one counts only with the loop:stall label (only triage-level users set one) or, the unlabelled fallback, when the
 * workflow's own token opened it.
 */
export function findStall(run) {
  for (const [args, trusted] of [
    [['issue', 'list', '--state', 'open', '--label', STALL_LABEL, '--json', 'number,title', '--limit', '5'], () => true],
    [
      ['issue', 'list', '--state', 'open', '--author', STALL_AUTHOR, '--search', `in:title "${STALL_TITLE}"`, '--json', 'number,title,author', '--limit', '5'],
      (i) => i?.author?.login === STALL_AUTHOR,
    ],
  ]) {
    const r = run('gh', args);
    if (!r.ok) continue;
    try {
      const list = JSON.parse(r.stdout || '[]').filter((i) => String(i.title).startsWith(STALL_TITLE) && trusted(i));
      if (list.length) return list.sort((a, b) => a.number - b.number)[0];
    } catch {}
  }
  return null;
}

/** The stall issue's body: the report, what counts, and what follows. */
export function stallBody(r, follow, promote) {
  const next = {
    alert: 'the alert: this issue, scripts/notify.mjs when the repo has it, and a line in the next digest.',
    promote: `the next march tick runs expand's aged promotion (§6, Promote: ${promote}): one aged candidate promotes behind the Held veto window, under the weekly cap.`,
  }[follow.action];
  return [
    `The last full week shipped under the motion floor, so the loop runs but ships little or nothing.`,
    ['```', ...lines(r), '```'].join('\n'),
    'A shipped unit is a feat, fix or content commit, or a chunk close in plan/ARCHIVE.md (scripts/plan/motion.mjs). Ticks that only audit, digest, expand, critique, triage, plan or jot do not count.',
    `What follows (${follow.why}): ${next}`,
    'The heartbeat closes this issue when a week recovers. Tune it in plan/bearings.md: Motion floor, stall_action.',
  ].join('\n\n');
}

/**
 * The alarm's decision: { do: open | close | keep | none | off | retire, issue }. `open` is the open stall issue (or
 * null). Under stall_action off an issue opened before the switch is retired (closed), so none outlives the knob.
 */
export function decide(r, follow, open) {
  if (follow.action === 'off') return { do: open ? 'retire' : 'off', issue: open };
  if (r.verdict === 'stalled') return { do: open ? 'keep' : 'open', issue: open };
  return { do: open ? 'close' : 'none', issue: open };
}

function alarmCmd(f, { root, run, log, measureFn }) {
  const bearings = readSafe(path.join(root, 'plan', 'bearings.md'));
  let r;
  try {
    r = measureFn(root, { date: f.today ?? today(), runsFile: f.runs ?? null });
  } catch (e) {
    log(`motion unreadable (${e instanceof Error ? e.message.split('\n')[0] : e}); no alarm`);
    return 0;
  }
  for (const l of lines(r)) log(l);
  const follow = effectiveAction(bearings);
  let open = null;
  try {
    open = findStall(run);
  } catch {
    open = null;
  }
  const d = decide(r, follow, open);
  if (d.do === 'off') log('motion: stall_action off, no alarm');
  else if (d.do === 'retire') {
    const c = run('gh', ['issue', 'close', String(open.number), '--comment', 'stall_action off in plan/bearings.md: the heartbeat files no motion alarm, so this one closes.']);
    log(c.ok ? `motion: stall_action off; closed #${open.number}` : `motion: stall_action off; could not close #${open.number}`);
  }
  else if (d.do === 'keep') log(`motion: stalled; #${open.number} is already open`);
  else if (d.do === 'none') log('motion: ok');
  else if (d.do === 'close') {
    const c = run('gh', ['issue', 'close', String(open.number), '--comment', `Motion recovered: ${lines(r).slice(0, 2).join('; ')}.`]);
    log(c.ok ? `motion: recovered; closed #${open.number}` : `motion: recovered; could not close #${open.number}`);
  } else {
    const body = stallBody(r, follow, knobs(bearings).promote);
    run('gh', ['label', 'create', OPENED_LABEL, '--color', 'EDEDED', '--description', 'Opened by the loop itself; triage skips it', '--force']);
    run('gh', ['label', 'create', STALL_LABEL, '--color', 'FBCA04', '--description', 'The heartbeat saw the loop stop shipping', '--force']);
    let c = run('gh', ['issue', 'create', '--title', STALL_TITLE, '--body', body, '--label', OPENED_LABEL, '--label', STALL_LABEL]);
    if (!c.ok) c = run('gh', ['issue', 'create', '--title', STALL_TITLE, '--body', body]);
    log(c.ok ? `motion: stalled; opened "${STALL_TITLE}" (${follow.why})` : `motion: stalled; could not open the issue (${(c.stderr || '').trim().split('\n')[0]})`);
    if (follow.action === 'alert') {
      if (fs.existsSync(path.join(root, 'scripts', 'notify.mjs'))) {
        run('node', [path.join(root, 'scripts', 'notify.mjs'), '--title', STALL_TITLE, '--body', lines(r).slice(0, 2).join('; '), '--priority', 'high']);
        log('motion: notify.mjs called');
      } else log('motion: no scripts/notify.mjs; the issue is the alert');
    }
  }
  return 0;
}

function reactCmd(f, { root, run, log }) {
  const follow = effectiveAction(readSafe(path.join(root, 'plan', 'bearings.md')));
  let open = null;
  try {
    open = findStall(run);
  } catch {
    open = null;
  }
  if (!open) log('none: no open motion-stall issue');
  else if (follow.action === 'off') log(`off #${open.number} (stall_action off)`);
  else log(`${follow.action} #${open.number} (${follow.why})`);
  return 0;
}

export const USAGE = 'usage: motion.mjs report|alarm [--runs <file>] [--today YYYY-MM-DD] [--json] | react';

function flags(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([\w-]+)$/.exec(rest[i]);
    if (m && m[1] === 'json') out.json = true;
    else if (m) out[m[1]] = rest[++i];
    else out._.push(rest[i]);
  }
  return out;
}

export function main(argv, { root = process.cwd(), run = shRun, log = console.log, measureFn = measure } = {}) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  const bad = f._.length || Object.keys(f).some((k) => !['_', 'json', 'runs', 'today'].includes(k)) || (f.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f.today ?? '')) || ('runs' in f && !f.runs);
  if (!['report', 'alarm', 'react'].includes(cmd) || bad) {
    console.error(USAGE);
    return 64;
  }
  if (cmd === 'react') return reactCmd(f, { root, run, log });
  if (cmd === 'alarm') return alarmCmd(f, { root, run, log, measureFn });
  let r;
  try {
    r = measureFn(root, { date: f.today ?? today(), runsFile: f.runs ?? null });
  } catch (e) {
    log(`motion unreadable (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 0;
  }
  if (f.json) log(JSON.stringify(r, null, 2));
  else for (const l of lines(r)) log(l);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 0;
  }
}
