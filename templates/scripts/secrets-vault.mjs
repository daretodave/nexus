// scripts/secrets-vault.mjs: the vault, where a repo's secret values live: local, untracked, never read by the model.
//
// The rule: the model sees names, never values. This module is the only code that reads a value, and it hands one
// only to code (`get`, `resolve`: the run wrapper, a sink, the GUI server), never to a terminal. Three places, read
// in this order:
//   local      `.env` at the primary checkout's root: the loop's own tokens (every worktree shares it)
//   keychain   the OS keychain, opt-in (scripts/secrets-keychain.mjs), under the service `nexus/<repo>`
//   workspace  `.env.workspace` at the workspace root (the folder holding the sibling repos, the checkout's parent
//              unless configured): secrets several repos share, outside every repo so `git add -A` can't reach it
// Configured in the untracked `.nexus/local.json`:
//   { "secrets": { "keychain": true, "workspace": "../..", "keychainService": "nexus/myrepo" } }
// A write refuses a `.env` that isn't gitignored and a `.env.workspace` inside a repo, refuses a multi-line value, and
// rewrites the file under a lock through a temp file renamed into place, owner-only (0600), keeping every other line,
// comment and `export` as it was. `remove` takes a name out the same way. Every message names a secret, never its value.
// The command line: scripts/secrets.mjs; the how and why: nexus/customization/secrets.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SERVICE, keychain as osKeychain } from './secrets-keychain.mjs';

export const LOCAL_RING = '.env';
export const WORKSPACE_RING = '.env.workspace';
/** Where a value can live, in read order. */
export const RINGS = ['local', 'keychain', 'workspace'];
const NAME = /^[A-Z][A-Z0-9_]*$/;
const ENV_LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const BARE = /^[A-Za-z0-9_\-.\/:@+=,%~]*$/;

/** Where the quote that opens `s` at `from - 1` closes, or -1 (a double-quoted value honours backslash escapes). */
function closeAt(s, q, from = 1) {
  if (q === "'") return s.indexOf("'", from);
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '"') return i;
  }
  return -1;
}

/** A quoted or bare value (its text after `=`, maybe over several lines): { value, comment } (a trailing ` # ...`). */
function readValue(rest) {
  const lead = rest.length - rest.trimStart().length;
  const s = rest.slice(lead);
  const q = s[0];
  if (q === "'" || q === '"') {
    const end = closeAt(s, q);
    if (end === -1) {
      // Never closed: a hand-written "C:\data\" still ends in its quote, read literally (as dotenv does); else the rest.
      const last = s.trimEnd();
      if (last.length > 1 && last.endsWith(q)) return { value: last.slice(1, -1), comment: '' };
      return { value: s.slice(1), comment: '' };
    }
    const tail = s.slice(end + 1);
    return { value: q === "'" ? s.slice(1, end) : unescapeDq(s.slice(1, end)), comment: /^\s*#/.test(tail) ? tail : '' };
  }
  const hash = /(^|\s)#/.exec(s);
  return hash ? { value: s.slice(0, hash.index).trim(), comment: s.slice(hash.index).replace(/^(\S)/, ' $1') } : { value: s.trim(), comment: '' };
}

function unescapeDq(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { const n = s[++i]; out += n === 'n' ? '\n' : n; } else out += c;
  }
  return out;
}

/**
 * A .env text as blocks, in order: { lines } for anything that sets nothing (a comment, a blank line), and { lines,
 * prefix, name, value, comment } for an assignment. A quoted value that runs onto the next lines (a key pasted whole)
 * is one block through its closing quote, when that quote ends its line and no line on the way sets a name. Anything
 * else (a quote that never closes, a "C:\data\" whose last quote reads as escaped, a stray ' in a later comment) is
 * its own line only, so it never swallows the lines after it.
 */
function envBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ENV_LINE.exec(lines[i]);
    if (!m) { out.push({ lines: [lines[i]] }); continue; }
    const rest = m[3].trimStart();
    let end = i;
    if ((rest[0] === '"' || rest[0] === "'") && closeAt(rest, rest[0]) === -1) {
      for (let j = i + 1; j < lines.length; j++) {
        if (ENV_LINE.test(lines[j])) break;
        const at = closeAt(lines[j], rest[0], 0);
        if (at === -1) continue;
        if (/^\s*(#.*)?$/.test(lines[j].slice(at + 1))) end = j;
        break;
      }
    }
    const block = lines.slice(i, end + 1);
    out.push({ lines: block, prefix: m[1], name: m[2], ...readValue([m[3], ...block.slice(1)].join('\n')) });
    i = end;
  }
  return out;
}

/** A .env file's live assignments: Map name -> value (a commented-out line doesn't count; the last one wins). */
export function parseEnv(text) {
  const out = new Map();
  for (const b of envBlocks(text)) if (b.name) out.set(b.name, b.value);
  return out;
}

