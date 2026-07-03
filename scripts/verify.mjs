#!/usr/bin/env node
// scripts/verify.mjs — the kit's own verify gate.
//
// nexus tells every adopting repo: "the verify gate is
// non-negotiable, hermetic, and runs before every commit." This
// is that gate, for nexus itself. A methodology repo's failure
// modes are not type errors — they're dead links, orphaned docs,
// drifted trees, placeholder typos, and skills that stop obeying
// their own anatomy. Each leg below catches one of those classes.
//
//   node scripts/verify.mjs            # all legs
//   node scripts/verify.mjs links      # one leg by name
//
// Legs:
//   links         every relative markdown link resolves to a file
//   tree          README's "What's in this kit" tree matches disk
//   discover      every playbook/concept/customization doc is
//                 linked from at least one other doc (no orphans)
//   placeholders  every <UPPER_SNAKE> token is in the documented
//                 vocabulary (catches <PROJECT_NAME>-style typos)
//   anatomy       skill files carry the canonical sections; command
//                 pointers carry frontmatter + $ARGUMENTS; skills
//                 and command pointers pair 1:1
//   emoji         no pictographic emoji anywhere in tracked docs
//                 (✓ and ❌ dingbats are fine; 🤖 is not)
//
// Exit 0 = green. Exit 1 = at least one leg red. No dependencies,
// no network — hermetic by construction.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

// --- shared helpers ----------------------------------------------------

