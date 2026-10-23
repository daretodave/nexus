// The stack hand-off's server side (design sections 5 and 6): the services an app runs on, picked in the Vault; the
// app's framework and the env files it reads; each value saved through the vault (the repo's own `set`, reached by
// secrets.store, which declares the name, upserts without clobbering, refreshes the mask and pushes to sinks) and then
// mirrored to the files the vault does not know about (apps/web/.env.local, a .env.workspace.json); Check it and the
// actions (server/stack-checks.mjs) with tokens read from the vault here, never sent by the browser.
//
// The rule holds: the model sees names, never values. A value arrives in a POST body, goes to the vault, a mirror
// file and a sink, and nowhere else. Every answer here passes through scrubber(values used) on top of server.mjs's
// mask. State lives in .nexus/stack.json (gitignored): picks, the domain, the app, the target ticks, and each check's
// and action's result as allowlisted facts. Nothing here logs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { primaryRoot } from './sessions.mjs';
import { isOwner as effectiveOwner } from './local.mjs';
import { SERVICES, ORDER, ACTIONS, STACK_VERSION, valueOf, aliasesOf, recipeFor } from '../shared/stack/recipes.mjs';
import { checkShape, normalize, publicSafe } from '../shared/stack/shapes.mjs';
import { FRAMEWORKS, frameworkById, detectFramework, envNamesFor } from '../shared/stack/frameworks.mjs';
import { CHECKS, ACTION_FNS, refOf, pickFacts } from './stack-checks.mjs';

export const STATE_FILE = '.nexus/stack.json';
const WORKSPACE_JSON = '.env.workspace.json';
const PLAN_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 3000;
const NAME = /^[A-Z][A-Z0-9_]*$/;
/** The names CI needs (vercel pull/build/deploy, wrangler): pushed to GitHub Actions when that target is ticked. */
const ACTIONS_NAMES = new Set(['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);

/** Every posted value taken out of a text or JSON answer, whatever its length (the secrets routes' own rule). */
export function scrubber(values) {
  const vs = [...new Set(values.filter((v) => typeof v === 'string' && v))].sort((a, b) => b.length - a.length);
  const text = (s) => { let o = s; for (const v of vs) o = o.split(v).join('[secret]'); return o; };
  const deep = (x) => (typeof x === 'string' ? text(x) : Array.isArray(x) ? x.map(deep) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [text(k), deep(v)])) : x);
  return vs.length ? deep : (x) => x;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const exists = (f) => { try { return fs.existsSync(f); } catch { return false; } };
const toPosix = (p) => p.split(path.sep).join('/');

/** Write a file atomically: a temp file, owner-only, renamed into place. */
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.nexus-tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* Windows ignores POSIX modes */ }
  fs.renameSync(tmp, file);
}

// ---- detection (design 5.1) -------------------------------------------------------------------------------------

/** The workspace globs a root package.json and pnpm-workspace.yaml name (a line parse; no YAML dependency). */
function workspaceGlobs(root, pkg) {
  const out = [];
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) out.push(...ws);
  else if (ws && Array.isArray(ws.packages)) out.push(...ws.packages);
  try {
    const y = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    for (const line of y.split(/\r?\n/)) {
      const m = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (m) out.push(m[1]);
    }
  } catch { /* no pnpm workspace */ }
  return [...new Set(out.filter((g) => typeof g === 'string' && !g.startsWith('!')))];
}

/** Expand `dir/*` globs one level deep (and plain dirs), capped at 50, never outside the root. */
function expandGlobs(root, globs) {
  const dirs = [];
  for (const g of globs) {
    const clean = g.replace(/^\.\//, '').replace(/\/+$/, '');
    if (clean.includes('..') || path.isAbsolute(clean)) continue;
    if (/^[\w.@-]+(\/[\w.@-]+)*\/\*$/.test(clean)) {
      const base = clean.slice(0, -2);
      let ents = [];
      try { ents = fs.readdirSync(path.join(root, base), { withFileTypes: true }); } catch { continue; }
      for (const e of ents) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') dirs.push(`${base}/${e.name}`);
    } else if (/^[\w.@-]+(\/[\w.@-]+)*$/.test(clean)) dirs.push(clean);
    if (dirs.length >= 50) break;
  }
  return [...new Set(dirs)].slice(0, 50);
}

/** The apps in a repo: [{ dir, framework, label, prefix, name? }], the root first. [] for a folder with no package.json. */
export function detectApps(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg) return [];
  const one = (dir, p) => { const fw = frameworkById(detectFramework(p)); return { dir, framework: fw.id, label: fw.label, prefix: fw.prefix, ...(typeof p?.name === 'string' ? { name: p.name } : {}) }; };
  const apps = [one('.', pkg)];
  for (const dir of expandGlobs(root, workspaceGlobs(root, pkg))) {
    const p = readJson(path.join(root, dir, 'package.json'));
    if (p) apps.push(one(dir, p));
  }
  return apps;
}