/**
 * A value as one .env line writes it: bare when that's safe, else single-quoted (literal in every dotenv reader, so a
 * `$` or a backslash is never expanded), else double-quoted with `\` and `"` escaped (a value holding a `'`). A
 * value holding both a `'` and a `$` has no form every reader keeps literal: dotenv-expand and docker compose expand
 * that `$`. Plain dotenv and nexus read it as written.
 */
export function formatEnvValue(value) {
  if (BARE.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The text back from its lines (the file's own final newline dropped), in its own line ending, ending in one. */
function joinLines(lines, eol) {
  const out = [...lines];
  if (out.length && out[out.length - 1] === '') out.pop();
  return out.length ? `${out.join(eol)}${eol}` : '';
}

const eolOf = (text) => (/\r\n/.test(String(text ?? '')) ? '\r\n' : '\n');

/** Set names in a .env file's text: the first assignment of a name is replaced (its `export` and trailing comment
 * kept), later ones dropped, a new name appended. Every other line (comments, blank lines, other names, the line
 * ending) stays as it was. */
export function upsertEnv(text, entries) {
  const want = new Map(entries);
  const done = new Set();
  const blocks = [];
  for (const b of envBlocks(text)) {
    if (!b.name || !want.has(b.name)) { blocks.push(b); continue; }
    if (!done.has(b.name)) blocks.push({ lines: [`${b.prefix}${b.name}=${formatEnvValue(want.get(b.name))}${b.comment}`] });
    done.add(b.name);
  }
  const lines = blocks.flatMap((b) => b.lines);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [n, v] of want) if (!done.has(n)) lines.push(`${n}=${formatEnvValue(v)}`);
  return joinLines(lines, eolOf(text));
}

/** Take names out of a .env file's text: every assignment of each goes; every other line stays as it was. */
export function removeEnv(text, names) {
  const drop = new Set(names);
  return joinLines(envBlocks(text).filter((b) => !(b.name && drop.has(b.name))).flatMap((b) => b.lines), eolOf(text));
}

/** Where this checkout's vault lives. `root` is the primary checkout; `settings` is its .nexus/local.json. */
export function vaultConfig(root, settings = {}) {
  const s = settings && typeof settings.secrets === 'object' && settings.secrets ? settings.secrets : {};
  const workspaceDir = typeof s.workspace === 'string' && s.workspace ? path.resolve(root, s.workspace) : path.dirname(path.resolve(root));
  const service = typeof s.keychainService === 'string' && SERVICE.test(s.keychainService) ? s.keychainService : `nexus/${path.basename(path.resolve(root)).replace(/[^A-Za-z0-9._-]/g, '-') || 'repo'}`;
  return {
    root: path.resolve(root),
    local: path.join(path.resolve(root), LOCAL_RING),
    workspaceDir,
    workspace: path.join(workspaceDir, WORKSPACE_RING),
    keychain: s.keychain === true,
    service,
  };
}

function gitRunner(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  return { status: r.error ? 127 : r.status, stdout: r.stdout ?? '' };
}

function checkValue(name, value) {
  if (!NAME.test(name)) throw new Error(`${name}: not an env-var name (A-Z, 0-9 and _, starting with a letter)`);
  if (typeof value !== 'string' || value === '') throw new Error(`${name}: an empty value (nothing to store)`);
  if (/[\r\n\0]/.test(value)) throw new Error(`${name}: a value on one line only (a key file goes in a file, its path in the vault)`);
}

/**
 * Where a ring file's temp file and lock go: the repo's own git folder when the file sits at a checkout's root (git
 * never tracks anything in there, so a crash mid-write can't leave plain-text secrets for `git add -A`), else beside
 * the file (the workspace ring sits outside every repo). In a worktree `.git` is a file naming that folder.
 */
export function scratchPath(file, suffix) {
  const dir = path.dirname(file);
  let git = path.join(dir, '.git');
  let inGit = false;
  try {
    if (fs.statSync(git).isFile()) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(git, 'utf8'));
      if (m) git = path.resolve(dir, m[1]);
    }
    inGit = fs.statSync(git).isDirectory();
  } catch { /* no repo here */ }
  return inGit ? path.join(git, `nexus-${path.basename(file)}${suffix}`) : `${file}${suffix}`;
}

