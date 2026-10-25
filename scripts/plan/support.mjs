// scripts/plan/support.mjs: how hard the loop works an issue, and whether the tick keeps going after triage.
//
// The knob is `Support:` in plan/bearings.md (`off | triage-only | fix-small | fix-all`), and the repo variable
// NEXUS_SUPPORT when the tick's environment carries it: the variable wins, and a disagreement is printed as a note.
// With neither, the improvement dial sets it (`Improve:`, scripts/plan/improve.mjs, which reads all three); no dial
// line reads `triage-only`: triage routes as it always has (an AUDIT row per bug). `off` routes the same way;
// it only means no event ticks.
//
//   level    triage-only    fix-small                   fix-all
//   bug      stock (AUDIT)  bug (skills/bug.md)         bug
//   enh.     stock          stock                       bug (bug.md's fix-now test; a scope or taste call: needs-user)
//
// `bug` routes the issue to skills/bug.md: reproduce, then fix it now (`/plot asap … and do`) or, when it is larger,
// `/plot asap` into the Asap lane while fewer than `asap_cap` (bearings, 3) issue-born Asap chunks are open; past the
// cap it is an AUDIT row, as today. Only a collaborator's issue (author association OWNER, MEMBER or COLLABORATOR)
// routes to `bug`; NEXUS_SUPPORT_TRUST=everyone lifts every author, and the owner's `loop:do` label lifts one issue.
// An issue carrying the `support` label reads as a bug. An issue-born Asap chunk is a lane line or chunk title that
// names its issue (`- 54.9 (#91)`, `… (#91) · S · …`).
//
//   node scripts/plan/support.mjs level [--json]
//   node scripts/plan/support.mjs route <N> --kind <class> [--association A --labels a,b] [--json]   # gh read only
//   node scripts/plan/support.mjs cap [--json]          # issue-born Asap chunks open against asap_cap: room | full
//   node scripts/plan/support.mjs asap                  # ready | none: whether the next pick is an Asap chunk
//   node scripts/plan/support.mjs start                 # march Step 0: stamp the tick start in <git dir>/nexus-tick-start
//   node scripts/plan/support.mjs continue --routed fix|asap|none [--started <iso>] [--budget <min>] [--now <iso>]
//   node scripts/plan/support.mjs sla [--json] [--issues <file>] [--now <iso>]   # march Step 1.5 (gh read only)
//   node scripts/plan/support.mjs age [--base <score> --opened <iso>] [--issues <file>] [--now <iso>]
//   node scripts/plan/support.mjs tell <N> --commit <sha> [--ref <branch>] [--dry-run]   # after the fix lands
//   node scripts/plan/support.mjs digest [--json] [--issues <file>] [--now <iso>] [--notify]   # /digest (gh read only)
//
// `sla` is march Step 1.5 under fix-small or fix-all: an open `triage:loop-queued` issue `sla_hours` old (bearings;
// 24 when absent) whose work is not in the Asap lane prints `plot #N` (no chunk names it: `/plot asap`, the title
// ending `(#N)`) or `lift <id> #N` (an open chunk outside the lane names it: add its id to the Asap lane), oldest
// first, while asap_cap has room; past the cap `wait #N`. An issue a pending close, ARCHIVE.md or an Asap lane line
// already names is skipped: its work is planned or done (a cli fix stays open until the release). `age` prints the
// aged score of every Pending `source: user` or `[user-issue #N]` row in plan/AUDIT.md and plan/CRITIQUE.md: +1 per
// full 12 hours since its issue opened (or the row's `user-spotted at` / `opened` date), cap +4, never under the
// flat +0.5; /iterate adds it to `impact × ease / 10` and never drops such a row under the 3.0 floor. With --base
// and --opened it scores one row.
//
// `continue` is march's Step 1 exit: a triage pass that produced a fix-now or an Asap chunk goes on to Step 3a in
// the same tick while under half the tick's budget (60 minutes when left out) is spent; anything else returns. `route`
// reads only the issue's number, author association and labels, never its text; without gh it prints `stock` (the
// awareness layer never fails the march). `start` writes the stamp to an untracked file in the git dir because each
// shell call in a tick is a fresh shell (a variable set at Step 0 is gone by Step 1); `continue` reads it when
// --started is left out.
//
// `tell` closes the loop on a support fix once it lands (A6). The fix commit carries `Refs #N`, never `Closes #N` or
// `Fixes #N`: a closing keyword shuts the issue on push, before a release ships the fix. `tell` reads the commit
// (git), then comments naming it and closes the issue (gh). A fix touching a published package (`packages/<dir>/`
// whose package.json has a name and is not private) comments "lands in the next <name> release" and leaves the issue
// open (reopening one a closing keyword shut): the release closes it. It prints `refuse` when the commit does not
// name the issue, `wait` when the commit is not on the default branch yet, `skip` without gh. Exit 0, 64 on bad
// usage.
//
// `digest` is /digest's Support line: open user issues, the mean time to first response of the issues opened in the
// last 7 days, and the mean time to close of the issues closed in them. A user issue is any the loop did not file (no
// `loop:opened` label, no bot author, no `Cloud-Run:` body line; the body is read for that marker only and never
// printed). The first response is the first comment by anyone but the issue's author. An open `triage:needs-user`
// issue older than `escalate_days` (bearings; 7 when absent) prints `escalate #N`: it tops the digest's "Needs you",
// and with --notify one notification names them all through scripts/notify.mjs (numbers and ages only, never issue
// text). Without gh it prints `skip`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { knobOf } from './improve.mjs';

