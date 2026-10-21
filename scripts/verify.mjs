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
//                 /heads-down 150
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
//                 plus that script's own node:test suite
//   scripts       the node:test suites of the plan, claims and push
//                 policy scripts adopters copy (templates/scripts/plan/,
//                 claims, git/push-policy, announce, ledger), and both
//                 guard hooks' self-tests:
//                 pure, no git, no network, about a second; and
//                 nexus's own copies in scripts/ match them byte
//                 for byte (the kit dogfoods what it ships)
//   workflows     every workflow in .github/workflows/ and
//                 templates/.github/workflows/ keeps the cloud-loop
//                 rules (templates/scripts/workflow-lint.mjs): a
//                 secret runs on hosted runners only, run-name and
//                 env blocks read only the contexts GitHub allows
//                 there and never a secret or token, and no run
//                 script interpolates outsider text; each
//                 composite action in .github/actions/ and
//                 templates/.github/actions/ keeps the run-script
//                 rule and reads no secret
//   diagrams      every assets/*.svg is byte-identical to what
//                 scripts/diagrams.mjs generates (regenerated in
//                 memory; a hand edit, a missing or a stray SVG is
//                 red, naming the file), plus the generator's own
//                 node:test suite
//   scripts-git   opt-in — the same scripts end to end in scratch git
//                 repos in the temp folder (offline, but every case
//                 spawns git, so tens of seconds). Opt in with
//                 `node scripts/verify.mjs scripts-git` or
//                 `NEXUS_VERIFY_GIT_TESTS=1 node scripts/verify.mjs`
//   adopt-dryrun  opt-in — mechanizes playbooks/new-project.md's
//                 copy + placeholder-sweep + prune blocks. Skipped by
//                 the default no-argument run; opt in with
//                 `node scripts/verify.mjs adopt-dryrun` or
//                 `NEXUS_VERIFY_ADOPT_DRYRUN=1 node scripts/verify.mjs`
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
  return { failures, note: `${checked} tree entries, ${reverseChecked} files reverse-checked` }
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

const PLACEHOLDER_VOCABULARY = new Set([
  // canonical six (README adoption prompt)
  '<PROJECT>', '<PROJECT_LOWER>', '<HOSTING_URL>', '<HOSTING_PROVIDER>',
  '<REPO_SLUG>', '<DEFAULT_BRANCH>',
  // hosting + deploy
  '<HOSTING_PROVIDER_CLI>', '<HOSTING_PROVIDER_PREVIEW_PATTERN>',
  '<PROVIDER_AUTH_TOKEN>', '<DEPLOY_URL>', '<CUSTOM_DOMAIN>', '<PORT>',
  // project structure
  '<PROJECT_PKG_PREFIX>', '<PROJECT_TAGLINE>', '<CONTENT_LOCATION>',
  '<DATA_LOCATION>', '<WORKSPACE_ORG>',
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
  '<NAME>', '<STATUS>', '<ISO>', '<MOOD>', '<REFERENCE>', '<PHASE_N>',
  '<PHASE_M>', '<SEV>',
  // plan shape (concepts/plan-shape.md)
  '<NN>',
])

