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
//     steps and cadence.mjs byte for byte;
//   - no shipped cron (a workflow's `- cron:` line, or a cron a
//     shipped doc writes out) fires at minute :00 (offTheHour).
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

// ---- off the hour (spec 55, A11) -----------------------------------------------
// GitHub delays and drops scheduled runs at minute :00 first, so no cron
// the kit ships fires there: not a workflow's `- cron:` line (nexus's,
// the templates', the bundled kit's) and not a cron a shipped doc
// recommends (a backticked or quoted five-field cron). The CLI's preset
// and overnight crons are held off :00 by their own tests.

/** Where shipped crons live: workflow dirs (every `- cron:` line) and doc roots (every cron-shaped code span). */
export const CRON_WORKFLOW_DIRS = Object.freeze(['.github/workflows', 'templates/.github/workflows', `${KIT}/workflows`])
export const CRON_DOC_ROOTS = Object.freeze(['README.md', 'concepts', 'playbooks', 'customization', 'prompts', 'templates', 'skills'])

/** True when a cron's minute field includes :00 (`0`, `*`, `*\/n`, `0-n`, or a list holding one). */
export function firesOnTheHour(cron) {
  const minute = String(cron ?? '').trim().split(/\s+/)[0] ?? ''
  return minute.split(',').some((p) => /^(?:0|\*)(?:\/\d+)?$/.test(p) || /^0+-\d+(?:\/\d+)?$/.test(p) || /^0+$/.test(p))
}

const FIELD = '[\\d*/,-]+'
const DOC_CRON = new RegExp(`[\`'"](${FIELD} ${FIELD} ${FIELD} ${FIELD} [\\d*/,A-Za-z-]+)[\`'"]`, 'g')
const YML_CRON = /^\s*-\s*cron:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/gm

function walk(root, rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [rel]
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.git')) return []
    const r = `${rel}/${e.name}`
    return e.isDirectory() ? walk(root, r) : [r]
  })
}

/** Every shipped cron that fires at minute :00, as problems naming the file and the cron. */
export function offTheHour(root = ROOT, { list = (rel) => walk(root, rel), readFile = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8') } = {}) {
  const problems = []
  let crons = 0
  const flag = (file, cron) => {
    crons++
    if (firesOnTheHour(cron)) problems.push(`${file}: cron '${cron}' fires at minute :00, the busiest slot GitHub delays and drops first (move the minute off the hour, e.g. 17)`)
  }
  const workflows = new Set(CRON_WORKFLOW_DIRS.flatMap((d) => list(d)).filter((f) => /\.ya?ml$/.test(f)))
  for (const f of workflows) for (const m of readFile(f).matchAll(YML_CRON)) flag(f, m[1].trim())
  for (const f of new Set(CRON_DOC_ROOTS.flatMap((d) => list(d)).filter((x) => x.endsWith('.md')))) {
    for (const m of readFile(f).matchAll(DOC_CRON)) flag(f, m[1])
  }
  return { problems, note: `${crons} shipped crons off minute :00` }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = check()
  const hour = offTheHour()
  const problems = [...r.problems, ...hour.problems]
  const note = `${r.note}; ${hour.note}`
  for (const p of problems) console.log(`  ${p}`)
  console.log(problems.length ? `cadence-twins: ${problems.length} problem(s)` : `cadence-twins: ok (${note})`)
  process.exitCode = problems.length ? 1 : 0
}
