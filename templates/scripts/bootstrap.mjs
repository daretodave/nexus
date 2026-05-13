#!/usr/bin/env node
// scripts/bootstrap.mjs — the executor layer
//
// State-aware, idempotent, never destructive. Takes a project
// from "tokens in hand" to a green deploy + a ticking cloud
// loop by orchestrating provider CLIs (gh, vercel, supabase).
//
// See nexus/customization/bootstrap-automation.md for the full
// contract, mental model, and rules.
//
// Invocations:
//   node scripts/bootstrap.mjs                  # interactive walk
//   node scripts/bootstrap.mjs status           # read-only state report
//   node scripts/bootstrap.mjs --manifest       # use bootstrap.local.json
//   node scripts/bootstrap.mjs <service>        # one service slice
//   node scripts/bootstrap.mjs cloud-loop       # cloud-loop only
//   node scripts/bootstrap.mjs continue         # resume from last gap
//
// Exit codes:
//   0  success / no-op
//   1  user-resolvable error (e.g., CLI not authed)
//   2  config error (manifest invalid, gitignore violation)
//   3  hard refusal (tracked manifest, missing setup/)
//   4  remote API / CLI error
//   5  user aborted (declined plan, ^C)

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MANIFEST_PATH = 'setup/bootstrap.local.json'
const EXAMPLE_PATH = 'setup/bootstrap.example.json'
const RUNBOOK_INDEX = 'setup/00_files.md'
const ENV_PATH = '.env'
const AUDIT_PATH = 'plan/AUDIT.md'
const WORKFLOW_PATH = '.github/workflows/march.yml'
const SUPPORTED_SERVICES = ['github', 'vercel', 'supabase', 'cloud-loop']

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────
const log = {
  info: (s) => console.log(s),
  step: (s) => console.log(`\n→ ${s}`),
  cmd: (s) => console.log(`  $ ${s}`),
  ok: (s) => console.log(`  ✓ ${s}`),
  miss: (s) => console.log(`  ✗ ${s}`),
  warn: (s) => console.error(`  ! ${s}`),
  err: (s) => console.error(`  ✗ ${s}`),
  hr: () => console.log('─'.repeat(60)),
  hr2: () => console.log('═'.repeat(60)),
}

// ─────────────────────────────────────────────────────────────
// Shell helpers
// ─────────────────────────────────────────────────────────────
function sh(cmd, { quiet = false, env = {} } = {}) {
  if (!quiet) log.cmd(cmd)
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })
  return {
    stdout: r.stdout?.trim() ?? '',
    stderr: r.stderr?.trim() ?? '',
    code: r.status ?? 1,
  }
}

function shOk(cmd, opts) {
  const r = sh(cmd, opts)
  if (r.code !== 0) {
    log.err(`exit ${r.code}: ${r.stderr || r.stdout}`)
    throw new Error(`command failed: ${cmd}`)
  }
  return r
}

function which(cmd) {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`
  return sh(probe, { quiet: true }).code === 0
}

// ─────────────────────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────────────────────
function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {}
  const env = {}
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

function appendEnv(key, value, comment) {
  let body = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : ''
  if (new RegExp(`^${key}=`, 'm').test(body)) {
    log.warn(`${key} already in .env; not overwriting`)
    return false
  }
  if (body && !body.endsWith('\n')) body += '\n'
  if (comment) body += `\n# ${comment}\n`
  body += `${key}=${value}\n`
  fs.writeFileSync(ENV_PATH, body)
  log.ok(`wrote ${key} to .env`)
  return true
}

function ensureGitignored(file) {
  const gi = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf-8') : ''
  if (gi.split(/\r?\n/).some((line) => line.trim() === file)) return
  fs.appendFileSync('.gitignore', `\n${file}\n`)
  log.ok(`added ${file} to .gitignore`)
}

function appendNeedsUserCall(handoff) {
  if (!fs.existsSync(AUDIT_PATH)) return
  const stamp = new Date().toISOString().slice(0, 10)
  const row = `\n- [needs-user-call] ${stamp}: ${handoff.title}\n  ${handoff.steps.join('\n  ')}\n  Verify: \`${handoff.verify}\`\n`
  fs.appendFileSync(AUDIT_PATH, row)
  log.ok(`logged [needs-user-call] in ${AUDIT_PATH}`)
}