function legPlaceholders(files) {
  const failures = []
  let seen = 0
  const tokenRe = /<[A-Z][A-Z0-9_]*>/g
  for (const file of files) {
    const lines = read(file).split(/\r?\n/)
    lines.forEach((line, i) => {
      let m
      while ((m = tokenRe.exec(line)) !== null) {
        seen++
        if (!PLACEHOLDER_VOCABULARY.has(m[0])) {
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
}

function legAnatomy() {
  const failures = []
  const skillFiles = [...globDir('templates/skills'), ...globDir('skills')]
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
  const skillNames = new Set(globDir('templates/skills').map((f) => path.basename(f)))
  const commandNames = new Set(globDir('templates/claude/commands').map((f) => path.basename(f)))
  for (const s of skillNames) {
    if (!commandNames.has(s)) failures.push(`templates/skills/${s} has no templates/claude/commands/${s} pointer`)
  }
  for (const c of commandNames) {
    if (!skillNames.has(c)) failures.push(`templates/claude/commands/${c} has no templates/skills/${c} source of truth`)
  }
  // Same pairing for nexus's own overlay, when present.
  const selfSkills = new Set(globDir('skills').map((f) => path.basename(f)))
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
  return { failures, note: `${skillFiles.length} skills, ${commandCount} command pointers, ${budgeted} budgets held` }
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
// every commit; the end-to-end ones spawn git in scratch repos and
// are opt-in, like adopt-dryrun.

const PURE_SUITES = [
  'templates/scripts/__tests__/pending.test.mjs',
  'templates/scripts/__tests__/settle.test.mjs',
  'templates/scripts/__tests__/claims-codec.test.mjs',
  'templates/scripts/__tests__/push-policy.test.mjs',
  'templates/scripts/__tests__/progress.test.mjs',
  'templates/scripts/__tests__/announce.test.mjs',
  'templates/scripts/__tests__/ledger.test.mjs',
  'templates/scripts/__tests__/order.test.mjs',
  'templates/scripts/__tests__/workflow-lint.test.mjs',
  'templates/scripts/__tests__/tick.test.mjs',
  'templates/scripts/__tests__/resolve.test.mjs',
  'templates/scripts/__tests__/loop-issue.test.mjs',
  'scripts/__tests__/url-path-lint.test.mjs',
]
const GIT_SUITES = [
  'templates/scripts/__tests__/settle-run.test.mjs',
  'templates/scripts/__tests__/claims.test.mjs',
  'templates/scripts/__tests__/push-policy-hook.test.mjs',
  'templates/scripts/__tests__/worktree.test.mjs',
  'templates/scripts/__tests__/tick-run.test.mjs',
  'templates/scripts/__tests__/progress-run.test.mjs',
]

// nexus runs these scripts on its own plan (npm run settle, npm run
// claims) from byte copies in scripts/: a fix lands in both or the
// gate goes red, so the kit never runs a version adopters don't get.
const DOGFOOD_TWINS = [
  'owner.mjs', 'claims.mjs', 'claims-codec.mjs', 'git/push-policy.mjs',
  'plan/pending.mjs', 'plan/settle.mjs', 'plan/settled.mjs', 'plan/config.mjs', 'plan/footguns.mjs',
  'plan/progress.mjs', 'plan/order.mjs', 'plan-check.mjs', 'announce.mjs', 'ledger.mjs', 'worktree.mjs',
]

async function legScripts() {
  const failures = []
  const text = (rel) => fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n') : null
  for (const f of DOGFOOD_TWINS) {
    const kit = text(`templates/scripts/${f}`)
    const own = text(`scripts/${f}`)
    if (kit === null || own === null) failures.push(`scripts/${f} and templates/scripts/${f}: both must exist (nexus dogfoods the template)`)
    else if (kit !== own) failures.push(`scripts/${f} differs from templates/scripts/${f}: copy the template over it (or the fix into both)`)
  }
  // The footgun lists (the template adopters copy, and nexus's own)
  // stay in the format and budget settle enforces.
  const { lintFootguns } = await import(pathToFileURL(path.join(ROOT, 'templates/scripts/plan/footguns.mjs')).href)
  for (const f of ['templates/identity/footguns.md', 'identity/footguns.md']) {
    if (!fs.existsSync(path.join(ROOT, f))) failures.push(`${f}: missing (the identity layer's footgun list)`)
    else failures.push(...lintFootguns(read(f), f))
  }
  // The guard hook (nexus's own and the template) is a gate too: its
  // self-test runs every rule against canned commands.
  for (const g of ['.claude/hooks/guard.mjs', 'templates/claude/hooks/guard.mjs']) {
    try {
      execSync(`node ${g} self-test`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    } catch (err) {
      failures.push(`${g} self-test failed:`, ...`${err.stdout || ''}`.split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 10))
    }
  }
  // No script resolves a file path through URL.pathname (it keeps %20
  // and a /C:/ drive): fileURLToPath only, in every script dir.
  const { lintTree } = await import(pathToFileURL(path.join(ROOT, 'scripts/url-path-lint.mjs')).href)
  const urls = lintTree(ROOT)
  failures.push(...urls.problems)
  const suites = runSuites(PURE_SUITES, 'pure')
  return { failures: [...failures, ...suites.failures], note: `${suites.note}; ${DOGFOOD_TWINS.length} dogfood twins match; 2 guard self-tests green; 2 footgun lists lint clean; no URL.pathname file paths in ${urls.files} scripts` }
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
  return { failures: problems.map((p) => { const m = /^(.*?\.ya?ml)(:.*)$/s.exec(p); return m ? normalize(path.relative(ROOT, m[1])) + m[2] : p }), note: `${files} workflows and actions: hosted runners for secrets, contexts, no outsider text in run scripts` }
}

// --- leg: diagrams ------------------------------------------------------------
// The README's diagrams are generated (scripts/diagrams.mjs, one
// style table); a committed SVG that drifts from its source is red.

async function legDiagrams() {
  const { check, DIAGRAMS } = await import(pathToFileURL(path.join(ROOT, 'scripts/diagrams.mjs')).href)
  const suite = runSuites(['scripts/__tests__/diagrams.test.mjs'], 'generator')
  return { failures: [...check(), ...suite.failures], note: `${Object.keys(DIAGRAMS).length} SVGs match scripts/diagrams.mjs; ${suite.note}` }
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

// --- runner ------------------------------------------------------------------

const LEGS = {
  links: (files) => legLinks(files),
  tree: () => legTree(),
  discover: (files) => legDiscover(files),
  placeholders: (files) => legPlaceholders(files),
  anatomy: () => legAnatomy(),
  emoji: (files) => legEmoji(files),
  dualshell: (files) => legDualshell(files),
  chunks: () => legChunks(),
  scripts: () => legScripts(),
  workflows: () => legWorkflows(),
  diagrams: () => legDiagrams(),
  'scripts-git': () => runSuites(GIT_SUITES, 'end-to-end'),
  'adopt-dryrun': () => legAdoptDryrun(),
}

// Opt-in legs run only when named explicitly or env-gated on —
// excluded from the default no-argument pass so the gate stays
// fast (agents.md rule 3: foreground, every commit).
const OPT_IN_LEGS = new Set(['adopt-dryrun', 'scripts-git'])
const OPT_IN_ENV = { 'adopt-dryrun': 'NEXUS_VERIFY_ADOPT_DRYRUN', 'scripts-git': 'NEXUS_VERIFY_GIT_TESTS' }

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
