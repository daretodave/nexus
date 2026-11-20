// Unit tests for scripts/upgrade-plan.mjs, the v1 to v2 plan
// converter (node:test, no devDeps). Pure: git is a stub here;
// upgrade-plan-run.test.mjs runs it over a scratch repo.
//
//   node --test scripts/__tests__/upgrade-plan.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseBuildPlan, convert } from '../upgrade-plan.mjs'
import { parseSpec, checkPlan } from '../plan-check.mjs'

const ROADMAP = fs.readFileSync(fileURLToPath(new URL('../../plan/README.md', import.meta.url)), 'utf-8')
const ARCHIVE = fs.readFileSync(fileURLToPath(new URL('../../plan/ARCHIVE.md', import.meta.url)), 'utf-8')

export const BUILD_PLAN = `# 01 — Build plan

> Style guardrails.

## Status (at-a-glance)

Status vocabulary: \`[ ]\` pending → \`[x]\` shipped.

**Substrate:**
- [x] Phase 1 — Bootstrap (project init, base layout,
      b27d21f → cf05598: the first green deploy)
- [x] Phase 2 — Data layer (commit 84ea179)
- [x] Phase 3 — Search over places, with a long title that
      runs well past ten words to test the cut (this commit)
- [skipped] Phase 4 — Offline mode
- [-] Phase 5 — Profiles (commit e593606)

**Feature surfaces:**
- [blocked: the payments token lacks scope 2026-08-23]
      Phase 6 — Checkout flow — needs a local session
- [ ] Phase 7 — Admin console (score 8.1)
- [ ] Phase 8 — Polish: 404, about, footer

## Per-phase scope

### Phase 8 — Polish

The 404 page, the about page and the footer.

### Phase 7 — Admin console

Moderators edit records.

---

## Carry-overs / known gaps

- Profiles ship without avatars.

## Phase log (commit hashes)

- phase 1 — b27d21f → cf05598 — bootstrap
- phase 2 — 84ea179 — data layer
- phase 3 — (this commit) — search
- phase 9 — fe75c78 — a phase the status block forgot
`

const BRIEF_7 = `# Phase 7 — Admin console

> Agent-facing brief.

## Scope

Moderators edit any record.

## Chunks

A heading that must not read as the spec's own.

\`\`\`
## not a heading
\`\`\`
`

const DATES = { cf05598: '2026-05-17', '84ea179': '2026-07-02', e593606: '2026-07-04', fe75c78: '2026-07-05', aaa1111: '2026-07-03' }
const git = {
  dateOf: (sha) => DATES[sha] ?? null,
  flipOf: (n) => (n === 3 ? { sha: 'aaa1111', date: '2026-07-03' } : null),
}

const run = (over = {}) => convert({
  buildPlan: BUILD_PLAN,
  briefs: { 'phase_7_admin_console.md': BRIEF_7 },
  readme: ROADMAP,
  archive: ARCHIVE,
  existing: [],
  git,
  today: '2026-10-21',
  label: 'plan',
  ...over,
})

test('parseBuildPlan reads every status, wrapped rows, the blocked marker on its own line, and the log', () => {
  const { rows, log, scopes, carryOvers } = parseBuildPlan(BUILD_PLAN)
  assert.deepEqual(rows.map((r) => [r.num, r.status]), [
    [1, 'done'], [2, 'done'], [3, 'done'], [4, 'skipped'], [5, 'partial'], [6, 'blocked'], [7, 'open'], [8, 'open'],
  ])
  assert.deepEqual(rows[0].shas, ['b27d21f', 'cf05598'])
  assert.deepEqual(rows[1].shas, ['84ea179'])
  assert.equal(rows[0].title, 'Bootstrap')
  assert.equal(rows[5].reason, 'the payments token lacks scope')
  assert.equal(rows[5].date, '2026-08-23')
  assert.equal(rows[5].title, 'Checkout flow')
  assert.equal(rows[6].title, 'Admin console')
  assert.deepEqual(log.get('9').shas, ['fe75c78'])
  assert.deepEqual(log.get('3').shas, [])
  assert.match(scopes.get('8'), /404 page/)
  assert.equal(carryOvers, 1)
})

