#!/usr/bin/env node
// scripts/check-secrets-liveness.mjs
//
// The automatable half of nexus/playbooks/hands-off.md Step 5.2
// ("Probe liveness in pre-flight"). Deploy-provider tokens are already
// covered by `deploy-check.mjs` on every push; this script covers the
// two credential classes that only go stale silently between pushes:
// GH_TOKEN and the CRITIQUE_* auth secrets from
// nexus/customization/auth-aware-critique.md. Run it the day you start
// a long hands-off window, not the week before.
//
//   node scripts/check-secrets-liveness.mjs
//
//   exit 0  →  nothing confirmed dead (some checks may be
//              "present (unverifiable)" — that's expected, not a fail)
//   exit 1  →  at least one declared secret is dead or missing
//
// Zero dependencies, ESM, Node >=18. No network calls at all if
// neither GH_TOKEN nor CRITIQUE_AUTH_MODE is set.

import fs from 'node:fs'

// --- load .env if present (matches deploy-check.mjs loader) ---
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const results = [] // { name, status: 'live'|'dead'|'present'|'missing', detail }
let checked = false

// --- GH_TOKEN ---------------------------------------------------------
if (process.env.GH_TOKEN) {
  checked = true
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` },
    })
    if (res.ok) {
      results.push({ name: 'GH_TOKEN', status: 'live' })
    } else if (res.status === 401) {
      results.push({ name: 'GH_TOKEN', status: 'dead', detail: 'rejected (401) — rotate it' })
    } else {
      results.push({ name: 'GH_TOKEN', status: 'present', detail: `unexpected HTTP ${res.status}, treating as unverifiable` })
    }
  } catch (err) {
    results.push({ name: 'GH_TOKEN', status: 'present', detail: `network error (${err.message}), treating as unverifiable` })
  }
}

// --- CRITIQUE_* ---------------------------------------------------------
// See nexus/customization/auth-aware-critique.md for the pattern each
// mode implements. Only session-based modes have anything worth
// decoding; the rest are static secrets/URLs — presence is the only
// check that makes sense without a live `reader` pass.
const authMode = process.env.CRITIQUE_AUTH_MODE
if (authMode && authMode !== 'none') {
  checked = true
  if (authMode === 'bearer-token') {
    const token = process.env.CRITIQUE_BEARER_TOKEN
    if (!token) {
      results.push({ name: 'CRITIQUE_BEARER_TOKEN', status: 'missing' })
    } else {
      const exp = decodeJwtExpiry(token)
      if (exp === null) {
        results.push({ name: 'CRITIQUE_BEARER_TOKEN', status: 'present', detail: 'not a decodable JWT — unverifiable' })
      } else if (exp * 1000 < Date.now()) {
        results.push({ name: 'CRITIQUE_BEARER_TOKEN', status: 'dead', detail: `expired at ${new Date(exp * 1000).toISOString()}` })
      } else {
        results.push({ name: 'CRITIQUE_BEARER_TOKEN', status: 'live', detail: `expires ${new Date(exp * 1000).toISOString()}` })
      }
    }
  } else if (authMode === 'session-cookie') {
    results.push({
      name: 'CRITIQUE_SESSION_COOKIE',
      status: process.env.CRITIQUE_SESSION_COOKIE ? 'present' : 'missing',
      detail: process.env.CRITIQUE_SESSION_COOKIE
        ? 'opaque cookie — liveness only confirmed by a reader pass'
        : undefined,
    })
  } else if (authMode === 'shared-secret') {
    results.push({ name: 'CRITIQUE_BOT_SECRET', status: process.env.CRITIQUE_BOT_SECRET ? 'present' : 'missing' })
  } else if (authMode === 'preview-env') {
    results.push({ name: 'CRITIQUE_PREVIEW_URL', status: process.env.CRITIQUE_PREVIEW_URL ? 'present' : 'missing' })
  } else if (authMode === 'test-user') {
    results.push({ name: 'CRITIQUE_AUTH_PASSWORD', status: process.env.CRITIQUE_AUTH_PASSWORD ? 'present' : 'missing' })
  } else if (authMode === 'magic-link') {
    results.push({ name: 'CRITIQUE_MAILBOX_API_TOKEN', status: process.env.CRITIQUE_MAILBOX_API_TOKEN ? 'present' : 'missing' })
  }
}

// Decode a JWT's `exp` claim without verifying the signature — this
// script never authenticates as anyone, it only reads a staleness
// hint. Not a security check.
function decodeJwtExpiry(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

if (!checked) {
  console.log('check-secrets-liveness: neither GH_TOKEN nor CRITIQUE_AUTH_MODE is set. Nothing to probe.')
  process.exit(0)
}

let anyDead = false
for (const r of results) {
  const label = { live: 'live', dead: 'DEAD', present: 'present (unverifiable)', missing: 'MISSING' }[r.status]
  console.log(`${r.name}: ${label}${r.detail ? ` — ${r.detail}` : ''}`)
  if (r.status === 'dead' || r.status === 'missing') anyDead = true
}

if (anyDead) {
  console.error('')
  console.error('At least one declared secret is dead or missing. Rotate it before')
  console.error('starting a hands-off window — see nexus/playbooks/hands-off.md Step 5.')
  process.exit(1)
}

process.exit(0)
