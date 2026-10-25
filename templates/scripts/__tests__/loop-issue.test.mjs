// scripts/__tests__/loop-issue.test.mjs
//
// Unit tests for scripts/loop-issue.mjs. Uses Node's built-in
// node:test runner — no devDeps required.
//
// We don't shell out to a real `gh` binary here; we test the
// pure-functional pieces (argv parsing, body builders, URL → number
// extraction, phase title prefix matching) and label palette
// invariants. The full open/close + phase find-or-reopen flow is
// verified live on the first /iterate / /ship-a-chunk tick after
// merge.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { __test } from '../loop-issue.mjs'

const {
  parseArgs,
  parseIssueNumber,
  buildCloseCommentBody,
  buildPhaseResumeCommentBody,
  buildPhaseShippedCommentBody,
  phaseTitlePrefix,
  isPhaseMatch,
  LABEL_PALETTE,
  VALID_SEVERITY,
  VALID_CATEGORY,
  VALID_SOURCE,
  MIRROR_KINDS,
  resolveSubcommand,
  specTitlePrefix,
  isSpecMatch,
  buildMirrorTitle,
  buildMirrorResumeCommentBody,
  buildMirrorShippedCommentBody,
  isMainModule,
} = __test

test('parseArgs parses standard flag/value pairs', () => {
  const out = parseArgs(['--severity', 'high', '--category', 'a11y', '--title', 'a quick fix'])
  assert.equal(out.severity, 'high')
  assert.equal(out.category, 'a11y')
  assert.equal(out.title, 'a quick fix')
})

test('parseArgs handles a flag without a value (e.g. --help)', () => {
  const out = parseArgs(['--help'])
  assert.equal(out.help, 'true')
})

test('parseArgs preserves dashed flag names like --body-file', () => {
  const out = parseArgs(['--body-file', '/tmp/issue-body.md', '--deploy-url', 'https://example.com'])
  assert.equal(out['body-file'], '/tmp/issue-body.md')
  assert.equal(out['deploy-url'], 'https://example.com')
})

test('parseArgs treats consecutive flags as boolean (no value)', () => {
  const out = parseArgs(['--dry-run', '--verbose'])
  assert.equal(out['dry-run'], 'true')
  assert.equal(out['verbose'], 'true')
})

test('parseIssueNumber extracts the trailing number from gh issue URL', () => {
  const stdout = 'https://github.com/owner/repo/issues/42\n'
  assert.equal(parseIssueNumber(stdout), 42)
})

test('parseIssueNumber handles multi-line stdout (URL is last line)', () => {
  const stdout = 'Creating issue in owner/repo\n\nhttps://github.com/owner/repo/issues/137\n'
  assert.equal(parseIssueNumber(stdout), 137)
})

test('parseIssueNumber returns null when no URL is present', () => {
  assert.equal(parseIssueNumber('something went wrong'), null)
  assert.equal(parseIssueNumber(''), null)
})

test('parseIssueNumber finds the URL even if not strictly the very last line', () => {
  const stdout = 'creating...\nhttps://github.com/owner/repo/issues/9\n'
  assert.equal(parseIssueNumber(stdout), 9)
})

