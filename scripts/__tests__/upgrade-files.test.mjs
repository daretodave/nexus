// The computed v2 kit file list (scripts/upgrade-files.mjs): the closure walk, the
// playbook appendix it generates, and the upgrade leg's three failures. Pure: a scratch
// kit in the temp folder, no git, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  appendix, BEGIN, callsOf, check, closure, doorCheck, doorSection, END, importsOf, namedPaths, namesIn, repoPath, syncFiles, UNNAMED, upgradeFiles, writeAppendix,
} from '../upgrade-files.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function kit(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-files-'))
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
  return root
}

const BASE = {
  'templates/scripts/plan-check.mjs': "import { a } from './plan/pending.mjs'\nexport const x = 1\n",
  'templates/scripts/plan/pending.mjs': "export { b } from './settled.mjs'\n",
  'templates/scripts/plan/settled.mjs': 'export const b = 1\n',
  'templates/scripts/upgrade-plan.mjs': "import { x } from './plan-check.mjs'\n",
  'templates/scripts/claims.mjs': "const o = await import('./owner.mjs')\n",
  'templates/scripts/owner.mjs': "const v = new URL('./vault.mjs', import.meta.url)\n",
  'templates/scripts/vault.mjs': '// the vault\n',
  'templates/scripts/cloud/tick.mjs': '// import nothing\n',
  'templates/scripts/cloud/idle.mjs': '// the idle probe\n',
  'templates/scripts/workflow-lint.mjs': '// the lint\n',
  'templates/.github/workflows/march.yml': 'jobs:\n  owner:\n    steps:\n      - run: node scripts/cloud/idle.mjs probe\n',
  'templates/scripts/unlisted.mjs': '// nobody imports me\n',
  'templates/scripts/__tests__/plan-check.test.mjs': "import { x } from '../plan-check.mjs'\nconst fixtures = new URL('../plan', import.meta.url)\n",
  'templates/skills/next.md': '# next\n\n`node scripts/ledger.mjs beat` and `node scripts/snapshot.mjs` (an example).\n',
  'templates/skills/march.lanes.md': '# lanes\n',
  'templates/scripts/ledger.mjs': 'export {}\n',
  'templates/claude/commands/next.md': '---\n---\n$ARGUMENTS\n',
  'templates/.github/actions/setup/action.yml': 'name: setup\n',
  'playbooks/upgrade.md': `# upgrade\n\nRun \`templates/scripts/upgrade-plan.mjs\`.\n\n${BEGIN}\n${END}\n`,
}

test('importsOf reads static, re-export, dynamic and new URL imports, not commented ones', () => {
  const text = [
    "import a from './a.mjs'",
    "export { b } from '../b.mjs'",
    "const c = await import('./c.mjs')",
    "const d = new URL('./d.mjs', import.meta.url)",
    "// import e from './e.mjs'",
    "/* import f from './f.mjs' */",
    "import fs from 'node:fs'",
  ].join('\n')
  assert.deepEqual(importsOf(text), ['./a.mjs', '../b.mjs', './c.mjs', './d.mjs'])
})

test('callsOf names the scripts a skill calls', () => {
  assert.deepEqual(callsOf('run `node scripts/plan/order.mjs --json`, then scripts/claims.mjs; not myscripts/x.mjs'), ['plan/order.mjs', 'claims.mjs'])
})

test('closure walks imports and reports a gone target with its importer', () => {
  const root = kit({ 'a.mjs': "import './b.mjs'\nimport './gone.mjs'\n", 'b.mjs': "import './a.mjs'\n" })
  assert.deepEqual(closure(root, ['a.mjs']), { files: ['a.mjs', 'b.mjs'], missing: ['a.mjs -> gone.mjs'] })
})

test('repoPath maps templates/claude to .claude and strips templates/', () => {
  assert.equal(repoPath('templates/claude/commands/next.md'), '.claude/commands/next.md')
  assert.equal(repoPath('templates/scripts/plan/order.mjs'), 'scripts/plan/order.mjs')
  assert.equal(repoPath('templates/.github/actions/setup/action.yml'), '.github/actions/setup/action.yml')
})

