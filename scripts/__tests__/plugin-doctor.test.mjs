// The doctor command's drift check: two version strings in, a
// read-only status report out. No write ever happens here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareVersions,
  readVendoredVersion,
  readAdoptedVersion,
  diagnose,
} from '../plugin-doctor.mjs'

const SCRIPT = fileURLToPath(new URL('../plugin-doctor.mjs', import.meta.url))

function lockFile(version) {
  return `kit: nexus\nversion: ${version}\nref: v${version}\nshape: chunks\n`
}

// A scratch "adopter repo": just a plan/nexus.lock, optionally absent
// or malformed, per what each test needs.
function scratchTarget(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-target-'))
  if (version !== null) {
    fs.mkdirSync(path.join(dir, 'plan'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'plan', 'nexus.lock'), version === 'malformed' ? 'kit: nexus\nshape: chunks\n' : lockFile(version))
  }
  return dir
}

// A scratch "plugin root": plugin/.claude-plugin/plugin.json isn't
// read by this script — only the vendored templates/ snapshot's own
// plan/nexus.lock is, so that's all the fixture needs.
function scratchPluginRoot(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-plugin-'))
  fs.mkdirSync(path.join(dir, 'vendor', 'templates', 'plan'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'vendor', 'templates', 'plan', 'nexus.lock'), lockFile(version))
  return dir
}

function rm(...dirs) {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
}

test('compareVersions: equal, behind, ahead, and a missing trailing segment reads as 0', () => {
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
  assert.equal(compareVersions('1.9.0', '2.0.0'), -1)
  assert.equal(compareVersions('2.1.0', '2.0.0'), 1)
  assert.equal(compareVersions('2.0', '2.0.0'), 0)
  assert.equal(compareVersions('2.10.0', '2.9.0'), 1) // numeric, not lexical
})

test('readVendoredVersion reads the vendored templates/ snapshot\'s own lock', () => {
  const pluginRoot = scratchPluginRoot('3.1.4')
  try {
    assert.equal(readVendoredVersion(pluginRoot), '3.1.4')
  } finally {
    rm(pluginRoot)
  }
})

test('readAdoptedVersion: a real lock, a missing one, and a malformed one', () => {
  const ok = scratchTarget('2.0.0')
  const missing = scratchTarget(null)
  const malformed = scratchTarget('malformed')
  try {
    assert.deepEqual(readAdoptedVersion(ok), { version: '2.0.0', error: null })
    assert.deepEqual(readAdoptedVersion(missing), { version: null, error: 'no-lock' })
    assert.deepEqual(readAdoptedVersion(malformed), { version: null, error: 'unreadable' })
  } finally {
    rm(ok, missing, malformed)
  }
})

test('diagnose: current, behind, ahead', () => {
  const pluginRoot = scratchPluginRoot('2.0.0')
  const current = scratchTarget('2.0.0')
  const behind = scratchTarget('1.0.0')
  const ahead = scratchTarget('3.0.0')
  try {
    assert.deepEqual(diagnose({ targetRoot: current, pluginRoot }), {
      status: 'current',
      adoptedVersion: '2.0.0',
      vendoredVersion: '2.0.0',
      message: "up to date: this repo is on 2.0.0, matching the plugin's vendored 2.0.0.",
    })
    assert.equal(diagnose({ targetRoot: behind, pluginRoot }).status, 'behind')
    assert.match(diagnose({ targetRoot: behind, pluginRoot }).message, /run the upgrade command/)
    assert.equal(diagnose({ targetRoot: ahead, pluginRoot }).status, 'ahead')
    assert.match(diagnose({ targetRoot: ahead, pluginRoot }).message, /stale side/)
  } finally {
    rm(pluginRoot, current, behind, ahead)
  }
})

test('diagnose: not-adopted (no plan/nexus.lock) and unreadable (no version: line), neither throws', () => {
  const pluginRoot = scratchPluginRoot('2.0.0')
  const missing = scratchTarget(null)
  const malformed = scratchTarget('malformed')
  try {
    const a = diagnose({ targetRoot: missing, pluginRoot })
    assert.equal(a.status, 'not-adopted')
    assert.equal(a.adoptedVersion, null)
    assert.equal(a.vendoredVersion, '2.0.0')
    const b = diagnose({ targetRoot: malformed, pluginRoot })
    assert.equal(b.status, 'unreadable')
  } finally {
    rm(pluginRoot, missing, malformed)
  }
})

test('diagnose throws when --plugin-root itself has no vendored lock (a usage error, not a drift report)', () => {
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-empty-plugin-'))
  const target = scratchTarget('2.0.0')
  try {
    assert.throws(() => diagnose({ targetRoot: target, pluginRoot }))
  } finally {
    rm(pluginRoot, target)
  }
})

test('CLI: prints the status line and a json line, and exits 1 without --target', () => {
  const pluginRoot = scratchPluginRoot('2.0.0')
  const behind = scratchTarget('1.5.0')
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--target', behind, '--plugin-root', pluginRoot], { encoding: 'utf-8' })
    assert.match(out, /plugin-doctor: drift: this repo is on 1\.5\.0/)
    assert.match(out, /plugin-doctor: json \{.*"status":"behind".*\}/)
    assert.throws(() => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf-8', stdio: 'pipe' }), (err) => err.status === 1 && /--target <repo-path> is required/.test(err.stderr))
  } finally {
    rm(pluginRoot, behind)
  }
})
