// scripts/plan/state.mjs: the state diet. The queues every tick reads stay small enough to read.
//
// plan/AUDIT.md, plan/CANDIDATES.md and plan/CRITIQUE.md are read by nearly every tick, so whatever they carry, every
// tick pays for. Three rules (concepts/plan-shape.md, "State diet"):
//
//   - The header (every line above the first `## ` heading) holds the title, the `> Last pass:`, `> Pass count:` and
//     `> Posture:` lines (AUDIT.md's durable `> Bias:` line too) and at most a short pointer: 20 lines or fewer. A
//     pass's narrative goes in its commit body, never the header.
//   - A queue file weighs at most NEXUS_STATE_MAX_KB kilobytes (default 256).
//   - A Done row closed more than 30 days ago is deleted. Git keeps it, and the commit body gives the count. It never
//     moves to ARCHIVE.md, whose lines are chunk-shaped and parsed by the gate.
//
// A Done row is a `### [x]` row, or any `###` row under a `## Done` heading; it runs to the next heading. Its close
// date is, in order: a `closed <YYYY-MM-DD>` it carries; the day its heading line last changed (`git blame`, the
// commit that ticked it or moved it to Done); the latest date it carries. A row with no date at all stays.
//
//   node scripts/plan/state.mjs check                                          (exit 1 on a breach; the state-size leg)
//   node scripts/plan/state.mjs compact [--write] [--today YYYY-MM-DD] [--days N]
//
// `compact` prints one `<file>: N Done rows older than D days` line per file with any, then `removed N` (with
// --write) or `would remove N`, or `clean`. Without --write it writes nothing. Exit 0; 1 when `check` finds a breach;
// 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { daysBetween, today } from './promote.mjs';

export const QUEUE_FILES = Object.freeze(['plan/AUDIT.md', 'plan/CANDIDATES.md', 'plan/CRITIQUE.md']);
export const HEADER_MAX = 20;
export const STATE_MAX_KB = 256;
export const DONE_DAYS = 30;

const USAGE = 'usage: node scripts/plan/state.mjs check | compact [--write] [--today YYYY-MM-DD] [--days N]';
const DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;

/** The kilobyte ceiling: NEXUS_STATE_MAX_KB when it is a positive number, else 256. */
export function maxKb(env = process.env) {
  const n = Number(env.NEXUS_STATE_MAX_KB);
  return Number.isFinite(n) && n > 0 ? n : STATE_MAX_KB;
}

/** The header's line count: the lines above the first `## ` heading (the whole file without one), trailing blanks left out. */
export function headerLines(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let fence = false;
  let end = lines.findIndex((l) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    return !fence && /^## /.test(l);
  });
  if (end < 0) end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return end;
}

/** The breaches in one queue file's text: a header over HEADER_MAX lines, a body over `kb` kilobytes. */
export function checkText(text, rel, { kb = STATE_MAX_KB, bytes = Buffer.byteLength(text) } = {}) {
  const problems = [];
  const head = headerLines(text);
  if (head > HEADER_MAX) problems.push(`${rel}: header is ${head} lines (at most ${HEADER_MAX}: the title, Last pass, Pass count, Posture; the pass narrative goes in the commit body)`);
  if (bytes > kb * 1024) problems.push(`${rel}: ${Math.ceil(bytes / 1024)} KB (at most ${kb} KB, NEXUS_STATE_MAX_KB): drain it (node scripts/plan/state.mjs compact --write deletes Done rows past ${DONE_DAYS} days)`);
  return problems;
}

