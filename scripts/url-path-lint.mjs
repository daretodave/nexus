#!/usr/bin/env node
// scripts/url-path-lint.mjs — refuse URL.pathname used as a file path.
//
// `new URL(import.meta.url).pathname` looks like a path and is not
// one: a checkout under a folder with a space keeps `%20`, and on
// Windows it starts `/Z:/`. A script that resolves ROOT that way
// quietly reads or writes nothing. fileURLToPath is the only way in.
// The verify gate's `scripts` leg runs this over every script dir;
// an HTTP request's `url.pathname` is not a file path and passes.
//
//   node scripts/url-path-lint.mjs    # exit 1 and file:line on a hit

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A URL built in the same expression, or import.meta.url carried to
// a .pathname before the statement ends.
const PATTERNS = [/new URL\([^;]*?\)\s*\.pathname\b/, /import\.meta\.url\b[^;]*\.pathname\b/]
const COMMENT = /^\s*(\/\/|\/\*|\*)/
const EXT = /\.(mjs|cjs|js|ts|mts|cts)$/
const SKIP = new Set(['node_modules', 'dist', 'build', '.git'])

export const DIRS = ['scripts', 'templates/scripts', '.claude/hooks', 'templates/claude/hooks', 'packages']

// 1-based line numbers of every offending line.
export function findPathnameUses(text) {
  const hits = []
  text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    if (COMMENT.test(line)) return
    if (PATTERNS.some((re) => re.test(line))) hits.push(i + 1)
  })
  return hits
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

export function lintTree(root, dirs = DIRS) {
  const problems = []
  let files = 0
  for (const d of dirs) {
    const abs = path.join(root, d)
    if (!fs.existsSync(abs)) continue
    for (const f of walk(abs, [])) {
      files++
      const rel = path.relative(root, f).split(path.sep).join('/')
      for (const n of findPathnameUses(fs.readFileSync(f, 'utf-8'))) {
        problems.push(`${rel}:${n}: URL .pathname used as a file path (keeps %20 and a /C:/ drive); use fileURLToPath`)
      }
    }
  }
  return { problems, files }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { problems, files } = lintTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  for (const p of problems) console.log(p)
  console.log(problems.length ? `url-path-lint: ${problems.length} hit(s) in ${files} files` : `url-path-lint: ${files} files clean`)
  process.exit(problems.length ? 1 : 0)
}