test('the list is the closures plus the fixed files, a skill-named example and an unimported script left out', () => {
  const root = kit(BASE)
  const { files, missing } = upgradeFiles(root)
  assert.deepEqual(missing, [])
  const kits = files.map((f) => f.kit)
  // workflow-lint is an entry (the upgrade's gate runs it); cloud/idle.mjs is called by the march.yml the upgrade merges.
  for (const want of ['plan-check.mjs', 'plan/pending.mjs', 'plan/settled.mjs', 'upgrade-plan.mjs', 'claims.mjs', 'owner.mjs', 'vault.mjs', 'cloud/tick.mjs', 'ledger.mjs', '__tests__/plan-check.test.mjs', 'workflow-lint.mjs', 'cloud/idle.mjs']) {
    assert.ok(kits.includes(`templates/scripts/${want}`), want)
  }
  assert.ok(!kits.includes('templates/scripts/unlisted.mjs'))
  assert.ok(!kits.some((k) => k.endsWith('/plan')), 'a URL to a folder is not a file')
  const byKit = Object.fromEntries(files.map((f) => [f.kit, f]))
  assert.equal(byKit['templates/skills/march.lanes.md'].kind, 'lane')
  assert.equal(byKit['templates/claude/commands/next.md'].repo, '.claude/commands/next.md')
  assert.equal(byKit['templates/.github/actions/setup/action.yml'].kind, 'action')
})

test('a listed script\'s kit test ships as a twin when its imports are listed; one that loads an unlisted file does not', () => {
  const root = kit({
    ...BASE,
    'templates/scripts/__tests__/ledger.test.mjs': "import { x } from '../ledger.mjs'\n",
    'templates/scripts/__tests__/owner.test.mjs': "import { o } from '../owner.mjs'\nimport { f } from './fixtures/owner.mjs'\n",
    'templates/scripts/__tests__/fixtures/owner.mjs': 'export const f = 1\n',
    'templates/scripts/__tests__/unlisted.test.mjs': "import '../unlisted.mjs'\n",
  })
  const { files } = upgradeFiles(root)
  const byKit = Object.fromEntries(files.map((f) => [f.kit, f]))
  assert.deepEqual(byKit['templates/scripts/__tests__/ledger.test.mjs'], { kit: 'templates/scripts/__tests__/ledger.test.mjs', repo: 'scripts/__tests__/ledger.test.mjs', kind: 'twin' })
  assert.equal(byKit['templates/scripts/__tests__/owner.test.mjs'], undefined, 'a fixture the list lacks keeps the twin out')
  assert.equal(byKit['templates/scripts/__tests__/unlisted.test.mjs'], undefined, 'no twin for an unlisted script')
  assert.equal(byKit['templates/scripts/__tests__/plan-check.test.mjs'].kind, 'test', 'a fixed test stays a test')
  const text = appendix(files)
  assert.ok(!/cp [^\n]*ledger\.test\.mjs/.test(text), 'a twin is no blind copy')
  assert.match(text, /go only over a copy your repo already has[^\n]*`scripts\/__tests__\/ledger\.test\.mjs`/)
  writeAppendix(root)
  assert.deepEqual(check(root).problems, [])
})

test('the appendix has a table row and both shells per folder, and leaves the lanes files to a note', () => {
  const { files } = upgradeFiles(kit(BASE))
  const text = appendix(files)
  assert.ok(text.startsWith(BEGIN) && text.endsWith(END))
  assert.match(text, /\| `scripts\/plan\/` \| `pending\.mjs`, `settled\.mjs` \|/)
  assert.match(text, /```bash\nmkdir -p \.claude\/commands\ncp \.\.\/nexus\/templates\/claude\/commands\/next\.md \\\n   \.claude\/commands\//)
  assert.match(text, /```powershell\nNew-Item -ItemType Directory -Force \.claude\\commands \| Out-Null\nCopy-Item -Destination \.claude\\commands -Path \.\.\\nexus\\templates\\claude\\commands\\next\.md/)
  assert.ok(!/cp [^\n]*march\.lanes\.md/.test(text))
  assert.match(text, /`skills\/march\.lanes\.md`\) are copied only when your repo has none/)
})

test('check is green once the appendix is written, and red when it is stale', () => {
  const root = kit(BASE)
  assert.match(check(root).problems.join('\n'), /the manual appendix is stale/)
  assert.equal(writeAppendix(root), true)
  assert.deepEqual(check(root).problems, [])
  assert.equal(writeAppendix(root), false)
  // A listed script starts importing a file the list (as the playbook has it) lacks.
  fs.writeFileSync(path.join(root, 'templates/scripts/cloud/tick.mjs'), "import '../unlisted.mjs'\n")
  assert.match(check(root).problems.join('\n'), /the manual appendix is stale \(lacks templates\/scripts\/unlisted\.mjs\)/)
})

test('check is red when a listed script imports a file that is gone', () => {
  const root = kit({ ...BASE, 'templates/scripts/cloud/tick.mjs': "import './quota.mjs'\n" })
  writeAppendix(root)
  assert.deepEqual(check(root).problems, ['templates/scripts: a listed script imports a file that does not exist (cloud/tick.mjs -> cloud/quota.mjs)'])
})

