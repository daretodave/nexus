#!/usr/bin/env node
// scripts/plan-check.mjs — the plan-shape gate.
//
// The plan is specs, chunks and acceptance IDs (A-IDs). The rules
// that keep it honest are mechanical, so this script checks them
// instead of trusting every writer to remember them:
//
//   - every spec (`plan/NN-<slug>.md`) has `## Acceptance`,
//     `## Chunks` and a `Measure: N open · M closed · next A#` line
//   - the Measure line is true: open = A-IDs listed, and
//     open + closed = next - 1 (IDs are never renumbered or reused)
//   - every chunk line parses: `- [ ] **NN.k** <title> · S|M|L ·
//     closes A1, A2 · needs —` (`partial` instead of, or beside,
//     `closes`); its id belongs to its spec and is unique
//   - every A-ID a chunk names exists, and once a spec is chunked
//     every A-ID is covered by some chunk
//   - every `needs` names a chunk (or a whole spec) still in the plan
//   - a spec with nothing left is flagged: absorb it and delete it
//   - plan/README.md links every spec; ARCHIVE.md lines parse
//
// With `--since <ref>` it also checks history against that ref:
// a chunk that left the plan has an archive line (or a pending
// close in plan/pending/), a deleted spec has its "spec complete"
// line, and no spec's `next A#` or closed count went backwards or
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
  const chunk = { id: m[2], title: fields[0], size: null, closes: [], partial: [], needs: null }
  for (const f of fields.slice(1)) {
    if (/^(S|M|L)$/.test(f)) chunk.size = f
    else if (f.startsWith('closes ')) chunk.closes.push(...idList(f.slice(7)))
    else if (f.startsWith('partial ')) chunk.partial.push(...idList(f.slice(8)))
    else if (f.startsWith('needs ')) {
      const v = f.slice(6).trim()
      chunk.needs = v === '—' || v === '-' ? [] : idList(v)
    }
  }
  if (!chunk.size) return { ...chunk, error: 'no size (S, M or L)' }
  if (chunk.closes.length + chunk.partial.length === 0) return { ...chunk, error: 'closes or partials no A-ID' }
  if (chunk.needs === null) return { ...chunk, error: 'no `needs` field (write `needs —` when there are none)' }
  return chunk
}

export function parseSpec(file, text) {
  const num = (path.basename(file).match(SPEC_FILE) || [])[1]
  const secs = sections(text)
  const spec = { file, num, acceptance: [], chunks: [], measure: null, unchunked: false, errors: [] }
  const acc = secs.get('Acceptance')
  const chunks = secs.get('Chunks')
  if (!acc) spec.errors.push('missing `## Acceptance`')
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
  return spec
}

export function checkPlan({ specs, readme, archive }) {
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
  }
  if (specs.length > 0) {
    if (readme === null) failures.push('plan/README.md missing: the roadmap must list every spec')
    else for (const s of specs) {
      if (!readme.includes(`](${path.basename(s.file)})`)) failures.push(`plan/README.md: no link to ${path.basename(s.file)}`)
    }
  }
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

export function archived(archive, id) {
  const esc = id.replace(/\./g, '\\.')
  return new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${esc}(?: \\([^)]*\\))? · `, 'm').test(archive || '')
}

export function checkHistory(before, after, archive, pendingIds = new Set()) {
  const failures = []
  const nowChunks = new Set(after.flatMap((s) => s.chunks.map((c) => c.id)))
  const nowSpecs = new Map(after.map((s) => [s.num, s]))
  for (const s of before) {
    for (const c of s.chunks) {
      if (nowChunks.has(c.id) || pendingIds.has(c.id) || archived(archive, c.id)) continue
      failures.push(`chunk ${c.id} left the plan with no ARCHIVE.md line (or plan/pending/${c.id}.md)`)
    }
    const now = nowSpecs.get(s.num)
    if (!now) {
      if (!new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${s.num} · spec complete`, 'm').test(archive || '')) {
        failures.push(`${s.file} was deleted with no "· ${s.num} · spec complete: …" archive line`)
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

// --- I/O -------------------------------------------------------------------

export function loadPlanDir(dirAbs, label = 'plan') {
  const read = (f) => { try { return fs.readFileSync(path.join(dirAbs, f), 'utf-8') } catch { return null } }
  const files = fs.existsSync(dirAbs) ? fs.readdirSync(dirAbs).filter((f) => SPEC_FILE.test(f)) : []
  return {
    specs: files.map((f) => parseSpec(`${label}/${f}`, read(f))),
    readme: read('README.md'),
    archive: read('ARCHIVE.md'),
    pendingIds: new Set(fs.existsSync(path.join(dirAbs, 'pending'))
      ? fs.readdirSync(path.join(dirAbs, 'pending')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
      : []),
  }
}

export function loadPlanAtRef(repoAbs, ref, dirRel, label = dirRel) {
  const git = (...args) => execFileSync('git', args, { cwd: repoAbs, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  let names
  try { names = git('ls-tree', '--name-only', `${ref}:${dirRel}`).split(/\r?\n/).filter(Boolean) } catch { return [] }
  return names.filter((f) => SPEC_FILE.test(f)).map((f) => parseSpec(`${label}/${f}`, git('show', `${ref}:${dirRel}/${f}`)))
}

export function runCheck({ repoAbs, dirRel = 'plan', since = null }) {
  const label = dirRel.replace(/\\/g, '/')
  const now = loadPlanDir(path.join(repoAbs, dirRel), label)
  const failures = checkPlan(now)
  if (since) failures.push(...checkHistory(loadPlanAtRef(repoAbs, since, label), now.specs, now.archive, now.pendingIds))
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) main()