/** The app a stack writes for when none is picked: the only one, the first that is not plain Node, else Next.js at the root. */
export function defaultApp(apps) {
  if (!apps.length) return { dir: '.', framework: 'next' };
  const front = apps.filter((a) => a.framework !== 'node');
  const pick = apps.length === 1 ? apps[0] : (front.find((a) => a.dir !== '.') || front[0] || apps[0]);
  return { dir: pick.dir, framework: pick.framework };
}

/** A .env.workspace.json's layout: flat, env, apps, or unknown. */
export function workspaceShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'unknown';
  const vals = Object.values(obj);
  if (!vals.length) return 'flat';
  if (vals.every((v) => typeof v === 'string')) return 'flat';
  if (Object.keys(obj).length === 1 && obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env) && Object.values(obj.env).every((v) => typeof v === 'string')) return 'env';
  if (vals.every((v) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string'))) return 'apps';
  return 'unknown';
}

/** The names-to-values map a workspace json holds for an app, by its layout. */
function jsonPlace(obj, shape, appKey) {
  if (shape === 'flat') return obj || {};
  if (shape === 'env') return obj.env || {};
  if (shape === 'apps') return (obj && obj[appKey]) || {};
  return {};
}

// ---- mirror writes (design 5.3) ---------------------------------------------------------------------------------

const defaultGit = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  return { status: r.error ? 127 : r.status, stdout: r.stdout ?? '' };
};

/** A path inside a base folder, or null (`..`, absolute or outside). */
function inside(base, rel) {
  const abs = path.resolve(base, rel);
  const b = path.resolve(base);
  return abs === b || abs.startsWith(b + path.sep) ? abs : null;
}

/** Refuse a file git would track: the vault's own rule for .env (guardRing), for a mirror file. */
function guardIgnored(git, dir, abs, label) {
  if (git(['-C', dir, 'check-ignore', '-q', toPosix(path.relative(dir, abs))]).status === 1) {
    throw new Error(`${label} is not gitignored. Add it to .gitignore first.`);
  }
}

function oneLine(entries) {
  for (const [n, v] of entries) {
    if (!NAME.test(n)) throw new Error(`${n} is not an env-var name.`);
    if (typeof v !== 'string' || !v || /[\r\n\0]/.test(v)) throw new Error(`${n}: a value goes on one line.`);
  }
}

/** Upsert names in a dotenv mirror with the repo's own upsertEnv: other keys and comments stay byte-for-byte. */
export function mirrorDotenv({ root, rel, entries, upsertEnv, git = defaultGit }) {
  const abs = inside(root, rel);
  if (!abs) throw new Error(`${rel} is outside the repo; nexus writes only inside it.`);
  oneLine(entries);
  guardIgnored(git, root, abs, toPosix(rel));
  let text = '';
  try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  writeAtomic(abs, upsertEnv(text, entries));
}

