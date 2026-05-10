// scripts/__tests__/loop-issue.test.mjs
//
// Unit tests for scripts/loop-issue.mjs. Uses Node's built-in
// node:test runner — no devDeps required.
//
// We don't shell out to a real `gh` binary here; we test the
// pure-functional pieces (argv parsing, body builders, URL → number
// extraction, phase title prefix matching) and label palette
// invariants. The full open/close + phase find-or-reopen flow is
// verified live on the first /iterate / /ship-a-phase tick after
// merge.

import { test } from 'node:test'
import assert from 'node:assert/strict'

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
    ['a11y', 'bug', 'content', 'data', 'docs', 'enhancement', 'perf', 'seo'],
  )
  assert.deepEqual([...VALID_SOURCE].sort(), ['audit', 'external', 'reader', 'user'])
})