test('check is red when the playbook names a kit file that does not exist', () => {
  const root = kit({ ...BASE, 'playbooks/upgrade.md': BASE['playbooks/upgrade.md'].replace('upgrade-plan.mjs', 'upgrade-plans.mjs') })
  writeAppendix(root)
  assert.deepEqual(check(root).problems, ['playbooks/upgrade.md names templates/scripts/upgrade-plans.mjs, which does not exist'])
})

test('check is red when the playbook has no appendix markers', () => {
  const root = kit({ ...BASE, 'playbooks/upgrade.md': '# upgrade\n' })
  assert.match(check(root).problems.join('\n'), /no generated appendix/)
})

test('the sync set is the list plus every kit workflow and the scripts they call', () => {
  const root = kit({
    ...BASE,
    'templates/.github/workflows/heartbeat.yml': 'jobs:\n  beat:\n    steps:\n      - run: node scripts/cloud/beat.mjs\n',
    'templates/scripts/cloud/beat.mjs': "import './beat-lib.mjs'\n",
    'templates/scripts/cloud/beat-lib.mjs': 'export {}\n',
  })
  const listed = new Set(upgradeFiles(root).files.map((f) => f.kit))
  const { files, missing } = syncFiles(root)
  assert.deepEqual(missing, [])
  const extra = files.filter((f) => !listed.has(f.kit)).map((f) => [f.kit, f.repo, f.kind])
  assert.deepEqual(extra, [
    ['templates/.github/workflows/heartbeat.yml', '.github/workflows/heartbeat.yml', 'workflow'],
    ['templates/.github/workflows/march.yml', '.github/workflows/march.yml', 'workflow'],
    ['templates/scripts/cloud/beat-lib.mjs', 'scripts/cloud/beat-lib.mjs', 'script'],
    ['templates/scripts/cloud/beat.mjs', 'scripts/cloud/beat.mjs', 'script'],
  ])
  assert.equal(files.length, listed.size + extra.length, 'the list is all there too')
})

test('check is red when a script a kit workflow calls imports a file that is gone', () => {
  const root = kit({
    ...BASE,
    'templates/.github/workflows/heartbeat.yml': 'jobs:\n  beat:\n    steps:\n      - run: node scripts/cloud/beat.mjs\n',
    'templates/scripts/cloud/beat.mjs': "import './gone.mjs'\n",
  })
  writeAppendix(root)
  assert.deepEqual(check(root).problems, ['templates/scripts: a script a kit workflow calls imports a file that does not exist (cloud/beat.mjs -> cloud/gone.mjs)'])
})

test('namedPaths reads ../nexus, bare and backslashed paths and folders, not placeholders', () => {
  assert.deepEqual(namedPaths('cp ../nexus/templates/a/b.md x; ..\\nexus\\templates\\c\\d.mjs; templates/<NAME>.md; `templates/skills/`'), ['templates/a/b.md', 'templates/c/d.mjs', 'templates/skills'])
})

test('the kit itself: the list holds plan-check closure, next and plot callees, and the playbook matches', () => {
  const { problems, files } = check(REPO)
  assert.deepEqual(problems, [])
  const kits = new Set(files.map((f) => f.kit))
  for (const want of ['plan/pending.mjs', 'plan/settled.mjs', 'plan/secrets-manifest.mjs', 'owner.mjs', 'plan/config.mjs', 'plan/footguns.mjs', 'plan/settle.mjs', 'claims.mjs', 'plan/order.mjs', 'cloud/tick.mjs', 'upgrade-plan.mjs', 'workflow-lint.mjs', 'cloud/quota.mjs', 'cloud/idle.mjs', 'cloud/lost.mjs']) {
    assert.ok(kits.has(`templates/scripts/${want}`), want)
  }
  for (const want of ['templates/skills/next.md', 'templates/skills/plot.md', 'templates/claude/commands/next.md', 'templates/.github/actions/setup/action.yml']) assert.ok(kits.has(want), want)
})

// --- the door (spec 58, A10) ---
// A made-up adopter name, hashed the way UNNAMED is, so no test names a real one.

const FAKE = createHash('sha256').update('zorblat').digest('hex').slice(0, 16)
const FENCE = '```'
const DOOR_README = [
  '# kit', '', '## Three doors in', '', 'Pick one.', '',
  '## Used v1? On v2?', '',
  `${FENCE}bash`, 'npx @usenexus/cli upgrade', 'npx @usenexus/cli upgrade --write', FENCE, '',
  '**On v2?** The same command syncs the repo to the latest kit.', '',
  'The runbook: [x](./playbooks/upgrade.md); any agent: [y](./prompts/upgrade.md).', '',
  '---', '', '## How it works', '', 'A loop like zorblat.', '',
].join('\n')
const DOOR_KIT = {
  'README.md': DOOR_README,
  'prompts/upgrade.md': '# prompt\n\nRead ../nexus/playbooks/upgrade.md, then run npx @usenexus/cli upgrade.\n',
  'playbooks/upgrade.md': '# upgrade\n\n`npx @usenexus/cli upgrade`, the kit at https://github.com/daretodave/nexus/tree/v1.0.0.\n\n## On v2: the same command syncs to latest\n',
  'packages/cli/bin/nexus.mjs': "if (argv[0] === 'upgrade') {}\n",
}
const without = (rel) => Object.fromEntries(Object.entries(DOOR_KIT).filter(([k]) => k !== rel))

