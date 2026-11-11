// scripts/changelog-check.mjs: the verify gate's CHANGELOG.md leg (spec 61, A3).
//
// CHANGELOG.md's own header promises one dated entry per commit that touches templates/**, keyed by the path it
// touched. A commit that touches templates/** with no entry naming at least one of those paths loses the "why" a
// three-way merge can't carry on its own. The gate reads the same scope secrets-scan.mjs does: the working tree
// against HEAD, plus the untracked files — what the next commit can hold.
import { spawnSync } from 'node:child_process';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function gitRun(root) {
  return (args) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    if (r.error || r.status !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`);
    return r.stdout;
  };
}

/** The templates/** paths the next commit would hold changed: the working tree vs HEAD, plus untracked files. */
export function touchedTemplates({ root, git = gitRun(root) }) {
  let base = 'HEAD';
  try { git(['rev-parse', '--verify', '-q', 'HEAD']); } catch { base = EMPTY_TREE; }
  const diffed = git(['diff', '--no-color', '--name-only', base]).split('\n').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [...new Set([...diffed, ...untracked])].filter((f) => f.startsWith('templates/'));
}

/** The paths CHANGELOG.md's entries key: the text before the first colon on each top-level `- ` bullet line. */
export function changelogPaths(text = '') {
  const out = new Set();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^-\s+(\S[^:]*):/.exec(line);
    if (m) out.add(m[1].trim());
  }
  return out;
}

/** Null when every touched path is covered, or no path was touched; else the touched paths with no entry naming
 * any of them (the gate needs only one covered path per commit — CHANGELOG.md's header: "one entry per commit"). */
export function missingChangelog(touched, changelogText) {
  if (!touched.length) return null;
  const covered = changelogPaths(changelogText);
  return touched.some((f) => covered.has(f)) ? null : touched;
}
