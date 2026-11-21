// The plugin generator: plugin/.claude-plugin/plugin.json, a vendored
// templates/ snapshot, and .claude-plugin/marketplace.json, from
// plan/nexus.lock — deterministic, and --check names a hand edit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readLockVersion,
  buildPluginManifest,
  buildMarketplace,
  buildCommand,
  listTemplateFiles,
  render,
  write,
  check,
} from '../build-plugin.mjs'

const SCRIPT = fileURLToPath(new URL('../build-plugin.mjs', import.meta.url))
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-build-plugin-'))
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'plan', 'nexus.lock'), 'kit: nexus\nversion: 9.9.9\nref: v9.9.9\nshape: chunks\n')
  const templatesDir = path.join(dir, 'templates')
  fs.mkdirSync(path.join(templatesDir, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(templatesDir, 'a.md'), '# a\n')
  fs.writeFileSync(path.join(templatesDir, 'nested', 'b.md'), '# b\n')
  // The three wrapped prompts and the doctor script, so render()'s
  // prompt/script vendoring has something to read.
  const promptsDir = path.join(dir, 'prompts')
  fs.mkdirSync(promptsDir, { recursive: true })
  for (const name of ['adopt.md', 'upgrade.md', 'doctor.md']) {
    fs.writeFileSync(path.join(promptsDir, name), `# ${name} fixture\n`)
  }
  const scriptsDir = path.join(dir, 'scripts')
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.writeFileSync(path.join(scriptsDir, 'plugin-doctor.mjs'), '// plugin-doctor.mjs fixture\n')
  return dir
}

test('readLockVersion reads the repo\'s own plan/nexus.lock', () => {
  assert.equal(readLockVersion(ROOT), '2.0.0')
})

