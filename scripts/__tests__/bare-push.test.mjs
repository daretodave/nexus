// The bare-push lint: a skill never ends with a push of the default
// branch; it lands per owner mode, and only next/land.md names the
// owner's push.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { barePushLines, lintSkills } from '../bare-push.mjs'

// Built by concatenation so this file never trips the lint itself.
const PUSH = 'git push ' + 'origin'

test('a push of the placeholder or of main is refused, by line', () => {
  const src = `git commit -m x\n${PUSH} <DEFAULT_BRANCH>\nok\n${PUSH} main\n`
  assert.deepEqual(barePushLines(src), [2, 4])
})

test('one chained after a commit, or wrapped in prose, is refused', () => {
  assert.deepEqual(barePushLines(`git commit -m x && ${PUSH} main`), [1])
  assert.deepEqual(barePushLines(`then \`${PUSH}\n<DEFAULT_BRANCH>\`.`), [1])
})

test('HEAD:<branch>, another branch and a delete pass', () => {
  const src = [
    `${PUSH} HEAD:<DEFAULT_BRANCH>`,
    `${PUSH} HEAD:main`,
    `${PUSH} main-docs`,
    `${PUSH} mainline`,
    `${PUSH} --delete <branch>`,
    'git push -u origin next/<id>',
    '# land per owner mode: skills/next/land.md §6',
  ].join('\n')
  assert.deepEqual(barePushLines(src), [])
})

test('the tree lint skips next/land.md and names file:line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-push-'))
  try {
    const put = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
      fs.writeFileSync(path.join(root, rel), text)
    }
    put('templates/skills/next/land.md', `${PUSH} <DEFAULT_BRANCH>\n`)
    put('skills/next/land.md', `${PUSH} main\n`)
    put('templates/skills/jot.md', `x\n${PUSH} <DEFAULT_BRANCH>\n`)
    put('.claude/commands/jot.md', 'clean\n')
    const { problems, files } = lintSkills(root)
    assert.equal(files, 2)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /^templates\/skills\/jot\.md:2: /)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
