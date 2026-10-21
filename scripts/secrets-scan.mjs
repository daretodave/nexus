// scripts/secrets-scan.mjs: the gate's rail. A diff that adds a vault value is refused before it is committed: the
// value would be in git history (and on GitHub) for good. The rule: the model sees names, never values, so a hit is
// reported by file, line and secret name, never by what it holds.
//
// The gate runs it on the working tree against HEAD plus the untracked files (what the next commit can hold);
// `--staged` scans only what is staged. A value shorter than MIN_SECRET characters isn't scanned (or masked by
// `secrets run`, or refused on a command line by the guard hook), nor is a value shaped like configuration: one plain
// word (production), a number, a localhost URL. Each is too likely to match ordinary text, and no real token looks
// like one. No vault, nothing to scan.
// The command line: `node scripts/secrets.mjs scan [--staged]`; the how: nexus/customization/secrets.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MIN_SECRET = 8;
const PLAIN = /^(?:[A-Za-z]+|\d+|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?)$/;

/** A value worth scanning for: MIN_SECRET characters or more, and not shaped like configuration. */
export const isSecretShaped = (v) => typeof v === 'string' && v.length >= MIN_SECRET && !PLAIN.test(v);
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_FILE = 2 * 1024 * 1024;

/** The values worth scanning for, longest first (so a value inside another is named by the longer one). */
export function scannable(values) {
  return [...values].filter(([, v]) => isSecretShaped(v)).sort((a, b) => b[1].length - a[1].length);
}

/** The names whose value appears in a text. */
export function findValues(text, values) {
  return scannable(values).filter(([, v]) => text.includes(v)).map(([n]) => n);
}

/** Every value in a text replaced by `[secret NAME]`. */
export function maskText(text, values) {
  let out = text;
  for (const [n, v] of scannable(values)) out = out.split(v).join(`[secret ${n}]`);
  return out;
}

/** The lines a unified diff adds: [{ file, line, text }]. Removed and context lines don't count. */
export function addedLines(diff) {
  const out = [];
  let file = null;
  let line = 0;
  for (const raw of diff.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('+++ ')) { const f = raw.slice(4).trim(); file = f === '/dev/null' ? null : f.replace(/^"?b\//, '').replace(/"$/, ''); continue; }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (raw.startsWith('+')) { out.push({ file, line, text: raw.slice(1) }); line++; } else if (raw.startsWith(' ')) line++;
  }
  return out;
}

/** Hits in a list of [{ file, line, text }]: [{ file, line, name }]. */
export function scanLines(lines, values) {
  const list = scannable(values);
  const hits = [];
  if (!list.length) return hits;
  for (const l of lines) for (const [n, v] of list) if (l.text.includes(v)) { hits.push({ file: l.file, line: l.line, name: n }); break; }
  return hits;
}

export const scanDiff = (diff, values) => scanLines(addedLines(diff), values);

/** A whole file's lines, as a diff that adds it would show them. */
export function fileLines(file, text) {
  return text.replace(/\r\n/g, '\n').split('\n').map((t, i) => ({ file, line: i + 1, text: t }));
}

/** Every value the vault holds, by name: the declared names and any name its files hold (vault: secrets-vault.mjs). */
export function vaultValues(vault, declared = []) {
  const names = vault.status(declared).filter((r) => r.rings.length).map((r) => r.name);
  return vault.resolve(names).values;
}

function gitRun(root) {
  return (args) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    if (r.error || r.status !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`);
    return r.stdout;
  };
}

/** Scan a checkout: the staged diff, or the working tree against HEAD plus the untracked files. Returns
 * { hits, scanned } (scanned: how many added lines were read). `git` is a seam for tests. */
export function scanRepo({ root, values, staged = false, git = gitRun(root) }) {
  const diffArgs = ['diff', '--no-color', '--no-ext-diff', '--unified=0', '--text'];
  let base = 'HEAD';
  try { git(['rev-parse', '--verify', '-q', 'HEAD']); } catch { base = EMPTY_TREE; }
  const lines = addedLines(git(staged ? [...diffArgs, '--cached', base] : [...diffArgs, base]));
  if (!staged) {
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    for (const rel of untracked) {
      let buf;
      try { const abs = path.join(root, rel); if (fs.statSync(abs).size > MAX_FILE) continue; buf = fs.readFileSync(abs); } catch { continue; }
      if (buf.includes(0)) continue;
      lines.push(...fileLines(rel, buf.toString('utf8')));
    }
  }
  return { hits: scanLines(lines, values), scanned: lines.length };
}

/** One line per hit, never a value. */
export const describeHit = (h) => `${h.file ?? '(unknown file)'}:${h.line}: holds the value of ${h.name}`;
