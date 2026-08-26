#!/usr/bin/env node
// scripts/pulse.mjs — the offline instrument panel.
//
// `/oversight`, `/oversight audit`, and `/digest` (if adopted) each
// hand-derive the same numbers from the same plan/ files. This
// script computes them once: last-commit age, build-plan
// pending/blocked counts, AUDIT pending count, CRITIQUE pending
// count + last-pass age, PHASE_CANDIDATES pending count +
// oldest-pending age.
//
//   node scripts/pulse.mjs
//
// Reads git log and plan/ locally. No network calls, ever — the
// gh-backed numbers (workflow runs, issue labels) stay in whatever
// skill already fetches them. Always exits 0: this is a report,
// not a gate. A file that can't be read prints "unreadable" on its
// line and the script keeps going.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

function readSafe(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
  } catch {
    return null
  }
}

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = ms / (1000 * 60 * 60)
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function pendingSection(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^## Pending\s*$/.test(l))
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^## /.test(l))
  return end === -1 ? rest : rest.slice(0, end)
}

function countRows(section) {
  return section.filter((l) => /^### /.test(l)).length
}

function header(text, key) {
  const re = new RegExp(`^> ${key}:\\s*(.+)$`, 'm')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

function printRow(label, value) {
  console.log(`  ${label.padEnd(18)}${value}`)
}

// --- last commit --------------------------------------------------------

console.log(`pulse — <PROJECT_LOWER>`)
console.log('')

try {
  const iso = execSync('git log -1 --format=%cI', { cwd: ROOT, encoding: 'utf-8' }).trim()
  const sha = execSync('git log -1 --format=%h', { cwd: ROOT, encoding: 'utf-8' }).trim()
  const subject = execSync('git log -1 --format=%s', { cwd: ROOT, encoding: 'utf-8' }).trim()
  printRow('last commit', `${ago(iso)}  ${sha} ${subject}`)
} catch {
  printRow('last commit', 'unreadable (not a git checkout?)')
}

// --- build plan ----------------------------------------------------------

const buildPlan = readSafe('plan/steps/01_build_plan.md')
if (buildPlan === null) {
  printRow('build plan', 'unreadable (plan/steps/01_build_plan.md)')
} else {
  const pending = (buildPlan.match(/^- \[ \] /gm) ?? []).length
  const blocked = (buildPlan.match(/^- \[blocked:/gm) ?? []).length
  printRow('build plan', `${pending} pending, ${blocked} blocked`)
}

// --- audit -----------------------------------------------------------------

const audit = readSafe('plan/AUDIT.md')
if (audit === null) {
  printRow('audit', 'unreadable (plan/AUDIT.md)')
} else {
  printRow('audit', `${countRows(pendingSection(audit))} pending`)
}

// --- critique --------------------------------------------------------------

const critique = readSafe('plan/CRITIQUE.md')
if (critique === null) {
  printRow('critique', 'unreadable (plan/CRITIQUE.md)')
} else {
  const count = countRows(pendingSection(critique))
  const lastPass = header(critique, 'Last pass')
  const age = lastPass && lastPass !== 'never' ? `, last pass ${ago(`${lastPass}T00:00:00Z`)}` : ''
  printRow('critique', `${count} pending${age}`)
}

// --- candidates --------------------------------------------------------------

const candidates = readSafe('plan/PHASE_CANDIDATES.md')
if (candidates === null) {
  printRow('candidates', 'unreadable (plan/PHASE_CANDIDATES.md)')
} else {
  const section = pendingSection(candidates)
  const count = countRows(section)
  const proposedDates = section
    .map((l) => l.match(/^- proposed:\s*(\d{4}-\d{2}-\d{2})/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort()
  const oldest = proposedDates.length ? `, oldest ${ago(`${proposedDates[0]}T00:00:00Z`)}` : ''
  printRow('candidates', `${count} pending${oldest}`)
}

console.log('')
process.exit(0)
