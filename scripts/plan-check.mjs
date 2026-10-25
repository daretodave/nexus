#!/usr/bin/env node
// scripts/plan-check.mjs — the plan-shape gate.
//
// The plan is specs, chunks and acceptance IDs (A-IDs). The rules
// that keep it honest are mechanical, so this script checks them
// instead of trusting every writer to remember them:
//
//   - every spec (`plan/NN-<slug>.md`) has `## Acceptance` (one
//     with no chunk left may not: settle takes the heading out with
//     its last A-ID), `## Chunks` and a
//     `Measure: N open · M closed · next A#` line
//   - the Measure line is true: open = A-IDs listed, and
//     open + closed = next - 1 (IDs are never renumbered or reused)
//   - every chunk line parses: `- [ ] **NN.k** <title> · S|M|L ·
//     closes A1, A2 · needs —` (`partial` instead of, or beside,
//     `closes`); its id belongs to its spec and is unique
//   - every A-ID a chunk names exists, and once a spec is chunked
//     every A-ID is covered by some chunk
//   - every `needs` names a chunk (or a whole spec) still in the plan
//   - a chunk's optional `secrets` field (`· secrets VERCEL_TOKEN,
//     CF_API_TOKEN`: names, never values) names only secrets that
//     nexus.secrets.json (beside plan/) declares, and that manifest
//     keeps its shape (scripts/plan/secrets-manifest.mjs)
//   - a spec with nothing left is flagged: absorb it and delete it
//   - plan/README.md links every spec, links no spec that is gone,
//     its `N left` counts match, and its Asap/Held lanes name only
//     chunks (or specs) still in the plan; ARCHIVE.md lines parse
//   - a field candidate in CANDIDATES.md (`- source signals: field
//     (<date>): …`, or a `· field ·` re-evidence line) carries no URL
//     and no bare domain: its sources live in the job summary only
//   - an auto-promoted Held line keeps its shape (`- NN ·
//     auto-promoted, veto until YYYY-MM-DD (#N) · max_age: <n>d ·
//     …`) and holds a spec still in the plan; every other Held line
//     is a lock that times out, so it carries `since: <date>`,
//     `until: <date or condition>` and `max_age: <n>d` (an optional
//     `fallback:` too; scripts/plan/locks.mjs acts on them)
//
// plan/ is read as it will read once plan/pending/ settles (the
// settled view, scripts/plan/settled.mjs): each pending file's
// `## Edit` and `## Add` sections applied in memory, so a
// contributor's plot (its new spec written directly, its roadmap
// row and lane entry a pending edit, its new chunks for an open
// spec an Add, numbered as settle will) passes before the owner
// settles it. A pending file settle would skip (it doesn't parse,
// an old text isn't there exactly once, an Add's spec has no
// Measure line) is a failure.
//
// With `--since <ref>` it also checks history against that ref:
// a chunk that left the plan has an archive line (or a pending
// close in plan/pending/, or was split into `<id>a`, `<id>b`, …
// children), an unresolvable ref is a failure (never a silent
// skip), a deleted spec has its "spec complete" line (a vetoed
// auto-promotion's "spec vetoed"), and no spec's `next A#` or closed count went backwards or
// reused an A-ID. The plan only shrinks.
//
//   node scripts/plan-check.mjs                  # plan/ in the working tree
//   node scripts/plan-check.mjs --since HEAD     # + history vs HEAD
//   node scripts/plan-check.mjs --dir other/plan # another plan folder
//
// Exit 0 = green, 1 = at least one failure. No dependencies, no
// network; `--since` reads git locally. The pure functions are
// exported for tests and for gates that embed this check.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PENDING_DIR } from './plan/pending.mjs'
import { settledView } from './plan/settled.mjs'
import { MANIFEST, NAME as SECRET_NAME, readManifest } from './plan/secrets-manifest.mjs'

