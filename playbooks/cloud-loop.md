# Playbook: cloud loop (opt-in) — run /march on GitHub Actions

> Run the autonomous loop on a cron, in the cloud, without
> your laptop being open. Picks up where local `/loop /march`
> stops when you close the lid.
>
> **Opt-in.** Most projects are fine with local-only loops;
> this is for projects where unattended autonomy is the
> point.
>
> **Streamlined path:** if you've adopted the
> [`bootstrap-automation`](../customization/bootstrap-automation.md)
> customization, run `/bootstrap cloud-loop` instead of
> walking the steps below. The 10-step manual walkthrough
> below is the source-of-truth that the `cloud-loop` slice
> of `/bootstrap` implements — keep this doc as the
> reference even if you use the script.
>
> This doc wires the runtime. The *operational* rigging for a
> genuinely unattended window — permissions, guard hooks, the
> pager, secrets liveness, the dry run — is
> [`hands-off.md`](./hands-off.md); read it before your first
> walk-away window. Live reference: nexus itself runs this
> loop (see the repo's `.github/`).

## When you want this

- You want the loop to keep ticking nights, weekends, and
  while you're away from your laptop.
- Your project has steady backlog (chunks, audit findings,
  data backfills) that benefits from low-cadence
  unattended progress.
- Your hosting provider deploys on push automatically — the
  cloud loop's whole job is push + observe.

## When you don't

- Your project is ad-hoc / exploratory; you want to stay
  in the diff loop.
- Your verify gate isn't fully hermetic yet — cloud will
  expose every flake. Get hermeticity first
  (see [`customization/hermetic-e2e.md`](../customization/hermetic-e2e.md))
  then come back.
- Your project doesn't have a clear `/march` dispatch
  order yet (no triage queue, no audit, no backlog) — the
  cloud agent has nothing to ship and just exits 7 times a
  day.

If any of these are true, run local-only. The cloud opt-in
is here when you want it.

## What it costs

| Path | Marginal cost | Notes |
|---|---|---|
| Public repo + Claude Pro/Max OAuth | **$0** | Recommended. Quota shared with local sessions. |
| Public repo + ANTHROPIC_API_KEY (Sonnet) | ~$3–5/day | Pay-per-token. |
| Public repo + ANTHROPIC_API_KEY (Opus) | ~$15–20/day | Pay-per-token. |
| Private repo (any path) | + ~5–15 min/tick against your Actions cap | Free tier: 2,000 min/mo on Pro. |

The recommended setup for a personal project is OAuth-token
+ public repo + Sonnet 5 → genuinely $0 marginal (model ids
age — check `/model`).

## The shape of the kit

A few new files relative to the standard nexus overlay:

```
.github/
├── workflows/
│   ├── march.yml          # the cron workflow (owner job, or PR-mode jobs)
│   ├── nudge.yml          # the event tick: a collaborator's bug starts a tick (off until NEXUS_SUPPORT)
│   ├── pr-flow.yml        # PR mode: a closed PR's claims leave the claims branch
│   └── pr-resolve.yml     # PR mode: main merged into conflicted PRs
├── actions/setup/action.yml  # the project's toolchain, shared by every tick job
└── CLOUD_LOOP.md          # operator's guide (lives in repo)
scripts/
├── cloud/quota.mjs        # quota governor: read, cache, gate, dispatch ceiling, pause issue
├── cloud/lost.mjs         # lost-to-background mark, after the model
├── cloud/idle.mjs         # idle probe (skip the model when nothing changed) + no-op reason
├── cloud/chain.mjs        # a tick that shipped chains the next while work is ready
├── cloud/cadence.mjs      # the cadence presets: NEXUS_CADENCE into ceiling, chain, backoff
├── cloud/nudge-check.mjs  # nudge.yml's check: who starts a tick, the queue, the event budget
├── cloud/tick.mjs         # PR mode: pick + claim, fence, land, release
├── pr/resolve.mjs         # PR mode: pr-resolve's resolver
└── workflow-lint.mjs      # the workflow rules, for your gate
```

Plus the GitHub secrets, one repo variable (`NEXUS_LOOP_MODE`:
`owner` pushes main; unset opens pull requests), one
workflow_dispatch validation run, and (optionally) a
fine-grained PAT or, for PR mode, a GitHub App. A repo that
already has its own Actions and a local workflow: follow
[`cloud-loop-existing-actions.md`](./cloud-loop-existing-actions.md)
instead, step by step.

## Prerequisites

Before running this playbook, your repo should already have:

- Standard nexus overlay applied (agents.md, plan/, skills/,
  scripts/deploy-check.mjs).
- A green local `pnpm verify` and `pnpm deploy:check`.
- The Claude Code GitHub App installed
  (https://github.com/apps/claude).
- A Claude Pro or Max subscription (recommended) OR an
  Anthropic API key.

If any of those aren't true, do them first. Cloud-loop
adoption is the *last* step, not the first.

## Step 1 — copy the templates

From your repo root:

```bash
mkdir -p .github/workflows .github/actions/setup scripts/cloud scripts/pr
cp ../nexus/templates/.github/workflows/march.yml      .github/workflows/march.yml
cp ../nexus/templates/.github/actions/setup/action.yml .github/actions/setup/action.yml
cp ../nexus/templates/.github/CLOUD_LOOP.md            .github/CLOUD_LOOP.md
cp ../nexus/templates/scripts/workflow-lint.mjs        scripts/workflow-lint.mjs
cp ../nexus/templates/scripts/cloud/quota.mjs          scripts/cloud/quota.mjs
cp ../nexus/templates/scripts/cloud/lost.mjs           scripts/cloud/lost.mjs
cp ../nexus/templates/scripts/cloud/idle.mjs           scripts/cloud/idle.mjs
cp ../nexus/templates/scripts/cloud/chain.mjs          scripts/cloud/chain.mjs
cp ../nexus/templates/scripts/cloud/cadence.mjs        scripts/cloud/cadence.mjs
# the event tick (inert until NEXUS_SUPPORT is set):
cp ../nexus/templates/.github/workflows/nudge.yml      .github/workflows/nudge.yml
cp ../nexus/templates/scripts/cloud/nudge-check.mjs    scripts/cloud/nudge-check.mjs
# pull-request mode (NEXUS_LOOP_MODE unset) also needs these:
cp ../nexus/templates/.github/workflows/pr-flow.yml    .github/workflows/pr-flow.yml
cp ../nexus/templates/.github/workflows/pr-resolve.yml .github/workflows/pr-resolve.yml
cp ../nexus/templates/scripts/cloud/tick.mjs           scripts/cloud/tick.mjs
cp ../nexus/templates/scripts/pr/resolve.mjs           scripts/pr/resolve.mjs
```

The PowerShell twin, Windows native:

```powershell
New-Item -ItemType Directory -Force .github\workflows, .github\actions\setup, scripts\cloud, scripts\pr | Out-Null
Copy-Item ..\nexus\templates\.github\workflows\march.yml      .github\workflows\march.yml
Copy-Item ..\nexus\templates\.github\actions\setup\action.yml .github\actions\setup\action.yml
Copy-Item ..\nexus\templates\.github\CLOUD_LOOP.md            .github\CLOUD_LOOP.md
Copy-Item ..\nexus\templates\scripts\workflow-lint.mjs        scripts\workflow-lint.mjs
Copy-Item ..\nexus\templates\scripts\cloud\quota.mjs          scripts\cloud\quota.mjs
Copy-Item ..\nexus\templates\scripts\cloud\lost.mjs           scripts\cloud\lost.mjs
Copy-Item ..\nexus\templates\scripts\cloud\idle.mjs           scripts\cloud\idle.mjs
Copy-Item ..\nexus\templates\scripts\cloud\chain.mjs          scripts\cloud\chain.mjs
Copy-Item ..\nexus\templates\scripts\cloud\cadence.mjs        scripts\cloud\cadence.mjs
# the event tick (inert until NEXUS_SUPPORT is set):
Copy-Item ..\nexus\templates\.github\workflows\nudge.yml      .github\workflows\nudge.yml
Copy-Item ..\nexus\templates\scripts\cloud\nudge-check.mjs    scripts\cloud\nudge-check.mjs
# pull-request mode (NEXUS_LOOP_MODE unset) also needs these:
Copy-Item ..\nexus\templates\.github\workflows\pr-flow.yml    .github\workflows\pr-flow.yml
Copy-Item ..\nexus\templates\.github\workflows\pr-resolve.yml .github\workflows\pr-resolve.yml
Copy-Item ..\nexus\templates\scripts\cloud\tick.mjs           scripts\cloud\tick.mjs
Copy-Item ..\nexus\templates\scripts\pr\resolve.mjs           scripts\pr\resolve.mjs
```

Pull-request mode also runs `scripts/claims.mjs` and
`scripts/plan/order.mjs` (with what they import): adopt the
claims module first
([`../customization/claims.md`](../customization/claims.md)).
Then choose the mode: `gh variable set NEXUS_LOOP_MODE --body
owner` for owner mode, or leave it unset for pull requests (the
template `CLOUD_LOOP.md`, "Owner mode or pull requests").

## Step 2 — fill placeholders

In `.github/workflows/march.yml`, replace:

- `<PROJECT>` → your project name (matches `agents.md`)
- `<PROJECT_PKG_PREFIX>` (in `.github/actions/setup/action.yml`,
  with the rest of your toolchain) → your package scope (e.g.,
  `@acme`) or drop the Playwright steps entirely if you
  don't have an e2e workspace
- `<DEFAULT_BRANCH>` → typically `main`

In `.github/workflows/pr-resolve.yml` (pull-request mode):

- `<DEFAULT_BRANCH>` → the branch whose pushes it follows,
  typically `main`

In `.github/CLOUD_LOOP.md`:

- `<PROJECT>` → your project name
- `<DEFAULT_BRANCH>` → typically `main`
- `<REPO_SLUG>` → e.g., `daretodave/<PROJECT>`

## Step 3 — adjust the schedule

The pace is one of five presets
(`scripts/cloud/cadence.mjs` owns the table). The template
ships `steady`; GitHub cron always runs in UTC.

| Preset | Cron | Scheduled ticks a day | Ceiling | Chains up to |
|---|---|---|---|---|
| calm | `17 */6 * * *` | 4 | 8 | 0 |
| steady | `17 */3 * * *` | 8 | 12 | 0 |
| eager | `17 */3 * * *` | 8, plus chains | 20 | 3 |
| sprint | `17 */3 * * *` | 8, plus chains | 30 | 8 |
| off | none (dispatch and nudge only) | 0 | 12 | 0 |

Switch with `node scripts/cloud/cadence.mjs apply <preset>
--write` (it rewrites the cron, ceiling and heartbeat lines;
commit them), then `gh variable set NEXUS_CADENCE --body
<preset>` so the ceiling, chain depth and idle backoff follow
at run time. The GUI's Cloud step does both.

Every preset fires at minute :17. Keep a hand-written cron
off :00 too: GitHub delays and drops scheduled runs at the
top of the hour first, and the gate fails a shipped cron
there. Even off the hour GitHub may deliver fewer runs than
the cron promises; the heartbeat opens one issue when march
realizes under 40% of its slots over 72h.

Start on `steady` and measure a week before moving up. The
ceiling is weighted-budget points per 24h (a chunk-shipping
commit costs 3, a churn commit costs 1 — see
`.github/CLOUD_LOOP.md` "The daily ceiling"); cadence above
what the ceiling can spend just wastes invocations.

## Step 4 — choose identity (bot or you)

Default is `github-actions[bot]`. Zero secrets, every cloud
commit is visibly bot-authored. The cleanest path for most
projects.

If you want a **uniform git log** (every commit authored as
your real GitHub user), see "Identity choice — bot or you"
in `.github/CLOUD_LOOP.md`. It's a ~5-line edit and one
extra secret (`ACTIONS_PAT`).

For first-time adoption: stay on bot mode. You can switch
later without breaking anything.

## Step 5 — add the secrets

```
gh secret set CLAUDE_CODE_OAUTH_TOKEN  # claude setup-token output
gh secret set NETLIFY_AUTH_TOKEN       # or VERCEL_TOKEN, CLOUDFLARE_API_TOKEN, etc.
```

(Skip the second one if your `pnpm deploy:check` doesn't
need a hosting token — e.g., Cloudflare Pages with a
public deploy hook, or a project that just polls a
public health endpoint.)

If you chose user-author mode, also add `ACTIONS_PAT`. See
the CLOUD_LOOP.md doc for the PAT scopes required.

## Step 6 — agents.md carve-out for the trailer

Open your `agents.md` and find rule 2 ("No `Co-Authored-By:`
trailers. No emojis."). Add this paragraph at the end of
the rule:

> **One carve-out:** commits shipped from the cloud loop
> (`.github/workflows/march.yml`) MUST end with a single
> trailer: `Cloud-Run: <run-url>`. The cloud ceiling check
> uses this trailer to distinguish cloud-shipped commits
> from local work. Nothing else is allowed in the footer.
> See `.github/CLOUD_LOOP.md` for the full convention.

This is what makes the daily-ceiling check work and keeps
the rule honest.

## Step 7 — first commit

```bash
git add .github/ agents.md
git commit -m "ops: cloud half of /loop /march via GitHub Actions"
git push
```

## Step 8 — manual validation tick

```
gh workflow run march.yml
gh run watch
```

Watch the steps live. The first run you should see:

- ✓ Checkout, pnpm install, Playwright install
- ✓ Daily commit ceiling check (`Cloud-shipped commits in last 24h: 0`)
- ✓ Configure git author
- ✓ Run /march (cloud mode) — the long step

The agent's behavior on this first tick depends on what's
queued. Most likely outcomes:

- **A clean tick** that ships a chunk / data record /
  iterate finding. Watch for the new commit on `main` and
  confirm the deploy went green.
- **A no-op tick** ("nothing to do this tick") — fine. The
  schedule will tick again later when there's work.
- **A red tick** — read the run log, patch, push, re-run
  manually. Common first-run snags are listed in
  `.github/CLOUD_LOOP.md`.

## Step 9 — turn the schedule loose

If the manual run is green, the schedule is already
ticking — no further action needed. Watch
`gh run list --workflow march.yml` for the next
scheduled run. The first 24h, check periodically; after
a day of clean ticks, trust the ceiling + failure-issue
safety net and stop watching.

## Step 10 — scale up (optional)

Once cloud has been ticking cleanly for ~48 hours:

- **Loosen cadence** if more autonomy is wanted (move to
  hourly, or every 30min).
- **Upgrade model** to Opus if your weekly cap usage shows
  headroom. See `.github/CLOUD_LOOP.md`.
- **Switch to user-author mode** if the bot identity in
  the git log bothers you. Same doc.
- **Tighten cadence** if you feel quota pressure. Drop to
  every 4h.

## Optional: the other shapes

Step 1 only copies the minimum for the dispatcher loop
(`march.yml` + `CLOUD_LOOP.md`). The rest of the genus — the
night shift, the heartbeat, the smoke-test breadth check, and
the issue forms — ship separately, on demand:

```bash
cp ../nexus/templates/.github/workflows/night.yml         .github/workflows/night.yml
cp ../nexus/templates/.github/workflows/heartbeat.yml     .github/workflows/heartbeat.yml
cp ../nexus/templates/.github/workflows/nightly-smoke.yml .github/workflows/nightly-smoke.yml
mkdir -p .github/ISSUE_TEMPLATE
cp ../nexus/templates/.github/ISSUE_TEMPLATE/*.yml        .github/ISSUE_TEMPLATE/
```

The PowerShell twin, Windows native:

```powershell
Copy-Item ..\nexus\templates\.github\workflows\night.yml         .github\workflows\night.yml
Copy-Item ..\nexus\templates\.github\workflows\heartbeat.yml     .github\workflows\heartbeat.yml
Copy-Item ..\nexus\templates\.github\workflows\nightly-smoke.yml .github\workflows\nightly-smoke.yml
New-Item -ItemType Directory -Force .github\ISSUE_TEMPLATE | Out-Null
Copy-Item ..\nexus\templates\.github\ISSUE_TEMPLATE\*.yml .github\ISSUE_TEMPLATE\
```

Each piece is independently opt-in:

- **`night.yml`** — needs `skills/digest.md` +
  `.claude/commands/digest.md` (see `templates/README.md`'s
  adopt-by-need table). Fill its `<PROJECT>` placeholder the
  same way you filled `march.yml`'s.
- **`heartbeat.yml`** — no skill dependency, no placeholders;
  copy it alongside `night.yml` any time you want the
  model-free watchdog described in `.github/CLOUD_LOOP.md`
  "The other shapes". Name your CI gate in the repo variable
  `NEXUS_HEARTBEAT_WATCH` (with `march night`) and a red push
  run on the default branch opens one issue for `/triage`.
  Its motion step runs `scripts/plan/motion.mjs` (copied
  with the plan scripts; skipped when absent) and reads
  `Motion floor` and `stall_action` from `plan/bearings.md`.
  Its realized-cadence step runs `scripts/cloud/cadence.mjs`
  (copied with the cloud scripts) and opens one issue when
  march's scheduled runs fall under 40% of the cron's slots
  in 72h.
- **`nightly-smoke.yml`** — only if hermetic e2e is adopted
  and `night.yml` isn't already running its own
  `SMOKE_SAMPLE=full` breadth step (see
  [`customization/hermetic-e2e.md`](../customization/hermetic-e2e.md))
  — running both is redundant.
- **`ISSUE_TEMPLATE/*.yml`** — five issue forms that route
  straight into `/triage`'s labels. No skill dependency; fill
  `config.yml`'s `<REPO_SLUG>` placeholder.

See [`concepts/loop-shapes.md`](../concepts/loop-shapes.md)
for what each shape actually does once it's running.

## What changes in your local workflow

Almost nothing. Local `/loop /march` still works exactly
as before. The cloud loop runs alongside it. The only
new constraint:

- Every commit you ship locally must NOT use the
  `Cloud-Run:` trailer (that's reserved for cloud
  commits). Your local skills already follow this; the
  agents.md carve-out makes it formal.

If both halves run simultaneously, the concurrency group
+ git push semantics + ceiling bound ensure they don't
collide. A cloud tick that finds the working tree out of
date will pull-rebase and continue.

## Tearing it down

If cloud-loop adoption was a mistake:

```bash
gh workflow disable march.yml
git rm -r .github/workflows/march.yml .github/CLOUD_LOOP.md
git commit -m "revert: remove cloud-loop"
git push
gh secret delete CLAUDE_CODE_OAUTH_TOKEN
gh secret delete NETLIFY_AUTH_TOKEN  # if you added it for cloud only
```

The local loop is unchanged. Nothing else needs to be
reverted.

## Failure mode: the post-result exit hang

The one failure that wedges the loop instead of just blocking a
tick. Symptom: the agent emits its final `{"type":"result",
"subtype":"success"}`, then the run **never closes** — it sits
`in_progress` for hours — and it stops shipping commits. It looks
nefarious. It is not.

**Mechanism.** The gate (`pnpm verify`) grew past a single
foreground time budget. The agent reasonably moved it to
`run_in_background: true` and parked, waiting for a completion
notification. In an interactive session that notification is
reliable, so it looks fine locally. In the non-interactive cloud
SDK it is **not** reliable: the SDK ends the turn (emits the
`result`) while the backgrounded gate is still alive, the resume
notification often never arrives, so the agent never resumes (no
commit) and the gate's child processes (dev server, headless
browser, DB containers) keep the process tree alive so the CLI
cannot exit. One root cause, two visible symptoms ("stopped
committing" + "never closes").

**The trap: do not add a watchdog.** A second job that cancels
the run on a done-marker or a shipped commit only masks it — and
it cannot fire in the exact case that matters (no commit, no
marker, because the agent never resumed). It also adds enough
complexity to make things worse. The fix is to make the CLI able
to exit, not to kill it after it can't.

**The fix.** Run the gate foreground (standing rule 3 in the
agents.md template). If it has outgrown one foreground budget,
shrink it: split into sequential foreground legs with their own
bounded timeouts, and move O(content) breadth (per-record
crawls) to a nightly `e2e-full`-style job that files an issue on
failure. The per-commit step timeout reverts to a pure backstop
(sized above the legit max), not the mechanism that keeps the
loop moving.

**Diagnosis technique (reusable).** Cloud action logs hide the
SDK transcript by default (`Running Claude Code via SDK (full
output hidden)`). When a hang is opaque, clone the workflow to a
dispatch-only diagnostic copy with `show_full_output: true`,
identical prompt+env, a short step cap, and no watchdog. One run
shows the full turn-by-turn transcript and the
`init → result → dead-air` timing exactly. Delete the clone once
root-caused. (On a public repo, registered secrets are
auto-masked; transformed secrets are not — keep the clone
dispatch-only, never on a recurring trigger.)

## Reference implementation

nexus runs this exact pattern on itself — the ouroboros. See
this repo's own `.github/` (`workflows/march.yml` +
`CLOUD_LOOP.md`) for the live workflow + operator's guide as
it currently exists on a working autonomous-loop repo.
Sibling adopters run the same pattern in production.
