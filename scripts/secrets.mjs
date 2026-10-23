#!/usr/bin/env node
// scripts/secrets.mjs: the secrets command line. The rule: the model sees names, never values, so nothing here ever
// prints a value.
//
//   node scripts/secrets.mjs status [--json]                  # each name: where it is set, where it goes (Actions: gh)
//   node scripts/secrets.mjs set NAME [--ring R]              # the value from stdin (or a hidden prompt), never argv
//   node scripts/secrets.mjs unset NAME [--ring R]            # take the value out of the vault (every ring, or R)
//   node scripts/secrets.mjs import [file] [--dry-run]        # names + comments from .env.example into nexus.secrets.json
//   node scripts/secrets.mjs import FILE --store [--ring R]   # a real .env: values into the vault, names into the manifest
//   node scripts/secrets.mjs names                            # the declared names, one per line
//   node scripts/secrets.mjs check                            # the manifest keeps its shape (plan-check runs this too)
//   node scripts/secrets.mjs push NAME [--to D] [--repo O/R]  # the value to its destinations through a sink (owner mode)
//        [--env E,E] [--worker W] [--project P] [--app A] [--site S] [--region R] [--vault V]
//   node scripts/secrets.mjs audit [--json]                   # every set, push and rotation by name; rotation nudges
//   node scripts/secrets.mjs request <chunk> [--to D,D] [--service S]  # a missing secret's ask, into the oversight queue
//   node scripts/secrets.mjs run [--only A,B] -- <cmd...>     # the command, with the declared values in its env only
//   node scripts/secrets.mjs scan [--staged]                  # refuse a diff that holds a vault value (the gate's rail)
//
// The owner's `set` and `import --store` record each name in the audit record (scripts/secrets-audit.mjs: `set` for
// a first value, `rotate` for a replaced one; `unset` records `remove` for each ring it left); `status` and `audit` nudge a secret last set over 90 days ago.
// `request <chunk>` is what /next runs when a chunk's secret is missing: plan/pending/secrets-<chunk>.md, a
// `[needs-user-call]` note naming each missing secret, what it is for, where to get it and where it goes, never a
// value; once per chunk. `--to D,D` names where the value goes once it is set (each a destination nexus.secrets.json
// takes) and `--service S` the stack service it belongs to (stripe, supabase...): the GUI's Add value then opens that
// service's card in Set up a stack, and its save pushes to each place named. Never ask for a value in a session.
//
// There is no `get`: a value goes from the vault to code (scripts/secrets-vault.mjs's get and resolve: the run
// wrapper, a sink, the GUI server), never to a terminal, where the model would read it. The vault: `.env` at the
// primary checkout (local), `.env.workspace` at the workspace root (workspace), the OS keychain (keychain, opt-in in
// .nexus/local.json). `--ring` picks one of local, workspace, keychain (default: the keychain when it is on, else
// local). `import` without --store reads names and comments only: a value on a line is skipped. `--root <dir>` runs
// against another checkout (the default is this one, its vault at the primary checkout). `push` sends a declared
// name's value to each destination the manifest lists for it (or the one `--to` names) through scripts/secrets-sinks.mjs
// (stdin only), records each push in .nexus/secrets-audit.jsonl, and runs in owner mode only: a contributor's keys are
// local-only. `--env production,preview` narrows a Vercel push (default: all three environments); `--worker W` names
// the Cloudflare worker (default: the checkout's wrangler config); `--project` a Pages, Firebase, Supabase or Google
// Cloud project, `--app` a Fly app, `--site` a Netlify site, `--region` an AWS region and `--vault` an Azure Key Vault
// (secrets-sinks.mjs has each destination's defaults). A push from a session records its id (NEXUS_SESSION) in the
// audit line, so the change feed can say which session pushed what, where. A contributor checkout (not effective owner mode)
// keeps its own local-only keys: `set` and `import --store` write the local ring or the keychain and record the names
// in .nexus/secrets-local.json, never in the manifest, and `status` leads with "No project secrets needed". Exit 0 = done, 1 = a problem, 64 = usage. The manifest: scripts/plan/secrets-manifest.mjs; the how: nexus/customization/secrets.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOwner, localSettings, primaryRoot } from './owner.mjs';
import { MANIFEST, NAME, emptyManifest, importEnvExample, mergeImport, readManifest, serialize } from './plan/secrets-manifest.mjs';
import { CONTRIBUTOR_RINGS, RINGS, forgetLocalKeys, openVault, parseEnv, readLocalKeys, recordLocalKeys, sinkRefusal } from './secrets-vault.mjs';
import { SINKS, actionsSecretNames, pushSecretAsync, recordAudit, sessionOf, sinkFor, spawnRunner } from './secrets-sinks.mjs';
import { runWithSecrets } from './secrets-run.mjs';
import { describeHit, scanRepo, vaultValues } from './secrets-scan.mjs';
import { ROTATE_DAYS, ageDays, lastSet, nudgeLine, readAudit, recordRemoves, recordSets, rotationNudges } from './secrets-audit.mjs';
import { loadPlanDir } from './plan-check.mjs';

