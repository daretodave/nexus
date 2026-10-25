#!/usr/bin/env node
// scripts/cadence-twins.mjs — the cadence twins, checked (the gate's cadence-twins leg).
//
// Three steps decide how hard a loop runs: Cadence (the repo variable
// NEXUS_CADENCE turned into the ceiling, chain depth, idle backoff and
// heartbeat threshold), Quota gate (the weekly quota) and Chain next
// tick (the next run dispatched); a fourth, heartbeat's realized-cadence
// alarm, checks GitHub delivered what the cron promised. Each lives in
// three places: the
// workflows nexus runs (.github/workflows), the templates adopters
// copy (templates/.github/workflows) and the CLI's bundled kit
// (packages/cli/kit, written by its build, never committed). This
// fails when they drift:
//
//   - nexus's march, night and heartbeat workflows and the
//     templates' have the same named steps, each with the same env
//     names, repo variables, step outputs, script, subcommand and
//     flags (nexus runs templates/scripts/... in place and keeps its
//     own default values, so paths and values may differ); the first
//     occurrence of a name is compared (the template's owner job);
//   - the bundled kit, when built, holds the template's march.yml
//     steps and cadence.mjs byte for byte.
//
//   node scripts/cadence-twins.mjs     # print what it found; exit 1 on a problem
//
// Zero dependencies.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const TWIN_STEPS = Object.freeze(['Cadence', 'Quota gate', 'Chain next tick', "Alarm if march's realized cadence is below 40%"])
export const TWIN_WORKFLOWS = Object.freeze(['march.yml', 'night.yml', 'heartbeat.yml'])
export const KIT = 'packages/cli/kit'
const BUNDLED = [
  [`${KIT}/workflows/march.yml`, 'templates/.github/workflows/march.yml'],
  [`${KIT}/scripts/cloud/cadence.mjs`, 'templates/scripts/cloud/cadence.mjs'],
]
const REBUILD = '(rebuild it: npm --prefix packages/cli run build)'

/** Each named step's text (every occurrence, in file order), keyed by name. A step ends at the first line indented under 8. */
export function twinSteps(text) {
  const out = new Map()
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {6}- name: (.+?)\s*$/.exec(lines[i])
    if (!m || !TWIN_STEPS.includes(m[1])) continue
    const body = [lines[i]]
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || /^ {8}/.test(lines[j])); j++) body.push(lines[j])
    while (body.length && body[body.length - 1].trim() === '') body.pop()
    out.set(m[1], [...(out.get(m[1]) ?? []), body.join('\n')])
  }
  return out
}

/** What must agree between nexus's copy and the template's: names, not paths or default values. */
export function stepSignature(step) {
  const env = [...step.matchAll(/^ {10}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]).sort()
  const vars = [...new Set([...step.matchAll(/vars\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]))].sort()
  const outputs = [...new Set([...step.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)].map((m) => `${m[1]}.${m[2]}`))].sort()
  const run = /^ {8}run:[\s\S]*/m.exec(step)?.[0] ?? ''
  const script = /cloud\/([\w-]+\.mjs)(?: ([a-z][\w-]*))?/.exec(run)
  const flags = [...new Set([...run.matchAll(/(?<![\w-])--([a-z][\w-]*)/g)].map((m) => m[1]))].sort()
  return { env, vars, outputs, script: script ? `${script[1]} ${script[2] ?? ''}`.trim() : '', flags }
}

/** The fields two signatures differ in, named. */
function delta(a, b) {
  return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k} ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`).join('; ')
}

export function check(root = ROOT, { exists = (rel) => fs.existsSync(path.join(root, rel)), readFile = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8') } = {}) {
  const problems = []
  let compared = 0
  for (const wf of TWIN_WORKFLOWS) {
    const own = `.github/workflows/${wf}`
    const kit = `templates/.github/workflows/${wf}`
    if (!exists(own) || !exists(kit)) continue
    const a = twinSteps(readFile(own))
    const b = twinSteps(readFile(kit))
    for (const name of TWIN_STEPS) {
      if (!a.has(name) && !b.has(name)) continue
      if (!a.has(name) || !b.has(name)) {
        problems.push(`${a.has(name) ? kit : own}: no "${name}" step, but ${a.has(name) ? own : kit} has one`)
        continue
      }
      compared++
      const d = delta(stepSignature(a.get(name)[0]), stepSignature(b.get(name)[0]))
      if (d) problems.push(`${own} vs ${kit}: "${name}" differs (${d})`)
    }
  }
  const built = exists(KIT)
  let kitChecked = 0
  if (built) {
    const lf = (rel) => readFile(rel).replace(/\r\n/g, '\n')
    for (const [k, t] of BUNDLED) {
      if (!exists(k)) {
        problems.push(`${k}: missing from the CLI's bundled kit ${REBUILD}`)
        continue
      }
      kitChecked++
      if (k.endsWith('.mjs')) {
        if (lf(k) !== lf(t)) problems.push(`${k} differs from ${t} ${REBUILD}`)
        continue
      }
      const [a, b] = [twinSteps(lf(k)), twinSteps(lf(t))]
      for (const name of TWIN_STEPS) {
        if (JSON.stringify(a.get(name) ?? []) !== JSON.stringify(b.get(name) ?? [])) problems.push(`${k}: "${name}" differs from ${t} ${REBUILD}`)
      }
    }
  }
  const note = `${compared} named steps agree between nexus and templates/ (${TWIN_STEPS.join(', ')}); ${built ? `the CLI kit's ${kitChecked} copies match templates/` : `${KIT} not built here, skipped`}`
  return { problems, note }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { problems, note } = check()
  for (const p of problems) console.log(`  ${p}`)
  console.log(problems.length ? `cadence-twins: ${problems.length} problem(s)` : `cadence-twins: ok (${note})`)
  process.exitCode = problems.length ? 1 : 0
}
