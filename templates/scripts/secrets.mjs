#!/usr/bin/env node
// scripts/secrets.mjs: the secrets command line. The rule: the model sees names, never values, so nothing here ever
// prints a value.
//
//   node scripts/secrets.mjs status [--json]                  # each name: where it is set, where it goes
//   node scripts/secrets.mjs set NAME [--ring R]              # the value from stdin (or a hidden prompt), never argv
//   node scripts/secrets.mjs import [file] [--dry-run]        # names + comments from .env.example into nexus.secrets.json
//   node scripts/secrets.mjs import FILE --store [--ring R]   # a real .env: values into the vault, names into the manifest
//   node scripts/secrets.mjs names                            # the declared names, one per line
//   node scripts/secrets.mjs check                            # the manifest keeps its shape (plan-check runs this too)
//   node scripts/secrets.mjs push NAME [--to D] [--repo O/R]  # the value to its destinations through a sink (owner mode)
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
// the Cloudflare worker (default: the checkout's wrangler config). A contributor checkout (not effective owner mode)
// keeps its own local-only keys: `set` and `import --store` write the local ring or the keychain and record the names
// in .nexus/secrets-local.json, never in the manifest, and `status` leads with "No project secrets needed". Exit 0 = done, 1 = a problem, 64 = usage. The manifest: scripts/plan/secrets-manifest.mjs; the how: nexus/customization/secrets.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOwner, localSettings, primaryRoot } from './owner.mjs';
import { MANIFEST, NAME, emptyManifest, importEnvExample, mergeImport, readManifest, serialize } from './plan/secrets-manifest.mjs';
import { CONTRIBUTOR_RINGS, RINGS, openVault, parseEnv, readLocalKeys, recordLocalKeys, sinkRefusal } from './secrets-vault.mjs';
import { pushSecret, recordAudit, sinkFor, spawnRunner } from './secrets-sinks.mjs';

export const USAGE = 'usage: node scripts/secrets.mjs status [--json] | set NAME [--ring R] | import [file] [--dry-run] [--store [--ring R]] | names | check | push NAME [--to D] [--repo O/R] [--env E,E] [--worker W]   [--root <dir>]';
const COMMANDS = ['status', 'set', 'import', 'names', 'check', 'push'];
const SINK_DESTINATIONS = ['github-actions', 'vercel', 'cloudflare'];

function topLevel() {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return process.cwd(); }
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

const where = (rings) => (rings.length ? `set · ${rings.join(', ')}` : 'missing');