export const USAGE = 'usage: node scripts/secrets.mjs status [--json] | set NAME [--ring R] | unset NAME [--ring R] | import [file] [--dry-run] [--store [--ring R]] | names | check | push NAME [--to D] [--repo O/R] [--env E,E] [--worker W] [--project P] [--app A] [--site S] [--region R] [--vault V] | audit [--json] | request <chunk> [--to D,D] [--service S] | run [--only A,B] -- <cmd...> | scan [--staged]   [--root <dir>]';
const COMMANDS = ['status', 'set', 'unset', 'import', 'names', 'check', 'push', 'audit', 'request', 'run', 'scan'];
export const REQUEST = (id) => `secret request ${id}:`;
/** Every destination a value can be pushed to: one per sink (local is the vault itself). */
export const SINK_DESTINATIONS = Object.keys(SINKS);
const PUSH_OPTS = ['--project', '--app', '--site', '--region', '--vault'];
const SERVICE = /^[a-z][a-z0-9-]{0,39}$/;

function topLevel() {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return process.cwd(); }
}

/** Does the checkout have a GitHub remote? gh is asked only then: no remote reads unknown, and nothing runs. */
function githubRemote(root) {
  try { return /github/i.test(execFileSync('git', ['-C', root, 'remote', '-v'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return false; }
}

function vaultRoot(fallback) {
  try { return primaryRoot(fallback); } catch { return fallback; }
}

/** stdin, piped or typed: a terminal gets a hidden prompt (on stderr) and no echo. One trailing newline is dropped. */
export async function readSecretInput(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks = [];
    for await (const c of stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  process.stderr.write(prompt);
  return new Promise((resolve) => {
    let buf = '';
    const done = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); process.stderr.write('\n'); resolve(buf); };
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') return done();
        if (c === '\u0003') { buf = ''; return done(); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
  });
}

const where = (rings, optional = false, sinksOnly = null) => (rings.length ? `set · ${rings.join(', ')}` : sinksOnly ? `in ${sinksOnly} only` : optional ? 'optional · not set' : 'missing');
/** A declared name the vault does not hold but every place it goes to does (the manifest sends it nowhere local, and
 * GitHub lists it): its places, else null. Not missing: it is where it is needed. */
const heldBySinks = (r) => (r.declared && !r.rings.length && r.destinations.length && !r.destinations.includes('local') && r.remote
  && r.destinations.every((d) => r.remote[d] === 'set') ? r.destinations.join(', ') : null);

export async function main(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`), input = readSecretInput, vault: vaultOpts = {}, owner, run = spawnRunner, fetch: fetchImpl, via = null, env: procEnv = process.env } = {}) {
  // Everything after `--` is run's command: its flags are the command's, never this script's.
  const dd = argv.indexOf('--');
  const command = dd === -1 ? null : argv.slice(dd + 1);
  const args = dd === -1 ? [...argv] : argv.slice(0, dd);
  const flag = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true; };
  const opt = (name) => { const i = args.indexOf(name); if (i === -1) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? ''; };
  const dry = flag('--dry-run');
  const store = flag('--store');
  const json = flag('--json');
  const rootArg = opt('--root');
  const ring = opt('--ring');
  const to = opt('--to');
  const repo = opt('--repo');
  const env = opt('--env');
  const worker = opt('--worker');
  const only = opt('--only');
  const service = opt('--service');
  const extra = Object.fromEntries(PUSH_OPTS.map((f) => [f.slice(2), opt(f)]));
  const staged = flag('--staged');
  const [cmd, arg, ...more] = args;
  const toList = to === null ? null : to.split(',').map((d) => d.trim()).filter(Boolean);
  if (cmd === 'get') {
    err('secrets get: no such command. A value goes from the vault to code, never to a terminal: `status` says where each name is set, and scripts/secrets-vault.mjs exports get and resolve for scripts.');
    return 64;
  }
  const bad = !COMMANDS.includes(cmd) || more.length || rootArg === '' || ring === '' || (ring && !RINGS.includes(ring))
    || (arg && !['import', 'set', 'unset', 'push', 'request'].includes(cmd)) || (['set', 'unset', 'push', 'request'].includes(cmd) && !arg)
    || (to !== null && !['push', 'request'].includes(cmd)) || (repo !== null && cmd !== 'push')
    || (to !== null && (!toList.length || toList.some((d) => !SINK_DESTINATIONS.includes(d)) || (cmd === 'push' && toList.length !== 1)))
    || (service !== null && (cmd !== 'request' || !SERVICE.test(service)))
    || Object.values(extra).some((v) => v !== null && (v === '' || cmd !== 'push')) || repo === '' || (ring && cmd !== 'set' && cmd !== 'unset' && !store)
    || ((env !== null || worker !== null) && cmd !== 'push') || env === '' || worker === ''
    || ((store || dry) && cmd !== 'import') || (store && (dry || !arg)) || (json && !['status', 'audit'].includes(cmd))
    || ((command !== null) !== (cmd === 'run')) || (cmd === 'run' && !command.length) || only === '' || (only !== null && cmd !== 'run')
    || (staged && cmd !== 'scan');
  if (bad) { err(USAGE); return 64; }
  const root = path.resolve(rootArg ?? topLevel());
  const vroot = rootArg ? root : vaultRoot(root);
  const open = () => openVault({ root: vroot, settings: localSettings(vroot), ...vaultOpts });
  const manifestFile = path.join(root, MANIFEST);
  const current = readManifest(manifestFile);
  if (current && current.problems.length && !['names', 'set', 'audit'].includes(cmd)) {
    for (const p of current.problems) out(`  ${MANIFEST}: ${p}`);
    out(`secrets ${cmd}: ${MANIFEST} is RED (${current.problems.length}); fix it first`);
    return 1;
  }
  if (cmd === 'names') {
    for (const n of current ? current.names : []) out(n);
    return 0;
  }
  if (cmd === 'check') {
    out(current ? `secrets check: green (${current.names.size} declared in ${MANIFEST})` : `secrets check: no ${MANIFEST}, nothing to check`);
    return 0;
  }
  const ownerHere = () => (owner ? owner() : isOwner(root));
  const by = via ? { via: String(via) } : sessionOf(procEnv) ? { session: sessionOf(procEnv) } : {};
  if (cmd === 'push') return push({ name: arg, to, repo, env, worker, extra, root, vroot, current, open, out, err, run, fetchImpl, owner: ownerHere, by });
  const contributor = (cmd === 'set' || cmd === 'unset' || store) && !ownerHere();
  if (contributor && ring && !CONTRIBUTOR_RINGS.includes(ring)) {
    err(`secrets ${cmd}: a contributor's keys stay with this repo on this machine (${CONTRIBUTOR_RINGS.join(' or ')}): the ${ring} ring is shared with sibling repos`);
    return 1;
  }
  try {
    if (cmd === 'run') return await runCommand(open(), current, { command, only, err });
    if (cmd === 'scan') return scan(open(), current, { root, staged, out });
    if (cmd === 'status') return status(open(), current, { out, json, owner: ownerHere(), localKeys: readLocalKeys(vroot), log: readAudit(vroot), run, root });
    if (cmd === 'audit') return audit(open(), readAudit(vroot), { out, json });
    if (cmd === 'request') return request(open(), current, { root, id: arg, out, err, to: toList, service });
    if (cmd === 'unset') {
      if (!NAME.test(arg)) { err(`secrets unset: ${arg} is not an env-var name (A-Z, 0-9 and _, starting with a letter)`); return 1; }
      const vault = open();
      // A contributor never touches the workspace ring (shared with sibling repos): only this repo's own places.
      const held = vault.status([arg])[0]?.rings ?? [];
      const rings = ring ? [ring] : contributor ? held.filter((g) => CONTRIBUTOR_RINGS.includes(g)) : held;
      const removed = rings.length ? vault.remove([arg], rings) : [{ name: arg, rings: [] }];
      const gone = removed[0].rings;
      if (!gone.length) { out(`secrets unset: ${arg} is not in ${ring ? `the ${ring} ring` : 'the vault'}: nothing to take out`); return 0; }
      const left = vault.status([arg])[0]?.rings ?? [];
      out(`secrets unset: ${arg} taken out of ${gone.join(', ')}`);
      if (left.length) out(`  ${arg} is still set in ${left.join(', ')}`);
      if (!contributor && current && current.manifest.secrets.find((e) => e.name === arg)?.destinations.some((d) => d !== 'local')) out(`  the places it was pushed to keep their copy: remove it there too if it should go`);
      // A contributor's key gone from every place this machine keeps it leaves their list too.
      if (contributor) { if (!left.some((g) => CONTRIBUTOR_RINGS.includes(g))) forgetLocalKeys(vroot, [arg]); return 0; }
      try { recordRemoves(vroot, removed); return 0; } catch (e) { err(`secrets audit: not recorded (${e.message}); the value is out of the vault`); return 1; }
    }
    if (cmd === 'set') {
      if (!NAME.test(arg)) { err(`secrets set: ${arg} is not an env-var name (A-Z, 0-9 and _, starting with a letter)`); return 1; }
      const vault = open();
      const value = await input(`${arg} (hidden; Enter to save): `);
      const had = new Set(vault.status([arg]).filter((r) => r.rings.length).map((r) => r.name));
      const done = vault.set([[arg, value]], ring ?? undefined);
      if (contributor) {
        recordLocalKeys(vroot, [arg]);
        out(`secrets set: ${arg} -> ${done.ring} (this machine only)`);
        if (current && current.names.has(arg)) out(`  ${arg} is a project secret in ${MANIFEST}: the owner provides it; this value stays on this machine and is never pushed`);
        return 0;
      }
      out(`secrets set: ${arg} -> ${done.ring}`);
      if (!current || !current.names.has(arg)) out(`  ${arg} is not declared in ${MANIFEST}: a local-only key, or add its entry (import, or by hand)`);
      return record(vroot, done, had, err);
    }
  } catch (e) {
    err(`secrets ${cmd}: ${e.message}`);
    return 1;
  }
  const source = path.resolve(root, arg ?? '.env.example');
  let text;
  try { text = fs.readFileSync(source, 'utf-8'); } catch { err(`secrets import: no ${path.relative(root, source) || source} to import from`); return 1; }
  let stored = null;
  if (store) {
    try {
      const vault = open();
      const picked = ring ?? (vault.config.keychain ? 'keychain' : 'local');
      const entries = [...parseEnv(text)].filter(([, v]) => v !== '');
      const oneLine = entries.filter(([, v]) => !/[\r\n\0]/.test(v));
      const skipped = entries.filter(([, v]) => /[\r\n\0]/.test(v)).map(([n]) => n);
      const same = picked !== 'keychain' && path.resolve(source) === path.resolve(picked === 'local' ? vault.config.local : vault.config.workspace);
      const had = new Set(vault.status(oneLine.map(([n]) => n)).filter((r) => r.rings.length).map((r) => r.name));
      stored = same ? { ring: picked, names: [], same: true, skipped } : { ...vault.set(oneLine, picked), skipped, had };
      if (contributor) {
        const mine = same ? oneLine.map(([n]) => n) : stored.names;
        recordLocalKeys(vroot, mine);
        if (stored.same) out(`secrets import: ${path.basename(source)} is the ${stored.ring} vault already`);
        else out(`secrets import: stored ${stored.names.length} in ${stored.ring}${stored.names.length ? `: ${stored.names.join(', ')}` : ''}`);
        if (skipped.length) out(`  skipped (a value on more than one line): ${skipped.join(', ')}`);
        if (!same && stored.names.length) out(`  the values are in the vault now: delete ${path.relative(root, source) || source}`);
        out(`secrets import: kept ${mine.length} names on this machine, not in ${MANIFEST} (a contributor's own keys; project secrets are the owner's)`);
        return 0;
      }
    } catch (e) {
      err(`secrets import: ${e.message}`);
      return 1;
    }
  }
  const { manifest, added, kept } = mergeImport(current ? current.manifest : emptyManifest(), importEnvExample(text));
  const list = added.length ? `: ${added.join(', ')}` : '';
  if (dry) {
    out(`secrets import (dry run): would add ${added.length}${list}; ${kept.length} already declared`);
    return 0;
  }
  if (added.length || !current) fs.writeFileSync(manifestFile, serialize(manifest));
  if (stored) {
    if (stored.same) out(`secrets import: ${path.basename(source)} is the ${stored.ring} vault already; names only`);
    else out(`secrets import: stored ${stored.names.length} in ${stored.ring}${stored.names.length ? `: ${stored.names.join(', ')}` : ''}`);
    if (stored.skipped.length) out(`  skipped (a value on more than one line): ${stored.skipped.join(', ')}`);
    if (!stored.same && stored.names.length) out(`  the values are in the vault now: delete ${path.relative(root, source) || source}`);
  }
  out(`secrets import: added ${added.length}${list}; ${kept.length} already declared -> ${MANIFEST}`);
  if (added.length) out(`  each new entry goes to local, provided by the owner: edit its for, where and destinations in ${MANIFEST}`);
  return stored && !stored.same ? record(vroot, stored, stored.had, err) : 0;
}

/** Record the names a set or import stored (set, or rotate for a name the vault held); a failed write is loud. */
function record(root, done, had, err) {
  if (!done.names.length) return 0;
  try {
    recordSets(root, { names: done.names, ring: done.ring, had });
    return 0;
  } catch (e) {
    err(`secrets audit: not recorded (${e.message}); the value is stored`);
    return 1;
  }
}

/** Every event, oldest first, then the rotation nudges for names the vault still holds. */
function audit(vault, log, { out, json }) {
  const names = [...lastSet(log).keys()];
  const held = new Set(vault.status(names).filter((r) => r.rings.length).map((r) => r.name));
  const nudges = rotationNudges(log, { held: (n) => held.has(n) });
  if (json) { out(JSON.stringify({ events: log, nudges, rotateDays: ROTATE_DAYS }, null, 2)); return 0; }
  out(`secrets audit: ${log.length} event${log.length === 1 ? '' : 's'} (names only, never a value)`);
  const name = (e) => String(e.name ?? (Array.isArray(e.names) ? e.names.join(', ') : '?'));
  const dest = (e) => String(e.destination ?? (Array.isArray(e.destinations) ? e.destinations.join(', ') : '-'));
  const width = Math.max(0, ...log.map((e) => name(e).length));
  for (const e of log) out(`  ${String(e.time ?? '').slice(0, 19).replace('T', ' ')}  ${String(e.action).padEnd(6)}  ${name(e).padEnd(width)}  -> ${dest(e)}${e.ring ? ` (${e.ring})` : ''}`);
  for (const x of nudges) out(nudgeLine(x));
  return 0;
}

/** A chunk's missing secrets as one `[needs-user-call]` note in plan/pending/secrets-<id>.md, once. */
function request(vault, current, { root, id, out, err, to = null, service = null }) {
  const chunk = loadPlanDir(path.join(root, 'plan')).specs.flatMap((s) => s.chunks).find((c) => c.id === id);
  if (!chunk) { err(`secrets request: no open chunk ${id} in plan/`); return 1; }
  const set = new Set(vault.status(chunk.secrets).filter((r) => r.rings.length).map((r) => r.name));
  const missing = chunk.secrets.filter((n) => !set.has(n) && !process.env[n]);
  if (!missing.length) { out(`secrets request: nothing to ask: ${chunk.secrets.length ? `every secret ${id} needs is set` : `${id} names no secret`}`); return 0; }
  const asked = durableAsk(root, REQUEST(id));
  if (asked) { out(`secrets request: already asked in ${asked}`); return 0; }
  const entries = new Map((current ? current.manifest.secrets : []).map((e) => [e.name, e]));
  // Where it goes once set: the places named here, else every sink the manifest lists for that name. With more than
  // one name, each name's places are written by name, so the GUI never sends one name's value to another's places.
  const placesOf = (n) => to ?? (entries.get(n)?.destinations ?? []).filter((d) => d !== 'local');
  const places = [...new Set(missing.flatMap(placesOf))];
  const goesTo = missing.length > 1 ? missing.filter((n) => placesOf(n).length).map((n) => `${n}: ${placesOf(n).join(', ')}`).join('; ') : places.join(', ');
  const goes = places.length ? ` It goes to ${goesTo} once it is set${service ? `; it is a ${service} value, so the GUI opens its card in Set up a stack (stack: ${service})` : ''}.` : service ? ` It is a ${service} value, so the GUI opens its card in Set up a stack (stack: ${service}).` : '';
  const lines = [`- [needs-user-call] ${REQUEST(id)} set ${missing.join(', ')} in your terminal or the GUI's vault (never in a session), and ${id} is ready again.${goes} Then delete this row.`];
  for (const n of missing) {
    const e = entries.get(n);
    const dests = [...new Set([...(e ? e.destinations : []), ...(to ?? [])])];
    lines.push(e ? `  - ${n}: ${e.for} Get it: ${e.where ?? 'no link in the manifest'}. Goes to: ${dests.join(', ')}. Set it: \`node scripts/secrets.mjs set ${n}\`.` : `  - ${n}: not declared in ${MANIFEST} (declare it first).`);
  }
  const rel = `plan/pending/secrets-${id}.md`;
  fs.mkdirSync(path.join(root, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(root, rel), `---\ndate: ${new Date().toISOString().slice(0, 10)}\n---\n## Notes\n${lines.join('\n')}\n`);
  out(`secrets request: ${id} waits on ${missing.join(', ')}${places.length ? ` (then to ${places.join(', ')})` : ''} -> ${rel} (commit it as plan: secret request ${id}, then pick again)`);
  return 0;
}

/** The plan file (relative) already holding a row with `marker`, or null. */
function durableAsk(root, marker) {
  const walk = (dir) => {
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of names) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'messy') { const hit = walk(p); if (hit) return hit; } } else if (e.name.endsWith('.md') && fs.readFileSync(p, 'utf8').includes(marker)) return path.relative(root, p).split(path.sep).join('/');
    }
    return null;
  };
  return walk(path.join(root, 'plan'));
}

