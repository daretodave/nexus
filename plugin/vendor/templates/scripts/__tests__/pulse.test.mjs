// scripts/pulse.mjs, run in a scratch repo: the project's name from package.json, open finding rows only (a `### [x]`
// left under Pending and a pass-summary heading are not counted), a file with no `## Pending` heading read whole, and
// a `Last pass:` header that carries more than a date still gives an age.
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = []
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }) })

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pulse-'))
  scratch.push(dir)
  // pulse.mjs's ROOT is its own folder's parent; its --motion import pulls in the plan scripts' own imports.
  fs.cpSync(SCRIPTS, path.join(dir, 'scripts'), { recursive: true, filter: (f) => !/[\\/](__tests__|node_modules)([\\/]|$)/.test(f) })
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' }
  for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'feat: seed']]) spawnSync('git', args, { cwd: dir, env })
  return dir
}

const pulse = (dir) => spawnSync(process.execPath, [path.join(dir, 'scripts', 'pulse.mjs')], { cwd: dir, encoding: 'utf8' }).stdout

describe('pulse', () => {
  it('counts open rows only, reads a Pending-less file whole, and ages a timestamped Last pass', () => {
    const dir = repo({
      'package.json': '{ "name": "@acme/field-notes" }\n',
      'plan/README.md': '# Plan\n',
      'plan/AUDIT.md': [
        '# Audit', '', '## Drained findings', '', '### [x] [seo] [3.0] done', '',
        '## Open findings', '', '### [ ] [seo] [2.7] open', '### [needs-user-call] [bug] [4.2] waits on the owner', '',
      ].join('\n'),
      'plan/CRITIQUE.md': [
        '# Critique', '', '> Last pass: 2026-05-10T20:35:00Z at commit 931c8a7', '', '## Pending', '',
        '### [x] addressed, left in place', '### [x] another', '### [needs-user-call] a real one', '### Pass-7 self-assessment summary', '',
        '## Done', '', '### [ ] not under Pending', '',
      ].join('\n'),
      'plan/CANDIDATES.md': [
        '# Candidates', '', '## Pending', '', '### [ ] [score 6.0] one', '- proposed: 2026-05-01', '### [x] [score 5.0] promoted', '- proposed: 2026-04-01', '',
      ].join('\n'),
    })
    const out = pulse(dir)
    assert.match(out, /^pulse — field-notes$/m)
    assert.match(out, /^ {2}audit {13}2 pending$/m)
    assert.match(out, /^ {2}critique {10}1 pending, last pass \d+d ago$/m)
    assert.match(out, /^ {2}candidates {8}1 pending, oldest \d+d ago$/m)
  })

  it('a never-passed critique prints no age; no package.json names the folder', () => {
    const dir = repo({
      'plan/README.md': '# Plan\n',
      'plan/AUDIT.md': '# Audit\n\n## Pending\n\n### [B, 5.6] a row with no checkbox\n\n## Done\n\n### [x] [A, 4.5] done\n',
      'plan/CRITIQUE.md': '# Critique\n\n> Last pass: never\n\n## Pending\n\n## Done\n',
    })
    const out = pulse(dir)
    assert.match(out, new RegExp(`^pulse — ${path.basename(dir)}$`, 'm'))
    assert.match(out, /^ {2}audit {13}1 pending$/m)
    assert.match(out, /^ {2}critique {10}0 pending$/m)
  })
})