test('doorSection is the Used v1? section up to the next heading or rule, null when absent', () => {
  const s = doorSection(DOOR_README)
  assert.match(s, /^## Used v1\? On v2\?/)
  assert.ok(s.includes('--write'))
  assert.ok(!s.includes('How it works'))
  assert.equal(doorSection('# kit\n\n## Three doors in\n'), null)
})

test('doorCheck is green on a door that gives the dry run and --write and links the playbook and prompt', async () => {
  assert.deepEqual((await doorCheck(kit(DOOR_KIT), [FAKE])).problems, [])
})

test('doorCheck is red without the section, the prompt, --write, or a CLI that dispatches upgrade', async () => {
  const none = await doorCheck(kit({ ...DOOR_KIT, 'README.md': '# kit\n' }), [FAKE])
  assert.deepEqual(none.problems, ['README.md: no "Used v1?" section beside the doors (spec 58, A10)'])
  assert.deepEqual((await doorCheck(kit(without('prompts/upgrade.md')), [FAKE])).problems, ['prompts/upgrade.md: missing (the upgrade\'s paste prompt)'])
  const noWrite = await doorCheck(kit({ ...DOOR_KIT, 'README.md': DOOR_README.replace('upgrade --write', 'upgrade --json') }), [FAKE])
  assert.deepEqual(noWrite.problems, ['README.md "Used v1?": does not give `npx @usenexus/cli upgrade --write`'])
  const noLink = await doorCheck(kit({ ...DOOR_KIT, 'README.md': DOOR_README.replace('](./playbooks/upgrade.md)', ']') }), [FAKE])
  assert.deepEqual(noLink.problems, ['README.md "Used v1?": does not link playbooks/upgrade.md'])
  const noCli = await doorCheck(kit({ ...DOOR_KIT, 'packages/cli/bin/nexus.mjs': "if (argv[0] === 'run') {}\n" }), [FAKE])
  assert.deepEqual(noCli.problems, ['README.md "Used v1?": packages/cli/bin/nexus.mjs does not dispatch `upgrade`'])
})

test('doorCheck is red when the door or the playbook stops saying the same command syncs a v2 repo (A12)', async () => {
  const noV2 = await doorCheck(kit({ ...DOOR_KIT, 'README.md': DOOR_README.replace('**On v2?** The same command syncs the repo to the latest kit.', 'Upgrade once.') }), [FAKE])
  assert.deepEqual(noV2.problems, ['README.md "Used v1?": does not say the same command syncs a v2 repo to the latest kit ("On v2?", spec 58, A12)'])
  const noSection = await doorCheck(kit({ ...DOOR_KIT, 'playbooks/upgrade.md': DOOR_KIT['playbooks/upgrade.md'].replace('## On v2', '## Later') }), [FAKE])
  assert.deepEqual(noSection.problems, ['playbooks/upgrade.md: no "## On v2" section saying the same command syncs a v2 repo (spec 58, A12)'])
})

test('doorCheck is red when the door, prompt or playbook names an adopter or a foreign repo; the kit slug is fine', async () => {
  const named = await doorCheck(kit({ ...DOOR_KIT, 'prompts/upgrade.md': `${DOOR_KIT['prompts/upgrade.md']}Like the Zorblat loop.\n` }), [FAKE])
  assert.deepEqual(named.problems, ['prompts/upgrade.md:4 names an adopter repo name; public upgrade docs describe patterns, never an adopter'])
  const slugs = await namesIn('see https://github.com/someone/thing, and https://github.com/daretodave/nexus.git', [FAKE])
  assert.deepEqual(slugs, [{ what: 'the repo someone/thing', line: 1 }])
  // README's other sections are not the door's business (the fixture's "How it works" names the fake).
  assert.deepEqual((await doorCheck(kit(DOOR_KIT), [FAKE])).problems, [])
})

test('the kit itself: the door, the prompt and the playbook point at the command and name no adopter', async () => {
  assert.ok(UNNAMED.length > 0)
  assert.deepEqual((await doorCheck(REPO)).problems, [])
})
