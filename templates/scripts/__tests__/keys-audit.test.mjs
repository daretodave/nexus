// Unit tests for scripts/keys-audit.mjs: a pure-string, offline lint over a custody table (identity/key-custody.md,
// or setup/00_keys.md, the adopter's twin) against nexus.secrets.json's names. node:test, no deps.
//
//   node --test templates/scripts/__tests__/keys-audit.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { auditKeysCustody, lintCustody, namesElsewhere, parseCustodyKeys } from '../keys-audit.mjs'

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-audit '))
  return { root, done: () => fs.rmSync(root, { recursive: true, force: true }) }
}

const table = (rows) => [
  '# identity/key-custody.md — the kit\'s own keys',
  '',
  '## Index',
  '',
  '| Key | Holder file | Minted by | Scopes | Mirrored to | Expires | Rotate via |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((k) => `| \`${k}\` | .env | someone | n/a | n/a | n/a | — |`),
  '',
].join('\n')

const manifest = (names) => JSON.stringify({
  version: 1,
  secrets: names.map((name) => ({ name, for: 'a secret', where: null, destinations: ['local'], provider: 'owner', chunk: null })),
}, null, 2)

function write(root, custodyFile, rows, names) {
  fs.mkdirSync(path.dirname(path.join(root, custodyFile)), { recursive: true })
  fs.writeFileSync(path.join(root, custodyFile), table(rows))
  fs.writeFileSync(path.join(root, 'nexus.secrets.json'), manifest(names))
}

describe('parseCustodyKeys', () => {
  it('reads the Index table\'s first column, in order, skipping the header and divider rows', () => {
    const text = table(['GH_TOKEN', 'ACTIONS_PAT'])
    assert.deepEqual(parseCustodyKeys(text), ['GH_TOKEN', 'ACTIONS_PAT'])
  })

  it('stops at the next heading, and returns nothing with no Index table', () => {
    const text = `${table(['GH_TOKEN'])}\n## Elsewhere\n\n| Key |\n|---|\n| \`NOT_THIS\` |\n`
    assert.deepEqual(parseCustodyKeys(text), ['GH_TOKEN'])
    assert.deepEqual(parseCustodyKeys('# no index here\n'), [])
  })

  it('counts a key once per row that claims it (ambiguity shows up as a repeat)', () => {
    assert.deepEqual(parseCustodyKeys(table(['GH_TOKEN', 'GH_TOKEN'])), ['GH_TOKEN', 'GH_TOKEN'])
  })
})

describe('lintCustody', () => {
  const none = () => false
  const all = () => true

  it('is clean when every custody key is in the manifest and every manifest name has a row', () => {
    assert.deepEqual(lintCustody('f.md', ['GH_TOKEN', 'ACTIONS_PAT'], new Set(['GH_TOKEN', 'ACTIONS_PAT']), none), [])
  })

  it('flags an orphan row: not in the manifest, and no code or doc names it elsewhere', () => {
    const problems = lintCustody('f.md', ['GH_TOKEN', 'STRAY_KEY'], new Set(['GH_TOKEN']), none)
    assert.deepEqual(problems, ['f.md: orphan custody row "STRAY_KEY" (not in the manifest, and no code or doc elsewhere names it)'])
  })

  it('does not flag a key absent from the manifest when it is found elsewhere (the CLAUDE_CODE_OAUTH_TOKEN case)', () => {
    const problems = lintCustody('f.md', ['GH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'], new Set(['GH_TOKEN']), (k) => k === 'CLAUDE_CODE_OAUTH_TOKEN')
    assert.deepEqual(problems, [])
  })

  it('flags a ghost entry: a manifest name with no custody row', () => {
    const problems = lintCustody('f.md', ['GH_TOKEN'], new Set(['GH_TOKEN', 'VERCEL_TOKEN']), all)
    assert.deepEqual(problems, ['f.md: ghost manifest entry "VERCEL_TOKEN" (no custody row in f.md)'])
  })

  it('flags an ambiguous row: two rows claim the same key, once per duplicate count', () => {
    const problems = lintCustody('f.md', ['GH_TOKEN', 'GH_TOKEN', 'GH_TOKEN'], new Set(['GH_TOKEN']), all)
    assert.deepEqual(problems, ['f.md: ambiguous custody row "GH_TOKEN" (3 rows claim it)'])
  })
})

