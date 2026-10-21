// upgrade-plan.mjs run end to end in a scratch git repository in
// the temp folder (offline): a v1 plan committed over a few dated
// commits converts to a v2 plan that plan-check passes, archive
// dates come from git, and the default dry run writes nothing.
// Slower than the pure suite (upgrade-plan.test.mjs): every case
// spawns git. node:test, no deps.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const UPGRADE = fileURLToPath(new URL('../upgrade-plan.mjs', import.meta.url))
const PLAN_CHECK = fileURLToPath(new URL('../plan-check.mjs', import.meta.url))
const TEMPLATES = fileURLToPath(new URL('../../plan/', import.meta.url))

const scratch = []
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }) })

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-'))
  scratch.push(dir)
  const git = (args, date) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf-8', stdio: 'pipe',
    env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` } : {}) },
  }).trim()
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 't@example.com'])
  git(['config', 'user.name', 'T'])
  git(['config', 'commit.gpgsign', 'false'])
  git(['config', 'core.autocrlf', 'false'])
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  const commit = (msg, date) => { git(['add', '-A']); git(['commit', '-q', '-m', msg], date); return git(['rev-parse', '--short', 'HEAD']) }
  return { dir, git, write, commit }
}

const plan = (rows, log = '') => `# 01 — Build plan

## Status (at-a-glance)

${rows}

## Carry-overs / known gaps

(None.)

## Phase log (commit hashes)

${log}
`

function v1Repo() {
  const r = repo()
  r.write('plan/steps/01_build_plan.md', plan('- [ ] Phase 1 — Bootstrap\n- [ ] Phase 2 — Search\n- [ ] Phase 3 — Payments\n- [ ] Phase 4 — Polish'))
  r.write('plan/phases/phase_2_search.md', '# Phase 2 — Search\n\n## Scope\n\nA query finds places.\n')
  r.commit('plan: phases', '2026-05-01')
  r.write('src/a.txt', 'one\n')
  const one = r.commit('feat: bootstrap', '2026-05-17')
  r.write('plan/steps/01_build_plan.md', plan(
    `- [x] Phase 1 — Bootstrap (commit ${one})\n- [x] Phase 2 — Search (this commit)\n- [blocked: no token 2026-06-02]\n      Phase 3 — Payments\n- [ ] Phase 4 — Polish`,
    `- phase 1 — ${one} — bootstrap\n- phase 2 — (this commit) — search`,
  ))
  r.write('src/b.txt', 'two\n')
  const two = r.commit('feat: search', '2026-06-01')
  // Step 2 and 3 of the playbook: the v2 roadmap and archive are in.
  r.write('plan/README.md', fs.readFileSync(path.join(TEMPLATES, 'README.md'), 'utf-8'))
  r.write('plan/ARCHIVE.md', fs.readFileSync(path.join(TEMPLATES, 'ARCHIVE.md'), 'utf-8'))
  r.commit('plan: v2 roadmap', '2026-10-21')
  return { ...r, one, two }
}

const node = (dir, args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf-8' })

test('the default dry run prints what it would write and writes nothing', () => {
  const r = v1Repo()
  const res = node(r.dir, [UPGRADE])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  assert.match(res.stdout, /dry run/i)
  assert.match(res.stdout, /plan\/04-polish\.md/)
  assert.match(res.stdout, /plan-check on the result: green/)
  assert.equal(r.git(['status', '--porcelain']), '')
})

test('--write converts the v1 plan to one plan-check passes, archive dated from git', () => {
  const r = v1Repo()
  const res = node(r.dir, [UPGRADE, '--write'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  const archive = fs.readFileSync(path.join(r.dir, 'plan/ARCHIVE.md'), 'utf-8')
  assert.match(archive, new RegExp(`^- 2026-05-17 · 01 · Bootstrap · ${r.one}$`, 'm'))
  assert.match(archive, new RegExp(`^- 2026-06-01 · 02 · Search · ${r.two}$`, 'm'), 'a "(this commit)" row takes the commit that ticked it')
  assert.ok(fs.existsSync(path.join(r.dir, 'plan/03-payments.md')))
  assert.ok(fs.existsSync(path.join(r.dir, 'plan/04-polish.md')))
  const readme = fs.readFileSync(path.join(r.dir, 'plan/README.md'), 'utf-8')
  assert.match(readme, /^- \*\*03\*\* · blocked: no token 2026-06-02$/m)
  const check = node(r.dir, [PLAN_CHECK])
  assert.equal(check.status, 0, check.stdout + check.stderr)
  assert.match(check.stdout, /plan-check: green \(2 specs, 0 chunks\)/)
  const since = node(r.dir, [PLAN_CHECK, '--since', 'HEAD'])
  assert.equal(since.status, 0, since.stdout + since.stderr)
})

test('a repo with no v1 build plan is refused, nothing written', () => {
  const r = repo()
  r.write('plan/README.md', fs.readFileSync(path.join(TEMPLATES, 'README.md'), 'utf-8'))
  r.commit('plan: v2', '2026-10-21')
  const res = node(r.dir, [UPGRADE, '--write'])
  assert.equal(res.status, 1)
  assert.match(res.stderr + res.stdout, /01_build_plan\.md/)
  assert.equal(r.git(['status', '--porcelain']), '')
})
