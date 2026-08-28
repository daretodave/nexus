#!/usr/bin/env node
// scripts/new-skill.mjs — the skill scaffolder.
//
// nexus/concepts/skills-anatomy.md documents the canonical
// two-file skill shape (skills/<verb>.md + .claude/commands/<verb>.md).
// Hand-copying a sibling skill and renaming it is how anatomy drift
// starts; this emits both files pre-filled with the canonical
// sections instead, TODO-marked throughout — it scaffolds
// structure, not procedure. You still write the actual contract.
//
//   node scripts/new-skill.mjs <name> "<purpose>"
//   node scripts/new-skill.mjs <name> "<purpose>" --template
//
// <name> must be lower-kebab-case. --template writes to
// templates/skills/ + templates/claude/commands/ instead of
// skills/ + .claude/commands/ — only relevant if this repo itself
// ships a templates/ mirror to further adopters (e.g. a nested
// kit); most projects never pass it. Refuses to overwrite either
// target file if it already exists — delete both first if you
// really mean to regenerate.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

function usage(msg) {
  if (msg) console.error(`new-skill: ${msg}`)
  console.error('usage: node scripts/new-skill.mjs <name> "<purpose>" [--template]')
  process.exit(1)
}

const rawArgs = process.argv.slice(2)
const useTemplate = rawArgs.includes('--template')
const [name, ...purposeWords] = rawArgs.filter((a) => a !== '--template')
const purpose = purposeWords.join(' ')

if (!name || !purpose) usage()
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  usage(`"${name}" isn't lower-kebab-case (e.g. ship-asset, plan-a-phase)`)
}

const skillDir = useTemplate ? 'templates/skills' : 'skills'
const commandDir = useTemplate ? 'templates/claude/commands' : '.claude/commands'
const skillPath = path.join(ROOT, skillDir, `${name}.md`)
const commandPath = path.join(ROOT, commandDir, `${name}.md`)

for (const p of [skillPath, commandPath]) {
  if (fs.existsSync(p)) {
    usage(`${path.relative(ROOT, p)} already exists — delete it first if you mean to regenerate`)
  }
}

const skillBody = `# Skill: ${name}

> Full autonomy, no review checkpoint. TODO: replace this line
> with the specific contract if this isn't a standard shipping
> skill (e.g. "User-in-the-loop" for oversight-shaped verbs).

## 1. Purpose

${purpose}

TODO: a second paragraph distinguishing this verb from its
nearest neighbor — why does it need its own skill instead of a
step in an existing one?

## 2. Invocation

\`\`\`
/${name}                       # TODO: default behavior
\`\`\`

## 3. Autonomy contract

TODO: for each common ambiguity class this skill hits, "X
happens → decide Y." This is what keeps the skill from
drifting into "ask the user" mode.

## 4. The procedure

### Step 0 — Sync

\`\`\`bash
git pull --ff-only
\`\`\`

### Step 1 — Pick the work

TODO.

### Step 2 — TODO

TODO.

## 5. Hard rules

1. No \`Co-Authored-By:\`. No emojis.
2. No \`--no-verify\`, no force-push.
3. Commit + push atomic; no dirty tree at turn end.
4. The verify gate is non-negotiable.
5. TODO: skill-specific rules.

## 6. Failure modes

1. \`git pull\` divergence.
2. TODO: the objective, numbered conditions that warrant
   stopping. Everything else: decide, ship, document.

## 7. Quick reference

\`\`\`bash
# Reads
TODO

# Writes
TODO

# Commands
git pull --ff-only
\`\`\`
`

const commandBody = `---
description: ${purpose}
---

You are invoked under the \`${name}\` skill — TODO one-sentence
what. Read \`skills/${name}.md\` end to end before touching
anything else; that file is the single source of truth for this
command. Decide instead of asking; document the call in the
commit body.

Argument handling:
- No argument → TODO default behavior.

Procedure: §4 of \`skills/${name}.md\`. Hard rules: §5. Failure
modes: §6. Everything else — TODO the decisions this skill
autonomously handles — resolve and ship.

When invoked under \`/loop\` or \`/march\`, the user is not present
at this tick. After commit + push, return cleanly.

Argument: $ARGUMENTS
`

fs.mkdirSync(path.dirname(skillPath), { recursive: true })
fs.mkdirSync(path.dirname(commandPath), { recursive: true })
fs.writeFileSync(skillPath, skillBody)
fs.writeFileSync(commandPath, commandBody)

console.log(`new-skill: wrote ${path.relative(ROOT, skillPath)}`)
console.log(`new-skill: wrote ${path.relative(ROOT, commandPath)}`)
console.log('new-skill: both files are TODO-marked scaffolds — fill in the procedure before shipping.')