describe('namesElsewhere', () => {
  it('finds a whole-word match in another file, skips the excluded custody file, node_modules and .git', () => {
    const s = scratch()
    try {
      fs.mkdirSync(path.join(s.root, 'identity'), { recursive: true })
      fs.writeFileSync(path.join(s.root, 'identity', 'key-custody.md'), table(['STRAY_KEY']))
      fs.writeFileSync(path.join(s.root, 'agents.md'), 'set STRAY_KEY before you start\n')
      fs.mkdirSync(path.join(s.root, 'node_modules'), { recursive: true })
      fs.writeFileSync(path.join(s.root, 'node_modules', 'noise.js'), 'STRAY_KEY_DECOY STRAY_KEY\n')
      const found = namesElsewhere(s.root, ['STRAY_KEY', 'NOWHERE_KEY'], 'identity/key-custody.md')
      assert.deepEqual([...found], ['STRAY_KEY'])
    } finally { s.done() }
  })
})

describe('auditKeysCustody', () => {
  it('a clean table against the manifest: no failures', () => {
    const s = scratch()
    try {
      write(s.root, 'identity/key-custody.md', ['GH_TOKEN', 'ACTIONS_PAT'], ['GH_TOKEN', 'ACTIONS_PAT'])
      const { failures, note } = auditKeysCustody(s.root, 'identity/key-custody.md')
      assert.deepEqual(failures, [])
      assert.match(note, /2 custody rows against 2 manifest names/)
    } finally { s.done() }
  })

  it('flags an orphan row absent from the manifest and from the rest of the tree', () => {
    const s = scratch()
    try {
      write(s.root, 'identity/key-custody.md', ['GH_TOKEN', 'STRAY_KEY'], ['GH_TOKEN'])
      const { failures } = auditKeysCustody(s.root, 'identity/key-custody.md')
      assert.deepEqual(failures, ['identity/key-custody.md: orphan custody row "STRAY_KEY" (not in the manifest, and no code or doc elsewhere names it)'])
    } finally { s.done() }
  })

  it('flags a ghost manifest entry with no custody row', () => {
    const s = scratch()
    try {
      write(s.root, 'identity/key-custody.md', ['GH_TOKEN'], ['GH_TOKEN', 'VERCEL_TOKEN'])
      const { failures } = auditKeysCustody(s.root, 'identity/key-custody.md')
      assert.deepEqual(failures, ['identity/key-custody.md: ghost manifest entry "VERCEL_TOKEN" (no custody row in identity/key-custody.md)'])
    } finally { s.done() }
  })

  it('flags an ambiguous duplicate row', () => {
    const s = scratch()
    try {
      write(s.root, 'identity/key-custody.md', ['GH_TOKEN', 'GH_TOKEN'], ['GH_TOKEN'])
      const { failures } = auditKeysCustody(s.root, 'identity/key-custody.md')
      assert.deepEqual(failures, ['identity/key-custody.md: ambiguous custody row "GH_TOKEN" (2 rows claim it)'])
    } finally { s.done() }
  })

  it('does not flag a key the manifest omits on purpose when real code elsewhere names it (CLAUDE_CODE_OAUTH_TOKEN)', () => {
    const s = scratch()
    try {
      write(s.root, 'identity/key-custody.md', ['GH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'], ['GH_TOKEN'])
      fs.writeFileSync(path.join(s.root, 'agents.md'), 'the cloud loop signs in with CLAUDE_CODE_OAUTH_TOKEN\n')
      const { failures } = auditKeysCustody(s.root, 'identity/key-custody.md')
      assert.deepEqual(failures, [])
    } finally { s.done() }
  })

  it('falls back to setup/00_keys.md when no explicit file and no identity/key-custody.md exist', () => {
    const s = scratch()
    try {
      write(s.root, 'setup/00_keys.md', ['GH_TOKEN'], ['GH_TOKEN'])
      const { failures, note } = auditKeysCustody(s.root)
      assert.deepEqual(failures, [])
      assert.match(note, /^setup\/00_keys\.md:/)
    } finally { s.done() }
  })

  it('reports no custody table found when neither file exists', () => {
    const s = scratch()
    try {
      const { failures, note } = auditKeysCustody(s.root)
      assert.deepEqual(failures, [])
      assert.equal(note, 'no custody table found')
    } finally { s.done() }
  })
})
