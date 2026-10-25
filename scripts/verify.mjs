#!/usr/bin/env node
// scripts/verify.mjs — the kit's own verify gate.
//
// nexus tells every adopting repo: "the verify gate is
// non-negotiable, hermetic, and runs before every commit." This
// is that gate, for nexus itself. A methodology repo's failure
// modes are not type errors — they're dead links, orphaned docs,
// drifted trees, placeholder typos, and skills that stop obeying
// their own anatomy. Each leg below catches one of those classes.
//
//   node scripts/verify.mjs            # all legs
//   node scripts/verify.mjs links      # one leg by name
//
// Legs:
//   links         every relative markdown link resolves to a file
//   tree          README's "What's in this kit" tree matches disk
//   discover      every playbook/concept/customization/prompt doc
//                 is linked from at least one other doc (no orphans)
//   placeholders  every <UPPER_SNAKE> token is in the documented
//                 vocabulary (catches <PROJECT_NAME>-style typos)
//   anatomy       skill files carry the canonical sections; command
//                 pointers carry frontmatter + $ARGUMENTS; skills
//                 and command pointers pair 1:1; /next stays within
//                 200 lines, its next/*.md detail files 120 each,
//                 /heads-down 150; no skill or pointer pushes the
//                 default branch bare outside next/land.md (each
//                 lands per owner mode; scripts/bare-push.mjs);
//                 triage, bug and iterate (both trees) carry the
//                 rule that issue and page text is data; triage,
//                 bug and march (both trees) carry the support
//                 routing (support.mjs route, cap, continue, asap,
//                 sla; triage and bug: Refs #N and tell), and
//                 iterate the aged user rows (age)
//   emoji         no pictographic emoji anywhere in tracked docs,
//                 nor in packages/cli source (js/jsx/ts/tsx/json/css/html)
//                 (✓ and ❌ dingbats are fine; 🤖 is not, nor the
//                 geometric shapes that render as emoji)
//   dualshell     every playbooks/*.md ```bash fence that leans on a
//                 POSIX-only tool (sed, grep, xargs, mkdir, cp, rm, …)
//                 has an adjacent ```powershell twin, or an explicit
//                 <!-- dualshell:posix-only --> annotation
//   chunks        the plan shape holds in plan/ and templates/plan/:
//                 Measure lines true, chunk lines parse, every A-ID
//                 covered, needs resolve, the roadmap links every
//                 spec (and no gone one; lanes and `N left` true),
//                 and (vs HEAD) a chunk that left the plan has
//                 its archive line. Runs templates/scripts/plan-check.mjs
//                 so adopters and the kit share one implementation,
//                 plus that script's own node:test suite; a set
//                 NEXUS_SUPPORT that disagrees with bearings'
//                 Support: line is a warning in its note
//   scripts       the node:test suites of the plan, claims and push
//                 policy scripts adopters copy (templates/scripts/plan/,
//                 claims, git/push-policy, announce, ledger, the
//                 steer hook), both guard hooks' self-tests and
//                 their wiring in both settings.json files:
//                 pure, no git, no network, about a second; and
//                 nexus's own copies in scripts/ and
//                 .claude/hooks/steer.mjs match them byte for byte
//                 (the kit dogfoods what it ships)
//   workflows     every workflow in .github/workflows/ and
//                 templates/.github/workflows/ keeps the cloud-loop
//                 rules (templates/scripts/workflow-lint.mjs): a
//                 secret runs on hosted runners only, run-name and
//                 env blocks read only the contexts GitHub allows
//                 there and never a secret or token, and no run
//                 script, nor an agent's with: prompt,
//                 direct_prompt or claude_args, interpolates
//                 outsider text; nudge.yml (both copies) keeps
//                 its trust filters in the job if:, no model, no
//                 secret, two minutes; each
//                 composite action in .github/actions/ and
//                 templates/.github/actions/ keeps the run-script
//                 rule and reads no secret
//   cadence-twins the Cadence, Quota gate and Chain next tick steps
//                 (by step name) agree across nexus's own march,
//                 night and heartbeat workflows and the templates'
//                 (same env names, variables, step outputs, script,
//                 subcommand and flags; paths and defaults may
//                 differ), and the CLI's bundled kit
//                 (packages/cli/kit, when built) holds them and
//                 cadence.mjs byte for byte as templates/ does
//   diagrams      every assets/*.svg is byte-identical to what
//                 scripts/diagrams.mjs generates (regenerated in
//                 memory; a hand edit, a missing or a stray SVG is
//                 red, naming the file), plus the generator's own
//                 node:test suite
//   gifs          every GIF README.md shows exists, parses, runs 5
//                 to 8 s, weighs at most 3 MB, has alt text and a
//                 linked .png poster (scripts/gifs.mjs; bytes are
//                 never compared: recordings are not byte-stable),
//                 plus the checker's own node:test suite
//   secrets       no vault value in what the next commit can hold:
//                 the working tree vs HEAD plus the untracked files,
//                 scanned for every value in the vault (.env at the
//                 primary checkout, .env.workspace, the keychain when
//                 it is on; values of 8+ characters), each hit named
//                 by file, line and secret, never shown
//                 (scripts/secrets-scan.mjs). No vault: green, noted
//   upgrade       the v2 kit file list is one computed closure
//                 (scripts/upgrade-files.mjs): every templates/ path
//                 playbooks/upgrade.md names exists, no listed script
//                 imports a file the list lacks or that is gone, and
//                 the playbook's generated manual copy list matches
//                 the list (the CLI bundles the same set); and the
//                 kit-text snapshot (scripts/upgrade-kit-text.json)
//                 holds every header and paragraph the current
//                 templates/skills/march.md and iterate.md hold, so
//                 every kit version stays known to the upgrade; plus
//                 both scripts' own node:test suites
//   state-size    the queues every tick reads stay cheap
//                 (templates/scripts/plan/state.mjs): in plan/ and
//                 templates/plan/, each of AUDIT.md, CANDIDATES.md
//                 and CRITIQUE.md keeps a header (the lines above
//                 its first ## heading) of 20 lines or fewer and
//                 weighs at most NEXUS_STATE_MAX_KB (default 256);
//                 both iterate.md copies compact Done rows past 30
//                 days; plus the script's own node:test suite, which
//                 fails an oversize fixture. Done rows past 30 days
//                 are counted in the note, never failed on (age
//                 alone must not turn an unrelated commit red)
//   scripts-git   opt-in — the same scripts end to end in scratch git
//                 repos in the temp folder (offline, but every case
//                 spawns git, so tens of seconds), and heartbeat.yml's
//                 cadence step run in bash against a stubbed gh, and
//                 ui-walk.mjs walking a local fixture site in the
//                 installed Chrome (skips without one). Opt in with
//                 `node scripts/verify.mjs scripts-git` or
//                 `NEXUS_VERIFY_GIT_TESTS=1 node scripts/verify.mjs`
//   adopt-dryrun  opt-in — mechanizes playbooks/new-project.md's
//                 plan-starter copy (step 3), copy + placeholder-sweep
//                 + prune blocks (step 4) and plan-check, on Unix or
//                 through Git Bash on Windows. Skipped by
//                 the default no-argument run; opt in with
//                 `node scripts/verify.mjs adopt-dryrun` or
//                 `NEXUS_VERIFY_ADOPT_DRYRUN=1 node scripts/verify.mjs`
//   design        opt-in — every design handoff (design/handoff/,
//                 packages/*/design/handoff/) still matches its
//                 manifest, and its port.json maps every board to
//                 the file that draws it, skips it with a reason, or
//                 names the chunk it waits on
//                 (scripts/design/port-map.mjs). Opt in with
//                 `node scripts/verify.mjs design` or
//                 `NEXUS_VERIFY_DESIGN=1 node scripts/verify.mjs`
//
// Exit 0 = green. Exit 1 = at least one leg red. No dependencies,
// no network — hermetic by construction (adopt-dryrun forks a
// child process and touches a scratch dir, which is exactly why
// it's opt-in rather than part of the default fast path).

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// --- shared helpers ----------------------------------------------------