// ─────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────
function stripHelpKeys(obj) {
  if (Array.isArray(obj)) return obj.map(stripHelpKeys)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => [k, stripHelpKeys(v)]),
    )
  }
  return obj
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null
  const tracked = sh(`git ls-files ${MANIFEST_PATH}`, { quiet: true })
  if (tracked.stdout) {
    log.err(`Refusing to run. ${MANIFEST_PATH} is tracked in git.`)
    log.info(`  Fix: git rm --cached ${MANIFEST_PATH} && echo "${MANIFEST_PATH}" >> .gitignore`)
    process.exit(3)
  }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  } catch (e) {
    log.err(`manifest is not valid JSON: ${e.message}`)
    process.exit(2)
  }
  return stripHelpKeys(parsed)
}

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────
let rl
function rlInit() {
  rl ??= readline.createInterface({ input, output })
}
async function ask(q, defaultVal) {
  rlInit()
  const prompt = defaultVal !== undefined ? `${q} [${defaultVal}]: ` : `${q}: `
  const raw = await rl.question(prompt)
  return raw.trim() || (defaultVal ?? '')
}
async function askConfirm(q, defaultYes = true) {
  rlInit()
  const suffix = defaultYes ? 'Y/n' : 'y/N'
  const raw = (await rl.question(`${q} [${suffix}]: `)).trim().toLowerCase()
  if (!raw) return defaultYes
  return raw[0] === 'y'
}
async function askSecret(q) {
  rlInit()
  return (await rl.question(`${q}: `)).trim()
}
function rlClose() {
  if (rl) {
    rl.close()
    rl = undefined
  }
}

// ─────────────────────────────────────────────────────────────
// Handoff pattern
// ─────────────────────────────────────────────────────────────
async function handoff({ title, why, steps, verify, manifest }) {
  log.hr()
  log.info(`─── HANDOFF ─────────────────────────────────────────────`)
  log.info(`What it needs:  ${title}`)
  log.info(`Why:            ${why}`)
  log.info(`Do this:`)
  steps.forEach((s, i) => log.info(`                ${i + 1}. ${s}`))
  log.info(`Verify with:    ${verify}`)
  log.info(`─────────────────────────────────────────────────────────`)
  let attempts = 0
  while (attempts < 3) {
    const ready = await ask("Press Enter when done (or type 'skip' to defer)")
    if (ready.toLowerCase() === 'skip') {
      appendNeedsUserCall({ title, steps, verify })
      log.warn(`handoff deferred; logged to ${AUDIT_PATH}`)
      return false
    }
    const r = sh(verify, { quiet: true })
    if (r.code === 0) {
      log.ok(`verified: ${title}`)
      return true
    }
    attempts++
    log.warn(`verify failed (attempt ${attempts}/3): ${r.stderr || r.stdout || 'no output'}`)
  }
  log.warn('3 verify attempts failed; deferring handoff')
  appendNeedsUserCall({ title, steps, verify })
  return false
}

