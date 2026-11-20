#!/usr/bin/env node
// scripts/notify.mjs — best-effort push notification for loop
// events the user must hear about while away: a failure-mode
// stop, a new [needs-user-call], an unclean turn end.
//
//   node scripts/notify.mjs --title "march: stopped" \
//     --body "verify failed 3x on same root cause (phase 12)" \
//     --priority high
//
// Channels (first configured wins; both may fire if both set):
//   NOTIFY_NTFY_TOPIC    ntfy.sh topic — free, no signup.
//                        Subscribe on your phone: ntfy.sh/<topic>.
//                        Treat the topic name as a secret.
//   NOTIFY_WEBHOOK_URL   any JSON webhook (Slack/Discord/custom);
//                        payload: {title, body, priority, ts}
//
// Contract: ALWAYS exits 0. Notification is best-effort and must
// never become a new failure mode. Neither var set → prints a
// one-liner and exits 0 (so skills can call it unconditionally).

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

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      flags[key] = val
    }
  }
  return flags
}

const flags = parseArgs(process.argv.slice(2))
const title = flags.title ?? 'loop notification'
const body = flags.body ?? ''
const priority = ['low', 'default', 'high', 'urgent'].includes(flags.priority)
  ? flags.priority
  : 'default'

const topic = process.env.NOTIFY_NTFY_TOPIC
const webhook = process.env.NOTIFY_WEBHOOK_URL

const sends = []

if (topic) {
  sends.push(
    fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: title, Priority: priority },
      body,
      signal: AbortSignal.timeout(10_000),
    }),
  )
}

if (webhook) {
  sends.push(
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, priority, ts: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    }),
  )
}

if (sends.length === 0) {
  process.stdout.write(`notify (no channel configured): ${title} — ${body}\n`)
  process.exit(0)
}

Promise.allSettled(sends).then((results) => {
  const failed = results.filter((r) => r.status === 'rejected' || (r.value && !r.value.ok))
  if (failed.length === results.length) {
    process.stderr.write(`notify: all channels failed (non-fatal): ${title}\n`)
  } else {
    process.stdout.write(`notify: sent — ${title}\n`)
  }
  process.exit(0)
})
