// scripts/generators/motion.mjs: a stalled motion pulse becomes one AUDIT HIGH row about the loop itself.
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md). It reads the motion
// pulse (`node scripts/pulse.mjs --motion`, scripts/plan/motion.mjs): when the last full ISO week shipped under the
// `Motion floor`, and no queue row already names that week, it files
//
//   ### [loop] [HIGH] motion stalled in <week>: <n> shipped against a 4-week baseline of <mean>
//
// so the next /iterate looks at why the loop runs and ships nothing (no ready chunk, a silted Pending, a lock with no
// way out) instead of polishing. One row a week at most; an ok pulse files nothing.
//
//   node scripts/generators/motion.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0; exit 1 when it cannot read the history
// (not a git checkout): it broke, it found nothing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lines, measure } from '../plan/motion.mjs';
import { appendRows, queueText, stampLine, today } from '../plan/refill.mjs';

export const NAME = 'motion';

/** The heading a stalled week's row carries; its `motion stalled in <week>` part is the dedup key. */
export const heading = (r) => `### [loop] [HIGH] motion stalled in ${r.week}: ${r.shipped} shipped against a 4-week baseline of ${r.baseline}`;

/** Whether the queue text already has a row for `week`. */
export const filed = (queue, week) => queue.includes(`motion stalled in ${week}:`);

/** The row for a stalled report. */
export function row(r, date) {
  return [
    heading(r),
    '- category: loop',
    '- impact: 8',
    '- ease: 5',
    `- evidence: node scripts/pulse.mjs --motion: ${lines(r).join('; ')}.`,
    '- next: /iterate: find what keeps the loop from shipping (no ready chunk, a silted candidates queue, a lock with no fallback) and move it: build the top Pending row, ask /oversight to promote a candidate, or name the plan/bearings.md lever (Motion floor, stall_action, Promote) to retune.',
    stampLine(NAME, date),
  ];
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

export const USAGE = 'usage: motion.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]';

export function main(argv, { root = process.cwd(), log = console.log, measureFn = measure } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const date = at('--today') ?? today();
  const limitText = at('--limit');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (limitText !== undefined && !/^\d+$/.test(limitText))) {
    console.error(USAGE);
    return 64;
  }
  const limit = limitText === undefined ? Infinity : Number(limitText);
  let r;
  try {
    r = measureFn(root, { date });
  } catch (e) {
    console.error(`motion: cannot read the history (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  for (const l of lines(r)) log(l);
  const due = r.verdict === 'stalled' && limit > 0 && !filed(queueText(root), r.week);
  const write = argv.includes('--write');
  if (due) log(`${write ? 'file' : 'would file'} motion stalled in ${r.week}`);
  if (write && due) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(readSafe(audit), [row(r, date)]));
  }
  log(due ? `filed 1${write ? '' : ' (dry run)'}` : 'clean');
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