export const SPEC_FILE = /^(\d{2,})-[a-z0-9][a-z0-9-]*\.md$/
const MEASURE = /^Measure: (\d+) open · (\d+) closed · next A(\d+)\s*$/
const ARCHIVE_LINE = /^- (\d{4}-\d{2}-\d{2}) · (\d{2,}(?:\.\d+[a-z0-9]*)?)(?: \([^)]*\))? · \S.* · \S.*$/

function sections(text) {
  // Map of "## Heading" → array of { n, line } (fenced blocks skipped).
  const out = new Map()
  let current = null
  let fenced = false
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return }
    if (fenced) return
    const h = line.match(/^## (.+?)\s*$/)
    if (h) { current = h[1]; out.set(current, []); return }
    if (current) out.get(current).push({ n: i + 1, line })
  })
  return out
}

function idList(raw) {
  return raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
}

// Join a chunk's wrapped header: the `- [ ] **id**` line plus any
// continuation lines indented by two spaces that are not sub-bullets.
function chunkHeaders(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const { n, line } = lines[i]
    if (!/^- \[[ x]\] \*\*/.test(line)) continue
    let joined = line
    while (i + 1 < lines.length && /^ {2}\S/.test(lines[i + 1].line) && !/^ {2}- /.test(lines[i + 1].line)) {
      joined += ` ${lines[i + 1].line.trim()}`
      i++
    }
    out.push({ n, text: joined })
  }
  return out
}

export function parseChunk(text) {
  const m = text.match(/^- \[([ x])\] \*\*([^*]+)\*\* (.*)$/)
  if (!m) return { error: 'not a chunk line' }
  if (m[1] === 'x') return { id: m[2], error: 'ticked chunk: a finished chunk leaves the spec (archive line instead)' }
  const fields = m[3].split(' · ')
  const chunk = { id: m[2], title: fields[0], size: null, closes: [], partial: [], needs: null, secrets: [] }
  for (const f of fields.slice(1)) {
    if (/^(S|M|L)$/.test(f)) chunk.size = f
    else if (f.startsWith('closes ')) chunk.closes.push(...idList(f.slice(7)))
    else if (f.startsWith('partial ')) chunk.partial.push(...idList(f.slice(8)))
    else if (f.startsWith('needs ')) {
      const v = f.slice(6).trim()
      chunk.needs = v === '—' || v === '-' ? [] : idList(v)
    } else if (f.startsWith('secrets ')) {
      // Secret names, comma or space separated (`—` for none): the
      // manifest says what each is for and where it goes.
      const v = f.slice(8).trim()
      if (v !== '—' && v !== '-') chunk.secrets.push(...v.split(/[\s,]+/).filter(Boolean))
    }
  }
  if (!chunk.size) return { ...chunk, error: 'no size (S, M or L)' }
  if (chunk.closes.length + chunk.partial.length === 0) return { ...chunk, error: 'closes or partials no A-ID' }
  if (chunk.needs === null) return { ...chunk, error: 'no `needs` field (write `needs —` when there are none)' }
  const bad = chunk.secrets.filter((n) => !SECRET_NAME.test(n))
  if (bad.length) return { ...chunk, error: `secrets names ${bad.join(', ')}, which is not an env-var name (A-Z, 0-9 and _)` }
  return chunk
}

