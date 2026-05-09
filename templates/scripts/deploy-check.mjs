#!/usr/bin/env node
// scripts/deploy-check.mjs
//
// "Checking last deployment" — the post-push gate.
//
// Polls your hosting provider for the deploy matching HEAD's
// commit SHA and exits when the deploy reaches a terminal state.
//
//   exit 0  →  deploy ready
//   exit 1  →  deploy errored or failed
//   exit 2  →  timeout
//   exit 3  →  config / auth failure
//
// Pick your provider below; uncomment the matching block.
// Configure auth in .env.
//
// See nexus/playbooks/ci-providers.md for full details.

import { execSync } from 'node:child_process'
import fs from 'node:fs'

// --- load .env if present (Node has no built-in .env loader) ---
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const PROVIDER = process.env.DEPLOY_PROVIDER ?? 'netlify'  // override per project
const TIMEOUT_MS = 10 * 60 * 1000   // 10 min default
const POLL_MS = 5 * 1000

const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
const subject = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Most providers create one deploy per push, keyed to the head commit.
// If you pushed multiple commits at once, the deploy resolves to the
// last of them — others ride along but aren't directly addressable.
// We log HEAD's subject so the message reflects what shipped.
console.log(`Checking deploy for HEAD ${sha.slice(0, 7)} ("${subject}") on ${PROVIDER}...`)

// =====================================================================
// PROVIDER: NETLIFY
// =====================================================================
if (PROVIDER === 'netlify') {
  const TOKEN = process.env.NETLIFY_AUTH_TOKEN
  const SITE_NAME = process.env.NETLIFY_SITE_NAME ?? '<PROJECT_LOWER>'
  if (!TOKEN) configFail('NETLIFY_AUTH_TOKEN', 'https://app.netlify.com/user/applications')

  const auth = { Authorization: `Bearer ${TOKEN}` }
  const sitesRes = await fetch(
    `https://api.netlify.com/api/v1/sites?name=${encodeURIComponent(SITE_NAME)}`,
    { headers: auth },
  )
  if (!sitesRes.ok) apiFail('Netlify sites', sitesRes)
  const sites = await sitesRes.json()
  const site = sites.find((s) => s.name === SITE_NAME) ?? sites[0]
  if (!site) {
    console.error(`No Netlify site for "${SITE_NAME}". Override with NETLIFY_SITE_NAME.`)
    process.exit(3)
  }

  await pollLoop(async () => {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${site.id}/deploys?per_page=10`,
      { headers: auth },
    )
    if (!res.ok) return null
    const deploys = await res.json()
    const match = deploys.find((d) => d.commit_ref === sha)
    if (!match) return { state: 'pending' }
    if (match.state === 'ready') {
      // Find the previous successful deploy so pollLoop can show the
      // commit range that landed in this deploy. Skipped silently if
      // unavailable (first deploy ever, shallow clone, etc).
      const previousReady = deploys.find(
        (d) => d.state === 'ready' && d.commit_ref && d.commit_ref !== sha,
      )
      return {
        state: 'ready',
        url: match.deploy_ssl_url ?? match.ssl_url,
        previousReadySha: previousReady?.commit_ref,
      }
    }
    if (match.state === 'error' || match.state === 'failed') {
      return {
        state: 'error',
        message: match.error_message,
        title: match.title,
        admin: match.admin_url,
        summary: match.summary?.messages ?? [],
      }
    }
    return { state: match.state, id: match.id.slice(0, 8) }
  })
}

// =====================================================================
// PROVIDER: VERCEL
// =====================================================================
else if (PROVIDER === 'vercel') {
  const TOKEN = process.env.VERCEL_TOKEN
  const PROJECT = process.env.VERCEL_PROJECT_ID
  const TEAM = process.env.VERCEL_TEAM_ID
  if (!TOKEN) configFail('VERCEL_TOKEN', 'https://vercel.com/account/tokens')
  if (!PROJECT) configFail('VERCEL_PROJECT_ID', 'project settings')

  const auth = { Authorization: `Bearer ${TOKEN}` }
  const teamParam = TEAM ? `&teamId=${TEAM}` : ''

  await pollLoop(async () => {
    const url = `https://api.vercel.com/v6/deployments?projectId=${PROJECT}${teamParam}&limit=20`
    const res = await fetch(url, { headers: auth })
    if (!res.ok) return null
    const data = await res.json()
    const match = data.deployments?.find((d) => d.meta?.githubCommitSha === sha)
    if (!match) return { state: 'pending' }
    if (match.readyState === 'READY') return { state: 'ready', url: `https://${match.url}` }
    if (match.readyState === 'ERROR' || match.readyState === 'CANCELED') {
      return {
        state: 'error',
        message: match.errorMessage,
        admin: `https://vercel.com/${match.ownerId}/${match.name}/${match.id}`,
      }
    }
    return { state: match.readyState.toLowerCase(), id: match.id.slice(0, 8) }
  })
}

