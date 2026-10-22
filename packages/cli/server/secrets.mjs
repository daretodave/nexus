// The secrets API and the transcript mask (spec 42, A13). The rule: the model sees names, never values.
//
// The server never reimplements the vault. It imports the served repo's own secrets scripts (scripts/secrets.mjs and
// the modules it uses: secrets-vault, secrets-sinks, secrets-scan, secrets-audit, plan/secrets-manifest, owner),
// cache-busted by mtime the way sessions.mjs's boardOf imports announce.mjs, and runs the command line's `main` in
// process: `status --json` and `audit --json` for the reads, `set NAME` (the value handed to its stdin seam, never
// argv) for a store, `push NAME --to D` for a sink. So the repo's rails hold here too: a contributor's checkout keeps
// its keys local and every sink refuses there (sinkRefusal), a push records itself in the audit log, a set records
// set or rotate. A repo with ones too old gets a 409 that says which. A repo without them is not a failure: GET answers
// vaultState 'missing' (with the root dotenv's name count) and POST /api/secrets/setup lands them (vault-setup.mjs).
//
// A value arrives in one place only, a POST body (POST /api/secrets/:name, POST /api/secrets/import with confirm), and
// leaves only into the vault and a sink's stdin. No response, header, error or log carries it: each answer of those
// two routes is scrubbed of the posted values whatever their length, on top of the mask.
//
// The mask: one function, fed by the current vault values (the repo's own vaultValues, filtered by 42.3's scannable:
// 8 characters or more, not shaped like configuration), replaces each value with `[secret NAME]`. server.mjs runs every
// JSON answer and every SSE frame through it (transcripts, session detail, Recover's journal previews, the claims and
// announce passthroughs); headless.mjs runs `nexus run`'s output through it. It refreshes when a vault file, the
// local settings or the manifest changes (a `secrets set` in a terminal counts), every minute when the keychain is on,
// and right after a store here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { primaryRoot } from './sessions.mjs';
import { isOwner as effectiveOwner } from './local.mjs';
import { durableQuestions } from './repo.mjs';
import { setupVault, DOCS } from './vault-setup.mjs';

/** The repo's scripts the API runs, each with the exports it needs. `audit` (42.6) is optional. */
const FILES = {
  cli: ['secrets.mjs', ['main']],
  vault: ['secrets-vault.mjs', ['openVault', 'parseEnv', 'sinkRefusal', 'RINGS']],
  sinks: ['secrets-sinks.mjs', ['readAudit', 'sinkFor']],
  scan: ['secrets-scan.mjs', ['scannable', 'vaultValues']],
  manifest: ['plan/secrets-manifest.mjs', ['MANIFEST', 'NAME', 'readManifest', 'importEnvExample', 'mergeImport', 'serialize', 'emptyManifest']],
  owner: ['owner.mjs', ['localSettings']],
};
const OPTIONAL = { audit: ['secrets-audit.mjs', ['rotationNudges', 'ROTATE_DAYS']] };
const NAME = /^[A-Z][A-Z0-9_]*$/;
const SINK_FLAGS = { 'github-actions': 'repo', vercel: 'environments', cloudflare: 'worker' };
const KEYCHAIN_MS = 60000;

/** A secret request row (scripts/secrets.mjs request): `secret request <chunk>: set A, B in your terminal ...`. */
const REQUEST_ROW = /secret request (\S+?):\s*set\s+([A-Z][A-Z0-9_]*(?:\s*,\s*[A-Z][A-Z0-9_]*)*)/;

/** The chunk and names a plan question asks a secret for, or null (a plain question). */
export function parseRequest(text) {
  const m = REQUEST_ROW.exec(String(text || ''));
  return m ? { chunk: m[1], names: m[2].split(',').map((n) => n.trim()).filter(Boolean) } : null;
}

/** A dotenv file at the repo root the import may read by name: never the vault's own files, never a template. */
const ENV_FILE = /^\.env(?:\.[A-Za-z0-9_-]+)?$/;
const NOT_IMPORTED = new Set(['.env', '.env.workspace', '.env.example', '.env.sample', '.env.template', '.env.defaults']);
export const importableEnv = (name) => ENV_FILE.test(String(name)) && !NOT_IMPORTED.has(String(name));