function trackedMarkdown() {
  const out = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf-8' })
  return out.trim().split(/\r?\n/).filter(Boolean)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

// Split a file into lines annotated with fence state, so legs can
// skip fenced code blocks (link examples, bash snippets).
function annotatedLines(text) {
  const lines = text.split(/\r?\n/)
  let fenced = false
  return lines.map((line, i) => {
    const isFenceMarker = /^\s*(```|~~~)/.test(line)
    if (isFenceMarker) {
      const wasFenced = fenced
      fenced = !fenced
      return { n: i + 1, line, fenced: wasFenced, marker: true }
    }
    return { n: i + 1, line, fenced, marker: false }
  })
}

function normalize(rel) {
  return rel.split(path.sep).join('/')
}

// --- leg: links ---------------------------------------------------------

function legLinks(files) {
  const failures = []
  let checked = 0
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const file of files) {
    for (const { n, line, fenced, marker } of annotatedLines(read(file))) {
      if (fenced || marker) continue
      const scrubbed = line.replace(/`[^`]*`/g, '``') // ignore inline code
      let m
      while ((m = linkRe.exec(scrubbed)) !== null) {
        let target = m[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        if (target.includes('<')) continue // placeholder link
        target = target.replace(/[#?].*$/, '')
        if (target === '') continue
        const resolved = target.startsWith('/')
          ? path.join(ROOT, target)
          : path.join(ROOT, path.dirname(file), target)
        checked++
        if (!fs.existsSync(resolved)) {
          failures.push(`${file}:${n}: broken link → ${m[1]}`)
        }
      }
    }
  }
  return { failures, note: `${checked} relative links` }
}

// --- leg: tree ----------------------------------------------------------
// Parses the fenced tree in README.md whose first line is `nexus/`
// and asserts every entry exists on disk. Entries containing `<`
// (placeholders) are skipped.

function legTree() {
  const failures = []
  const lines = read('README.md').split(/\r?\n/)
  let inTree = false
  let sawRoot = false
  const stack = [] // path segments by depth
  let checked = 0
  for (const raw of lines) {
    if (!inTree) {
      if (/^```/.test(raw)) inTree = 'candidate'
      continue
    }
    if (inTree === 'candidate') {
      if (raw.trim() === 'nexus/') { inTree = true; sawRoot = true; continue }
      inTree = false
      continue
    }
    if (/^```/.test(raw)) break
    // "│   ├── playbooks/" → depth from marker position, name after marker
    const m = raw.match(/^((?:[│ ]   )*)(?:├── |└── )(.+)$/)
    if (!m) continue
    const depth = m[1].length / 4
    let name = m[2].split('#')[0].trim()
    if (!name || name.includes('<')) continue
    stack.length = depth
    stack[depth] = name.replace(/\/$/, '')
    const rel = stack.slice(0, depth + 1).join('/')
    checked++
    if (!fs.existsSync(path.join(ROOT, rel))) {
      failures.push(`README.md tree: ${rel} does not exist on disk`)
    }
  }
  if (!sawRoot) failures.push('README.md: could not find the `nexus/` kit tree block')
  return { failures, note: `${checked} tree entries` }
}

// --- leg: discover (no orphan docs) --------------------------------------

function legDiscover(files) {
  const failures = []
  const discoverable = files.filter((f) =>
    /^(playbooks|concepts|customization)\//.test(normalize(f)),
  )
  // Collect every relative link target across the repo.
  const linked = new Set()
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const file of files) {
    for (const { line, fenced, marker } of annotatedLines(read(file))) {
      if (fenced || marker) continue
      let m
      while ((m = linkRe.exec(line.replace(/`[^`]*`/g, '``'))) !== null) {
        let target = m[1]
        if (/^(https?:|mailto:|#)/.test(target) || target.includes('<')) continue
        target = target.replace(/[#?].*$/, '')
        if (!target) continue
        const resolved = target.startsWith('/')
          ? path.normalize(target).slice(1)
          : normalize(path.normalize(path.join(path.dirname(file), target)))
        linked.add(normalize(resolved))
      }
    }
  }
  for (const doc of discoverable) {
    if (!linked.has(normalize(doc))) {
      failures.push(`${doc}: not linked from any other doc — undiscoverable`)
    }
  }
  return { failures, note: `${discoverable.length} docs checked for reachability` }
}

// --- leg: placeholders ---------------------------------------------------
// The placeholder vocabulary is deliberate. A new template may add a
// token, but it must be added HERE too — that forced touch is the
// review. Typos (<PROJECT_NAME> for <PROJECT>) fail immediately.

const PLACEHOLDER_VOCABULARY = new Set([
  // canonical six (README adoption prompt)
  '<PROJECT>', '<PROJECT_LOWER>', '<HOSTING_URL>', '<HOSTING_PROVIDER>',
  '<REPO_SLUG>', '<DEFAULT_BRANCH>',
  // hosting + deploy
  '<HOSTING_PROVIDER_CLI>', '<HOSTING_PROVIDER_PREVIEW_PATTERN>',
  '<PROVIDER_AUTH_TOKEN>', '<DEPLOY_URL>', '<CUSTOM_DOMAIN>', '<PORT>',
  // project structure
  '<PROJECT_PKG_PREFIX>', '<PROJECT_TAGLINE>', '<CONTENT_LOCATION>',
  '<DATA_LOCATION>',
  // external services
  '<SERVICE>', '<SERVICE_URL>', '<AUTH_PROVIDER>', '<DB_PROVIDER>',
  '<EMAIL_PROVIDER>', '<AI_PROVIDER>', '<TOKEN_ENDPOINT>',
  '<CRITIQUE_BOT_SECRET>',
  // sub-agents + domain
  '<DOMAIN_SPECIALIST>', '<DOMAIN_SPECIALIST_1>', '<DOMAIN_SPECIALIST_2>',
  '<SPECIALIST_NAME>', '<DOMAIN_AUTHORITATIVE_SOURCE_1>',
  '<DOMAIN_AUTHORITATIVE_SOURCE_2>', '<ARCHIVE_OR_REVIEW_SITE>',
  '<COMMUNITY_HUB_1>',
  // generic fill-ins used in examples
  '<N>', '<M>', '<K>', '<L>', '<H>', '<X>', '<Y>', '<URL>', '<REPO>',
  '<NAME>', '<STATUS>', '<ISO>', '<MOOD>', '<REFERENCE>', '<PHASE_N>',
  '<PHASE_M>', '<SEV>',
])

function legPlaceholders(files) {
  const failures = []
  let seen = 0
  const tokenRe = /<[A-Z][A-Z0-9_]*>/g
  for (const file of files) {
    const lines = read(file).split(/\r?\n/)
    lines.forEach((line, i) => {
      let m
      while ((m = tokenRe.exec(line)) !== null) {
        seen++
        if (!PLACEHOLDER_VOCABULARY.has(m[0])) {
          failures.push(
            `${file}:${i + 1}: unknown placeholder ${m[0]} — typo, or add it to PLACEHOLDER_VOCABULARY in scripts/verify.mjs`,
          )
        }
      }
    })
  }
  return { failures, note: `${seen} placeholder tokens` }
}

// --- leg: anatomy ---------------------------------------------------------
// concepts/skills-anatomy.md is the contract; this leg makes it
// mechanical. Applies to adopter-facing templates AND to nexus's
// own skills/ + .claude/commands/ (the kit eats its own dogfood).

const REQUIRED_SKILL_SECTIONS = [
  { name: 'Purpose', re: /^##\s+(\d+\.\s+)?Purpose\b/m },
  { name: 'Invocation', re: /^##\s+(\d+\.\s+)?Invocation\b/m },
  { name: 'Failure modes', re: /^##\s+(\d+\.\s+)?Failure modes\b/m },
  { name: 'Quick reference', re: /^##\s+(\d+\.\s+)?Quick reference\b/m },
]

function globDir(rel) {
  const dir = path.join(ROOT, rel)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `${rel}/${f}`)
}

function legAnatomy() {
  const failures = []
  const skillFiles = [...globDir('templates/skills'), ...globDir('skills')]
  for (const file of skillFiles) {
    const text = read(file)
    for (const { name, re } of REQUIRED_SKILL_SECTIONS) {
      if (!re.test(text)) failures.push(`${file}: missing canonical section "${name}"`)
    }
  }
  const commandDirs = ['templates/claude/commands', '.claude/commands']
  let commandCount = 0
  for (const dirRel of commandDirs) {
    for (const file of globDir(dirRel)) {
      commandCount++
      const text = read(file)
      if (!/^---\r?\ndescription:/m.test(text)) {
        failures.push(`${file}: missing frontmatter description`)
      }
      if (!text.includes('Argument: $ARGUMENTS')) {
        failures.push(`${file}: missing the literal "Argument: $ARGUMENTS" line`)
      }
    }
  }
  // Pairing: every template skill has a command pointer, and vice versa.
  const skillNames = new Set(globDir('templates/skills').map((f) => path.basename(f)))
  const commandNames = new Set(globDir('templates/claude/commands').map((f) => path.basename(f)))
  for (const s of skillNames) {
    if (!commandNames.has(s)) failures.push(`templates/skills/${s} has no templates/claude/commands/${s} pointer`)
  }
  for (const c of commandNames) {
    if (!skillNames.has(c)) failures.push(`templates/claude/commands/${c} has no templates/skills/${c} source of truth`)
  }
  // Same pairing for nexus's own overlay, when present.
  const selfSkills = new Set(globDir('skills').map((f) => path.basename(f)))
  for (const c of globDir('.claude/commands').map((f) => path.basename(f))) {
    if (!selfSkills.has(c)) failures.push(`.claude/commands/${c} has no skills/${c} source of truth`)
  }
  return { failures, note: `${skillFiles.length} skills, ${commandCount} command pointers` }
}

// --- leg: emoji ------------------------------------------------------------
// "No emojis — anywhere" is a standing rule of the methodology; the
// kit holds itself to it. Dingbats the docs legitimately use (✓ ✗ ❌ →)
// live outside the forbidden ranges.

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{2705}\u{2728}\u{26A0}-\u{26FF}\u{2B00}-\u{2BFF}]/u

function legEmoji(files) {
  const failures = []
  for (const file of files) {
    const lines = read(file).split(/\r?\n/)
    lines.forEach((line, i) => {
      const m = line.match(EMOJI_RE)
      if (m) failures.push(`${file}:${i + 1}: emoji ${JSON.stringify(m[0])} — standing rule: no emojis`)
    })
  }
  return { failures, note: `${files.length} files scanned` }
}

// --- runner ------------------------------------------------------------------

const LEGS = {
  links: (files) => legLinks(files),
  tree: () => legTree(),
  discover: (files) => legDiscover(files),
  placeholders: (files) => legPlaceholders(files),
  anatomy: () => legAnatomy(),
  emoji: (files) => legEmoji(files),
}

function main() {
  const only = process.argv[2]
  if (only && !LEGS[only]) {
    process.stderr.write(`verify: unknown leg "${only}". Legs: ${Object.keys(LEGS).join(', ')}\n`)
    process.exit(1)
  }
  const files = trackedMarkdown()
  let red = false
  for (const [name, run] of Object.entries(LEGS)) {
    if (only && name !== only) continue
    const { failures, note } = run(files)
    if (failures.length === 0) {
      process.stdout.write(`  ${name.padEnd(13)} ok    (${note})\n`)
    } else {
      red = true
      process.stdout.write(`  ${name.padEnd(13)} FAIL  (${failures.length})\n`)
      for (const f of failures) process.stdout.write(`    ${f}\n`)
    }
  }
  process.stdout.write(red ? '\nverify: RED — fix before committing.\n' : '\nverify: green.\n')
  process.exit(red ? 1 : 0)
}

main()