test('readLockVersion reads a scratch lock file', () => {
  const dir = scratchRepo()
  try {
    assert.equal(readLockVersion(dir), '9.9.9')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('plugin.json: name is required, kebab-case, no claude-/anthropic- prefix, version is free-form', () => {
  const manifest = buildPluginManifest('2.0.0')
  assert.equal(manifest.name, 'nexus')
  assert.match(manifest.name, /^[a-z][a-z0-9-]*$/)
  assert.doesNotMatch(manifest.name, /^(claude-|anthropic-)/)
  assert.equal(manifest.version, '2.0.0')
  assert.equal(typeof manifest.description, 'string')
  assert.ok(manifest.description.length > 0)
  assert.equal(manifest.author.name, 'daretodave and nexus contributors')
})

test('marketplace.json shape: name, owner.name, plugins[] with name + source', () => {
  const marketplace = buildMarketplace()
  assert.equal(marketplace.name, 'nexus')
  assert.equal(marketplace.owner.name, 'daretodave')
  assert.equal(typeof marketplace.description, 'string')
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1)
  const [entry] = marketplace.plugins
  assert.equal(entry.name, 'nexus')
  assert.equal(entry.source, './plugin')
  assert.match(entry.source, /^\.\//)
  assert.ok(!entry.source.includes('..'))
  // version is set only in plugin.json, per the schema notes, to avoid
  // a mismatch warning between the two.
  assert.equal('version' in entry, false)
  assert.equal(typeof entry.description, 'string')
})

test('listTemplateFiles: sorted, relative to templates/, no directory entries', () => {
  const dir = scratchRepo()
  try {
    const files = listTemplateFiles(dir)
    assert.deepEqual(files, ['a.md', 'nested/b.md'])
    assert.deepEqual([...files].sort(), files)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('render is byte-identical across calls and vendors every templates/ file untouched', () => {
  const dir = scratchRepo()
  try {
    const a = render(dir)
    const b = render(dir)
    assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort())
    for (const [rel, body] of a) assert.equal(Buffer.compare(body, b.get(rel)), 0, rel)
    assert.ok(a.has('plugin/vendor/templates/a.md'))
    assert.ok(a.has('plugin/vendor/templates/nested/b.md'))
    assert.equal(a.get('plugin/vendor/templates/a.md').toString('utf-8'), '# a\n')
    const manifest = JSON.parse(a.get('plugin/.claude-plugin/plugin.json').toString('utf-8'))
    assert.equal(manifest.version, '9.9.9')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('render vendors the three wrapped prompts and the doctor script byte-for-byte', () => {
  const dir = scratchRepo()
  try {
    const out = render(dir)
    for (const name of ['adopt.md', 'upgrade.md', 'doctor.md']) {
      assert.ok(out.has(`plugin/vendor/prompts/${name}`))
      assert.equal(out.get(`plugin/vendor/prompts/${name}`).toString('utf-8'), `# ${name} fixture\n`)
    }
    assert.equal(out.get('plugin/vendor/scripts/plugin-doctor.mjs').toString('utf-8'), '// plugin-doctor.mjs fixture\n')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('render generates the three commands: frontmatter description, the vendored-prompt pointer, $ARGUMENTS', () => {
  const dir = scratchRepo()
  try {
    const out = render(dir)
    for (const name of ['adopt', 'upgrade', 'doctor']) {
      const text = out.get(`plugin/commands/${name}.md`).toString('utf-8')
      assert.match(text, /^---\ndescription: .+\n---\n\n/)
      assert.match(text, new RegExp('\\$\\{CLAUDE_PLUGIN_ROOT\\}/vendor/prompts/' + name + '\\.md'))
      assert.doesNotMatch(text, /\.\.\/nexus\//, `${name}.md: no path into this repo`)
      assert.match(text, /\nArgument: \$ARGUMENTS\n$/)
    }
    // doctor's command also redirects the one script path its
    // prompt names, to the vendored copy.
    assert.match(out.get('plugin/commands/doctor.md').toString('utf-8'), /\$\{CLAUDE_PLUGIN_ROOT\}\/vendor\/scripts\/plugin-doctor\.mjs/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('buildCommand throws on an unknown command name', () => {
  assert.throws(() => buildCommand('nope'), /no command spec/)
})

test('--check is clean on fresh output and names a tampered, missing or stray vendored file', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    assert.deepEqual(check(dir), [])

    const manifestPath = path.join(dir, 'plugin', '.claude-plugin', 'plugin.json')
    fs.writeFileSync(manifestPath, fs.readFileSync(manifestPath, 'utf-8').replace('9.9.9', '9.9.8'))
    const vendored = path.join(dir, 'plugin', 'vendor', 'templates', 'a.md')
    fs.rmSync(vendored)
    const stray = path.join(dir, 'plugin', 'vendor', 'templates', 'stray.md')
    fs.writeFileSync(stray, 'hand-added\n')

    const problems = check(dir)
    assert.equal(problems.length, 3, problems.join('\n'))
    assert.match(problems.join('\n'), /plugin\/\.claude-plugin\/plugin\.json: differs/)
    assert.match(problems.join('\n'), /plugin\/vendor\/templates\/a\.md: missing/)
    assert.match(problems.join('\n'), /plugin\/vendor\/templates\/stray\.md: not generated/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('check() flags a stray file anywhere under plugin/, not just vendor/templates/', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    assert.deepEqual(check(dir), [])
    fs.writeFileSync(path.join(dir, 'plugin', 'commands', 'hand-added.md'), 'hand-added\n')
    fs.writeFileSync(path.join(dir, 'plugin', 'vendor', 'prompts', 'stray.md'), 'hand-added\n')
    const problems = check(dir)
    assert.equal(problems.length, 2, problems.join('\n'))
    assert.match(problems.join('\n'), /plugin\/commands\/hand-added\.md: not generated/)
    assert.match(problems.join('\n'), /plugin\/vendor\/prompts\/stray\.md: not generated/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('write() clears the whole generated tree, so a command or vendored prompt removed upstream does not linger', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    fs.writeFileSync(path.join(dir, 'plugin', 'commands', 'stale.md'), 'stale\n')
    write(dir)
    assert.ok(!fs.existsSync(path.join(dir, 'plugin', 'commands', 'stale.md')))
    assert.deepEqual(check(dir), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('check() reads CRLF and LF as the same text (a Windows checkout mixes them), and still names a real edit or a binary change', () => {
  const dir = scratchRepo()
  try {
    fs.writeFileSync(path.join(dir, 'templates', 'bin.dat'), Buffer.from([1, 0, 13, 10, 2]))
    write(dir)
    // The vendored copy checked out as CRLF, its source as LF.
    const vendored = path.join(dir, 'plugin', 'vendor', 'templates', 'a.md')
    fs.writeFileSync(vendored, '# a\r\n')
    assert.deepEqual(check(dir), [])
    // The other way round: the source as CRLF, the copy as LF.
    fs.writeFileSync(vendored, '# a\n')
    fs.writeFileSync(path.join(dir, 'templates', 'a.md'), '# a\r\n')
    assert.deepEqual(check(dir), [])
    // A generated file (the manifest) checked out as CRLF.
    const manifest = path.join(dir, 'plugin', '.claude-plugin', 'plugin.json')
    fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf-8').replace(/\n/g, '\r\n'))
    assert.deepEqual(check(dir), [])
    // A real edit is still named.
    fs.writeFileSync(vendored, '# a, edited\r\n')
    assert.deepEqual(check(dir), ['plugin/vendor/templates/a.md: differs from the generator (edit scripts/build-plugin.mjs or templates/, then run it)'])
    fs.writeFileSync(vendored, '# a\n')
    // A binary file is compared byte for byte: its CR LF pair is data.
    fs.writeFileSync(path.join(dir, 'plugin', 'vendor', 'templates', 'bin.dat'), Buffer.from([1, 0, 10, 2]))
    assert.deepEqual(check(dir), ['plugin/vendor/templates/bin.dat: differs from the generator (edit scripts/build-plugin.mjs or templates/, then run it)'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('write() clears a vendored file removed from templates/ since the last build', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    assert.ok(fs.existsSync(path.join(dir, 'plugin', 'vendor', 'templates', 'nested', 'b.md')))
    fs.rmSync(path.join(dir, 'templates', 'nested', 'b.md'))
    write(dir)
    assert.ok(!fs.existsSync(path.join(dir, 'plugin', 'vendor', 'templates', 'nested', 'b.md')))
    assert.deepEqual(check(dir), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('write() never clears plugin/evals/ — a hand-authored eval case survives a rebuild', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    const evalFile = path.join(dir, 'plugin', 'evals', 'adopt-clean', 'prompt.md')
    fs.mkdirSync(path.dirname(evalFile), { recursive: true })
    fs.writeFileSync(evalFile, '---\nmax_turns: 10\n---\n\nhand-authored eval case\n')
    write(dir)
    assert.ok(fs.existsSync(evalFile), 'plugin/evals/ must survive write()')
    assert.equal(fs.readFileSync(evalFile, 'utf-8'), '---\nmax_turns: 10\n---\n\nhand-authored eval case\n')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('check() never flags anything under plugin/evals/, including its own results/ output', () => {
  const dir = scratchRepo()
  try {
    write(dir)
    const evalFile = path.join(dir, 'plugin', 'evals', 'adopt-clean', 'prompt.md')
    fs.mkdirSync(path.dirname(evalFile), { recursive: true })
    fs.writeFileSync(evalFile, '---\nmax_turns: 10\n---\n\nhand-authored eval case\n')
    const resultsFile = path.join(dir, 'plugin', 'evals', 'results', '2026-01-01T00-00-00Z', 'report.html')
    fs.mkdirSync(path.dirname(resultsFile), { recursive: true })
    fs.writeFileSync(resultsFile, '<html></html>')
    assert.deepEqual(check(dir), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the CLI writes, --check exits 0, then 1 on a hand edit naming the file', () => {
  const dir = scratchRepo()
  const run = (...args) => execFileSync(process.execPath, [SCRIPT, ...args, '--root', dir], { encoding: 'utf-8', stdio: 'pipe' })
  try {
    run()
    assert.match(run('--check'), /match the generator/)
    const manifestPath = path.join(dir, '.claude-plugin', 'marketplace.json')
    fs.writeFileSync(manifestPath, fs.readFileSync(manifestPath, 'utf-8').replace('nexus', 'nexxus'))
    assert.throws(() => run('--check'), (err) => err.status === 1 && /\.claude-plugin\/marketplace\.json: differs/.test(err.stderr))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
