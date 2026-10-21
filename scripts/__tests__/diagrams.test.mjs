// The diagram generator: deterministic, self-contained SVGs in both
// themes, and a --check that names the file a hand edit touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, write, check, DIAGRAMS } from '../diagrams.mjs'

const SCRIPT = fileURLToPath(new URL('../diagrams.mjs', import.meta.url))
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-diagrams-'))

test('the first set is the plan shape, the landing split and the loop', () => {
  assert.deepEqual(Object.keys(DIAGRAMS), ['plan-shape.svg', 'landing.svg', 'loop.svg'])
})

test('render is byte-identical across runs, LF only, newline-terminated', () => {
  const a = render()
  const b = render()
  assert.deepEqual(a, b)
  for (const [file, body] of Object.entries(a)) {
    assert.ok(!body.includes('\r'), `${file}: CR in output`)
    assert.ok(body.endsWith('</svg>\n'), `${file}: not newline-terminated`)
  }
})

test('every SVG carries both themes and nothing external', () => {
  for (const [file, body] of Object.entries(render())) {
    assert.match(body, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, file)
    assert.match(body, /@media \(prefers-color-scheme: dark\)\{/, `${file}: no dark theme`)
    assert.match(body, /<title id="[^"]+">[^<]+<\/title>/, `${file}: no title`)
    assert.doesNotMatch(body, /<script|@import|@font-face|url\(|href=|<image|<foreignObject/i, `${file}: external or scripted content`)
    assert.doesNotMatch(body, /NaN|undefined/, `${file}: a broken coordinate`)
  }
})

test('--check is clean on fresh output and names a tampered, missing or stray file', () => {
  const dir = scratch()
  try {
    write(dir)
    assert.deepEqual(check(dir), [])
    const f = path.join(dir, 'loop.svg')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace('The loop', 'The lop'))
    fs.rmSync(path.join(dir, 'landing.svg'))
    fs.writeFileSync(path.join(dir, 'hand-drawn.svg'), '<svg/>\n')
    const problems = check(dir)
    assert.equal(problems.length, 3, problems.join('\n'))
    assert.match(problems.join('\n'), /assets\/loop\.svg: differs from the generator at line \d+/)
    assert.match(problems.join('\n'), /assets\/landing\.svg: missing/)
    assert.match(problems.join('\n'), /assets\/hand-drawn\.svg: not generated/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a CRLF checkout of an SVG is a diff (.gitattributes keeps them LF)', () => {
  const dir = scratch()
  try {
    write(dir)
    const f = path.join(dir, 'plan-shape.svg')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace(/\n/g, '\r\n'))
    assert.match(check(dir).join('\n'), /assets\/plan-shape\.svg: differs/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the CLI writes, --check exits 0, then 1 on a hand edit naming the file', () => {
  const dir = scratch()
  const run = (...args) => execFileSync(process.execPath, [SCRIPT, ...args, '--dir', dir], { encoding: 'utf-8', stdio: 'pipe' })
  try {
    run()
    assert.match(run('--check'), /3 SVGs match the generator/)
    const f = path.join(dir, 'landing.svg')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace('#0969da', '#ff0000'))
    assert.throws(() => run('--check'), (err) => err.status === 1 && /assets\/landing\.svg: differs/.test(err.stderr))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
