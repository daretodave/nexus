// scripts/plan/locks.mjs: lock timeouts. No lock holds forever.
//
// A lock is anything that stops the loop until a person or a condition says go: a line in the roadmap's Held lane, a
// lane lock in skills/march.lanes.md or skills/iterate.lanes.md, an owner-blocked row in plan/AUDIT.md or
// plan/CRITIQUE.md. Each carries its timeout on the line itself (concepts/plan-shape.md, "Locks time out"):
//
//   - **54.3** · blocked: the token lacks scope · since: 2026-10-20 · until: the owner rotates it · max_age: 14d
//   - lock: gap-table · since: 2026-10-01 · until: the gap table reads zero · max_age: 21d · fallback: release
//
// A Held line is named by its chunk or spec id; any other lock names itself with `lock: <slug>`. `since:` is the day
// it was set; `until:` a date or a condition; `max_age:` how long it may hold (outside the Held lane it may be left
// out for `Lock max age` in plan/bearings.md, 14d when absent; plan-check requires it on a Held line). A lock is past
// its time once it is older than max_age, or its until is a date gone by. Then:
//
//   - `fallback: release`: the lock's line goes (`--write`); an emptied Held lane reads `- (none)`;
//   - any other fallback: printed for the tick to apply (it then removes the lock or sets a new since:);
//   - no fallback: exactly ONE needs-user ask. The ask is a GitHub issue, `Lock past max_age: <slug>` (labels
//     loop:opened, loop:lock, triage:needs-user), deduped by slug, re-pinged by a comment every 7 days, and
//     scripts/notify.mjs is called alongside on the open and each re-ping when the repo has it. An ask whose lock is
//     gone, or back inside its time, is closed.
//
// An auto-promoted Held line (scripts/plan/promote.mjs) is the veto sweep's: listed, never acted on here.
//
//   node scripts/plan/locks.mjs list  [--today YYYY-MM-DD] [--json]          (every lock and its age; offline)
//   node scripts/plan/locks.mjs sweep [--today YYYY-MM-DD] [--write] [--json] (/march Step 0, after the veto sweep)
//
// `sweep` prints one `release|fallback|ask <slug> · …` line per lock past its time, then `clean` or a count; without
// `--write` it writes nothing and reads nothing from GitHub. A line that lacks since: (or until:) is listed as `bad`
// and never acted on. Exit 0; 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { laneText, parseLock } from '../plan-check.mjs';
import { loadConfig } from './config.mjs';
import { live } from './lanes.mjs';
import { addDays, daysBetween, today } from './promote.mjs';

export const LOCK_MAX_AGE = 14;
export const ASK_TITLE = 'Lock past max_age: ';
export const LOCK_LABEL = 'loop:lock';
export const OPENED_LABEL = 'loop:opened';
export const NEEDS_USER_LABEL = 'triage:needs-user';
export const PING = 'Still locked past max_age.';
export const PING_DAYS = 7;
/** Where locks live, besides the roadmap's Held lane: kind by file. */
export const SOURCES = Object.freeze([
  ['plan/README.md', 'row'],
  ['plan/AUDIT.md', 'row'],
  ['plan/CRITIQUE.md', 'row'],
  ['skills/march.lanes.md', 'lane'],
  ['skills/iterate.lanes.md', 'lane'],
]);

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

/** `Lock max age` from plan/bearings.md text, in days (14 when absent or unreadable). */
export function defaultMaxAge(bearings = '') {
  const m = /^[ \t]*(?:[-*][ \t]+)?[*`]*Lock max age[*`]*[ \t]*:[*`]*[ \t]*[*`]*(\d+)d?\b/im.exec(bearings);
  return m ? Number(m[1]) : LOCK_MAX_AGE;
}

