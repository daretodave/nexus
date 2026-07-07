# Playbook: CI/CD providers

> The deploy gate is the only piece of the methodology that
> varies a lot per project. This is the matrix: how to wire
> `pnpm deploy:check` for each major provider, what auth tokens
> you need, and what to do when there's no provider yet.

---

## What the deploy gate does

After every push to the deploy branch (usually `main`):

1. Capture the current commit SHA.
2. Poll the provider's API for the deploy matching that SHA.
3. Wait for the deploy to reach a terminal state (`ready` or
   `error`).
4. Exit code communicates the result:
   - `0` — ready (site/app is green at the just-pushed commit)
   - `1` — error/failed (read the log; patch; push again)
   - `2` — timeout (deploy is slow but not failed; loop will
     re-check next tick)
   - `3` — config/auth (token missing, site not found)

The shipping skills treat exit `1` identically to a red verify
gate: read log, patch root cause, push. Up to 3 same-root-cause
iterations; then stop per the skill's failure modes.

---

## Provider matrix

| Provider | Auth | API endpoint pattern | Status field | Notes |
|---|---|---|---|---|
| **Netlify** | PAT (`NETLIFY_AUTH_TOKEN`) | `/sites/{id}/deploys` | `state` | Best supported in nexus templates. Site by name or ID. |
| **Vercel** | API token (`VERCEL_TOKEN`) | `/v6/deployments` | `readyState` | Filter by `gitSource.sha`. |
| **Cloudflare Pages** | API token (`CF_API_TOKEN`) + account ID | `/accounts/{aid}/pages/projects/{name}/deployments` | `latest_stage.status` | Slightly slower poll. |
| **Render** | API key (`RENDER_API_KEY`) | `/v1/services/{id}/deploys` | `status` | Service ID required. |
| **Fly.io** | flyctl auth (`FLY_API_TOKEN`) | flyctl CLI: `fly status --json` | `Status` | CLI-based; not a REST API. |
| **GitHub Pages** | `GH_TOKEN` (any PAT) | `/repos/{owner}/{repo}/pages/builds` | `status` | Limited info; `built` is the success state. |
| **GitHub Actions** (any deploy via Actions) | `GH_TOKEN` | `/repos/{owner}/{repo}/actions/runs` | `conclusion` | Filter by `head_sha`. Works for any provider whose deploy is triggered by a workflow. |
| **AWS Amplify** | AWS access key + secret | Amplify API | `status` | More complex auth; usually wrapped in CLI. |
| **Azure Static Web Apps** | bearer token | `/staticSites/{name}/builds` | `status` | Enterprise-y. |
| **Self-hosted (rsync, Docker, k8s)** | varies | varies | varies | Write a custom check; see "Self-hosted" below. |
| **No provider yet** | n/a | n/a | n/a | Skip the gate; treat as a TODO. See "No deploy yet". |

---

## Wiring per provider

The template script `nexus/templates/scripts/deploy-check.mjs`
handles **Netlify, Vercel, GitHub Actions, Cloudflare Pages,
Render, and Fly.io** out of the box. Set `DEPLOY_PROVIDER` to
the matching name; no code edits needed.

For other providers, follow the patterns below.

### Netlify

```bash
# .env
NETLIFY_AUTH_TOKEN=nfp_...
NETLIFY_SITE_NAME=your-site-name        # optional; defaults inferred from netlify.toml
```

```javascript
// In deploy-check.mjs (Netlify block)
const sitesRes = await fetch(
  `https://api.netlify.com/api/v1/sites?name=${SITE_NAME}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
)
// ... see template for full implementation
```

States to terminal-match: `ready` (success), `error` / `failed`
(failure), `building` / `enqueued` (in progress, keep polling).

Get a token: https://app.netlify.com/user/applications#personal-access-tokens

### Vercel

```bash
# .env
VERCEL_TOKEN=...
VERCEL_PROJECT_ID=prj_...
VERCEL_TEAM_ID=team_...                 # if a team-owned project
```

```javascript
// Vercel filter by SHA
const url = `https://api.vercel.com/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=20`
const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
const deploys = (await res.json()).deployments
const match = deploys.find(d => d.meta?.githubCommitSha === sha)
// match.readyState: READY | ERROR | BUILDING | QUEUED | INITIALIZING | CANCELED
```

Get a token: https://vercel.com/account/tokens

### Cloudflare Pages

```bash
# .env
CF_API_TOKEN=...
CF_ACCOUNT_ID=...
CF_PAGES_PROJECT=your-project-name
```

```javascript
// In deploy-check.mjs (cloudflare-pages block)
const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}/deployments`
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
const data = await res.json()
const match = data.result.find(d => d.deployment_trigger?.metadata?.commit_hash === sha)
// match.latest_stage.status: success | failure | active | idle
// ... see template for full implementation
```

