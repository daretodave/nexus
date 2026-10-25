// scripts/plan/unreleased.mjs: the CLI commits main holds that npm does not (spec 56.8, /digest's
// "Unreleased CLI fixes" section).
//
// A cloud GUI fix reaches main, not npm: only the owner tags `cli-v*` (publish.yml). This lists every commit that
// touches packages/cli on <ref> since the newest `cli-v*` tag reachable from it, so the morning digest can say what a
// tag would ship. No tag reachable means every packages/cli commit is unreleased.
//
//   node scripts/plan/unreleased.mjs [--ref <ref>] [--json]
//
// Prints `unreleased CLI fixes: <n> since <tag>` (or `none since <tag>`), then one `<sha> <subject>` line per commit,
// newest first. --json prints `{ tag, ref, commits: [{ sha, subject }] }`. Reads git locally, never the network;
// a checkout with no history to read prints `unreadable` and still exits 0 (a report, never a gate); 64 on bad usage.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TAG_GLOB = 'cli-v*';
export const CLI_PATH = 'packages/cli';

/** `git log --format=%h%x09%s` output as `[{ sha, subject }]`, blank lines dropped. */
export function parseLog(text = '') {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const tab = l.indexOf('\t');
      return tab < 0 ? { sha: l.trim(), subject: '' } : { sha: l.slice(0, tab).trim(), subject: l.slice(tab + 1).trim() };
    });
}

/** The report's lines: the count line, then one line per commit. */
export function format({ tag, commits }) {
  const since = tag ? `since ${tag}` : 'and no cli-v* tag yet';
  if (!commits.length) return [`unreleased CLI fixes: none ${since}`];
  return [`unreleased CLI fixes: ${commits.length} ${since}`, ...commits.map((c) => `  ${c.sha} ${c.subject}`)];
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
}

/** The newest cli-v* tag reachable from `ref` and the packages/cli commits after it; null when git cannot answer. */
export function unreleased({ cwd, ref = 'HEAD' }) {
  if (!git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok) return null;
  const described = git(cwd, ['describe', '--tags', '--abbrev=0', '--match', TAG_GLOB, ref]);
  const tag = described.ok && described.out ? described.out : null;
  const range = tag ? `${tag}..${ref}` : ref;
  const log = git(cwd, ['log', '--format=%h%x09%s', range, '--', CLI_PATH]);
  if (!log.ok) return null;
  return { tag, ref, commits: parseLog(log.out) };
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), out = console.log } = {}) {
  let ref = 'HEAD';
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--ref' && argv[i + 1]) ref = argv[++i];
    else {
      out(`usage: node scripts/plan/unreleased.mjs [--ref <ref>] [--json]`);
      return 64;
    }
  }
  const result = unreleased({ cwd, ref });
  if (!result) {
    out(json ? JSON.stringify({ tag: null, ref, commits: null }) : `unreleased CLI fixes: unreadable (no git history at ${ref})`);
    return 0;
  }
  if (json) out(JSON.stringify(result));
  else for (const line of format(result)) out(line);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  process.exit(main(process.argv.slice(2), { cwd: root }));
}
