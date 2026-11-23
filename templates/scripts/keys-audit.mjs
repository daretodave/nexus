#!/usr/bin/env node
// scripts/keys-audit.mjs: a custody table drifts from the manifest silently — a key gets rotated into a new holder
// file and the old row never deleted, or a secret lands in nexus.secrets.json with nobody noting where it lives.
// This is a pure-string, offline lint: it flags an orphan row (a key no manifest entry *and* no code or doc
// elsewhere names), a ghost entry (a manifest name with no custody row) and an ambiguous row (two rows claiming the
// same key), as a hard gate failure. nexus's own invocation (scripts/verify.mjs's secrets leg) checks
// identity/key-custody.md explicitly; run standalone it checks identity/key-custody.md if present, else
// setup/00_keys.md (the adopter's own copy of this file, once templates/setup/00_keys.md lands at their root).
// A second mode, `--until`, is a manual pre-flight for an unattended window: it checks the same table's `Expires`
// column against the window's own end date, not a fixed invariant, so it is not wired into verify.mjs's gate.
//
//   node scripts/keys-audit.mjs              # exit 1 and a problem line per hit
//   node scripts/keys-audit.mjs setup/00_keys.md   # check a specific custody file
//   node scripts/keys-audit.mjs --until 2026-12-01       # exit 1 if anything expires before that date
//   node scripts/keys-audit.mjs --until 2026-12-01 setup/00_keys.md   # same, against a specific custody file
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManifest } from './plan/secrets-manifest.mjs'
import { RINGS } from './secrets-vault.mjs'

const SKIP = new Set(['node_modules', '.git'])
const INDEX_ROW = /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The custody file's `## Index` table rows — lines between the `## Index` heading and the next `##` heading whose
 * first cell is a backtick-wrapped KEY name (so the header row and the `|---|...` divider fall out on their own,
 * with no need to special-case them). Shared boundary-finding for parseCustodyKeys and parseCustodyExpiries. */
function indexRows(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^##\s+Index\b/.test(l))
  if (start === -1) return []
  const rows = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s/.test(line)) break
    if (INDEX_ROW.test(line)) rows.push(line)
  }
  return rows
}

/** The ordered list of Key names (first column, backtick-wrapped) from a custody file's `## Index` table. A name
 * repeats once per row that claims it. */
export function parseCustodyKeys(text) {
  return indexRows(text).map((line) => INDEX_ROW.exec(line)[1])
}

/** One `{ key, expires }` per `## Index` table row: `key` is the first column's backtick-wrapped name, `expires`
 * is the raw trimmed text of the `Expires` column (`Key | Holder file | Minted by | Scopes | Mirrored to | Expires |
 * Rotate via` — the 6th column once the row is split on `|`, counting the empty string before the leading `|` as
 * column 0). `expires` is whatever text the table carries — `n/a`, `unconfirmed`, or a date — unvalidated here. */
export function parseCustodyExpiries(text) {
  return indexRows(text).map((line) => ({
    key: INDEX_ROW.exec(line)[1],
    expires: (line.split('|')[6] ?? '').trim(),
  }))
}

/** The subset of `rows` (as from parseCustodyExpiries) whose `expires` is a parseable `YYYY-MM-DD` date that is
 * lexically before `until` (also required to be a `YYYY-MM-DD` date — a non-date `until` is a caller bug, not a
 * no-op). A row whose `expires` isn't a clean date (`n/a`, `unconfirmed`, anything else) is skipped: an unverifiable
 * expiry is a different, already-documented problem, not a window-expiry failure. */
