// scripts/generators/cli-ci-red.mjs: a red cli-ci run on main becomes one AUDIT HIGH row (nexus only, spec 57.9).
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md). cli-ci
// (.github/workflows/cli-ci.yml) tests and builds packages/cli on every push to main that touches it. When the
// newest decisive run on main (completed, not cancelled or skipped) failed, the red streak is every failed run since
// the last green one, and it becomes one row, keyed on the run that turned main red:
//
//   ### [cli-ci #<run id>] [HIGH] cli-ci red on main since <sha> (<n> red runs)
//
// A row that already names any run of the streak (`[cli-ci #<id>]`, Pending or Done) means the streak is filed: a
// second run files nothing, and a streak that outlives a fix files nothing new until main goes green and red again.
// Green, or no run yet, is `clean`. Commit titles are quoted as data, one line, at most 120 characters.
//
// Runs come from `gh run list` (read only), or from --runs <file> (that command's JSON) in tests and dry runs; the
// failed jobs' names from `gh run view <id> --json jobs`, best effort (or --jobs <file>, `{ "<id>": [names] }`).
//
//   node scripts/generators/cli-ci-red.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--runs <file>] [--jobs <file>]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0; exit 1 when it cannot read the runs
// (gh missing or unauthenticated): it broke, it found nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendRows, queueText, stampLine, today } from '../plan/refill.mjs';
import { quote } from './issue-age.mjs';

export const NAME = 'cli-ci-red';
export const WORKFLOW = 'cli-ci.yml';
const RED = new Set(['failure', 'timed_out', 'startup_failure']);
const NOT_DECISIVE = new Set(['cancelled', 'skipped', 'neutral', 'stale', '', null, undefined]);

/** The red streak on main, newest first: every failed run since the newest green one. [] when main is green. */
export function redStreak(runs = []) {
  const done = runs
    .filter((r) => r && Number.isInteger(r.databaseId) && r.status === 'completed' && !NOT_DECISIVE.has(r.conclusion))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.databaseId - a.databaseId);
  const streak = [];
  for (const r of done) {
    if (!RED.has(r.conclusion)) break;
    streak.push(r);
  }
  return streak;
}

/** Whether a queue row already names one of these runs as a cli-ci row (`[cli-ci #<id>]`). */
export function filed(queue, streak) {
  return streak.some((r) => new RegExp(`\\[cli-ci #${r.databaseId}(?!\\d)\\]`).test(queue));
}

const sha = (r) => String(r.headSha ?? '').slice(0, 7) || 'unknown';

/** The one AUDIT HIGH row for a red streak (newest first). */
export function row(streak, jobs, date) {
  const first = streak[streak.length - 1];
  const last = streak[0];
  const n = streak.length;
  const names = (jobs ?? []).filter((j) => /^[\w .:()/-]{1,80}$/.test(j));
  return [
    `### [cli-ci #${first.databaseId}] [HIGH] cli-ci red on main since ${sha(first)} (${n} red run${n === 1 ? '' : 's'})`,
    '- category: cli-ci',
    '- impact: 9',
    '- ease: 6',
    `- evidence: cli-ci run ${last.databaseId} (${last.url ?? 'no url'}) concluded ${last.conclusion} at ${sha(last)} ${quote(last.displayTitle ?? '')}`
      + `${names.length ? `; failed jobs: ${names.join(', ')}` : ''}; red since run ${first.databaseId} on ${String(first.createdAt).slice(0, 10)}.`,
    '- next: reproduce at main with `npm --prefix packages/cli test` and `npm --prefix packages/cli run build`, fix it in packages/cli; the run\'s log names the failing step.',
    '- gate: npm --prefix packages/cli test',
    stampLine(NAME, date),
  ];
}

function ghRuns() {
  const out = execFileSync('gh', ['run', 'list', '--workflow', WORKFLOW, '--branch', 'main', '--limit', '30', '--json', 'databaseId,status,conclusion,headSha,createdAt,url,displayTitle'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

/** The names of a run's failed jobs, best effort: [] when gh cannot say. */
function ghJobs(id) {
  try {
    const out = execFileSync('gh', ['run', 'view', String(id), '--json', 'jobs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return (JSON.parse(out).jobs ?? []).filter((j) => RED.has(j.conclusion)).map((j) => String(j.name));
  } catch {
    return [];
  }
}

export const USAGE = 'usage: cli-ci-red.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--runs <file>] [--jobs <file>]';

export function main(argv, { root = process.cwd(), log = console.log, runs = ghRuns, jobs = ghJobs } = {}) {
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
  let list;
  try {
    list = at('--runs') ? JSON.parse(fs.readFileSync(path.resolve(root, at('--runs')), 'utf8')) : runs();
  } catch (e) {
    console.error(`cli-ci-red: cannot read the cli-ci runs (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  const streak = redStreak(Array.isArray(list) ? list : []);
  if (!streak.length) {
    log('cli-ci is green on main (or has no run yet)');
    log('clean');
    return 0;
  }
  if (filed(queueText(root), streak)) {
    log(`cli-ci red since run ${streak[streak.length - 1].databaseId}: already filed`);
    log('clean');
    return 0;
  }
  if (limit < 1) {
    log('no room under the target or the cap');
    log('clean');
    return 0;
  }
  let names = [];
  if (at('--jobs')) {
    try {
      names = JSON.parse(fs.readFileSync(path.resolve(root, at('--jobs')), 'utf8'))[String(streak[0].databaseId)] ?? [];
    } catch { names = []; }
  } else names = jobs(streak[0].databaseId);
  const write = argv.includes('--write');
  log(`${write ? 'file' : 'would file'} cli-ci red since run ${streak[streak.length - 1].databaseId} (${streak.length} red)`);
  if (write) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    const text = fs.existsSync(audit) ? fs.readFileSync(audit, 'utf8') : '';
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(text, [row(streak, names, date)]));
  }
  log(`filed 1${write ? '' : ' (dry run)'}`);
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
