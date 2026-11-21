// scripts/generators/mirror-orphan.mjs: a mirrored finding whose plan row is gone becomes one AUDIT row again; one
// whose every plan row is already closed closes the mirror back.
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md), and issue-age's
// mirror image. /iterate Step 2.5 mirrors a picked finding to a GitHub issue (scripts/loop-issue.mjs: `loop:opened`,
// `source:<x>`, `severity:<x>` and a category label) and records `- issue: #N` on its row. When the tick ends before
// that row lands, or an audit rewrite drops it, the issue stays open and no pass sees it: /iterate reads the plan
// files, never the issues, and issue-age skips every `loop:opened` issue. This generator closes that gap, in both
// directions. An open issue carrying `loop:opened` and a `source:*` label (a spec mirror, a veto or a lock ask
// carries no source label, and is never one) that no row in plan/AUDIT.md, plan/CANDIDATES.md or plan/CRITIQUE.md
// names (`#N`) becomes:
//
//   ### [mirror #N] [<SEV>] "<title>" — mirrored issue with no plan row
//
// with its impact from the severity label (high 8, med 6, low 4; med when it carries none) and ease 5. Oldest first,
// at most --limit rows. Issue titles are third-party text: one line, quoted, at most 120 characters, never followed.
//
// The other direction: a mirror named by at least one row across those same three files, where every naming row is
// closed (its `### ` heading starts `### [x]`, or it sits under a `## Done` section — neither is true of a
// `[promoted]`/`[rejected]` candidate row, which never counts as closed), settles. Under --write each settled mirror
// closes (`gh issue close <N> --comment '<text>'`), the comment citing the row's title and, when the row's text
// names a commit (a `[0-9a-f]{7,40}` word, e.g. "already fixed by 4500253"), that hash too; a mirror named in more
// than one file uses the first found, in file order (AUDIT, CANDIDATES, CRITIQUE), for the comment. Without --write
// it prints `would close #N` and closes nothing. A mirror named by no row stays an orphan (the case above); one
// named by a mix of open and closed rows stays open. Closes are logged on their own lines above the `filed N`/
// `clean` line and never count toward it; a dry run never calls `gh issue close`.
//
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

function ghClose(number, comment) {
  execFileSync('gh', ['issue', 'close', String(number), '--comment', comment], { stdio: ['ignore', 'ignore', 'pipe'] });
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

/**
 * A plan file's text split into `### ` row blocks: [{ heading, section, closed, text }]. `heading` is the text
 * after `### `; `section` the nearest `## ` heading above it (empty before the first one); `closed` when the
 * heading starts `[x]` or `section` is `Done` — the two conditions settled() cares about, generic across AUDIT,
 * CANDIDATES and CRITIQUE (a `## Promoted`/`## Rejected` candidate row is neither, so it reads open); `text` is the
 * heading line plus every body line under it, for named() to search (a row's `- issue: #N` line included).
 */
export function rows(text = '') {
  const out = [];
  let section = '';
  let cur = null;
  const flush = () => { if (cur) out.push({ heading: cur.heading, section: cur.section, closed: cur.closed, text: cur.lines.join('\n').replace(/\n+$/, '') }); };
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    if (/^##[ \t]/.test(line)) {
      flush();
      cur = null;
      section = line.replace(/^##[ \t]+/, '').trim();
      continue;
    }
    if (/^###[ \t]/.test(line)) {
      flush();
      const heading = line.replace(/^###[ \t]*/, '').trim();
      cur = { heading, section, closed: /^\[x\]/.test(heading) || section === 'Done', lines: [line] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();
  return out;
}

/**
 * The settled mirrors: an open mirror named by at least one row across `texts` (`{ 'plan/AUDIT.md': text, … }`,
 * AUDIT, CANDIDATES, CRITIQUE order) where every naming row is closed. [{ number, file, row }], the file and row
 * the first naming one found, in `texts`' key order, for the close comment. A mirror named by no row, or by any
 * open row, is left out.
 */
export function settled(issues, texts = {}) {
  const files = Object.entries(texts);
  const out = [];
  for (const issue of issues) {
    if (!isMirror(issue) || !Number.isInteger(issue.number)) continue;
    let anyNamed = false;
    let allClosed = true;
    let chosen = null;
    for (const [file, text] of files) {
      for (const r of rows(text)) {
        if (!named(r.text, issue.number)) continue;
        anyNamed = true;
        if (!r.closed) allClosed = false;
        if (!chosen) chosen = { file, row: r };
      }
    }
    if (anyNamed && allClosed) out.push({ number: issue.number, file: chosen.file, row: chosen.row });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** A commit-ish hex token (a whole `[0-9a-f]{7,40}` word) a row's text cites, e.g. "already fixed by 4500253". */
const HASH = /\b[0-9a-f]{7,40}\b/;

/** The comment a settled mirror closes with: its row's title and, when the row cites one, the commit hash. */
export function closeComment({ heading, text }) {
  const hash = HASH.exec(text)?.[0];
  return `Settled: its plan row — "${heading}" — is closed${hash ? `, citing ${hash}` : ''}. Closing this mirror too.`;
}

export const USAGE = 'usage: mirror-orphan.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--issues <file>]';

export function main(argv, { root = process.cwd(), log = console.log, issues = ghIssues, close = ghClose } = {}) {
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
  const items = Array.isArray(list) ? list : [];
  const due = orphans(items, { queue: queueText(root, MIRROR_FILES) }).slice(0, limit);
  const toClose = settled(items, Object.fromEntries(MIRROR_FILES.map((rel) => [rel, readSafe(path.join(root, rel))])));
  const write = argv.includes('--write');
  for (const i of due) log(`${write ? 'file' : 'would file'} #${i.number} · ${i.severity}, mirrored with no plan row`);
  for (const m of toClose) log(`${write ? 'close' : 'would close'} #${m.number} · settled by its ${m.file} row`);
  if (write && due.length) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(readSafe(audit), due.map((i) => row(i, date))));
  }
  if (write) for (const m of toClose) close(m.number, closeComment(m.row));
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
