// scripts/plan/support.mjs: how hard the loop works an issue, and whether the tick keeps going after triage.
//
// The knob is `Support:` in plan/bearings.md (`off | triage-only | fix-small | fix-all`), and the repo variable
// NEXUS_SUPPORT when the tick's environment carries it: the variable wins, and a disagreement is printed as a note.
// Neither set reads `triage-only`: triage routes as it always has (an AUDIT row per bug). `off` routes the same way;
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
//
// `continue` is march's Step 1 exit: a triage pass that produced a fix-now or an Asap chunk goes on to Step 3a in
// the same tick while under half the tick's budget (60 minutes when left out) is spent; anything else returns. `route`
// reads only the issue's number, author association and labels, never its text; without gh it prints `stock` (the
// awareness layer never fails the march). `start` writes the stamp to an untracked file in the git dir because each
// shell call in a tick is a fresh shell (a variable set at Step 0 is gone by Step 1); `continue` reads it when
// --started is left out. Exit 0, 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEVELS = ['off', 'triage-only', 'fix-small', 'fix-all'];
export const COLLABORATORS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const DEFAULT_CAP = 3;
export const DEFAULT_BUDGET = 60;

const knob = (name) => new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${name}[*\`]*[ \\t]*:[*\`]*[ \\t]*([\\w.-]+)`, 'mi');

/** `Support:` from plan/bearings.md text, or null when absent or not a level. */
export function bearingsLevel(bearings = '') {
  const m = knob('Support').exec(bearings);
  const v = m?.[1]?.toLowerCase();
  return LEVELS.includes(v) ? v : null;
}

/** The level in force: { level, source, note }. A set NEXUS_SUPPORT wins over bearings; neither is triage-only. */
export function supportLevel(bearings = '', env = process.env) {
  const fromBearings = bearingsLevel(bearings);
  const raw = (env.NEXUS_SUPPORT ?? '').trim().toLowerCase();
  if (raw && LEVELS.includes(raw)) {
    const note = fromBearings && fromBearings !== raw ? `NEXUS_SUPPORT (${raw}) overrides Support: ${fromBearings} in plan/bearings.md` : null;
    return { level: raw, source: 'env', note };
  }
  const bad = raw ? `NEXUS_SUPPORT=${raw} is not a level (${LEVELS.join(', ')}); ignored` : null;
  if (fromBearings) return { level: fromBearings, source: 'bearings', note: bad };
  return { level: 'triage-only', source: 'default', note: bad };
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

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** The plan on disk: { readme, specs, closed }. */
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
  return { readme, specs, closed };
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

/** The untracked tick-start stamp file: <git dir>/nexus-tick-start, or <root>/.git/nexus-tick-start without git. */
export function stampFile(root, { run = spawnSync } = {}) {
  const res = run('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const dir = res && res.status === 0 && res.stdout.trim() ? res.stdout.trim() : '.git';
  return path.join(path.resolve(root, dir), 'nexus-tick-start');
}

export const USAGE =
  'usage: support.mjs level [--json] | route <N> --kind <class> [--association A --labels a,b] [--json] | cap [--json] | asap | start | continue --routed fix|asap|none [--started <iso>] [--budget <min>] [--now <iso>]';

export async function main(argv, { root = process.cwd(), env = process.env, log = console.log, gh = ghIssue, asap } = {}) {
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