export function expiringBefore(rows, until) {
  if (!ISO_DATE.test(until)) throw new Error(`expiringBefore: "until" must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(until)}`)
  return rows.filter((r) => ISO_DATE.test(r.expires) && r.expires < until)
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

/** The custody file to use: `customFile` (relative to `root`) when given, else `identity/key-custody.md` if it
 * exists, else `setup/00_keys.md` if that exists, else null (nothing to check). Shared file-resolution for
 * auditKeysCustody, auditWindowExpiry and custodyRowFor. */
function pickCustodyFile(root, customFile) {
  const has = (f) => fs.existsSync(path.join(root, f))
  return customFile ?? (has('identity/key-custody.md') ? 'identity/key-custody.md' : has('setup/00_keys.md') ? 'setup/00_keys.md' : null)
}

/** Audits one custody table against `nexus.secrets.json`'s names. `customFile` picks the table (relative to
 * `root`); given none, `identity/key-custody.md` wins if it exists, else `setup/00_keys.md`, else there is nothing
 * to check. Returns `{ failures, note }`, verify.mjs's leg shape. */
export function auditKeysCustody(root, customFile) {
  const file = pickCustodyFile(root, customFile)
  if (!file || !fs.existsSync(path.join(root, file))) return { failures: [], note: 'no custody table found' }
  const keys = parseCustodyKeys(fs.readFileSync(path.join(root, file), 'utf-8'))
  const manifest = readManifest(path.join(root, 'nexus.secrets.json'))
  const names = manifest ? manifest.names : new Set()
  const elsewhere = namesElsewhere(root, keys.filter((k) => !names.has(k)), file)
  const failures = lintCustody(file, keys, names, (k) => elsewhere.has(k))
  return { failures, note: `${file}: ${keys.length} custody rows against ${names.size} manifest names` }
}

/** The unattended-window pre-flight: which custody rows expire before `until` (an ISO `YYYY-MM-DD` date, the
 * window's own end). Same file-resolution fallback as auditKeysCustody — `customFile`, else
 * identity/key-custody.md, else setup/00_keys.md. Returns `{ failures, note }`, the same leg shape; a window-expiry
 * failure is a different, manual check from auditKeysCustody's orphan/ghost/ambiguous lint, so this is not wired
 * into verify.mjs's gate. */
export function auditWindowExpiry(root, until, customFile) {
  const file = pickCustodyFile(root, customFile)
  if (!file || !fs.existsSync(path.join(root, file))) return { failures: [], note: 'no custody table found' }
  const rows = parseCustodyExpiries(fs.readFileSync(path.join(root, file), 'utf-8'))
  const expiring = expiringBefore(rows, until)
  const failures = expiring.map((r) => `${file}: \`${r.key}\` expires ${r.expires}, before the window ends ${until}`)
  return { failures, note: `${file}: ${rows.length} custody rows checked against a window ending ${until}` }
}

/** One custody row's "Holder file" and "Minted by" text for `name` (the exact row that names it, trimmed; the
 * table's columns, once a row is split on `|` and counting the empty string before the leading `|` as column 0: 1
 * Key, 2 Holder file, 3 Minted by, 4 Scopes, 5 Mirrored to, 6 Expires, 7 Rotate via). Same file-resolution fallback as
 * auditKeysCustody — `customFile`, else identity/key-custody.md, else setup/00_keys.md. Returns `{ file, holderFile,
 * mintedBy }`, or null when there is no custody file, or it has no row for that exact name: never guessed. */
export function custodyRowFor(root, name, customFile) {
  const file = pickCustodyFile(root, customFile)
  if (!file || !fs.existsSync(path.join(root, file))) return null
  const text = fs.readFileSync(path.join(root, file), 'utf-8')
  for (const line of indexRows(text)) {
    const m = INDEX_ROW.exec(line)
    if (m[1] !== name) continue
    const cols = line.split('|')
    return { file, holderFile: (cols[2] ?? '').trim(), mintedBy: (cols[3] ?? '').trim() }
  }
  return null
}

/** The ring(s) a vault with this config actually reads, in order (secrets-vault.mjs's own RINGS, with `keychain`
 * dropped unless `vaultConfig.keychain` turns it on) — always known, even with no custody table at all. */
function ringsChecked(vaultConfig) {
  return RINGS.filter((r) => r !== 'keychain' || vaultConfig.keychain)
}

/** A missing name's three facts for `secrets.mjs run`'s refusal (A2: ring, holder file, runbook): the ring(s) the
 * vault checked, and — only when a custody table has a row for this exact name — that row's holder file and the
 * runbook that mints it ("Minted by"). No custody file, or no row for the name: ring only, degrading gracefully
 * rather than guessing a file or runbook the kit can't actually point to. The exact wording this returns is
 * documented verbatim in customization/bootstrap-automation.md; change one, change the other in the same commit. */
export function missingKeyDetail(root, name, vaultConfig, customFile) {
  const checked = `ring: ${ringsChecked(vaultConfig).join(', ')}`
  const row = custodyRowFor(root, name, customFile)
  return row ? `${checked} · holder file: ${row.holderFile} · minted by: ${row.mintedBy}` : checked
}

function report(failures, note) {
  for (const f of failures) console.log(f)
  console.log(failures.length ? `keys-audit: ${failures.length} problem(s) (${note})` : `keys-audit: clean (${note})`)
  return failures.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const [first, second, third] = process.argv.slice(2)
  const { failures, note } = first === '--until' ? auditWindowExpiry(root, second, third) : auditKeysCustody(root, first)
  process.exit(report(failures, note))
}