Set `DEPLOY_PROVIDER=cloudflare-pages`. Token needs Pages:Edit.
Get one: https://dash.cloudflare.com/profile/api-tokens

### Render

```bash
# .env
RENDER_API_KEY=...
RENDER_SERVICE_ID=srv-...
```

```javascript
// In deploy-check.mjs (render block)
const url = `https://api.render.com/v1/services/${SERVICE}/deploys?limit=20`
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${API_KEY}` },
})
const deploys = (await res.json()).map(d => d.deploy)
const match = deploys.find(d => d.commit?.id === sha)
// match.status: live | build_failed | update_failed | deactivated | created | building | updating
// ... see template for full implementation
```

Set `DEPLOY_PROVIDER=render`. Get a key:
https://dashboard.render.com/u/settings (API Keys section).

### Fly.io

Fly's API is not as friendly to direct polling as Netlify's or
Vercel's — there's no per-commit deploy record, so the
template's `fly` block shells out to flyctl and polls
allocation health instead of matching a SHA:

```bash
# .env
FLY_API_TOKEN=fo_...
FLY_APP_NAME=your-app-name
```

```javascript
// In deploy-check.mjs (fly block)
import { execSync } from 'node:child_process'
const out = execSync(`fly status --app ${APP_NAME} --json`, {
  env: { ...process.env, FLY_API_TOKEN: TOKEN },
}).toString()
const status = JSON.parse(out)
// Ready when every allocation is Status: running, Healthy: true.
// Not a per-commit match — see "Honestly" below.
// ... see template for full implementation
```

Set `DEPLOY_PROVIDER=fly`.

Honestly: Fly's deploy gate is weaker than Netlify's or
Vercel's — it confirms the app is healthy, not that this exact
commit is what's running (a stuck release could show a stale
but healthy allocation). If your loop's hot path is Fly and you
need a true per-commit signal, wrap the deploy in GitHub Actions
and poll Actions instead (next section).

### GitHub Actions (any provider)

If your deploy is triggered by a GitHub Actions workflow (true
for many setups), poll the action run for HEAD's SHA:

```bash
# .env
GH_TOKEN=github_pat_...
GH_REPO=owner/repo
DEPLOY_WORKFLOW=deploy.yml              # filename in .github/workflows/
```

```javascript
const url = `https://api.github.com/repos/${REPO}/actions/runs?head_sha=${sha}`
const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
})
const runs = (await res.json()).workflow_runs
  .filter(r => r.path?.endsWith(`/${WORKFLOW}`))