test('shipped rows and the log become archive lines, dated from git, oldest first', () => {
  const { files } = run()
  const added = files.find((f) => f.path === 'plan/ARCHIVE.md').added
  assert.deepEqual(added, [
    '- 2026-05-17 · 01 · Bootstrap · b27d21f..cf05598',
    '- 2026-07-02 · 02 · Data layer · 84ea179',
    '- 2026-07-03 · 03 · Search over places, with a long title that runs well · aaa1111',
    '- 2026-07-04 · 05 · Profiles · e593606',
    '- 2026-07-05 · 09 · a phase the status block forgot · fe75c78',
    '- 2026-10-21 · 04 · dropped: Offline mode · (this commit)',
  ])
})

test('open and blocked rows become spec stubs; blocked ones get a Held line', () => {
  const { files } = run()
  const paths = files.map((f) => f.path).sort()
  assert.deepEqual(paths, ['plan/06-checkout-flow.md', 'plan/07-admin-console.md', 'plan/08-polish-404-about-footer.md', 'plan/ARCHIVE.md', 'plan/README.md'])
  const admin = files.find((f) => f.path === 'plan/07-admin-console.md').content
  assert.match(admin, /^# 07 — Admin console$/m)
  assert.match(admin, /^### Scope$/m, 'the brief folds into Design, headings demoted')
  assert.match(admin, /^### Chunks$/m)
  assert.match(admin, /^## not a heading$/m, 'fenced lines stay as written')
  assert.match(admin, /^Measure: 1 open · 0 closed · next A2$/m)
  assert.match(admin, /^Not chunked yet\.$/m)
  const polish = files.find((f) => f.path === 'plan/08-polish-404-about-footer.md').content
  assert.match(polish, /404 page, the about page/, 'the per-phase scope fills Why when there is no brief')
  const readme = files.find((f) => f.path === 'plan/README.md').content
  assert.match(readme, /^- \*\*06\*\* · blocked: the payments token lacks scope · since: 2026-08-23 · until: the owner unblocks it · max_age: 14d$/m)
  assert.doesNotMatch(readme, /01-bootstrap\.md\)/, 'template rows for specs that do not exist leave the table')
  assert.match(readme, /^\| 7 \| Admin console \| \[07-admin-console\.md\]\(07-admin-console\.md\) \| planned \| not chunked \|$/m)
  assert.match(readme, /^\| 6 \| Checkout flow \| \[06-checkout-flow\.md\]\(06-checkout-flow\.md\) \| held \| not chunked \|$/m)
})

test('the converted plan passes plan-check', () => {
  const { files, failures } = run()
  assert.deepEqual(failures, [])
  const get = (p) => files.find((f) => f.path === p).content
  const specs = files.filter((f) => /\/\d{2}-/.test(f.path)).map((f) => parseSpec(f.path, f.content))
  assert.deepEqual(checkPlan({ specs, readme: get('plan/README.md'), archive: get('plan/ARCHIVE.md') }), [])
})

test('warnings name what is left for a person: carry-overs, partial rows, a shipped row with no commit', () => {
  const plan = BUILD_PLAN.replace('(commit 84ea179)', '(this commit)').replace('- phase 2 — 84ea179 — data layer\n', '')
  const { files, warnings } = run({ buildPlan: plan })
  assert.ok(warnings.some((w) => /carry-over/i.test(w)))
  assert.ok(warnings.some((w) => /05.*partial/i.test(w)))
  assert.ok(warnings.some((w) => /02.*no commit/i.test(w)))
  assert.ok(files.find((f) => f.path === 'plan/ARCHIVE.md').added.includes('- 2026-10-21 · 02 · Data layer · unknown'))
})

test('a second run adds nothing: archived phases and written specs are skipped', () => {
  const first = run()
  const get = (p) => first.files.find((f) => f.path === p).content
  const existing = first.files.filter((f) => /\/\d{2}-/.test(f.path)).map((f) => ({ name: f.path.slice(5), text: f.content }))
  const again = run({ readme: get('plan/README.md'), archive: get('plan/ARCHIVE.md'), existing })
  assert.deepEqual(again.files, [])
  assert.deepEqual(again.failures, [])
})

test('a v1 roadmap is refused: Step 3 comes first', () => {
  assert.throws(() => run({ readme: '# Plan\n\nNo spec table here.\n' }), /Step 3/)
})

// The measured v1 format: an editorial loop's build plan, as a
// scratch clone showed it. Backtick shas, an `a + b` ship pair,
// letter-suffixed phases, titles that run on past a full stop,
// an unbulleted phase log, and one row nothing can parse.
export const MEASURED_PLAN = `# 01 — Build plan

## Status (at-a-glance)

- [x] Phase 1 — Scaffold. Framework, layout and the deploy pipeline — \`a1b2c3d\`
- [x] Phase 2 — Content model (schema, loaders, front matter) — shipped 1234abc + 5678def
- [x] Phase 3 — Article pages — \`3333aaa\`
- [x] Phase 4 — Content queue. One article per tick from the queue file
- [x] Phase 4b — Trend snapshots. A weekly gate pulls the trend
      board before the queue runs — \`4b4b4b4\`
- [x] Phase 15 — Survey refill (when the queue runs dry) — \`1515151\`
- [x] Phase 15a — Cross-link drain. Every new article links two old ones — \`15a15a1\`
- [ ] Phase 16 — Newsletter. A weekly digest, opt-in only
- [ ] Phase 16a — Newsletter archive. One page per sent issue
- [x] Phasee 17 — a typo row nothing parses

## Phase log (commit hashes)

phase 4 — 4444ddd — content queue
phase 4b — \`4b4b4b4\` — trend snapshots
phase 15 — 1515151 — survey refill
phase 14 — 1414aaa + 1414bbb — a phase only the log knows
`

const MEASURED_DATES = {
  a1b2c3d: '2026-03-01', '5678def': '2026-03-02', '3333aaa': '2026-03-03', '4444ddd': '2026-03-04',
  '4b4b4b4': '2026-03-05', '1414bbb': '2026-03-06', '1515151': '2026-03-07', '15a15a1': '2026-03-08',
}
const measuredGit = { dateOf: (sha) => MEASURED_DATES[sha] ?? null, flipOf: () => null }
const measured = (over = {}) => run({ buildPlan: MEASURED_PLAN, briefs: {}, git: measuredGit, today: '2026-10-25', ...over })

test('shasIn reads a lone sha, a backtick sha, an a + b pair, a range and (commit sha)', async () => {
  const { shasIn } = await import('../upgrade-plan.mjs')
  assert.deepEqual(shasIn('84ea179'), ['84ea179'])
  assert.deepEqual(shasIn('`84ea179`'), ['84ea179'])
  assert.deepEqual(shasIn('Article pages — `3333aaa`'), ['3333aaa'])
  assert.deepEqual(shasIn('shipped 1234abc + 5678def'), ['1234abc', '5678def'])
  assert.deepEqual(shasIn('`1234abc` + `5678def`'), ['1234abc', '5678def'])
  assert.deepEqual(shasIn('b27d21f → cf05598: the first deploy'), ['b27d21f', 'cf05598'])
  assert.deepEqual(shasIn('Data layer (commit 84ea179)'), ['84ea179'])
  assert.deepEqual(shasIn('Search (this commit)'), [])
  assert.deepEqual(shasIn('Phase 2 + 3 together'), [])
})

test('cleanTitle cuts at the first " — ", ". " or " ("', async () => {
  const { cleanTitle } = await import('../upgrade-plan.mjs')
  assert.equal(cleanTitle('Scaffold. Framework, layout and the deploy pipeline — `a1b2c3d`'), 'Scaffold')
  assert.equal(cleanTitle('Survey refill (when the queue runs dry) — `1515151`'), 'Survey refill')
  assert.equal(cleanTitle('Polish: 404, about, footer'), 'Polish: 404, about, footer')
  assert.equal(cleanTitle('Checkout flow — needs a local session'), 'Checkout flow')
  // A trailing backtick sha is the ship sha, never part of the title.
  assert.equal(cleanTitle('Content queue `0ffc0cc`'), 'Content queue')
  assert.equal(cleanTitle('Cross-links `7a8aaf2`.'), 'Cross-links')
})

test('the measured format: every done phase archived once with its ship sha, suffixed ones under their parent', () => {
  const { rows, log } = parseBuildPlan(MEASURED_PLAN)
  assert.deepEqual(rows.map((r) => r.id), ['1', '2', '3', '4', '4b', '15', '15a', '16', '16a'])
  assert.deepEqual([...log.keys()], ['4', '4b', '15', '14'], 'the unbulleted log is read')
  const { files, failures } = measured()
  assert.deepEqual(failures, [])
  const added = files.find((f) => f.path === 'plan/ARCHIVE.md').added
  assert.deepEqual(added, [
    '- 2026-03-01 · 01 · Scaffold · a1b2c3d',
    '- 2026-03-02 · 02 · Content model · 1234abc..5678def',
    '- 2026-03-03 · 03 · Article pages · 3333aaa',
    '- 2026-03-04 · 04 · Content queue · 4444ddd',
    '- 2026-03-05 · 04 · 4b: Trend snapshots · 4b4b4b4',
    '- 2026-03-06 · 14 · a phase only the log knows · 1414aaa..1414bbb',
    '- 2026-03-07 · 15 · Survey refill · 1515151',
    '- 2026-03-08 · 15 · 15a: Cross-link drain · 15a15a1',
  ])
  assert.equal(new Set(added.map((l) => l.split(' · ').slice(1, 3).join(' · '))).size, added.length, 'no phase archived twice')
})

test('the measured format: a parsed-vs-listed mismatch is a warning naming the unparsed row', () => {
  const { warnings } = measured()
  const w = warnings.find((x) => /Status lists 10 row\(s\) but 9 parsed/.test(x))
  assert.ok(w, warnings.join('\n'))
  assert.match(w, /Phasee 17/)
})

test('an open suffixed phase becomes a stub at the next free number, with a warning; the inline scope fills Design', () => {
  const { files, warnings } = measured()
  const paths = files.map((f) => f.path).sort()
  assert.deepEqual(paths, ['plan/16-newsletter.md', 'plan/17-newsletter-archive.md', 'plan/ARCHIVE.md', 'plan/README.md'])
  assert.ok(warnings.some((w) => /16a: an open letter-suffixed phase; its stub spec is 17/.test(w)), warnings.join('\n'))
  const news = files.find((f) => f.path === 'plan/16-newsletter.md').content
  assert.match(news, /^## Design\n\nThe v1 row's scope: A weekly digest, opt-in only$/m)
  const arch = files.find((f) => f.path === 'plan/17-newsletter-archive.md').content
  assert.match(arch, /^Converted from v1 phase 16a by/m)
  assert.match(arch, /The v1 row's scope: One page per sent issue/)
  const readme = files.find((f) => f.path === 'plan/README.md').content
  assert.match(readme, /^\| 17 \| Newsletter archive \| \[17-newsletter-archive\.md\]\(17-newsletter-archive\.md\) \| planned \| not chunked \|$/m)
})

test('the measured format converts twice to nothing new: suffixed lines and stubs are recognised', () => {
  const first = measured()
  const get = (p) => first.files.find((f) => f.path === p).content
  const existing = first.files.filter((f) => /\/\d{2}-/.test(f.path)).map((f) => ({ name: f.path.slice(5), text: f.content }))
  const again = measured({ readme: get('plan/README.md'), archive: get('plan/ARCHIVE.md'), existing })
  assert.deepEqual(again.files, [])
  assert.deepEqual(again.failures, [])
})

test('a missing ARCHIVE.md starts from an empty archive instead of refusing', () => {
  const { files, failures, warnings } = measured({ archive: null })
  assert.deepEqual(failures, [])
  const archive = files.find((f) => f.path === 'plan/ARCHIVE.md')
  assert.match(archive.content, /^# Archive\n/)
  assert.equal(archive.added.length, 8)
  assert.ok(archive.content.endsWith('- 2026-03-08 · 15 · 15a: Cross-link drain · 15a15a1\n'))
  assert.ok(warnings.some((w) => /ARCHIVE\.md was missing/.test(w)))
})
