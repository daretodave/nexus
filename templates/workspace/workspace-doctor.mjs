#!/usr/bin/env node
// workspace-doctor.mjs — the workspace ring's offline doctor. Run from the
// workspace root (where this file sits once copied there, alongside
// REPOS.md and KEYS.md — playbooks/workspace.md's Resurrection section
// runs it last, until green):
//
//   node workspace-doctor.mjs [--root <path>]
//
// Zero-dependency, fully offline (no network, no `gh`), and never prints a
// secret's value — only whether its name is present and, for the leak
// check, which tracked file it turned up in. Four checks, each pass/fail:
//
//   1. self-repo    the root itself must never be `git init`'d
//                    (playbooks/workspace.md's un-versioned-root rule).
//   2. missing-clone every repo REPOS.md lists must already be cloned
//                    on disk, as its own git repo, at <root>/<name>.
//   3. missing-key   every secret name KEYS.md lists must have a line
//                    in .env.workspace.
//   4. leaked-value  no KEYS.md secret's value may appear inside any
//                    cloned sibling repo's git-tracked files (read from
//                    disk; `git ls-files` already excludes gitignored
//                    and untracked paths, so nothing is fetched or
//                    scanned beyond what's already cloned there).
//
// A REPOS.md/KEYS.md row still holding an unswept `<placeholder>` is
// skipped (same convention the `tree` gate leg uses) — it isn't a real
// repo or secret yet. Exit 0 when every check passes ("green"); 1 when
// any fails.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = path.dirname(fileURLToPath(import.meta.url));

// --- markdown tables ------------------------------------------------------

// Every contiguous run of `| ... |` lines, split into a header row and its
// data rows (the `|---|---|` separator, always the second line, is dropped).
export function extractTables(text) {
  const lines = text.split(/\r?\n/);
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const toCells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!isRow(lines[i])) { i++; continue; }
    let j = i + 1;
    while (j < lines.length && isRow(lines[j])) j++;
    const block = lines.slice(i, j);
    if (block.length >= 2) tables.push({ header: toCells(block[0]), rows: block.slice(2).map(toCells) });
    i = j;
  }
  return tables;
}

const stripBackticks = (s) => s.replace(/^`|`$/g, '');

// A row's first cell, unless it's still an unswept `<placeholder>` (the
// kit's own example rows, or a repo/key an adopter hasn't filled in yet).
function firstColumn(text, headerName) {
  const table = extractTables(text).find((t) => t.header[0] === headerName);
  if (!table) return [];
  return table.rows.map((r) => stripBackticks(r[0] ?? '')).filter((name) => name && !name.includes('<'));
}

export function readRepos(root) {
  const file = path.join(root, 'REPOS.md');
  if (!fs.existsSync(file)) return [];
  return firstColumn(fs.readFileSync(file, 'utf-8'), 'Repo');
}

export function readKeys(root) {
  const file = path.join(root, 'KEYS.md');
  if (!fs.existsSync(file)) return [];
  return firstColumn(fs.readFileSync(file, 'utf-8'), 'Key');
}

// --- .env.workspace --------------------------------------------------------

function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v[0] === '"' && v.endsWith('"')) return v.slice(1, -1).replace(/\\(.)/g, '$1');
  if (v.length >= 2 && v[0] === "'" && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

// Name -> live value (a commented-out or malformed line doesn't count).
// Never logged by the caller — only whether a name is present, or (leak
// check only) tested for presence inside a sibling repo's tracked files.
export function readEnvWorkspace(root) {
  const map = new Map();
  const file = path.join(root, '.env.workspace');
  if (!fs.existsSync(file)) return map;
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) map.set(m[1], unquote(m[2]));
  }
  return map;
}

// --- checks ------------------------------------------------------------

export function checkSelfRepo(root) {
  return fs.existsSync(path.join(root, '.git'))
    ? ['the workspace root is its own git repo (.git/ present) — it must stay a plain, un-versioned folder (playbooks/workspace.md)']
    : [];
}

export function checkClones(root, repos) {
  const failures = [];
  for (const name of repos) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      failures.push(`REPOS.md lists ${name}, not cloned on disk at ${name}/`);
    } else if (!fs.existsSync(path.join(dir, '.git'))) {
      failures.push(`${name}/ exists but is not a git repo (no .git/) — re-clone it per REPOS.md`);
    }
  }
  return failures;
}

export function checkKeysInEnv(keys, env) {
  return keys.filter((k) => !env.has(k)).map((k) => `KEYS.md lists ${k}, missing from .env.workspace`);
}

// Every cloned repo's tracked files, scanned once each, against every
// KEYS.md secret that has a live value — cheap because REPOS.md's repos
// are already cloned locally for this to run at all (no fetch, no clone).
export function checkLeakedValues(root, repos, keys, env) {
  const failures = [];
  const present = keys.filter((k) => env.get(k));
  if (!present.length) return failures;
  const needles = present.map((k) => ({ key: k, buf: Buffer.from(env.get(k)) }));
  for (const name of repos) {
    const dir = path.join(root, name);
    if (!fs.existsSync(path.join(dir, '.git'))) continue;
    let files;
    try {
      files = execSync('git ls-files', { cwd: dir, encoding: 'utf-8' }).split(/\r?\n/).filter(Boolean);
    } catch {
      continue; // not a usable git checkout — checkClones already reported it, or it's mid-clone
    }
    for (const rel of files) {
      let buf;
      try {
        buf = fs.readFileSync(path.join(dir, rel));
      } catch {
        continue; // a symlink, a submodule gitlink, or a file removed since ls-files ran
      }
      for (const { key, buf: needle } of needles) {
        if (buf.includes(needle)) failures.push(`${key}'s value was found inside ${name}/${rel} (a tracked file) — rotate it and scrub the file`);
      }
    }
  }
  return failures;
}

export function diagnose(root) {
  const repos = readRepos(root);
  const keys = readKeys(root);
  const env = readEnvWorkspace(root);
  const failures = [
    ...checkSelfRepo(root),
    ...checkClones(root, repos),
    ...checkKeysInEnv(keys, env),
    ...checkLeakedValues(root, repos, keys, env),
  ];
  return { failures, repos, keys };
}

// --- CLI -----------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--root');
  const root = i === -1 ? DEFAULT_ROOT : path.resolve(argv[i + 1]);
  const { failures } = diagnose(root);
  if (!failures.length) {
    process.stdout.write('workspace-doctor: green — every check passes.\n');
    return;
  }
  for (const f of failures) process.stdout.write(`workspace-doctor: ${f}\n`);
  process.stdout.write(`workspace-doctor: ${failures.length} issue(s).\n`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