/** `run`: the declared names (or the --only ones), every one set, into the command's environment. */
async function runCommand(vault, current, { command, only, err }) {
  const declared = current ? [...current.names] : [];
  const picked = only === null ? declared : only.split(',').map((n) => n.trim()).filter(Boolean);
  const undeclared = picked.filter((n) => !declared.includes(n));
  if (undeclared.length) { err(`secrets run: not declared in ${MANIFEST}: ${undeclared.join(', ')} (run hands over declared names only)`); return 1; }
  const { values, missing } = vault.resolve(picked);
  if (missing.length) { err(`secrets run: not set in the vault: ${missing.join(', ')} (node scripts/secrets.mjs set NAME); ${command[0]} did not run`); return 1; }
  if (!picked.length) err(`secrets run: no secrets declared in ${MANIFEST}; running ${command[0]} with none`);
  return runWithSecrets(command, values);
}

/** `scan`: the gate's rail. Exit 1 when the diff holds a vault value, naming the file, line and secret. */
function scan(vault, current, { root, staged, out }) {
  const values = vaultValues(vault, current ? [...current.names] : []);
  if (!values.size) { out('secrets scan: no vault values here, nothing to scan for'); return 0; }
  const { hits, scanned } = scanRepo({ root, values, staged });
  const what = staged ? 'the staged diff' : 'the working tree vs HEAD and the untracked files';
  if (!hits.length) { out(`secrets scan: green (${scanned} added lines in ${what}; ${values.size} vault values)`); return 0; }
  for (const h of hits) out(`  ${describeHit(h)}`);
  out(`secrets scan: ${what} holds ${hits.length} vault value(s): take each out (reference it by name; the value stays in the vault), then commit`);
  return 1;
}