export const LEVELS = ['off', 'triage-only', 'fix-small', 'fix-all'];
export const COLLABORATORS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const DEFAULT_CAP = 3;
export const DEFAULT_BUDGET = 60;
export const DEFAULT_SLA = 24;
export const DEFAULT_ESCALATE = 7;
export const PULSE_DAYS = 7;
export const AGE_STEP_HOURS = 12;
export const AGE_CAP = 4;
export const USER_BUMP = 0.5;
const HOUR = 3600000;
const DAY = 24 * HOUR;

const knob = (name) => new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${name}[*\`]*[ \\t]*:[*\`]*[ \\t]*([\\w.-]+)`, 'mi');

/** `Support:` from plan/bearings.md text (through the dial's resolver), or null when absent or not a level. */
export function bearingsLevel(bearings = '') {
  const k = knobOf(bearings, 'Support', { vars: {} });
  return k.from === 'bearings' ? k.value : null;
}

/**
 * The level in force: { level, source, note }, read through the improvement dial (scripts/plan/improve.mjs). A set
 * NEXUS_SUPPORT wins (`env`), then a `Support:` line (`bearings`), then the `Improve:` dial (`dial`); no line at all
 * is the gentle dial, triage-only (`default`).
 */
export function supportLevel(bearings = '', env = process.env) {
  const k = knobOf(bearings, 'Support', { vars: {} });
  const own = k.from === 'bearings' ? `Support: ${k.value} in plan/bearings.md` : `the dial (Improve: ${k.improve.value} sets ${k.value})`;
  const raw = (env.NEXUS_SUPPORT ?? '').trim().toLowerCase();
  if (raw && LEVELS.includes(raw)) {
    const note = k.value !== raw && (k.from === 'bearings' || k.improve.source === 'bearings') ? `NEXUS_SUPPORT (${raw}) overrides ${own}` : null;
    return { level: raw, source: 'env', note };
  }
  const bad = raw ? `NEXUS_SUPPORT=${raw} is not a level (${LEVELS.join(', ')}); ignored` : null;
  const source = k.from === 'bearings' ? 'bearings' : k.improve.source === 'bearings' ? 'dial' : 'default';
  return { level: k.value, source, note: bad };
}

/** NEXUS_SUPPORT_TRUST: `everyone`, else `collaborators`. */
export function trust(env = process.env) {
  return (env.NEXUS_SUPPORT_TRUST ?? '').trim().toLowerCase() === 'everyone' ? 'everyone' : 'collaborators';
}

/** `asap_cap` from plan/bearings.md text, else 3. */
export function asapCap(bearings = '') {
  const n = Number(knob('asap_cap').exec(bearings)?.[1]);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_CAP;
}