export function parseSpec(file, text) {
  const num = (path.basename(file).match(SPEC_FILE) || [])[1]
  const secs = sections(text)
  const spec = { file, num, acceptance: [], chunks: [], measure: null, unchunked: false, errors: [] }
  const acc = secs.get('Acceptance')
  const chunks = secs.get('Chunks')
  if (!chunks) spec.errors.push('missing `## Chunks`')
  for (const { n, line } of acc || []) {
    const m = line.match(/^- \*\*(A\d+)\*\*/)
    if (!m) continue
    if (spec.acceptance.some((a) => a.id === m[1])) spec.errors.push(`${file}:${n}: ${m[1]} listed twice`)
    spec.acceptance.push({ id: m[1], n })
  }
  for (const { n, line } of chunks || []) {
    const m = line.match(MEASURE)
    if (m) spec.measure = { open: +m[1], closed: +m[2], next: +m[3], n }
  }
  for (const { n, text: t } of chunkHeaders(chunks || [])) {
    const c = parseChunk(t)
    if (c.error) spec.errors.push(`${file}:${n}: chunk ${c.id || '?'}: ${c.error}`)
    if (c.id) spec.chunks.push({ ...c, n })
  }
  spec.unchunked = spec.chunks.length === 0 && (chunks || []).some(({ line }) => /not chunked yet/i.test(line))
  // Settle takes the heading out with a spec's last A-ID: a spec with no chunk left is told to be absorbed instead.
  if (!acc && (spec.chunks.length || spec.unchunked)) spec.errors.unshift('missing `## Acceptance`')
  return spec
}

// `manifest`: the names nexus.secrets.json declares (a Set), null when
// there is no manifest, or left out to skip the secrets check.
export function checkPlan({ specs, readme, archive, manifest, candidates = null }) {
  const failures = []
  const chunkIds = new Map()
  for (const s of specs) for (const c of s.chunks) {
    if (chunkIds.has(c.id)) failures.push(`${s.file}:${c.n}: chunk ${c.id} also in ${chunkIds.get(c.id)}`)
    else chunkIds.set(c.id, s.file)
  }
  const specNums = new Set(specs.map((s) => s.num))
  for (const s of specs) {
    failures.push(...s.errors)
    const ids = new Set(s.acceptance.map((a) => a.id))
    if (!s.measure) failures.push(`${s.file}: no \`Measure: N open · M closed · next A#\` line under ## Chunks`)
    else {
      const { open, closed, next, n } = s.measure
      if (open !== ids.size) failures.push(`${s.file}:${n}: Measure says ${open} open, ## Acceptance lists ${ids.size}`)
      if (open + closed !== next - 1) failures.push(`${s.file}:${n}: Measure ${open} open + ${closed} closed should equal next A${next} - 1 (IDs are never reused)`)
      for (const a of s.acceptance) {
        if (+a.id.slice(1) >= next) failures.push(`${s.file}:${a.n}: ${a.id} is not below next A${next}`)
      }
    }
    if (s.acceptance.length === 0 && s.chunks.length === 0) {
      failures.push(`${s.file}: nothing left: absorb its lasting rules into identity/ (or bearings.md), delete it, archive "· ${s.num} · spec complete: …"`)
    }
    if (s.chunks.length === 0 && s.acceptance.length > 0 && !s.unchunked) {
      failures.push(`${s.file}: no chunks: chunk it, or write "Not chunked yet." under ## Chunks`)
    }
    const covered = new Set()
    for (const c of s.chunks) {
      if (!new RegExp(`^${s.num}\\.\\d+[a-z0-9]*$`).test(c.id)) failures.push(`${s.file}:${c.n}: chunk id ${c.id} should read ${s.num}.<k>`)
      for (const a of [...c.closes, ...c.partial]) {
        if (!ids.has(a)) failures.push(`${s.file}:${c.n}: chunk ${c.id} names ${a}, which ## Acceptance does not list`)
        covered.add(a)
      }
      for (const need of c.needs || []) {
        if (need === c.id) failures.push(`${s.file}:${c.n}: chunk ${c.id} needs itself`)
        else if (!chunkIds.has(need) && !specNums.has(need)) failures.push(`${s.file}:${c.n}: chunk ${c.id} needs ${need}, which no spec lists (a closed need leaves \`needs\`)`)
      }
    }
    if (s.chunks.length > 0) for (const a of s.acceptance) {
      if (!covered.has(a.id)) failures.push(`${s.file}:${a.n}: ${a.id} is closed or partialed by no chunk`)
    }
    if (manifest !== undefined) for (const c of s.chunks) for (const name of c.secrets || []) {
      if (manifest === null) failures.push(`${s.file}:${c.n}: chunk ${c.id} needs secret ${name}, but there is no ${MANIFEST} (declare it there: node scripts/secrets.mjs import)`)
      else if (!manifest.has(name)) failures.push(`${s.file}:${c.n}: chunk ${c.id} needs secret ${name}, which ${MANIFEST} does not declare`)
    }
  }
  if (specs.length > 0 && readme === null) failures.push('plan/README.md missing: the roadmap must list every spec')
  if (readme !== null) failures.push(...checkRoadmap(specs, readme, chunkIds, specNums))
  if (candidates) failures.push(...fieldUrlProblems(candidates))
  if (archive !== null) {
    let fenced = false
    archive.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return }
      if (fenced || !line.startsWith('- ')) return
      if (!ARCHIVE_LINE.test(line)) failures.push(`ARCHIVE.md:${i + 1}: expected "- YYYY-MM-DD · <id> · <what now works> · <commits>"`)
    })
  }
  return failures
}