// ─────────────────────────────────────────────────────────────
// Discovery — read-only state probe per provider
// ─────────────────────────────────────────────────────────────
function discoverGit() {
  const isRepo = sh('git rev-parse --is-inside-work-tree', { quiet: true }).code === 0
  if (!isRepo) return { isRepo: false }
  const remoteUrl = sh('git config --get remote.origin.url', { quiet: true }).stdout
  const branch = sh('git symbolic-ref --short HEAD', { quiet: true }).stdout || 'main'
  let owner, repo
  if (remoteUrl) {
    const m = remoteUrl.match(/[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
    if (m) {
      owner = m[1]
      repo = m[2]
    }
  }
  return { isRepo: true, remoteUrl, branch, owner, repo }
}

function discoverGithub(git) {
  const out = { cliInstalled: which('gh'), authed: false }
  if (!out.cliInstalled) return out
  out.authed = sh('gh auth status', { quiet: true }).code === 0
  if (!out.authed || !git.owner) return out
  const repoView = sh(`gh repo view ${git.owner}/${git.repo} --json name,visibility,description,homepageUrl`, { quiet: true })
  if (repoView.code === 0) {
    try {
      const v = JSON.parse(repoView.stdout)
      out.repoExists = true
      out.visibility = v.visibility?.toLowerCase()
      out.description = v.description
      out.homepageUrl = v.homepageUrl
    } catch {}
  } else {
    out.repoExists = false
  }
  if (out.repoExists) {
    out.secrets = sh(`gh secret list -R ${git.owner}/${git.repo}`, { quiet: true })
      .stdout.split('\n').map((l) => l.split(/\s+/)[0]).filter(Boolean)
    out.variables = sh(`gh variable list -R ${git.owner}/${git.repo}`, { quiet: true })
      .stdout.split('\n').map((l) => l.split(/\s+/)[0]).filter(Boolean)
    const inst = sh(`gh api /repos/${git.owner}/${git.repo}/installation -H "Accept: application/vnd.github+json" 2>&1`, { quiet: true })
    out.claudeAppInstalled = inst.code === 0 && /\"app_slug\"\s*:\s*\"claude\"/.test(inst.stdout)
  }
  return out
}

function discoverVercel(git) {
  const out = { cliInstalled: which('vercel'), authed: false }
  if (!out.cliInstalled) return out
  const who = sh('vercel whoami', { quiet: true })
  out.authed = who.code === 0
  out.user = who.stdout
  if (!out.authed) return out
  const linked = fs.existsSync('.vercel/project.json')
  if (linked) {
    out.linked = true
    try {
      const cfg = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf-8'))
      out.projectId = cfg.projectId
      out.orgId = cfg.orgId
    } catch {}
  }
  return out
}

function discoverSupabase() {
  const out = { cliInstalled: which('supabase'), authed: false }
  if (!out.cliInstalled) return out
  const list = sh('supabase projects list --output json', { quiet: true })
  out.authed = list.code === 0
  if (!out.authed) return out
  try {
    out.projects = JSON.parse(list.stdout)
  } catch {
    out.projects = []
  }
  out.linked = fs.existsSync('supabase/config.toml')
  return out
}

function discoverCloudLoop(env, githubState) {
  return {
    workflowPresent: fs.existsSync(WORKFLOW_PATH),
    claudeOauthSet: (githubState.secrets ?? []).includes('CLAUDE_CODE_OAUTH_TOKEN'),
    actionsPatSet: (githubState.secrets ?? []).includes('ACTIONS_PAT'),
  }
}

function discoverAll() {
  const env = readEnv()
  const git = discoverGit()
  const github = discoverGithub(git)
  const vercel = discoverVercel(git)
  const supabase = discoverSupabase()
  const cloudLoop = discoverCloudLoop(env, github)
  return { env, git, github, vercel, supabase, cloudLoop }
}

// ─────────────────────────────────────────────────────────────
// State report
// ─────────────────────────────────────────────────────────────
function tick(b) { return b ? '✓' : '✗' }

function printStateReport(s, manifest) {
  log.hr2()
  log.info(`Bootstrap state report — ${manifest?.project?.name ?? '<project>'}`)
  log.hr2()
  log.info(`Repository:`)
  log.info(`  git repo:            ${tick(s.git.isRepo)} ${s.git.isRepo ? '' : '(needs git init)'}`)
  log.info(`  default branch:      ${s.git.branch ?? '—'}`)
  log.info(`  GitHub remote:       ${tick(!!s.git.remoteUrl)} ${s.git.remoteUrl ?? '(no remote)'}`)
  log.info(`  Claude Code App:     ${tick(s.github.claudeAppInstalled)} ${s.github.claudeAppInstalled ? '' : '(install at github.com/apps/claude)'}`)
  log.info(``)
  log.info(`GitHub:`)
  log.info(`  CLI installed:       ${tick(s.github.cliInstalled)}`)
  log.info(`  CLI authed:          ${tick(s.github.authed)}`)
  log.info(`  repo exists:         ${tick(s.github.repoExists)}`)
  if (s.github.repoExists) {
    log.info(`  visibility:          ${s.github.visibility}`)
    log.info(`  Actions secrets:     ${s.github.secrets?.length ?? 0} (${s.github.secrets?.slice(0, 4).join(', ') ?? ''}${s.github.secrets?.length > 4 ? ', …' : ''})`)
    log.info(`  Actions variables:   ${s.github.variables?.length ?? 0}`)
  }
  log.info(``)
  log.info(`Vercel:`)
  log.info(`  CLI installed:       ${tick(s.vercel.cliInstalled)}`)
  log.info(`  CLI authed:          ${tick(s.vercel.authed)} ${s.vercel.user ?? ''}`)
  log.info(`  project linked:      ${tick(s.vercel.linked)} ${s.vercel.projectId ?? ''}`)
  log.info(``)
  log.info(`Supabase:`)
  log.info(`  CLI installed:       ${tick(s.supabase.cliInstalled)}`)
  log.info(`  CLI authed:          ${tick(s.supabase.authed)}`)
  log.info(`  projects visible:    ${s.supabase.projects?.length ?? 0}`)
  log.info(`  linked locally:      ${tick(s.supabase.linked)}`)
  log.info(``)
  log.info(`Cloud loop:`)
  log.info(`  workflow file:       ${tick(s.cloudLoop.workflowPresent)}`)
  log.info(`  CLAUDE_CODE_OAUTH:   ${tick(s.cloudLoop.claudeOauthSet)}`)
  log.info(`  ACTIONS_PAT:         ${tick(s.cloudLoop.actionsPatSet)}`)
  log.hr2()
}

// ─────────────────────────────────────────────────────────────
// Plan composition
// ─────────────────────────────────────────────────────────────
function composePlan(state, manifest, scope) {
  const actions = []
  const want = scope === 'all' ? SUPPORTED_SERVICES : [scope]

  if (want.includes('github')) {
    if (!state.github.cliInstalled) {
      actions.push({ provider: 'github', verb: 'install-cli', blocking: true, desc: 'install gh CLI' })
    } else if (!state.github.authed) {
      actions.push({ provider: 'github', verb: 'login', blocking: true, desc: 'gh auth login --web' })
    } else if (!state.github.repoExists) {
      actions.push({ provider: 'github', verb: 'create-repo', desc: `create ${manifest.project.github_owner}/${manifest.project.github_repo} (${manifest.project.visibility})` })
    }
    if (state.github.repoExists && !state.git.remoteUrl) {
      actions.push({ provider: 'github', verb: 'link-remote', desc: `link existing repo as origin` })
    }
    if (state.github.repoExists && !state.github.claudeAppInstalled) {
      actions.push({ provider: 'github', verb: 'install-claude-app', handoff: true, desc: 'install Claude Code GitHub App on repo' })
    }
  }

  if (want.includes('vercel')) {
    if (!state.vercel.cliInstalled) {
      actions.push({ provider: 'vercel', verb: 'install-cli', blocking: true, desc: 'install vercel CLI (`npm i -g vercel`)' })
    } else if (!state.vercel.authed) {
      actions.push({ provider: 'vercel', verb: 'login', blocking: true, desc: 'vercel login' })
    } else if (!state.vercel.linked) {
      actions.push({ provider: 'vercel', verb: 'link-project', desc: `link Vercel project ${manifest.project.name}` })
    }
  }

  if (want.includes('supabase')) {
    if (!state.supabase.cliInstalled) {
      actions.push({ provider: 'supabase', verb: 'install-cli', blocking: true, desc: 'install supabase CLI' })
    } else if (!state.supabase.authed) {
      actions.push({ provider: 'supabase', verb: 'login', blocking: true, desc: 'supabase login' })
    } else if (!state.supabase.linked) {
      actions.push({ provider: 'supabase', verb: 'create-or-link', desc: `create or link Supabase project ${manifest.project.name}` })
    }
  }

  if (want.includes('cloud-loop') && manifest.cloud_loop?.enabled) {
    if (!state.cloudLoop.workflowPresent) {
      actions.push({ provider: 'cloud-loop', verb: 'install-workflow', desc: 'install .github/workflows/march.yml' })
    }
    if (!state.cloudLoop.claudeOauthSet) {
      actions.push({ provider: 'cloud-loop', verb: 'set-claude-oauth', handoff: true, desc: 'set CLAUDE_CODE_OAUTH_TOKEN secret' })
    }
    if (manifest.cloud_loop.identity === 'user' && !state.cloudLoop.actionsPatSet) {
      actions.push({ provider: 'cloud-loop', verb: 'set-actions-pat', handoff: true, desc: 'set ACTIONS_PAT secret (fine-grained PAT)' })
    }
  }

  return actions
}

function printPlan(actions) {
  log.info(`\nPlan: ${actions.length} action${actions.length === 1 ? '' : 's'}`)
  log.hr()
  if (!actions.length) {
    log.ok('nothing to do — every gap is closed')
    return
  }
  actions.forEach((a, i) => {
    const tag = a.handoff ? '[handoff]' : a.blocking ? '[block]  ' : '[auto]   '
    log.info(`  ${i + 1}. ${tag} ${a.provider.padEnd(12)} ${a.desc}`)
  })
  log.hr()
}

// ─────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────
async function execAction(a, state, manifest) {
  log.step(`[${a.provider}] ${a.desc}`)

  if (a.blocking) {
    if (a.verb === 'install-cli') {
      log.warn('CLI is not installed.')
      log.info(`  GitHub:   https://cli.github.com/`)
      log.info(`  Vercel:   npm i -g vercel`)
      log.info(`  Supabase: https://supabase.com/docs/guides/cli`)
      log.warn('install it, then re-run /bootstrap')
      process.exit(1)
    }
    if (a.verb === 'login') {
      const cmd = a.provider === 'github' ? 'gh auth login --web' : `${a.provider} login`
      log.info(`  Run in another terminal: ${cmd}`)
      const ok = await askConfirm(`logged in?`)
      if (!ok) {
        log.warn('aborting; re-run when authed')
        process.exit(1)
      }
      return
    }
  }

  if (a.provider === 'github') return execGithub(a, state, manifest)
  if (a.provider === 'vercel') return execVercel(a, state, manifest)
  if (a.provider === 'supabase') return execSupabase(a, state, manifest)
  if (a.provider === 'cloud-loop') return execCloudLoop(a, state, manifest)
}

async function execGithub(a, state, manifest) {
  const slug = `${manifest.project.github_owner}/${manifest.project.github_repo}`
  if (a.verb === 'create-repo') {
    const vis = manifest.project.visibility === 'public' ? '--public' : '--private'
    const desc = manifest.project.description ? `--description ${JSON.stringify(manifest.project.description)}` : ''
    shOk(`gh repo create ${slug} ${vis} ${desc}`.trim().replace(/\s+/g, ' '))
    if (!state.git.remoteUrl) {
      shOk(`git remote add origin https://github.com/${slug}.git`)
    }
    if (manifest.project.topics?.length) {
      const topics = manifest.project.topics.join(',')
      shOk(`gh repo edit ${slug} --add-topic ${topics}`)
    }
    if (manifest.project.tagline && manifest.project.tagline !== manifest.project.description) {
      // tagline overrides description if both are set
      shOk(`gh repo edit ${slug} --description ${JSON.stringify(manifest.project.tagline)}`)
    }
    log.ok(`created ${slug}`)
    return
  }
  if (a.verb === 'link-remote') {
    shOk(`git remote add origin https://github.com/${slug}.git`)
    return
  }
  if (a.verb === 'install-claude-app') {
    await handoff({
      title: 'Install Claude Code GitHub App on the repo',
      why: 'the cloud-loop workflow authenticates as you against this repo via the App',
      steps: [
        'open https://github.com/apps/claude',
        'click Install',
        `select "Only select repositories" → ${slug}`,
        'click Install',
      ],
      verify: `gh api /repos/${slug}/installation -H "Accept: application/vnd.github+json" 2>&1 | findstr /C:"app_slug"`,
    })
    return
  }
}

async function execVercel(a, state, manifest) {
  if (a.verb === 'link-project') {
    const team = manifest.providers?.vercel?.team
    const args = ['link', '--yes', '--project', manifest.project.name]
    if (team) args.push('--scope', team)
    shOk(`vercel ${args.join(' ')}`)
    // After link, read .vercel/project.json for projectId
    if (fs.existsSync('.vercel/project.json')) {
      const cfg = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf-8'))
      appendEnv('VERCEL_PROJECT_ID', cfg.projectId, 'from .vercel/project.json (vercel link)')
      if (cfg.orgId) appendEnv('VERCEL_TEAM_ID', cfg.orgId, 'from .vercel/project.json')
    }
    // Region pin
    const region = manifest.providers?.vercel?.region
    if (region) {
      const projectId = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf-8')).projectId
      // Vercel CLI doesn't have a region-set command yet; use the API
      log.info(`  region preference: ${region} — set in Vercel dashboard Settings → Functions if not default`)
    }
    return
  }
}

async function execSupabase(a, state, manifest) {
  if (a.verb === 'create-or-link') {
    const name = manifest.project.name
    const existing = (state.supabase.projects ?? []).find((p) => p.name === name)
    if (existing) {
      log.ok(`Supabase project ${name} exists; linking`)
      shOk(`supabase link --project-ref ${existing.id}`)
      return
    }
    // Need org + db password
    let org = manifest.providers?.supabase?.org
    if (!org) {
      const orgs = sh('supabase orgs list --output json', { quiet: true })
      if (orgs.code === 0) {
        try {
          const list = JSON.parse(orgs.stdout)
          if (list.length === 1) org = list[0].id
        } catch {}
      }
    }
    if (!org) {
      org = await ask('Supabase org id (run `supabase orgs list`)')
    }
    let dbPassword = manifest.providers?.supabase?.db_password
    if (!dbPassword) {
      dbPassword = generatePassword(32)
      log.warn(`generated DB password (32 chars random) — stored in .env as SUPABASE_DB_PASSWORD`)
    }
    const region = manifest.providers?.supabase?.region ?? 'us-west-1'
    shOk(`supabase projects create ${name} --org-id ${org} --db-password ${JSON.stringify(dbPassword)} --region ${region}`)
    appendEnv('SUPABASE_DB_PASSWORD', dbPassword, 'generated by bootstrap; rotate via supabase dashboard')
    // Re-list to find new project id
    const listed = JSON.parse(sh('supabase projects list --output json', { quiet: true }).stdout)
    const created = listed.find((p) => p.name === name)
    if (created) {
      shOk(`supabase link --project-ref ${created.id}`)
      appendEnv('SUPABASE_PROJECT_ID', created.id)
      appendEnv('SUPABASE_REGION', region)
      // URL + keys: derive from the project ref
      appendEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${created.id}.supabase.co`)
    }
    log.warn('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + SUPABASE_SERVICE_ROLE_KEY are not in the CLI output')
    log.warn('grab them from Project Settings → API and add to .env manually')
    appendNeedsUserCall({
      title: 'Add Supabase API keys to .env',
      steps: [
        `open https://supabase.com/dashboard/project/${created?.id ?? '<id>'}/settings/api`,
        'copy the publishable / anon key → NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'copy the service_role key → SUPABASE_SERVICE_ROLE_KEY',
        'add both to .env',
      ],
      verify: 'cat .env | grep -E "SUPABASE_(SERVICE_ROLE|PUBLISHABLE)_KEY="',
    })
    return
  }
}

