#!/usr/bin/env node
// scripts/build-plugin.mjs — plugin/ and .claude-plugin/marketplace.json,
// from plan/nexus.lock and templates/.
//
// `/plugin install nexus` needs a plugin manifest and a marketplace
// entry that work from this repo with no external hosting, and an
// offline templates/ snapshot so an install never depends on this
// repo's working tree moving under it. Both are generated, never
// hand-edited (same discipline as assets/): edit this script, then
// regenerate; a hand edit to plugin/ or the marketplace file fails
// the gate's `plugin` leg (wired in a later chunk).
//
//   node scripts/build-plugin.mjs           # write plugin/ and
//                                            # .claude-plugin/marketplace.json
//   node scripts/build-plugin.mjs --check    # regenerate in memory; exit 1
//                                             # on any diff, naming the file
//   node scripts/build-plugin.mjs --root <p> # either, rooted elsewhere
//
// Output is byte-identical across runs (\n line endings, sorted file
// lists, no timestamps), so two runs on the same tree never diff.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const AUTHOR_NAME = 'daretodave and nexus contributors'
const OWNER_NAME = 'daretodave'
const ONE_LINER = 'Turn a repo into a project that ships itself.'

// --- plan/nexus.lock -------------------------------------------------------

// `plan/nexus.lock` is a tiny hand-rolled key: value file, not YAML, so
// read its `version:` line with a plain regex — same zero-dependency
// discipline as the rest of the gate (scripts/diagrams.mjs included).
export function readLockVersion(root = ROOT) {
  const text = fs.readFileSync(path.join(root, 'plan', 'nexus.lock'), 'utf-8')
  const m = text.match(/^version:\s*(\S+)\s*$/m)
  if (!m) throw new Error('plan/nexus.lock: no version: line found')
  return m[1]
}

// --- the two manifests -------------------------------------------------------

export function buildPluginManifest(version) {
  return {
    name: 'nexus',
    version,
    description: ONE_LINER,
    author: { name: AUTHOR_NAME },
  }
}

export function buildMarketplace() {
  return {
    name: 'nexus',
    owner: { name: OWNER_NAME },
    description: "nexus's own marketplace entry — installs straight from this repo, no external hosting.",
    plugins: [
      { name: 'nexus', source: './plugin', description: ONE_LINER },
    ],
  }
}

function json(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

// --- the vendored templates/ snapshot ---------------------------------------

// Every file under templates/, as a path relative to templates/, sorted
// for stable ordering. Directories carry no entry of their own.
export function listTemplateFiles(root = ROOT) {
  const templatesDir = path.join(root, 'templates')
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile()) out.push(path.relative(templatesDir, abs).split(path.sep).join('/'))
    }
  }
  walk(templatesDir)
  return out.sort()
}

// --- the generated file set --------------------------------------------------
// Maps a path relative to `root` to its exact bytes. The two manifests
// are generated text; the vendored templates are byte-for-byte copies
// of the source files (never re-encoded, so binary assets vendor clean).

export function render(root = ROOT) {
  const version = readLockVersion(root)
  const out = new Map()
  out.set('plugin/.claude-plugin/plugin.json', Buffer.from(json(buildPluginManifest(version)), 'utf-8'))
  out.set('.claude-plugin/marketplace.json', Buffer.from(json(buildMarketplace()), 'utf-8'))
  const templatesDir = path.join(root, 'templates')
  for (const rel of listTemplateFiles(root)) {
    out.set(`plugin/vendor/templates/${rel}`, fs.readFileSync(path.join(templatesDir, rel)))
  }
  return out
}

export function write(root = ROOT) {
  const out = render(root)
  // Clear the vendored snapshot first so a file removed from templates/
  // since the last build doesn't linger in plugin/vendor/templates/.
  fs.rmSync(path.join(root, 'plugin', 'vendor', 'templates'), { recursive: true, force: true })
  for (const [rel, body] of out) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  return [...out.keys()].sort()
}

// Problems, one line each, naming the file; empty means in sync.
export function check(root = ROOT) {
  const problems = []
  const out = render(root)
  for (const [rel, body] of out) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) { problems.push(`${rel}: missing (run node scripts/build-plugin.mjs)`); continue }
    const disk = fs.readFileSync(abs)
    if (Buffer.compare(disk, body) === 0) continue
    problems.push(`${rel}: differs from the generator (edit scripts/build-plugin.mjs or templates/, then run it)`)
  }
  const vendorDir = path.join(root, 'plugin', 'vendor', 'templates')
  if (fs.existsSync(vendorDir)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(abs); continue }
        const rel = `plugin/vendor/templates/${path.relative(vendorDir, abs).split(path.sep).join('/')}`
        if (!out.has(rel)) problems.push(`${rel}: not generated by scripts/build-plugin.mjs (stale vendored file, rerun it)`)
      }
    }
    walk(vendorDir)
  }
  return problems.sort()
}

function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--root')
  const root = at === -1 ? ROOT : path.resolve(argv[at + 1] || '.')
  if (argv.includes('--check')) {
    const problems = check(root)
    for (const p of problems) process.stderr.write(`build-plugin: ${p}\n`)
    if (problems.length) process.exit(1)
    process.stdout.write('build-plugin: plugin/ and .claude-plugin/marketplace.json match the generator\n')
    return
  }
  const files = write(root)
  process.stdout.write(`build-plugin: wrote ${files.length} files (plugin/.claude-plugin/plugin.json, ${files.length - 2} vendored template files, .claude-plugin/marketplace.json)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