// The roadmap: every spec linked, no link to a spec that is gone,
// each row's `N left` true, and the Asap/Held lanes naming only
// chunks (or whole specs) still in the plan.
function checkRoadmap(specs, readme, chunkIds, specNums) {
  const failures = []
  const byName = new Map(specs.map((s) => [path.basename(s.file), s]))
  for (const name of byName.keys()) {
    if (!readme.includes(`](${name})`)) failures.push(`plan/README.md: no link to ${name}`)
  }
  let fenced = false
  let lane = null
  const all = readme.split(/\r?\n/)
  all.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return }
    if (fenced) return
    const at = `plan/README.md:${i + 1}`
    for (const m of line.matchAll(/\]\((\d{2,}-[a-z0-9][a-z0-9-]*\.md)\)/g)) {
      const s = byName.get(m[1])
      if (!s) { failures.push(`${at}: links ${m[1]}, which is not in the plan (a finished spec leaves the table)`); continue }
      const left = line.startsWith('|') && line.match(/\b(\d+) left\b/)
      if (left && !s.unchunked && +left[1] !== s.chunks.length) failures.push(`${at}: says ${left[1]} left, ${m[1]} lists ${s.chunks.length}`)
    }
    const head = line.match(/^\*\*(Asap|Held)\*\*/)
    if (head) { lane = head[1]; return }
    if (/^(\*\*|#|\|)/.test(line)) { lane = null; return }
    const entry = lane && line.match(/^- \*\*([^*]+)\*\*/)
    if (entry && !chunkIds.has(entry[1]) && !specNums.has(entry[1])) {
      failures.push(`${at}: the ${lane} lane names ${entry[1]}, which no spec lists (a closed chunk leaves the lanes)`)
    }
    if (lane === 'Held' && /\bauto-promoted\b/.test(line)) {
      const auto = parseAutoHeld(line)
      if (!auto) failures.push(`${at}: an auto-promoted Held line reads "- NN · auto-promoted, veto until YYYY-MM-DD (#<issue>) · max_age: <n>d · fallback: release"`)
      else if (!specNums.has(auto.spec)) failures.push(`${at}: the Held lane holds spec ${auto.spec} for its veto window, and no spec ${auto.spec} is in the plan (a veto deletes the line with the spec)`)
    } else if (lane === 'Held' && /^- /.test(line) && !/^- \(none/.test(line)) {
      // Every other Held line is a lock, and a lock times out.
      const lock = parseLock(laneText(all, i))
      const missing = [['since', lock.since], ['until', lock.until], ['max_age', lock.maxAge]].filter(([, v]) => v === null).map(([k]) => `\`${k}:\``)
      if (missing.length) failures.push(`${at}: a Held line is a lock that times out, and this one lacks ${missing.join(', ')} (write \`· since: YYYY-MM-DD · until: <date or condition> · max_age: <n>d\`, optionally \`· fallback: <what>\`)`)
    }
  })
  return failures
}