function trackedMarkdown() {
  const out = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf-8' })
  return out.trim().split(/\r?\n/).filter(Boolean)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

// Split a file into lines annotated with fence state, so legs can
// skip fenced code blocks (link examples, bash snippets).
function annotatedLines(text) {
  const lines = text.split(/\r?\n/)
  let fenced = false
  return lines.map((line, i) => {
    const isFenceMarker = /^\s*(```|~~~)/.test(line)
    if (isFenceMarker) {
      const wasFenced = fenced
      fenced = !fenced
      return { n: i + 1, line, fenced: wasFenced, marker: true }
    }
    return { n: i + 1, line, fenced, marker: false }
  })
}

function normalize(rel) {
  return rel.split(path.sep).join('/')
}

// --- leg: links ---------------------------------------------------------

function legLinks(files) {
  const failures = []
  let checked = 0
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const file of files) {
    for (const { n, line, fenced, marker } of annotatedLines(read(file))) {
      if (fenced || marker) continue
      const scrubbed = line.replace(/`[^`]*`/g, '``') // ignore inline code
      let m
      while ((m = linkRe.exec(scrubbed)) !== null) {
        let target = m[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        if (target.includes('<')) continue // placeholder link
        target = target.replace(/[#?].*$/, '')
        if (target === '') continue
        const resolved = target.startsWith('/')
          ? path.join(ROOT, target)
          : path.join(ROOT, path.dirname(file), target)
        checked++
        if (!fs.existsSync(resolved)) {
          failures.push(`${file}:${n}: broken link → ${m[1]}`)
        }
      }
    }
  }
  return { failures, note: `${checked} relative links` }
}

// --- leg: tree ----------------------------------------------------------
// Parses the fenced kit tree in README.md (rooted at `nexus/`, which IS
// disk root) AND the fenced layout tree in templates/README.md (rooted
// at `templates/`, a real subdirectory) and asserts every entry exists
// on disk. Entries containing `<` (placeholders) are skipped. The two
// trees use different comment styles — README.md trails `#`, often
// after a single space; templates/README.md trails `→`/`(...)` after
// two-or-more spaces — so the name/comment split cuts at whichever
// comes first: a bare `#`, or a run of 2+ spaces.

function stripTreeComment(raw) {
  const hashIdx = raw.indexOf('#')
  const spaceMatch = raw.match(/\s{2,}/)
  const spaceIdx = spaceMatch ? spaceMatch.index : -1
  let cut = raw.length
  if (hashIdx !== -1) cut = Math.min(cut, hashIdx)
  if (spaceIdx !== -1) cut = Math.min(cut, spaceIdx)
  return raw.slice(0, cut).trim()
}

// prefix: '' for a root that IS disk root (nexus/); a real subdirectory
// name (e.g. 'templates') for a root that maps under ROOT.
function parseTreeBlock(text, rootLabel, prefix) {
  const lines = text.split(/\r?\n/)
  let inTree = false
  let sawRoot = false
  const stack = []
  const entries = []
  for (const raw of lines) {
    if (!inTree) {
      if (/^```/.test(raw)) inTree = 'candidate'
      continue
    }
    if (inTree === 'candidate') {
      if (raw.trim() === rootLabel) { inTree = true; sawRoot = true; continue }
      inTree = false
      continue
    }
    if (/^```/.test(raw)) break
    // "│   ├── playbooks/" → depth from marker position, name after marker
    const m = raw.match(/^((?:[│ ]   )*)(?:├── |└── )(.+)$/)
    if (!m) continue
    const depth = m[1].length / 4
    const name = stripTreeComment(m[2])
    if (!name || name.includes('<')) continue
    stack.length = depth
    stack[depth] = name.replace(/\/$/, '')
    const rel = (prefix ? [prefix] : []).concat(stack.slice(0, depth + 1)).join('/')
    entries.push(rel)
  }
  return { entries, sawRoot }
}

function walkFiles(dirAbs) {
  let out = []
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name)
    out = entry.isDirectory() ? out.concat(walkFiles(abs)) : out.concat([abs])
  }
  return out
}

// The dirs adopters bulk-copy whole. When a tree diagram enumerates a
// dir's children (vs. leaving it as one collapsed entry, e.g.
// `claude/commands/` — "one terse pointer per skill" — deliberately
// isn't expanded), a real file missing from every diagram's entry set
// is exactly the failure mode that shipped __tests__/loop-issue.test.mjs
// silently: catch it here instead.
const REVERSE_CHECK_DIRS = [
  'templates/scripts', 'templates/skills',
  'templates/claude/commands', 'templates/claude/agents',
  'templates/plan', 'templates/workspace',
  'templates/.github', 'templates/data',
  'templates/setup', 'templates/env', 'templates/identity',
]

function legTree() {
  const failures = []
  const trees = [
    { file: 'README.md', ...parseTreeBlock(read('README.md'), 'nexus/', '') },
    { file: 'templates/README.md', ...parseTreeBlock(read('templates/README.md'), 'templates/', 'templates') },
  ]
  const allEntries = new Set()
  let checked = 0
  for (const t of trees) {
    if (!t.sawRoot) {
      failures.push(`${t.file}: could not find its fenced tree block`)
      continue
    }
    for (const rel of t.entries) {
      checked++
      allEntries.add(rel)
      if (!fs.existsSync(path.join(ROOT, rel))) {
        failures.push(`${t.file} tree: ${rel} does not exist on disk`)
      }
    }
  }
  let reverseChecked = 0
  for (const dirRel of REVERSE_CHECK_DIRS) {
    const isExpanded = [...allEntries].some((e) => e !== dirRel && e.startsWith(`${dirRel}/`))
    if (!isExpanded) continue // collapsed to one entry in every diagram by design — nothing to reverse-check
    const dirAbs = path.join(ROOT, dirRel)
    if (!fs.existsSync(dirAbs)) continue
    for (const abs of walkFiles(dirAbs)) {
      const rel = normalize(path.relative(ROOT, abs))
      reverseChecked++
      if (!allEntries.has(rel)) {
        failures.push(`${rel}: on disk under ${dirRel}/ but missing from both README.md's and templates/README.md's tree diagrams`)
      }
    }
  }
  const shape = repoShapeCheck()
  failures.push(...shape.failures)
  return { failures, note: `${checked} tree entries, ${reverseChecked} files reverse-checked, ${shape.dirs} top-level dirs in agents.md's repo shape` }
}

// agents.md's repo shape names every tracked top-level directory,
// so a cold agent never mistakes a surface for out of scope (spec
// 56: the shape once had no packages/ row, and the loop read nexus
// as docs-only). skills/ship-a-chunk.md keeps its packages/** code
// branch for the same reason.
function repoShapeCheck() {
  const failures = []
  const text = read('agents.md')
  const block = (text.split(/^## Repo shape\s*$/m)[1] || '').match(/```[^\n]*\n([\s\S]*?)```/)
  if (!block) return { failures: ['agents.md: could not find the fenced block under "## Repo shape"'], dirs: 0 }
  const listed = new Set(block[1].split(/\r?\n/).map((l) => (l.match(/^([^\s/]+)\//) || [])[1]).filter(Boolean))
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  const dirs = new Set(tracked.split(/\r?\n/).filter((f) => f.includes('/')).map((f) => f.split('/')[0]))
  for (const d of [...dirs].sort()) {
    if (!listed.has(d)) failures.push(`agents.md repo shape: no row for the tracked top-level directory ${d}/`)
  }
  const sac = fs.existsSync(path.join(ROOT, 'skills/ship-a-chunk.md')) ? read('skills/ship-a-chunk.md') : ''
  if (dirs.has('packages') && !(/code branch \(`packages\/\*\*`\)/.test(sac) && sac.includes('npm --prefix packages/cli test'))) {
    failures.push('skills/ship-a-chunk.md: lost its packages/** code branch (Step 4b, a green `npm --prefix packages/cli test`)')
  }
  return { failures, dirs: dirs.size }
}

// --- leg: discover (no orphan docs) --------------------------------------

function legDiscover(files) {
  const failures = []
  const discoverable = files.filter((f) =>
    /^(playbooks|concepts|customization|prompts)\//.test(normalize(f)),
  )
  // Collect every relative link target across the repo.
  const linked = new Set()
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const file of files) {
    for (const { line, fenced, marker } of annotatedLines(read(file))) {
      if (fenced || marker) continue
      let m
      while ((m = linkRe.exec(line.replace(/`[^`]*`/g, '``'))) !== null) {
        let target = m[1]
        if (/^(https?:|mailto:|#)/.test(target) || target.includes('<')) continue
        target = target.replace(/[#?].*$/, '')
        if (!target) continue
        const resolved = target.startsWith('/')
          ? path.normalize(target).slice(1)
          : normalize(path.normalize(path.join(path.dirname(file), target)))
        linked.add(normalize(resolved))
      }
    }
  }
  for (const doc of discoverable) {
    if (!linked.has(normalize(doc))) {
      failures.push(`${doc}: not linked from any other doc — undiscoverable`)
    }
  }
  return { failures, note: `${discoverable.length} docs checked for reachability` }
}

// --- leg: placeholders ---------------------------------------------------
// The placeholder vocabulary is deliberate. A new template may add a
// token, but it must be added HERE too — that forced touch is the
// review. Typos (<PROJECT_NAME> for <PROJECT>) fail immediately.
//
// Tokens are normally one UPPER_SNAKE word. A few (e.g. the spec-02
// scaffold's title) are two or more UPPER words separated by single
// spaces — the token regex below matches those too, but nothing
// looser: a free-text scaffold fill-in (`<Decision 1>`, mixed case
// or punctuation) never matches and is never swept — those are
// documented once, in templates/README.md's "Don't copy these as-is".

const PLACEHOLDER_VOCABULARY = new Set([
  // canonical six (README adoption prompt)
  '<PROJECT>', '<PROJECT_LOWER>', '<HOSTING_URL>', '<HOSTING_PROVIDER>',
  '<REPO_SLUG>', '<DEFAULT_BRANCH>',
  // hosting + deploy
  '<HOSTING_PROVIDER_CLI>', '<HOSTING_PROVIDER_PREVIEW_PATTERN>',
  '<PROVIDER_AUTH_TOKEN>', '<DEPLOY_URL>', '<CUSTOM_DOMAIN>', '<PORT>',
  // project structure
  '<PROJECT_PKG_PREFIX>', '<PROJECT_TAGLINE>', '<CONTENT_LOCATION>',
  '<DATA_LOCATION>', '<WORKSPACE_ORG>', '<PACKAGE_MANAGER>',
  // external services
  '<SERVICE>', '<SERVICE_URL>', '<AUTH_PROVIDER>', '<DB_PROVIDER>',
  '<EMAIL_PROVIDER>', '<AI_PROVIDER>', '<TOKEN_ENDPOINT>',
  '<CRITIQUE_BOT_SECRET>',
  // sub-agents + domain
  '<DOMAIN_SPECIALIST>', '<DOMAIN_SPECIALIST_1>', '<DOMAIN_SPECIALIST_2>',
  '<SPECIALIST_NAME>', '<DOMAIN_AUTHORITATIVE_SOURCE_1>',
  '<DOMAIN_AUTHORITATIVE_SOURCE_2>', '<ARCHIVE_OR_REVIEW_SITE>',
  '<COMMUNITY_HUB_1>',
  // generic fill-ins used in examples
  '<N>', '<M>', '<K>', '<L>', '<H>', '<X>', '<Y>', '<URL>', '<REPO>',
  '<NAME>', '<STATUS>', '<ISO>', '<MOOD>', '<REFERENCE>', '<SPEC_N>',
  '<SPEC_M>', '<SEV>',
  // plan shape (concepts/plan-shape.md)
  '<NN>',
  // multi-word (spec-02 scaffold title and roadmap row)
  '<CANONICAL SIBLING>',
])

// Renamed placeholders: the old name may appear only in the upgrade
// playbook's rename note (old → new), never in a template.
const RETIRED_PLACEHOLDERS = new Map([
  ['<PHASE_N>', '<SPEC_N>'],
  ['<PHASE_M>', '<SPEC_M>'],
])
const RETIRED_PLACEHOLDER_HOME = 'playbooks/upgrade.md'

function legPlaceholders(files) {
  const failures = []
  let seen = 0
  const tokenRe = /<[A-Z][A-Z0-9_]*(?: [A-Z][A-Z0-9_]*)*>/g
  for (const file of files) {
    const lines = read(file).split(/\r?\n/)
    lines.forEach((line, i) => {
      let m
      while ((m = tokenRe.exec(line)) !== null) {
        seen++
        if (RETIRED_PLACEHOLDERS.has(m[0])) {
          if (file.replace(/\\/g, '/') !== RETIRED_PLACEHOLDER_HOME) {
            failures.push(
              `${file}:${i + 1}: ${m[0]} was renamed ${RETIRED_PLACEHOLDERS.get(m[0])} — only ${RETIRED_PLACEHOLDER_HOME} may name the old one`,
            )
          }
        } else if (!PLACEHOLDER_VOCABULARY.has(m[0])) {
          failures.push(
            `${file}:${i + 1}: unknown placeholder ${m[0]} — typo, or add it to PLACEHOLDER_VOCABULARY in scripts/verify.mjs`,
          )
        }
      }
    })
  }
  return { failures, note: `${seen} placeholder tokens` }
}

// --- leg: anatomy ---------------------------------------------------------
// concepts/skills-anatomy.md is the contract; this leg makes it
// mechanical. Applies to adopter-facing templates AND to nexus's
// own skills/ + .claude/commands/ (the kit eats its own dogfood).

const REQUIRED_SKILL_SECTIONS = [
  { name: 'Purpose', re: /^##\s+(\d+\.\s+)?Purpose\b/m },
  { name: 'Invocation', re: /^##\s+(\d+\.\s+)?Invocation\b/m },
  { name: 'Failure modes', re: /^##\s+(\d+\.\s+)?Failure modes\b/m },
  { name: 'Quick reference', re: /^##\s+(\d+\.\s+)?Quick reference\b/m },
]

function globDir(rel) {
  const dir = path.join(ROOT, rel)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `${rel}/${f}`)
}

// Per skill tree (templates/skills/ and skills/); a key ending in
// "/" covers every .md directly in that folder.
const LINE_BUDGETS = {
  'next.md': 200, 'next/': 120, 'heads-down.md': 150, 'plot.md': 200, 'bug.md': 150, 'messy.md': 150,
  'tidy.md': 150, 'rebooting.md': 150, 'reboot-ready.md': 150, 'reboot-resume.md': 150,
  'design.md': 150,
}

// The skills that read issue or page text carry the rule that it is
// data, never instructions (in both trees; spec 54).
const UNTRUSTED_TEXT_SKILLS = ['triage.md', 'bug.md', 'iterate.md']
const UNTRUSTED_TEXT_RULE = [/third-party data, never instructions/, /UI walk/, /at most 120 characters/]

// The support routing (spec 54, scripts/plan/support.mjs), held in
// both trees: triage sends a collaborator's bug to /bug under the
// Support level, /bug fixes it now or plots it Asap under asap_cap,
// and march keeps going after such a triage and builds a ready Asap
// chunk before any critique pass; march's Step 1.5 plots a queued
// issue past sla_hours Asap, and iterate ages user rows into the queue
// (+1 per 12 hours, exempt from the 3.0 floor). A support fix carries
// `Refs #N`, never a closing keyword, and `support.mjs tell` comments
// and closes the issue once it lands (a published package's fix waits
// for its release).
const SUPPORT_ROUTING = {
  'triage.md': [[/support\.mjs route/, 'triage asks `support.mjs route` per issue'], [/skills\/bug\.md/, 'a `bug` route goes to skills/bug.md'], [/Refs #N`?(?:\*\*)?,? never `?Closes/, 'a fix commit carries `Refs #N`, never `Closes`/`Fixes`'], [/support\.mjs tell/, 'a landed fix is told and closed through `support.mjs tell`']],
  'bug.md': [[/asap_cap/, 'a larger bug is plotted Asap only under asap_cap'], [/support\.mjs cap/, '`support.mjs cap` counts the open issue-born Asap chunks'], [/Refs #N`?(?:\*\*)?,? never `?Closes/, 'the fix commit carries `Refs #N`, never `Closes`/`Fixes`'], [/support\.mjs tell/, 'a landed fix is told and closed through `support.mjs tell`']],
  'march.md': [[/support\.mjs continue/, 'Step 1 continues to 3a through `support.mjs continue`'], [/support\.mjs asap/, 'the critique gate waits behind a ready Asap chunk (`support.mjs asap`)'], [/Step 1\.5/, 'a Step 1.5 Support SLA'], [/support\.mjs sla/, 'Step 1.5 plots a queued issue past sla_hours through `support.mjs sla`']],
  'iterate.md': [[/support\.mjs age/, 'user rows age through `support.mjs age`'], [/per 12 hours/, 'a user row gains +1 per 12 hours'], [/floor/, 'a user row is exempt from the 3.0 floor']],
}

// A `<skill>.lanes.md` beside a skill is that project's lanes file
// (scripts/plan/lanes.mjs), not a skill: no anatomy, no command pointer.
const LANES_FILE = /\.lanes\.md$/
const skillDir = (rel) => globDir(rel).filter((f) => !LANES_FILE.test(f))

// The project-lanes extension point: march.md reads its lanes file
// at pre and queue, iterate.md at dimensions; the kit ships both
// lanes files with no live lane (a commented example only), and
// every lanes file present parses clean.
const LANE_HOOKS = { 'march.md': ['lanes.mjs march pre', 'lanes.mjs march queue'], 'iterate.md': ['lanes.mjs iterate dimensions'] }

async function lanesCheck() {
  const failures = []
  const { parseLanes } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/lanes.mjs')).href)
  let files = 0
  for (const base of ['templates/skills', 'skills']) {
    for (const [skill, hooks] of Object.entries(LANE_HOOKS)) {
      const file = `${base}/${skill}`
      const text = fs.existsSync(path.join(ROOT, file)) ? read(file) : ''
      for (const h of hooks) if (!text.includes(h)) failures.push(`${file}: never reads its lanes file at \`${h}\` (the project-lanes hook; scripts/plan/lanes.mjs)`)
      const kind = skill.replace(/\.md$/, '')
      const lanesRel = `${base}/${kind}.lanes.md`
      if (!fs.existsSync(path.join(ROOT, lanesRel))) {
        failures.push(`${lanesRel}: missing (the project-lanes file ${file} reads)`)
        continue
      }
      files++
      const { lanes, problems } = parseLanes(read(lanesRel), kind, lanesRel)
      failures.push(...problems)
      if (base === 'templates/skills') {
        if (lanes.length) failures.push(`${lanesRel}: the kit ships it with no live lane (${lanes.map((l) => l.name).join(', ')}); keep the example inside a comment`)
        if (!/<!--[\s\S]*##\s+lane:[\s\S]*-->/.test(read(lanesRel))) failures.push(`${lanesRel}: the commented example lane is gone`)
      }
    }
  }
  failures.push(...(await generatorsCheck()))
  failures.push(...motionCheck())
  failures.push(...(await locksCheck()))
  return { failures, files }
}

// Lock timeouts (spec 57): no lock holds forever. Both march.md
// copies sweep the locks at Step 0, after the veto sweep; both
// iterate.md copies carry the rule; concepts/plan-shape.md teaches
// it; both bearings name `Lock max age`; and every lock nexus itself
// carries (Held lines, lane locks, owner-blocked rows) parses, so a
// lock the sweep cannot age never ships.
async function locksCheck() {
  const failures = []
  for (const file of ['skills/march.md', 'templates/skills/march.md']) {
    if (!fs.existsSync(path.join(ROOT, file))) continue
    const text = read(file)
    const at = text.indexOf('locks.mjs sweep')
    const veto = text.indexOf('promote.mjs sweep')
    const next = text.indexOf('### Step 0.5')
    if (at < 0 || (next >= 0 && at > next) || (veto >= 0 && at < veto)) failures.push(`${file}: Step 0 never sweeps the locks after the veto sweep (node scripts/plan/locks.mjs sweep)`)
  }
  for (const file of ['skills/iterate.md', 'templates/skills/iterate.md']) {
    if (fs.existsSync(path.join(ROOT, file)) && !/max_age:/.test(read(file))) failures.push(`${file}: no lock-timeout rule (every lock iterate writes or meets carries until: and max_age:)`)
  }
  if (!/^##+ Locks time out/m.test(read('concepts/plan-shape.md'))) failures.push('concepts/plan-shape.md: no "Locks time out" section')
  for (const file of ['plan/bearings.md', 'templates/plan/bearings.md']) {
    if (!/^[-*]\s+Lock max age:\s*\d+d\b/m.test(read(file))) failures.push(`${file}: no \`- Lock max age: <n>d\` line (locks.mjs reads it)`)
  }
  const { findLocks, readFiles } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/locks.mjs')).href)
  for (const l of findLocks(readFiles(ROOT)).filter((x) => x.problem)) failures.push(`${l.file}:${l.line}: lock ${l.slug ?? '?'} ${l.problem}`)
  return failures
}

// The motion heartbeat (spec 57): both heartbeat.yml copies check out
// full history and run the motion alarm; both bearings name the
// Motion floor and stall_action (the template's stall_action stays
// alert, the conservative adopter default); both march.md copies
// react to an open stall issue at Step 0.5.
function motionCheck() {
  const failures = []
  for (const file of ['.github/workflows/heartbeat.yml', 'templates/.github/workflows/heartbeat.yml']) {
    if (!fs.existsSync(path.join(ROOT, file))) continue
    const text = read(file)
    if (!text.includes('scripts/plan/motion.mjs alarm')) failures.push(`${file}: no motion step (node scripts/plan/motion.mjs alarm)`)
    if (!/fetch-depth:\s*0\b/.test(text)) failures.push(`${file}: the motion pulse needs full history (actions/checkout with fetch-depth: 0)`)
  }
  for (const file of ['plan/bearings.md', 'templates/plan/bearings.md']) {
    const text = read(file)
    if (!/^[-*]\s+Motion floor:\s*\d+%/m.test(text)) failures.push(`${file}: no \`- Motion floor: <n>%\` line (the motion alarm reads it)`)
    const m = /^[-*]\s+stall_action:\s*(\S+)/m.exec(text)
    if (!m || !['alert', 'promote', 'off'].includes(m[1])) failures.push(`${file}: no \`- stall_action: alert | promote | off\` line`)
    else if (file.startsWith('templates/') && m[1] !== 'alert') failures.push(`${file}: stall_action ships as alert (the adopter default), not ${m[1]}`)
  }
  for (const file of ['skills/march.md', 'templates/skills/march.md']) {
    if (!fs.existsSync(path.join(ROOT, file))) continue
    const text = read(file)
    const at = text.indexOf('motion.mjs react')
    if (at < 0) {
      failures.push(`${file}: Step 0.5 never reacts to an open motion-stall issue (node scripts/plan/motion.mjs react)`)
      continue
    }
    // `promote #N` must go through the aged promotion (veto issue + Held
    // line), never a bare `/expand promote` pass that writes picks straight in.
    const end = text.indexOf('### Step 1', at)
    const step = text.slice(at, end < 0 ? undefined : end)
    if (/run\s+`\/expand promote`/.test(step) || !step.includes('promote.mjs hold')) failures.push(`${file}: Step 0.5's \`promote #N\` must run only expand's aged promotion (promote.mjs pick -> spec -> loop:veto issue -> promote.mjs hold), not \`/expand promote\``)
  }
  return failures
}

// The refill lane (spec 57): both march.md copies run it at 3a';
// the template's bearings has a `## Generators` section listing none
// (refill is a no-op for an adopter); nexus's parses clean, and every
// generator it lists has its script under scripts/generators/.
async function generatorsCheck() {
  const failures = []
  const { parseGenerators } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/refill.mjs')).href)
  for (const file of ['skills/march.md', 'templates/skills/march.md']) {
    if (fs.existsSync(path.join(ROOT, file)) && !read(file).includes('refill.mjs')) failures.push(`${file}: never runs the stock refill lane (scripts/plan/refill.mjs) at 3a'`)
  }
  const tpl = read('templates/plan/bearings.md')
  if (!/^## Generators\s*$/m.test(tpl)) failures.push('templates/plan/bearings.md: no `## Generators` section (the refill lane reads it)')
  const t = parseGenerators(tpl)
  failures.push(...t.problems.map((p) => p.replace('plan/bearings.md', 'templates/plan/bearings.md')))
  if (t.generators.length) failures.push(`templates/plan/bearings.md: the kit lists no generator by default (${t.generators.map((g) => g.name).join(', ')}); keep examples inside a comment`)
  const own = parseGenerators(read('plan/bearings.md'))
  failures.push(...own.problems)
  for (const g of own.generators) {
    if (!fs.existsSync(path.join(ROOT, 'scripts/generators', `${g.name}.mjs`))) failures.push(`plan/bearings.md: generator ${g.name} has no scripts/generators/${g.name}.mjs`)
  }
  // nexus's own generators (spec 57.9: no template twin) each have a
  // pure suite the scripts leg runs, and are listed for refill to run.
  const listed = new Set(own.generators.map((g) => g.name))
  const suites = PURE_SUITES.filter((s) => s.startsWith('scripts/__tests__/')).map((s) => fs.existsSync(path.join(ROOT, s)) ? read(s) : '')
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts/generators')).filter((f) => f.endsWith('.mjs'))) {
    if (fs.existsSync(path.join(ROOT, 'templates/scripts/generators', f))) continue
    const name = f.replace(/\.mjs$/, '')
    if (!listed.has(name)) failures.push(`scripts/generators/${f}: nexus's own generator is not listed under ## Generators in plan/bearings.md`)
    if (!suites.some((t) => t.includes(`'../generators/${f}'`))) failures.push(`scripts/generators/${f}: no suite in PURE_SUITES (scripts/__tests__/) imports it; a generator ships with its test`)
  }
  return failures
}

async function legAnatomy() {
  const failures = []
  const skillFiles = [...skillDir('templates/skills'), ...skillDir('skills')]
  for (const file of skillFiles) {
    const text = read(file)
    for (const { name, re } of REQUIRED_SKILL_SECTIONS) {
      if (!re.test(text)) failures.push(`${file}: missing canonical section "${name}"`)
    }
  }
  const commandDirs = ['templates/claude/commands', '.claude/commands']
  let commandCount = 0
  for (const dirRel of commandDirs) {
    for (const file of globDir(dirRel)) {
      commandCount++
      const text = read(file)
      if (!/^---\r?\ndescription:/m.test(text)) {
        failures.push(`${file}: missing frontmatter description`)
      }
      if (!text.includes('Argument: $ARGUMENTS')) {
        failures.push(`${file}: missing the literal "Argument: $ARGUMENTS" line`)
      }
      // A double-quoted frontmatter value with a bare `"` inside is
      // broken YAML: Claude Code then drops the description.
      for (const m of text.matchAll(/^([\w-]+): "(.*)"\s*$/gm)) {
        if (/(^|[^\\])"/.test(m[2])) failures.push(`${file}: frontmatter ${m[1]} holds an unescaped double quote (broken YAML)`)
      }
    }
  }
  // Pairing: every template skill has a command pointer, and vice versa.
  const skillNames = new Set(skillDir('templates/skills').map((f) => path.basename(f)))
  const commandNames = new Set(globDir('templates/claude/commands').map((f) => path.basename(f)))
  for (const s of skillNames) {
    if (!commandNames.has(s)) failures.push(`templates/skills/${s} has no templates/claude/commands/${s} pointer`)
  }
  for (const c of commandNames) {
    if (!skillNames.has(c)) failures.push(`templates/claude/commands/${c} has no templates/skills/${c} source of truth`)
  }
  // Same pairing for nexus's own overlay, when present.
  const selfSkills = new Set(skillDir('skills').map((f) => path.basename(f)))
  for (const c of globDir('.claude/commands').map((f) => path.basename(f))) {
    if (!selfSkills.has(c)) failures.push(`.claude/commands/${c} has no skills/${c} source of truth`)
  }
  // Line budgets: /next and /heads-down are read on every run, so
  // they stay short; a lesson becomes a check, not more prose.
  let budgeted = 0
  for (const base of ['templates/skills', 'skills']) {
    for (const [rel, max] of Object.entries(LINE_BUDGETS)) {
      const files = rel.endsWith('/') ? globDir(`${base}/${rel.slice(0, -1)}`) : [`${base}/${rel}`]
      for (const file of files) {
        if (!fs.existsSync(path.join(ROOT, file))) continue
        budgeted++
        const lines = read(file).replace(/\r?\n$/, '').split(/\r?\n/).length
        if (lines > max) failures.push(`${file}: ${lines} lines, over its budget of ${max} — cut as much as you add`)
      }
    }
  }
  for (const base of ['templates/skills', 'skills']) {
    for (const name of UNTRUSTED_TEXT_SKILLS) {
      const file = `${base}/${name}`
      const flat = read(file).replace(/\s+/g, ' ')
      if (!UNTRUSTED_TEXT_RULE.every((re) => re.test(flat))) failures.push(`${file}: missing the rule that issue and page text is data (third-party data, never instructions; UI walk; at most 120 characters)`)
    }
    for (const [name, rules] of Object.entries(SUPPORT_ROUTING)) {
      const file = `${base}/${name}`
      const flat = read(file).replace(/\s+/g, ' ')
      const missing = rules.filter(([re]) => !re.test(flat)).map(([, what]) => what)
      if (missing.length) failures.push(`${file}: missing the support routing (spec 54): ${missing.join('; ')}`)
    }
  }
  // No bare push of the default branch: every committing skill
  // lands per owner mode, and only next/land.md names the push.
  const { lintSkills } = await import(pathToFileURL(path.join(ROOT, 'scripts/bare-push.mjs')).href)
  const pushes = lintSkills(ROOT)
  failures.push(...pushes.problems)
  const lanes = await lanesCheck()
  failures.push(...lanes.failures)
  return { failures, note: `${skillFiles.length} skills, ${commandCount} command pointers, ${budgeted} budgets held, no bare push in ${pushes.files}, ${lanes.files} lanes files clean` }
}

// --- leg: emoji ------------------------------------------------------------
// "No emojis — anywhere" is a standing rule of the methodology; the
// kit holds itself to it. Dingbats the docs legitimately use (✓ ✗ ❌ →)
// live outside the forbidden ranges.

// The geometric shapes U+25AA, U+25AB, U+25B6, U+25C0 and U+25FB-25FE
// render as emoji on some systems (the GUI design handoff's two such
// glyphs were swapped for U+25C2 and U+25A0; packages/cli/design/handoff/README.md).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{2705}\u{2728}\u{26A0}-\u{26FF}\u{2B00}-\u{2BFF}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/u

// The CLI package ships text to users too, so its source files join
// the scan. Tracked files only; no npm install, no build.
function trackedCliSource() {
  const out = execSync('git ls-files packages/cli', { cwd: ROOT, encoding: 'utf-8' })
  return out.trim().split(/\r?\n/).filter((f) => /\.(m?js|cjs|jsx|ts|tsx|json|css|html)$/.test(f))
}

function legEmoji(mdFiles) {
  const failures = []
  const files = [...mdFiles, ...trackedCliSource()]
  for (const file of files) {
    const lines = read(file).split(/\r?\n/)
    lines.forEach((line, i) => {
      const m = line.match(EMOJI_RE)
      if (m) failures.push(`${file}:${i + 1}: emoji ${JSON.stringify(m[0])} — standing rule: no emojis`)
    })
  }
  return { failures, note: `${files.length} files scanned` }
}

// --- leg: dualshell ----------------------------------------------------------
// windows-notes.md promises every playbook code block works on both
// shells. Mechanize the promise: a ```bash fence that leans on a
// POSIX-only tool must have an adjacent ```powershell twin (the next
// or previous fenced block in the file), or an explicit marker on the
// line right before it for the rare case no Windows equivalent exists.

const POSIX_ONLY_TOOLS = new Set([
  'sed', 'awk', 'grep', 'wc', 'xargs', 'tail', 'head', 'cut', 'tr',
  'mkdir', 'cp', 'rm', 'chmod', 'ln', 'find', 'mv', 'rsync', 'touch',
])
const DUALSHELL_MARKER = '<!-- dualshell:posix-only -->'

function parseFences(text) {
  const lines = text.split(/\r?\n/)
  const fences = []
  let open = null
  lines.forEach((line, i) => {
    if (!/^```/.test(line)) return
    if (!open) {
      open = { lang: line.slice(3).trim(), start: i + 1, contentStart: i + 1, precedingLine: (lines[i - 1] || '').trim() }
    } else {
      fences.push({ ...open, content: lines.slice(open.contentStart, i) })
      open = null
    }
  })
  return fences
}

function needsShellTwin(content) {
  return content.some((line) => POSIX_ONLY_TOOLS.has(line.trim().split(/\s+/)[0]))
}

function legDualshell(files) {
  const failures = []
  const playbooks = files.filter((f) => /^playbooks\//.test(normalize(f)))
  let checked = 0
  for (const file of playbooks) {
    const fences = parseFences(read(file))
    fences.forEach((fence, i) => {
      if (fence.lang !== 'bash' || !needsShellTwin(fence.content)) return
      checked++
      if (fence.precedingLine === DUALSHELL_MARKER) return
      const twinLangs = new Set(['powershell', 'pwsh'])
      const prev = fences[i - 1]
      const next = fences[i + 1]
      if ((prev && twinLangs.has(prev.lang)) || (next && twinLangs.has(next.lang))) return
      failures.push(
        `${file}:${fence.start}: bash block relies on a POSIX-only tool with no PowerShell twin — add one, or precede the fence with ${DUALSHELL_MARKER} if none applies`,
      )
    })
  }
  return { failures, note: `${checked} posix-leaning bash blocks checked` }
}

// --- leg: dualshell, syntax half ---------------------------------------------
// The check above catches POSIX-only *tool names*. It misses bash-only
// *syntax* — $(...) and backtick command substitution, a bare VAR=value
// assignment, && / || one-liner chaining, a heredoc, [[ ... ]] — none of
// which parse in PowerShell even when every tool named is cross-platform.
// This is the 52.3 incident: a worktree-cutting step shaped as
// `base=$(git rev-parse ...)` followed by `git worktree add ... "$base"`
// never runs as written in a PowerShell session.
//
// Scoped deliberately to the git-procedure skills the "Skills run in
// PowerShell" design bullet names (plan/52-fresh-repo-onboarding.md) —
// /plot, /next's build and land, and the worktree steps they share — not
// every skill. Several other skills (critique, iterate, ship-a-chunk,
// march, reboot-ready, lessons-pr) lean on the same bash-only shapes for
// unrelated things (mktemp, `gh issue list`, a heredoc PR body); widening
// this list to all of skills/ would force fixing those too, well past
// what this chunk carries. See plan/AUDIT.md for that row.
const SYNTAX_SCOPED_SKILLS = new Set([
  'skills/next/build.md', 'skills/next/land.md', 'skills/next.md', 'skills/plot.md', 'skills/tidy.md',
  'templates/skills/next/build.md', 'templates/skills/next/land.md', 'templates/skills/next.md',
  'templates/skills/plot.md', 'templates/skills/tidy.md',
])

const SYNTAX_CHECKS = [
  [/\$\(/, 'a $(...) command substitution'],
  [/`[^`]*`/, 'a backtick command substitution'],
  [/^\s*[A-Za-z_][A-Za-z0-9_]*=[^=\s]/, 'a bare VAR=value shell assignment'],
  [/(^|\s)(&&|\|\|)(\s|$)/, '&&/|| one-liner chaining'],
  [/<<[-~]?['"]?\w/, 'a heredoc'],
  [/\[\[/, 'a [[ ... ]] test'],
]

function syntaxViolation(line) {
  for (const [re, label] of SYNTAX_CHECKS) {
    if (re.test(line)) return label
  }
  return null
}

/** Every line inside a ```bash fence, 1-indexed, skipping a fence marked `<!-- dualshell:posix-only -->`. */
function bashFenceLines(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let inFence = false
  let marked = false
  lines.forEach((line, i) => {
    if (/^```bash/.test(line)) {
      inFence = true
      marked = (lines[i - 1] || '').trim() === DUALSHELL_MARKER
      return
    }
    if (inFence && /^```/.test(line)) {
      inFence = false
      return
    }
    if (inFence && !marked) out.push({ n: i + 1, line })
  })
  return out
}

function legDualshellSyntax(files) {
  const failures = []
  const scoped = files.filter((f) => SYNTAX_SCOPED_SKILLS.has(normalize(f)))
  let checked = 0
  for (const file of scoped) {
    for (const { n, line } of bashFenceLines(read(file))) {
      checked++
      const bad = syntaxViolation(line)
      if (bad) {
        failures.push(
          `${file}:${n}: ${bad} — bash-only syntax a PowerShell session can't run as written; rewrite the line, or precede the fence with ${DUALSHELL_MARKER} if no PowerShell equivalent applies`,
        )
      }
    }
  }
  return { failures, note: `${checked} bash-fence lines in ${scoped.length} scoped skills checked for bash-only syntax` }
}

// --- leg: chunks ---------------------------------------------------------------
// The plan shape (concepts/plan-shape.md) is mechanical, so the gate
// checks it with the same script adopters run. History is checked
// against HEAD: the working tree is what the next commit records.

async function legChunks() {
  const { runCheck } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan-check.mjs')).href)
  const failures = []
  const notes = []
  for (const dirRel of ['plan', 'templates/plan']) {
    const { failures: f, note } = runCheck({ repoAbs: ROOT, dirRel, since: 'HEAD' })
    failures.push(...f)
    notes.push(`${dirRel}: ${note}`)
  }
  // The Support knob: the repo variable wins in cloud, so a tick
  // whose NEXUS_SUPPORT disagrees with bearings' Support: line warns
  // (a note, never a failure; spec 54).
  const { supportLevel } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/support.mjs')).href)
  const knob = supportLevel(read('plan/bearings.md'), process.env)
  if (knob.note) notes.push(`warn: ${knob.note}`)
  // The checker's own unit tests (node:test, no deps, well under a
  // second): a gate whose rules regress silently is no gate.
  try {
    execSync('node --test templates/scripts/__tests__/plan-check.test.mjs', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    notes.push('plan-check tests pass')
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`
    failures.push('templates/scripts/__tests__/plan-check.test.mjs failed:', ...out.split(/\r?\n/).filter((l) => /^\s*(✖|not ok|Error|AssertionError)/.test(l)).slice(0, 20))
  }
  return { failures, note: notes.join('; ') }
}

// --- legs: scripts, scripts-git ---------------------------------------------
// The plan and claims scripts are templates adopters run on their
// own plan, so their suites gate the kit. The pure suites run on
// every commit; the end-to-end ones spawn git in scratch repos (or
// a workflow step's shell) and are opt-in, like adopt-dryrun.

const PURE_SUITES = [
  'templates/scripts/__tests__/pending.test.mjs',
  'templates/scripts/__tests__/settle.test.mjs',
  'templates/scripts/__tests__/claims-codec.test.mjs',
  'templates/scripts/__tests__/claims-board.test.mjs',
  'templates/scripts/__tests__/push-policy.test.mjs',
  'templates/scripts/__tests__/progress.test.mjs',
  'templates/scripts/__tests__/announce.test.mjs',
  'templates/scripts/__tests__/steer.test.mjs',
  'templates/scripts/__tests__/ledger.test.mjs',
  'templates/scripts/__tests__/order.test.mjs',
  'templates/scripts/__tests__/triage-match.test.mjs',
  'templates/scripts/__tests__/promote.test.mjs',
  'templates/scripts/__tests__/lanes.test.mjs',
  'templates/scripts/__tests__/refill.test.mjs',
  'templates/scripts/__tests__/motion.test.mjs',
  'templates/scripts/__tests__/locks.test.mjs',
  'templates/scripts/__tests__/workflow-lint.test.mjs',
  'templates/scripts/__tests__/tick.test.mjs',
  'templates/scripts/__tests__/quota.test.mjs',
  'templates/scripts/__tests__/lost.test.mjs',
  'templates/scripts/__tests__/idle.test.mjs',
  'templates/scripts/__tests__/chain.test.mjs',
  'templates/scripts/__tests__/cadence.test.mjs',
  'templates/scripts/__tests__/nudge-check.test.mjs',
  'templates/scripts/__tests__/resolve.test.mjs',
  'templates/scripts/__tests__/loop-issue.test.mjs',
  'templates/scripts/__tests__/upgrade-plan.test.mjs',
  'templates/scripts/__tests__/bootstrap.test.mjs',
  'templates/scripts/__tests__/secrets.test.mjs',
  'templates/scripts/__tests__/secrets-vault.test.mjs',
  'templates/scripts/__tests__/secrets-sinks.test.mjs',
  'templates/scripts/__tests__/secrets-audit.test.mjs',
  'templates/scripts/__tests__/secrets-run.test.mjs',
  'templates/scripts/__tests__/design-prompt.test.mjs',
  'templates/scripts/__tests__/design-ingest.test.mjs',
  'templates/scripts/__tests__/design-compare.test.mjs',
  'templates/scripts/__tests__/design-render.test.mjs',
  'templates/scripts/__tests__/design-port.test.mjs',
  'templates/scripts/__tests__/support.test.mjs',
  'templates/scripts/__tests__/ui-walk.test.mjs',
  'scripts/__tests__/url-path-lint.test.mjs',
  'scripts/__tests__/bare-push.test.mjs',
  'scripts/__tests__/probe-latency.test.mjs',
  'scripts/__tests__/patch-v1.test.mjs',
  'scripts/__tests__/march-cli-gate.test.mjs',
  'scripts/__tests__/unreleased.test.mjs',
  'scripts/__tests__/iterate-ui.test.mjs',
  'scripts/__tests__/critique-gui.test.mjs',
  'scripts/__tests__/generators-nexus.test.mjs',
  'scripts/__tests__/release-reply.test.mjs',
]
const GIT_SUITES = [
  'templates/scripts/__tests__/settle-run.test.mjs',
  'templates/scripts/__tests__/claims.test.mjs',
  'templates/scripts/__tests__/push-policy-hook.test.mjs',
  'templates/scripts/__tests__/install-hooks-run.test.mjs',
  'templates/scripts/__tests__/worktree.test.mjs',
  'templates/scripts/__tests__/tick-run.test.mjs',
  'templates/scripts/__tests__/progress-run.test.mjs',
  'templates/scripts/__tests__/upgrade-plan-run.test.mjs',
  'templates/scripts/__tests__/plot-run.test.mjs',
  'templates/scripts/__tests__/secrets-scan-run.test.mjs',
  'templates/scripts/__tests__/heartbeat-quota.test.mjs',
  'templates/scripts/__tests__/heartbeat-red.test.mjs',
  'templates/scripts/__tests__/heartbeat-motion.test.mjs',
  'templates/scripts/__tests__/ui-walk-run.test.mjs',
  'scripts/__tests__/unreleased-run.test.mjs',
]

// nexus runs these scripts on its own plan (npm run settle, npm run
// claims) from byte copies in scripts/: a fix lands in both or the
// gate goes red, so the kit never runs a version adopters don't get.
const DOGFOOD_TWINS = [
  'owner.mjs', 'claims.mjs', 'claims-codec.mjs', 'git/push-policy.mjs',
  'plan/pending.mjs', 'plan/settle.mjs', 'plan/settled.mjs', 'plan/config.mjs', 'plan/footguns.mjs',
  'plan/progress.mjs', 'plan/order.mjs', 'plan/triage-match.mjs', 'plan/promote.mjs', 'plan/lanes.mjs', 'plan/refill.mjs', 'plan/motion.mjs', 'plan/locks.mjs', 'plan/state.mjs', 'plan/support.mjs',
  'generators/issue-age.mjs', 'generators/stale-candidate.mjs', 'generators/motion.mjs', 'plan-check.mjs', 'announce.mjs', 'ledger.mjs', 'worktree.mjs',
  'upgrade-plan.mjs', 'plan/secrets-manifest.mjs', 'secrets.mjs', 'secrets-vault.mjs', 'secrets-keychain.mjs', 'secrets-sinks.mjs',
  'secrets-audit.mjs',
  'secrets-run.mjs', 'secrets-scan.mjs',
  'design/prompt.mjs',
  'design/ingest.mjs',
  'design/png.mjs', 'design/compare.mjs', 'design/render.mjs', 'design/board-runtime.js',
  'design/port-map.mjs', 'design/port.workflow.js',
]
// The steer hook runs in nexus's own sessions from .claude/hooks/, byte for byte the one adopters copy.
const HOOK_TWINS = ['steer.mjs']

async function legScripts() {
  const failures = []
  const text = (rel) => fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n') : null
  for (const f of DOGFOOD_TWINS) {
    const kit = text(`templates/scripts/${f}`)
    const own = text(`scripts/${f}`)
    if (kit === null || own === null) failures.push(`scripts/${f} and templates/scripts/${f}: both must exist (nexus dogfoods the template)`)
    else if (kit !== own) failures.push(`scripts/${f} differs from templates/scripts/${f}: copy the template over it (or the fix into both)`)
  }
  for (const f of HOOK_TWINS) {
    const kit = text(`templates/claude/hooks/${f}`)
    const own = text(`.claude/hooks/${f}`)
    if (kit === null || own === null) failures.push(`.claude/hooks/${f} and templates/claude/hooks/${f}: both must exist (nexus dogfoods the template)`)
    else if (kit !== own) failures.push(`.claude/hooks/${f} differs from templates/claude/hooks/${f}: copy the template over it (or the fix into both)`)
  }
  // The footgun lists (the template adopters copy, and nexus's own)
  // stay in the format and budget settle enforces.
  const { lintFootguns } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/footguns.mjs')).href)
  for (const f of ['templates/identity/footguns.md', 'identity/footguns.md']) {
    if (!fs.existsSync(path.join(ROOT, f))) failures.push(`${f}: missing (the identity layer's footgun list)`)
    else failures.push(...lintFootguns(read(f), f))
  }
  // The secrets manifest adopters copy keeps the shape plan-check
  // enforces (nexus's own nexus.secrets.json is checked by the chunks leg).
  const { readManifest } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/secrets-manifest.mjs')).href)
  const kitManifest = readManifest(path.join(ROOT, 'templates/env/nexus.secrets.json'))
  if (!kitManifest) failures.push('templates/env/nexus.secrets.json: missing (the secrets manifest template)')
  else failures.push(...kitManifest.problems.map((p) => `templates/env/nexus.secrets.json: ${p}`))
  // The guard hook (nexus's own and the template) is a gate too: its
  // self-test runs every rule against canned commands.
  for (const g of ['.claude/hooks/guard.mjs', 'templates/claude/hooks/guard.mjs']) {
    try {
      execSync(`node ${g} self-test`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    } catch (err) {
      failures.push(`${g} self-test failed:`, ...`${err.stdout || ''}`.split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 10))
    }
  }
  // Each guard mode is wired to its tools in both settings files: a mode
  // nothing calls is a rule that never fires (pre-agent: the background
  // rule for subagents, spec 55).
  for (const s of ['.claude/settings.json', 'templates/claude/settings.json']) {
    let pre = []
    let stop = []
    try {
      const hooks = JSON.parse(read(s)).hooks ?? {}
      pre = hooks.PreToolUse ?? []
      stop = hooks.Stop ?? []
    } catch (err) {
      failures.push(`${s}: unparseable (${err.message})`)
      continue
    }
    const wires = (list, matcher, mode) => list.some((h) => (matcher === null || String(h.matcher ?? '').split('|').includes(matcher)) &&
      (h.hooks ?? []).some((c) => new RegExp(`guard\\.mjs ${mode}$`).test(String(c.command ?? ''))))
    for (const [tool, mode] of [['Bash', 'pre-bash'], ['Read', 'pre-read'], ['Grep', 'pre-read'], ['Agent', 'pre-agent'], ['Task', 'pre-agent']]) {
      if (!wires(pre, tool, mode)) failures.push(`${s}: PreToolUse does not wire guard.mjs ${mode} on ${tool}`)
    }
    if (!wires(stop, null, 'stop')) failures.push(`${s}: Stop does not wire guard.mjs stop`)
  }
  // No script resolves a file path through URL.pathname (it keeps %20
  // and a /C:/ drive): fileURLToPath only, in every script dir.
  const { lintTree } = await import(pathToFileURL(path.join(ROOT, 'scripts/url-path-lint.mjs')).href)
  const urls = lintTree(ROOT)
  failures.push(...urls.problems)
  const suites = runSuites(PURE_SUITES, 'pure')
  return { failures: [...failures, ...suites.failures], note: `${suites.note}; ${DOGFOOD_TWINS.length + HOOK_TWINS.length} dogfood twins match; 2 guard self-tests green, every guard mode wired in 2 settings files; 2 footgun lists lint clean; no URL.pathname file paths in ${urls.files} scripts` }
}

function runSuites(suites, label) {
  try {
    execSync(`node --test ${suites.join(' ')}`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    return { failures: [], note: `${suites.length} ${label} suites pass` }
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`
    return { failures: ['node --test failed:', ...out.split(/\r?\n/).filter((l) => /^\s*(✖|not ok|Error|AssertionError)/.test(l)).slice(0, 20)], note: 'see failures' }
  }
}

// --- leg: workflows -----------------------------------------------------------
// The cloud loop's workflow files (nexus's own and the templates)
// are checked by the same script adopters add to their gate.

async function legWorkflows() {
  const { lintDirs } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/workflow-lint.mjs')).href)
  const { problems, files } = lintDirs(['.github/workflows', '.github/actions', 'templates/.github/workflows', 'templates/.github/actions'].map((d) => path.join(ROOT, d)))
  const failures = problems.map((p) => { const m = /^(.*?\.ya?ml)(:.*)$/s.exec(p); return m ? normalize(path.relative(ROOT, m[1])) + m[2] : p })
  failures.push(...marchGovernorCheck())
  failures.push(...nudgeCheck())
  return { failures, note: `${files} workflows and actions: hosted runners for secrets, contexts, no outsider text in run scripts; march.yml's reason, dispatch ceiling, loop-filed marker and chain step; nudge.yml's filters and twin` }
}

// Spec 54: the event tick. templates/.github/workflows/nudge.yml
// listens to issues (opened, reopened, labeled), runs no model and
// reads no secret, holds its trust filters in the job `if:`
// (NEXUS_SUPPORT, no bot, no loop:opened mirror, no loop-filed
// Cloud-Run: issue, a collaborator's author_association, loop:do
// for labeled) and runs nudge-check.mjs with nothing interpolated
// into the script, in two minutes at most. nexus's own copy is the
// template with the script run in place (templates/scripts/cloud/).
// The checks themselves are nudge-check.test.mjs's.
function nudgeCheck(readFile = read, exists = (f) => fs.existsSync(path.join(ROOT, f))) {
  const failures = []
  const tpl = 'templates/.github/workflows/nudge.yml'
  const own = '.github/workflows/nudge.yml'
  if (!exists(tpl)) return [`${tpl}: missing (the event tick, spec 54)`]
  const text = readFile(tpl).replace(/\r\n/g, '\n')
  if (!/^\s{2}issues:\s*\n\s{4}types:\s*\[opened, reopened, labeled\]\s*$/m.test(text)) failures.push(`${tpl}: must run on issues: types: [opened, reopened, labeled]`)
  if (/\bsecrets\./.test(text) || /claude-code-action/.test(text)) failures.push(`${tpl}: the nudge reads no secret and runs no model`)
  const t = /^\s+timeout-minutes:\s*(\d+)\s*$/m.exec(text)
  if (!t || Number(t[1]) > 2) failures.push(`${tpl}: timeout-minutes must be at most 2`)
  if (!/^\s+actions:\s*write\b/m.test(text)) failures.push(`${tpl}: the dispatch needs \`actions: write\``)
  const cond = /^ {4}if: >-?\n((?: {6}.*\n)+)/m.exec(text)?.[1] ?? ''
  for (const [want, why] of [
    ['vars.NEXUS_SUPPORT', 'NEXUS_SUPPORT set and not off'],
    ["github.event.sender.type != 'Bot'", 'no bot sender'],
    ["'loop:opened'", 'no loop:opened mirror'],
    ["'Cloud-Run:'", 'no loop-filed issue'],
    ['github.event.issue.author_association', "a collaborator's issue"],
    ["github.event.label.name == 'loop:do'", 'labeled passes only for loop:do'],
  ]) if (!cond.includes(want)) failures.push(`${tpl}: the job if: never checks ${why} (${want})`)
  const runs = [...text.matchAll(/^\s+run:\s*(.*)$/gm)].map((m) => m[1])
  if (!runs.some((r) => /^node scripts\/cloud\/nudge-check\.mjs\b/.test(r))) failures.push(`${tpl}: no step runs scripts/cloud/nudge-check.mjs`)
  if (runs.some((r) => r.includes('${{'))) failures.push(`${tpl}: a run script interpolates an expression (pass it through env:)`)
  if (!exists(own)) failures.push(`${own}: missing (nexus runs the event tick)`)
  else {
    const want = text.replace('\n            scripts/cloud\n', '\n            templates/scripts/cloud\n').replace('run: node scripts/cloud/nudge-check.mjs', 'run: node templates/scripts/cloud/nudge-check.mjs')
    if (readFile(own).replace(/\r\n/g, '\n') !== want) failures.push(`${own}: must be ${tpl} with the script run in place (templates/scripts/cloud/)`)
  }
  return failures
}

// Spec 54: both march.yml copies take a `reason` input shown in the
// run name (the nudge counts its event ticks by it), hold the
// dispatch ceiling in the ceiling step (quota.mjs dispatch against
// NEXUS_DISPATCH_MAX, with actions: read), and tell the tick that an
// issue it opens carries the `Cloud-Run:` loop-filed marker and no
// urgent label. The 0.97 hard quota ceiling is quota.mjs's HARD_MAX,
// held by its tests.
function marchGovernorCheck(readFile = read) {
  const failures = []
  for (const file of ['.github/workflows/march.yml', 'templates/.github/workflows/march.yml']) {
    if (!fs.existsSync(path.join(ROOT, file))) continue
    const text = readFile(file)
    const runName = /^run-name:\s*(.*)$/m.exec(text)
    if (!runName || !runName[1].includes('inputs.verb') || !runName[1].includes('inputs.reason')) failures.push(`${file}: run-name must show the verb and the reason (run-name: march \${{ inputs.verb || 'march' }} \${{ inputs.reason }})`)
    if (!/^\s{6}reason:\s*$/m.test(text)) failures.push(`${file}: no workflow_dispatch \`reason\` input`)
    const ceiling = text.indexOf('id: ceiling')
    const ceilingEnd = ceiling < 0 ? -1 : text.indexOf('\n      - ', ceiling)
    const step = ceiling < 0 ? '' : text.slice(ceiling, ceilingEnd < 0 ? undefined : ceilingEnd)
    if (!/quota\.mjs dispatch\b/.test(step) || !step.includes('NEXUS_DISPATCH_MAX')) failures.push(`${file}: the ceiling step holds no dispatch ceiling (quota.mjs dispatch against NEXUS_DISPATCH_MAX)`)
    if (!/^\s+actions:\s*(read|write)\b/m.test(text)) failures.push(`${file}: the dispatch ceiling needs \`actions: read\``)
    if (!/loop-filed marker/.test(text) || !/never .*`?bug`?, `?loop:do`?/.test(text)) failures.push(`${file}: the prompt never says an issue the tick opens carries the Cloud-Run: loop-filed marker and no urgent label`)
    failures.push(...marchChainCheck(file, text, step))
  }
  return failures
}

// Spec 55: self-chaining. Each march.yml copy takes a numeric `chain`
// input, its ceiling step hands the chain its ceiling, and every
// "Chain next tick" step runs chain.mjs with this run's depth, its
// quota reading and the chain max its job's Cadence step resolved
// (55.5: NEXUS_CHAIN_MAX, else the NEXUS_CADENCE preset's; neither
// carries a default of its own, so the variables alone decide whether
// a repo chains), with `actions: write` to dispatch. The guards
// themselves are chain.test.mjs's.
function marchChainCheck(file, text, ceilingStep) {
  const failures = []
  const lf = text.replace(/\r\n/g, '\n')
  if (!/^\s{6}chain:\s*\n(?:\s{8}.*\n)*?\s{8}type:\s*number\s*$/m.test(lf)) failures.push(`${file}: no numeric workflow_dispatch \`chain\` input`)
  if (!/echo "ceiling=\$ceiling" >> "\$GITHUB_OUTPUT"/.test(ceilingStep)) failures.push(`${file}: the ceiling step never outputs \`ceiling\` (the chain step's budget guard reads it)`)
  if (!/CADENCE_CEILING: \$\{\{ steps\.cadence\.outputs\.ceiling \}\}/.test(ceilingStep)) failures.push(`${file}: the ceiling step must read the Cadence step's ceiling (CADENCE_CEILING: \${{ steps.cadence.outputs.ceiling }})`)
  const steps = lf.split(/\n(?= {6}- )/).filter((s) => /^ {6}- name: Chain next tick\s*$/m.test(s))
  if (!steps.length) failures.push(`${file}: no "Chain next tick" step`)
  for (const s of steps) {
    if (!/cloud\/chain\.mjs\b/.test(s)) failures.push(`${file}: "Chain next tick" does not run chain.mjs`)
    if (!/CHAIN_MAX: \$\{\{ steps\.cadence\.outputs\.chain_max \}\}/.test(s)) failures.push(`${file}: "Chain next tick" must read the chain max its Cadence step resolved (CHAIN_MAX: \${{ steps.cadence.outputs.chain_max }})`)
    if (!/CHAIN: \$\{\{ inputs\.chain \}\}/.test(s) || !/--quota "\$QUOTA"/.test(s)) failures.push(`${file}: "Chain next tick" must pass this run's chain input and quota reading`)
    // The steps of this step's job before it: back to the last job header (`  <name>:` alone on its line).
    const before = lf.slice(0, lf.indexOf(s))
    const head = [...before.matchAll(/\n {2}[\w-]+:\n/g)].pop()
    if (!/^ {6}- name: Cadence\s*$/m.test(head ? before.slice(head.index) : before)) failures.push(`${file}: the job that runs "Chain next tick" has no Cadence step before it`)
  }
  for (const s of lf.split(/\n(?= {6}- )/).filter((x) => /^ {6}- name: Cadence\s*$/m.test(x))) {
    if (!/cloud\/cadence\.mjs resolve\b/.test(s)) failures.push(`${file}: a Cadence step does not run cadence.mjs resolve`)
    for (const v of ['NEXUS_CADENCE', 'NEXUS_CHAIN_MAX']) {
      if (!new RegExp(`\\$\\{\\{ vars\\.${v} \\}\\}`).test(s)) failures.push(`${file}: a Cadence step must read ${v} with no default of its own`)
    }
  }
  if (!/^\s+actions:\s*write\b/m.test(text)) failures.push(`${file}: the chain step needs \`actions: write\` to dispatch`)
  return failures
}

// --- leg: cadence-twins -------------------------------------------------------
// Spec 55.5: the Cadence, Quota gate and Chain next tick steps must not
// drift between the copy nexus runs, the template adopters copy and
// the CLI's bundled kit (scripts/cadence-twins.mjs), plus its suite.

async function legCadenceTwins() {
  const { check } = await import(pathToFileURL(path.join(ROOT, 'scripts/cadence-twins.mjs')).href)
  const { problems, note } = check(ROOT)
  const suite = runSuites(['scripts/__tests__/cadence-twins.test.mjs'], 'checker')
  return { failures: [...problems, ...suite.failures], note: `${note}; ${suite.note}` }
}

// --- leg: diagrams ------------------------------------------------------------
// The README's diagrams are generated (scripts/diagrams.mjs, one
// style table); a committed SVG that drifts from its source is red.

async function legDiagrams() {
  const { check, DIAGRAMS } = await import(pathToFileURL(path.join(ROOT, 'scripts/diagrams.mjs')).href)
  const suite = runSuites(['scripts/__tests__/diagrams.test.mjs'], 'generator')
  return { failures: [...check(), ...suite.failures], note: `${Object.keys(DIAGRAMS).length} SVGs match scripts/diagrams.mjs; ${suite.note}` }
}

// --- leg: gifs ----------------------------------------------------------------
// The README's GIFs are recorded from demo scenarios (packages/cli,
// npm run record); each must fit the budget and carry its poster.

async function legGifs() {
  const { check } = await import(pathToFileURL(path.join(ROOT, 'scripts/gifs.mjs')).href)
  const { problems, gifs } = check()
  const suite = runSuites(['scripts/__tests__/gifs.test.mjs'], 'checker')
  return { failures: [...problems, ...suite.failures], note: `${gifs.length} README GIF${gifs.length === 1 ? '' : 's'} within 5-8 s and 3 MB, each with its poster; ${suite.note}` }
}

// --- leg: secrets -------------------------------------------------------------
// The rail behind "the model sees names, never values": a value that
// reaches a diff would reach git history. The vault is the primary
// checkout's (every worktree shares it); the values stay in memory.

async function legSecrets() {
  const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href)
  const { openVault } = await load('scripts/secrets-vault.mjs')
  const { describeHit, scanRepo, vaultValues } = await load('scripts/secrets-scan.mjs')
  const { localSettings, primaryRoot } = await load('scripts/owner.mjs')
  const { readManifest } = await load('scripts/plan/secrets-manifest.mjs')
  let vroot = ROOT
  try { vroot = primaryRoot(ROOT) } catch { /* not a checkout: the vault beside it */ }
  const manifest = readManifest(path.join(ROOT, 'nexus.secrets.json'))
  const values = vaultValues(openVault({ root: vroot, settings: localSettings(vroot) }), manifest ? [...manifest.names] : [])
  if (!values.size) return { failures: [], note: 'no vault values here (.env, .env.workspace, keychain): nothing to scan for' }
  const { hits, scanned } = scanRepo({ root: ROOT, values })
  return { failures: hits.map(describeHit), note: `${scanned} added lines (vs HEAD, and untracked) hold none of ${values.size} vault values` }
}

// --- leg: upgrade -------------------------------------------------------------
// The playbook's manual copy list and the CLI's bundled kit come from
// one computed closure; a script that grows an import, a skill that
// calls a new script, or a playbook path that goes stale is red here.

async function legUpgrade() {
  const { check } = await import(pathToFileURL(path.join(ROOT, 'scripts/upgrade-files.mjs')).href)
  const { problems, files } = check(ROOT)
  // The kit-text snapshot: a kit edit to march.md or iterate.md lands with --write in the same commit.
  const kitText = await import(pathToFileURL(path.join(ROOT, 'scripts/upgrade-kit-text.mjs')).href)
  const text = await kitText.check(ROOT)
  const suite = runSuites(['scripts/__tests__/upgrade-files.test.mjs', 'scripts/__tests__/upgrade-kit-text.test.mjs'], 'upgrade')
  const counts = Object.entries(text.counts).map(([s, c]) => `${s} ${c.paras}`).join(', ')
  return { failures: [...problems, ...text.problems, ...suite.failures], note: `${files.length} kit files, closure closed, playbooks/upgrade.md's copy list current; kit-text snapshot current (paragraphs: ${counts}); ${suite.note}` }
}

// --- leg: state-size ----------------------------------------------------------
// The state diet (spec 57): a pass narrative belongs in its commit
// body, and a Done row past 30 days in git, not in a queue every tick
// pays to read.

async function legStateSize() {
  const { DONE_DAYS, checkState, doneRows, gitBlame, maxKb } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/state.mjs')).href)
  const { daysBetween, today } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/promote.mjs')).href)
  const kb = maxKb()
  const own = checkState(ROOT, { kb })
  const kit = checkState(path.join(ROOT, 'templates'), { kb, label: 'templates/' })
  const failures = [...own.problems, ...kit.problems]
  for (const file of ['skills/iterate.md', 'templates/skills/iterate.md']) {
    if (fs.existsSync(path.join(ROOT, file)) && !/state\.mjs compact/.test(read(file))) failures.push(`${file}: never compacts the queues (node scripts/plan/state.mjs compact --write)`)
  }
  let stale = 0
  for (const rel of ['plan/AUDIT.md', 'plan/CRITIQUE.md']) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue
    stale += doneRows(read(rel), { blame: gitBlame(ROOT, rel) }).filter((r) => r.date && daysBetween(r.date, today()) > DONE_DAYS).length
  }
  const suite = runSuites(['templates/scripts/__tests__/state.test.mjs'], 'state')
  const due = stale ? `; ${stale} Done row${stale === 1 ? '' : 's'} past ${DONE_DAYS} days (node scripts/plan/state.mjs compact --write)` : ''
  return { failures: [...failures, ...suite.failures], note: `${own.checked + kit.checked} queue files: headers <= 20 lines, <= ${kb} KB${due}; ${suite.note}` }
}

// --- leg: adopt-dryrun ------------------------------------------------------
// Opt-in — see the file header. Shells out to the standalone
// script rather than duplicating its logic here.

function legAdoptDryrun() {
  try {
    const out = execSync('node scripts/adopt-dryrun.mjs', { cwd: ROOT, encoding: 'utf-8' })
    const match = out.match(/\(([^)]*)\)/)
    return { failures: [], note: match ? match[1] : out.trim() }
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message
    return { failures: output.split('\n'), note: 'see failures' }
  }
}

// --- leg: design -------------------------------------------------------------
// Opt-in, like adopt-dryrun: the handoff and its port map change only
// with a delivery or a port, so the default pass skips the hashing.

async function legDesign() {
  const { checkAll } = await import(pathToFileURL(path.join(ROOT, 'scripts/design/port-map.mjs')).href)
  const res = checkAll(ROOT)
  return { failures: res.problems, note: res.note }
}

// --- runner ------------------------------------------------------------------

const LEGS = {
  links: (files) => legLinks(files),
  tree: () => legTree(),
  discover: (files) => legDiscover(files),
  placeholders: (files) => legPlaceholders(files),
  anatomy: () => legAnatomy(),
  emoji: (files) => legEmoji(files),
  dualshell: (files) => {
    const tools = legDualshell(files)
    const syntax = legDualshellSyntax(files)
    return { failures: [...tools.failures, ...syntax.failures], note: `${tools.note}; ${syntax.note}` }
  },
  chunks: () => legChunks(),
  scripts: () => legScripts(),
  workflows: () => legWorkflows(),
  'cadence-twins': () => legCadenceTwins(),
  diagrams: () => legDiagrams(),
  gifs: () => legGifs(),
  secrets: () => legSecrets(),
  upgrade: () => legUpgrade(),
  'state-size': () => legStateSize(),
  'scripts-git': () => runSuites(GIT_SUITES, 'end-to-end'),
  'adopt-dryrun': () => legAdoptDryrun(),
  design: () => legDesign(),
}

// Opt-in legs run only when named explicitly or env-gated on —
// excluded from the default no-argument pass so the gate stays
// fast (agents.md rule 3: foreground, every commit).
const OPT_IN_LEGS = new Set(['adopt-dryrun', 'scripts-git', 'design'])
const OPT_IN_ENV = { 'adopt-dryrun': 'NEXUS_VERIFY_ADOPT_DRYRUN', 'scripts-git': 'NEXUS_VERIFY_GIT_TESTS', design: 'NEXUS_VERIFY_DESIGN' }

async function main() {
  const only = process.argv[2]
  if (only && !LEGS[only]) {
    process.stderr.write(`verify: unknown leg "${only}". Legs: ${Object.keys(LEGS).join(', ')}\n`)
    process.exit(1)
  }
  const files = trackedMarkdown()
  let red = false
  for (const [name, run] of Object.entries(LEGS)) {
    if (only && name !== only) continue
    if (!only && OPT_IN_LEGS.has(name) && process.env[OPT_IN_ENV[name]] !== '1') continue
    const { failures, note } = await run(files)
    if (failures.length === 0) {
      process.stdout.write(`  ${name.padEnd(13)} ok    (${note})\n`)
    } else {
      red = true
      process.stdout.write(`  ${name.padEnd(13)} FAIL  (${failures.length})\n`)
      for (const f of failures) process.stdout.write(`    ${f}\n`)
    }
  }
  process.stdout.write(red ? '\nverify: RED — fix before committing.\n' : '\nverify: green.\n')
  process.exit(red ? 1 : 0)
}

main()
