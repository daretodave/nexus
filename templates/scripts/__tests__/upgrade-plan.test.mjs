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
  assert.deepEqual(log.get(9).shas, ['fe75c78'])
  assert.deepEqual(log.get(3).shas, [])
  assert.match(scopes.get(8), /404 page/)
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
  assert.match(readme, /^- \*\*06\*\* · blocked: the payments token lacks scope 2026-08-23$/m)
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
