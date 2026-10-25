#!/usr/bin/env node
// scripts/upgrade-kit-text.mjs: every header and paragraph the kit's march and iterate skills ever held, and every
// line the kit's march.yml prompt ever held (spec 58; the workflow merge carries a v1 prompt line no kit held).
//
// `nexus upgrade` moves a v1 repo's own march and iterate steps into the lanes files and replaces the kit's. To tell
// one from the other it needs every version of templates/skills/march.md and iterate.md, not one tag: a v1 adopter
// forked months before v1.0.0. This script reads them from git history and keeps the result in
// scripts/upgrade-kit-text.json (committed, so a shallow CI checkout bundles the same list); the CLI's
// bundle-kit.mjs writes it, with the current templates folded in, to kit/upgrade/kit-text.json. The parsing is the
// CLI's own (packages/cli/server/kit-text.mjs), so the bundle and the upgrade read text the same way.
//
//   node scripts/upgrade-kit-text.mjs           # counts per skill
//   node scripts/upgrade-kit-text.mjs --write   # rebuild the snapshot: git history + the snapshot + the templates
//   node scripts/upgrade-kit-text.mjs --check   # the verify gate's upgrade leg
//
// --check fails when the snapshot lacks a header or paragraph the current templates hold: a kit edit to march.md or
// iterate.md lands with `--write` in the same commit, so every version that ever shipped stays in the list.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SNAPSHOT = 'scripts/upgrade-kit-text.json'
const kt = () => import(pathToFileURL(path.join(ROOT, 'packages', 'cli', 'server', 'kit-text.mjs')).href)

const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 })

/** Every committed version of templates/skills/<skill> (renames followed): [text]. Empty outside a git checkout. */
export const historyOf = (root, skill) => historyOfPath(root, `templates/skills/${skill}`)

/** Every committed version of one repo path (renames followed): [text]. Empty outside a git checkout. */
export function historyOfPath(root, rel) {
  const log = git(root, ['log', '--format=@%H', '--name-only', '--follow', '--', rel])
  if (log.status !== 0) return []
  const out = []
  let sha = null
  for (const line of log.stdout.split(/\r?\n/)) {
    if (line.startsWith('@')) sha = line.slice(1)
    else if (line.trim() && sha) {
      const show = git(root, ['show', `${sha}:${line.trim()}`])
      if (show.status === 0) out.push(show.stdout)
      sha = null
    }
  }
  return out
}

/** The committed snapshot, parsed; {} when there is none. */
export function readSnapshot(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ...SNAPSHOT.split('/')), 'utf8'))
  } catch {
    return {}
  }
}

const readOr = (abs) => {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}
const current = (root, skill) => readOr(path.join(root, 'templates', 'skills', skill))
const currentPrompt = (root, rel) => readOr(path.join(root, 'templates', ...rel.split('/')))

/** The kit-text list: per skill, the snapshot, the current template and (with `history`) every version in git. */
export async function build(root = ROOT, { history = true } = {}) {
  const { TRAIN, PROMPTS, textOf, textOfPrompt, mergeText, toJson } = await kt()
  const snap = readSnapshot(root)
  const out = {}
  for (const skill of Object.keys(TRAIN)) {
    const versions = history ? historyOf(root, skill) : []
    out[skill] = toJson(mergeText(snap[skill], textOf(current(root, skill)), ...versions.map(textOf)))
  }
  for (const [key, rel] of Object.entries(PROMPTS)) {
    const versions = history ? historyOfPath(root, `templates/${rel}`) : []
    out[key] = toJson(mergeText(snap[key], textOfPrompt(currentPrompt(root, rel)), ...versions.map(textOfPrompt)))
  }
  return out
}

/** The upgrade leg's half: { problems, counts }. */
export async function check(root = ROOT) {
  const { TRAIN, PROMPTS, textOf, textOfPrompt } = await kt()
  const snap = readSnapshot(root)
  const problems = []
  const counts = {}
  for (const [key, rel] of Object.entries(PROMPTS)) {
    const have = snap[key]
    if (!have) {
      problems.push(`${SNAPSHOT}: no entry for ${key}; run node scripts/upgrade-kit-text.mjs --write`)
      continue
    }
    const paras = new Set(have.paras)
    const lack = [...textOfPrompt(currentPrompt(root, rel)).paras].filter((p) => !paras.has(p))
    if (lack.length) problems.push(`${SNAPSHOT}: templates/${rel} holds ${lack.length} prompt line(s) the kit-text list lacks; run node scripts/upgrade-kit-text.mjs --write`)
    counts[key] = { headers: 0, paras: have.paras.length }
  }
  for (const skill of Object.keys(TRAIN)) {
    const have = snap[skill]
    if (!have) {
      problems.push(`${SNAPSHOT}: no entry for ${skill}; run node scripts/upgrade-kit-text.mjs --write`)
      continue
    }
    const now = textOf(current(root, skill))
    const headers = new Set(have.headers)
    const paras = new Set(have.paras)
    const lackH = [...now.headers].filter((h) => !headers.has(h))
    const lackP = [...now.paras].filter((p) => !paras.has(p))
    if (lackH.length || lackP.length) {
      problems.push(`${SNAPSHOT}: templates/skills/${skill} holds ${lackH.length} header(s)${lackH.length ? ` (${lackH.slice(0, 3).join('; ')})` : ''} and ${lackP.length} paragraph(s) the kit-text list lacks; run node scripts/upgrade-kit-text.mjs --write`)
    }
    counts[skill] = { headers: have.headers.length, paras: have.paras.length }
  }
  return { problems, counts }
}

/** Rewrites the snapshot; true when it changed. */
export async function write(root = ROOT) {
  const next = `${JSON.stringify(await build(root), null, 2)}\n`
  const file = path.join(root, ...SNAPSHOT.split('/'))
  const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null
  if (was === next) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, next)
  return true
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2]
  if (arg === '--check') {
    const { problems, counts } = await check()
    for (const p of problems) console.error(`upgrade-kit-text: ${p}`)
    if (!problems.length) console.log(`upgrade-kit-text: ${Object.entries(counts).map(([s, c]) => `${s} ${c.headers} headers, ${c.paras} paragraphs`).join('; ')}`)
    process.exit(problems.length ? 1 : 0)
  } else if (arg === '--write') {
    console.log((await write()) ? `upgrade-kit-text: rewrote ${SNAPSHOT}` : `upgrade-kit-text: ${SNAPSHOT} already current`)
  } else {
    const all = await build()
    for (const [s, t] of Object.entries(all)) console.log(`${s}: ${t.headers.length} headers, ${t.paras.length} paragraphs, ${t.patterns.length} placeholder patterns`)
  }
}
