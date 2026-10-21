#!/usr/bin/env node
// scripts/adopt-dryrun.mjs — mechanizes playbooks/new-project.md
// step 4 (copy the templates, sweep placeholders, prune
// adopt-by-need files using the step's own worked example)
// against a scratch dir, so a broken command fails a script
// instead of waiting for the next /critique pass to hit it by
// hand.
//
//   node scripts/adopt-dryrun.mjs
//
// Reads the step's own fenced bash blocks straight out of the
// playbook — never re-states them — so this can't silently drift
// from the doc it checks. Unix-only (needs /bin/bash, xargs, sed,
// symlinks); skips cleanly where that's unavailable — the
// PowerShell twin stays a human-followed path, not a mechanized
// one.
//
// Opt-in: not part of the default `node scripts/verify.mjs` run.
// See the `adopt-dryrun` leg there for how it's wired in.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLAYBOOK = path.join(ROOT, 'playbooks/new-project.md')

// The eight tokens step 4's sweep targets. Other placeholder
// families (<N>, <DOMAIN_SPECIALIST>, <PROVIDER_AUTH_TOKEN>, the
// generic example fill-ins, …) are out of this step's scope by
// design and legitimately remain in the copied files — asserting
// a fully placeholder-free tree would fail on a clean run.
const SWEPT_TOKENS = [
  '<PROJECT>', '<PROJECT_LOWER>', '<PROJECT_TAGLINE>', '<HOSTING_URL>',
  '<HOSTING_PROVIDER>', '<REPO_SLUG>', '<DEFAULT_BRANCH>', '<PROJECT_PKG_PREFIX>',
]

function extractBashBlock(text, headingRe) {
  const lines = text.split(/\r?\n/)
  const headingIdx = lines.findIndex((l) => headingRe.test(l))
  if (headingIdx === -1) return null
  let i = headingIdx + 1
  for (; i < lines.length; i++) {
    if (/^```bash\s*$/.test(lines[i])) break
    if (/^###\s/.test(lines[i])) return null // hit the next sub-step first
  }
  if (i >= lines.length) return null
  const start = i + 1
  let end = start
  for (; end < lines.length; end++) {
    if (/^```\s*$/.test(lines[end])) break
  }
  if (end >= lines.length) return null
  return lines.slice(start, end).join('\n')
}

function walkFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) out.push(...walkFiles(abs))
    else out.push(abs)
  }
  return out
}

function main() {
  if (!fs.existsSync('/bin/bash')) {
    console.log('adopt-dryrun: /bin/bash not found — skip (mechanized check is Unix-only, PowerShell twin is manual)')
    process.exit(0)
  }

  const doc = fs.readFileSync(PLAYBOOK, 'utf-8')
  const copyCmd = extractBashBlock(doc, /^###\s+Copy\s*$/)
  const sweepCmd = extractBashBlock(doc, /^###\s+Replace placeholders\s*$/)
  const pruneCmd = extractBashBlock(doc, /^###\s+Prune adopt-by-need files\s*$/)

  const failures = []
  if (!copyCmd) failures.push('could not find the "### Copy" fenced bash block in playbooks/new-project.md')
  if (!sweepCmd) failures.push('could not find the "### Replace placeholders" fenced bash block in playbooks/new-project.md')
  if (!pruneCmd) failures.push('could not find the "### Prune adopt-by-need files" fenced bash block in playbooks/new-project.md')
  if (failures.length) {
    failures.forEach((f) => console.error(`adopt-dryrun: ${f}`))
    process.exit(1)
  }

  const pairRe = /\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\]/g
  const pairs = [...copyCmd.matchAll(pairRe)].map(([, src, dest]) => ({ src, dest }))
  if (pairs.length === 0) {
    failures.push('parsed zero [src, dest] pairs out of the Copy block — extraction regex or the doc drifted')
  }

  const scratchParent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-adopt-'))
  const adopterDir = path.join(scratchParent, 'adopter')
  const nexusLink = path.join(scratchParent, 'nexus')
  let scanned = 0

  try {
    fs.mkdirSync(adopterDir)
    fs.symlinkSync(ROOT, nexusLink)

    execSync(copyCmd, { cwd: adopterDir, shell: '/bin/bash', stdio: 'pipe' })

    for (const { dest } of pairs) {
      if (!fs.existsSync(path.join(adopterDir, dest))) {
        failures.push(`copy step: expected ${dest} to exist after the Copy block, it doesn't`)
      }
    }

    execSync(sweepCmd, { cwd: adopterDir, shell: '/bin/bash', stdio: 'pipe' })

    for (const abs of walkFiles(adopterDir)) {
      scanned++
      const text = fs.readFileSync(abs, 'utf-8')
      for (const token of SWEPT_TOKENS) {
        if (text.includes(token)) {
          failures.push(`placeholder step: ${path.relative(adopterDir, abs)} still contains ${token} after the sweep`)
        }
      }
    }

    // The example rm block removes every adopt-by-need file the playbook's
    // worked example doesn't need — the exact scenario that left stale
    // agents.md rows behind in the CRITIQUE finding this check closes.
    execSync(pruneCmd, { cwd: adopterDir, shell: '/bin/bash', stdio: 'pipe' })

    const agentsText = fs.readFileSync(path.join(adopterDir, 'agents.md'), 'utf-8')
    const skillRowRe = /^\|\s*`([\w-]+)`\s*\|\s*`(skills\/[\w.-]+\.md)`\s*\|/gm
    const skillNames = new Set()
    for (const [, name, skillPath] of agentsText.matchAll(skillRowRe)) {
      skillNames.add(name)
      if (!fs.existsSync(path.join(adopterDir, skillPath))) {
        failures.push(`prune step: agents.md Skills table still references \`${skillPath}\`, which the example prune removed`)
      }
    }
    for (const [, name] of agentsText.matchAll(/^\/([\w-]+)\s/gm)) {
      if (!skillNames.has(name)) continue // not one of this kit's own skills (e.g. the built-in /loop)
      const commandPath = `.claude/commands/${name}.md`
      if (!fs.existsSync(path.join(adopterDir, commandPath))) {
        failures.push(`prune step: agents.md Invocation block still references \`/${name}\`, but \`${commandPath}\` was removed`)
      }
    }
    if (/`brander`/.test(agentsText) && !fs.existsSync(path.join(adopterDir, '.claude/agents/brander.md'))) {
      failures.push('prune step: agents.md Sub-agents table still references `brander`, but `.claude/agents/brander.md` was removed')
    }
  } catch (err) {
    failures.push(`command failed — ${err.message}`)
  } finally {
    fs.rmSync(scratchParent, { recursive: true, force: true })
  }

  if (failures.length) {
    console.error(`adopt-dryrun: FAIL (${failures.length})`)
    failures.forEach((f) => console.error(`  ${f}`))
    process.exit(1)
  }
  console.log(`adopt-dryrun: ok (${pairs.length} copy targets, ${scanned} files swept, 0 unresolved tokens, agents.md clean after prune)`)
  process.exit(0)
}

main()