export async function main(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`), input = readSecretInput, vault: vaultOpts = {}, owner, run = spawnRunner } = {}) {
  const args = [...argv];
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
  const [cmd, arg, ...extra] = args;
  if (cmd === 'get') {
    err('secrets get: no such command. A value goes from the vault to code, never to a terminal: `status` says where each name is set, and scripts/secrets-vault.mjs exports get and resolve for scripts.');
    return 64;
  }
  const bad = !COMMANDS.includes(cmd) || extra.length || rootArg === '' || ring === '' || (ring && !RINGS.includes(ring))
    || (arg && !['import', 'set', 'push'].includes(cmd)) || (['set', 'push'].includes(cmd) && !arg)
    || ((to !== null || repo !== null) && cmd !== 'push') || (to !== null && !SINK_DESTINATIONS.includes(to)) || repo === '' || (ring && cmd !== 'set' && !store)
    || ((env !== null || worker !== null) && cmd !== 'push') || env === '' || worker === ''
    || ((store || dry) && cmd !== 'import') || (store && (dry || !arg)) || (json && cmd !== 'status');
  if (bad) { err(USAGE); return 64; }
  const root = path.resolve(rootArg ?? topLevel());
  const vroot = rootArg ? root : vaultRoot(root);
  const open = () => openVault({ root: vroot, settings: localSettings(vroot), ...vaultOpts });
  const manifestFile = path.join(root, MANIFEST);
  const current = readManifest(manifestFile);
  if (current && current.problems.length && !['names', 'set'].includes(cmd)) {
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
  if (cmd === 'push') return push({ name: arg, to, repo, env, worker, root, vroot, current, open, out, err, run, owner: ownerHere });
  const contributor = (cmd === 'set' || store) && !ownerHere();
  if (contributor && ring && !CONTRIBUTOR_RINGS.includes(ring)) {
    err(`secrets ${cmd}: a contributor's keys stay with this repo on this machine (${CONTRIBUTOR_RINGS.join(' or ')}): the ${ring} ring is shared with sibling repos`);
    return 1;
  }
  try {
    if (cmd === 'status') return status(open(), current, { out, json, owner: ownerHere(), localKeys: readLocalKeys(vroot) });
    if (cmd === 'set') {
      if (!NAME.test(arg)) { err(`secrets set: ${arg} is not an env-var name (A-Z, 0-9 and _, starting with a letter)`); return 1; }
      const vault = open();
      const value = await input(`${arg} (hidden; Enter to save): `);
      const done = vault.set([[arg, value]], ring ?? undefined);
      if (contributor) {
        recordLocalKeys(vroot, [arg]);
        out(`secrets set: ${arg} -> ${done.ring} (this machine only)`);
        if (current && current.names.has(arg)) out(`  ${arg} is a project secret in ${MANIFEST}: the owner provides it; this value stays on this machine and is never pushed`);
        return 0;
      }
      out(`secrets set: ${arg} -> ${done.ring}`);
      if (!current || !current.names.has(arg)) out(`  ${arg} is not declared in ${MANIFEST}: a local-only key, or add its entry (import, or by hand)`);
      return 0;
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
      stored = same ? { ring: picked, names: [], same: true, skipped } : { ...vault.set(oneLine, picked), skipped };
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
  return 0;
}

function push({ name, to, repo, env, worker, root, vroot, current, open, out, err, run, owner }) {
  if (!owner()) {
    err(sinkRefusal('push'));
    return 1;
  }
  const entry = current ? current.manifest.secrets.find((e) => e.name === name) : null;
  if (!entry) { err(`secrets push: ${name} is not declared in ${MANIFEST}: declare it and its destinations first`); return 1; }
  if (to && !entry.destinations.includes(to)) { err(`secrets push: ${name} does not go to ${to} (${entry.destinations.join(', ')}): add it to its destinations in ${MANIFEST}`); return 1; }
  const targets = to ? [to] : entry.destinations.filter((d) => d !== 'local');
  if (!targets.length) { out(`secrets push: ${name} goes to local only: nothing to push`); return 0; }
  let values;
  try { values = open().resolve([name]).values; } catch (e) { err(`secrets push: ${e.message}`); return 1; }
  if (!values.has(name)) { err(`secrets push: ${name} is not in the vault: set it first (node scripts/secrets.mjs set ${name})`); return 1; }
  let failed = 0;
  for (const destination of targets) {
    if (!sinkFor(destination)) { err(`secrets push: ${name} -> ${destination}: no sink for ${destination} yet`); failed++; continue; }
    let done;
    const environments = env ? env.split(',').map((e) => e.trim()).filter(Boolean) : undefined;
    try { done = pushSecret({ name, value: values.get(name), destination, run, cwd: root, repo: repo ?? undefined, environments, worker: worker ?? undefined }); } catch (e) { done = { ok: false, error: e.message }; }
    if (done.ok || done.detail) recordAudit(vroot, { action: 'push', name, destination, ...done.detail }); // what landed, even part of it
    if (!done.ok) { err(`secrets push: ${name} -> ${destination}: ${done.error}`); failed++; continue; }
    const note = done.detail?.environments ? ` (${done.detail.environments.join(', ')})` : done.detail?.worker ? ` (worker ${done.detail.worker})` : '';
    out(`secrets push: ${name} -> ${destination}${note}`);
  }
  return failed ? 1 : 0;
}

function status(vault, current, { out, json, owner = true, localKeys = [] }) {
  const entries = current ? current.manifest.secrets : [];
  const declared = entries.map((e) => e.name);
  const dest = new Map(entries.map((e) => [e.name, e.destinations]));
  const rows = vault.status(declared).map((r) => ({ ...r, declared: dest.has(r.name), destinations: dest.get(r.name) ?? [] }));
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
  const places = [vault.config.local, vault.config.workspace, ...(vault.config.keychain ? [`keychain ${vault.config.service}`] : [])].join(', ');
  out(`secrets status: ${declared.length} declared · ${set} set · ${declared.length - set} missing (vault: ${places})`);
  const width = Math.max(0, ...rows.map((r) => r.name.length));
  for (const r of rows) out(`  ${r.name.padEnd(width)}  ${where(r.rings).padEnd(28)}  ${r.declared ? `-> ${r.destinations.join(', ')}` : `(not declared in ${MANIFEST})`}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