/** Run `fn` holding `lock` (a file made with wx; one older than 10 s is stale), for a few seconds at most. */
function underLock(lock, what, fn) {
  const until = Date.now() + 3000;
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (err) {
      // Windows answers EPERM (or EACCES/EBUSY) while another writer's lock is being deleted: busy, not broken.
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) { fs.rmSync(lock, { force: true }); continue; } } catch { /* gone already */ }
      if (Date.now() > until) throw new Error(`${what} is locked (another write is under way): try again`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

/**
 * Write a ring's file whole: a temp file beside it (owner-only, 0600) renamed over it, so a reader never sees half a
 * file and a crash never leaves one. A symlinked .env is written where it points. Windows can refuse the rename
 * while another program holds the file open: a few tries, then the file is written in place.
 */
export function writeAtomic(file, text) {
  let target = file;
  try { target = fs.realpathSync(file); } catch { /* a new file */ }
  const tmp = scratchPath(target, `.${process.pid}.${Date.now().toString(36)}.tmp`);
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch { /* best effort (Windows ignores POSIX modes) */ }
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, target); return; } catch (err) {
        if (!['EPERM', 'EACCES', 'EBUSY', 'EXDEV'].includes(err.code)) throw err;
        if (err.code === 'EXDEV' || i >= 4) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1));
      }
    }
    fs.writeFileSync(target, text, { mode: 0o600 });
    try { fs.chmodSync(target, 0o600); } catch { /* best effort */ }
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* Windows may still hold it (EBUSY): the write itself landed */ }
  }
}

/**
 * The vault for one checkout: { config, get, resolve, status, set, remove }. `get` and `resolve` return values: code only,
 * never a terminal. `git` and `keychain` are seams (tests stub both; a test never touches the real keychain).
 */
export function openVault({ root, settings = {}, platform = process.platform, git = gitRunner, keychain } = {}) {
  const config = vaultConfig(root, settings);
  let kc = null;
  const chain = () => {
    if (!config.keychain) return null;
    if (!kc) kc = keychain ?? osKeychain({ platform, service: config.service });
    return kc;
  };
  const readRing = (file) => { try { return parseEnv(fs.readFileSync(file, 'utf8')); } catch (err) { if (err.code === 'ENOENT') return new Map(); throw err; } };
  const ringFile = (ring) => (ring === 'local' ? config.local : config.workspace);

  function get(name) {
    const local = readRing(config.local);
    if (local.get(name)) return { value: local.get(name), ring: 'local' };
    const k = chain();
    const fromChain = k ? k.get(name) : null;
    if (fromChain) return { value: fromChain, ring: 'keychain' };
    const ws = readRing(config.workspace);
    if (ws.get(name)) return { value: ws.get(name), ring: 'workspace' };
    return null;
  }

  /** Values for a list of names, from wherever each is set: { values: Map, missing: [names] }. */
  function resolve(names) {
    const values = new Map();
    const missing = [];
    for (const n of names) { const hit = get(n); if (hit) values.set(n, hit.value); else missing.push(n); }
    return { values, missing };
  }

  /** Where each name is set, never what it is: [{ name, rings: [...] }]. The declared names first, then any name
   * the .env files hold that the manifest doesn't (the keychain is only asked about declared names). */
  function status(declared = []) {
    const local = readRing(config.local);
    const ws = readRing(config.workspace);
    const k = chain();
    const inChain = k ? k.has(declared.filter((n) => NAME.test(n))) : new Set();
    const names = [...declared, ...[...local.keys(), ...ws.keys()].filter((n) => !declared.includes(n))];
    return [...new Set(names)].map((name) => ({
      name,
      rings: RINGS.filter((r) => (r === 'local' ? !!local.get(name) : r === 'workspace' ? !!ws.get(name) : inChain.has(name))),
    }));
  }

  function guardRing(ring) {
    if (!RINGS.includes(ring)) throw new Error(`no ring ${ring} (one of ${RINGS.join(', ')})`);
    if (ring === 'keychain') {
      if (!config.keychain) throw new Error('the keychain is opt-in: set { "secrets": { "keychain": true } } in .nexus/local.json');
      return;
    }
    if (ring === 'local') {
      if (git(['-C', config.root, 'check-ignore', '-q', LOCAL_RING]).status === 1) {
        // check-ignore never calls a tracked file ignored: say which it is, since the fix differs.
        if (git(['-C', config.root, 'ls-files', '--error-unmatch', LOCAL_RING]).status === 0) throw new Error(`${LOCAL_RING} is tracked by git here: untrack it (git rm --cached ${LOCAL_RING}) and add it to .gitignore first`);
        throw new Error(`${LOCAL_RING} is not gitignored here: add it to .gitignore first`);
      }
      return;
    }
    if (!fs.existsSync(config.workspaceDir)) throw new Error(`no workspace folder at ${config.workspaceDir} (set secrets.workspace in .nexus/local.json)`);
    const inside = git(['-C', config.workspaceDir, 'rev-parse', '--is-inside-work-tree']);
    if (inside.status === 0 && inside.stdout.trim() === 'true' && git(['-C', config.workspaceDir, 'check-ignore', '-q', WORKSPACE_RING]).status !== 0) {
      throw new Error(`${config.workspaceDir} is inside a git repo: ${WORKSPACE_RING} belongs at the workspace root, outside every repo`);
    }
  }

  /** Rewrite one ring's file under its lock: read, change, write a temp file beside it, rename it into place. */
  function rewrite(ring, change) {
    const file = ringFile(ring);
    underLock(scratchPath(file, '.lock'), path.basename(file), () => {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      writeAtomic(file, change(text));
    });
  }

  /** Store values ([[name, value]] or a Map) in one ring (the keychain when it is on, else local). Returns the
   * ring and the names stored. */
  function set(entries, ring = config.keychain ? 'keychain' : 'local') {
    const list = [...entries];
    for (const [n, v] of list) checkValue(n, v);
    guardRing(ring);
    if (ring === 'keychain') { for (const [n, v] of list) chain().set(n, v); return { ring, names: list.map(([n]) => n) }; }
    rewrite(ring, (text) => upsertEnv(text, list));
    return { ring, names: list.map(([n]) => n) };
  }

  /** Take names out of the vault: from the rings named (one, or a list), or every ring that holds each. Returns
   * [{ name, rings }] (where each one was taken from; [] when it was nowhere). Other names, comments and lines stay. */
  function remove(names, rings = null) {
    for (const n of names) if (!NAME.test(n)) throw new Error(`${n}: not an env-var name (A-Z, 0-9 and _, starting with a letter)`);
    const only = rings == null ? null : [rings].flat();
    for (const g of only ?? []) if (!RINGS.includes(g)) throw new Error(`no ring ${g} (one of ${RINGS.join(', ')})`);
    if (only?.includes('keychain') && !config.keychain) throw new Error('the keychain is opt-in: set { "secrets": { "keychain": true } } in .nexus/local.json');
    const held = new Map(status(names).map((r) => [r.name, r.rings.filter((g) => !only || only.includes(g))]));
    for (const g of ['local', 'workspace']) {
      const here = names.filter((n) => held.get(n)?.includes(g));
      if (here.length) rewrite(g, (text) => removeEnv(text, here));
    }
    for (const n of names) {
      if (!held.get(n)?.includes('keychain')) continue;
      if (typeof chain().remove !== 'function') throw new Error(`keychain: this keychain cannot take ${n} out (update scripts/secrets-keychain.mjs)`);
      chain().remove(n);
    }
    return names.map((name) => ({ name, rings: held.get(name) ?? [] }));
  }

  return { config, get, resolve, status, set, remove };
}

