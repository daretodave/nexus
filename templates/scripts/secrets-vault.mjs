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
// A write refuses a `.env` that isn't gitignored and a `.env.workspace` inside a repo, creates the file owner-only
// (0600), and refuses a multi-line value. Every message names a secret, never its value.
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
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const BARE = /^[A-Za-z0-9_\-.\/:@+=,%~]*$/;

function unquote(rest) {
  const s = rest.trim();
  if (s[0] === "'") { const end = s.indexOf("'", 1); return end === -1 ? s.slice(1) : s.slice(1, end); }
  if (s[0] === '"') {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '"') break;
      if (c === '\\' && i + 1 < s.length) { const n = s[++i]; out += n === 'n' ? '\n' : n; } else out += c;
    }
    return out;
  }
  const hash = /(^|\s)#/.exec(s);
  return (hash ? s.slice(0, hash.index) : s).trim();
}

/** A .env file's live assignments: Map name -> value (a commented-out line doesn't count; the last one wins). */
export function parseEnv(text) {
  const out = new Map();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = ENV_LINE.exec(line);
    if (m) out.set(m[1], unquote(m[2]));
  }
  return out;
}

/** A value as one .env line writes it: bare when that's safe, else double-quoted. */
export function formatEnvValue(value) {
  return BARE.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Set names in a .env file's text: the first live line of a name is replaced, later ones dropped, a new name
 * appended. Every other line (comments, blank lines, other names) stays as it was. */
export function upsertEnv(text, entries) {
  const want = new Map(entries);
  const done = new Set();
  const lines = text ? text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
  const out = [];
  for (const line of lines) {
    const m = ENV_LINE.exec(line);
    if (m && want.has(m[1])) {
      if (!done.has(m[1])) out.push(`${m[1]}=${formatEnvValue(want.get(m[1]))}`);
      done.add(m[1]);
      continue;
    }
    out.push(line);
  }
  for (const [name, value] of want) if (!done.has(name)) out.push(`${name}=${formatEnvValue(value)}`);
  return `${out.join('\n')}\n`;
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
 * The vault for one checkout: { config, get, resolve, status, set }. `get` and `resolve` return values: code only,
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
      if (git(['-C', config.root, 'check-ignore', '-q', LOCAL_RING]).status === 1) throw new Error(`${LOCAL_RING} is not gitignored here: add it to .gitignore first`);
      return;
    }
    if (!fs.existsSync(config.workspaceDir)) throw new Error(`no workspace folder at ${config.workspaceDir} (set secrets.workspace in .nexus/local.json)`);
    const inside = git(['-C', config.workspaceDir, 'rev-parse', '--is-inside-work-tree']);
    if (inside.status === 0 && inside.stdout.trim() === 'true' && git(['-C', config.workspaceDir, 'check-ignore', '-q', WORKSPACE_RING]).status !== 0) {
      throw new Error(`${config.workspaceDir} is inside a git repo: ${WORKSPACE_RING} belongs at the workspace root, outside every repo`);
    }
  }

  /** Store values ([[name, value]] or a Map) in one ring (the keychain when it is on, else local). Returns the
   * ring and the names stored. */
  function set(entries, ring = config.keychain ? 'keychain' : 'local') {
    const list = [...entries];
    for (const [n, v] of list) checkValue(n, v);
    guardRing(ring);
    if (ring === 'keychain') { for (const [n, v] of list) chain().set(n, v); return { ring, names: list.map(([n]) => n) }; }
    const file = ringFile(ring);
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    fs.writeFileSync(file, upsertEnv(text, list), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* best effort (Windows ignores POSIX modes) */ }
    return { ring, names: list.map(([n]) => n) };
  }

  return { config, get, resolve, status, set };
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
  const file = path.join(root, LOCAL_KEYS_FILE);
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const until = Date.now() + 3000;
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error(`${LOCAL_KEYS_FILE} is locked (another write is under way): try again`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const all = [...new Set([...readLocalKeys(root), ...names.filter((n) => NAME.test(n))])].sort();
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, about: 'A contributor\'s own local-only keys: names, never a value. Never in nexus.secrets.json.', localKeys: all }, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return all;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