/** The Held lane's [heading, end) indices in the roadmap's lines. */
function heldLane(lines, prefix) {
  const head = lines.findIndex((l) => l.startsWith(prefix));
  if (head < 0) return [-1, -1];
  const end = lines.findIndex((l, i) => i > head && /^(##|\*\*)/.test(l));
  return [head, end < 0 ? lines.length : end];
}

/** How many lines a list item spans (itself plus its wrapped continuation). */
function span(lines, i) {
  let n = 1;
  while (i + n < lines.length && /^ {2,}\S/.test(lines[i + n]) && !/^\s*[-*] /.test(lines[i + n])) n++;
  return n;
}

/**
 * Every lock in `files` ({ rel: text }): [{ file, line, index, span, kind, slug, text, since, until, untilDate, maxAge,
 * fallback, auto, problem }]. `prefix` starts the Held lane's heading; `maxAge` is the default outside it.
 */
export function findLocks(files, { prefix = '**Held', maxAge = LOCK_MAX_AGE } = {}) {
  const out = [];
  for (const [rel, kind] of [['plan/README.md', 'held'], ...SOURCES]) {
    const text = files[rel];
    if (!text) continue;
    const raw = text.split('\n');
    const lines = live(text);
    const [head, end] = rel === 'plan/README.md' ? heldLane(lines, prefix) : [-1, -1];
    for (let i = 0; i < lines.length; i++) {
      const inHeld = i > head && i < end;
      if ((kind === 'held') !== inHeld) continue;
      if (!/^\s*[-*] /.test(lines[i]) || /^- \(none/.test(lines[i])) continue;
      const joined = laneText(lines, i);
      const lock = parseLock(joined);
      let slug = lock.slug;
      if (kind === 'held') {
        const id = /^- \*\*([^*]+)\*\*/.exec(lines[i])?.[1] ?? /^- (\d+) ·/.exec(lines[i])?.[1];
        slug = slug ?? (id ? `held-${id}` : null);
      } else if (!slug) continue;
      const problem = !slug ? 'names no chunk, spec or lock: slug'
        : !lock.since ? 'lacks since: YYYY-MM-DD'
          : !lock.until ? 'lacks until: <date or condition>'
            : kind === 'held' && lock.maxAge === null ? 'lacks max_age: <n>d'
              : null;
      out.push({
        file: rel,
        line: i + 1,
        index: i,
        span: span(raw, i),
        kind,
        text: joined.trim(),
        ...lock,
        slug,
        maxAge: lock.maxAge ?? maxAge,
        problem,
      });
    }
  }
  return out;
}

/** One lock on `date`: { state: ok | due | veto | bad, age, ends, why }. */
export function judge(lock, date = today()) {
  if (lock.problem) return { state: 'bad', age: null, ends: null, why: lock.problem };
  const age = daysBetween(lock.since, date);
  const byAge = addDays(lock.since, lock.maxAge);
  const ends = lock.untilDate && lock.untilDate < byAge ? lock.untilDate : byAge;
  if (lock.auto) return { state: 'veto', age, ends, why: `auto-promoted: the veto sweep owns it (#${lock.auto.issue})` };
  if (date > ends) {
    const why = date > byAge ? `${age}d old, past max_age ${lock.maxAge}d` : `until ${lock.untilDate} has passed`;
    return { state: 'due', age, ends, why };
  }
  return { state: 'ok', age, ends, why: `${age}d of ${lock.maxAge}d, until ${lock.until}` };
}

/** What the sweep does with a due lock: release (its line goes), fallback (the tick applies it) or ask. */
export function action(lock) {
  if (!lock.fallback) return 'ask';
  return /^release\b/i.test(lock.fallback) ? 'release' : 'fallback';
}

/** The files with the `release` locks' lines removed; an emptied Held lane reads `- (none)`. */
export function release(files, locks, { prefix = '**Held' } = {}) {
  const out = { ...files };
  const byFile = new Map();
  for (const l of locks) byFile.set(l.file, [...(byFile.get(l.file) ?? []), l]);
  for (const [rel, list] of byFile) {
    const lines = out[rel].split('\n');
    for (const l of [...list].sort((a, b) => b.index - a.index)) lines.splice(l.index, l.span);
    const held = list.filter((l) => l.kind === 'held');
    if (held.length) {
      const [head, end] = heldLane(lines, prefix);
      if (head >= 0 && !lines.slice(head + 1, end).some((x) => /^\s*- /.test(x))) {
        // The lane as it stands after the splices (a released row above it shifts it): the placeholder goes after
        // the heading's paragraph, at its first blank line, or at the lane's end when there is none.
        const blank = lines.findIndex((x, i) => i > head && i < end && x.trim() === '');
        lines.splice(blank < 0 ? end : blank + 1, 0, '- (none)');
      }
    }
    out[rel] = lines.join('\n');
  }
  return out;
}

// ---- the ask ---------------------------------------------------------------------------------------------------

function shRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

/**
 * The open ask issues by slug ({ slug: { number, createdAt, pinged } }), or null when gh cannot say. Issue text is
 * untrusted: one counts only with the loop:lock label (only triage-level users set one) and the ask's title, and a
 * re-ping counts only when the login that opened the ask wrote it (anyone can post the ping's words on a public repo).
 */
export function openAsks(run) {
  const r = run('gh', ['issue', 'list', '--state', 'open', '--label', LOCK_LABEL, '--json', 'number,title,createdAt,author,comments', '--limit', '100']);
  if (!r.ok) return null;
  let list;
  try {
    list = JSON.parse(r.stdout || '[]');
  } catch {
    return null;
  }
  const out = {};
  for (const i of Array.isArray(list) ? list : []) {
    const title = String(i?.title ?? '');
    if (!title.startsWith(ASK_TITLE)) continue;
    const slug = title.slice(ASK_TITLE.length).trim();
    const opener = i?.author?.login;
    const pings = (i.comments ?? [])
      .filter((c) => opener && c?.author?.login === opener && String(c?.body ?? '').startsWith(PING))
      .map((c) => String(c.createdAt ?? ''));
    const pinged = [String(i.createdAt ?? ''), ...pings].filter(Boolean).sort().pop() ?? '';
    if (!out[slug] || i.number < out[slug].number) out[slug] = { number: i.number, createdAt: i.createdAt, pinged: pinged.slice(0, 10) };
  }
  return out;
}

/** The ask's body: the lock, what timed out, and the owner's three answers. */
export function askBody(lock, verdict) {
  return [
    `A lock in \`${lock.file}\` has held past its time (${verdict.why}), and it names no \`fallback:\`, so the loop asks you once.`,
    ['```', lock.text, '```'].join('\n'),
    `since ${lock.since} · until ${lock.until} · max_age ${lock.maxAge}d`,
    'Answer by editing the lock: remove it (go), set a new `since:` (keep waiting) or add a `fallback:` (what the loop does when it times out). The loop closes this issue once the lock is gone or back inside its time, and comments here every 7 days until then.',
  ].join('\n\n');
}

function notify(root, run, title, body) {
  if (!fs.existsSync(path.join(root, 'scripts', 'notify.mjs'))) return false;
  run('node', [path.join(root, 'scripts', 'notify.mjs'), '--title', title, '--body', body, '--priority', 'high']);
  return true;
}

/** File, re-ping or close the asks for `due` (the locks that ask): one log line each. */
export function asks(due, { root, run, date, log }) {
  const open = openAsks(run);
  if (open === null) {
    if (due.length) log(`asks: could not read the ${LOCK_LABEL} issues; nothing filed (the next sweep tries again)`);
    return;
  }
  const want = new Set(due.map((d) => d.lock.slug));
  for (const { lock, verdict } of due) {
    const title = `${ASK_TITLE}${lock.slug}`;
    const have = open[lock.slug];
    if (have) {
      const ago = have.pinged ? daysBetween(have.pinged, date) : PING_DAYS;
      if (ago < PING_DAYS) {
        log(`asked ${lock.slug} #${have.number} (pinged ${ago}d ago)`);
        continue;
      }
      const c = run('gh', ['issue', 'comment', String(have.number), '--body', `${PING} ${verdict.why}: \`${lock.text}\``]);
      if (c.ok) notify(root, run, title, verdict.why);
      log(c.ok ? `pinged ${lock.slug} #${have.number}` : `could not ping ${lock.slug} #${have.number}`);
      continue;
    }
    run('gh', ['label', 'create', OPENED_LABEL, '--color', 'EDEDED', '--description', 'Opened by the loop itself; triage skips it', '--force']);
    run('gh', ['label', 'create', LOCK_LABEL, '--color', 'D4C5F9', '--description', 'A lock held past its max_age', '--force']);
    run('gh', ['label', 'create', NEEDS_USER_LABEL, '--color', 'D93F0B', '--description', 'Waits on the owner', '--force']);
    // Labelled or not at all: the label is how the next sweep finds it, so an unlabelled copy would be a second ask.
    const c = run('gh', ['issue', 'create', '--title', title, '--body', askBody(lock, verdict), '--label', OPENED_LABEL, '--label', LOCK_LABEL, '--label', NEEDS_USER_LABEL]);
    if (c.ok) notify(root, run, title, verdict.why);
    log(c.ok ? `opened ${lock.slug}: "${title}"` : `could not open the ask for ${lock.slug} (${(c.stderr || '').trim().split('\n')[0]})`);
  }
  for (const [slug, have] of Object.entries(open)) {
    if (want.has(slug)) continue;
    const c = run('gh', ['issue', 'close', String(have.number), '--comment', 'The lock is gone or back inside its time, so this ask closes.']);
    log(c.ok ? `closed ${slug} #${have.number}` : `could not close ${slug} #${have.number}`);
  }
}

// ---- the command -----------------------------------------------------------------------------------------------

/** The lock files under `root`, by repo-relative path. */
export function readFiles(root) {
  const out = {};
  for (const [rel] of [['plan/README.md'], ...SOURCES]) out[rel] = readSafe(path.join(root, rel));
  return out;
}

export const USAGE = 'usage: locks.mjs list|sweep [--today YYYY-MM-DD] [--write] [--json]';

export function main(argv, { root = process.cwd(), run = shRun, log = console.log } = {}) {
  const [cmd, ...rest] = argv;
  const at = (flag) => {
    const i = rest.indexOf(flag);
    return i < 0 ? undefined : rest[i + 1];
  };
  const date = at('--today') ?? today();
  const known = new Set(['--today', '--write', '--json']);
  const bad = rest.some((a, i) => a.startsWith('--') ? !known.has(a) : rest[i - 1] !== '--today');
  if (!['list', 'sweep'].includes(cmd) || bad || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (cmd === 'list' && rest.includes('--write'))) {
    console.error(USAGE);
    return 64;
  }
  const cfg = loadConfig(root);
  const files = readFiles(root);
  const locks = findLocks(files, { prefix: cfg.lanes.held, maxAge: defaultMaxAge(readSafe(path.join(root, 'plan', 'bearings.md'))) });
  const judged = locks.map((lock) => ({ lock, verdict: judge(lock, date) }));
  const where = (l) => `${l.file}:${l.line}`;
  if (cmd === 'list') {
    if (rest.includes('--json')) log(JSON.stringify(judged.map(({ lock, verdict }) => ({ slug: lock.slug, file: lock.file, line: lock.line, kind: lock.kind, since: lock.since, until: lock.until, maxAge: lock.maxAge, fallback: lock.fallback, ...verdict })), null, 2));
    else {
      for (const { lock, verdict } of judged) log(`${verdict.state} ${lock.slug ?? '?'} · ${where(lock)} · ${verdict.why}`);
      log(judged.length ? `${judged.length} lock${judged.length === 1 ? '' : 's'}, ${judged.filter((j) => j.verdict.state === 'due').length} past their time` : 'no locks');
    }
    return 0;
  }
  const due = judged.filter((j) => j.verdict.state === 'due').map((j) => ({ ...j, action: action(j.lock) }));
  for (const { lock, verdict } of judged.filter((j) => j.verdict.state === 'bad')) log(`bad ${lock.slug ?? '?'} · ${where(lock)} · ${verdict.why}`);
  if (rest.includes('--json')) log(JSON.stringify(due.map(({ lock, verdict, action: a }) => ({ action: a, slug: lock.slug, file: lock.file, line: lock.line, fallback: lock.fallback, why: verdict.why })), null, 2));
  else for (const { lock, verdict, action: a } of due) log(`${a} ${lock.slug} · ${where(lock)} · ${verdict.why}${a === 'fallback' ? ` · fallback: ${lock.fallback}` : ''}`);
  if (rest.includes('--write')) {
    const released = due.filter((d) => d.action === 'release').map((d) => d.lock);
    if (released.length) {
      const next = release(files, released, { prefix: cfg.lanes.held });
      for (const rel of new Set(released.map((l) => l.file))) fs.writeFileSync(path.join(root, rel), next[rel]);
    }
    asks(due.filter((d) => d.action === 'ask'), { root, run, date, log });
  }
  if (!rest.includes('--json')) log(due.length ? `${due.length} of ${judged.length} locks past their time${rest.includes('--write') ? ', applied' : ''}` : 'clean');
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
