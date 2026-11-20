#!/usr/bin/env node
// scripts/plugin-doctor.mjs — the `doctor` command's read-only drift
// check: an adopted repo's plan/nexus.lock version against the
// version baked into a nexus plugin install at build time
// (plugin/vendor/templates/plan/nexus.lock, written by
// scripts/build-plugin.mjs's render()).
//
// Standalone (dev; also what prompts/doctor.md tells the agent to
// run against a cloned nexus checkout):
//
//   node scripts/plugin-doctor.mjs --target <adopter-repo>
//     [--plugin-root <path>]   # defaults to this repo's own plugin/
//
// Vendored (an installed plugin's doctor command — see
// plugin/commands/doctor.md):
//
//   node "${CLAUDE_PLUGIN_ROOT}/vendor/scripts/plugin-doctor.mjs" \
//     --target "$(pwd)" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
//
// Never writes: reads two version strings, reports drift. No
// network, no mutation — the same read-only contract
// prompts/doctor.md promises an adopter.
//
// Deliberately standalone: no import from scripts/build-plugin.mjs
// (or anything else), even though both read a `plan/nexus.lock`
// `version:` line the same way — this file is vendored alone into
// plugin/vendor/scripts/, with no sibling build-plugin.mjs, so it
// carries its own tiny copy of that read rather than a cross-file
// import that would break once vendored.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PLUGIN_ROOT = path.join(ROOT, 'plugin')

// --- plan/nexus.lock --------------------------------------------------------

function readLockVersionAt(root) {
  const file = path.join(root, 'plan', 'nexus.lock')
  const text = fs.readFileSync(file, 'utf-8')
  const m = text.match(/^version:\s*(\S+)\s*$/m)
  if (!m) throw new Error(`${file}: no version: line found`)
  return m[1]
}

// --- version compare ---------------------------------------------------------

// Dot-separated, numeric-segment compare (semver-ish, no dependency,
// matching the plain `version:` strings plan/nexus.lock carries).
// A non-numeric segment falls back to a string compare of that one
// segment; a missing trailing segment reads as 0 (so "2.0" == "2.0.0").
export function compareVersions(a, b) {
  const pa = String(a).split('.')
  const pb = String(b).split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '0'
    const sb = pb[i] ?? '0'
    const na = Number(sa)
    const nb = Number(sb)
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na < nb ? -1 : 1
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1
    }
  }
  return 0
}

// --- reads -------------------------------------------------------------------

// The version baked into a plugin install at build time: the vendored
// templates/ snapshot's own plan/nexus.lock, byte-identical to the
// kit's plan/nexus.lock at the version build-plugin.mjs last ran
// against.
export function readVendoredVersion(pluginRoot) {
  return readLockVersionAt(path.join(pluginRoot, 'vendor', 'templates'))
}

// The adopted repo's own pinned version. A missing plan/nexus.lock
// is a distinct, reportable state (never adopted), not a crash; any
// other read failure (unparseable lock) is reported too, not thrown.
export function readAdoptedVersion(targetRoot) {
  try {
    return { version: readLockVersionAt(targetRoot), error: null }
  } catch (err) {
    return { version: null, error: err.code === 'ENOENT' ? 'no-lock' : 'unreadable' }
  }
}

// --- the report ----------------------------------------------------------

// Never throws on the target side (reported as a status instead);
// throws only if pluginRoot itself can't produce a vendored version
// (a misconfigured --plugin-root is a usage error, not a drift report).
export function diagnose({ targetRoot, pluginRoot = DEFAULT_PLUGIN_ROOT }) {
  const vendoredVersion = readVendoredVersion(pluginRoot)
  const adopted = readAdoptedVersion(targetRoot)

  if (adopted.error === 'no-lock') {
    return {
      status: 'not-adopted',
      adoptedVersion: null,
      vendoredVersion,
      message: `${targetRoot}: no plan/nexus.lock found — this repo has not adopted nexus yet (the plugin ships ${vendoredVersion}; run the adopt command first).`,
    }
  }
  if (adopted.error === 'unreadable') {
    return {
      status: 'unreadable',
      adoptedVersion: null,
      vendoredVersion,
      message: `${targetRoot}: plan/nexus.lock exists but has no version: line — cannot compare.`,
    }
  }

  const cmp = compareVersions(adopted.version, vendoredVersion)
  const status = cmp === 0 ? 'current' : cmp < 0 ? 'behind' : 'ahead'
  const message = {
    current: `up to date: this repo is on ${adopted.version}, matching the plugin's vendored ${vendoredVersion}.`,
    behind: `drift: this repo is on ${adopted.version}; the plugin ships ${vendoredVersion} — run the upgrade command.`,
    ahead: `this repo is on ${adopted.version}, newer than the plugin's vendored ${vendoredVersion} — the installed plugin is the stale side.`,
  }[status]
  return { status, adoptedVersion: adopted.version, vendoredVersion, message }
}

// --- CLI -----------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2)
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? null : argv[i + 1]
  }
  const target = arg('--target')
  if (!target) {
    process.stderr.write('plugin-doctor: --target <repo-path> is required\n')
    process.exit(1)
  }
  const pluginRoot = arg('--plugin-root') ? path.resolve(arg('--plugin-root')) : DEFAULT_PLUGIN_ROOT
  const targetRoot = path.resolve(target)
  let report
  try {
    report = diagnose({ targetRoot, pluginRoot })
  } catch (err) {
    process.stderr.write(`plugin-doctor: ${err.message}\n`)
    process.exit(1)
  }
  process.stdout.write(`plugin-doctor: ${report.message}\n`)
  process.stdout.write(`plugin-doctor: json ${JSON.stringify(report)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