// run.status: queued | in_progress | completed
// if completed, run.conclusion: success | failure | cancelled | timed_out
```

This pattern works for ANY provider whose deploy is wrapped in
GitHub Actions — Fly, AWS, Azure, anything. Trade-off: slightly
less detail in failure logs (you'd fetch the run log separately).

### GitHub Pages

Native GitHub Pages deploys (Jekyll or static):

```bash
# .env
GH_TOKEN=github_pat_...
GH_REPO=owner/repo
```

```javascript
const url = `https://api.github.com/repos/${REPO}/pages/builds`
const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
})
const builds = await res.json()
const match = builds.find(b => b.commit === sha)
// match.status: queued | building | built | errored
```

Note: GitHub Pages doesn't expose detailed build logs via API.
On failure, `match.error.message` is what you'll get; you'll
need to investigate via the web UI.

### Self-hosted

If you deploy via SSH + rsync, Docker push, k8s rollout, or
similar — there's no SaaS API to poll. You have two options:

**A. Wrap in GitHub Actions**, then poll Actions (above).
Simplest path — Actions is free for public repos and most
private use cases.

**B. Health-check the live URL.** Simplest:

```bash
# .env
HEALTH_CHECK_URL=https://yoursite.example.com/healthz
HEALTH_CHECK_EXPECT=200                 # or a sentinel string
DEPLOY_WAIT_BUFFER_S=120                # seconds to wait before health-checking
```

```javascript
// Wait, then probe
await sleep(BUFFER_S * 1000)
const res = await fetch(HEALTH_CHECK_URL)
if (res.status !== 200) process.exit(1)
const text = await res.text()
if (EXPECT && !text.includes(EXPECT)) process.exit(1)
process.exit(0)
```

Trade-off: you lose deploy-failure detail (you only know "site
unhealthy"). Pair with logs from your deploy server for
investigation.

---

## No deploy yet

If your project doesn't deploy yet (early development, library
without published artifacts), the deploy gate doesn't apply.

Two paths:

**A. Skip the gate.** Add to `bearings.md`:

> The project does not yet deploy. `pnpm deploy:check` is a
> no-op until phase N (`<deploy-target>`) ships.

Define `pnpm deploy:check` as `echo "no deploy gate yet" && exit 0`.

The shipping skills will run it, get success, move on. Re-wire
when you ship a deploy target.

**B. Use a build-only gate.** If your project produces an
artifact (npm package, Docker image, binary), the "deploy" might
just be successful production build:

```javascript
// "deploy:check" — for an npm package
// "Deploy" = npm publish dry-run succeeded.
const out = execSync('npm publish --dry-run', { encoding: 'utf8' })
if (out.includes('error')) process.exit(1)
process.exit(0)
```

Trade-off: no real-world signal until you ship.

---

## Multiple environments

If you deploy to staging + production from `main` (or staging
on PR / production on tag), the deploy gate by default polls
the production deploy.

To poll staging:

```bash
NETLIFY_SITE_NAME=your-site-staging     # different site
# or
VERCEL_TARGET=preview                   # filter deployments by target
```

### Preview-branch deploy gate (PR-gated teams)

See [`existing-project.md`](./existing-project.md) §5 Option A:
teams whose CI requires PR review push loop work to
`loop/<phase-N>` instead of `main`. The gate still targets it
by commit SHA, no code change needed for that part — Netlify's
`/deploys` and Vercel's `/v6/deployments` both return deploys
across every branch, and `deploy-check.mjs` already matches on
`git rev-parse HEAD`'s SHA regardless of which branch that SHA
lives on. Set `VERCEL_TARGET=preview` (or leave
`NETLIFY_SITE_NAME` alone — Netlify branch deploys live on the
same site) so a stray production poll never masks a preview
failure.

What genuinely changes: the loop can't tell "PR merged" from
"PR still open" just by looking at `main`, so it can't safely
mark the phase `[x]` there yet. `ship-a-phase` marks the
build-plan row `[blocked: awaiting PR #<n> merge <date>]`
instead (existing status vocabulary — no new state); `/march`
already skips `[blocked: …]` rows, so it won't re-ship the same
phase next tick. A human merging the PR (or the next
`/oversight` pass, once it has) flips the row to
`[x] (commit <hash>)`.

---

## Auth & secret hygiene

All deploy-gate tokens go in `.env` (gitignored). Never commit.

`.env.example` documents the structure; commit that.

If running the loop on multiple machines (your laptop + a
server), each machine has its own `.env`. Tokens with the
narrowest possible scope:

- **Netlify:** PAT works repo-wide; no finer-grained option.
- **Vercel:** scoped to a team if possible.
- **Cloudflare:** scoped to Pages:Edit on the specific account.
- **GitHub:** fine-grained PAT scoped to the specific repo
  with `Actions:read` or `Pages:read`.

For unattended runs, treat the token like SSH keys — easy to
rotate, narrow scope.

---

## Observability beyond the gate

The deploy gate tells you "this commit deployed or not." It
doesn't tell you "is the site responding 200 to real users?"
That's a different signal — typically what `/critique` and
`/iterate` (with browser/scout sub-agents) catch.

If you want runtime monitoring as a gate condition, layer it
on top:

- A `pnpm health:check` script that probes a live endpoint.
- An `iterate` audit category that reads error tracking
  (Sentry, etc.) — if there's been a spike in errors, find a
  fix.
- A `triage` rule that watches for issues with specific labels
  (e.g. `prod-incident`) and routes them at top priority.

These are project-by-project; the methodology supports them but
doesn't prescribe.

---

## When the gate is wrong

The deploy gate occasionally reports red when the site is fine
(provider flake) or green when the site is broken (deploy
succeeded but the runtime is broken). When that happens:

- **Don't disable the gate.** Treat as a verify-gate failure
  initially.
- **If 3 same-root-cause iterations don't fix it**, the skill
  stops; you investigate.
- **If the gate is consistently wrong** (e.g., Netlify takes
  20+ minutes when timeout is set to 10), tune the timeout. Don't
  paper over it.
- **If runtime is broken but deploy is green**, the verify
  gate's e2e suite is incomplete. Add a real-traffic smoke check
  to e2e.

The gate is high-leverage when it's accurate. Tune it; don't
skip it.