// An auto-promotion's Held line (skills/expand.md, the /march veto
// sweep): the spec it holds, the last day of its veto window, the
// veto issue and its max_age (the window's length).
// scripts/plan/promote.mjs reads it the same way.
export const AUTO_HELD = /^- (\d+) · auto-promoted, veto until (\d{4}-\d{2}-\d{2}) \(#(\d+)\) · max_age: (\d+)d(?: · .*)?$/

export function parseAutoHeld(line) {
  const m = AUTO_HELD.exec(String(line).trim())
  return m ? { spec: m[1].padStart(2, '0'), until: m[2], issue: Number(m[3]), maxAge: Number(m[4]) } : null
}

// A lock (concepts/plan-shape.md, "Locks time out"): a Held line, a
// lane lock or an owner-blocked row, its fields joined by ` · `:
// `lock: <slug>` (outside the Held lane, whose id names it),
// `since: YYYY-MM-DD` (the day it was set), `until: <date or
// condition>`, `max_age: <n>d` and an optional `fallback: <what the
// loop does past max_age>`. An auto-promoted Held line's `veto until
// <date>` is its until, and its since is that date less its max_age.
// A missing or malformed field reads null. scripts/plan/locks.mjs
// reads locks through this.
const LOCK_FIELD = /^(?:[-*]\s+)?(?:\*\*[^*]+\*\*\s*)?(?:\[[^\]]*\]\s*)*(lock|since|until|max_age|fallback):\s*(.*?)\s*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseLock(text) {
  const fields = {}
  for (const part of String(text).trim().split(/\s+·\s+/)) {
    const m = LOCK_FIELD.exec(part.trim())
    if (m && !(m[1] in fields) && m[2]) fields[m[1]] = m[2]
  }
  const age = /^(\d+)d$/.exec(fields.max_age || '')
  const lock = {
    slug: fields.lock || null,
    since: ISO_DATE.test(fields.since || '') ? fields.since : null,
    until: fields.until || null,
    maxAge: age ? Number(age[1]) : null,
    fallback: fields.fallback || null,
    auto: null,
  }
  const auto = parseAutoHeld(text)
  if (auto) {
    const since = new Date(Date.parse(`${auto.until}T00:00:00Z`) - auto.maxAge * 86400000).toISOString().slice(0, 10)
    Object.assign(lock, { until: auto.until, maxAge: auto.maxAge, since, auto })
  }
  lock.untilDate = ISO_DATE.test(lock.until || '') ? lock.until : null
  return lock
}

// A list line with its wrapped continuation (the lines after it
// indented two or more spaces that are not sub-bullets), joined.
export function laneText(lines, i) {
  let text = lines[i]
  for (let j = i + 1; j < lines.length && /^ {2,}\S/.test(lines[j]) && !/^\s*[-*] /.test(lines[j]); j++) text += ` ${lines[j].trim()}`
  return text
}