async function execCloudLoop(a, state, manifest) {
  const slug = `${manifest.project.github_owner}/${manifest.project.github_repo}`
  if (a.verb === 'install-workflow') {
    if (!fs.existsSync('.github/workflows')) fs.mkdirSync('.github/workflows', { recursive: true })
    // Copy from nexus/templates/.github/workflows/march.yml — try several paths
    const candidates = [
      '../nexus/templates/.github/workflows/march.yml',
      './.nexus/templates/.github/workflows/march.yml',
    ]
    const src = candidates.find((p) => fs.existsSync(p))
    if (!src) {
      log.err('cannot find nexus march.yml template; clone nexus at ../nexus or submodule at .nexus')
      throw new Error('nexus template not found')
    }
    let yml = fs.readFileSync(src, 'utf-8')
    yml = yml
      .replaceAll('<PROJECT>', manifest.project.name)
      .replaceAll('<DEFAULT_BRANCH>', manifest.project.default_branch ?? 'main')
      .replaceAll('<PROJECT_PKG_PREFIX>', `@${manifest.project.name}`)
    fs.writeFileSync(WORKFLOW_PATH, yml)
    log.ok(`wrote ${WORKFLOW_PATH}`)
    return
  }
  if (a.verb === 'set-claude-oauth') {
    log.info('Run `claude setup-token` in another terminal and paste the output here.')
    log.info('  The token starts with `sk-ant-oat-…`.')
    const token = await askSecret('CLAUDE_CODE_OAUTH_TOKEN')
    if (!token.startsWith('sk-ant-oat-')) {
      log.warn(`expected token starting with sk-ant-oat- ; got prefix ${token.slice(0, 12)}`)
      const ok = await askConfirm('proceed anyway?', false)
      if (!ok) return
    }
    shOk(`gh secret set CLAUDE_CODE_OAUTH_TOKEN -R ${slug} -b ${JSON.stringify(token)}`)
    return
  }
  if (a.verb === 'set-actions-pat') {
    log.info('Need a fine-grained PAT scoped to this repo.')
    log.info(`  Open: https://github.com/settings/personal-access-tokens/new`)
    log.info(`  Resource owner: ${manifest.project.github_owner}`)
    log.info(`  Repository:     ${manifest.project.github_repo}`)
    log.info(`  Permissions:    Contents R/W, Issues R/W, Actions R/W, Workflows R/W, Pull requests R/W, Variables R/W, Secrets R/W, Administration R/W`)
    log.info(`  Expiration:     90 days recommended`)
    const token = await askSecret('ACTIONS_PAT (paste here)')
    if (!token.startsWith('github_pat_')) {
      log.warn(`expected token starting with github_pat_ ; got prefix ${token.slice(0, 12)}`)
      const ok = await askConfirm('proceed anyway?', false)
      if (!ok) return
    }
    shOk(`gh secret set ACTIONS_PAT -R ${slug} -b ${JSON.stringify(token)}`)
    return
  }
}

