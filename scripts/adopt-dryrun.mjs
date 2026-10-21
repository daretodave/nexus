#!/usr/bin/env node
// scripts/adopt-dryrun.mjs — mechanizes playbooks/new-project.md
// steps 3 and 4 (copy the plan starters, copy the templates,
// sweep placeholders, prune adopt-by-need files using the step's
// own worked example, then `plan-check` green on the result)
// against a scratch dir, so a broken command fails a script
// instead of waiting for the next /critique pass to hit it by
// hand.
//
//   node scripts/adopt-dryrun.mjs
//
// Reads the steps' own fenced bash blocks straight out of the
// playbook — never re-states them — so this can't silently drift
// from the doc it checks. Needs a bash with xargs and sed:
// /bin/bash on Unix, Git Bash on Windows (found from
// `git --exec-path`, the default install path, or `where bash`;
// never WSL's System32 launcher). Skips cleanly where none is
// found — the PowerShell twin stays a human-followed path, not a
// mechanized one.
//
// Opt-in: not part of the default `node scripts/verify.mjs` run.
// See the `adopt-dryrun` leg there for how it's wired in.

import { execFileSync } from 'node:child_process'
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

// The bash the playbook's blocks run under. On Windows, Node
// can't see Git Bash's /bin/bash, so find bash.exe from Git
// itself. WSL's launcher (System32, WindowsApps) runs another
// OS's tree and can't read this checkout's paths: it never counts.
export function findBash() {
  if (process.platform !== 'win32') return fs.existsSync('/bin/bash') ? '/bin/bash' : null
  const candidates = []
  try {
    // <git>/mingw64/libexec/git-core -> <git>/bin/bash.exe
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    candidates.push(path.resolve(exec, '..', '..', '..', 'bin', 'bash.exe'))
  } catch { /* no git on PATH */ }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']) {
    if (base) candidates.push(path.join(base, 'Git', 'bin', 'bash.exe'))
  }
  try {
    const found = execFileSync('where', ['bash'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    candidates.push(...found.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
  } catch { /* none on PATH */ }
  return candidates.find((c) => !/[\\/](System32|WindowsApps)[\\/]/i.test(c) && fs.existsSync(c)) || null
}

function extractBashBlock(text, headingRe) {
  const lines = text.split(/\r?\n/)
  const headingIdx = lines.findIndex((l) => headingRe.test(l))
  if (headingIdx === -1) return null
  let i = headingIdx + 1
  for (; i < lines.length; i++) {
    if (/^```bash\s*$/.test(lines[i])) break
    if (/^#{2,3}\s/.test(lines[i])) return null // hit the next step first
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
    if (entry.isSymbolicLink() || entry.name === '.git') continue
    if (entry.isDirectory()) out.push(...walkFiles(abs))
    else out.push(abs)
  }
  return out
}

function main() {
  const bash = findBash()
  if (!bash) {
    console.log('adopt-dryrun: no bash found (/bin/bash, or Git Bash on Windows) — skip (the PowerShell twin is manual)')
    process.exit(0)
  }
  const run = (cmd, cwd) => execFileSync(bash, ['-c', cmd], { cwd, stdio: 'pipe' })

  const doc = fs.readFileSync(PLAYBOOK, 'utf-8')
  const planCmd = extractBashBlock(doc, /^##\s+3\.\s+Specs \+ roadmap\s*$/)
  const copyCmd = extractBashBlock(doc, /^###\s+Copy\s*$/)
  const sweepCmd = extractBashBlock(doc, /^###\s+Replace placeholders\s*$/)
  const pruneCmd = extractBashBlock(doc, /^###\s+Prune adopt-by-need files\s*$/)

  const failures = []
  if (!planCmd) failures.push('could not find the "## 3. Specs + roadmap" fenced bash block in playbooks/new-project.md')
  if (!copyCmd) failures.push('could not find the "### Copy" fenced bash block in playbooks/new-project.md')
  if (!sweepCmd) failures.push('could not find the "### Replace placeholders" fenced bash block in playbooks/new-project.md')
  if (!pruneCmd) failures.push('could not find the "### Prune adopt-by-need files" fenced bash block in playbooks/new-project.md')
  if (failures.length) {
    failures.forEach((f) => console.error(`adopt-dryrun: ${f}`))
    process.exit(1)
  }

  const planFiles = [...planCmd.matchAll(/templates\/plan\/(\S+)/g)].map(([, f]) => f)
  if (planFiles.length === 0) {
    failures.push('parsed zero templates/plan/ files out of the step 3 block — extraction regex or the doc drifted')
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
    // A junction on Windows: a directory symlink there needs admin
    // or developer mode, a junction doesn't.
    fs.symlinkSync(ROOT, nexusLink, process.platform === 'win32' ? 'junction' : 'dir')
    // The prerequisites: a git repo (plan-check finds its root
    // through git), and step 2 already wrote plan/bearings.md.
    run('git init -q', adopterDir)
    fs.mkdirSync(path.join(adopterDir, 'plan'))

    // Step 3: the roadmap, the archive, the lock and the starters.
    run(planCmd, adopterDir)
    for (const f of planFiles) {
      if (!fs.existsSync(path.join(adopterDir, 'plan', f))) {
        failures.push(`plan step: expected plan/${f} to exist after the step 3 block, it doesn't`)
      }
    }

    run(copyCmd, adopterDir)

    for (const { dest } of pairs) {
      if (!fs.existsSync(path.join(adopterDir, dest))) {
        failures.push(`copy step: expected ${dest} to exist after the Copy block, it doesn't`)
      }
    }

    run(sweepCmd, adopterDir)

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
    run(pruneCmd, adopterDir)

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

    // A pruned script must take its tests and importers with it:
    // every relative import left under scripts/ still resolves.
    const scriptsDir = path.join(adopterDir, 'scripts')
    const importRe = /^\s*import\s[^'"]*?['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]/gm
    for (const abs of fs.existsSync(scriptsDir) ? walkFiles(scriptsDir) : []) {
      if (!abs.endsWith('.mjs')) continue
      for (const [, a, b] of fs.readFileSync(abs, 'utf-8').matchAll(importRe)) {
        if (!fs.existsSync(path.resolve(path.dirname(abs), a || b))) {
          failures.push(`prune step: ${path.relative(adopterDir, abs).replace(/\\/g, '/')} imports ${a || b}, which the example prune removed`)
        }
      }
    }

    // Step 5 ends on `node scripts/plan-check.mjs` green: the
    // starters, swept and pruned, must already pass it.
    try {
      execFileSync(process.execPath, ['scripts/plan-check.mjs'], { cwd: adopterDir, stdio: 'pipe', encoding: 'utf-8' })
    } catch (err) {
      const out = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message
      failures.push(`plan-check on the starters: ${out.split(/\r?\n/).join(' | ')}`)
    }
  } catch (err) {
    const stderr = `${err.stderr || ''}`.trim()
    failures.push(`command failed — ${err.message}${stderr && !err.message.includes(stderr) ? ` — ${stderr}` : ''}`)
  } finally {
    // Drop the link first, so the recursive delete can never walk
    // through a junction into the kit checkout itself.
    try { fs.unlinkSync(nexusLink) } catch { /* never made */ }
    fs.rmSync(scratchParent, { recursive: true, force: true })
  }

  if (failures.length) {
    console.error(`adopt-dryrun: FAIL (${failures.length})`)
    failures.forEach((f) => console.error(`  ${f}`))
    process.exit(1)
  }
  console.log(`adopt-dryrun: ok (${planFiles.length} plan starters, ${pairs.length} copy targets, ${scanned} files swept, 0 unresolved tokens, agents.md clean after prune, plan-check green)`)
  process.exit(0)
}

// fileURLToPath, not URL.pathname, so a checkout path with a space
// still runs main() (findBash is exported for reuse).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
