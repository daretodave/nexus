// The kit-text list (scripts/upgrade-kit-text.mjs): every header and paragraph the kit's
// march and iterate skills ever held, kept in a committed snapshot. The upgrade leg fails
// when a template holds text the snapshot lacks; --write folds it in and keeps the old.
// A scratch kit in the temp folder for the leg's cases; the real repo's history for the
// snapshot's own completeness.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, check, historyOf, readSnapshot, SNAPSHOT, write } from '../upgrade-kit-text.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function kit(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-kit-text-'))
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
  return root
}

const MARCH = '# Skill: march\n\n## 1. Purpose\n\nPick the work.\n'
const ITERATE = '# Skill: iterate\n\n## 1. Purpose\n\nAudit the kit.\n'

test('the leg is red when a template holds text the snapshot lacks, and --write keeps the old text', async () => {
  const root = kit({ 'templates/skills/march.md': MARCH, 'templates/skills/iterate.md': ITERATE })
  assert.match((await check(root)).problems.join('\n'), /no entry for march\.md/)
  assert.equal(await write(root), true)
  assert.deepEqual((await check(root)).problems, [])
  assert.equal(await write(root), false, 'a second write changes nothing')

  // A kit edit: a new section and paragraph. Red until --write; the old paragraph stays in the list.
  fs.writeFileSync(path.join(root, 'templates', 'skills', 'march.md'), '# Skill: march\n\n## 1. Purpose\n\nPick the next work.\n\n## 2. Lanes\n\nRun them.\n')
  const red = (await check(root)).problems.join('\n')
  assert.match(red, /templates\/skills\/march\.md holds 1 header\(s\) \(2\. lanes\) and 2 paragraph\(s\)/)
  assert.match(red, /node scripts\/upgrade-kit-text\.mjs --write/)
  const before = readSnapshot(root)['march.md'].paras
  await write(root)
  assert.deepEqual((await check(root)).problems, [])
  const after = readSnapshot(root)['march.md']
  for (const p of before) assert.ok(after.paras.includes(p), 'history is never dropped')
  assert.ok(after.headers.includes('2. lanes'))
  fs.rmSync(root, { recursive: true, force: true })
})

test('the committed snapshot holds every version of the kit skills in git history', async () => {
  const snap = readSnapshot(REPO)
  assert.ok(fs.existsSync(path.join(REPO, ...SNAPSHOT.split('/'))))
  const full = await build(REPO)
  for (const skill of ['march.md', 'iterate.md']) {
    if (historyOf(REPO, skill).length < 2) continue // a shallow clone: the snapshot is the history
    assert.deepEqual(new Set(full[skill].paras), new Set(snap[skill].paras), `${skill}: run node scripts/upgrade-kit-text.mjs --write`)
    assert.deepEqual(new Set(full[skill].headers), new Set(snap[skill].headers))
  }
})
