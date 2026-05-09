# Cloud loop (opt-in) — run /march on GitHub Actions

> Run the autonomous loop on a cron, in the cloud, without
> your laptop being open. Picks up where local `/loop /march`
> stops when you close the lid.
>
> **Opt-in.** Most projects are fine with local-only loops;
> this is for projects where unattended autonomy is the
> point.

## When you want this

- You want the loop to keep ticking nights, weekends, and
  while you're away from your laptop.
- Your project has steady backlog (phases, audit findings,
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
+ public repo + Sonnet 4.6 → genuinely $0 marginal.

## The shape of the kit

Three new files relative to the standard nexus overlay:

```
.github/
├── workflows/
│   └── march.yml          # the cron workflow
└── CLOUD_LOOP.md          # operator's guide (lives in repo)
```

Plus three GitHub secrets, one workflow_dispatch validation
run, and (optionally) a fine-grained PAT.

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
mkdir -p .github/workflows
cp ../nexus/templates/.github/workflows/march.yml .github/workflows/march.yml
cp ../nexus/templates/.github/CLOUD_LOOP.md       .github/CLOUD_LOOP.md
```

## Step 2 — fill placeholders

In `.github/workflows/march.yml`, replace:

- `<PROJECT>` → your project name (matches `agents.md`)
- `<PROJECT_PKG_PREFIX>` → your package scope (e.g.,
  `@thock`) or drop the Playwright steps entirely if you
  don't have an e2e workspace
- `<DEFAULT_BRANCH>` → typically `main`

In `.github/CLOUD_LOOP.md`:

- `<PROJECT>` → your project name
- `<DEFAULT_BRANCH>` → typically `main`
- `<REPO_SLUG>` → e.g., `daretodave/<PROJECT>`

## Step 3 — adjust the schedule

The default cron is `0 1,3,5,7,9,11,23 * * *` UTC — every
2h between 18:00 and 06:00 ET (off-peak US East). Adjust to
your timezone. GitHub cron always runs in UTC.

Conservative starting cadences:
- **Hourly UTC, no off-peak filter** — `0 */2 * * *`. Easy
  default, 12 ticks/day, the ceiling bounds spend.
- **Off-peak only** — fill in 2-hour slots that cover your
  evenings + weekends.
- **Weekdays off-peak only** — `0 */2 * * 1-5` (Mon-Fri).

Don't go below every 2h on the first run. The ceiling
defaults to 12 cloud commits / 24h; cadence above that
just wastes invocations.

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

- **A clean tick** that ships a phase / data record /
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

## Reference implementation

`thock` runs this exact pattern in production. See
https://github.com/daretodave/thock/tree/main/.github
for the live workflow + operator's guide as it currently
exists on a working autonomous-loop repo.
