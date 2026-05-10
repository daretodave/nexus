#!/usr/bin/env node
// scripts/loop-issue.mjs
//
// "Loop issue mirror" — opens / closes GitHub issues that mirror
// the autonomous loop's work. Two flavors:
//
//   1) /iterate findings (one issue per finding — "open" + "close-comment")
//      The shipping commit's `Closes #N` trailer auto-closes.
//
//   2) Phases (one issue per phase, find-or-create-or-reopen — "phase-open"
//      + "phase-close"). Idempotent across ticks: if an issue with the
//      phase title already exists open, reuse it; if closed, reopen and
//      log a "phase work resumed" comment; if none, create.
//
// Subcommands:
//
//   open --severity <high|med|low>
//        --category <bug|enhancement|content|data|docs|seo|a11y|perf>
//        --source <user|reader|audit|external>
//        --title "<title>"
//        --body-file <path>
//
//     Creates a new issue. Echoes the issue number on stdout (just
//     the number; clean for shell capture). Exits 0 on success, 1
//     on failure (caller falls back to "no issue, just ship" — the
//     mirror is best-effort).
//
//   close-comment --number <N>
//                 --commit <sha>
//                 --deploy-url <url>
//
//     Posts a follow-up comment confirming the deploy. The
//     `Closes #N` trailer in the commit body auto-closes the issue
//     when pushed to main; no explicit `gh issue close` is required.
//     Failures are warnings, not blockers — the fix has already
//     shipped.
//
//   phase-open --phase <id>
//              --title "<title>"
//              --body-file <path>
//
//     Find-or-create-or-reopen the phase mirror. Idempotent:
//       * existing open issue with matching title prefix → reuse,
//       * latest closed issue with matching title prefix → reopen,
//                                                          comment,
//       * none → create.
//     Echoes the issue number on stdout. Best-effort on failure
//     (exit 1, caller continues).
//
//   phase-close --phase <id>
//               --commit <sha>
//               --deploy-url <url>
//
//     Posts a "phase shipped" comment. The commit's `Closes #N`
//     trailer auto-closes the issue. Best-effort.
//
// Required env (from .env or shell):
//   GH_TOKEN    repo-scoped PAT
//   GH_REPO     owner/repo, e.g. <REPO_SLUG>
//
// Reads .env using a simple loader; matches the shape used by
// scripts/deploy-check.mjs and skills/triage.md.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// --- load .env if present (Node has no built-in .env loader) ---
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const VALID_SEVERITY = new Set(['high', 'med', 'low'])
const VALID_SOURCE = new Set(['user', 'reader', 'audit', 'external'])
const VALID_CATEGORY = new Set([
  'bug',
  'enhancement',
  'content',
  'data',
  'docs',
  'seo',
  'a11y',
  'perf',
])

// Label palette (color hexes — GitHub takes hex without `#`).
// Created idempotently on first encounter via `gh label create`.
const LABEL_PALETTE = {
  'loop:opened': { color: '5319e7', description: 'Opened by the autonomous loop' },
  'loop:phase': { color: '0e8a16', description: 'Phase mirror — opens at phase start, closes on ship' },
  'severity:high': { color: 'b60205', description: 'High severity finding' },
  'severity:med': { color: 'fbca04', description: 'Medium severity finding' },
  'severity:low': { color: 'c5def5', description: 'Low severity finding' },
  'source:user': { color: '0e8a16', description: 'Originated from /jot' },
  'source:reader': { color: '1d76db', description: 'Originated from /critique reader' },
  'source:audit': { color: '5319e7', description: 'Originated from /iterate audit' },
  'source:external': { color: 'd93f0b', description: 'Routed in by /triage from a user-filed issue' },
  bug: { color: 'd73a4a', description: '' },
  enhancement: { color: 'a2eeef', description: '' },
  content: { color: '0075ca', description: '' },
  data: { color: '7057ff', description: '' },
  docs: { color: '0052cc', description: '' },
  seo: { color: 'bfdadc', description: '' },
  a11y: { color: '5319e7', description: '' },
  perf: { color: 'e99695', description: '' },
}

// --- argv parsing -----------------------------------------------------

function parseArgs(argv) {
  const flags = {}
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true'
      flags[key] = val
      i += val === 'true' ? 1 : 2
    } else {
      i += 1
    }
  }
  return flags
}

// --- gh wrappers (extracted so tests can mock them) -------------------

function ghCall(args, opts = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf-8', ...opts })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function ensureLabel(name, repo) {
  const palette = LABEL_PALETTE[name] ?? { color: 'cccccc', description: '' }
  const r = spawnSync(
    'gh',
    [
      'label',
      'create',
      name,
      '--repo',
      repo,
      '--color',
      palette.color,
      '--description',
      palette.description ?? '',
    ],
    { encoding: 'utf-8' },
  )
  if (r.status === 0) return { created: true }
  // gh exits non-zero when the label already exists; that's the dominant
  // case after the first run. Swallow only that specific error.
  const out = (r.stderr ?? '') + (r.stdout ?? '')
  if (/already exists/i.test(out)) return { created: false }
  return { created: false, error: out.trim() || `gh label create exited ${r.status}` }
}

