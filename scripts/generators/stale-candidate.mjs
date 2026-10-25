// scripts/generators/stale-candidate.mjs: an aged candidate no promote rule can reach becomes one needs-user ask.
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md). Aged promotion
// (scripts/plan/promote.mjs) moves a strong old candidate into the plan by itself only under `Promote: aged` or
// `autonomous`, in an owner checkout. Anywhere else (`Promote: owner`, or a contributor's checkout: pull-request mode)
// a Pending row in plan/CANDIDATES.md that scores at least `promote_floor` and is `promote_after_days` old waits on a
// person, so each one becomes the ask /expand's contributor path writes, deduped by title:
//
//   ### [needs-user-call] promote <title>?
//
// Best score first (ties: the oldest), at most --limit rows. Where promotion does reach them it files nothing.
//
//   node scripts/generators/stale-candidate.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isOwner } from '../owner.mjs';
import { daysBetween, knobs, parseCandidates } from '../plan/promote.mjs';
import { appendRows, stampLine, today } from '../plan/refill.mjs';

export const NAME = 'stale-candidate';

/** Why no promote rule reaches an aged candidate here, or null when aged promotion does. */
export function unreachable(k, owner) {
  if (k.promote === 'owner') return 'Promote: owner (only /oversight promotes)';
  if (!owner) return 'a contributor checkout (pull-request mode) never promotes';
  return null;
}

/** The heading an ask for `title` carries (the one /expand's contributor path writes). */
export const askHeading = (title) => `### [needs-user-call] promote ${title}?`;

/** Whether plan/AUDIT.md already asks about `title`, open or done. */
export function asked(audit, title) {
  const want = `[needs-user-call] promote ${title}?`;
  return audit.replace(/\r\n/g, '\n').split('\n').some((l) => /^###\s/.test(l) && l.includes(want));
}

/** The aged, strong Pending candidates not yet asked about, best first: [{ title, score, proposed, age }]. */
export function stale({ pending }, k, { date = today(), audit = '' } = {}) {
  return pending
    .filter((c) => c.proposed && c.score >= k.floor)
    .map((c) => ({ ...c, age: daysBetween(c.proposed, date) }))
    .filter((c) => c.age >= k.afterDays && !asked(audit, c.title))
    .sort((a, b) => b.score - a.score || a.proposed.localeCompare(b.proposed));
}

/** One needs-user ask for a stale candidate. */
export function row(c, k, why, date) {
  return [
    askHeading(c.title),
    '- category: needs-user',
    `- evidence: plan/CANDIDATES.md Pending row [score ${c.score}], proposed ${c.proposed} (${c.age}d, past promote_after_days ${k.afterDays}); ${why}.`,
    '- next: /oversight: promote it into a spec, or move it to ## Rejected with a reason.',
    stampLine(NAME, date),
  ];
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

export const USAGE = 'usage: stale-candidate.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]';

export function main(argv, { root = process.cwd(), log = console.log, owner = () => isOwner(root) } = {}) {
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
  const k = knobs(readSafe(path.join(root, 'plan', 'bearings.md')));
  let mine;
  try {
    mine = owner();
  } catch {
    mine = false;
  }
  const why = unreachable(k, mine);
  if (!why) {
    log(`aged promotion reaches these candidates (Promote: ${k.promote}, an owner checkout)`);
    log('clean');
    return 0;
  }
  const audit = path.join(root, 'plan', 'AUDIT.md');
  const auditText = readSafe(audit);
  const due = stale(parseCandidates(readSafe(path.join(root, 'plan', 'CANDIDATES.md'))), k, { date, audit: auditText }).slice(0, limit);
  const write = argv.includes('--write');
  for (const c of due) log(`${write ? 'ask' : 'would ask'} promote ${c.title}? · [score ${c.score}], ${c.age}d`);
  if (write && due.length) {
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(auditText, due.map((c) => row(c, k, why, date))));
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
