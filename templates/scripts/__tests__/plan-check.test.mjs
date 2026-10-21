// Unit tests for scripts/plan-check.mjs (node:test, no devDeps).
//
//   node --test scripts/__tests__/plan-check.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChunk, parseSpec, checkPlan, checkHistory, archived, runCheck, loadPlanDir } from '../plan-check.mjs'

const spec = (body) => parseSpec('plan/07-search.md', `# 07 — Search\n\n${body}`)

const GOOD = `## Acceptance

- **A2** A query returns ranked results.
- **A3** An empty query shows the empty state.

## Chunks
Measure: 2 open · 1 closed · next A4

- [ ] **07.2** Ranked results · M · closes A2 · needs —
- [ ] **07.3** Empty state, wrapped
  across two lines · S · closes A3 · needs 07.2
  - a sub-bullet is a requirement, not part of the header
`

const README = '| 7 | Search | [07-search.md](07-search.md) | 2 left |'

test('parseChunk reads id, size, closes, partial and needs', () => {
  const c = parseChunk('- [ ] **07.2** Ranked results · M · closes A2, A5 · partial A6 · needs 07.1, 03')
  assert.equal(c.id, '07.2')
  assert.equal(c.size, 'M')
  assert.deepEqual(c.closes, ['A2', 'A5'])
  assert.deepEqual(c.partial, ['A6'])
  assert.deepEqual(c.needs, ['07.1', '03'])
  assert.deepEqual(parseChunk('- [ ] **07.2** x · S · closes A1 · needs —').needs, [])
})

test('parseChunk refuses a missing size, ids or needs, and a ticked chunk', () => {
  assert.match(parseChunk('- [ ] **07.2** x · closes A1 · needs —').error, /size/)
  assert.match(parseChunk('- [ ] **07.2** x · S · needs —').error, /A-ID/)
  assert.match(parseChunk('- [ ] **07.2** x · S · closes A1').error, /needs/)
  assert.match(parseChunk('- [x] **07.2** x · S · closes A1 · needs —').error, /archive/)
})

test('a well-formed spec is green, and wrapped headers join', () => {
  const s = spec(GOOD)
  assert.equal(s.chunks.length, 2)
  assert.deepEqual(s.chunks[1].needs, ['07.2'])
  assert.deepEqual(checkPlan({ specs: [s], readme: README, archive: null }), [])
})

test('the Measure line must be true', () => {
  const s = spec(GOOD.replace('2 open · 1 closed', '3 open · 1 closed'))
  const f = checkPlan({ specs: [s], readme: README, archive: null })
  assert.ok(f.some((x) => /Measure says 3 open/.test(x)))
  assert.ok(f.some((x) => /never reused/.test(x)))
})

