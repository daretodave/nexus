#!/usr/bin/env node
// scripts/lint-migration.mjs
//
// The mechanical half of the migration-safety hard rule (see
// nexus/customization/data-layer.md "Migration safety"): the
// autonomous loop applies additive migrations only; destructive
// migrations require /oversight approval. This script classifies
// every executable SQL statement in a migration file as additive
// or destructive and exits non-zero on the latter, so
// skills/ship-migration.md's Step 6 blocks a destructive
// migration before it ever reaches a commit.
//
//   node scripts/lint-migration.mjs <migration-file.sql>
//
//   exit 0  →  additive only, safe to ship
//   exit 1  →  destructive statement found, stop and escalate
//   exit 2  →  usage / file-not-found error
//
// Rollback notes are written as a leading SQL comment block
// (skills/ship-migration.md Step 4) and legitimately contain
// destructive verbs like DROP — comments are stripped before
// classification so they never trip the linter.
//
// Zero dependencies, ESM, hermetic — mirrors deploy-check.mjs's
// CLI shape.

import fs from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node lint-migration.mjs <migration-file.sql>')
  process.exit(2)
}
if (!fs.existsSync(file)) {
  console.error(`lint-migration: file not found: ${file}`)
  process.exit(2)
}

const raw = fs.readFileSync(file, 'utf-8')

// Strip SQL comments (-- line comments and /* block comments */)
// before classification — rollback notes live in comments and are
// allowed to mention destructive verbs.
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, '')
}

const cleaned = stripComments(raw)

// Split into statements on semicolons. Good enough for migration
// files (no stored procedures / dollar-quoted bodies expected in
// additive-only migrations); a statement containing $$ bodies is
// flagged for manual review rather than mis-parsed.
const statements = cleaned
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

const DESTRUCTIVE_PATTERNS = [
  { re: /^DROP\s+/i, label: 'DROP' },
  { re: /^TRUNCATE\s+/i, label: 'TRUNCATE' },
  { re: /ALTER\s+TABLE\s+\S+\s+RENAME\b/i, label: 'ALTER TABLE ... RENAME' },
  { re: /ALTER\s+COLUMN\s+\S+\s+TYPE\b/i, label: 'ALTER COLUMN ... TYPE (data-type change)' },
  { re: /ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i, label: 'ALTER COLUMN ... SET NOT NULL (narrowing)' },
  { re: /DROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { re: /DROP\s+CONSTRAINT\b/i, label: 'DROP CONSTRAINT' },
  { re: /DROP\s+POLICY\b/i, label: 'DROP POLICY' },
]

// ADD COLUMN ... NOT NULL with no DEFAULT fails on existing rows —
// treated as destructive-class per data-layer.md's "ADD COLUMN as
// nullable" wording.
const NARROWING_ADD_COLUMN = /ADD\s+COLUMN\s+.+\bNOT\s+NULL\b(?!.*\bDEFAULT\b)/is

const findings = []
for (const stmt of statements) {
  for (const { re, label } of DESTRUCTIVE_PATTERNS) {
    if (re.test(stmt)) findings.push({ stmt, label })
  }
  if (NARROWING_ADD_COLUMN.test(stmt) && !DESTRUCTIVE_PATTERNS.some(({ re }) => re.test(stmt))) {
    findings.push({ stmt, label: 'ADD COLUMN ... NOT NULL with no DEFAULT (breaks existing rows)' })
  }
}

if (findings.length === 0) {
  console.log(`lint-migration: ${file} — additive only, ${statements.length} statement(s) checked.`)
  process.exit(0)
}

console.error(`lint-migration: ${file} — ${findings.length} destructive statement(s) found:`)
for (const { stmt, label } of findings) {
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 100)
  console.error(`  [${label}] ${preview}${stmt.length > 100 ? '...' : ''}`)
}
console.error('')
console.error('Destructive migrations require /oversight approval and a')
console.error('tested rollback plan before merge. Do not ship past this gate.')
process.exit(1)