async function push({ name, to, repo, env, worker, extra = {}, root, vroot, current, open, out, err, run, fetchImpl, owner, by = {} }) {
  if (!owner()) {
    err(sinkRefusal('push'));
    return 1;
  }
  const entry = current ? current.manifest.secrets.find((e) => e.name === name) : null;
  if (!entry) { err(`secrets push: ${name} is not declared in ${MANIFEST}: declare it and its destinations first`); return 1; }
  if (to && !entry.destinations.includes(to)) { err(`secrets push: ${name} does not go to ${to} (${entry.destinations.join(', ')}): add it to its destinations in ${MANIFEST}`); return 1; }
  const targets = to ? [to] : entry.destinations.filter((d) => d !== 'local');
  if (!targets.length) { out(`secrets push: ${name} goes to local only: nothing to push`); return 0; }
  // An api sink's token (and its site) come from the vault too, read here and handed to the sink, never printed.
  const apiNames = [...new Set(targets.map(sinkFor).filter((k) => k && k.api).flatMap((k) => [k.token, k.siteName].filter(Boolean)))];
  let values;
  try { values = open().resolve([name, ...apiNames.filter((n) => n !== name)]).values; } catch (e) { err(`secrets push: ${e.message}`); return 1; }
  if (!values.has(name)) { err(`secrets push: ${name} is not in the vault: set it first (node scripts/secrets.mjs set ${name})`); return 1; }
  let failed = 0;
  for (const destination of targets) {
    const sink = sinkFor(destination);
    if (!sink) { err(`secrets push: ${name} -> ${destination}: no sink for ${destination} yet`); failed++; continue; }
    let done;
    const environments = env ? env.split(',').map((e) => e.trim()).filter(Boolean) : undefined;
    const secrets = sink.api ? { token: values.get(sink.token) ?? process.env[sink.token], site: values.get(sink.siteName) ?? process.env[sink.siteName] } : {};
    try {
      done = await pushSecretAsync({ name, value: values.get(name), destination, run, cwd: root, repo: repo ?? undefined, environments, worker: worker ?? undefined, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)), secrets, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
    } catch (e) { done = { ok: false, error: e.message }; }
    if (done.ok || done.detail) recordAudit(vroot, { action: 'push', name, destination, ...done.detail, ...by }); // what landed, even part of it
    if (!done.ok) { err(`secrets push: ${name} -> ${destination}: ${done.error}`); failed++; continue; }
    const d = done.detail || {};
    const note = d.environments ? ` (${d.environments.join(', ')})` : d.worker ? ` (worker ${d.worker})` : d.app ? ` (app ${d.app})` : d.vault ? ` (vault ${d.vault})` : d.project ? ` (project ${d.project})` : d.region ? ` (${d.region})` : '';
    out(`secrets push: ${name} -> ${destination}${note}`);
  }
  return failed ? 1 : 0;
}