const PUBLIC_NAME = /^(?:NEXT_PUBLIC_|PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;
const SETTING_NAME = /^(?:DEBUG|LOG_LEVEL|NODE_ENV|PORT|HOST|TZ|LANG|ENV|ENVIRONMENT|VERBOSE)$/;
const CREDENTIAL_NAME = /(?:SECRET|TOKEN|PASSWORD|PASSWD|_KEY$|^KEY_|_KEY_|DATABASE|^DB_|_DB_|REDIS|MONGO|POSTGRES|MYSQL|AMQP|DSN|PRIVATE|SALT)/;

/**
 * What an imported entry looks like, from its name and value (the value never leaves the server): `public` (a public
 * prefix, or a plain URL with no credentials under a name that is not a credential's), `setting` (a well-known
 * setting's name, or configuration: a plain word, a number, a localhost URL), else `secret`. The import starts the
 * first two unticked.
 */
export function looksOf(name, value, isSecretShaped = (v) => typeof v === 'string' && v.length >= 8) {
  const n = String(name);
  const v = String(value ?? '');
  if (PUBLIC_NAME.test(n)) return 'public';
  if (SETTING_NAME.test(n)) return 'setting';
  if (/^https?:\/\/[^\s@/]+(?:[/?#]\S*)?$/.test(v) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)\b/.test(v) && !CREDENTIAL_NAME.test(n)) return 'public';
  if (!isSecretShaped(v)) return 'setting';
  return 'secret';
}

/** Each name's last set or rotation time (ISO) from the audit events. */
function lastSets(events) {
  const out = new Map();
  for (const e of events) {
    if (!e || (e.action !== 'set' && e.action !== 'rotate') || typeof e.name !== 'string' || typeof e.time !== 'string') continue;
    if (!out.has(e.name) || out.get(e.name) < e.time) out.set(e.name, e.time);
  }
  return out;
}

/** The date a plan file's frontmatter carries (`date: YYYY-MM-DD`), or null. */
function fileDate(abs) {
  try { return (/^---[\s\S]*?^date:\s*(\d{4}-\d{2}-\d{2})/m.exec(fs.readFileSync(abs, 'utf8')) || [])[1] || null; } catch { return null; }
}

/** One masking function over a list of [name, value] (longest value first): text, and a deep copy of any JSON. */
export function createMask() {
  let list = [];
  const text = (s) => {
    if (typeof s !== 'string' || !list.length) return s;
    let out = s;
    for (const [n, v] of list) if (out.includes(v)) out = out.split(v).join(`[secret ${n}]`);
    return out;
  };
  const deep = (x, depth = 0) => {
    if (!list.length) return x;
    if (typeof x === 'string') return text(x);
    if (!x || typeof x !== 'object' || depth > 64) return x;
    if (Array.isArray(x)) return x.map((y) => deep(y, depth + 1));
    if (Object.getPrototypeOf(x) !== Object.prototype && Object.getPrototypeOf(x) !== null) return x.toJSON ? deep(x.toJSON(), depth + 1) : x;
    const out = {};
    for (const [k, v] of Object.entries(x)) out[text(k)] = deep(v, depth + 1);
    return out;
  };
  return {
    text,
    deep,
    /** Replace the values masked: [[name, value]], already filtered to the secret-shaped ones. */
    set(pairs) { list = [...pairs].sort((a, b) => b[1].length - a[1].length); },
    get size() { return list.length; },
  };
}

/** Every posted value taken out of a text or JSON, whatever its length (the answers of the two routes that take one). */
function scrubber(values) {
  const vs = [...new Set(values.filter((v) => typeof v === 'string' && v))].sort((a, b) => b.length - a.length);
  const text = (s) => { let o = s; for (const v of vs) o = o.split(v).join('[secret]'); return o; };
  const deep = (x) => (typeof x === 'string' ? text(x) : Array.isArray(x) ? x.map(deep) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [text(k), deep(v)])) : x);
  return vs.length ? deep : (x) => x;
}

/** Load the repo's secrets scripts: { ok, m } or { ok: false, error } (a 409's reason). */
async function loadKit(repo) {
  const dir = path.join(repo, 'scripts');
  if (!fs.existsSync(path.join(dir, FILES.vault[0]))) {
    return { ok: false, missing: true, error: 'this repo has no secrets vault yet: set it up from the Vault' };
  }
  const m = {};
  const load = async (key, [file, names], optional) => {
    const abs = path.join(dir, file);
    if (!fs.existsSync(abs)) return optional ? null : `this repo has no scripts/${file}: update its secrets scripts from the kit's templates/scripts`;
    let mod;
    try { mod = await import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`); } catch (e) { return `scripts/${file} did not load (${String(e.message || e).split('\n')[0]})`; }
    const gone = names.filter((n) => !(n in mod));
    if (gone.length) return optional ? null : `this repo's scripts/${file} is older than the GUI needs (no ${gone.join(', ')}): update it from the kit's templates/scripts`;
    m[key] = mod;
    return null;
  };
  for (const [key, spec] of Object.entries(FILES)) { const why = await load(key, spec, false); if (why) return { ok: false, error: why }; }
  for (const [key, spec] of Object.entries(OPTIONAL)) await load(key, spec, true);
  return { ok: true, m };
}

const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

/** The names a dotenv's text sets (live lines only), in order, never a value: the vault's own line shape. */
export function envNames(text) {
  const out = [];
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** The root dotenv's names (the vault's local ring once the vault is here), or null when there is none. */
function rootEnvNames(root) {
  try { return envNames(fs.readFileSync(path.join(root, '.env'), 'utf8')); } catch { return null; }
}

/**
 * The secrets API for one served repo.
 * @param {object} o
 * @param {string} o.repo                the served repo (its scripts are the ones run)
 * @param {function} [o.run]             a sink's runner (cmd, args, { input, cwd }) -> { status } (tests: a fake; never gh)
 * @param {object} [o.vault]             openVault overrides (tests: git, keychain seams)
 * @param {() => boolean} [o.owner]      effective owner mode (default: server/local.mjs's check)
 * @param {object} [o.mask]              the mask to keep fed (default: a new one)
 * @param {object} [o.setup]             setupVault overrides (tests: { gh } a fake pull request opener, { source })
 * @param {function} [o.setupFn]         replaces setupVault entirely (tests)
 */
export function createSecrets({ repo, run, vault: vaultOpts = {}, owner = () => effectiveOwner(repo), mask = createMask(), setup: setupOpts, setupFn } = {}) {
  let rootP = null;
  const vroot = () => (rootP ||= primaryRoot(repo).catch(() => repo));
  let kitP = null;
  let kitSig = '';
  const kitSignature = () => [...Object.values(FILES), ...Object.values(OPTIONAL)].map(([f]) => mtime(path.join(repo, 'scripts', f))).join('|');
  async function kit() {
    const sig = kitSignature();
    if (!kitP || sig !== kitSig) { kitSig = sig; kitP = loadKit(repo); }
    return kitP;
  }

  /** Run the repo's secrets command line in process: { code, out: [lines], err: [lines] }. */
  async function cli(k, argv, extra = {}) {
    const out = [];
    const err = [];
    const code = await k.m.cli.main(argv, { out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), owner, vault: vaultOpts, ...(run ? { run } : {}), ...extra });
    return { code, out, err };
  }

  // The mask's feed: the vault's values, re-read when a vault file, the settings or the manifest changes.
  let fed = { sig: null, at: 0 };
  async function refresh({ force = false } = {}) {
    const k = await kit();
    if (!k.ok) { mask.set([]); fed = { sig: null, at: 0 }; return mask; }
    const root = await vroot();
    const settings = k.m.owner.localSettings(root);
    const v = k.m.vault.openVault({ root, settings, ...vaultOpts });
    const sig = [mtime(v.config.local), mtime(v.config.workspace), mtime(path.join(root, '.nexus', 'local.json')), mtime(path.join(root, k.m.manifest.MANIFEST)), kitSig].join('|');
    if (!force && sig === fed.sig && !(v.config.keychain && Date.now() - fed.at > KEYCHAIN_MS)) return mask;
    let declared = [];
    try { declared = [...(k.m.manifest.readManifest(path.join(root, k.m.manifest.MANIFEST))?.names ?? [])]; } catch { /* a broken manifest: the files' names still count */ }
    try {
      mask.set(k.m.scan.scannable(k.m.scan.vaultValues(v, declared)));
      fed = { sig, at: Date.now() };
    } catch {
      fed = { sig: null, at: 0 }; // a vault that cannot be read now is asked again on the next request
    }
    return mask;
  }

  const unavailable = (k) => ({ status: 409, available: false, error: k.error });

  /** The root dotenv by count: { exists, names } (and, given the manifest's names, how many it does not declare yet). */
  function rootEnvOf(root, declared) {
    const names = rootEnvNames(root);
    if (!names) return { exists: false, names: 0 };
    const valid = names.filter((n) => NAME.test(n));
    return { exists: true, names: names.length, ...(declared ? { undeclared: valid.filter((n) => !declared.has(n)).length } : {}) };
  }
  const failed = (r, status = 409) => ({ status, error: [...r.err, ...r.out].join('\n').trim() || `exited ${r.code}` });

  /** The last push of each name to each destination, from the audit log: Map `${name}\0${destination}` -> event. */
  const lastPushes = (events) => {
    const out = new Map();
    for (const e of events) if (e && e.action === 'push' && typeof e.name === 'string') out.set(`${e.name}\0${e.destination}`, e);
    return out;
  };

  /** GET /api/secrets: names and status (where set, each destination's last push, the chunk that asked, age), never a value. */
  async function status() {
    const k = await kit();
    if (!k.ok && k.missing) {
      // No vault scripts at all: not a failure, an empty state with a way forward (Set up the vault).
      const root = await vroot();
      const isOwner = !!owner();
      return { status: 200, available: false, vaultState: 'missing', mode: isOwner ? 'owner' : 'contributor', owner: isOwner, manifest: fs.existsSync(path.join(root, 'nexus.secrets.json')), rootEnv: rootEnvOf(root), docs: DOCS };
    }
    if (!k.ok) return unavailable(k);
    const root = await vroot();
    const r = await cli(k, ['status', '--json', '--root', root]);
    if (r.code !== 0) return failed(r);
    let st;
    try { st = JSON.parse(r.out.join('\n')); } catch { return { status: 409, error: 'this repo\'s scripts/secrets.mjs has no status --json: update it from the kit\'s templates/scripts' }; }
    const man = k.m.manifest.readManifest(path.join(root, k.m.manifest.MANIFEST));
    const entries = new Map((man?.manifest?.secrets ?? []).map((e) => [e.name, e]));
    const events = k.m.sinks.readAudit(root);
    const pushes = lastPushes(events);
    const sets = lastSets(events);
    const isOwner = st.mode ? st.mode === 'owner' : !!owner();
    const secrets = (st.secrets ?? []).map((s) => {
      const e = entries.get(s.name) || {};
      const setAt = sets.get(s.name) || null;
      const destinations = (s.destinations ?? []).map((d) => {
        if (d === 'local') return { destination: d, state: s.rings.length ? 'set' : 'missing' };
        const p = pushes.get(`${s.name}\0${d}`);
        const { time, action, name, destination, ...detail } = p || {};
        // A push older than the value's last set or rotation: the destination still holds the old value.
        const stale = !!(p && setAt && time < setAt);
        return { destination: d, state: p ? 'pushed' : 'not pushed', at: p ? time : null, ...(stale ? { stale } : {}), ...(p ? { detail } : {}) };
      });
      return { name: s.name, for: e.for ?? null, where: e.where ?? null, chunk: e.chunk ?? null, declared: !!s.declared, set: s.rings.length > 0, rings: s.rings, destinations, age: s.age ?? null, setAt, rotate: !!s.rotate };
    });
    const isSet = new Set(secrets.filter((s) => s.set).map((s) => s.name));
    for (const lk of st.localKeys ?? []) if (lk.rings?.length) isSet.add(lk.name);
    const nudges = k.m.audit ? k.m.audit.rotationNudges(events, { held: (n) => secrets.some((s) => s.name === n && s.rotate) }) : [];
    return {
      status: 200,
      available: true,
      mode: isOwner ? 'owner' : 'contributor',
      owner: isOwner,
      projectSecretsNeeded: st.projectSecretsNeeded ?? (isOwner ? secrets.filter((s) => s.declared).length : 0),
      manifest: !!man,
      vault: st.vault ?? null,
      secrets,
      localKeys: st.localKeys ?? [],
      nudges,
      rotateDays: k.m.audit?.ROTATE_DAYS ?? null,
      audit: events.slice(-20),
      sinks: Object.keys(SINK_FLAGS).filter((d) => k.m.sinks.sinkFor(d)),
      requests: requestsIn(durableQuestions(repo), (n) => isSet.has(n)),
      envFiles: envFilesAt(root),
      vaultState: 'ready',
      rootEnv: rootEnvOf(root, man?.names ?? new Set()),
      docs: DOCS,
    };
  }

  /** The plan's open secret requests, each with the names still missing (a request whose names are all set is gone). */
  function requestsIn(durable, has) {
    const out = [];
    for (const d of durable) {
      const r = parseRequest(d.text);
      if (!r) continue;
      const missing = r.names.filter((n) => !has(n));
      if (missing.length) out.push({ ...r, missing, file: d.file, line: d.line, date: fileDate(path.join(repo, d.file)) });
    }
    return out;
  }

  /** The importable dotenv files at the root, by name only. */
  function envFilesAt(root) {
    try { return fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile() && importableEnv(e.name)).map((e) => e.name).sort(); } catch { return []; }
  }

  /**
   * The inbox's plan questions with each secret request marked: `secret: { chunk, names, missing }`. A request whose
   * names are all set leaves the inbox (its chunk is ready again); the row stays in its plan file until someone deletes it.
   */
  async function markRequests(durable) {
    if (!durable.some((d) => parseRequest(d.text))) return durable;
    // A secret request is the owner's: a contributor's inbox never asks them for a project secret.
    if (!owner()) return durable.filter((d) => !parseRequest(d.text));
    let has = () => false;
    try {
      const k = await kit();
      if (k.ok) {
        const root = await vroot();
        const v = k.m.vault.openVault({ root, settings: k.m.owner.localSettings(root), ...vaultOpts });
        const names = [...new Set(durable.flatMap((d) => parseRequest(d.text)?.names ?? []))];
        const set = new Set(v.status(names).filter((r) => r.rings.length).map((r) => r.name));
        // The vault's rings only, as GET /api/secrets reads them: a name in the server's own environment (a GH_TOKEN
        // exported in the launching shell) is not in the vault, so the request stays open in both places.
        has = (n) => set.has(n);
      }
    } catch { /* a vault that cannot be read: every name reads missing */ }
    const out = [];
    for (const d of durable) {
      const r = parseRequest(d.text);
      if (!r) { out.push(d); continue; }
      const missing = r.names.filter((n) => !has(n));
      if (missing.length) out.push({ ...d, secret: { ...r, missing } });
    }
    return out;
  }

  /** POST /api/secrets/:name/push { destinations, repo?, environments?, worker? }: push the stored value again (Sync, Retry). */
  async function push(name, b = {}) {
    const k = await kit();
    if (!k.ok) return unavailable(k);
    if (!NAME.test(String(name))) return { status: 400, error: 'a secret\'s name is an env-var name (A-Z, 0-9 and _, starting with a letter)' };
    const root = await vroot();
    const dests = destList(b.destinations);
    if (!dests.length) return { status: 400, error: `${name}: name the destinations to push to` };
    const no = pushable(k, root, name, dests);
    if (no) return no;
    const pushed = await pushAll(k, root, name, dests, b);
    return { status: 200, ok: pushed.every((p) => p.ok), name, pushed };
  }

  /** GET /api/secrets/audit: every set, push and rotation by name (never a value), and the rotation nudges. */
  async function audit() {
    const k = await kit();
    if (!k.ok) return unavailable(k);
    const root = await vroot();
    const r = await cli(k, ['audit', '--json', '--root', root]);
    if (r.code === 0) {
      try { return { status: 200, ...JSON.parse(r.out.join('\n')) }; } catch { /* an older audit: the record itself */ }
    }
    return { status: 200, events: k.m.sinks.readAudit(root), nudges: [], rotateDays: null };
  }

  /** The manifest entry check a push needs, before anything is stored: null, or the 4xx answer. */
  function pushable(k, root, name, dests) {
    if (!dests.length) return null;
    if (!owner()) return { status: 403, error: k.m.vault.sinkRefusal('push') };
    const man = k.m.manifest.readManifest(path.join(root, k.m.manifest.MANIFEST));
    const entry = man?.manifest?.secrets?.find((e) => e.name === name);
    if (!entry) return { status: 400, error: `${name} is not declared in ${k.m.manifest.MANIFEST}: declare it and its destinations first` };
    const wrong = dests.filter((d) => !entry.destinations.includes(d));
    if (wrong.length) return { status: 400, error: `${name} does not go to ${wrong.join(', ')} (${entry.destinations.join(', ')})` };
    const nosink = dests.filter((d) => !k.m.sinks.sinkFor(d));
    if (nosink.length) return { status: 400, error: `no sink for ${nosink.join(', ')}` };
    return null;
  }

  /** Push one stored name to each destination through the repo's own `push` (owner mode, stdin, the audit line). */
  async function pushAll(k, root, name, dests, b) {
    const out = [];
    for (const d of dests) {
      const flag = SINK_FLAGS[d];
      const extra = [];
      if (flag === 'repo' && typeof b.repo === 'string' && b.repo) extra.push('--repo', b.repo);
      if (flag === 'environments' && Array.isArray(b.environments) && b.environments.length) extra.push('--env', b.environments.map(String).join(','));
      if (flag === 'worker' && typeof b.worker === 'string' && b.worker) extra.push('--worker', b.worker);
      const r = await cli(k, ['push', name, '--to', d, '--root', root, ...extra]);
      out.push(r.code === 0 ? { destination: d, ok: true, note: r.out.join('\n') } : { destination: d, ok: false, error: [...r.err, ...r.out].join('\n').trim() || `exited ${r.code}` });
    }
    return out;
  }

  const ringArgs = (ring) => (ring == null || ring === '' ? [] : ['--ring', String(ring)]);
  const destList = (x) => (Array.isArray(x) ? [...new Set(x.map(String))].filter((d) => d !== 'local') : []);

  /**
   * POST /api/secrets/:name { value, ring?, destinations?, repo?, environments?, worker? }: the value into the vault
   * (the repo's `set`, the value on its stdin seam), then each destination through its sink (owner only).
   */
  async function store(name, b = {}) {
    const value = b.value;
    const scrub = scrubber([value]);
    const k = await kit();
    if (!k.ok) return unavailable(k);
    if (!NAME.test(String(name))) return { status: 400, error: 'a secret\'s name is an env-var name (A-Z, 0-9 and _, starting with a letter)' };
    if (typeof value !== 'string' || value === '') return { status: 400, error: `${name}: a value is a non-empty string` };
    const root = await vroot();
    const dests = destList(b.destinations);
    // Add a secret (the Vault's form): the owner declares the name and the places ticked before it is stored. `set`
    // writes the vault whatever is ticked (each sink pushes from it), so local is always declared.
    if (b.declare === true) {
      if (!owner()) return { status: 403, error: k.m.vault.sinkRefusal('push') };
      const why = declareIn(k, root, name, { for: b.for, destinations: ['local', ...dests] });
      if (why) return scrub({ status: 400, error: why });
    }
    const no = pushable(k, root, name, dests);
    if (no) return scrub(no);
    try {
      const r = await cli(k, ['set', name, '--root', root, ...ringArgs(b.ring)], { input: async () => value });
      if (r.code !== 0) return scrub(failed(r, r.code === 64 ? 400 : 409));
      await refresh({ force: true });
      const pushed = await pushAll(k, root, name, dests, b);
      const ring = (/->\s*(\w+)/.exec(r.out[0] || '') || [])[1] || null;
      return scrub({ status: 200, ok: pushed.every((p) => p.ok), name, stored: true, ring, pushed, notes: r.out.slice(1).map((s) => s.trim()) });
    } catch (e) {
      return scrub({ status: 500, error: String(e.message || e) });
    }
  }

  /**
   * POST /api/secrets/import { text, confirm?, names?, ring? }: a .env's text. Without confirm, a names-only preview
   * (nothing written); with it, each picked one-line value stored through the repo's `set`, and (owner) the new names
   * added to the manifest the way `import` adds them.
   */
  async function importEnv(b = {}) {
    const k = await kit();
    if (!k.ok) return unavailable(k);
    const root = await vroot();
    // `file` names a dotenv at the repo root (the onboarding step's "found .env.local"): the server reads it, so its
    // values never reach the browser. Otherwise `text` is a file the person picked or dropped.
    let text = typeof b.text === 'string' ? b.text : '';
    const file = typeof b.file === 'string' && b.file ? b.file : null;
    if (file) {
      if (!importableEnv(file)) return { status: 400, error: `${file} is not a dotenv file the import reads (the vault's own files and templates are left alone)` };
      try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch { return { status: 404, error: `no ${file} at the repo root` }; }
    }
    const entries = [...k.m.vault.parseEnv(text)].filter(([, v]) => v !== '');
    const scrub = scrubber(entries.map(([, v]) => v));
    if (!entries.length) return { status: 400, error: 'no NAME=value lines to import' };
    const comments = text.split(/\r?\n/).filter((l) => /^\s*#/.test(l)).length;
    const v = k.m.vault.openVault({ root, settings: k.m.owner.localSettings(root), ...vaultOpts });
    const man = k.m.manifest.readManifest(path.join(root, k.m.manifest.MANIFEST));
    const declared = man?.names ?? new Set();
    const where = new Map(v.status(entries.map(([n]) => n).filter((n) => NAME.test(n))).map((r) => [r.name, r.rings]));
    const isOwner = !!owner();
    const shaped = (val) => { try { return k.m.scan.scannable([['x', val]]).length > 0; } catch { return typeof val === 'string' && val.length >= 8; } };
    const why = (n, val) => (!NAME.test(n) ? 'not an env-var name' : /[\r\n\0]/.test(val) ? 'a value on more than one line' : null);
    const names = entries.map(([n, val]) => ({ name: n, declared: declared.has(n), rings: where.get(n) ?? [], looks: looksOf(n, val, shaped), ...(why(n, val) ? { skip: why(n, val) } : {}) }));
    if (b.confirm !== true) return scrub({ status: 200, preview: true, mode: isOwner ? 'owner' : 'contributor', ...(file ? { file } : {}), comments, names });
    const want = Array.isArray(b.names) ? new Set(b.names.map(String)) : null;
    const picked = entries.filter(([n, val]) => !why(n, val) && (!want || want.has(n)));
    // Owner: where each picked name goes, { NAME: ['local', 'github-actions', ...] } (the import's checkboxes).
    const toOf = (n) => (b.destinations && typeof b.destinations === 'object' && Array.isArray(b.destinations[n]) ? [...new Set(b.destinations[n].map(String))] : null);
    if (!isOwner && picked.some(([n]) => (toOf(n) || []).some((d) => d !== 'local'))) return scrub({ status: 403, error: k.m.vault.sinkRefusal('push') });
    // A declared name goes only where the manifest sends it: an import replaces its value, never its places (those
    // change in the manifest or through Add a secret). A place it does not name refuses the import before any store.
    if (isOwner) {
      const decl = new Map((man?.manifest?.secrets ?? []).map((e) => [e.name, e.destinations]));
      const wrong = picked.map(([n]) => [n, decl.get(n), destList(toOf(n))]).filter(([, has, to]) => has && to.some((d) => !has.includes(d)));
      if (wrong.length) return scrub({ status: 400, error: wrong.map(([n, has, to]) => `${n} does not go to ${to.filter((d) => !has.includes(d)).join(', ')} (${has.join(', ')}): untick it, or add the place to ${k.m.manifest.MANIFEST} first`).join('; ') });
    }
    const stored = [];
    const failures = [];
    try {
      for (const [n, val] of picked) {
        const r = await cli(k, ['set', n, '--root', root, ...ringArgs(b.ring)], { input: async () => val });
        if (r.code === 0) stored.push(n);
        else failures.push({ name: n, error: [...r.err, ...r.out].join('\n').trim() });
      }
      await refresh({ force: true });
      let added = [];
      let kept = [];
      const pushed = [];
      if (isOwner && stored.length) {
        const imported = k.m.manifest.importEnvExample(text).filter((e) => stored.includes(e.name));
        const merged = k.m.manifest.mergeImport(man ? man.manifest : k.m.manifest.emptyManifest(), imported);
        // The places ticked replace an added name's default; the vault keeps every value, so local is always one. A
        // declared name keeps its own places (checked above).
        for (const e of merged.manifest.secrets) {
          const to = toOf(e.name);
          if (!to || !stored.includes(e.name) || !merged.added.includes(e.name)) continue;
          e.destinations = ['local', ...destList(to).filter((d) => d in SINK_FLAGS)];
        }
        if (merged.added.length || !man) fs.writeFileSync(path.join(root, k.m.manifest.MANIFEST), k.m.manifest.serialize(merged.manifest));
        ({ added, kept } = merged);
        for (const n of stored) {
          const sinks = destList(toOf(n));
          if (!sinks.length) continue;
          const no = pushable(k, root, n, sinks);
          if (no) { pushed.push({ name: n, ok: false, error: no.error }); continue; }
          for (const p of await pushAll(k, root, n, sinks, b)) pushed.push({ name: n, ...p });
        }
      }
      return scrub({ status: failures.length && !stored.length ? 409 : 200, ok: !failures.length && pushed.every((p) => p.ok), stored, failed: failures, pushed, skipped: names.filter((x) => x.skip).map((x) => ({ name: x.name, why: x.skip })), added, kept, mode: isOwner ? 'owner' : 'contributor' });
    } catch (e) {
      return scrub({ status: 500, error: String(e.message || e), stored });
    }
  }

  /**
   * Declare a name in the manifest, or add places to a declared one (owner, the Vault's "Add a secret"): null, or why
   * not. A new entry gets what it is for and the places ticked; an existing one keeps its own and gains the ticked.
   */
  function declareIn(k, root, name, { for: what, destinations = [] } = {}) {
    const file = path.join(root, k.m.manifest.MANIFEST);
    let man;
    try { man = k.m.manifest.readManifest(file); } catch (e) { return `${k.m.manifest.MANIFEST} did not read (${String(e.message || e).split('\n')[0]}): fix it first`; }
    const m = man ? { ...man.manifest, secrets: [...man.manifest.secrets] } : k.m.manifest.emptyManifest();
    const places = [...new Set(destinations.map(String))].filter((d) => d === 'local' || d in SINK_FLAGS);
    const at = m.secrets.findIndex((e) => e.name === name);
    if (at >= 0) {
      const e = m.secrets[at];
      const next = [...new Set([...e.destinations, ...places])];
      if (next.length === e.destinations.length) return null;
      m.secrets[at] = { ...e, destinations: next };
    } else {
      const words = typeof what === 'string' ? what.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      m.secrets.push({ name, for: words || 'Added in the vault.', where: null, destinations: places.length ? places : ['local'], provider: 'owner', chunk: null });
    }
    fs.writeFileSync(file, k.m.manifest.serialize(m));
    return null;
  }

  /**
   * POST /api/secrets/manifest { fromEnv? }: start an empty manifest (onboarding's "Start empty"), owner only; one that
   * exists stays. With fromEnv, the root dotenv is already the vault: its names (never a value, never a comment) go
   * into the manifest, each local, and a name already declared is kept as written.
   */
  async function startManifest(b = {}) {
    const k = await kit();
    if (!k.ok) return unavailable(k);
    if (!owner()) return { status: 403, error: "the manifest is the owner's: a contributor needs no project secrets" };
    const root = await vroot();
    const file = path.join(root, k.m.manifest.MANIFEST);
    if (b && b.fromEnv === true) {
      const names = (rootEnvNames(root) || []).filter((n) => NAME.test(n));
      if (!names.length) return { status: 400, error: 'the root .env names nothing to declare' };
      let man;
      try { man = k.m.manifest.readManifest(file); } catch (e) { return { status: 409, error: `${k.m.manifest.MANIFEST} did not read (${String(e.message || e).split('\n')[0]}): fix it first` }; }
      const imported = names.map((name) => ({ name, for: `${name} (in the vault's .env: say what it is for)`, where: null }));
      const merged = k.m.manifest.mergeImport(man ? man.manifest : k.m.manifest.emptyManifest(), imported);
      if (merged.added.length || !man) fs.writeFileSync(file, k.m.manifest.serialize(merged.manifest));
      await refresh({ force: true });
      return { status: 200, ok: true, created: !man, added: merged.added, kept: merged.kept, manifest: k.m.manifest.MANIFEST };
    }
    if (fs.existsSync(file)) return { status: 200, ok: true, created: false, manifest: k.m.manifest.MANIFEST };
    fs.writeFileSync(file, k.m.manifest.serialize(k.m.manifest.emptyManifest()));
    return { status: 200, ok: true, created: true, manifest: k.m.manifest.MANIFEST };
  }

  /**
   * POST /api/secrets/setup: land the vault's scripts per owner mode (vault-setup.mjs): the owner's commit on main, a
   * contributor's pull request. One at a time.
   */
  let settingUp = null;
  async function setup() {
    const k = await kit();
    if (k.ok) return { status: 200, ok: true, already: true, here: true, note: 'The vault is here already.' };
    if (!k.missing) return unavailable(k);
    if (settingUp) return { status: 409, error: 'the vault is being set up already' };
    settingUp = (setupFn || setupVault)({ repo, owner: !!owner(), ...(setupOpts || {}) });
    try { return await settingUp; } finally { settingUp = null; kitP = null; }
  }

  return { mask, refresh, status, audit, store, importEnv, push, markRequests, startManifest, setup };
}

/** The mask for one repo, fed once (headless `nexus run`): identity when the repo has no vault. */
export async function maskFor(repo, opts = {}) {
  const s = createSecrets({ repo, ...opts });
  try { await s.refresh({ force: true }); } catch { /* no vault: nothing to mask */ }
  return s.mask;
}