function parseIssueNumber(stdout) {
  // gh issue create prints the URL as its last line, e.g.
  //   https://github.com/owner/repo/issues/42
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/\/issues\/(\d+)\s*$/)
    if (m) return Number(m[1])
  }
  return null
}

// Build the phase title prefix used to find-or-create the phase mirror.
// Using prefix-match keeps `/triage` from rewriting titles and breaking
// the lookup; rename the issue body, not the title prefix.
export function phaseTitlePrefix(phaseId) {
  return `Phase ${phaseId} — `
}

function isPhaseMatch(title, phaseId) {
  // Require `Phase <id> — ` *as a prefix*, anchored, so `Phase 16` does
  // not collide with `Phase 16a`.
  return title.startsWith(phaseTitlePrefix(phaseId))
}

// Search GitHub for any issue (open or closed) whose title prefix
// matches the phase id. Returns { number, state } | null.
//
// We deliberately do NOT use `--search "<prefix>" in:title` here:
// GitHub's text-search index is eventually-consistent, so a phase
// issue created seconds ago may not surface in a follow-up search
// for several minutes. The `--label loop:phase` filter goes through
// the issues REST API, which is read-your-writes consistent — every
// issue tagged with that label appears immediately. We pull all
// loop:phase issues (both states) and prefix-match the title
// client-side, which makes find-or-reuse robust across rapid
// successive ticks.
function findPhaseIssue(phaseId, repo) {
  const r = ghCall([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--label',
    'loop:phase',
    '--json',
    'number,title,state',
    '--limit',
    '200',
  ])
  if (r.status !== 0) {
    return { error: r.stderr.trim() || `gh issue list exited ${r.status}` }
  }
  let arr
  try {
    arr = JSON.parse(r.stdout || '[]')
  } catch (e) {
    return { error: `gh issue list returned non-JSON: ${e.message}` }
  }
  const matches = arr.filter((row) => isPhaseMatch(row.title ?? '', phaseId))
  if (matches.length === 0) return null
  // Prefer an OPEN match; fall back to the most-recent CLOSED. gh
  // returns issues newest-first, so matches[0] is already the most
  // recent for the all-closed case.
  const open = matches.find((row) => String(row.state).toUpperCase() === 'OPEN')
  if (open) return { number: open.number, state: 'OPEN' }
  return { number: matches[0].number, state: 'CLOSED' }
}

// --- subcommands ------------------------------------------------------

function cmdOpen(flags) {
  const { severity, category, source, title } = flags
  const bodyFile = flags['body-file']
  const repo = process.env.GH_REPO

  if (!process.env.GH_TOKEN) {
    process.stderr.write('loop-issue: GH_TOKEN missing from env (.env not loaded?)\n')
    process.exit(1)
  }
  if (!repo) {
    process.stderr.write('loop-issue: GH_REPO missing (set in .env)\n')
    process.exit(1)
  }
  if (!VALID_SEVERITY.has(severity)) {
    process.stderr.write(`loop-issue: --severity must be one of ${[...VALID_SEVERITY].join('|')}\n`)
    process.exit(1)
  }
  if (!VALID_CATEGORY.has(category)) {
    process.stderr.write(`loop-issue: --category must be one of ${[...VALID_CATEGORY].join('|')}\n`)
    process.exit(1)
  }
  if (!VALID_SOURCE.has(source)) {
    process.stderr.write(`loop-issue: --source must be one of ${[...VALID_SOURCE].join('|')}\n`)
    process.exit(1)
  }
  if (!title || !bodyFile) {
    process.stderr.write('loop-issue: --title and --body-file are required\n')
    process.exit(1)
  }
  if (!fs.existsSync(bodyFile)) {
    process.stderr.write(`loop-issue: body file not found: ${bodyFile}\n`)
    process.exit(1)
  }

  const labels = [
    'loop:opened',
    `severity:${severity}`,
    `source:${source}`,
    category,
  ]

  // Ensure all labels exist (idempotent).
  for (const name of labels) {
    const r = ensureLabel(name, repo)
    if (r.error) {
      process.stderr.write(`loop-issue: label ensure failed for ${name}: ${r.error}\n`)
      process.exit(1)
    }
  }

  // Create the issue.
  const r = ghCall([
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    title,
    '--body-file',
    path.resolve(bodyFile),
    '--label',
    labels.join(','),
  ])
  if (r.status !== 0) {
    process.stderr.write(`loop-issue: gh issue create failed (${r.status})\n${r.stderr}\n`)
    process.exit(1)
  }
  const number = parseIssueNumber(r.stdout)
  if (!number) {
    process.stderr.write(`loop-issue: could not parse issue number from gh stdout:\n${r.stdout}\n`)
    process.exit(1)
  }
  process.stdout.write(`${number}\n`)
}