test('buildCloseCommentBody includes commit + deploy URL + closure note', () => {
  const body = buildCloseCommentBody({ commit: 'a3f1e2c', deployUrl: 'https://example.com' })
  assert.match(body, /a3f1e2c/)
  assert.match(body, /https:\/\/example\.com/)
  assert.match(body, /Closes #N/)
})

test('phaseTitlePrefix uses an em-dash + trailing space so prefix matches are exact', () => {
  assert.equal(phaseTitlePrefix('16a'), 'Phase 16a — ')
  assert.equal(phaseTitlePrefix(17), 'Phase 17 — ')
})

test('isPhaseMatch is anchored — "Phase 16" does not collide with "Phase 16a"', () => {
  assert.equal(isPhaseMatch('Phase 16 — Stripe', '16'), true)
  assert.equal(isPhaseMatch('Phase 16 — Stripe', '16a'), false)
  assert.equal(isPhaseMatch('Phase 16a — E2E backfill', '16a'), true)
  assert.equal(isPhaseMatch('Phase 16a — E2E backfill', '16'), false)
  assert.equal(isPhaseMatch('Phase 1 — bootstrap', '1'), true)
  assert.equal(isPhaseMatch('Phase 1 — bootstrap', '11'), false)
})

test('buildPhaseResumeCommentBody mentions the phase id + ISO timestamp', () => {
  const body = buildPhaseResumeCommentBody({ phaseId: '16a' })
  assert.match(body, /Phase 16a/)
  assert.match(body, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // rough ISO check
  assert.match(body, /resumed/i)
})

test('buildPhaseShippedCommentBody includes phase id, commit, deploy URL, and Closes-trailer note', () => {
  const body = buildPhaseShippedCommentBody({
    phaseId: '16a',
    commit: 'deadbee',
    deployUrl: 'https://example.com',
  })
  assert.match(body, /Phase 16a/)
  assert.match(body, /deadbee/)
  assert.match(body, /https:\/\/example\.com/)
  assert.match(body, /Closes #N/)
})

test('LABEL_PALETTE has every label the open + phase-open paths apply', () => {
  // Every label that cmdOpen / cmdPhaseOpen creates must have a
  // palette entry so ensureLabel can create it on first encounter.
  const required = [
    'loop:opened',
    'loop:phase',
    'severity:high',
    'severity:med',
    'severity:low',
    'source:user',
    'source:reader',
    'source:audit',
    'source:external',
    'bug',
    'enhancement',
    'content',
    'data',
    'docs',
    'seo',
    'a11y',
    'perf',
    'ui',
  ]
  for (const name of required) {
    assert.ok(LABEL_PALETTE[name], `missing palette entry: ${name}`)
    assert.match(LABEL_PALETTE[name].color, /^[0-9a-f]{6}$/, `invalid color for ${name}`)
  }
})

test('VALID_* enums match the documented brief', () => {
  assert.deepEqual([...VALID_SEVERITY].sort(), ['high', 'low', 'med'])
  assert.deepEqual(
    [...VALID_CATEGORY].sort(),
    ['a11y', 'bug', 'content', 'data', 'docs', 'enhancement', 'perf', 'seo', 'ui'],
  )
  assert.deepEqual([...VALID_SOURCE].sort(), ['audit', 'external', 'reader', 'user'])
})

// --- spec-open / spec-close (the v2 mirror verbs) ---------------------

test('resolveSubcommand maps spec-open/spec-close to the spec kind', () => {
  assert.deepEqual(resolveSubcommand('spec-open'), { action: 'open', kind: 'spec', deprecated: false })
  assert.deepEqual(resolveSubcommand('spec-close'), { action: 'close', kind: 'spec', deprecated: false })
})

test('resolveSubcommand keeps phase-open/phase-close as deprecated aliases', () => {
  assert.deepEqual(resolveSubcommand('phase-open'), { action: 'open', kind: 'phase', deprecated: true })
  assert.deepEqual(resolveSubcommand('phase-close'), { action: 'close', kind: 'phase', deprecated: true })
  assert.equal(resolveSubcommand('open'), null)
  assert.equal(resolveSubcommand('spec-reopen'), null)
})

test('MIRROR_KINDS: spec reads --spec, titles "Spec NN — ", labels loop:spec', () => {
  assert.equal(MIRROR_KINDS.spec.flag, 'spec')
  assert.equal(MIRROR_KINDS.spec.word, 'Spec')
  assert.equal(MIRROR_KINDS.spec.label, 'loop:spec')
  assert.equal(MIRROR_KINDS.phase.flag, 'phase')
  assert.equal(MIRROR_KINDS.phase.label, 'loop:phase')
  assert.match(LABEL_PALETTE['loop:spec'].color, /^[0-9a-f]{6}$/)
})

test('spec-open args parse to the spec id, title, and body file', () => {
  const flags = parseArgs(['--spec', '35', '--title', 'finish v2', '--body-file', 'b.md'])
  assert.equal(flags[MIRROR_KINDS.spec.flag], '35')
  assert.equal(flags.title, 'finish v2')
  assert.equal(flags['body-file'], 'b.md')
})

test('specTitlePrefix is "Spec NN — " and isSpecMatch is anchored', () => {
  assert.equal(specTitlePrefix('35'), 'Spec 35 — ')
  assert.equal(isSpecMatch('Spec 35 — finish v2', '35'), true)
  assert.equal(isSpecMatch('Spec 35 — finish v2', '3'), false)
  assert.equal(isSpecMatch('Spec 3 — x', '35'), false)
  assert.equal(isSpecMatch('Phase 35 — finish v2', '35'), false)
})

test('buildMirrorTitle prefixes a bare title and keeps an already-prefixed one', () => {
  assert.equal(buildMirrorTitle('spec', '35', 'finish v2'), 'Spec 35 — finish v2')
  assert.equal(buildMirrorTitle('spec', '35', 'Spec 35 — finish v2'), 'Spec 35 — finish v2')
  assert.equal(buildMirrorTitle('phase', '16a', 'Phase 16a — E2E'), 'Phase 16a — E2E')
  assert.equal(buildMirrorTitle('phase', '16a', 'E2E'), 'Phase 16a — E2E')
})

test('buildMirrorResumeCommentBody names the spec and the resume time', () => {
  const body = buildMirrorResumeCommentBody({ kind: 'spec', id: '35' })
  assert.match(body, /^Spec 35 work resumed at \d{4}-\d{2}-\d{2}T/)
})

test('buildMirrorShippedCommentBody names the spec, commit, and URL', () => {
  const body = buildMirrorShippedCommentBody({
    kind: 'spec',
    id: '35',
    commit: 'c429be9',
    deployUrl: 'https://example.com',
  })
  assert.match(body, /^Spec 35 shipped in c429be9\./)
  assert.match(body, /https:\/\/example\.com/)
  assert.match(body, /Closes #N/)
})

test('phase builders stay byte-compatible through the alias', () => {
  assert.equal(
    buildPhaseShippedCommentBody({ phaseId: '7', commit: 'abc', deployUrl: 'u' }),
    buildMirrorShippedCommentBody({ kind: 'phase', id: '7', commit: 'abc', deployUrl: 'u' }),
  )
})

// --- entry-point detection --------------------------------------------

test('isMainModule matches the script path, including Windows paths', () => {
  const script = path.resolve('scripts', 'loop-issue.mjs')
  const url = pathToFileURL(script).href
  assert.equal(isMainModule(url, script), true)
})

test('isMainModule rejects a different file that shares the basename', () => {
  const script = path.resolve('scripts', 'loop-issue.mjs')
  const other = path.resolve('elsewhere', 'loop-issue.mjs')
  assert.equal(isMainModule(pathToFileURL(script).href, other), false)
})

test('isMainModule is false when argv[1] is missing (imported by a runner)', () => {
  assert.equal(isMainModule('file:///x/loop-issue.mjs', undefined), false)
})