export function archived(archive, id) {
  const esc = id.replace(/\./g, '\\.')
  return new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${esc}(?: \\([^)]*\\))? · `, 'm').test(archive || '')
}

export function checkHistory(before, after, archive, pendingIds = new Set()) {
  const failures = []
  const nowChunks = new Set(after.flatMap((s) => s.chunks.map((c) => c.id)))
  const nowSpecs = new Map(after.map((s) => [s.num, s]))
  const accounted = (id) => nowChunks.has(id) || pendingIds.has(id) || archived(archive, id)
  // A split keeps the parent's id as a prefix (07.3 → 07.3a, 07.3b):
  // the parent is accounted for while any child is.
  const splitInto = (id) => {
    const esc = id.replace(/\./g, '\\.')
    const child = new RegExp(`^${esc}[a-z]+$`)
    const archivedChild = new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${esc}[a-z]+(?: \\([^)]*\\))? · `, 'm')
    return [...nowChunks, ...pendingIds].some((x) => child.test(x)) || archivedChild.test(archive || '')
  }
  for (const s of before) {
    for (const c of s.chunks) {
      if (accounted(c.id) || splitInto(c.id)) continue
      failures.push(`chunk ${c.id} left the plan with no ARCHIVE.md line (or plan/pending/${c.id}.md)`)
    }
    const now = nowSpecs.get(s.num)
    if (!now) {
      // A vetoed auto-promotion leaves too, unchunked: "spec vetoed".
      if (!new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${s.num} · spec (complete|vetoed)`, 'm').test(archive || '')) {
        failures.push(`${s.file} was deleted with no "· ${s.num} · spec complete: …" (or "spec vetoed: …") archive line`)
      }
      continue
    }
    if (s.measure && now.measure) {
      if (now.measure.next < s.measure.next) failures.push(`${now.file}: next A${now.measure.next} went backwards (was A${s.measure.next})`)
      if (now.measure.closed < s.measure.closed) failures.push(`${now.file}: closed ${now.measure.closed} went backwards (was ${s.measure.closed})`)
      const had = new Set(s.acceptance.map((a) => a.id))
      for (const a of now.acceptance) {
        if (!had.has(a.id) && +a.id.slice(1) < s.measure.next) failures.push(`${now.file}:${a.n}: ${a.id} reuses a retired A-ID (next was A${s.measure.next})`)
      }
    }
  }
  return failures
}

// --- field candidates (spec 59) --------------------------------------------
// The field-research generator (scripts/generators/research.mjs) files
// candidates that describe a pattern seen in the wider tooling. Their
// sources go in the tick's job summary only: a field candidate (or a
// field re-evidence line) that carries a URL or a bare domain fails.

export const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(?:com|io|ai|dev|org|net|co|app)\b/i

/** The URLs (and bare domains) in a text: [] when it carries none. The gate's check on a field candidate. */
export function urls(text = '') {
  const out = []
  for (const m of String(text).matchAll(/\bhttps?:\/\/\S+|\bwww\.\S+/gi)) out.push(m[0])
  for (const m of String(text).matchAll(new RegExp(DOMAIN_RE.source, 'gi'))) if (!out.some((u) => u.includes(m[0]))) out.push(m[0])
  return out
}

/**
 * Every problem a candidates file's field text carries: a field candidate (one whose source signals read `field (`)
 * holding a URL anywhere in its row, or a `· field ·` re-evidence line holding one. The gate fails each.
 */
export function fieldUrlProblems(text = '', label = 'plan/CANDIDATES.md') {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const problems = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^### /.test(lines[i])) continue
    let end = lines.findIndex((l, j) => j > i && /^#{2,3} /.test(l))
    if (end < 0) end = lines.length
    const body = lines.slice(i, end)
    const fieldRow = body.some((l) => /^- source signals:.*\bfield \(\d{4}-\d{2}-\d{2}\)/.test(l))
    body.forEach((l, k) => {
      if (!fieldRow && !/ · field · /.test(l)) return
      const u = urls(l)
      if (u.length) problems.push(`${label}:${i + k + 1}: a field candidate carries a URL (${u[0].slice(0, 60)}); sources go in the tick's job summary, never the plan`)
    })
  }
  return problems
}

// --- I/O -------------------------------------------------------------------