test('an uncovered A-ID, an unknown A-ID and a dangling need fail', () => {
  const s = spec(GOOD.replace('closes A3 · needs 07.2', 'closes A9 · needs 07.1'))
  const f = checkPlan({ specs: [s], readme: README, archive: null }).join('\n')
  assert.match(f, /A9, which ## Acceptance does not list/)
  assert.match(f, /A3 is closed or partialed by no chunk/)
  assert.match(f, /needs 07\.1, which no spec lists/)
})

test('an unchunked spec needs the explicit marker; an empty spec must be absorbed', () => {
  const unchunked = spec('## Acceptance\n\n- **A1** x\n\n## Chunks\nMeasure: 1 open · 0 closed · next A2\n\nNot chunked yet.\n')
  assert.deepEqual(checkPlan({ specs: [unchunked], readme: README, archive: null }), [])
  const empty = spec('## Acceptance\n\n## Chunks\nMeasure: 0 open · 3 closed · next A4\n')
  assert.match(checkPlan({ specs: [empty], readme: README, archive: null }).join('\n'), /absorb/)
  // Settle takes the heading out with the last A-ID: the spec is told to be absorbed, not that a heading is missing.
  const settled = checkPlan({ specs: [spec('## Chunks\nMeasure: 0 open · 3 closed · next A4\n')], readme: README, archive: null })
  assert.match(settled.join('\n'), /nothing left: absorb/)
  assert.ok(!settled.some((f) => /missing/.test(f)), settled.join('\n'))
  // A spec that still lists a chunk needs the heading.
  const headless = spec(GOOD.replace(/## Acceptance[\s\S]*?(?=## Chunks)/, ''))
  assert.match(checkPlan({ specs: [headless], readme: README, archive: null }).join('\n'), /missing `## Acceptance`/)
})

test('the roadmap must link every spec; archive lines must parse', () => {
  const s = spec(GOOD)
  assert.match(checkPlan({ specs: [s], readme: '', archive: null }).join('\n'), /no link to 07-search\.md/)
  const archive = '- 2026-10-20 · 07.1 · Index builds · abc1234\n- 2026-10-20 · 07.1 shipped\n'
  const f = checkPlan({ specs: [s], readme: README, archive })
  assert.equal(f.length, 1)
  assert.match(f[0], /ARCHIVE\.md:2/)
})

test('history: a chunk that leaves needs an archive line or a pending close', () => {
  const before = [spec(GOOD)]
  const after = [spec(GOOD.replace(/- \[ \] \*\*07\.3\*\*[\s\S]*$/, ''))]
  assert.match(checkHistory(before, after, '').join('\n'), /07\.3 left the plan/)
  assert.deepEqual(checkHistory(before, after, '- 2026-10-20 · 07.3 · Empty state ships · abc'), [])
  assert.deepEqual(checkHistory(before, after, '', new Set(['07.3'])), [])
})

test('history: next and closed never go backwards, and A-IDs are never reused', () => {
  const before = [spec(GOOD)]
  const after = [spec(GOOD.replace('- **A2**', '- **A1**').replace('closes A2', 'closes A1'))]
  assert.match(checkHistory(before, after, '').join('\n'), /A1 reuses a retired A-ID/)
  const back = [spec(GOOD.replace('1 closed · next A4', '0 closed · next A3'))]
  const f = checkHistory(before, back, '').join('\n')
  assert.match(f, /went backwards/)
})

test('history: a deleted spec needs its spec-complete line', () => {
  assert.match(checkHistory([spec(GOOD)], [], '- 2026-10-20 · 07.2 · x · y\n- 2026-10-20 · 07.3 · x · y').join('\n'), /spec complete/)
  assert.deepEqual(checkHistory([spec(GOOD)], [], [
    '- 2026-10-20 · 07.2 · x · y', '- 2026-10-20 · 07.3 · x · y',
    '- 2026-10-20 · 07 · spec complete: search · absorbed into identity · deleted in abc',
  ].join('\n')), [])
})

test('archived() matches the id exactly, with an optional A-ID note', () => {
  assert.equal(archived('- 2026-10-20 · 07.1 (A2–A3) · x · y', '07.1'), true)
  assert.equal(archived('- 2026-10-20 · 07.12 · x · y', '07.1'), false)
})

test('the roadmap links no spec that is gone, and its N left is true', () => {
  const s = spec(GOOD)
  const gone = `${README}\n| 8 | Old | [08-old.md](08-old.md) | 1 left |`
  assert.match(checkPlan({ specs: [s], readme: gone, archive: null }).join('\n'), /links 08-old\.md, which is not in the plan/)
  const stale = README.replace('2 left', '3 left')
  assert.match(checkPlan({ specs: [s], readme: stale, archive: null }).join('\n'), /says 3 left, 07-search\.md lists 2/)
})

test('the Asap and Held lanes name only chunks or specs still in the plan', () => {
  const s = spec(GOOD)
  const lanes = (asap, held) => `**Asap** (in order):\n\n${asap}\n\n**Held** (waits):\n\n${held}\n\n## Specs\n\n${README}\n- **07.1** not a lane line`
  assert.deepEqual(checkPlan({ specs: [s], readme: lanes('- **07.3**', '- **07.2** · blocked: x 2026-10-20'), archive: null }), [])
  assert.deepEqual(checkPlan({ specs: [s], readme: lanes('- **07**', '- (none)'), archive: null }), [])
  const f = checkPlan({ specs: [s], readme: lanes('- **07.1**', '- **09.4** · blocked: x'), archive: null }).join('\n')
  assert.match(f, /Asap lane names 07\.1/)
  assert.match(f, /Held lane names 09\.4/)
})

test('history: a split chunk is accounted for by its suffixed children', () => {
  const before = [spec(GOOD)]
  const split = GOOD.replace(/- \[ \] \*\*07\.3\*\*[\s\S]*$/, '- [ ] **07.3a** Empty state copy · S · closes A3 · needs 07.2\n')
  assert.deepEqual(checkHistory(before, [spec(split)], ''), [])
  const gone = GOOD.replace(/- \[ \] \*\*07\.3\*\*[\s\S]*$/, '')
  assert.deepEqual(checkHistory(before, [spec(gone)], '- 2026-10-20 · 07.3b · Empty state ships · abc'), [])
  assert.match(checkHistory(before, [spec(gone)], '- 2026-10-20 · 07.31 · x · abc').join('\n'), /07\.3 left the plan/)
})

// A scratch repo under a folder whose name has a space: the CLI must
// still run (a percent-encoded path once made it exit 0 unchecked).
function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan check '))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  fs.mkdirSync(path.join(dir, 'plan'))
  fs.mkdirSync(path.join(dir, 'scripts'))
  // plan-check and what it imports: the settled view (plan/) and settle's owner check.
  fs.copyFileSync(fileURLToPath(new URL('../plan-check.mjs', import.meta.url)), path.join(dir, 'scripts', 'plan-check.mjs'))
  fs.copyFileSync(fileURLToPath(new URL('../owner.mjs', import.meta.url)), path.join(dir, 'scripts', 'owner.mjs'))
  fs.cpSync(fileURLToPath(new URL('../plan', import.meta.url)), path.join(dir, 'scripts', 'plan'), { recursive: true })
  return dir
}

test('the CLI runs from a path with a space and goes red on a bad plan', () => {
  const dir = scratchRepo()
  try {
    fs.writeFileSync(path.join(dir, 'plan', '07-search.md'), '# 07 — x\n\n## Acceptance\n\n- **A1** a\n\n## Chunks\nMeasure: 5 open · 0 closed · next A2\n')
    const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'plan-check.mjs')], { cwd: dir, encoding: 'utf-8' })
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /plan-check: RED/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('--since: an unknown ref fails; an unborn HEAD has no history to check', () => {
  const dir = scratchRepo()
  try {
    assert.deepEqual(runCheck({ repoAbs: dir, since: 'HEAD' }).failures, [])
    assert.match(runCheck({ repoAbs: dir, since: 'no-such-ref' }).failures.join('\n'), /--since no-such-ref: not a commit/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a pending close counts by its file name or its close: line, never the folder README', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-pending-'))
  try {
    fs.mkdirSync(path.join(dir, 'pending'))
    fs.writeFileSync(path.join(dir, 'pending', 'README.md'), '# not a close\n')
    fs.writeFileSync(path.join(dir, 'pending', '07.3.md'), '---\nclose: 07.3\ndate: 2026-10-20\nsays: x\n---\n')
    fs.writeFileSync(path.join(dir, 'pending', 'late-fix.md'), '---\ndate: 2026-10-20\nclose: 07.4\nsays: y\n---\n')
    fs.writeFileSync(path.join(dir, 'pending', 'note-a.md'), '---\ndate: 2026-10-20\n---\n## Notes\nclose: 07.9\n')
    const ids = loadPlanDir(dir).pendingIds
    assert.ok(ids.has('07.3') && ids.has('07.4'))
    assert.ok(!ids.has('README') && !ids.has('07.9'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// A contributor's plot: the new spec written directly, its roadmap row
// and lane entry in plan/pending/plot-<slug>.md, unsettled. The gate
// reads the plan as it will read once settled, so the branch passes.
test('a contributor\'s unsettled plot passes: the roadmap is read with its pending edits applied', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-plot-'))
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  try {
    put('plan/07-search.md', `# 07 — Search\n\n${GOOD}`)
    put('plan/README.md', `**Asap**\n\n- (none)\n\n| # | Initiative | Spec | Status | Progress |\n|---|---|---|---|---|\n${README}\n`)
    put('plan/ARCHIVE.md', '# Archive\n')
    assert.deepEqual(runCheck({ repoAbs: dir }).failures, [])
    put('plan/08-maps.md', '# 08 — Maps\n\n## Acceptance\n\n- **A1** A map.\n\n## Chunks\nMeasure: 1 open · 0 closed · next A2\n\n- [ ] **08.1** The map · S · closes A1 · needs 07.2\n')
    put('plan/pending/plot-maps.md', [
      '---', 'date: 2026-10-21', '---',
      '## Edit plan/README.md', '~~~ old', '- (none)', '~~~', '~~~ new', '- **08.1** · maps first.', '~~~', '',
      '## Edit plan/README.md', '~~~ old', README, '~~~', '~~~ new', `${README}\n| 8 | Maps | [08-maps.md](08-maps.md) | planned | 1 left |`, '~~~', '',
    ].join('\n'))
    const r = runCheck({ repoAbs: dir })
    assert.deepEqual(r.failures, [])
    assert.equal(r.note, '2 specs, 3 chunks')
    // The files on disk are untouched: settle writes them, on main.
    assert.ok(!fs.readFileSync(path.join(dir, 'plan/README.md'), 'utf-8').includes('08-maps.md'))
    // A wrong count in the pending row is still caught, and so is a pending file settle would skip.
    put('plan/pending/plot-maps.md', fs.readFileSync(path.join(dir, 'plan/pending/plot-maps.md'), 'utf-8').replace('| 1 left |', '| 4 left |'))
    assert.match(runCheck({ repoAbs: dir }).failures.join('\n'), /says 4 left, 08-maps\.md lists 1/)
    put('plan/pending/plot-maps.md', '---\ndate: 2026-10-21\n---\n## Edit plan/README.md\n~~~ old\nno such row\n~~~\n~~~ new\nx\n~~~\n')
    const red = runCheck({ repoAbs: dir }).failures.join('\n')
    assert.match(red, /plot-maps\.md: Edit plan\/README\.md: the old text isn't there/)
    assert.match(red, /no link to 08-maps\.md/)
    // Another plan folder (a template's) never takes the root plan/pending/ edits.
    fs.cpSync(path.join(dir, 'plan'), path.join(dir, 'other/plan'), { recursive: true })
    fs.rmSync(path.join(dir, 'other/plan/pending'), { recursive: true })
    assert.match(runCheck({ repoAbs: dir, dirRel: 'other/plan' }).failures.join('\n'), /no link to 08-maps\.md/)
    assert.doesNotMatch(runCheck({ repoAbs: dir, dirRel: 'other/plan' }).failures.join('\n'), /plot-maps/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// A chunk's `secrets` field names the secrets it needs (never a
// value); nexus.secrets.json, beside plan/, must declare each one.
test('parseChunk reads a secrets field, comma or space separated, and refuses a name that is not an env var', () => {
  assert.deepEqual(parseChunk('- [ ] **07.2** Deploy · S · closes A1 · needs — · secrets VERCEL_TOKEN, CF_API_TOKEN GH_TOKEN').secrets, ['VERCEL_TOKEN', 'CF_API_TOKEN', 'GH_TOKEN'])
  assert.deepEqual(parseChunk('- [ ] **07.2** x · S · closes A1 · needs —').secrets, [])
  assert.deepEqual(parseChunk('- [ ] **07.2** x · S · closes A1 · needs — · secrets —').secrets, [])
  assert.match(parseChunk('- [ ] **07.2** x · S · closes A1 · needs — · secrets vercel-token').error, /vercel-token.*not an env-var name/)
})

test('checkPlan refuses a secret the manifest does not declare, and any secret with no manifest', () => {
  const s = spec(GOOD.replace('closes A3 · needs 07.2', 'closes A3 · needs 07.2 · secrets VERCEL_TOKEN'))
  assert.deepEqual(s.chunks[1].secrets, ['VERCEL_TOKEN'])
  assert.deepEqual(checkPlan({ specs: [s], readme: README, archive: null }), [], 'no manifest argument: not checked')
  assert.deepEqual(checkPlan({ specs: [s], readme: README, archive: null, manifest: new Set(['VERCEL_TOKEN']) }), [])
  assert.match(checkPlan({ specs: [s], readme: README, archive: null, manifest: new Set(['GH_TOKEN']) }).join('\n'), /07\.3 needs secret VERCEL_TOKEN, which nexus\.secrets\.json does not declare/)
  assert.match(checkPlan({ specs: [s], readme: README, archive: null, manifest: null }).join('\n'), /07\.3 needs secret VERCEL_TOKEN, but there is no nexus\.secrets\.json/)
  assert.deepEqual(checkPlan({ specs: [spec(GOOD)], readme: README, archive: null, manifest: null }), [], 'no secrets field: no manifest needed')
})

test('runCheck reads nexus.secrets.json beside plan/, and reports a manifest that breaks its shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-secrets-'))
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  const entry = { name: 'VERCEL_TOKEN', for: 'Deploys the site.', where: 'https://vercel.com/account/tokens', destinations: ['local', 'github-actions'], provider: 'owner', chunk: '07.3' }
  try {
    put('plan/07-search.md', `# 07 — Search\n\n${GOOD.replace('needs 07.2', 'needs 07.2 · secrets VERCEL_TOKEN')}`)
    put('plan/README.md', `${README}\n`)
    assert.match(runCheck({ repoAbs: dir }).failures.join('\n'), /no nexus\.secrets\.json/)
    put('nexus.secrets.json', JSON.stringify({ version: 1, secrets: [entry] }))
    assert.deepEqual(runCheck({ repoAbs: dir }).failures, [])
    put('nexus.secrets.json', JSON.stringify({ version: 1, secrets: [{ ...entry, name: 'CF_API_TOKEN' }] }))
    assert.match(runCheck({ repoAbs: dir }).failures.join('\n'), /VERCEL_TOKEN, which nexus\.secrets\.json does not declare/)
    put('nexus.secrets.json', JSON.stringify({ version: 1, secrets: [{ ...entry, value: 'fake-not-a-secret' }] }))
    const red = runCheck({ repoAbs: dir }).failures.join('\n')
    assert.match(red, /nexus\.secrets\.json: VERCEL_TOKEN: a manifest never holds a value/)
    assert.doesNotMatch(red, /fake-not-a-secret/)
    put('nexus.secrets.json', '{ not json')
    assert.match(runCheck({ repoAbs: dir }).failures.join('\n'), /nexus\.secrets\.json: not JSON/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
