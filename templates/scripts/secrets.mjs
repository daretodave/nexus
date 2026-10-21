#!/usr/bin/env node
// scripts/secrets.mjs: the secrets command line. The rule: the model sees names, never values, so nothing here ever
// prints a value.
//
//   node scripts/secrets.mjs import [file] [--dry-run]   # names + comments from .env.example into nexus.secrets.json
//   node scripts/secrets.mjs names                       # the declared names, one per line
//   node scripts/secrets.mjs check                       # the manifest keeps its shape (plan-check runs this too)
//
// `import` reads `.env.example` unless a file is named, adds each name the manifest doesn't declare yet (an entry
// already there is never touched) and prints the names it added. It reads names and comments only: a value on a line
// is skipped, so importing a real .env writes no value either. `--root <dir>` runs against another checkout (the
// default is this one's top level). Exit 0 = done, 1 = a problem, 64 = usage. The manifest's shape:
// scripts/plan/secrets-manifest.mjs and nexus/customization/secrets.md.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MANIFEST, emptyManifest, importEnvExample, mergeImport, readManifest, serialize } from './plan/secrets-manifest.mjs'

export const USAGE = 'usage: node scripts/secrets.mjs import [file] [--dry-run] | names | check   [--root <dir>]'

function topLevel() {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return process.cwd() }
}

export function main(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const args = [...argv]
  const flag = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true }
  const opt = (name) => { const i = args.indexOf(name); if (i === -1) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? '' }
  const dry = flag('--dry-run')
  const rootArg = opt('--root')
  const [cmd, file, ...extra] = args
  if (!['import', 'names', 'check'].includes(cmd) || extra.length || (file && cmd !== 'import') || rootArg === '') { err(USAGE); return 64 }
  const root = path.resolve(rootArg ?? topLevel())
  const manifestFile = path.join(root, MANIFEST)
  const current = readManifest(manifestFile)
  if (current && current.problems.length && cmd !== 'names') {
    for (const p of current.problems) out(`  ${MANIFEST}: ${p}`)
    out(`secrets ${cmd}: ${MANIFEST} is RED (${current.problems.length}); fix it first`)
    return 1
  }
  if (cmd === 'names') {
    for (const n of current ? current.names : []) out(n)
    return 0
  }
  if (cmd === 'check') {
    out(current ? `secrets check: green (${current.names.size} declared in ${MANIFEST})` : `secrets check: no ${MANIFEST}, nothing to check`)
    return 0
  }
  const source = path.resolve(root, file ?? '.env.example')
  let text
  try { text = fs.readFileSync(source, 'utf-8') } catch { err(`secrets import: no ${path.relative(root, source) || source} to import from`); return 1 }
  const { manifest, added, kept } = mergeImport(current ? current.manifest : emptyManifest(), importEnvExample(text))
  const list = added.length ? `: ${added.join(', ')}` : ''
  if (dry) {
    out(`secrets import (dry run): would add ${added.length}${list}; ${kept.length} already declared`)
    return 0
  }
  if (added.length || !current) fs.writeFileSync(manifestFile, serialize(manifest))
  out(`secrets import: added ${added.length}${list}; ${kept.length} already declared -> ${MANIFEST}`)
  if (added.length) out(`  each new entry goes to local, provided by the owner: edit its for, where and destinations in ${MANIFEST}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