/** `sla_hours` from plan/bearings.md text, else 24. */
export function slaHours(bearings = '') {
  const n = Number(knob('sla_hours').exec(bearings)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLA;
}

/** `escalate_days` from plan/bearings.md text, else 7. */
export function escalateDays(bearings = '') {
  const n = Number(knob('escalate_days').exec(bearings)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ESCALATE;
}

const labelNames = (i) => (i.labels ?? []).map((l) => String(l?.name ?? l));
const login = (a) => String(a?.login ?? a ?? '').toLowerCase();

/** Whether the loop filed an issue: a `loop:opened` label, a bot author, or the `Cloud-Run:` marker in its body. */
export function loopFiled(i) {
  if (labelNames(i).includes('loop:opened')) return true;
  if (i.author?.is_bot || /\[bot\]$/.test(login(i.author))) return true;
  return /^\s*Cloud-Run:/m.test(String(i.body ?? ''));
}

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * /digest's Support line: { open, response: { mean, answered, opened }, close: { mean, closed }, escalate, escalateDays }.
 * `issues` come from ghAllIssues (every open issue plus every one updated in 7 days; { number, state, createdAt, closedAt, author, labels, comments, body });
 * hours are means over the last 7 days, one decimal. `escalate` is every open `triage:needs-user` user issue older
 * than escalate_days, oldest first: [{ number, days }].
 */
export function supportPulse({ issues = [], bearings = '', now = Date.now() }) {
  const since = now - PULSE_DAYS * DAY;
  const users = issues.filter((i) => Number.isInteger(i.number) && Number.isFinite(Date.parse(i.createdAt)) && !loopFiled(i));
  const isOpen = (i) => String(i.state ?? '').toUpperCase() === 'OPEN';
  const recent = users.filter((i) => Date.parse(i.createdAt) >= since && Date.parse(i.createdAt) <= now);
  const firsts = recent
    .map((i) => {
      const t0 = Date.parse(i.createdAt);
      const who = login(i.author);
      const ts = (i.comments ?? []).filter((c) => login(c.author) !== who).map((c) => Date.parse(c.createdAt)).filter((t) => Number.isFinite(t) && t >= t0 && t <= now);
      return ts.length ? (Math.min(...ts) - t0) / HOUR : null;
    })
    .filter((h) => h !== null);
  const closes = users
    .filter((i) => !isOpen(i) && Date.parse(i.closedAt) >= since && Date.parse(i.closedAt) <= now)
    .map((i) => (Date.parse(i.closedAt) - Date.parse(i.createdAt)) / HOUR)
    .filter((h) => Number.isFinite(h) && h >= 0);
  const days = escalateDays(bearings);
  const escalate = users
    .filter((i) => isOpen(i) && labelNames(i).includes('triage:needs-user') && now - Date.parse(i.createdAt) > days * DAY)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number)
    .map((i) => ({ number: i.number, days: Math.floor((now - Date.parse(i.createdAt)) / DAY) }));
  return {
    open: users.filter(isOpen).length,
    response: { mean: mean(firsts), answered: firsts.length, opened: recent.length },
    close: { mean: mean(closes), closed: closes.length },
    escalate,
    escalateDays: days,
  };
}

/** The Support line /digest prints as is. */
export function pulseLine(p, level = 'triage-only') {
  const resp = p.response.answered ? `first response ${p.response.mean}h mean (${p.response.answered} of ${p.response.opened} opened in ${PULSE_DAYS}d)` : `first response none (${p.response.opened} opened in ${PULSE_DAYS}d)`;
  const close = p.close.closed ? `close ${p.close.mean}h mean (${p.close.closed} closed in ${PULSE_DAYS}d)` : `close none in ${PULSE_DAYS}d`;
  return `Support (${level}): ${p.open} open user issue${p.open === 1 ? '' : 's'} · ${resp} · ${close}`;
}

/** Best effort: one notification through scripts/notify.mjs (templates/scripts/notify.mjs in the kit); true when sent. */
export function notifyVia({ title, body, priority = 'high' }, { root = process.cwd(), run = spawnSync } = {}) {
  const script = ['scripts/notify.mjs', 'templates/scripts/notify.mjs'].map((r) => path.join(root, r)).find((f) => fs.existsSync(f));
  if (!script) return false;
  const res = run(process.execPath, [script, '--title', title, '--body', body, '--priority', priority], { cwd: root, encoding: 'utf8', windowsHide: true });
  return Boolean(res) && res.status === 0;
}

/**
 * gh read only: the issues supportPulse reads, or null. Two calls merged by number, so a repo past any one page
 * still counts: every open issue (the open count and escalation; the oldest are the likeliest past escalate_days),
 * and every issue updated in the last PULSE_DAYS (the response and close means).
 */
export function ghAllIssues({ run = spawnSync, now = Date.now() } = {}) {
  const fields = ['--limit', '1000', '--json', 'number,state,createdAt,closedAt,author,labels,comments,body'];
  const since = new Date(now - PULSE_DAYS * DAY).toISOString().slice(0, 10);
  const read = (args) => {
    const res = run('gh', ['issue', 'list', ...args, ...fields], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (!res || res.status !== 0) return null;
    try {
      const j = JSON.parse(res.stdout);
      return Array.isArray(j) ? j : null;
    } catch {
      return null;
    }
  };
  const open = read(['--state', 'open']);
  const recent = open && read(['--state', 'all', '--search', `updated:>=${since}`]);
  if (!open || !recent) return null;
  const byNumber = new Map();
  for (const i of [...recent, ...open]) if (Number.isInteger(i?.number)) byNumber.set(i.number, i);
  return [...byNumber.values()];
}

/** A user row's bump after `impact × ease / 10`: +1 per full 12 hours of age, cap +4, never under +0.5. */
export function userBonus(hours) {
  const steps = Number.isFinite(hours) ? Math.floor(Math.max(0, hours) / AGE_STEP_HOURS) : 0;
  return Math.max(USER_BUMP, Math.min(AGE_CAP, steps));
}

/** The aged score of a user row: base + userBonus, one decimal, at most 10. */
export function agedScore({ base, hours }) {
  return Math.min(10, Math.round((base + userBonus(hours)) * 10) / 10);
}

/** Whether `text` names issue `n` (`#12`, never `#123` or `&#12`). */
export const names = (text, n) => new RegExp(`(?<![\\w&])#${n}(?!\\d)`).test(String(text ?? ''));

/** The Asap lane's item lines from plan/README.md text. */
export function asapLines(readme = '') {
  const out = [];
  let inAsap = false;
  for (const line of readme.split(/\r?\n/)) {
    if (/^\*\*Asap\b/.test(line)) inAsap = true;
    else if (/^(##|\*\*)/.test(line)) inAsap = false;
    else if (inAsap && /^\s*- /.test(line) && !/\(none/.test(line)) out.push(line);
  }
  return out;
}

/**
 * Where an issue's work stands in the plan: 'asap' (an Asap lane line names it, or names a chunk whose title does),
 * 'done' (a pending close or ARCHIVE.md names it), { lift: id } (an open chunk outside the lane names it), or null.
 */
export function placed(n, { readme = '', specs = [], closed = new Set(), archive = '' }) {
  const chunks = specs.flatMap((s) => s.chunks ?? []);
  const lane = asapLines(readme);
  const inLane = (id) => lane.some((l) => (l.match(ID) ?? []).includes(id));
  if (lane.some((l) => names(l, n))) return 'asap';
  const mine = chunks.filter((c) => names(c.title, n));
  if (mine.some((c) => !closed.has(c.id) && inLane(c.id))) return 'asap';
  if (mine.some((c) => closed.has(c.id)) || names(archive, n)) return 'done';
  const open = mine.find((c) => !closed.has(c.id));
  return open ? { lift: open.id } : null;
}

/**
 * March Step 1.5: { sla, cap, plot: [{ number, hours, lift? }], wait: [{ number, hours }] }. `issues` are open
 * `triage:loop-queued` issues ({ number, createdAt, labels }); the oldest past `sla_hours` whose work is not in the
 * Asap lane take the room asap_cap leaves, the rest wait.
 */
export function slaDue({ issues = [], plan = {}, bearings = '', now = Date.now() }) {
  const sla = slaHours(bearings);
  const c = capacity(plan, bearings);
  let room = Math.max(0, c.cap - c.open);
  const plot = [];
  const wait = [];
  const due = issues
    .filter((i) => Number.isInteger(i.number) && i.createdAt && !(i.labels ?? []).some((l) => (l?.name ?? l) === 'loop:opened'))
    .map((i) => ({ number: i.number, createdAt: i.createdAt, hours: Math.floor((now - Date.parse(i.createdAt)) / HOUR) }))
    .filter((i) => Number.isFinite(i.hours) && i.hours >= sla)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
  for (const i of due) {
    const at = placed(i.number, plan);
    if (at === 'asap' || at === 'done') continue;
    const item = { number: i.number, hours: i.hours, ...(at?.lift ? { lift: at.lift } : {}) };
    if (room > 0) {
      plot.push(item);
      room--;
    } else wait.push(item);
  }
  return { sla, cap: c.cap, open: c.open, plot, wait };
}

/** The Pending rows of a queue file: [{ heading, body }]. */
export function pendingRows(text = '') {
  const rows = [];
  let inPending = false;
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^## /.test(line)) {
      inPending = /^## Pending\b/.test(line);
      cur = null;
    } else if (inPending && /^### /.test(line)) rows.push((cur = { heading: line, body: [] }));
    else if (cur) cur.body.push(line);
  }
  return rows;
}

/**
 * The user rows of a queue file, aged: [{ heading, issue, base, hours, bonus, score }]. A user row carries
 * `source: user` or a `[user-issue #N]` heading; its age runs from the issue's createdAt (`opened`, a map of
 * number → iso) when known, else its `user-spotted at <iso>` or `opened <date>` evidence. `base` is impact × ease / 10
 * when the row gives both, else null (iterate scores it, then adds the bonus).
 */
export function userRows(text = '', { opened = new Map(), now = Date.now() } = {}) {
  const out = [];
  for (const { heading, body } of pendingRows(text)) {
    const all = [heading, ...body].join('\n');
    const head = /\[user-issue #(\d+)\]/.exec(heading);
    if (!head && !/^\s*-\s*source:\s*user\b/m.test(all)) continue;
    const issue = Number(head?.[1] ?? /^\s*-\s*issue:\s*#(\d+)/m.exec(all)?.[1]) || null;
    const impact = Number(/\bimpact:\s*(\d+(?:\.\d+)?)/.exec(all)?.[1]);
    const ease = Number(/\bease:\s*(\d+(?:\.\d+)?)/.exec(all)?.[1]);
    const base = Number.isFinite(impact) && Number.isFinite(ease) ? Math.round(impact * ease) / 10 : null;
    const from = (issue && opened.get(issue)) || /user-spotted at (\S+)/.exec(all)?.[1] || /\bopened (\d{4}-\d{2}-\d{2})/.exec(all)?.[1];
    const t = from ? Date.parse(from) : NaN;
    const hours = Number.isFinite(t) ? Math.floor((now - t) / HOUR) : null;
    const bonus = userBonus(hours ?? NaN);
    out.push({ heading, issue, base, hours, bonus, score: base === null ? null : agedScore({ base, hours: hours ?? NaN }) });
  }
  return out;
}

/**
 * Where triage sends one issue: { route: 'bug' | 'stock', why }. `kind` is triage's class (bug, enhancement, docs,
 * lesson, question); `association` the author's (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE, …); `labels` names.
 */
export function route({ level = 'triage-only', trust: who = 'collaborators', association = '', labels = [], kind = '' }) {
  const names = labels.map((l) => String(l).toLowerCase());
  const cls = names.includes('support') ? 'bug' : String(kind).toLowerCase();
  if (level === 'off' || level === 'triage-only') return { route: 'stock', why: `support ${level}: triage routes as today` };
  const trusted = who === 'everyone' || COLLABORATORS.includes(String(association).toUpperCase()) || names.includes('loop:do');
  if (!trusted) return { route: 'stock', why: `an outsider's issue (${association || 'unknown'}): triaged and queued only; loop:do lifts it` };
  if (cls === 'bug') return { route: 'bug', why: `support ${level}: a collaborator's bug goes to skills/bug.md (fix now or Asap)` };
  if (cls === 'enhancement' && level === 'fix-all') return { route: 'bug', why: 'support fix-all: built like a bug when small; a scope or taste call is triage:needs-user' };
  return { route: 'stock', why: `support ${level}: a ${cls || 'unclassified'} issue routes as today` };
}

const ID = /\b\d{2,}\.\w+\b/g;
const ISSUE = /\(#(\d+)\)|(?<![\w&])#(\d+)\b/;

/**
 * The issue-born chunks in the Asap lane that are still open: [{ id, issue }]. `specs` are parseSpec results;
 * `closed` the ids a pending close already closes. A lane line or a chunk title naming `#N` is issue-born.
 */
export function issueBorn({ readme = '', specs = [], closed = new Set() }) {
  const open = new Map();
  for (const s of specs) for (const c of s.chunks ?? []) if (!closed.has(c.id)) open.set(c.id, c);
  const out = [];
  let inAsap = false;
  for (const line of readme.split(/\r?\n/)) {
    if (/^\*\*Asap\b/.test(line)) inAsap = true;
    else if (/^(##|\*\*)/.test(line)) inAsap = false;
    else if (inAsap && /^\s*- /.test(line) && !/\(none/.test(line)) {
      for (const id of line.match(ID) ?? []) {
        const c = open.get(id);
        if (!c) continue;
        const m = ISSUE.exec(line) ?? ISSUE.exec(c.title ?? '');
        if (m && !out.some((x) => x.id === id)) out.push({ id, issue: Number(m[1] ?? m[2]) });
      }
    }
  }
  return out;
}

/** The cap: { open, cap, room, ids }. `room` is false once `open` reaches `cap`. */
export function capacity(plan, bearings = '') {
  const born = issueBorn(plan);
  const cap = asapCap(bearings);
  return { open: born.length, cap, room: born.length < cap, ids: born };
}

/** March Step 1's exit: { next: 'continue' | 'return', why }. */
export function keepGoing({ routed = 'none', startedMs, nowMs = Date.now(), budgetMin = DEFAULT_BUDGET }) {
  if (routed !== 'fix' && routed !== 'asap') return { next: 'return', why: 'triage produced no fix-now or Asap chunk' };
  if (!Number.isFinite(startedMs)) return { next: 'return', why: 'no tick start to measure the budget from' };
  const used = Math.max(0, (nowMs - startedMs) / 60000);
  const half = budgetMin / 2;
  if (used < half) return { next: 'continue', why: `${Math.round(used)} of ${budgetMin} min used: on to Step 3a` };
  return { next: 'return', why: `${Math.round(used)} of ${budgetMin} min used (half is ${half}): the next tick builds it` };
}

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[ \t]*:?[ \t]+(?:[\w.-]+\/[\w.-]+)?#(\d+)(?!\d)/gi;

/** The issue numbers a commit message closes on push through a GitHub closing keyword. */
export function closingRefs(message = '') {
  return [...String(message).matchAll(CLOSING)].map((m) => Number(m[1]));
}

/** Whether a commit message carries `Refs #N`. */
export const refsIssue = (message, n) => new RegExp(`\\bRefs[ \\t]*:?[ \\t]+#${n}(?!\\d)`, 'i').test(String(message ?? ''));

/** The published packages a commit touches: [{ dir, name }] for `packages/<dir>/` files under a public package.json. */
export function heldPackages(files = [], root = process.cwd()) {
  const out = [];
  for (const f of files) {
    const m = /^packages\/([^/]+)\//.exec(String(f).replace(/\\/g, '/'));
    if (!m || out.some((p) => p.dir === `packages/${m[1]}`)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages', m[1], 'package.json'), 'utf8'));
      if (pkg.name && pkg.private !== true) out.push({ dir: `packages/${m[1]}`, name: pkg.name });
    } catch {
      // no package.json, or one that does not parse: not a published package
    }
  }
  return out;
}

/**
 * What `tell` does for issue `number` and its fix commit: { action, comment?, reopen?, why }. `action` is 'close'
 * (comment, then close), 'hold' (comment; the release closes it), 'wait' (not landed) or 'refuse' (the commit does
 * not name the issue). `commit` is { sha, subject, message, landed }; `held` the heldPackages of its files; `state`
 * the issue's (OPEN | CLOSED).
 */
export function tellPlan({ number, commit, held = [], state = 'OPEN' }) {
  const short = String(commit.sha ?? '').slice(0, 7);
  const closes = closingRefs(commit.message).includes(number);
  if (!refsIssue(commit.message, number) && !closes) return { action: 'refuse', why: `${short} does not carry Refs #${number}: not this issue's fix` };
  if (!commit.landed) return { action: 'wait', why: `${short} is not on the default branch yet: tell it after it lands` };
  const note = closes ? `; ${short} closes #${number} by keyword: a fix carries Refs #${number}, never Closes or Fixes` : '';
  const what = `Fixed in ${short} (${commit.subject})`;
  if (held.length) {
    return {
      action: 'hold',
      comment: `${what}: lands in the next ${held.map((p) => p.name).join(' and ')} release. This issue stays open until it ships.`,
      reopen: String(state).toUpperCase() === 'CLOSED',
      why: `touches ${held.map((p) => p.dir).join(', ')}: the release closes it${note}`,
    };
  }
  return { action: 'close', comment: `${what}, now on the default branch.`, why: `landed${note}` };
}

/** git read only: { sha, subject, message, files, landed } for a commit, or null. `ref` is the branch it must be on. */
export function gitCommit(sha, { root = process.cwd(), ref, run = spawnSync } = {}) {
  const git = (...args) => run('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const log = git('log', '-1', '--format=%H%n%s%n%b', sha);
  if (!log || log.status !== 0) return null;
  const [full, subject, ...body] = log.stdout.replace(/\r/g, '').split('\n');
  const show = git('show', '--name-only', '--format=', full);
  const files = show && show.status === 0 ? show.stdout.split(/\r?\n/).filter(Boolean) : [];
  const head = ref ? null : git('rev-parse', '--abbrev-ref', 'origin/HEAD');
  const refs = ref ? [ref] : [head && head.status === 0 ? head.stdout.trim() : null, 'origin/main', 'origin/master', 'main', 'master'].filter(Boolean);
  const target = refs.find((r) => git('rev-parse', '--verify', '--quiet', r)?.status === 0);
  const landed = Boolean(target) && git('merge-base', '--is-ancestor', full, target)?.status === 0;
  return { sha: full, subject, message: [subject, '', ...body].join('\n'), files, landed };
}

/** gh read only: an issue's state (OPEN | CLOSED), or null without gh. */
export function ghState(num, { run = spawnSync } = {}) {
  const res = run('gh', ['issue', 'view', String(num), '--json', 'state'], { encoding: 'utf8', windowsHide: true });
  if (!res || res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout).state ?? null;
  } catch {
    return null;
  }
}

/** gh write: one issue command (`comment`, `close`, `reopen`); true when it ran clean. */
export function ghIssueDo(args, { run = spawnSync } = {}) {
  const res = run('gh', ['issue', ...args], { encoding: 'utf8', windowsHide: true });
  return Boolean(res) && res.status === 0;
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** The plan on disk: { readme, specs, closed, archive }. */
export async function loadPlan(root) {
  const [{ SPEC_FILE, parseSpec }, { pendingFiles, pendingCloses }] = await Promise.all([import('../plan-check.mjs'), import('./pending.mjs')]);
  const dir = path.join(root, 'plan');
  const readme = readSafe(path.join(dir, 'README.md'));
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => SPEC_FILE.test(n)) : [];
  const specs = names.map((n) => parseSpec(n, readSafe(path.join(dir, n))));
  let closed = new Set();
  try {
    closed = pendingCloses(pendingFiles(root));
  } catch {
    // no pending folder, or one that does not parse: nothing counts closed early
  }
  return { readme, specs, closed, archive: readSafe(path.join(dir, 'ARCHIVE.md')) };
}

/** gh read only: the issue's author association and label names, or null. */
export function ghIssue(num, { run = spawnSync } = {}) {
  const res = run('gh', ['issue', 'view', String(num), '--json', 'number,authorAssociation,labels'], { encoding: 'utf8', windowsHide: true });
  if (!res || res.status !== 0) return null;
  try {
    const j = JSON.parse(res.stdout);
    return { association: j.authorAssociation ?? '', labels: (j.labels ?? []).map((l) => l.name ?? l) };
  } catch {
    return null;
  }
}

/** gh read only: open issues as [{ number, createdAt, labels }] (with `label`, only those carrying it), or null. */
export function ghIssues(label, { run = spawnSync } = {}) {
  const args = ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,createdAt,labels', ...(label ? ['--label', label] : [])];
  const res = run('gh', args, { encoding: 'utf8', windowsHide: true });
  if (!res || res.status !== 0) return null;
  try {
    const j = JSON.parse(res.stdout);
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/** The untracked tick-start stamp file: <git dir>/nexus-tick-start, or <root>/.git/nexus-tick-start without git. */
export function stampFile(root, { run = spawnSync } = {}) {
  const res = run('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const dir = res && res.status === 0 && res.stdout.trim() ? res.stdout.trim() : '.git';
  return path.join(path.resolve(root, dir), 'nexus-tick-start');
}

export const USAGE =
  'usage: support.mjs level [--json] | route <N> --kind <class> [--association A --labels a,b] [--json] | cap [--json] | asap | start | continue --routed fix|asap|none [--started <iso>] [--budget <min>] [--now <iso>] | sla [--json] [--issues <file>] [--now <iso>] | age [--base <score> --opened <iso>] [--issues <file>] [--now <iso>] | tell <N> --commit <sha> [--ref <branch>] [--dry-run] | digest [--json] [--issues <file>] [--now <iso>] [--notify]';

export async function main(argv, { root = process.cwd(), env = process.env, log = console.log, gh = ghIssue, list = ghIssues, asap, commit = gitCommit, state = ghState, act = ghIssueDo, all = ghAllIssues, notify = notifyVia } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const json = argv.includes('--json');
  const bearings = readSafe(path.join(root, 'plan', 'bearings.md'));
  const [cmd] = argv;
  if (cmd === 'level') {
    const l = { ...supportLevel(bearings, env), trust: trust(env) };
    if (json) log(JSON.stringify(l));
    else {
      log(`${l.level} · from ${l.source} · trust ${l.trust}`);
      if (l.note) log(`note: ${l.note}`);
    }
    return 0;
  }
  if (cmd === 'route') {
    const num = argv[1];
    const kind = at('--kind');
    if (!num || !/^\d+$/.test(num) || !kind) return (console.error(USAGE), 64);
    const who = at('--association') !== undefined ? { association: at('--association'), labels: (at('--labels') ?? '').split(',').map((s) => s.trim()).filter(Boolean) } : gh(num);
    const { level } = supportLevel(bearings, env);
    const r = who ? route({ level, trust: trust(env), kind, ...who }) : { route: 'stock', why: 'gh unavailable: triage routes as today' };
    if (json) log(JSON.stringify({ issue: Number(num), level, ...r }));
    else log(`${r.route} #${num} · ${r.why}`);
    return 0;
  }
  if (cmd === 'cap') {
    const c = capacity(await loadPlan(root), bearings);
    if (json) log(JSON.stringify(c));
    else log(`asap ${c.open}/${c.cap} · ${c.room ? 'room' : 'full'}${c.ids.length ? ` · ${c.ids.map((x) => `${x.id} (#${x.issue})`).join(', ')}` : ''}`);
    return 0;
  }
  if (cmd === 'asap') {
    const ready = asap ? await asap(root) : await (await import('./lanes.mjs')).asapReady(root);
    log(ready ? 'ready' : 'none');
    return 0;
  }
  if (cmd === 'start') {
    const file = stampFile(root);
    const iso = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${iso}\n`);
    } catch (e) {
      console.error(`note: could not stamp the tick start (${e.message}); continue will return`);
    }
    log(`started · ${iso}`);
    return 0;
  }
  if (cmd === 'continue') {
    const routed = at('--routed');
    const started = Date.parse(at('--started') ?? readSafe(stampFile(root)).trim());
    const budget = at('--budget') === undefined ? DEFAULT_BUDGET : Number(at('--budget'));
    const now = at('--now') === undefined ? Date.now() : Date.parse(at('--now'));
    if (!['fix', 'asap', 'none'].includes(routed) || !(budget > 0) || !Number.isFinite(now)) return (console.error(USAGE), 64);
    const k = keepGoing({ routed, startedMs: started, nowMs: now, budgetMin: budget });
    log(`${k.next} · ${k.why}`);
    return 0;
  }
  if (cmd === 'tell') {
    const num = argv[1];
    const sha = at('--commit');
    if (!num || !/^\d+$/.test(num) || !sha || sha.startsWith('-')) return (console.error(USAGE), 64);
    const c = commit(sha, { root, ref: at('--ref') });
    if (!c) return (log(`refuse #${num} · no commit ${sha} in this checkout`), 0);
    const dry = argv.includes('--dry-run');
    const st = dry ? 'OPEN' : state(num);
    if (!dry && !st) return (log(`skip #${num} · gh unavailable: tell it by hand or on the next tick`), 0);
    const p = tellPlan({ number: Number(num), commit: c, held: heldPackages(c.files, root), state: st });
    log(`${p.action} #${num} · ${p.why}`);
    if (!p.comment) return 0;
    const closed = String(st).toUpperCase() === 'CLOSED';
    const steps = [...(p.reopen ? [['reopen', num]] : []), ['comment', num, '--body', p.comment], ...(p.action === 'close' && !closed ? [['close', num]] : [])];
    if (dry) {
      for (const s of steps) log(`would: gh issue ${s.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      return 0;
    }
    const failed = steps.filter((s) => !act(s)).map((s) => s[0]);
    if (failed.length) log(`note: gh ${failed.join(', ')} failed; the fix stands, tell it by hand`);
    return 0;
  }
  if (cmd === 'digest') {
    const now = at('--now') === undefined ? Date.now() : Date.parse(at('--now'));
    if (!Number.isFinite(now)) return (console.error(USAGE), 64);
    const file = at('--issues');
    let issues = null;
    if (file) {
      try {
        const j = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
        issues = Array.isArray(j) ? j : null;
      } catch {
        issues = null;
      }
    } else issues = all({ now });
    if (!issues) return (log('skip · gh unavailable: no Support line (say so under the pulse table)'), 0);
    const { level } = supportLevel(bearings, env);
    const p = supportPulse({ issues, bearings, now });
    if (json) log(JSON.stringify({ level, ...p }));
    else {
      log(pulseLine(p, level));
      for (const e of p.escalate) log(`escalate #${e.number} · triage:needs-user open ${e.days}d, over escalate_days ${p.escalateDays}: top of Needs you`);
    }
    if (argv.includes('--notify') && p.escalate.length) {
      const n = p.escalate.length;
      const sent = notify({ title: `needs you: ${n} issue${n === 1 ? '' : 's'} past escalate_days`, body: `${p.escalate.map((e) => `#${e.number} ${e.days}d`).join(', ')} (triage:needs-user)`, priority: 'high' }, { root });
      if (!json) log(sent ? `notified · ${n} escalated` : 'note: notify.mjs missing or failed; the digest still lists them');
    }
    return 0;
  }
  if (cmd === 'sla' || cmd === 'age') {
    const now = at('--now') === undefined ? Date.now() : Date.parse(at('--now'));
    if (!Number.isFinite(now)) return (console.error(USAGE), 64);
    const file = at('--issues');
    const fetch = (label) => {
      if (!file) return list(label);
      try {
        const j = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
        return Array.isArray(j) ? j.filter((i) => !label || (i.labels ?? []).some((l) => (l?.name ?? l) === label)) : null;
      } catch {
        return null;
      }
    };
    if (cmd === 'sla') {
      const { level } = supportLevel(bearings, env);
      if (level === 'off' || level === 'triage-only') return (log(`off · support ${level}: no SLA step`), 0);
      const issues = fetch('triage:loop-queued');
      if (!issues) return (log('skip · gh unavailable: no SLA step this tick'), 0);
      const d = slaDue({ issues, plan: await loadPlan(root), bearings, now });
      if (json) log(JSON.stringify(d));
      else {
        for (const i of d.plot) log(i.lift ? `lift ${i.lift} #${i.number} · open ${i.hours}h, SLA ${d.sla}h: into the Asap lane` : `plot #${i.number} · open ${i.hours}h, SLA ${d.sla}h: /plot asap, the title ending (#${i.number})`);
        for (const i of d.wait) log(`wait #${i.number} · open ${i.hours}h, asap_cap full (${d.cap})`);
        log(d.plot.length + d.wait.length ? `due ${d.plot.length + d.wait.length}` : 'clean');
      }
      return 0;
    }
    if (at('--base') !== undefined || at('--opened') !== undefined) {
      const base = Number(at('--base'));
      const t = Date.parse(at('--opened') ?? '');
      if (!Number.isFinite(base) || !Number.isFinite(t)) return (console.error(USAGE), 64);
      const hours = Math.floor((now - t) / HOUR);
      log(`${agedScore({ base, hours })} · ${base} +${userBonus(hours)} (${hours}h)`);
      return 0;
    }
    const opened = new Map((fetch() ?? []).filter((i) => Number.isInteger(i.number) && i.createdAt).map((i) => [i.number, i.createdAt]));
    let n = 0;
    for (const q of ['AUDIT.md', 'CRITIQUE.md']) {
      for (const r of userRows(readSafe(path.join(root, 'plan', q)), { opened, now })) {
        n++;
        const age = r.hours === null ? 'age unknown' : `${r.hours}h`;
        const head = r.heading.replace(/^###\s*/, '');
        log(`${r.score ?? 'score'} · ${r.base ?? 'impact × ease / 10'} +${r.bonus} (${age}) · ${q} · ${head.length > 100 ? `${head.slice(0, 97)}...` : head}`);
      }
    }
    log(n ? `aged ${n}` : 'none');
    return 0;
  }
  console.error(USAGE);
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
