// scripts/secrets-sinks.mjs: sinks push a vault value to where it is needed, and the audit record notes each push.
//
// The rule: the model sees names, never values. A sink is a small adapter that pipes the value to its tool through
// stdin, never as an argument (argv shows up in process lists, shell history and audit logs), and says only whether
// it landed: an error names the tool and its exit code, never what it printed. The registry, one entry per
// destination in nexus.secrets.json (`local` is the vault itself, so it has none):
//   github-actions   gh secret set NAME --app actions [--repo OWNER/REPO]   (gh reads the body from stdin)
//   vercel           vercel env add NAME <environment> --force --yes, once per environment (default: production,
//                    preview, development; --force overwrites, so a re-push rotates; the project is the checkout's
//                    `vercel link`; vercel reads the value from stdin)
//   cloudflare       wrangler secret put NAME [--name WORKER]   (the worker from the checkout's wrangler config, or
//                    --name; wrangler reads the value from stdin)
// A sink is { command, calls(name, opts) -> [{ args, target? }], detail(opts, landed) -> {} }: one call per target, run
// in order and stopped at the first failure; detail is what the audit line adds (the repo, the environments, the worker).
//
// The audit record: `.nexus/secrets-audit.jsonl` at the primary checkout (untracked), one JSON line per event:
//   { "time": "<ISO>", "action": "push", "name": "GH_TOKEN", "destination": "github-actions" }
// Append-only, written under `.nexus/secrets-audit.lock`; a `value` key is refused outright and every field is a
// string, so a value can't slip in under another word. recordAudit and readAudit are the seam set and rotation
// extend. `run` is the seam tests stub: no test runs a sink's real tool.
// The command line: scripts/secrets.mjs push; the how: nexus/customization/secrets.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withLock } from './ledger.mjs';

export const AUDIT = '.nexus/secrets-audit.jsonl';
export const AUDIT_LOCK = '.nexus/secrets-audit.lock';
const NAME = /^[A-Z][A-Z0-9_]*$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$|^[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development'];

/** The real runner: (cmd, args, { input, cwd }) -> { status }. Its output is dropped, never echoed. */
export function spawnRunner(cmd, args, { input = '', cwd } = {}) {
  const r = spawnSync(cmd, args, { input, cwd, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  if (r.error) return { status: 127, missing: r.error.code === 'ENOENT' };
  return { status: r.status };
}

/** Where a value can be pushed, by manifest destination. */
export const SINKS = {
  'github-actions': {
    command: 'gh',
    calls: (name, { repo } = {}) => [{ args: ['secret', 'set', name, '--app', 'actions', ...(repo ? ['--repo', repo] : [])] }],
    detail: ({ repo } = {}) => (repo ? { repo } : {}),
  },
  vercel: {
    command: 'vercel',
    calls: (name, { environments } = {}) => (environments ?? VERCEL_ENVIRONMENTS).map((e) => ({ args: ['env', 'add', name, e, '--force', '--yes'], target: e })),
    detail: (_opts, landed) => ({ environments: landed }),
  },
  cloudflare: {
    command: 'wrangler',
    calls: (name, { worker } = {}) => [{ args: ['secret', 'put', name, ...(worker ? ['--name', worker] : [])] }],
    detail: ({ worker } = {}) => (worker ? { worker } : {}),
  },
};

/** The sink for a destination, or null when there is none (yet). */
export function sinkFor(destination) {
  return Object.hasOwn(SINKS, destination) ? SINKS[destination] : null;
}

/**
 * Push one value to one destination through stdin: { destination, ok, detail? } or { destination, ok: false, error,
 * detail? }. `detail` is for the audit line; on a failure it is there only when some targets landed first.
 */
export function pushSecret({ name, value, destination, run = spawnRunner, cwd, repo, environments, worker }) {
  const sink = sinkFor(destination);
  if (!sink) throw new Error(`no sink for ${destination}`);
  if (!NAME.test(name ?? '')) throw new Error(`${name}: not an env-var name`);
  if (typeof value !== 'string' || value === '') throw new Error(`${name}: an empty value (nothing to push)`);
  if (/[\r\n\0]/.test(value)) throw new Error(`${name}: a value on one line only`);
  if (repo && !REPO.test(repo)) throw new Error(`${repo}: a repo is OWNER/REPO or HOST/OWNER/REPO`);
  for (const e of environments ?? []) if (!VERCEL_ENVIRONMENTS.includes(e)) throw new Error(`${e}: a Vercel environment is one of ${VERCEL_ENVIRONMENTS.join(', ')}`);
  if (environments && !environments.length) throw new Error('name at least one Vercel environment');
  if (worker && !WORKER.test(worker)) throw new Error(`${worker}: not a worker name`);
  const opts = { repo, environments, worker };
  const landed = [];
  const withDetail = (out, detail) => (detail && Object.keys(detail).length ? { ...out, detail } : out);
  for (const call of sink.calls(name, opts)) {
    const r = run(sink.command, call.args, { input: value, cwd });
    if (r && r.status === 0) { landed.push(call.target); continue; }
    const why = r && r.missing ? `${sink.command} is not installed` : `${sink.command} exited ${r ? r.status : 'without a status'}${call.target ? ` (${call.target})` : ''}`;
    return withDetail({ destination, ok: false, error: why }, landed.length ? sink.detail(opts, landed) : null);
  }
  return withDetail({ destination, ok: true }, sink.detail(opts, landed));
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