function status(vault, current, { out, json, owner = true, localKeys = [], log = [], run = spawnRunner, root }) {
  const entries = current ? current.manifest.secrets : [];
  const declared = entries.map((e) => e.name);
  const dest = new Map(entries.map((e) => [e.name, e.destinations]));
  // A github-actions destination is read from GitHub (owner only, once, names only): set, not set, or unknown when gh
  // can't tell. Never a value; the audit record stays what the vault pushed and when.
  const wantsActions = owner && entries.some((e) => e.destinations.includes('github-actions'));
  const actions = !wantsActions ? null : githubRemote(root) ? actionsSecretNames({ run, cwd: root }) : { known: false, why: 'no GitHub remote' };
  const remoteOf = (name) => {
    if (!actions || !(dest.get(name) ?? []).includes('github-actions')) return null;
    return { 'github-actions': actions.known ? (actions.names.has(name) ? 'set' : 'not set') : 'unknown' };
  };
  // When GitHub last had the name set (gh's updatedAt: a date, never a value), for the rotated column.
  const remoteAtOf = (name) => {
    const at = actions && actions.known && actions.updated && (dest.get(name) ?? []).includes('github-actions') ? actions.updated.get(name) : null;
    return at ? { 'github-actions': at } : null;
  };
  const optional = new Set(entries.filter((e) => e.optional === true).map((e) => e.name));
  const last = lastSet(log);
  const rows = vault.status(declared).map((r) => {
    const age = r.rings.length && last.has(r.name) ? ageDays(last.get(r.name)) : null;
    const remote = remoteOf(r.name);
    const remoteAt = remoteAtOf(r.name);
    return { ...r, declared: dest.has(r.name), destinations: dest.get(r.name) ?? [], ...(optional.has(r.name) ? { optional: true } : {}), ...(remote ? { remote } : {}), ...(remoteAt ? { remoteAt } : {}), age, rotate: age !== null && age > ROTATE_DAYS };
  });
  const nudges = rotationNudges(log, { held: (n) => rows.some((r) => r.name === n && r.rotate) });
  // A contributor's local keys: the names recorded for this checkout plus any name its .env holds; this machine only.
  const inEnv = owner ? [] : vault.status([]).filter((r) => r.rings.includes('local')).map((r) => r.name);
  const names = [...new Set([...localKeys, ...inEnv])].sort();
  const mine = owner ? [] : vault.status(names).filter((r) => names.includes(r.name))
    .map((r) => ({ name: r.name, rings: r.rings.filter((g) => CONTRIBUTOR_RINGS.includes(g)) }));
  if (json) { out(JSON.stringify({ mode: owner ? 'owner' : 'contributor', projectSecretsNeeded: owner ? declared.length : 0, vault: { local: vault.config.local, workspace: vault.config.workspace, keychain: vault.config.keychain ? vault.config.service : null }, secrets: rows, localKeys: mine }, null, 2)); return 0; }
  if (!owner) {
    out(`secrets status: No project secrets needed (a contributor checkout: the owner provides the ${declared.length} declared in ${MANIFEST})`);
    out('Your local keys (this machine only):');
    if (!mine.length) out('  None. Add one if the app needs it to run locally.');
    const w = Math.max(0, ...mine.map((r) => r.name.length));
    for (const r of mine) out(`  ${r.name.padEnd(w)}  ${where(r.rings)}`);
    return 0;
  }
  const set = rows.filter((r) => r.declared && r.rings.length).length;
  // An optional secret that is not set is not missing: the repo runs without it.
  const unsetOptional = rows.filter((r) => r.declared && r.optional && !r.rings.length && !heldBySinks(r)).length;
  const sinksOnly = rows.filter((r) => heldBySinks(r)).length;
  const places = [vault.config.local, vault.config.workspace, ...(vault.config.keychain ? [`keychain ${vault.config.service}`] : [])].join(', ');
  out(`secrets status: ${declared.length} declared · ${set} set · ${declared.length - set - unsetOptional - sinksOnly} missing${sinksOnly ? ` · ${sinksOnly} in a sink only` : ''}${unsetOptional ? ` · ${unsetOptional} optional, not set` : ''} (vault: ${places})`);
  const width = Math.max(0, ...rows.map((r) => r.name.length));
  // A name held by its sinks only: its age is when GitHub last had it set (the latest updatedAt of its places).
  const ageOf = (r) => {
    if (r.age !== null) return r.age;
    if (!heldBySinks(r) || !r.remoteAt) return null;
    const ats = r.destinations.map((d) => r.remoteAt[d]).filter(Boolean).sort();
    return ats.length ? ageDays(ats[ats.length - 1]) : null;
  };
  const toward = (r) => r.destinations.map((d) => (r.remote && r.remote[d] ? `${d} (${r.remote[d]})` : d)).join(', ');
  for (const r of rows) out(`  ${r.name.padEnd(width)}  ${where(r.rings, r.optional, heldBySinks(r)).padEnd(28)}  ${r.declared ? `-> ${toward(r)}` : `(not declared in ${MANIFEST})`}${ageOf(r) !== null ? `  set ${ageOf(r)} d ago${r.age === null ? ' (GitHub)' : ''}` : ''}`);
  if (actions && !actions.known) out(`  github-actions: unknown (${actions.why}): gh secret list could not tell`);
  for (const x of nudges) out(nudgeLine(x));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
