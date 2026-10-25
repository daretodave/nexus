#!/usr/bin/env node
// scripts/upgrade-plan.mjs — the v1 to v2 plan converter.
//
// A v1 plan is a build plan (`plan/steps/01_build_plan.md`: a
// status block of `Phase N` rows, carry-overs and a phase log)
// plus one brief per phase (`plan/phases/phase_<N>_<topic>.md`).
// A v2 plan is specs, chunks and acceptance IDs
// (nexus/concepts/plan-shape.md). This script does the mechanical
// half of nexus/playbooks/upgrade.md Step 4:
//
//   - `[x]` rows (and `[-]` partial rows) and phase-log entries
//     become ARCHIVE.md lines: `- <date> · <NN> · <title> · <sha>`,
//     the date from git (`%as` of the row's commit; a
//     `(this commit)` row takes the commit that ticked it). A
//     letter-suffixed phase (`Phase 15a`) archives under its
//     parent number with the suffix leading its title
//     (`· 15 · 15a: …`); an open one becomes a stub spec at the
//     next free number, with a warning
//   - a ship sha is read from `(commit <sha>)`, a range
//     (`a..b`, `a → b`), an `a + b` pair (archived `a..b`), a
//     trailing backtick sha or a lone sha; the phase log may be
//     bulleted or bare `phase N[a] — <sha> — <summary>` lines
//   - a missing ARCHIVE.md starts from an empty archive
//   - `[skipped]` rows become `- <today> · <NN> · dropped: … ·
//     (this commit)`
//   - `[ ]` rows become spec stubs `plan/<NN>-<slug>.md`: the
//     brief (or the per-phase scope) folded into Design, one
//     acceptance ID, `Not chunked yet.`, and a roadmap row
//   - `[blocked: <reason> <date>]` rows become a spec stub too,
//     plus a Held line `- **<NN>** · blocked: <reason> · since:
//     <date> · until: the owner unblocks it · max_age: 14d`
//
// It never deletes the v1 files (Step 5 does) and never touches
// an existing spec or archive line, so a second run adds nothing.
// The result is checked with plan-check before anything is
// written; a red result writes nothing.
//
//   node scripts/upgrade-plan.mjs              # dry run: prints what it would write
//   node scripts/upgrade-plan.mjs --write      # writes it
//   node scripts/upgrade-plan.mjs --dir plan   # another plan folder
//
// Run it from the repo root (or from nexus:
// `node ../nexus/templates/scripts/upgrade-plan.mjs`). Exit 0 =
// green, 1 = refused or red. No dependencies, no network; git is
// read locally. The pure functions are exported for tests.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPEC_FILE, parseSpec, checkPlan, archived } from './plan-check.mjs'

const SHA = '[0-9a-f]{7,40}'
const pad = (n) => String(n).padStart(2, '0')

// "## Heading" → its lines (fences kept as text; headings inside a
// fence are not headings).
function sectionsOf(text) {
  const out = new Map()
  let current = null
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const h = !fenced && line.match(/^## (.+?)\s*$/)
    if (h) { current = h[1]; out.set(current, []); continue }
    if (current) out.get(current).push(line)
  }
  return out
}

const find = (secs, re) => { for (const [k, v] of secs) if (re.test(k)) return v; return null }

// Bullets with their wrapped continuation lines joined.
function bullets(lines) {
  const out = []
  for (const line of lines || []) {
    if (/^- /.test(line)) out.push(line.trim())
    else if (out.length && /^\s+\S/.test(line) && !/^\s+- /.test(line)) out[out.length - 1] += ` ${line.trim()}`
    else if (!/^\s*$/.test(line) || out.length) out.push(null)
  }
  return out.filter(Boolean)
}

