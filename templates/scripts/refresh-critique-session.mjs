#!/usr/bin/env node
// scripts/refresh-critique-session.mjs
//
// The promised helper from nexus/customization/auth-aware-critique.md
// Pattern B (session cookie / bearer token): log in once by hand, run
// this, paste the new value, done. Run it whenever `reader` reports a
// Pattern-B session expired (401 / redirected to login).
//
//   node scripts/refresh-critique-session.mjs
//
// Only refreshes the two Pattern-B sub-modes:
//   session-cookie  → CRITIQUE_SESSION_COOKIE
//   bearer-token    → CRITIQUE_BEARER_TOKEN
// Other patterns (test-user, shared-secret, preview-env, magic-link)
// have no expiring session for this script to refresh — it exits 2 and
// points at the right doc section instead of guessing.
//
// Writes back to .env by replacing the matching KEY=... line in place
// (or appending one under the existing "Pattern B" block if the key
// isn't there yet). Every other line is left byte-identical.
//
// Zero dependencies, ESM, Node >=18.

import fs from 'node:fs'
import readline from 'node:readline'

const ENV_FILE = '.env'

function loadEnvLines() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`${ENV_FILE} not found. Create it from env/env.example first.`)
    process.exit(2)
  }
  return fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/)
}

function readVar(lines, name) {
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '')
  }
  return undefined
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    resolve(answer.trim())
  }))
}

// Replace an existing `KEY=...` line, or append one right after the
// last line that already mentions "Pattern B" (env.example groups the
// auth-aware-critique vars by pattern) — falls back to end-of-file.
function upsertVar(lines, name, value) {
  const idx = lines.findIndex((line) => new RegExp(`^\\s*${name}\\s*=`).test(line))
  if (idx !== -1) {
    lines[idx] = `${name}=${value}`
    return lines
  }
  const anchor = lines.map((l) => /Pattern B/.test(l)).lastIndexOf(true)
  const insertAt = anchor === -1 ? lines.length : anchor + 1
  lines.splice(insertAt, 0, `${name}=${value}`)
  return lines
}

const lines = loadEnvLines()
const mode = readVar(lines, 'CRITIQUE_AUTH_MODE')

if (mode !== 'session-cookie' && mode !== 'bearer-token') {
  console.error(`CRITIQUE_AUTH_MODE is "${mode ?? '(unset)'}" — nothing to refresh here.`)
  console.error(`This script only handles Pattern B (session-cookie / bearer-token).`)
  console.error(`See nexus/customization/auth-aware-critique.md for the pattern that`)
  console.error(`matches your CRITIQUE_AUTH_MODE.`)
  process.exit(2)
}

const varName = mode === 'session-cookie' ? 'CRITIQUE_SESSION_COOKIE' : 'CRITIQUE_BEARER_TOKEN'
const label = mode === 'session-cookie'
  ? 'full Cookie header value (e.g. "session=...; csrf=...")'
  : 'bearer token (e.g. "eyJ...")'

console.log(`Mode: ${mode}`)
console.log(`Log in as the critique bot user in a real browser, then copy the`)
console.log(`${label} from devtools.`)
const value = await ask(`Paste ${varName}: `)

if (!value) {
  console.error('Empty value — nothing written.')
  process.exit(2)
}

fs.writeFileSync(ENV_FILE, upsertVar(lines, varName, value).join('\n'))
console.log(`${varName} updated in ${ENV_FILE}.`)
console.log(`Run /critique (or its authenticated pass) to confirm the new session works.`)