function cmdCloseComment(flags) {
  const number = flags.number
  const commit = flags.commit
  const deployUrl = flags['deploy-url']
  const repo = process.env.GH_REPO

  if (!process.env.GH_TOKEN || !repo) {
    process.stderr.write('loop-issue: GH_TOKEN/GH_REPO missing — skipping comment\n')
    return // best-effort: do not exit non-zero
  }
  if (!number || !commit || !deployUrl) {
    process.stderr.write('loop-issue: --number, --commit, --deploy-url required\n')
    return
  }

  const body = buildCloseCommentBody({ commit, deployUrl })
  const r = ghCall(['issue', 'comment', String(number), '--repo', repo, '--body', body])
  if (r.status !== 0) {
    process.stderr.write(`loop-issue: comment failed for #${number} (status ${r.status})\n${r.stderr}\n`)
    return // best-effort: do not exit non-zero
  }
}

export function buildCloseCommentBody({ commit, deployUrl }) {
  return [
    `Shipped in ${commit}.`,
    '',
    `Live at ${deployUrl} after deploy ready (~3–5 min).`,
    '',
    '_The autonomous loop closes this issue via the commit\'s `Closes #N` trailer; no manual close is required._',
  ].join('\n')
}

function cmdPhaseOpen(flags) {
  const phaseId = flags.phase
  const title = flags.title
  const bodyFile = flags['body-file']
  const repo = process.env.GH_REPO

  if (!process.env.GH_TOKEN) {
    process.stderr.write('loop-issue: GH_TOKEN missing from env (.env not loaded?)\n')
    process.exit(1)
  }
  if (!repo) {
    process.stderr.write('loop-issue: GH_REPO missing (set in .env)\n')
    process.exit(1)
  }
  if (!phaseId) {
    process.stderr.write('loop-issue: --phase is required\n')
    process.exit(1)
  }
  if (!title || !bodyFile) {
    process.stderr.write('loop-issue: --title and --body-file are required\n')
    process.exit(1)
  }
  if (!fs.existsSync(bodyFile)) {
    process.stderr.write(`loop-issue: body file not found: ${bodyFile}\n`)
    process.exit(1)
  }
  if (!isPhaseMatch(title, phaseId)) {
    process.stderr.write(
      `loop-issue: --title must start with "${phaseTitlePrefix(phaseId)}" so reuse-by-prefix works\n`,
    )
    process.exit(1)
  }

  // Make sure the phase + provenance labels exist.
  for (const name of ['loop:phase', 'loop:opened']) {
    const r = ensureLabel(name, repo)
    if (r.error) {
      process.stderr.write(`loop-issue: label ensure failed for ${name}: ${r.error}\n`)
      process.exit(1)
    }
  }

  const found = findPhaseIssue(phaseId, repo)
  if (found && found.error) {
    process.stderr.write(`loop-issue: phase lookup failed: ${found.error}\n`)
    process.exit(1)
  }

  if (found && found.state === 'OPEN') {
    // Reuse — no new issue, no comment churn. Caller already has the
    // brief on the row; the issue body matches.
    process.stdout.write(`${found.number}\n`)
    return
  }

  if (found && found.state === 'CLOSED') {
    // Re-open + log a resume comment.
    const reopen = ghCall(['issue', 'reopen', String(found.number), '--repo', repo])
    if (reopen.status !== 0) {
      process.stderr.write(
        `loop-issue: phase reopen failed for #${found.number} (status ${reopen.status})\n${reopen.stderr}\n`,
      )
      process.exit(1)
    }
    const comment = ghCall([
      'issue',
      'comment',
      String(found.number),
      '--repo',
      repo,
      '--body',
      buildPhaseResumeCommentBody({ phaseId }),
    ])
    if (comment.status !== 0) {
      // Non-fatal: the reopen succeeded, the comment is polish.
      process.stderr.write(
        `loop-issue: phase resume comment failed for #${found.number} (status ${comment.status})\n${comment.stderr}\n`,
      )
    }
    process.stdout.write(`${found.number}\n`)
    return
  }

  // Create from scratch.
  const r = ghCall([
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    title,
    '--body-file',
    path.resolve(bodyFile),
    '--label',
    'loop:phase,loop:opened',
  ])
  if (r.status !== 0) {
    process.stderr.write(`loop-issue: gh issue create (phase) failed (${r.status})\n${r.stderr}\n`)
    process.exit(1)
  }
  const number = parseIssueNumber(r.stdout)
  if (!number) {
    process.stderr.write(`loop-issue: could not parse issue number from gh stdout:\n${r.stdout}\n`)
    process.exit(1)
  }
  process.stdout.write(`${number}\n`)
}