// ─────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────
function generatePassword(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  const buf = new Uint8Array(n)
  globalThis.crypto.getRandomValues(buf)
  for (let i = 0; i < n; i++) s += chars[buf[i] % chars.length]
  return s
}

function ensureRepoRoot() {
  if (!fs.existsSync('package.json') && !fs.existsSync('.git')) {
    log.err('not at a repo root (no package.json or .git found). cd to your repo and re-run.')
    process.exit(2)
  }
}

function ensureSetupDir() {
  if (!fs.existsSync(RUNBOOK_INDEX)) {
    log.warn(`no ${RUNBOOK_INDEX} found — running without runbook integration`)
  }
}

function preFlightExampleManifest() {
  if (!fs.existsSync(MANIFEST_PATH) && !fs.existsSync(EXAMPLE_PATH)) {
    log.err(`no ${MANIFEST_PATH} and no ${EXAMPLE_PATH} found`)
    log.info(`  copy ../nexus/templates/setup/bootstrap.example.json to ${EXAMPLE_PATH}`)
    process.exit(2)
  }
  ensureGitignored(MANIFEST_PATH)
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0] ?? ''

  ensureRepoRoot()
  ensureSetupDir()
  preFlightExampleManifest()

  const manifest = loadManifest()

  if (cmd === 'status') {
    const state = discoverAll()
    printStateReport(state, manifest)
    if (manifest) {
      const actions = composePlan(state, manifest, 'all')
      printPlan(actions)
    } else {
      log.warn(`no ${MANIFEST_PATH}; cannot compute plan. copy from ${EXAMPLE_PATH}.`)
    }
    rlClose()
    return
  }

  if (!manifest) {
    log.err(`${MANIFEST_PATH} not found.`)
    log.info(`  copy ${EXAMPLE_PATH} → ${MANIFEST_PATH} and fill in values, then re-run.`)
    process.exit(2)
  }

  let scope = 'all'
  if (SUPPORTED_SERVICES.includes(cmd)) scope = cmd
  else if (cmd === 'cloud-loop') scope = 'cloud-loop'
  else if (cmd && cmd !== 'continue' && cmd !== '--manifest' && cmd !== '') {
    log.err(`unknown invocation: ${cmd}`)
    log.info(`  supported: status | <service> | cloud-loop | continue | --manifest`)
    process.exit(2)
  }

  const state = discoverAll()
  printStateReport(state, manifest)
  const actions = composePlan(state, manifest, scope)
  printPlan(actions)
  if (!actions.length) {
    rlClose()
    return
  }

  const proceed = cmd === '--manifest' ? true : await askConfirm('Proceed with this plan?', true)
  if (!proceed) {
    log.warn('aborted by user')
    rlClose()
    process.exit(5)
  }

  for (const a of actions) {
    try {
      await execAction(a, state, manifest)
    } catch (e) {
      log.err(e.message)
      log.info(`  re-run \`/bootstrap continue\` when the issue is fixed`)
      rlClose()
      process.exit(4)
    }
  }

  log.hr2()
  log.ok(`bootstrap complete for scope: ${scope}`)
  log.info(`  next: re-run \`/bootstrap status\` to confirm everything is wired`)
  log.info(`  then: \`/ship-a-phase\` to start the build`)
  rlClose()
}

main().catch((e) => {
  log.err(`unexpected: ${e.message}`)
  log.err(e.stack)
  process.exit(1)
})
