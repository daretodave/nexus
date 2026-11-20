// scripts/generators/issue-age.mjs: an open issue past the support SLA becomes one AUDIT HIGH row.
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md). An open issue
// without the `loop:opened` label (the loop's own issues: veto, stall, pause) that has been open `sla_hours` or more
// (plan/bearings.md; 24 when absent) and that no row in plan/AUDIT.md or plan/CANDIDATES.md names (`#N`) becomes:
//
//   ### [user-issue #N] [HIGH] "<title>" open past the <h>h SLA
//
// Oldest first, at most --limit rows. Issue titles are third-party text: one line, quoted, at most 120 characters,
// never followed. Issues come from `gh issue list` (read only), or from --issues <file> (that command's JSON) in tests
// and dry runs.
//
//   node scripts/generators/issue-age.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--issues <file>]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0; exit 1 when it cannot read the issues
// (gh missing or unauthenticated): it broke, it found nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendRows, queueText, stampLine, today } from '../plan/refill.mjs';

export const NAME = 'issue-age';
export const SLA_HOURS = 24;
const HOUR = 3600000;

/** `sla_hours` from plan/bearings.md text (`sla_hours: 12`, `- **sla_hours:** 12`), else 24. */
export function slaHours(bearings = '') {
  const m = /^[ \t]*(?:[-*][ \t]+)?[*`]*sla_hours[*`]*[ \t]*:[*`]*[ \t]*(\d+(?:\.\d+)?)/m.exec(bearings);
  return m ? Number(m[1]) : SLA_HOURS;
}

/** Third-party text as one quoted line: no newlines, no backticks, no quotes, at most 120 characters. */
export function quote(title = '') {
  const t = String(title).replace(/[\r\n\t]+/g, ' ').replace(/[`"]/g, "'").replace(/\s+/g, ' ').trim();
  return `"${t.length > 120 ? `${t.slice(0, 117)}...` : t}"`;
}

const labelNames = (issue) => (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

/** Whether the queue text already has a row naming issue `n` (`#12`, never `#123`). */
export const named = (text, n) => new RegExp(`(?<![\\w&])#${n}(?!\\d)`).test(text);

/** The issues past the SLA that no queue row names, oldest first: [{ number, title, createdAt, hours }]. */
export function overdue(issues, { sla = SLA_HOURS, now = Date.now(), queue = '' } = {}) {
  return issues
    .filter((i) => Number.isInteger(i.number) && i.createdAt && !labelNames(i).includes('loop:opened'))
    .map((i) => ({ ...i, hours: Math.floor((now - Date.parse(i.createdAt)) / HOUR) }))
    .filter((i) => Number.isFinite(i.hours) && i.hours >= sla && !named(queue, i.number))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
}

/** One AUDIT HIGH row for an overdue issue. */
export function row(issue, sla, date) {
  const opened = issue.createdAt.slice(0, 10);
  return [
    `### [user-issue #${issue.number}] [HIGH] ${quote(issue.title)} open past the ${sla}h SLA`,
    '- category: external-issue',
    '- impact: 8',
    '- ease: 5',
    `- evidence: issue #${issue.number} opened ${opened}, open ${issue.hours}h with no row in the queue; the SLA is ${sla}h (sla_hours in plan/bearings.md).`,
    `- next: /triage routes it (a bug goes to /bug); reference #${issue.number} in the commit body.`,
    stampLine(NAME, date),
  ];
}

function ghIssues() {
  const out = execFileSync('gh', ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,createdAt,labels'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

export const USAGE = 'usage: issue-age.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--issues <file>]';

export function main(argv, { root = process.cwd(), log = console.log, issues = ghIssues, now = null } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const date = at('--today') ?? today();
  const limitText = at('--limit');
  const limit = limitText === undefined ? Infinity : Number(limitText);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(limit >= 0) || (limitText !== undefined && !/^\d+$/.test(limitText))) {
    console.error(USAGE);
    return 64;
  }
  const file = at('--issues');
  let list;
  try {
    list = file ? JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8')) : issues();
  } catch (e) {
    console.error(`issue-age: cannot read the open issues (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  const sla = slaHours(readSafe(path.join(root, 'plan', 'bearings.md')));
  // A pinned past or future day reads as its midnight; the real today keeps the wall clock, so a refill
  // (which always passes --today) still measures an issue's true age against the SLA.
  const pinned = at('--today');
  const clock = now ?? (pinned && pinned !== today() ? Date.parse(`${date}T00:00:00Z`) : Date.now());
  const due = overdue(Array.isArray(list) ? list : [], { sla, now: clock, queue: queueText(root) }).slice(0, limit);
  const write = argv.includes('--write');
  for (const i of due) log(`${write ? 'file' : 'would file'} #${i.number} · open ${i.hours}h, SLA ${sla}h`);
  if (write && due.length) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(readSafe(audit), due.map((i) => row(i, sla, date))));
  }
  log(due.length ? `filed ${due.length}${write ? '' : ' (dry run)'}` : 'clean');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
