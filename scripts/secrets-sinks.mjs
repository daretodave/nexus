// scripts/secrets-sinks.mjs: sinks push a vault value to where it is needed, and the audit record notes each push.
//
// The rule: the model sees names, never values. A sink is a small adapter that hands the value to its tool without
// ever putting it in an argument (argv shows up in process lists, shell history and audit logs), and says only whether
// it landed: an error names the tool and its exit code (or the HTTP status), never what it printed. A sink that would
// need the value in argv is refused outright: pushSecret checks every call's arguments before it runs. Three ways in:
//   stdin   the value on the tool's stdin (most of them)
//   file    a tool that reads a file only: /dev/stdin on macOS and Linux (still stdin, nothing on disk); on Windows a
//           temp file, owner-only (0600) in its own new folder, deleted the moment the tool exits, landed or not
//   api     an HTTPS call with the value in the request body, never the URL; its token is read from the vault
// The registry, one entry per destination in nexus.secrets.json (`local` is the vault itself, so it has none):
//   github-actions      gh secret set NAME --app actions [--repo OWNER/REPO]                       stdin
//   vercel              vercel env add NAME <environment> --force --yes, once per environment          stdin
//                       (default: production, preview, development; --force overwrites, so a re-push rotates; the
//                       project is the checkout's `vercel link`)
//   cloudflare          wrangler secret put NAME [--name WORKER]   (a Worker; the worker from the wrangler config)  stdin
//   cloudflare-pages    wrangler pages secret put NAME [--project-name P] [--env preview], per environment       stdin
//                       (default: production)
//   netlify             the Netlify API: PUT /accounts/{account}/env/{NAME}?site_id=SITE (POST when it is new), a
//                       secret value per deploy context (default: production, deploy-preview, branch-deploy; never
//                       dev, which Netlify shows in plain text). `netlify env:set` takes the value in argv: refused.
//                       Token: NETLIFY_AUTH_TOKEN from the vault; site: --site, else NETLIFY_SITE_ID, else the
//                       checkout's .netlify/state.json                                                         api
//   fly                 fly secrets import --stage [--app APP]: a NAME=VALUE line on stdin; --stage sets it for the
//                       next deploy rather than restarting machines now                                       stdin
//   supabase            supabase secrets set --env-file F [--project-ref P] (Edge Function secrets; `secrets set
//                       NAME=VALUE` is argv: refused). F holds one NAME='VALUE' line; a value with ' is refused  file
//   firebase            firebase functions:secrets:set NAME [--project P] (Cloud Functions secrets)           stdin
//   aws-secrets-manager aws secretsmanager put-secret-value --secret-id NAME --secret-string file://F [--region R],
//                       and create-secret --name NAME the first time                                          file
//   aws-ssm             aws ssm put-parameter --name NAME --type SecureString --overwrite --value file://F       file
//   gcp-secret-manager  gcloud secrets versions add NAME --data-file=- [--project P], and secrets create the first
//                       time                                                                                 stdin
//   azure-key-vault     az keyvault secret set --vault-name V --name NAME-WITH-DASHES --file F --encoding utf-8
//                       (Key Vault names take letters, digits and dashes: _ becomes -; --vault is required)    file
// A sink is { command, input?, opts, calls(name, opts, file) -> [{ args, target?, fallback? }], detail(opts, landed) }:
// one call per target, run in order and stopped at the first failure (a `fallback` call runs when its call fails: the
// create for a secret that does not exist yet); detail is what the audit line adds (the repo, the environments, the
// worker, the app). An api sink has `request` in place of command and calls.
//
// The audit record: `.nexus/secrets-audit.jsonl` at the primary checkout (untracked), one JSON line per event:
//   { "time": "<ISO>", "action": "push", "name": "GH_TOKEN", "destination": "github-actions" }
// Append-only, written under `.nexus/secrets-audit.lock`; a `value` key is refused outright and every field is a
// string, so a value can't slip in under another word. A push made from a session carries `session` (its id, from
// NEXUS_SESSION) and one made from the GUI `via`, so the change feed can say who pushed it. recordAudit and readAudit
// are the seam set and rotation extend. `run` and `fetch` are the seams tests stub: no test runs a sink's real tool.
//
// What a sink holds, read back: actionsSecretNames asks `gh secret list --json name,updatedAt` for the repo's GitHub
// Actions secret names and when each was last set (names and dates only: gh never prints a secret's value). It says "unknown"
// (known: false) when gh can't tell: not installed, not signed in, no permission, no GitHub remote.
// The command line: scripts/secrets.mjs push; the how: nexus/customization/secrets.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withLock } from './ledger.mjs';