// =====================================================================
// PROVIDER: GITHUB ACTIONS (any deploy via Actions)
// =====================================================================
else if (PROVIDER === 'github-actions') {
  const TOKEN = process.env.GH_TOKEN
  const REPO = process.env.GH_REPO ?? '<REPO_SLUG>'
  const WORKFLOW = process.env.DEPLOY_WORKFLOW ?? 'deploy.yml'
  if (!TOKEN) configFail('GH_TOKEN', 'https://github.com/settings/tokens')

  const auth = {
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: 'application/vnd.github+json',
  }

  await pollLoop(async () => {
    const url = `https://api.github.com/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=20`
    const res = await fetch(url, { headers: auth })
    if (!res.ok) return null
    const data = await res.json()
    const match = data.workflow_runs?.find((r) => r.path?.endsWith(`/${WORKFLOW}`))
    if (!match) return { state: 'pending' }
    if (match.status !== 'completed') return { state: match.status, id: String(match.id).slice(0, 8) }
    if (match.conclusion === 'success') return { state: 'ready', url: match.html_url }
    return {
      state: 'error',
      message: `workflow concluded ${match.conclusion}`,
      admin: match.html_url,
    }
  })
}

// =====================================================================
// PROVIDER: HEALTH CHECK (self-hosted, fallback)
// =====================================================================
else if (PROVIDER === 'health-check') {
  const URL = process.env.HEALTH_CHECK_URL
  const EXPECT = process.env.HEALTH_CHECK_EXPECT // string sentinel; optional
  const BUFFER_S = Number(process.env.DEPLOY_WAIT_BUFFER_S ?? 120)
  if (!URL) configFail('HEALTH_CHECK_URL', 'configure your live endpoint')

  console.log(`Waiting ${BUFFER_S}s for deploy to settle...`)
  await sleep(BUFFER_S * 1000)
  console.log(`Probing ${URL}...`)
  const res = await fetch(URL)
  if (res.status !== 200) {
    console.error(`Health check failed: HTTP ${res.status}`)
    process.exit(1)
  }
  if (EXPECT) {
    const text = await res.text()
    if (!text.includes(EXPECT)) {
      console.error(`Health check failed: expected sentinel "${EXPECT}" not found in response.`)
      process.exit(1)
    }
  }
  console.log(`Deploy ready (health check passed). URL: ${URL}`)
  process.exit(0)
}

// =====================================================================
// PROVIDER: NONE (project not yet deployable)
// =====================================================================
else if (PROVIDER === 'none') {
  console.log('No deploy gate configured (DEPLOY_PROVIDER=none). Skipping.')
  process.exit(0)
}

else {
  console.error(`Unknown DEPLOY_PROVIDER: "${PROVIDER}".`)
  console.error(`Supported: netlify | vercel | github-actions | health-check | none`)
  console.error(`See nexus/playbooks/ci-providers.md for full details.`)
  process.exit(3)
}

// =====================================================================
// HELPERS
// =====================================================================

async function pollLoop(probe) {
  const start = Date.now()
  let lastState = null
  let waitedForIngest = false
  while (Date.now() - start < TIMEOUT_MS) {
    const elapsed = Math.round((Date.now() - start) / 1000)
    const result = await probe()
    if (result === null) {
      console.error(`API error (retrying in ${POLL_MS / 1000}s)`)
      await sleep(POLL_MS)
      continue
    }
    if (result.state === 'pending') {
      if (!waitedForIngest) {
        console.log(`Provider hasn't ingested commit ${sha.slice(0, 7)} yet (waiting...)`)
        waitedForIngest = true
      }
      await sleep(POLL_MS)
      continue
    }
    if (result.state !== lastState) {
      const id = result.id ? ` ${result.id}` : ''
      console.log(`Deploy${id}: state=${result.state} (${elapsed}s elapsed)`)
      lastState = result.state
    }
    if (result.state === 'ready') {
      console.log(`Deploy ready.`)
      // Show the commit range this deploy contains, if the probe
      // surfaced a previous-ready SHA. Useful when a push bundled
      // multiple commits — the operator sees what actually landed
      // in production, not just HEAD.
      if (result.previousReadySha) {
        try {
          const range = execSync(
            `git log ${result.previousReadySha}..${sha} --oneline --no-merges`,
            { encoding: 'utf-8' },
          ).trim()
          if (range) {
            const lines = range.split('\n')
            console.log(`  Includes ${lines.length} commit${lines.length === 1 ? '' : 's'}:`)
            for (const line of lines) console.log(`    ${line}`)
          }
        } catch {
          // Previous-deploy SHA may not be in local history (shallow
          // clone, squash-merged, etc.) — skip range silently.
        }
      }
      if (result.url) console.log(`  URL: ${result.url}`)
      process.exit(0)
    }
    if (result.state === 'error') {
      console.error(`DEPLOY FAILED.`)
      if (result.title) console.error(`  Title: ${result.title}`)
      if (result.message) console.error(`  Error: ${result.message}`)
      if (result.summary?.length) {
        console.error(`  Summary:`)
        for (const msg of result.summary.slice(0, 5)) {
          console.error(`    - ${msg.title ?? msg}${msg.description ? `: ${msg.description}` : ''}`)
        }
      }
      if (result.admin) console.error(`  Admin URL: ${result.admin}`)
      console.error(``)
      console.error(`Read the log, patch the root cause, push again.`)
      console.error(`Do not push past this gate.`)
      process.exit(1)
    }
    await sleep(POLL_MS)
  }
  console.error(`Deploy still pending after ${TIMEOUT_MS / 1000}s.`)
  process.exit(2)
}

function configFail(varName, helpUrl) {
  console.error(`${varName} is not set.`)
  console.error(`  • Get a token at ${helpUrl}`)
  console.error(`  • Add to .env as: ${varName}=...`)
  console.error(`  • .env is gitignored; never commit it.`)
  process.exit(3)
}

function apiFail(label, res) {
  console.error(`${label} API error: ${res.status} ${res.statusText}`)
  if (res.status === 401) console.error('  Token rejected.')
  process.exit(3)
}