/** Every queue file under `dir` (a repo root, or a templates/ copy) checked; a missing file is no breach. */
export function checkState(dir, { kb = maxKb(), files = QUEUE_FILES, label = '' } = {}) {
  const problems = [];
  let checked = 0;
  for (const rel of files) {
    const abs = path.join(dir, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    checked++;
    const buf = fs.readFileSync(abs);
    problems.push(...checkText(buf.toString('utf-8'), `${label}${rel}`, { kb, bytes: buf.length }));
  }
  return { problems, checked };
}

/** The Done rows in a queue file: { start, end, heading, date } (0-based line indexes, end exclusive). */
export function doneRows(text, { blame = () => null } = {}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  // A `#` line inside a code fence is a comment, not a heading.
  const heading = [];
  let fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    heading.push(!fence && /^#{1,3} /.test(l));
  }
  const rows = [];
  let inDone = false;
  for (let i = 0; i < lines.length; i++) {
    if (!heading[i]) continue;
    if (/^## /.test(lines[i])) inDone = /^## Done\b/.test(lines[i]);
    if (!/^### /.test(lines[i])) continue;
    if (!inDone && !/^### \[x\]/i.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !heading[end]) end++;
    const body = lines.slice(i, end).join('\n');
    const closed = /\bclosed:?\s+(\d{4}-\d{2}-\d{2})\b/.exec(body)?.[1];
    const dates = [...body.matchAll(DATE)].map((m) => m[1]).sort();
    rows.push({ start: i, end, heading: lines[i], date: closed ?? blame(i + 1) ?? dates.at(-1) ?? null });
  }
  return rows;
}

/** `text` without its Done rows closed more than `days` before `date`: { text, removed } (removed: the rows). */
export function compactText(text, { date = today(), days = DONE_DAYS, blame } = {}) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const removed = doneRows(text, { blame }).filter((r) => r.date && daysBetween(r.date, date) > days);
  if (!removed.length) return { text, removed };
  const drop = new Set(removed.flatMap((r) => Array.from({ length: r.end - r.start }, (_, k) => r.start + k)));
  const kept = lines.filter((_, i) => !drop.has(i));
  return { text: kept.join(eol), removed };
}

/** `git blame` of a file: line number (1-based) -> the YYYY-MM-DD of the commit that last changed it; null outside git. */
export function gitBlame(root, rel, run = spawnSync) {
  const r = run('git', ['blame', '--line-porcelain', '--', rel], { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (!r || r.status !== 0 || typeof r.stdout !== 'string') return () => null;
  const byLine = new Map();
  let line = 0;
  let time = null;
  for (const l of r.stdout.split('\n')) {
    const head = /^[0-9a-f]{40} \d+ (\d+)/.exec(l);
    if (head) {
      line = Number(head[1]);
      time = null;
    } else if (l.startsWith('committer-time ')) time = Number(l.slice(15));
    else if (l.startsWith('\t') && line && time) byLine.set(line, new Date(time * 1000).toISOString().slice(0, 10));
  }
  return (n) => byLine.get(n) ?? null;
}

export function main(argv, { root = process.cwd(), env = process.env, log = console.log, blame = (rel) => gitBlame(root, rel) } = {}) {
  const [cmd, ...rest] = argv;
  const at = (flag) => {
    const i = rest.indexOf(flag);
    return i < 0 ? undefined : rest[i + 1];
  };
  const valued = new Set(['--today', '--days']);
  const known = new Set([...valued, '--write']);
  const bad = rest.some((a, i) => (a.startsWith('--') ? !known.has(a) : !valued.has(rest[i - 1])));
  const date = at('--today') ?? today();
  const days = Number(at('--days') ?? DONE_DAYS);
  if (!['check', 'compact'].includes(cmd) || bad || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days) || days < 0 || (cmd === 'check' && rest.length)) {
    console.error(USAGE);
    return 64;
  }
  if (cmd === 'check') {
    const { problems, checked } = checkState(root, { kb: maxKb(env) });
    for (const p of problems) log(p);
    log(problems.length ? `${problems.length} breach${problems.length === 1 ? '' : 'es'}` : `clean (${checked} queue files, headers <= ${HEADER_MAX} lines, <= ${maxKb(env)} KB)`);
    return problems.length ? 1 : 0;
  }
  let total = 0;
  for (const rel of QUEUE_FILES) {
    const abs = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf-8');
    const { text: next, removed } = compactText(text, { date, days, blame: blame(rel) });
    if (!removed.length) continue;
    total += removed.length;
    log(`${rel}: ${removed.length} Done row${removed.length === 1 ? '' : 's'} older than ${days} days`);
    if (rest.includes('--write')) fs.writeFileSync(abs, next);
  }
  log(total ? `${rest.includes('--write') ? 'removed' : 'would remove'} ${total}` : 'clean');
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
