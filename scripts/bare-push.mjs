#!/usr/bin/env node
// scripts/bare-push.mjs — refuse a bare push of the default branch
// in a skill.
//
// A skill that ends `git push origin <DEFAULT_BRANCH>` pushes main
// from a contributor's checkout too. Every committing skill lands
// per owner mode instead, and only `next/land.md` (the file that
// defines landing) names the owner's push. The verify gate's
// `anatomy` leg runs this over templates/skills/, skills/ and both
// command-pointer folders; `HEAD:<branch>` (the owner's push from
// a detached worktree, already under an owner bullet) passes.
//
//   node scripts/bare-push.mjs    # exit 1 and file:line on a hit

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BARE_PUSH = /git push origin\s+(?:<DEFAULT_BRANCH>|main)(?![\w:/<>-])/g
const DIRS = ['templates/skills', 'skills', 'templates/claude/commands', '.claude/commands']
const EXEMPT = /(^|\/)next\/land\.md$/

/** The 1-based line of every bare default-branch push in `text`. */
export function barePushLines(text) {
  const lines = []
  for (const m of text.matchAll(BARE_PUSH)) lines.push(text.slice(0, m.index).split('\n').length)
  return lines
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

/** Every skill and command pointer under `root`, linted. */
export function lintSkills(root) {
  const problems = []
  let files = 0
  for (const d of DIRS) {
    for (const abs of walk(path.join(root, d))) {
      const rel = path.relative(root, abs).split(path.sep).join('/')
      if (EXEMPT.test(rel)) continue
      files++
      for (const n of barePushLines(fs.readFileSync(abs, 'utf-8'))) {
        problems.push(`${rel}:${n}: a bare push of the default branch; land per owner mode (skills/next/land.md §6)`)
      }
    }
  }
  return { problems, files }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { problems, files } = lintSkills(root)
  for (const p of problems) process.stdout.write(`${p}\n`)
  process.stdout.write(`${problems.length ? 'RED' : 'ok'}: ${files} skill files checked\n`)
  process.exit(problems.length ? 1 : 0)
}
