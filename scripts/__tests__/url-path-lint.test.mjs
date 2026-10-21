// The URL-pathname lint: a script that resolves a filesystem path
// through URL.pathname keeps %20 for a space and a leading /Z:/ on
// Windows, so it quietly reads or writes nothing. fileURLToPath only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findPathnameUses, lintTree } from '../url-path-lint.mjs'

// Built by concatenation so this file never trips the lint itself.
const P = '.path' + 'name'
const META = 'import.meta' + '.url'

test('a URL built from the module URL, read as .pathname, is refused', () => {
  const src = `const ROOT = path.resolve(new URL('..', ${META})${P})\n`
  assert.deepEqual(findPathnameUses(src), [1])
})

test('the old ROOT idiom with the drive-letter replace is refused', () => {
  const src = `import path from 'node:path'\nconst ROOT = path.resolve(path.dirname(new URL(${META})${P}.replace(/^\/([A-Za-z]:)/, '$1')), '..')\n`
  assert.deepEqual(findPathnameUses(src), [2])
})

test('the module URL carried through a call into .pathname is refused', () => {
  const src = `const u = ${META}; const p = toUrl(${META})${P}\n`
  assert.deepEqual(findPathnameUses(src), [1])
})

test('fileURLToPath, an HTTP request URL, and comments pass', () => {
  const src = [
    `const ROOT = fileURLToPath(new URL('..', ${META}))`,
    `if (!url${P}.startsWith('/api/')) return`,
    `// never new URL(${META})${P}: it keeps %20`,
    ` * new URL(x)${P} in a block comment line`,
  ].join('\n')
  assert.deepEqual(findPathnameUses(src), [])
})

test('lintTree names file and line, skips node_modules, reads only scripts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-urllint-'))
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body) }
  put('scripts/bad.mjs', `x\nconst R = new URL('.', ${META})${P}\n`)
  put('scripts/ok.mjs', `const R = fileURLToPath(new URL('.', ${META}))\n`)
  put('scripts/node_modules/dep/index.js', `new URL(${META})${P}\n`)
  put('scripts/notes.md', `new URL(${META})${P}\n`)
  const { problems, files } = lintTree(root, ['scripts', 'missing-dir'])
  assert.equal(files, 2)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^scripts\/bad\.mjs:2: /)
  assert.match(problems[0], /fileURLToPath/)
})
