// Unit tests for scripts/plan-check.mjs (node:test, no devDeps).
//
//   node --test scripts/__tests__/plan-check.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChunk, parseSpec, checkPlan, checkHistory, archived } from '../plan-check.mjs'

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
