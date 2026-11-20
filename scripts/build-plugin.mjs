#!/usr/bin/env node
// scripts/build-plugin.mjs — plugin/ and .claude-plugin/marketplace.json,
// from plan/nexus.lock and templates/.
//
// `/plugin install nexus` needs a plugin manifest and a marketplace
// entry that work from this repo with no external hosting, and an
// offline templates/ snapshot so an install never depends on this
// repo's working tree moving under it. It also needs the three
// plugin commands themselves (adopt, upgrade, doctor): thin
// generated wrappers (plugin/commands/*.md) over a vendored, offline
// copy of the canonical prompts/ text and the doctor script, since
// an installed plugin has no ../nexus checkout to read those from.
// All of it is generated, never hand-edited (same discipline as
// assets/): edit this script, then regenerate; a hand edit to
// plugin/ or the marketplace file fails the gate's `plugin` leg
// (wired in a later chunk).
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

// --- the three plugin commands ------------------------------------------
// Each is a thin wrapper: its body tells the agent to read the
// vendored, offline copy of the matching prompts/ file and follow
// it — never a path into this repo, which an installed plugin
// never has. doctor's body additionally redirects the one script
// path that prompt names, since that script is vendored too.

const WRAPPED_PROMPTS = ['adopt.md', 'upgrade.md', 'doctor.md']

const COMMAND_SPECS = {
  adopt: {
    description: "Adopt nexus into this repo — the vendored copy of nexus's canonical adopt prompt (prompts/adopt.md).",
    body: `Read \`\${CLAUDE_PLUGIN_ROOT}/vendor/prompts/adopt.md\` and
follow it exactly, start to finish. It is nexus's canonical
adopt prompt, vendored into this plugin at build time
(scripts/build-plugin.mjs) so the install never depends on a
separate nexus checkout moving under it.`,
  },
  upgrade: {
    description: "Upgrade this repo to the current nexus kit — the vendored copy of nexus's canonical upgrade prompt (prompts/upgrade.md).",
    body: `Read \`\${CLAUDE_PLUGIN_ROOT}/vendor/prompts/upgrade.md\` and
follow it exactly, start to finish. It is nexus's canonical
upgrade prompt, vendored into this plugin at build time
(scripts/build-plugin.mjs).`,
  },
  doctor: {
    description: "Read-only drift check — this repo's plan/nexus.lock version against the version this plugin install ships (prompts/doctor.md).",
    body: `Read \`\${CLAUDE_PLUGIN_ROOT}/vendor/prompts/doctor.md\` and
follow it exactly. It is nexus's canonical doctor prompt,
vendored into this plugin at build time
(scripts/build-plugin.mjs). Wherever it names a script path
relative to a separate nexus checkout, run the vendored copy
instead: \`\${CLAUDE_PLUGIN_ROOT}/vendor/scripts/plugin-doctor.mjs\`.`,
  },
}

export function buildCommand(name) {
  const spec = COMMAND_SPECS[name]
  if (!spec) throw new Error(`build-plugin: no command spec for "${name}"`)
  return `---\ndescription: ${spec.description}\n---\n\n${spec.body}\n\nArgument: $ARGUMENTS\n`
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
  // The canonical prompts the three commands wrap, and the script
  // doctor's command runs — vendored byte-for-byte, same as templates/,
  // so an installed plugin never reads a path into this repo.
  for (const name of WRAPPED_PROMPTS) {
    out.set(`plugin/vendor/prompts/${name}`, fs.readFileSync(path.join(root, 'prompts', name)))
  }
  out.set('plugin/vendor/scripts/plugin-doctor.mjs', fs.readFileSync(path.join(root, 'scripts', 'plugin-doctor.mjs')))
  for (const name of Object.keys(COMMAND_SPECS)) {
    out.set(`plugin/commands/${name}.md`, Buffer.from(buildCommand(name), 'utf-8'))
  }
  return out
}

export function write(root = ROOT) {
  const out = render(root)
  // Clear the whole generated tree first: plugin/ is generated in
  // full (vendored templates, vendored prompts/script, commands),
  // so a file removed or renamed upstream since the last build never
  // lingers on disk.
  fs.rmSync(path.join(root, 'plugin'), { recursive: true, force: true })
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
  // Anything on disk under plugin/ that render() didn't produce is
  // stale or hand-added — walk the whole generated tree, not just
  // the vendored templates/ subdirectory.
  const pluginDir = path.join(root, 'plugin')
  if (fs.existsSync(pluginDir)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(abs); continue }
        const rel = `plugin/${path.relative(pluginDir, abs).split(path.sep).join('/')}`
        if (!out.has(rel)) problems.push(`${rel}: not generated by scripts/build-plugin.mjs (stale file under plugin/, rerun it)`)
      }
    }
    walk(pluginDir)
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
  const fixed = 2 /* plugin.json, marketplace.json */ + WRAPPED_PROMPTS.length + 1 /* plugin-doctor.mjs */ + Object.keys(COMMAND_SPECS).length
  process.stdout.write(`build-plugin: wrote ${files.length} files (plugin/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, ${WRAPPED_PROMPTS.length} vendored prompts, 1 vendored script, ${Object.keys(COMMAND_SPECS).length} generated commands, ${files.length - fixed} vendored template files)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
