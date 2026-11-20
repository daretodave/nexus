#!/usr/bin/env node
// scripts/keys-audit.mjs: a custody table drifts from the manifest silently — a key gets rotated into a new holder
// file and the old row never deleted, or a secret lands in nexus.secrets.json with nobody noting where it lives.
// This is a pure-string, offline lint: it flags an orphan row (a key no manifest entry *and* no code or doc
// elsewhere names), a ghost entry (a manifest name with no custody row) and an ambiguous row (two rows claiming the
// same key), as a hard gate failure. nexus's own invocation (scripts/verify.mjs's secrets leg) checks
// identity/key-custody.md explicitly; run standalone it checks identity/key-custody.md if present, else
// setup/00_keys.md (the adopter's own copy of this file, once templates/setup/00_keys.md lands at their root).
//
//   node scripts/keys-audit.mjs              # exit 1 and a problem line per hit
//   node scripts/keys-audit.mjs setup/00_keys.md   # check a specific custody file
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManifest } from './plan/secrets-manifest.mjs'

const SKIP = new Set(['node_modules', '.git'])
const INDEX_ROW = /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/

/** The ordered list of Key names (first column, backtick-wrapped) from a custody file's `## Index` table. The
 * header row and the `|---|...` divider row carry no backticked name, so they fall out on their own. A name repeats
 * once per row that claims it. */
export function parseCustodyKeys(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^##\s+Index\b/.test(l))
  if (start === -1) return []
  const keys = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s/.test(line)) break
    const m = INDEX_ROW.exec(line)
    if (m) keys.push(m[1])
  }
  return keys
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Which of `names` turn up anywhere under `root` outside `excludeFile` (the custody file itself) — a whole-word
 * match, pure string, no regex features beyond that. Stops reading a file once every name is found. */
export function namesElsewhere(root, names, excludeFile) {
  const found = new Set()
  const remaining = new Set(names)
  if (!remaining.size) return found
  const exclude = path.resolve(root, excludeFile)
  for (const f of walk(root, [])) {
    if (!remaining.size) break
    if (path.resolve(f) === exclude) continue
    let text
    try { text = fs.readFileSync(f, 'utf-8') } catch { continue }
    for (const name of remaining) {
      if (new RegExp(`\\b${name}\\b`).test(text)) { found.add(name); remaining.delete(name) }
    }
  }
  return found
}

/** The custody table's problems against the manifest: ambiguous rows (claimed 2+ times), orphan rows (not in
 * `names` and `foundElsewhere(key)` says false) and ghost entries (a manifest name with no custody row). `file` is
 * the custody file's path, for the problem line's prefix. */
export function lintCustody(file, keys, names, foundElsewhere) {
  const problems = []
  const counts = new Map()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const [k, n] of counts) {
    if (n > 1) problems.push(`${file}: ambiguous custody row "${k}" (${n} rows claim it)`)
  }
  for (const k of counts.keys()) {
    if (!names.has(k) && !foundElsewhere(k)) problems.push(`${file}: orphan custody row "${k}" (not in the manifest, and no code or doc elsewhere names it)`)
  }
  for (const n of names) {
    if (!counts.has(n)) problems.push(`${file}: ghost manifest entry "${n}" (no custody row in ${file})`)
  }
  return problems
}

/** Audits one custody table against `nexus.secrets.json`'s names. `customFile` picks the table (relative to
 * `root`); given none, `identity/key-custody.md` wins if it exists, else `setup/00_keys.md`, else there is nothing
 * to check. Returns `{ failures, note }`, verify.mjs's leg shape. */
export function auditKeysCustody(root, customFile) {
  const has = (f) => fs.existsSync(path.join(root, f))
  const file = customFile ?? (has('identity/key-custody.md') ? 'identity/key-custody.md' : has('setup/00_keys.md') ? 'setup/00_keys.md' : null)
  if (!file || !has(file)) return { failures: [], note: 'no custody table found' }
  const keys = parseCustodyKeys(fs.readFileSync(path.join(root, file), 'utf-8'))
  const manifest = readManifest(path.join(root, 'nexus.secrets.json'))
  const names = manifest ? manifest.names : new Set()
  const elsewhere = namesElsewhere(root, keys.filter((k) => !names.has(k)), file)
  const failures = lintCustody(file, keys, names, (k) => elsewhere.has(k))
  return { failures, note: `${file}: ${keys.length} custody rows against ${names.size} manifest names` }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { failures, note } = auditKeysCustody(root, process.argv[2])
  for (const f of failures) console.log(f)
  console.log(failures.length ? `keys-audit: ${failures.length} problem(s) (${note})` : `keys-audit: clean (${note})`)
  process.exit(failures.length ? 1 : 0)
}
