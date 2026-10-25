// scripts/generators/cli-deps.mjs: a packages/cli dependency a breaking release behind becomes one AUDIT row (nexus
// only, spec 57.9).
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md). It reads
// `npm outdated --json` in packages/cli and files one row per dependency, or devDependency, of
// packages/cli/package.json whose latest release is a breaking step past the one it pins: a higher major, or for a
// 0.x package a higher minor (0.0.x: a higher patch), as semver reads them. A step inside the same breaking line is
// not filed; the lockfile and the next bump carry it.
//
//   ### [cli-deps] [MED] <name> <pinned> -> <latest> in packages/cli
//
// Dedup: a Pending cli-deps row for the same name means the bump is open work, so nothing new; a row (Pending or
// Done) for the same name and the same breaking line of <latest> means it was filed once. A second run files
// nothing. Only names packages/cli/package.json declares are read from npm's output, and every version must read as
// semver, so the row carries nothing else of the registry's.
//
// The report comes from `npm outdated --json` (which exits 1 when anything is outdated; that is a report, not a
// failure), or from --outdated <file> (that command's JSON) in tests and dry runs.
//
//   node scripts/generators/cli-deps.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--outdated <file>]
//
// Without --write it writes nothing. Last line `filed N` or `clean`, exit 0; exit 1 when it cannot read the report
// (npm missing, offline, or output that is not JSON): it broke, it found nothing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendRows, queueText, stampLine, today } from '../plan/refill.mjs';

export const NAME = 'cli-deps';
const PKG = 'packages/cli/package.json';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const NAME_RE = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

/** A version's breaking line: [major] for >= 1, [0, minor] for 0.x, [0, 0, patch] for 0.0.x. null when not semver. */
export function breakingLine(version) {
  const m = SEMVER.exec(String(version ?? '').trim().replace(/^[\^~=v]+/, ''));
  if (!m) return null;
  const [maj, min, pat] = m.slice(1, 4).map(Number);
  return maj > 0 ? [maj] : min > 0 ? [0, min] : [0, 0, pat];
}

/** Whether `latest` sits on a later breaking line than `base`. */
export function breaking(base, latest) {
  const a = breakingLine(base);
  const b = breakingLine(latest);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return y > x;
  }
  return false;
}

const plain = (v) => String(v ?? '').trim().replace(/^[\^~=v]+/, '');

/**
 * The dependencies a breaking release behind, runtime first then by name: [{ name, type, pinned, latest, line }].
 * `pkg` is packages/cli/package.json's text, `report` npm outdated's JSON object.
 */
export function stale(pkg, report = {}) {
  const json = JSON.parse(pkg);
  const lines = pkg.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const type of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(json[type] ?? {})) {
      const r = report[name];
      if (!r || !NAME_RE.test(name)) continue;
      const pinned = SEMVER.test(plain(r.current)) ? plain(r.current) : plain(spec);
      const latest = plain(r.latest);
      if (!SEMVER.test(pinned) || !SEMVER.test(latest) || !breaking(pinned, latest)) continue;
      const at = lines.findIndex((l) => l.includes(`"${name}"`));
      out.push({ name, type, pinned, latest, line: at + 1 });
    }
  }
  return out;
}

const HEAD = /^### (?:\[x\] )?\[cli-deps\] \[\w+\] (\S+) \S+ -> (\S+)/;

/** The cli-deps rows in the queue text: [{ name, latest, pending }]. */
export function rows(queue = '') {
  const out = [];
  let section = '';
  for (const l of queue.replace(/\r\n/g, '\n').split('\n')) {
    if (/^## /.test(l)) section = l.slice(3).trim();
    const m = HEAD.exec(l);
    if (m) out.push({ name: m[1], latest: m[2], pending: /^Pending\b/.test(section) && !/^### \[x\]/.test(l) });
  }
  return out;
}

/** Whether a dependency is already filed: a Pending row for its name, or any row on the same breaking line. */
export function isFiled(dep, filedRows) {
  const line = String(breakingLine(dep.latest));
  return filedRows.some((r) => r.name === dep.name && (r.pending || String(breakingLine(r.latest)) === line));
}

/** One AUDIT row for a stale dependency. */
export function row(dep, date) {
  const runtime = dep.type === 'dependencies';
  return [
    `### [cli-deps] [MED] ${dep.name} ${dep.pinned} -> ${dep.latest} in packages/cli`,
    '- category: freshness',
    `- impact: ${runtime ? 6 : 4}`,
    '- ease: 5',
    `- evidence: npm outdated in packages/cli: ${dep.name} (${dep.type}) pins ${dep.pinned}, latest ${dep.latest}, a breaking release ahead.`,
    `- next: bump ${dep.name} at ${PKG}:${dep.line} to ${dep.latest}, read its release notes for what broke, npm install in packages/cli; then npm test and npm run build there.`,
    '- gate: npm --prefix packages/cli test',
    stampLine(NAME, date),
  ];
}

/** npm outdated --json in packages/cli: its JSON object. Exit 1 with JSON is a report; anything else throws. */
function npmOutdated(root) {
  const opts = { cwd: path.join(root, 'packages', 'cli'), encoding: 'utf8', timeout: 120000 };
  // npm is npm.cmd on Windows, which only a shell runs; the command is a constant, so the shell sees no input.
  const r = process.platform === 'win32' ? spawnSync('npm outdated --json', { ...opts, shell: true }) : spawnSync('npm', ['outdated', '--json'], opts);
  if (r.error) throw r.error;
  const text = (r.stdout ?? '').trim();
  if (r.status !== 0 && r.status !== 1) throw new Error(`npm outdated exited ${r.status}: ${String(r.stderr ?? '').trim().split('\n').pop()}`);
  if (!text) {
    if (r.status === 0) return {};
    throw new Error(`npm outdated exited 1 with no report: ${String(r.stderr ?? '').trim().split('\n').pop()}`);
  }
  const json = JSON.parse(text);
  if (json && json.error) throw new Error(`npm outdated: ${json.error.summary ?? json.error.code ?? 'error'}`);
  return json;
}

export const USAGE = 'usage: cli-deps.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--outdated <file>]';

export function main(argv, { root = process.cwd(), log = console.log, outdated = npmOutdated } = {}) {
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
  const pkgFile = path.join(root, PKG);
  if (!fs.existsSync(pkgFile)) {
    console.error(`cli-deps: no ${PKG}`);
    return 1;
  }
  let report;
  try {
    report = at('--outdated') ? JSON.parse(fs.readFileSync(path.resolve(root, at('--outdated')), 'utf8') || '{}') : outdated(root);
  } catch (e) {
    console.error(`cli-deps: cannot read npm outdated (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  const filedRows = rows(queueText(root));
  const due = stale(fs.readFileSync(pkgFile, 'utf8'), report && typeof report === 'object' ? report : {})
    .filter((d) => !isFiled(d, filedRows))
    .slice(0, limit);
  const write = argv.includes('--write');
  for (const d of due) log(`${write ? 'file' : 'would file'} ${d.name} ${d.pinned} -> ${d.latest}`);
  if (write && due.length) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    const text = fs.existsSync(audit) ? fs.readFileSync(audit, 'utf8') : '';
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(text, due.map((d) => row(d, date))));
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