// A contributor's own keys (scripts/owner.mjs: not effective owner mode). Project secrets are the owner's; a
// contributor keeps local-only keys (a dev API key, a local database URL) in this checkout's vault: the local ring
// or the keychain, never the workspace ring (shared with sibling repos) and never a sink. Their names are recorded
// here, untracked at the primary checkout, never in the manifest (so no chunk can require one); the keychain can't
// be listed, so this record is how status finds them. Names only, never a value.
export const LOCAL_KEYS_FILE = '.nexus/secrets-local.json';
/** The rings a contributor writes: this machine, this repo. */
export const CONTRIBUTOR_RINGS = ['local', 'keychain'];
/** The one refusal every sink gives a contributor checkout (secrets.mjs push, and any later caller of a sink). */
export function sinkRefusal(what = 'push') {
  return `secrets ${what}: refused in a contributor checkout: sinks run in owner mode only (scripts/owner.mjs); a contributor's keys are local-only and stay on this machine`;
}

/** The local key names recorded for this checkout (`root`: the primary checkout), sorted; [] when none. */
export function readLocalKeys(root) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, LOCAL_KEYS_FILE), 'utf8'));
    return Array.isArray(v?.localKeys) ? [...new Set(v.localKeys.filter((n) => typeof n === 'string' && NAME.test(n)))].sort() : [];
  } catch {
    return [];
  }
}

/** Add names to the record, under a lock, renamed into place. Returns every recorded name. */
export function recordLocalKeys(root, names) {
  return rewriteLocalKeys(root, (had) => [...had, ...names.filter((n) => NAME.test(n))]);
}

/** Take names out of the record (a key unset from every ring this machine holds it in). Returns every recorded name. */
export function forgetLocalKeys(root, names) {
  const drop = new Set(names);
  return rewriteLocalKeys(root, (had) => had.filter((n) => !drop.has(n)));
}

function rewriteLocalKeys(root, change) {
  const file = path.join(root, LOCAL_KEYS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return underLock(`${file}.lock`, LOCAL_KEYS_FILE, () => {
    const all = [...new Set(change(readLocalKeys(root)))].sort();
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, about: 'A contributor\'s own local-only keys: names, never a value. Never in nexus.secrets.json.', localKeys: all }, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return all;
  });
}
