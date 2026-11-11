// The gate's CHANGELOG.md leg (scripts/changelog-check.mjs): pure, a fake `git` seam, no real repo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changelogPaths, missingChangelog, touchedTemplates } from '../changelog-check.mjs'

function fakeGit(responses) {
  return (args) => {
    const key = args.join(' ')
    if (key.startsWith('rev-parse')) return responses.head === false ? (() => { throw new Error('no HEAD') })() : ''
    if (key.startsWith('diff')) return (responses.diffed ?? []).join('\n')
    if (key.startsWith('ls-files')) return (responses.untracked ?? []).join('\n')
    throw new Error(`unexpected git ${key}`)
  }
}

test('touchedTemplates: diffed and untracked files under templates/, deduped, others dropped', () => {
  const git = fakeGit({ diffed: ['templates/skills/next.md', 'README.md'], untracked: ['templates/skills/next.md', 'scripts/foo.mjs'] })
  assert.deepEqual(touchedTemplates({ root: '/repo', git }), ['templates/skills/next.md'])
})

test('touchedTemplates: no HEAD yet (empty repo) reads against the empty tree, same result shape', () => {
  const git = fakeGit({ head: false, diffed: ['templates/agents.md'], untracked: [] })
  assert.deepEqual(touchedTemplates({ root: '/repo', git }), ['templates/agents.md'])
})

test('changelogPaths: the path before the first colon on each top-level bullet, continuation lines ignored', () => {
  const text = [
    '# CHANGELOG',
    '',
    '- templates/skills/next.md: the lead never builds (2026-11-05, abc123).',
    '- templates/agents.md: documents the no-deploy-host path',
    '  in rules 1 and 4 (2026-11-05, b5c7f1b).',
  ].join('\n')
  assert.deepEqual(changelogPaths(text), new Set(['templates/skills/next.md', 'templates/agents.md']))
})

test('missingChangelog: nothing touched is never a failure', () => {
  assert.equal(missingChangelog([], '- templates/x.md: … (2026-11-05, abc).'), null)
})

test('missingChangelog: one covered path among several touched clears every one of them', () => {
  const changelog = '- templates/skills/next.md: … (2026-11-05, abc).'
  assert.equal(missingChangelog(['templates/skills/next.md', 'templates/skills/other.md'], changelog), null)
})

test('missingChangelog: no touched path has an entry fails, naming every touched path', () => {
  const changelog = '- templates/unrelated.md: … (2026-11-05, abc).'
  assert.deepEqual(missingChangelog(['templates/skills/next.md'], changelog), ['templates/skills/next.md'])
})