// A ship sha: a range (`a..b`, `a → b`) or an `a + b` pair, else
// `(commit <sha>)`, a trailing backtick sha, or a lone sha.
// Backticks around a sha are allowed everywhere.
const TICKED = `\`?(${SHA})\`?`
const RANGE = new RegExp(`(?:^|[\\s(\`])${TICKED}\\s*(?:→|->|\\.\\.|\\+)\\s*${TICKED}(?=$|[\\s).,;:\`])`)
const COMMIT = new RegExp(`\\(commit ${TICKED}\\)`)
const TRAILING = new RegExp(`\`(${SHA})\`[\\s).,;]*$`)
const LONE = new RegExp(`^${TICKED}$`)
export function shasIn(text) {
  const range = text.match(RANGE)
  if (range) return [range[1], range[2]]
  const one = text.match(COMMIT) || text.match(TRAILING) || text.match(LONE)
  return one ? [one[1]] : []
}

// A row's title: a trailing backtick sha off, cut at the first
// " — ", ". " or " (", then any parenthetical left out.
export function cleanTitle(raw) {
  const bare = raw.replace(TRAILING, '').replace(/[\s—–-]+$/, '').trim()
  let t = (bare || raw).split(/\s+—\s+|\.\s|\s\(/)[0]
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(/\s*\([^()]*\)/g, '') }
  t = t.replace(/[\s.;:,]+$/, '').trim()
  return t || raw.replace(/[\s.;:,]+$/, '').trim()
}

const words = (t, n) => t.split(/\s+/).slice(0, n).join(' ').replace(/[;:,]+$/, '')

// The phase log's entries, bulleted (`- phase N — sha — summary`)
// or bare (`phase N — sha — summary`), wrapped lines joined.
function logEntries(lines) {
  const out = []
  for (const line of lines || []) {
    if (/^(?:- )?phase \d/i.test(line)) out.push(line.trim().replace(/^- /, ''))
    else if (out.length && /^\s+\S/.test(line) && !/^\s+- /.test(line)) out[out.length - 1] += ` ${line.trim()}`
    else if (out.length) out.push(null)
  }
  return out.filter(Boolean)
}

// A phase id: its number plus an optional letter suffix (`15a`).
const idOf = (num, suffix) => `${+num}${suffix || ''}`
const byIdOrder = (a, b) => (a.num - b.num) || (a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0)