export const AUDIT = '.nexus/secrets-audit.jsonl';
export const AUDIT_LOCK = '.nexus/secrets-audit.lock';
const NAME = /^[A-Z][A-Z0-9_]*$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$|^[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** A project, app, site, vault or region id: letters, digits, dots, dashes and underscores, never a leading dash. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development'];
export const PAGES_ENVIRONMENTS = ['production', 'preview'];
export const NETLIFY_CONTEXTS = ['production', 'deploy-preview', 'branch-deploy', 'dev'];
const NETLIFY_DEFAULT = ['production', 'deploy-preview', 'branch-deploy'];
const NETLIFY_API = 'https://api.netlify.com/api/v1';

/**
 * The real runner: (cmd, args, { input, cwd, capture }) -> { status, stdout? }. Its output is dropped, never echoed;
 * with `capture` (a names-only read such as actionsSecretNames) stdout comes back to the caller, never to a terminal.
 */
export function spawnRunner(cmd, args, { input = '', cwd, capture = false } = {}) {
  const r = spawnSync(cmd, args, { input, cwd, stdio: ['pipe', capture ? 'pipe' : 'ignore', 'ignore'], windowsHide: true, ...(capture ? { encoding: 'utf8', timeout: 15000 } : {}) });
  if (r.error) return { status: 127, missing: r.error.code === 'ENOENT' };
  return capture ? { status: r.status, stdout: r.stdout ?? '' } : { status: r.status };
}

/**
 * The repo's GitHub Actions secret names: `gh secret list --json name,updatedAt` (names and dates, never a value).
 * { known: true, names: Set, updated: Map name -> ISO date } or { known: false, why } when gh can't tell (not
 * installed, not signed in, no permission, no remote).
 */
export function actionsSecretNames({ run = spawnRunner, cwd, repo } = {}) {
  if (repo && !REPO.test(repo)) return { known: false, why: `${repo}: a repo is OWNER/REPO or HOST/OWNER/REPO` };
  let r;
  try { r = run('gh', ['secret', 'list', '--json', 'name,updatedAt', ...(repo ? ['--repo', repo] : [])], { cwd, capture: true }); } catch { r = null; }
  if (!r || r.status !== 0) return { known: false, why: r && r.missing ? 'gh is not installed' : `gh exited ${r ? r.status : 'without a status'}` };
  let list;
  try { list = JSON.parse(String(r.stdout ?? '')); } catch { return { known: false, why: 'gh did not answer with a list' }; }
  if (!Array.isArray(list)) return { known: false, why: 'gh did not answer with a list' };
  const rows = list.filter((x) => x && typeof x.name === 'string' && NAME.test(x.name));
  const updated = new Map(rows.filter((x) => typeof x.updatedAt === 'string' && !Number.isNaN(Date.parse(x.updatedAt))).map((x) => [x.name, x.updatedAt]));
  return { known: true, names: new Set(rows.map((x) => x.name)), updated };
}

const opt = (flag, v) => (v ? [flag, v] : []);
const envsOr = (list, fallback) => (list && list.length ? list : fallback);

/** Where a value can be pushed, by manifest destination. `opts`: the push options each one takes. */
export const SINKS = {
  'github-actions': {
    command: 'gh', label: 'GitHub Actions', opts: ['repo'],
    calls: (name, { repo } = {}) => [{ args: ['secret', 'set', name, '--app', 'actions', ...opt('--repo', repo)] }],
    detail: ({ repo } = {}) => (repo ? { repo } : {}),
  },
  vercel: {
    command: 'vercel', label: 'Vercel', opts: ['environments'], environments: VERCEL_ENVIRONMENTS,
    calls: (name, { environments } = {}) => envsOr(environments, VERCEL_ENVIRONMENTS).map((e) => ({ args: ['env', 'add', name, e, '--force', '--yes'], target: e })),
    detail: (_opts, landed) => ({ environments: landed }),
  },
  cloudflare: {
    command: 'wrangler', label: 'Cloudflare Workers', opts: ['worker'],
    calls: (name, { worker } = {}) => [{ args: ['secret', 'put', name, ...opt('--name', worker)] }],
    detail: ({ worker } = {}) => (worker ? { worker } : {}),
  },
  'cloudflare-pages': {
    command: 'wrangler', label: 'Cloudflare Pages', opts: ['project', 'environments'], environments: PAGES_ENVIRONMENTS,
    calls: (name, { project, environments } = {}) => envsOr(environments, ['production']).map((e) => ({ args: ['pages', 'secret', 'put', name, ...opt('--project-name', project), ...(e === 'production' ? [] : ['--env', e])], target: e })),
    detail: ({ project } = {}, landed) => ({ environments: landed, ...(project ? { project } : {}) }),
  },
  netlify: {
    api: true, label: 'Netlify', opts: ['site', 'environments'], environments: NETLIFY_CONTEXTS, token: 'NETLIFY_AUTH_TOKEN', siteName: 'NETLIFY_SITE_ID',
    request: netlifyRequest,
    detail: ({ environments } = {}, landed) => ({ environments: landed ?? envsOr(environments, NETLIFY_DEFAULT) }),
  },
  fly: {
    command: 'fly', label: 'Fly.io', opts: ['app'], line: true,
    calls: (_name, { app } = {}) => [{ args: ['secrets', 'import', '--stage', ...opt('--app', app)] }],
    detail: ({ app } = {}) => (app ? { app } : {}),
  },
  supabase: {
    command: 'supabase', label: 'Supabase Edge Functions', opts: ['project'], input: 'file', envFile: true,
    // Supabase reserves the SUPABASE_ prefix for the names it injects into every function, and rejects it.
    refuseName: (name) => (/^SUPABASE_/.test(name) ? `${name}: Supabase reserves the SUPABASE_ prefix (its functions already have their own SUPABASE_ values)` : null),
    calls: (_name, { project } = {}, file) => [{ args: ['secrets', 'set', '--env-file', file, ...opt('--project-ref', project)] }],
    detail: ({ project } = {}) => (project ? { project } : {}),
  },
  firebase: {
    command: 'firebase', label: 'Firebase Functions', opts: ['project'],
    calls: (name, { project } = {}) => [{ args: ['functions:secrets:set', name, ...opt('--project', project)] }],
    detail: ({ project } = {}) => (project ? { project } : {}),
  },
  'aws-secrets-manager': {
    command: 'aws', label: 'AWS Secrets Manager', opts: ['region'], input: 'file',
    calls: (name, { region } = {}, file) => [{
      args: ['secretsmanager', 'put-secret-value', '--secret-id', name, '--secret-string', `file://${file}`, ...opt('--region', region)],
      fallback: { args: ['secretsmanager', 'create-secret', '--name', name, '--secret-string', `file://${file}`, ...opt('--region', region)] },
    }],
    detail: ({ region } = {}) => (region ? { region } : {}),
  },
  'aws-ssm': {
    command: 'aws', label: 'AWS Parameter Store', opts: ['region'], input: 'file',
    calls: (name, { region } = {}, file) => [{ args: ['ssm', 'put-parameter', '--name', name, '--type', 'SecureString', '--overwrite', '--value', `file://${file}`, ...opt('--region', region)] }],
    detail: ({ region } = {}) => (region ? { region } : {}),
  },
  'gcp-secret-manager': {
    command: 'gcloud', label: 'Google Secret Manager', opts: ['project'],
    calls: (name, { project } = {}) => [{
      args: ['secrets', 'versions', 'add', name, '--data-file=-', ...opt('--project', project)],
      fallback: { args: ['secrets', 'create', name, '--data-file=-', '--replication-policy=automatic', ...opt('--project', project)] },
    }],
    detail: ({ project } = {}) => (project ? { project } : {}),
  },
  'azure-key-vault': {
    command: 'az', label: 'Azure Key Vault', opts: ['vault'], input: 'file', requires: 'vault',
    calls: (name, { vault } = {}, file) => [{ args: ['keyvault', 'secret', 'set', '--vault-name', vault, '--name', keyVaultName(name), '--file', file, '--encoding', 'utf-8', '--output', 'none'] }],
    detail: ({ vault } = {}) => ({ vault }),
  },
};

/** A Key Vault secret's name for an env name: letters, digits and dashes only, so _ becomes -. */
export const keyVaultName = (name) => String(name).replace(/_/g, '-');

/** The sink for a destination, or null when there is none (yet). */
export function sinkFor(destination) {
  return Object.hasOwn(SINKS, destination) ? SINKS[destination] : null;
}

/** Each destination's options, checked before anything runs: an error names the option, never a value. */
function checkOpts(destination, sink, { repo, environments, worker, project, app, site, region, vault }) {
  if (repo && !REPO.test(repo)) throw new Error(`${repo}: a repo is OWNER/REPO or HOST/OWNER/REPO`);
  if (worker && !WORKER.test(worker)) throw new Error(`${worker}: not a worker name`);
  for (const [k, v] of Object.entries({ project, app, site, region, vault })) if (v && !ID.test(v)) throw new Error(`${v}: not a ${k} name`);
  if (environments) {
    const allowed = sink.environments ?? VERCEL_ENVIRONMENTS;
    const word = destination === 'netlify' ? 'a Netlify deploy context' : destination === 'cloudflare-pages' ? 'a Pages environment' : 'a Vercel environment';
    for (const e of environments) if (!allowed.includes(e)) throw new Error(`${e}: ${word} is one of ${allowed.join(', ')}`);
    if (!environments.length) throw new Error(`name at least one ${destination === 'netlify' ? 'deploy context' : 'environment'}`);
  }
  if (sink.requires && !{ vault }[sink.requires]) throw new Error(`${destination} needs --${sink.requires} (the ${sink.requires === 'vault' ? 'Key Vault' : sink.requires} to push to)`);
}

/** The value's checks every sink shares: a name, a non-empty single line. */
function checkValue(name, value) {
  if (!NAME.test(name ?? '')) throw new Error(`${name}: not an env-var name`);
  if (typeof value !== 'string' || value === '') throw new Error(`${name}: an empty value (nothing to push)`);
  if (/[\r\n\0]/.test(value)) throw new Error(`${name}: a value on one line only`);
}

/** Refuse a call whose arguments hold the value: a sink never puts one in argv. */
function refuseArgv(destination, args, value) {
  if (value.length >= 4 && args.some((a) => String(a).includes(value))) throw new Error(`${destination}: refused, the value would be on the command line`);
}

/**
 * Run fn(path, input) with the value where a file-reading tool finds it: /dev/stdin (the value on stdin) off Windows;
 * on Windows a 0600 temp file in its own new folder, removed when fn returns or throws.
 */
export function withValueFile(content, fn, { platform = process.platform, tmp = os.tmpdir() } = {}) {
  if (platform !== 'win32') return fn('/dev/stdin', content);
  const dir = fs.mkdtempSync(path.join(tmp, 'nexus-sink-'));
  const file = path.join(dir, 'value');
  try {
    fs.writeFileSync(file, content, { mode: 0o600 });
    return fn(file, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Push one value to one destination with a command-line sink: { destination, ok, detail? } or { destination, ok:
 * false, error, detail? }. `detail` is for the audit line; on a failure it is there only when some targets landed first.
 * An api sink goes through pushSecretAsync.
 */
export function pushSecret({ name, value, destination, run = spawnRunner, cwd, platform, tmp, ...rest }) {
  const sink = sinkFor(destination);
  if (!sink) throw new Error(`no sink for ${destination}`);
  if (sink.api) throw new Error(`${destination} is pushed through its API: use pushSecretAsync`);
  checkValue(name, value);
  const opts = pick(rest);
  checkOpts(destination, sink, opts);
  const refused = sink.refuseName?.(name);
  if (refused) throw new Error(refused);
  if (sink.envFile && value.includes("'")) throw new Error(`${name}: a value with ' cannot go to ${destination} (its env file reads it literally only in single quotes)`);
  const content = sink.line ? `${name}=${value}\n` : sink.envFile ? `${name}='${value}'\n` : value;
  const landed = [];
  const withDetail = (out, detail) => (detail && Object.keys(detail).length ? { ...out, detail } : out);
  const runAll = (file, input) => {
    for (const call of sink.calls(name, opts, file)) {
      const tries = [call, ...(call.fallback ? [call.fallback] : [])];
      let r = null;
      for (const t of tries) {
        refuseArgv(destination, t.args, value);
        r = run(sink.command, t.args, { input, cwd });
        if (!r || r.status === 0 || r.missing) break;
      }
      if (r && r.status === 0) { landed.push(call.target); continue; }
      const why = r && r.missing ? `${sink.command} is not installed` : `${sink.command} exited ${r ? r.status : 'without a status'}${call.target ? ` (${call.target})` : ''}`;
      return withDetail({ destination, ok: false, error: why }, landed.length ? sink.detail(opts, landed) : null);
    }
    return withDetail({ destination, ok: true }, sink.detail(opts, landed));
  };
  return sink.input === 'file' ? withValueFile(content, runAll, { platform, tmp }) : runAll(undefined, content);
}

const pick = ({ repo, environments, worker, project, app, site, region, vault } = {}) => ({ repo, environments, worker, project, app, site, region, vault });

/**
 * Push one value to any destination, api sinks included. `secrets`: { token, site } read from the vault by the caller
 * for an api sink (Netlify's NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID); `fetch` is the seam tests stub.
 */
export async function pushSecretAsync({ secrets = {}, fetch: fetchImpl = globalThis.fetch, ...args }) {
  const sink = sinkFor(args.destination);
  if (!sink) throw new Error(`no sink for ${args.destination}`);
  if (!sink.api) return pushSecret(args);
  const { name, value, destination, cwd } = args;
  checkValue(name, value);
  const opts = pick(args);
  checkOpts(destination, sink, opts);
  if (!secrets.token) return { destination, ok: false, error: `${destination} needs ${sink.token} in the vault (node scripts/secrets.mjs set ${sink.token})` };
  const site = opts.site || secrets.site || linkedNetlifySite(cwd);
  if (!site || !ID.test(site)) return { destination, ok: false, error: `${destination} needs a site: --site, ${sink.siteName} in the vault, or a linked checkout (netlify link)` };
  const r = await sink.request({ name, value, opts: { ...opts, site }, token: secrets.token, fetch: fetchImpl });
  return r.ok ? { destination, ok: true, detail: sink.detail(opts, r.landed) } : { destination, ok: false, error: r.error };
}

/** The checkout's linked Netlify site id (.netlify/state.json), or null. */
function linkedNetlifySite(cwd) {
  try { const s = JSON.parse(fs.readFileSync(path.join(cwd || '.', '.netlify', 'state.json'), 'utf8')); return typeof s.siteId === 'string' ? s.siteId : null; } catch { return null; }
}

/** The Netlify sink's calls: the site's account, then an update of the variable (a create when it is new). */
async function netlifyRequest({ name, value, opts, token, fetch: fetchImpl }) {
  const contexts = envsOr(opts.environments, NETLIFY_DEFAULT);
  const call = async (method, url, body) => {
    try {
      const res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      let json = null;
      try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: null };
    }
  };
  const fail = (what, r) => ({ ok: false, error: r.status ? `Netlify answered ${r.status} (${what})` : `Netlify did not answer (${what})` });
  const site = await call('GET', `${NETLIFY_API}/sites/${encodeURIComponent(opts.site)}`);
  if (site.status !== 200 || typeof site.json?.account_id !== 'string') return fail('reading the site', site);
  const acct = encodeURIComponent(site.json.account_id);
  const q = `site_id=${encodeURIComponent(opts.site)}`;
  // Always secret: Netlify leaves a dev value readable but keeps every other context masked, and a secret may not
  // have the post-processing scope (nor lose the flag once set), so it is never asked for.
  const entry = { key: name, scopes: ['builds', 'functions', 'runtime'], values: contexts.map((context) => ({ context, value })), is_secret: true };
  const put = await call('PUT', `${NETLIFY_API}/accounts/${acct}/env/${encodeURIComponent(name)}?${q}`, entry);
  if (put.status === 200) return { ok: true, landed: contexts };
  if (put.status !== 404) return fail('setting the variable', put);
  const made = await call('POST', `${NETLIFY_API}/accounts/${acct}/env?${q}`, [entry]);
  return made.status === 201 || made.status === 200 ? { ok: true, landed: contexts } : fail('creating the variable', made);
}

/** The session a push was made from (NEXUS_SESSION, when it is shaped like an id), or null. */
export function sessionOf(env = process.env) {
  const s = env && typeof env.NEXUS_SESSION === 'string' ? env.NEXUS_SESSION.trim() : '';
  return SESSION.test(s) ? s : null;
}

/** Append one event to the audit record: names, destinations and the time, never a value. */
export function recordAudit(root, event, { now = () => new Date().toISOString() } = {}) {
  if (!event || typeof event !== 'object') throw new Error('audit: an event is an object');
  if (Object.hasOwn(event, 'value')) throw new Error('audit: names, destinations and times, never a value');
  if (typeof event.action !== 'string' || !event.action) throw new Error('audit: an event names its action');
  for (const [k, v] of Object.entries(event)) {
    const ok = typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
    if (!ok) throw new Error(`audit: ${k}: a string (or a list of them)`);
  }
  const line = `${JSON.stringify({ time: now(), ...event })}\n`;
  const file = path.join(root, AUDIT);
  withLock(path.join(root, AUDIT_LOCK), () => fs.appendFileSync(file, line, { mode: 0o600 }));
}

/** Every event in the audit record, oldest first ([] when there is none; a torn line is skipped). */
export function readAudit(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, AUDIT), 'utf8'); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e && typeof e === 'object') out.push(e); } catch { /* a torn line */ }
  }
  return out;
}