// `readFile(name)` reads one file of the folder (null when it isn't
// there): the files as they stand unless a reader is given.
export function loadPlanDir(dirAbs, label = 'plan', readFile = null) {
  const disk = (f) => { try { return fs.readFileSync(path.join(dirAbs, f), 'utf-8') } catch { return null } }
  const read = readFile || disk
  const files = fs.existsSync(dirAbs) ? fs.readdirSync(dirAbs).filter((f) => SPEC_FILE.test(f)) : []
  return {
    specs: files.map((f) => parseSpec(`${label}/${f}`, read(f))),
    readme: read('README.md'),
    archive: read('ARCHIVE.md'),
    candidates: read('CANDIDATES.md'),
    // A pending close (plan/pending/, scripts/plan/pending.mjs) counts
    // as closed: by its file name (`<chunk id>.md`) or its `close:` line.
    pendingIds: new Set(fs.existsSync(path.join(dirAbs, 'pending'))
      ? fs.readdirSync(path.join(dirAbs, 'pending')).filter((f) => f.endsWith('.md') && f !== 'README.md').flatMap((f) => {
          const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(disk(`pending/${f}`) ?? '')
          const close = fm && /^close:[ \t]*(\S+)/m.exec(fm[1])
          return close ? [f.slice(0, -3), close[1]] : [f.slice(0, -3)]
        })
      : []),
  }
}

export function loadPlanAtRef(repoAbs, ref, dirRel, label = dirRel) {
  const git = (...args) => execFileSync('git', args, { cwd: repoAbs, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  // A typo'd ref must not read as "no plan then" (that would skip
  // every history rule and pass). Only an unborn HEAD (a repo with
  // no commit yet) has no history to check.
  try { git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`) } catch {
    let unborn = false
    try { git('rev-parse', '--verify', '--quiet', 'HEAD') } catch { unborn = ref === 'HEAD' }
    if (unborn) return []
    throw new Error(`--since ${ref}: not a commit in this repo`)
  }
  let names
  try { names = git('ls-tree', '--name-only', `${ref}:${dirRel}`).split(/\r?\n/).filter(Boolean) } catch { return [] }
  return names.filter((f) => SPEC_FILE.test(f)).map((f) => parseSpec(`${label}/${f}`, git('show', `${ref}:${dirRel}/${f}`)))
}

export function runCheck({ repoAbs, dirRel = 'plan', since = null }) {
  const label = dirRel.replace(/\\/g, '/')
  // Only the folder plan/pending/ sits in reads through the settled
  // view: another plan folder (a template's) takes none of its edits.
  const settled = path.posix.normalize(label) === path.posix.dirname(PENDING_DIR)
  const view = settled ? settledView(repoAbs, { only: (p) => p.startsWith(`${label}/`) }) : null
  const now = loadPlanDir(path.join(repoAbs, dirRel), label, view && ((f) => view.read(`${label}/${f}`)))
  // The secrets manifest sits beside the plan folder (the repo root
  // for plan/): its shape problems are gate failures too.
  const manifestRel = path.posix.join(path.posix.dirname(label), MANIFEST)
  const read = readManifest(path.join(repoAbs, manifestRel))
  const failures = [...(view ? view.problems : []), ...(read ? read.problems.map((p) => `${manifestRel}: ${p}`) : []), ...checkPlan({ ...now, manifest: read ? read.names : null })]
  if (since) {
    try { failures.push(...checkHistory(loadPlanAtRef(repoAbs, since, label), now.specs, now.archive, now.pendingIds)) } catch (err) { failures.push(err.message) }
  }
  const chunks = now.specs.reduce((n, s) => n + s.chunks.length, 0)
  return { failures, note: `${now.specs.length} specs, ${chunks} chunks` }
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
  const repoAbs = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
  const { failures, note } = runCheck({ repoAbs, dirRel: opt('--dir') || 'plan', since: opt('--since') })
  if (failures.length === 0) {
    process.stdout.write(`plan-check: green (${note})\n`)
    process.exit(0)
  }
  for (const f of failures) process.stdout.write(`  ${f}\n`)
  process.stdout.write(`plan-check: RED (${failures.length})\n`)
  process.exit(1)
}

// fileURLToPath, not URL.pathname: a checkout path with a space
// (or any percent-encoded character) must still run main(), or the
// gate exits 0 having checked nothing.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
