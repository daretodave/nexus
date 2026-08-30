#!/usr/bin/env node
// scripts/install-hooks.mjs — opt-in pre-commit gate for hand commits.
//
// nexus/customization/verify-gate.md's contract is "pnpm verify
// runs before every commit" — but that only binds the loop (skills
// run it foreground). A human editing outside the loop has to
// remember to run it. This writes .git/hooks/pre-commit running
// pnpm verify — nothing else: no network, no formatting, no
// auto-fix. Opt-in only: clone-and-read contributors are unaffected
// until they run this themselves.
//
//   node scripts/install-hooks.mjs
//   node scripts/install-hooks.mjs --uninstall
//
// Refuses to touch a pre-commit hook it didn't write (checks for
// its own marker line) — prints the path and exits 1 rather than
// clobbering something else's hook.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const MARKER = '# nexus:install-hooks'
const hookPath = path.join(ROOT, '.git', 'hooks', 'pre-commit')

function usage(msg) {
  if (msg) console.error(`install-hooks: ${msg}`)
  console.error('usage: node scripts/install-hooks.mjs [--uninstall]')
  process.exit(1)
}

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  usage('no .git/ found at repo root — run from a git checkout')
}

const uninstall = process.argv.includes('--uninstall')
const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : null
const ours = existing !== null && existing.includes(MARKER)

if (uninstall) {
  if (existing === null) {
    console.log('install-hooks: no pre-commit hook installed — nothing to do')
    process.exit(0)
  }
  if (!ours) {
    usage(`${path.relative(ROOT, hookPath)} exists and wasn't written by this script — remove it by hand if you mean to`)
  }
  fs.rmSync(hookPath)
  console.log(`install-hooks: removed ${path.relative(ROOT, hookPath)}`)
  process.exit(0)
}

if (existing !== null && !ours) {
  usage(`${path.relative(ROOT, hookPath)} already exists and wasn't written by this script — remove it by hand first if you mean to replace it`)
}

const hookBody = `#!/bin/sh
${MARKER} — do not edit by hand; regenerate with
# node scripts/install-hooks.mjs (--uninstall to remove).
pnpm verify
`

fs.mkdirSync(path.dirname(hookPath), { recursive: true })
fs.writeFileSync(hookPath, hookBody, { mode: 0o755 })
fs.chmodSync(hookPath, 0o755)

console.log(`install-hooks: wrote ${path.relative(ROOT, hookPath)} — pnpm verify now runs before every commit`)
console.log('install-hooks: node scripts/install-hooks.mjs --uninstall to remove')