export function parseBuildPlan(text) {
  const secs = sectionsOf(text)
  const rows = []
  const unparsed = []
  let listed = 0
  for (const b of bullets(find(secs, /^Status/))) {
    if (!/^- \[/.test(b)) continue
    listed++
    const m = b.match(/^- \[([^\]]*)\]\s*Phase (\d+)([a-z]?)\s*[—–:-]\s*(.*)$/)
    if (!m) { unparsed.push(b); continue }
    const [, mark, num, suffix, rest] = m
    const row = { id: idOf(num, suffix), num: +num, suffix, raw: rest, title: cleanTitle(rest), shas: shasIn(rest), status: null, reason: null, date: null }
    if (mark === 'x') row.status = 'done'
    else if (mark === ' ') row.status = 'open'
    else if (mark === '-') row.status = 'partial'
    else if (/^skipped/.test(mark)) { row.status = 'skipped'; row.reason = mark.replace(/^skipped:?\s*/, '') || null }
    else if (/^blocked/.test(mark)) {
      row.status = 'blocked'
      const r = mark.replace(/^blocked:?\s*/, '')
      const d = r.match(/^(.*?)\s*(\d{4}-\d{2}-\d{2})$/)
      row.reason = (d ? d[1] : r) || 'blocked'
      row.date = d ? d[2] : null
    } else { unparsed.push(b); continue }
    rows.push(row)
  }
  const log = new Map()
  for (const e of logEntries(find(secs, /^Phase log/))) {
    const m = e.match(/^phase (\d+)([a-z]?)\s+[—–-]\s+(.+?)\s+[—–-]\s+(.*)$/i)
    if (!m) continue
    const id = idOf(m[1], m[2])
    if (!log.has(id)) log.set(id, { id, num: +m[1], suffix: m[2], shas: shasIn(m[3].trim()), summary: m[4].trim() })
  }
  const scopes = new Map()
  const scope = find(secs, /^Per-phase scope/)
  if (scope) {
    let cur = null
    for (const line of scope) {
      const h = line.match(/^### Phase (\d+)([a-z]?)\b/)
      if (h) { cur = idOf(h[1], h[2]); scopes.set(cur, []); continue }
      if (/^---\s*$/.test(line)) { cur = null; continue }
      if (cur !== null) scopes.get(cur).push(line)
    }
    for (const [k, v] of scopes) scopes.set(k, v.join('\n').trim())
  }
  const carryOvers = bullets(find(secs, /^Carry-overs/)).length
  return { rows, log, scopes, carryOvers, listed, unparsed }
}

function slug(title, num) {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').filter(Boolean).slice(0, 4).join('-')
  return s || `phase-${num}`
}

// The brief folded into Design: its title line out, every heading
// one level down so none reads as a spec section.
function foldBrief(text) {
  let fenced = false
  const out = []
  let titled = false
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && !titled && /^# /.test(line)) { titled = true; continue }
    out.push(!fenced && /^#{1,5} /.test(line) ? `#${line}` : line)
  }
  return out.join('\n').trim()
}

// The row's own text past its title: what the v1 status line said
// the phase covers.
function inlineScope(row) {
  let rest = row.raw.replace(/\s+/g, ' ').trim()
  if (rest.startsWith(row.title)) rest = rest.slice(row.title.length)
  rest = rest.replace(/^[\s.;:,—–-]+/, '').trim()
  return /[a-z]{3}/i.test(rest) ? rest : ''
}

function specStub(row, nn, brief, scope, today) {
  const why = [scope || `Phase ${row.id} of the v1 build plan: ${row.title}.`]
  if (row.status === 'blocked') why.push(`Blocked${row.date ? ` since ${row.date}` : ''}: ${row.reason}. It waits in the roadmap's Held lane.`)
  const inline = inlineScope(row)
  const design = [...(brief ? [foldBrief(brief)] : []), ...(inline ? [`The v1 row's scope: ${inline}`] : [])]
  return `# ${nn} — ${row.title}

> ${row.title}.

Converted from v1 phase ${row.id} by \`scripts/upgrade-plan.mjs\`
on ${today}. Before building it: map the brief across
(nexus/playbooks/upgrade.md Step 4), give each observable
outcome its own acceptance ID, and chunk it.

## Why

${why.join('\n\n')}

## Design

${design.length ? design.join('\n\n') : '(No v1 brief: decide the design before chunking.)'}

## Acceptance

- **A1** ${row.title}: done as v1 phase ${row.id} described.

## Open questions

(None.)

## Chunks
Measure: 1 open · 0 closed · next A2

Not chunked yet.
`
}

// The roadmap: rows for specs that exist (or are new) stay, the
// template's placeholder rows go, new rows append; Held lines join
// the Held lane.
function updateRoadmap(readme, keep, newRows, held) {
  const lines = readme.replace(/\r\n/g, '\n').split('\n')
  const specsAt = lines.findIndex((l) => /^## Specs\s*$/.test(l))
  const headAt = specsAt === -1 ? -1 : lines.findIndex((l, i) => i > specsAt && /^\|\s*#\s*\|/.test(l))
  if (headAt === -1 || !/^\|[-\s|:]+\|\s*$/.test(lines[headAt + 1] || '')) {
    throw new Error('plan/README.md has no v2 spec table (`## Specs` with a `| # |` header): do nexus/playbooks/upgrade.md Step 3 first')
  }
  let end = headAt + 2
  while (end < lines.length && /^\|/.test(lines[end])) end++
  const kept = lines.slice(headAt + 2, end).filter((l) => {
    const link = l.match(/\]\((\d{2,}-[a-z0-9][a-z0-9-]*\.md)\)/)
    return link && keep.has(link[1])
  })
  lines.splice(headAt + 2, end - headAt - 2, ...kept, ...newRows)
  if (held.length) {
    const laneAt = lines.findIndex((l) => /^\*\*Held\*\*/.test(l))
    if (laneAt === -1) throw new Error('plan/README.md has no **Held** lane: do nexus/playbooks/upgrade.md Step 3 first')
    let i = laneAt + 1
    while (i < lines.length && !/^- /.test(lines[i]) && !/^(\*\*|#)/.test(lines[i])) i++
    if (i < lines.length && /^- /.test(lines[i])) {
      let j = i
      while (j < lines.length && /^- /.test(lines[j])) j++
      const current = lines.slice(i, j).filter((l) => !/^- \(none/.test(l))
      lines.splice(i, j - i, ...current, ...held.filter((h) => !current.includes(h)))
    } else {
      lines.splice(laneAt + 1, 0, '', ...held)
    }
  }
  return lines.join('\n')
}

// convert(): the whole conversion, pure. `git` answers
// dateOf(sha) → 'YYYY-MM-DD' | null and flipOf(id) → { sha, date }
// | null (the commit that ticked the row; id is `15` or `15a`).
// `existing` is the specs already in the plan folder:
// [{ name, text }]. A null `archive` (no ARCHIVE.md yet) starts
// from an empty one.
export const EMPTY_ARCHIVE = `# Archive

> Append-only: one line per finished chunk, added in the commit
> that closes it. Never edited or reordered.

---

`

export function convert({ buildPlan, briefs = {}, readme, archive, existing = [], git, today, label = 'plan' }) {
  if (readme === null || readme === undefined) throw new Error(`${label}/README.md missing: do nexus/playbooks/upgrade.md Step 3 first`)
  const created = archive === null || archive === undefined
  if (created) archive = EMPTY_ARCHIVE
  const { rows, log, scopes, carryOvers, listed, unparsed } = parseBuildPlan(buildPlan)
  const warnings = []
  if (listed !== rows.length) {
    const named = unparsed.map((b) => `"${b.length > 72 ? `${b.slice(0, 69)}...` : b}"`).join(', ')
    warnings.push(`Status lists ${listed} row(s) but ${rows.length} parsed; not converted: ${named || '(none named)'}`)
  }
  // The template archive's example lines sit in a fence: they are not history.
  let fenced = false
  const live = archive.split(/\r?\n/).filter((l) => { if (/^\s*(```|~~~)/.test(l)) { fenced = !fenced; return false } return !fenced }).join('\n')
  // A plain phase's line is `· NN · <title>`; a suffixed one's is
  // `· NN · 15a: <title>`, so neither hides the other.
  const isArchived = (p) => (p.suffix
    ? new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${pad(p.num)} · ${p.id}: `, 'm').test(live)
    : archived(live.split('\n').filter((l) => !/^- \S+ · \d+ · \d+[a-z]: /.test(l)).join('\n'), pad(p.num)))
  const byId = new Map()
  for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r)
  const existingNums = new Map(existing.map((s) => [+(s.name.match(SPEC_FILE) || [])[1], s.name]))
  const converted = (id) => existing.some((s) => new RegExp(`^Converted from v1 phase ${id} by`, 'm').test(s.text || ''))
  const briefFor = (id) => {
    const f = Object.keys(briefs).find((b) => new RegExp(`^phase_0*${id}_.*\\.md$`).test(b))
    return f ? briefs[f] : null
  }
  // The next free spec number: past every phase, spec and archive line.
  let free = Math.max(0, ...rows.map((r) => r.num), ...[...log.values()].map((e) => e.num), ...existingNums.keys(),
    ...[...live.matchAll(/^- \S+ · (\d+) · /gm)].map((m) => +m[1])) + 1
  const tag = (p) => `${pad(p.num)}${p.suffix}`
  const titled = (p, t) => (p.suffix ? `${p.id}: ${t}` : t)

  // Archive lines: one per shipped phase, never two.
  const lines = []
  const seen = new Set()
  const shipped = [...rows.filter((r) => r.status === 'done' || r.status === 'partial'),
    ...[...log.values()].filter((e) => !byId.has(e.id))]
  for (const p of shipped) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const nn = pad(p.num)
    if (isArchived(p)) continue
    const row = byId.get(p.id)
    const entry = log.get(p.id)
    const title = titled(p, words(row ? row.title : cleanTitle(entry.summary), 10))
    let shas = row?.shas.length ? row.shas : entry?.shas || []
    let date = null
    if (shas.length) date = git.dateOf(shas[shas.length - 1])
    if (!date) {
      const flip = git.flipOf(p.suffix ? p.id : p.num)
      if (flip) { date = flip.date; if (!shas.length) shas = [flip.sha] }
    }
    if (!shas.length) warnings.push(`${tag(p)}: shipped, but no commit in the row, the log or the history; archived as "unknown": put the sha in by hand`)
    if (!date) date = today
    if (row?.status === 'partial') warnings.push(`${tag(p)}: shipped partial ([-]); its carry-overs need an acceptance ID in a spec or a plan/AUDIT.md row`)
    lines.push({ date, p, text: `- ${date} · ${nn} · ${title} · ${shas.length ? shas.join('..') : 'unknown'}` })
  }
  for (const r of rows.filter((x) => x.status === 'skipped')) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (isArchived(r)) continue
    lines.push({ date: today, p: r, text: `- ${today} · ${pad(r.num)} · ${titled(r, `dropped: ${words(r.reason || r.title, 9)}`)} · (this commit)` })
  }
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byIdOrder(a.p, b.p)))
  if (carryOvers) warnings.push(`${carryOvers} carry-over bullet(s) in the build plan: each becomes an acceptance ID in its spec or a plan/AUDIT.md row, by hand`)

  // Spec stubs, roadmap rows, Held lines. A suffixed open phase
  // takes the next free number: its parent's may be a spec already.
  const files = []
  const newRows = []
  const held = []
  for (const r of rows.filter((x) => x.status === 'open' || x.status === 'blocked')) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (r.suffix ? converted(r.id) : existingNums.has(r.num)) continue
    const num = r.suffix ? free++ : r.num
    const nn = pad(num)
    if (r.suffix) warnings.push(`${tag(r)}: an open letter-suffixed phase; its stub spec is ${nn} (the next free number), not ${pad(r.num)}`)
    const name = `${nn}-${slug(r.title, num)}.md`
    files.push({ path: `${label}/${name}`, kind: 'new', content: specStub(r, nn, briefFor(r.id), scopes.get(r.id), today) })
    newRows.push(`| ${num} | ${r.title.replace(/\|/g, '/')} | [${name}](${name}) | ${r.status === 'blocked' ? 'held' : 'planned'} | not chunked |`)
    // A Held line is a lock that times out (concepts/plan-shape.md):
    // aged from the day it blocked, so an old block asks the owner.
    if (r.status === 'blocked') held.push(`- **${nn}** · blocked: ${r.reason} · since: ${r.date || today} · until: the owner unblocks it · max_age: 14d`)
  }

  const keep = new Set([...existing.map((s) => s.name), ...files.map((f) => path.basename(f.path))])
  const nextReadme = updateRoadmap(readme, keep, newRows, held)
  if (nextReadme !== readme.replace(/\r\n/g, '\n')) files.push({ path: `${label}/README.md`, kind: 'update', content: nextReadme })
  if (lines.length) {
    if (created) warnings.push(`${label}/ARCHIVE.md was missing: it is created with the converted lines`)
    const base = archive.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')
    files.push({ path: `${label}/ARCHIVE.md`, kind: 'append', added: lines.map((l) => l.text), content: `${base}${lines.map((l) => `${l.text}\n`).join('')}` })
  }

  // The result, checked as plan-check would see it.
  const written = new Map(files.map((f) => [f.path, f.content]))
  const specs = [
    ...existing.filter((s) => !written.has(`${label}/${s.name}`)).map((s) => parseSpec(`${label}/${s.name}`, s.text)),
    ...files.filter((f) => f.kind === 'new').map((f) => parseSpec(f.path, f.content)),
  ]
  const failures = checkPlan({
    specs,
    readme: written.get(`${label}/README.md`) ?? readme,
    archive: written.get(`${label}/ARCHIVE.md`) ?? archive,
  })
  return { files, warnings, failures }
}

// --- I/O -------------------------------------------------------------------

export function gitReader(repoAbs, buildPlanRel) {
  const git = (...args) => { try { return execFileSync('git', args, { cwd: repoAbs, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  return {
    dateOf: (sha) => git('show', '-s', '--format=%as', `${sha}^{commit}`) || null,
    flipOf: (n) => {
      const first = git('log', '--reverse', '--format=%h %as', '-G', `\\[x\\] Phase ${n} `, '--', buildPlanRel).split(/\r?\n/)[0]
      const m = first && first.match(/^(\S+) (\d{4}-\d{2}-\d{2})$/)
      return m ? { sha: m[1], date: m[2] } : null
    },
  }
}

export function run({ repoAbs, dirRel = 'plan', write = false, today = new Date().toISOString().slice(0, 10), git = null }) {
  const label = dirRel.replace(/\\/g, '/')
  const dirAbs = path.join(repoAbs, dirRel)
  const read = (rel) => { try { return fs.readFileSync(path.join(dirAbs, rel), 'utf-8') } catch { return null } }
  const buildPlanRel = `${label}/steps/01_build_plan.md`
  const buildPlan = read('steps/01_build_plan.md')
  if (buildPlan === null) throw new Error(`${buildPlanRel} not found: this is not a v1 plan (or it was already converted)`)
  const phasesAbs = path.join(dirAbs, 'phases')
  const briefs = Object.fromEntries((fs.existsSync(phasesAbs) ? fs.readdirSync(phasesAbs) : [])
    .filter((f) => f.endsWith('.md')).map((f) => [f, fs.readFileSync(path.join(phasesAbs, f), 'utf-8')]))
  const existing = (fs.existsSync(dirAbs) ? fs.readdirSync(dirAbs) : []).filter((f) => SPEC_FILE.test(f)).map((name) => ({ name, text: read(name) }))
  const result = convert({
    buildPlan, briefs, readme: read('README.md'), archive: read('ARCHIVE.md'), existing,
    git: git || gitReader(repoAbs, buildPlanRel), today, label,
  })
  if (write && result.failures.length === 0) {
    for (const f of result.files) fs.writeFileSync(path.join(repoAbs, f.path), f.content)
  }
  return result
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
  const write = args.includes('--write')
  const out = (s) => process.stdout.write(`${s}\n`)
  let result
  try {
    const repoAbs = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
    result = run({ repoAbs, dirRel: opt('--dir') || 'plan', write })
  } catch (err) {
    process.stderr.write(`upgrade-plan: ${err.message}\n`)
    process.exit(1)
  }
  const { files, warnings, failures } = result
  out(write ? 'upgrade-plan: writing' : 'upgrade-plan: dry run (nothing written; --write writes)')
  for (const f of files) {
    if (f.kind === 'append') { out(`\n--- ${f.path} (append ${f.added.length})`); for (const l of f.added) out(l) }
    else { out(`\n--- ${f.path} (${f.kind})`); out(f.content.replace(/\n$/, '')) }
  }
  if (files.length === 0) out('\nNothing to convert: every phase is archived or has its spec.')
  for (const w of warnings) out(`\nwarning: ${w}`)
  if (failures.length) {
    out('\nplan-check on the result: RED')
    for (const f of failures) out(`  ${f}`)
    out(write ? 'Nothing written.' : '')
    process.exit(1)
  }
  out(`\nplan-check on the result: green (${files.length} file(s) ${write ? 'written' : 'to write'})`)
  if (write) out('Next: refine each stub spec (upgrade.md Step 4), then Step 5.')
}

// fileURLToPath, not URL.pathname: a checkout path with a space
// must still run main().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