function cmdPhaseClose(flags) {
  const phaseId = flags.phase
  const commit = flags.commit
  const deployUrl = flags['deploy-url']
  const number = flags.number // optional override
  const repo = process.env.GH_REPO

  if (!process.env.GH_TOKEN || !repo) {
    process.stderr.write('loop-issue: GH_TOKEN/GH_REPO missing — skipping phase close\n')
    return // best-effort
  }
  if (!commit || !deployUrl) {
    process.stderr.write('loop-issue: --commit and --deploy-url required\n')
    return
  }
  if (!number && !phaseId) {
    process.stderr.write('loop-issue: pass --number or --phase\n')
    return
  }

  let target = number ? Number(number) : null
  if (!target) {
    const found = findPhaseIssue(phaseId, repo)
    if (found && found.error) {
      process.stderr.write(`loop-issue: phase lookup failed: ${found.error}\n`)
      return
    }
    if (!found) {
      process.stderr.write(`loop-issue: no phase issue found for ${phaseId} — nothing to close\n`)
      return
    }
    target = found.number
  }

  const body = buildPhaseShippedCommentBody({ phaseId, commit, deployUrl })
  const r = ghCall(['issue', 'comment', String(target), '--repo', repo, '--body', body])
  if (r.status !== 0) {
    process.stderr.write(
      `loop-issue: phase comment failed for #${target} (status ${r.status})\n${r.stderr}\n`,
    )
    return
  }
}

export function buildPhaseResumeCommentBody({ phaseId }) {
  return [
    `Phase ${phaseId} work resumed at ${new Date().toISOString()}.`,
    '',
    '_Reopened by the autonomous loop. The original issue stayed closed too long for the next ship; this run reuses the same number to keep the public timeline consistent._',
  ].join('\n')
}

export function buildPhaseShippedCommentBody({ phaseId, commit, deployUrl }) {
  return [
    `Phase ${phaseId} shipped in ${commit}.`,
    '',
    `Live at ${deployUrl} after deploy ready.`,
    '',
    '_The autonomous loop closes this issue via the commit\'s `Closes #N` trailer; no manual close is required._',
  ].join('\n')
}

// --- entry point ------------------------------------------------------

function main(argv) {
  const [sub, ...rest] = argv
  const flags = parseArgs(rest)
  switch (sub) {
    case 'open':
      return cmdOpen(flags)
    case 'close-comment':
      return cmdCloseComment(flags)
    case 'phase-open':
      return cmdPhaseOpen(flags)
    case 'phase-close':
      return cmdPhaseClose(flags)
    case '--help':
    case '-h':
    case 'help':
    case undefined:
      printHelp()
      return
    default:
      process.stderr.write(`loop-issue: unknown subcommand "${sub}"\n`)
      printHelp()
      process.exit(1)
  }
}

function printHelp() {
  process.stdout.write(`loop-issue.mjs — autonomous-loop issue mirror

Usage:
  node scripts/loop-issue.mjs open --severity <high|med|low> \\
      --category <bug|enhancement|content|data|docs|seo|a11y|perf> \\
      --source <user|reader|audit|external> \\
      --title "<title>" --body-file <path>
      → echoes the new issue number to stdout

  node scripts/loop-issue.mjs close-comment --number <N> \\
      --commit <sha> --deploy-url <url>
      → posts a follow-up comment; the Closes #N commit trailer auto-closes

  node scripts/loop-issue.mjs phase-open --phase <id> \\
      --title "Phase <id> — <topic>" --body-file <path>
      → find-or-create-or-reopen; echoes the issue number

  node scripts/loop-issue.mjs phase-close --phase <id> \\
      --commit <sha> --deploy-url <url>
      → posts a "phase shipped" comment; commit's Closes #N auto-closes
      (alternatively pass --number <N> to skip the lookup)

Env (from .env or shell):
  GH_TOKEN, GH_REPO
`)
}

// Export internals for tests. ESM-safe.
export const __test = {
  parseArgs,
  parseIssueNumber,
  buildCloseCommentBody,
  buildPhaseResumeCommentBody,
  buildPhaseShippedCommentBody,
  phaseTitlePrefix,
  isPhaseMatch,
  LABEL_PALETTE,
  VALID_SEVERITY,
  VALID_CATEGORY,
  VALID_SOURCE,
}

// Run main only when invoked as a script, not when imported by tests.
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
      import.meta.url.endsWith(path.basename(process.argv[1] ?? ''))
  } catch {
    return false
  }
})()
if (isMain) {
  main(process.argv.slice(2))
}
