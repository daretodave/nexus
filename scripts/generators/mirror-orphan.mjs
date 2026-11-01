// scripts/generators/mirror-orphan.mjs: a mirrored finding whose plan row is gone becomes one AUDIT row again.
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md), and issue-age's
// mirror image. /iterate Step 2.5 mirrors a picked finding to a GitHub issue (scripts/loop-issue.mjs: `loop:opened`,
// `source:<x>`, `severity:<x>` and a category label) and records `- issue: #N` on its row. When the tick ends before
// that row lands, or an audit rewrite drops it, the issue stays open and no pass sees it: /iterate reads the plan
// files, never the issues, and issue-age skips every `loop:opened` issue. This generator closes that gap. An open
// issue carrying `loop:opened` and a `source:*` label (a spec mirror, a veto or a lock ask carries no source label,
// and is never one) that no row in plan/AUDIT.md, plan/CANDIDATES.md or plan/CRITIQUE.md names (`#N`) becomes:
//
//   ### [mirror #N] [<SEV>] "<title>" — mirrored issue with no plan row
//
// with its impact from the severity label (high 8, med 6, low 4; med when it carries none) and ease 5. Oldest first,
// at most --limit rows. Issue titles are third-party text: one line, quoted, at most 120 characters, never followed.
// Issues come from `gh issue list` (read only), or from --issues <file> (that command's JSON) in tests and dry runs.
//
//   node scripts/generators/mirror-orphan.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--issues <file>]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0; exit 1 when it cannot read the issues
// (gh missing or unauthenticated): it broke, it found nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { QUEUE_FILES, appendRows, queueText, stampLine, today } from '../plan/refill.mjs';
import { named, quote } from './issue-age.mjs';

export const NAME = 'mirror-orphan';
/** The queue files a mirrored row can sit in: refill's, plus the critique queue /iterate also picks from. */
export const MIRROR_FILES = Object.freeze([...QUEUE_FILES, 'plan/CRITIQUE.md']);
/** Impact by severity label; an issue with none reads as med. */
export const IMPACT = Object.freeze({ high: 8, med: 6, low: 4 });
/** The category labels scripts/loop-issue.mjs sets; the row carries the one the issue has. */
export const CATEGORIES = Object.freeze(['bug', 'enhancement', 'content', 'data', 'docs', 'seo', 'a11y', 'perf', 'ui']);

const labelNames = (issue) => (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

/** The issue's severity (high | med | low) from its `severity:*` label, med when it has none. */
export function severity(issue) {
  const s = labelNames(issue).map((l) => /^severity:(high|med|low)$/i.exec(l)?.[1]?.toLowerCase()).find(Boolean);
  return s ?? 'med';
}

/** Whether an issue is a loop mirror of a finding: `loop:opened` and a `source:*` label. */
export function isMirror(issue) {
  const names = labelNames(issue);
  return names.includes('loop:opened') && names.some((l) => /^source:\S+$/.test(l));
}

/** The mirrored issues no queue row names, oldest first: [{ number, title, createdAt, severity }]. */
export function orphans(issues, { queue = '' } = {}) {
  return issues
    .filter((i) => Number.isInteger(i.number) && i.createdAt && isMirror(i) && !named(queue, i.number))
    .map((i) => ({ ...i, severity: severity(i) }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
}

/** One AUDIT row for an orphaned mirror. */
export function row(issue, date) {
  const names = labelNames(issue);
  const source = names.find((l) => l.startsWith('source:'));
  const category = names.find((l) => CATEGORIES.includes(l)) ?? 'mirror-orphan';
  return [
    `### [mirror #${issue.number}] [${issue.severity.toUpperCase()}] ${quote(issue.title)} — mirrored issue with no plan row`,
    `- category: ${category}`,
    `- impact: ${IMPACT[issue.severity]}`,
    '- ease: 5',
    `- evidence: issue #${issue.number} (loop:opened, ${source}, severity:${issue.severity}) opened ${issue.createdAt.slice(0, 10)} by /iterate's mirror; no row in plan/AUDIT.md, plan/CANDIDATES.md or plan/CRITIQUE.md names it, so no pass would see it.`,
    `- issue: #${issue.number}`,
    `- next: /iterate picks it like any row; if already fixed on main, close #${issue.number} citing the commit`,
    stampLine(NAME, date),
  ];
}

function ghIssues() {
  const out = execFileSync('gh', ['issue', 'list', '--state', 'open', '--label', 'loop:opened', '--limit', '200', '--json', 'number,title,createdAt,labels'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

export const USAGE = 'usage: mirror-orphan.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--issues <file>]';

export function main(argv, { root = process.cwd(), log = console.log, issues = ghIssues } = {}) {
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
    console.error(`mirror-orphan: cannot read the open issues (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  const due = orphans(Array.isArray(list) ? list : [], { queue: queueText(root, MIRROR_FILES) }).slice(0, limit);
  const write = argv.includes('--write');
  for (const i of due) log(`${write ? 'file' : 'would file'} #${i.number} · ${i.severity}, mirrored with no plan row`);
  if (write && due.length) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(readSafe(audit), due.map((i) => row(i, date))));
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