/** Set names in a .env.workspace.json in its detected layout, keeping its indent and trailing newline. */
export function mirrorJson({ base, rel, entries, appKey, git = defaultGit, label = rel }) {
  const abs = inside(base, rel);
  if (!abs) throw new Error(`${label} is outside the folder nexus writes in.`);
  oneLine(entries);
  guardIgnored(git, base, abs, label);
  const text = fs.readFileSync(abs, 'utf8');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('The file is not valid JSON; nexus left it alone.'); }
  const shape = workspaceShape(obj);
  if (shape === 'unknown') throw new Error('nexus does not know this file\'s layout; it will not edit it.');
  const indent = (/^\{\r?\n([ \t]+)"/.exec(text) || [])[1] || 2;
  let place;
  if (shape === 'flat') place = obj;
  else if (shape === 'env') place = obj.env;
  else { obj[appKey] = obj[appKey] && typeof obj[appKey] === 'object' ? obj[appKey] : {}; place = obj[appKey]; }
  for (const [n, v] of entries) place[n] = v;
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  let out = JSON.stringify(obj, null, indent);
  if (nl === '\r\n') out = out.replace(/\n/g, '\r\n');
  writeAtomic(abs, /\r?\n$/.test(text) ? out + nl : out);
}

// ---- the kit: the repo's own vault module, loaded as secrets.mjs loads it ----------------------------------------

async function loadKit(repo) {
  const dir = path.join(repo, 'scripts');
  const vaultFile = path.join(dir, 'secrets-vault.mjs');
  if (!exists(vaultFile)) return null;
  const imp = async (f) => { const abs = path.join(dir, f); return exists(abs) ? import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`) : null; };
  try {
    const vault = await imp('secrets-vault.mjs');
    const owner = await imp('owner.mjs');
    const sinks = await imp('secrets-sinks.mjs').catch(() => null);
    if (!vault?.openVault || !vault?.upsertEnv || !vault?.parseEnv) return null;
    return { openVault: vault.openVault, upsertEnv: vault.upsertEnv, parseEnv: vault.parseEnv, localSettings: owner?.localSettings || (() => ({})), recordAudit: sinks?.recordAudit || null };
  } catch {
    return null;
  }
}

// ---- the stack API ----------------------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {string} o.repo                 the served repo
 * @param {object} o.secrets              server/secrets.mjs's API: status() and store(name, body) are all it uses
 * @param {function} [o.fetchImpl]        fetch (tests: a fake)
 * @param {() => number} [o.now]
 * @param {() => boolean} [o.owner]       effective owner mode (default: server/local.mjs)
 * @param {function} [o.git]              git runner (args) -> { status } (tests: a fake check-ignore)
 * @param {object} [o.kit]                { openVault, upsertEnv, parseEnv, localSettings } (tests; default: the repo's)
 * @param {string} [o.root]               the primary checkout (tests; default: git's)
 */
export function createStack({ repo, secrets, fetchImpl = globalThis.fetch, now = Date.now, owner = () => effectiveOwner(repo), git = defaultGit, kit: kitOverride, root: rootOverride } = {}) {
  let rootP = null;
  const vroot = () => (rootP ||= rootOverride ? Promise.resolve(rootOverride) : primaryRoot(repo).catch(() => repo));
  const kit = async () => kitOverride || loadKit(repo);
  const plans = new Map();
  const busy = new Set();
  const checking = new Set();
  const lastCheck = new Map();

  // ---- state ----
  const blank = () => ({ version: STACK_VERSION, picked: [], inputs: {}, app: null, targets: {}, checks: {}, actions: {}, ticks: {} });
  async function readState() {
    const root = await vroot();
    const s = readJson(path.join(root, STATE_FILE));
    if (!s || typeof s !== 'object') return blank();
    const b = blank();
    for (const k of Object.keys(b)) if (s[k] && typeof s[k] === typeof b[k]) b[k] = s[k];
    if (s.app && typeof s.app === 'object') b.app = s.app;
    b.picked = (Array.isArray(s.picked) ? s.picked : []).filter((x) => SERVICES[x]);
    return b;
  }
  async function writeState(s) {
    const root = await vroot();
    fs.mkdirSync(path.join(root, '.nexus'), { recursive: true });
    writeAtomic(path.join(root, STATE_FILE), `${JSON.stringify(s, null, 2)}\n`);
  }

  // ---- the vault ----
  async function vaultOf() {
    const k = await kit();
    if (!k) return null;
    const root = await vroot();
    return { k, v: k.openVault({ root, settings: k.localSettings(root) }) };
  }

  // ---- app, targets ----
  function appOf(state, apps) {
    const a = state.app && typeof state.app === 'object' ? state.app : null;
    if (a && typeof a.dir === 'string' && FRAMEWORKS.some((f) => f.id === a.framework)) return { dir: a.dir, framework: a.framework };
    return defaultApp(apps);
  }

  /** Every name a picked service's values become in this app (with the alias the repo already uses). */
  function recipeNames(picked, fw) {
    const out = [];
    for (const id of ORDER.filter((x) => picked.includes(x))) for (const v of SERVICES[id].values) for (const n of envNamesFor(v, fw)) out.push(n, ...aliasesOf(n));
    return [...new Set(out)];
  }

  /** The names a dotenv or json target holds, as a Map name -> value (read on the server only). */
  function targetValues(k, t) {
    try {
      if (!t.abs || !exists(t.abs)) return new Map();
      const text = fs.readFileSync(t.abs, 'utf8');
      if (t.kind === 'json') {
        const obj = JSON.parse(text);
        return new Map(Object.entries(jsonPlace(obj, workspaceShape(obj), t.appKey)).filter(([, v]) => typeof v === 'string'));
      }
      return k.parseEnv(text);
    } catch { return new Map(); }
  }

  /** The write targets for this app (design 5.2): the vault first and locked, then the mirrors and the sinks. */
  function targetsOf({ root, st, app, state, k, vcfg }) {
    const fw = frameworkById(app.framework);
    const ticks = state.targets || {};
    const out = [{ id: 'vault', kind: 'vault', label: st?.vault?.keychain ? 'keychain (the vault)' : '.env (the vault)', on: true, locked: true, why: 'The vault keeps every value; pushes read it from there.' }];
    let appNote = null;
    const names = new Set(recipeNames(ORDER, fw));
    if (app.dir !== '.') {
      const rel = `${app.dir}/${fw.file}`;
      out.push({ id: 'app', kind: 'dotenv', label: rel, rel, abs: inside(root, rel), on: ticks.app ?? true, why: `${fw.label} reads env from ${app.dir}` });
    } else if (fw.file !== '.env' && exists(path.join(root, fw.file))) {
      const t = { id: 'app', kind: 'dotenv', label: fw.file, rel: fw.file, abs: path.join(root, fw.file) };
      const holds = k ? [...targetValues(k, t).keys()].some((n) => names.has(n)) : false;
      out.push({ ...t, on: ticks.app ?? holds, why: holds ? `${fw.label} gives ${fw.file} precedence, and it already sets some of these names` : `${fw.label} also reads ${fw.file}` });
    } else {
      appNote = `${fw.label} reads .env at the root, so the vault's file is the app's file.`;
    }
    const wsDirs = [root, vcfg?.workspaceDir].filter(Boolean);
    for (const base of wsDirs) {
      const abs = path.join(base, WORKSPACE_JSON);
      if (!exists(abs)) continue;
      let shape = 'unknown';
      try { shape = workspaceShape(JSON.parse(fs.readFileSync(abs, 'utf8'))); } catch { shape = 'invalid'; }
      const label = toPosix(path.relative(root, abs)) || WORKSPACE_JSON;
      const appKey = app.dir === '.' ? '.' : app.dir;
      const bad = shape === 'unknown' || shape === 'invalid';
      out.push({ id: 'workspaceJson', kind: 'json', label, abs, base, rel: path.relative(base, abs), appKey, shape, on: !bad && (ticks.workspaceJson ?? true), ...(bad ? { disabled: true, why: shape === 'invalid' ? 'The file is not valid JSON; nexus left it alone.' : 'nexus does not know this file\'s layout; it will not edit it.' } : { why: 'This repo keeps env in it' }) });
      break;
    }
    const sinks = st?.sinks || [];
    if (sinks.includes('github-actions')) out.push({ id: 'github-actions', kind: 'sink', label: 'GitHub Actions', on: ticks['github-actions'] ?? true, why: 'The Vercel and Cloudflare names CI reads (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, CLOUDFLARE_API_TOKEN)' });
    const linked = [path.join(root, '.vercel', 'project.json'), path.join(root, app.dir, '.vercel', 'project.json')].some(exists);
    if (sinks.includes('vercel') && linked) out.push({ id: 'vercel', kind: 'sink', label: 'Vercel (vercel env)', on: ticks.vercel ?? true, why: 'The Supabase values, through the linked project' });
    return { targets: out, appNote };
  }

  /** The sinks a name goes to, from the ticked sink targets. */
  function destsFor(service, name, targets) {
    const on = new Set(targets.filter((t) => t.kind === 'sink' && t.on && !t.disabled).map((t) => t.id));
    const out = [];
    if (on.has('github-actions') && ACTIONS_NAMES.has(name)) out.push('github-actions');
    if (on.has('vercel') && service === 'supabase') out.push('vercel');
    return out;
  }

  /** A value's names here: the framework's names, each swapped for the alias the repo already reads (design 5.4). */
  function resolveNames(value, fw, present, { alsoNew = false } = {}) {
    const out = [];
    const notes = [];
    for (const n of envNamesFor(value, fw)) {
      const alias = aliasesOf(n).find((a) => present.has(a));
      if (alias && !present.has(n)) {
        out.push(alias);
        notes.push(`Using ${alias}, the name this repo already reads.`);
        if (alsoNew) out.push(n);
      } else out.push(n);
    }
    return { names: [...new Set(out)], notes };
  }

  /** Everything the GET and the writes share: the root, the vault, the app, the targets and the names present. */
  async function context(state) {
    const root = await vroot();
    const st = await secrets.status().catch(() => ({ status: 500 }));
    const vk = await vaultOf();
    const apps = detectApps(root);
    const app = appOf(state, apps);
    const fw = frameworkById(app.framework);
    const { targets, appNote } = targetsOf({ root, st, app, state, k: vk?.k, vcfg: vk?.v?.config });
    const all = recipeNames(ORDER, fw);
    let inVault = new Set();
    try { if (vk) inVault = new Set(vk.v.status(all).filter((r) => r.rings.length).map((r) => r.name)); } catch { /* a vault that cannot be read: nothing reads as set */ }
    const mirrors = targets.filter((t) => t.kind === 'dotenv' || t.kind === 'json');
    const held = new Map(mirrors.map((t) => [t.id, vk ? targetValues(vk.k, t) : new Map()]));
    const present = new Set([...inVault, ...[...held.values()].flatMap((m) => [...m.keys()])]);
    return { root, st, vk, apps, app, fw, targets, appNote, inVault, held, present, mirrors };
  }

  const publicTarget = ({ abs, base, rel, ...t }) => t;

  /** GET /api/stack: picks, the app, the targets, each name's places and drift, the checks and actions. Never a value. */
  async function status() {
    const state = await readState();
    const ctx = await context(state);
    const { st, vk, apps, app, fw, targets, appNote, inVault, held, present } = ctx;
    if (st.status && st.status !== 200 && st.vaultState !== 'missing') return { status: 200, available: false, vaultState: 'error', error: st.error || 'The vault did not answer.' };
    const names = {};
    const values = {};
    for (const id of ORDER.filter((x) => state.picked.includes(x))) {
      for (const v of SERVICES[id].values) {
        const { names: ns, notes } = resolveNames(v, fw, present);
        values[`${id}.${v.key}`] = { names: ns, saved: ns.every((n) => inVault.has(n)), ...(notes.length ? { notes } : {}) };
        for (const n of ns) {
          const row = { service: id, key: v.key, vault: inVault.has(n), drift: false };
          for (const [tid, m] of held) {
            row[tid] = m.has(n);
            if (m.has(n) && inVault.has(n) && vk) {
              try { const hit = vk.v.get(n); if (hit && hit.value !== m.get(n)) row.drift = true; } catch { /* unreadable: no drift claimed */ }
            }
          }
          names[n] = row;
        }
      }
    }
    const link = readJson(path.join(ctx.root, '.vercel', 'project.json')) || readJson(path.join(ctx.root, app.dir, '.vercel', 'project.json'));
    const secretNames = new Set(Object.entries(names).filter(([, r]) => valueOf(r.service, r.key)?.secret).map(([n]) => n));
    const usedValues = vk ? [...inVault].filter((n) => secretNames.has(n)).map((n) => { try { return vk.v.get(n)?.value; } catch { return null; } }) : [];
    return scrubber(usedValues)({
      status: 200,
      available: true,
      vaultState: st.vaultState || (vk ? 'ready' : 'missing'),
      owner: !!owner(),
      picked: state.picked,
      inputs: state.inputs,
      apps: apps.map(({ dir, framework, label, prefix, name }) => ({ dir, framework, label, prefix, ...(name ? { name } : {}) })),
      app: { ...app, label: fw.label, prefix: fw.prefix },
      fresh: !apps.length,
      targets: targets.map(publicTarget),
      appNote,
      names,
      values,
      checks: state.checks,
      actions: state.actions,
      ticks: state.ticks,
      ...(link && (link.projectId || link.orgId) ? { vercelLink: { projectId: link.projectId || null, orgId: link.orgId || null } } : {}),
    });
  }

  /** POST /api/stack/pick { picked?, inputs?, app?, targets? }: state only. */
  async function pick(b = {}) {
    if (!owner()) return { status: 403, error: 'The stack is the owner\'s to set up. Keep your own keys under Local keys.' };
    const state = await readState();
    if (Array.isArray(b.picked)) state.picked = ORDER.filter((x) => b.picked.includes(x));
    if (b.inputs && typeof b.inputs === 'object') {
      if ('domain' in b.inputs) {
        const raw = String(b.inputs.domain ?? '');
        if (!raw.trim()) delete state.inputs.domain;
        else {
          const r = checkShape('hostname', raw);
          if (!r.ok) return { status: 400, error: r.why };
          const d = normalize('hostname', raw);
          if (d !== state.inputs.domain) { state.inputs.domain = d; for (const k of Object.keys(state.actions)) if (k !== 'vercel.env') delete state.actions[k]; }
        }
      }
    }
    if (b.app && typeof b.app === 'object') {
      const dir = String(b.app.dir || '.').replace(/\\/g, '/').replace(/\/+$/, '') || '.';
      if (dir !== '.' && (dir.includes('..') || path.isAbsolute(dir) || !/^[\w.@/-]+$/.test(dir))) return { status: 400, error: 'An app folder is a path inside the repo, like apps/web.' };
      if (!FRAMEWORKS.some((f) => f.id === b.app.framework)) return { status: 400, error: 'Pick a framework from the list.' };
      state.app = { dir, framework: b.app.framework };
    }
    if (b.targets && typeof b.targets === 'object') {
      for (const id of ['app', 'workspaceJson', 'github-actions', 'vercel']) if (typeof b.targets[id] === 'boolean') state.targets[id] = b.targets[id];
    }
    await writeState(state);
    return status();
  }

  /** POST /api/stack/tick { step, on }: a step the person ticks by hand. */
  async function tick(b = {}) {
    if (!owner()) return { status: 403, error: 'The stack is the owner\'s to set up.' };
    const ok = Object.values(SERVICES).some((s) => s.steps.some((x) => x.id === b.step && x.tick));
    if (!ok) return { status: 400, error: 'That step is not one you tick.' };
    const state = await readState();
    if (b.on) state.ticks[b.step] = true; else delete state.ticks[b.step];
    await writeState(state);
    return { status: 200, ok: true, ticks: state.ticks };
  }

  /** POST /api/stack/save { service, key, value, targets?, alsoNew? }: the vault, then each ticked mirror and sink. */
  async function save(b = {}) {
    if (b.resync === true) return resync(b);
    const raw = typeof b.value === 'string' ? b.value : '';
    const scrub = scrubber([raw, raw.trim()]);
    if (!owner()) return scrub({ status: 403, error: 'The stack is the owner\'s to set up. Keep your own keys under Local keys.' });
    const v = valueOf(b.service, b.key);
    if (!v) return scrub({ status: 400, error: 'No such value in the stack.' });
    const shape = checkShape(v.shape, raw);
    if (!shape.ok) return scrub({ status: 400, error: shape.why });
    const value = normalize(v.shape, raw);
    const state = await readState();
    if (b.targets && typeof b.targets === 'object') {
      for (const id of ['app', 'workspaceJson', 'github-actions', 'vercel']) if (typeof b.targets[id] === 'boolean') state.targets[id] = b.targets[id];
    }
    const ctx = await context(state);
    if (ctx.st.vaultState === 'missing' || !ctx.vk) return scrub({ status: 409, error: 'Set up the vault first; the stack writes through it.' });
    // A secret never gets a public name: checked on the recipe's own names before envNamesFor drops one quietly.
    const wanted = [v.env?.server, v.env?.public ? `${ctx.fw.prefix}${v.env.public}` : null].filter(Boolean);
    if ((v.secret && v.env?.public) || wanted.some((n) => !publicSafe(n, v.secret))) return scrub({ status: 400, error: 'A secret never gets a public name.' });
    const { names, notes } = resolveNames(v, ctx.fw, ctx.present, { alsoNew: b.alsoNew === true });
    if (!names.length || names.some((n) => !publicSafe(n, v.secret))) return scrub({ status: 400, error: 'A secret never gets a public name.' });
    const pushed = [];
    for (const n of names) {
      const r = await secrets.store(n, { value, declare: true, for: recipeFor(b.service, b.key), destinations: destsFor(b.service, n, ctx.targets) });
      if (!r || r.status !== 200) return scrub({ status: r?.status || 500, error: r?.error || 'The vault did not take it.', names });
      for (const p of r.pushed || []) pushed.push({ name: n, destination: p.destination, ok: !!p.ok, ...(p.error ? { error: p.error } : {}) });
    }
    const written = [{ target: 'vault', label: ctx.targets[0].label }];
    const failed = [];
    for (const t of ctx.mirrors.filter((x) => x.on && !x.disabled)) {
      try {
        if (t.kind === 'dotenv') mirrorDotenv({ root: ctx.root, rel: t.rel, entries: names.map((n) => [n, value]), upsertEnv: ctx.vk.k.upsertEnv, git });
        else mirrorJson({ base: t.base, rel: t.rel, entries: names.map((n) => [n, value]), appKey: t.appKey, git, label: t.label });
        written.push({ target: t.id, label: t.label });
      } catch (e) {
        failed.push({ target: t.id, label: t.label, error: String(e.message || e) });
      }
    }
    // The project ref rides on the URL: parsed, never typed.
    if (b.service === 'supabase' && b.key === 'url' && refOf(value)) {
      await save({ service: 'supabase', key: 'ref', value: refOf(value), targets: b.targets });
    }
    if (state.targets && b.targets) await writeState(state);
    const legacy = shape.kind === 'legacy' || shape.kind === 'warn' ? [shape.note] : [];
    return scrub({ status: 200, ok: !failed.length && pushed.every((p) => p.ok), names, written, failed, pushed, notes: [...notes, ...legacy] });
  }

  /** Re-sync (a drifted mirror): the vault's value written to the ticked mirror files again, read here, never posted. */
  async function resync(b) {
    if (!owner()) return { status: 403, error: 'The stack is the owner\'s to set up.' };
    const v = valueOf(b.service, b.key);
    if (!v) return { status: 400, error: 'No such value in the stack.' };
    const state = await readState();
    const ctx = await context(state);
    if (!ctx.vk) return { status: 409, error: 'Set up the vault first; the stack writes through it.' };
    const { names } = resolveNames(v, ctx.fw, ctx.present);
    const entries = [];
    for (const n of names) { try { const hit = ctx.vk.v.get(n); if (hit?.value) entries.push([n, hit.value]); } catch { /* unreadable */ } }
    const scrub = scrubber(entries.map(([, x]) => x));
    if (!entries.length) return { status: 409, error: 'The vault holds no value for this yet. Save it first.' };
    const written = [];
    const failed = [];
    for (const t of ctx.mirrors.filter((x) => x.on && !x.disabled)) {
      try {
        if (t.kind === 'dotenv') mirrorDotenv({ root: ctx.root, rel: t.rel, entries, upsertEnv: ctx.vk.k.upsertEnv, git });
        else mirrorJson({ base: t.base, rel: t.rel, entries, appKey: t.appKey, git, label: t.label });
        written.push({ target: t.id, label: t.label });
      } catch (e) { failed.push({ target: t.id, label: t.label, error: String(e.message || e) }); }
    }
    return scrub({ status: 200, ok: !failed.length, names: entries.map(([n]) => n), written, failed, pushed: [], notes: [] });
  }

  /** A saved value of a service, read from the vault on the server (or a non-secret id from the last check). */
  function savedValue(ctx, state, service, key) {
    const v = valueOf(service, key);
    if (!v || !ctx.vk) return undefined;
    const { names } = resolveNames(v, ctx.fw, ctx.present);
    for (const n of names) { try { const hit = ctx.vk.v.get(n); if (hit?.value) return hit.value; } catch { /* unreadable */ } }
    if (v.fill === 'check' && !v.secret) return state.checks?.[service]?.fill?.[key];
    return undefined;
  }

  const cleanFill = (fill = {}) => {
    const out = {};
    for (const [k, x] of Object.entries(fill || {})) {
      if (typeof x !== 'string') continue;
      const id = { zoneId: 'hex32', accountId: 'hex32', teamId: 'vercelTeam', projectId: 'vercelProject', ref: 'supabaseRef' }[k];
      if (id && checkShape(id, x).ok) out[k] = x;
    }
    return out;
  };

  /** POST /api/stack/check/:service { values?: { key: value } }: posted values first, the rest read from the vault. */
  async function check(service, b = {}) {
    const svc = SERVICES[service];
    const fn = CHECKS[service];
    const posted = b.values && typeof b.values === 'object' ? b.values : {};
    // Secrets are scrubbed from the answer; a non-secret id (a project id, a zone id) is what the card shows.
    const secretOf = (k) => !!valueOf(service, k)?.secret;
    const scrub0 = scrubber(Object.entries(posted).filter(([k, x]) => typeof x === 'string' && secretOf(k)).map(([, x]) => x));
    if (!svc || !fn) return { status: 404, error: 'No check for that service.' };
    if (checking.has(service)) return { status: 409, error: 'A check is running already.' };
    if (now() - (lastCheck.get(service) || 0) < COOLDOWN_MS) return { status: 429, error: 'Checked a moment ago. Try again in a few seconds.' };
    const vals = {};
    for (const [k, x] of Object.entries(posted)) {
      const v = valueOf(service, k);
      if (!v || typeof x !== 'string' || !x.trim()) continue;
      const r = checkShape(v.shape, x);
      if (!r.ok) return scrub0({ status: 400, error: r.why });
      vals[k] = normalize(v.shape, x);
    }
    checking.add(service);
    try {
      const state = await readState();
      const ctx = await context(state);
      for (const v of svc.values) if (vals[v.key] === undefined && b.fromVault !== false) { const s = savedValue(ctx, state, service, v.key); if (s) vals[v.key] = s; }
      const scrub = scrubber([...Object.entries(vals), ...Object.entries(posted)].filter(([k, x]) => typeof x === 'string' && secretOf(k)).map(([, x]) => x));
      const domain = state.inputs.domain;
      const args = service === 'cloudflare' ? { token: vals.apiToken, domain, accountId: vals.accountId || state.checks.cloudflare?.fill?.accountId }
        : service === 'supabase' ? { url: vals.url, publishable: vals.publishable, secret: vals.secret, pat: vals.pat }
          : { token: vals.token, projectId: vals.projectId, teamId: vals.teamId, domain };
      const r = await fn(fetchImpl, args);
      const record = scrub({ ok: !!r.ok, at: new Date(now()).toISOString(), ...(r.summary ? { summary: r.summary } : {}), ...(r.reason ? { reason: r.reason } : {}), facts: pickFacts(service, r.facts || {}), fill: cleanFill(r.fill) });
      state.checks[service] = record;
      await writeState(state);
      return scrub({ status: 200, ...record });
    } finally {
      checking.delete(service);
      lastCheck.set(service, now());
    }
  }

  /** The context an action runs with: tokens and ids read from the vault here, never from the browser. */
  function actionCtx(ctx, state) {
    const get = (s, k) => savedValue(ctx, state, s, k);
    const facts = state.checks || {};
    const projectId = get('vercel', 'projectId');
    const entries = [];
    for (const key of ['url', 'publishable', 'secret', 'dbUrl']) {
      const v = valueOf('supabase', key);
      const { names } = resolveNames(v, ctx.fw, ctx.present);
      for (const n of names) if (ctx.inVault.has(n)) entries.push({ key: n, secret: v.secret });
    }
    return {
      domain: state.inputs.domain,
      cf: { token: get('cloudflare', 'apiToken'), zoneId: get('cloudflare', 'zoneId') || facts.cloudflare?.facts?.zoneId },
      vc: { token: get('vercel', 'token'), projectId, teamId: get('vercel', 'teamId') },
      projectName: (facts.vercel?.facts?.projects || []).find((p) => p.id === projectId)?.name,
      verification: state.actions['vercel.domain']?.facts?.verification || [],
      nameServers: facts.cloudflare?.facts?.nameServers || [],
      entries,
    };
  }

  /** POST /api/stack/apply/:action { confirm?, replace? }: without confirm, a plan (nothing written); with it, the change. */
  async function apply(action, b = {}) {
    const fns = ACTION_FNS[action];
    if (!fns || !ACTIONS[action]) return { status: 404, error: 'No such action.' };
    if (!owner()) return { status: 403, error: 'Actions are the owner\'s: a contributor\'s keys stay on this machine.' };
    if (busy.has(action)) return { status: 409, error: 'That is running already.' };
    busy.add(action);
    try {
      const state = await readState();
      const ctx = await context(state);
      const ac = actionCtx(ctx, state);
      const used = [ac.cf.token, ac.vc.token];
      const values = {};
      if (action === 'vercel.env' && b.confirm === true) {
        for (const e of ac.entries) { try { const hit = ctx.vk?.v.get(e.key); if (hit?.value) values[e.key] = hit.value; } catch { /* unreadable */ } }
        used.push(...Object.values(values));
      }
      const scrub = scrubber(used);
      if (b.confirm !== true) {
        const r = await fns.plan(fetchImpl, ac);
        if (!r.ok) return scrub({ status: 200, ok: false, reason: r.reason });
        plans.set(action, { at: now(), plan: r.plan, secret: r.secret || {} });
        return scrub({ status: 200, ok: true, plan: r.plan });
      }
      const p = plans.get(action);
      if (!p || now() - p.at > PLAN_MS) return { status: 409, error: 'Things changed; check the plan again.' };
      const replace = Array.isArray(b.replace) ? b.replace.map(String) : [];
      const r = action === 'cloudflare.dns' ? await fns.run(fetchImpl, ac, p.plan, p.secret, replace)
        : action === 'vercel.env' ? await fns.run(fetchImpl, ac, values)
          : await fns.run(fetchImpl, ac);
      plans.delete(action);
      const record = scrub({ ok: !!r.ok, at: new Date(now()).toISOString(), ...(r.summary ? { summary: r.summary } : {}), ...(r.reason ? { reason: r.reason } : {}), ...(r.facts ? { facts: r.facts } : {}) });
      const fresh = await readState();
      fresh.actions[action] = record;
      await writeState(fresh);
      if (action === 'vercel.env' && r.ok && ctx.vk?.k.recordAudit) {
        for (const name of r.sent || []) { try { ctx.vk.k.recordAudit(ctx.root, { action: 'push', name, destination: 'vercel', via: 'stack' }); } catch { /* the audit is best effort */ } }
      }
      return scrub({ status: 200, ...record });
    } finally {
      busy.delete(action);
    }
  }

  return { status, pick, tick, save, check, apply, readState };
}
