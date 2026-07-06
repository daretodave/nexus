# Cloud loop — operator's guide

> The cloud half of <PROJECT>'s autonomous loop. One scheduled
> GitHub Actions invocation = one `/march` tick. Local half is
> unchanged (`/loop /march` still works on your laptop); the
> cloud half just runs alongside.

## What it is

`.github/workflows/march.yml` runs on a cron and invokes the
[Claude Code GitHub Action](https://github.com/anthropics/claude-code-action)
with a cloud-mode brief. The agent reads `agents.md`, runs `/march`,
ships a tick (or exits cleanly if there's nothing to do), and
hands the runner back.

State lives where it always has — `plan/`, `data/`, `AUDIT.md`,
`BACKLOG.md`, `PHASE_CANDIDATES.md`, the build plan. The cloud
agent reads these from `origin/<DEFAULT_BRANCH>`, writes its
commit, pushes, and exits. No memory between ticks. Each tick
is hermetic.

## What it costs

If you authenticate via `CLAUDE_CODE_OAUTH_TOKEN` (Claude
Pro/Max subscription), the cloud loop is **$0 marginal** —
quota is shared with your local Claude Code sessions.

GitHub Actions minutes are **free for public repos**. On
private repos the workflow burns ~5–15 min per tick against
your monthly cap (2000 min on Pro, 3000 on Pro+).

If you authenticate via `ANTHROPIC_API_KEY` instead, expect
roughly:
- Sonnet 4.6: ~$0.40–0.60/tick → ~$3–5/day at 7 ticks
- Opus 4.7:   ~$2.00–3.00/tick → ~$15–20/day at 7 ticks

The 12-point/24h weighted ceiling caps the worst case either
way (see "The daily ceiling" below).

## Identity choice — bot or you

The default identity is `github-actions[bot]`. Zero secrets to
manage, every cloud commit is visibly bot-authored, and the
`GITHUB_TOKEN` issued automatically to every workflow has all
the permissions needed.

You can switch to **user-author** mode (commits as your real
GitHub user) if you prefer a uniform git log. It needs a
fine-grained PAT.

| | bot mode (default) | user mode |
|---|---|---|
| Setup | one secret (`CLAUDE_CODE_OAUTH_TOKEN`) | three secrets + PAT scopes |
| Git log | `Author: github-actions[bot]` on cloud commits | `Author: <you>` on every commit |
| Discriminator for the ceiling | the `Cloud-Run:` trailer | the `Cloud-Run:` trailer |
| Token rotation | none | when the PAT expires |

The `Cloud-Run:` trailer is mandatory in both modes; it's how
the daily-ceiling check separates cloud volume from local
volume.

To upgrade from bot to user mode:

1. Mint a fine-grained PAT at
   https://github.com/settings/tokens?type=beta scoped to this
   repo only, with **Contents: read+write** and
   **Issues: read+write**. (Add **Pull requests: read+write**
   if you want the agent to open PRs in the future.)
2. Add the secret: `gh secret set ACTIONS_PAT`.
3. In `.github/workflows/march.yml`, under the `Run /march`
   step's `env:`:
   - Replace `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` with
     `GH_TOKEN: ${{ secrets.ACTIONS_PAT }}`.
   - Uncomment the four `GIT_AUTHOR_*`/`GIT_COMMITTER_*` lines
     and replace `<username>`/`<id>` with your GitHub username
     + user id (`<id>+<username>@users.noreply.github.com` —
     find your id at `https://api.github.com/users/<username>`).
   - Also uncomment `token: ${{ secrets.ACTIONS_PAT }}` under
     the checkout step.

   Set these as env vars on the action step, not `git config` —
   the action runs its own internal `git config` after workflow
   steps and silently overrides repo-local config; the env vars
   are the mechanic that actually wins at commit time.
4. Push. The next tick will commit as you.

## Setup (one-time)

### 1. Install the Claude Code GitHub App

The Claude Code Action requires the GitHub App to be installed
on your repo. Visit https://github.com/apps/claude and grant it
access to this repo. (Action runs will fail with "Claude Code
is not installed on this repository" until you do this.)

### 2. `CLAUDE_CODE_OAUTH_TOKEN` — agent auth

In a local terminal with Claude Code installed:

```
claude setup-token
```

You'll get a long token starting with `sk-ant-oat...`. This
authenticates against your Claude Pro/Max subscription.

```
gh secret set CLAUDE_CODE_OAUTH_TOKEN
# paste the token when prompted
```

### 3. Hosting-provider secret(s)

If your `pnpm deploy:check` polls a hosting API (Netlify,
Vercel, Cloudflare, etc.), add the matching token:

```
gh secret set NETLIFY_AUTH_TOKEN     # or VERCEL_TOKEN, etc.
```

Add the same env var to the `Run /march` step in
`.github/workflows/march.yml`:

```yaml
env:
  NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. (User-author mode only) `ACTIONS_PAT`

See "Identity choice" above. Skip this if you're sticking with
bot mode.

### 5. Validate with a manual run

The schedule is on by default. For the first tick you want to
watch it live:

```
gh workflow run march.yml
gh run watch
```

If the tick fails, read the run log; the most common first-run
issues are:

- `Claude Code is not installed on this repository` → see step 1.
- `Could not fetch an OIDC token` → permissions block missing
  `id-token: write`. Already in the template.
- `CLAUDE_CODE_OAUTH_TOKEN not found` → secret name typo.
- `pnpm verify` red → not a cloud problem; the local code is
  broken on `<DEFAULT_BRANCH>`. Fix locally first.

## The `Cloud-Run:` trailer convention

Every commit shipped from the cloud loop ends with a single
trailer:

```
Cloud-Run: https://github.com/<REPO_SLUG>/actions/runs/<run-id>
```

In **bot mode**, the trailer is redundant with the bot author
but kept for consistency.
In **user mode**, the trailer is the only discriminator —
without it, your local commits would falsely count toward the
cloud ceiling.

The cloud-mode brief in the workflow makes the trailer
mandatory. If a cloud commit lacks one, that's a bug to report.

## The daily ceiling

The ceiling step in `march.yml` doesn't count cloud-shipped
commits flatly — it weighs them. A **phase-shipping** commit
(one that ticks a `[ ]` to `[x]` in `plan/steps/
01_build_plan.md` — the one thing only `/ship-a-phase` does)
costs **3** against the budget; a **churn** commit
(`/iterate`, `/critique`, `/triage`, `/digest` — one finding,
one file) costs **1**. The tick exits with no work once the
24h total meets `cloud_loop.daily_ceiling` from your manifest
(`/bootstrap cloud-loop` bakes it into the workflow's
`ceiling=` line; hand-edit that line directly if you didn't
bootstrap). Default is 12 — four phase ships, or a dozen
churn ticks, or any mix between.

## Operating it

### Pausing the cloud loop

```
gh workflow disable march.yml   # soft: schedule off, manual still works
```

To re-enable: `gh workflow enable march.yml`.

### Manually triggering a tick

```
gh workflow run march.yml
```

Useful when you've just merged something locally and want the
cloud to pick it up before the next scheduled firing.

### Watching what shipped

```
gh run list --workflow march.yml --limit 10

# Cloud-shipped commits in the last 24h (raw count, not the
# weighted budget the ceiling step actually checks):
git log --since='24 hours ago' --grep='Cloud-Run:' --oneline

# Local commits only (everything sans cloud trailer):
git log --invert-grep --grep='Cloud-Run:' --oneline
```

`git log --grep='Cloud-Run:'` is the canonical filter.

## Upgrading the model

Default is Sonnet 4.6 because it's cheap-on-quota and fast
enough for `/march`'s decision logic. To upgrade to Opus 4.7:

1. Watch your local `/cost` indicator for a week. Opus is
   roughly 2x Sonnet's weight against the Max weekly cap.
2. If after a real week of mixed usage you've consumed <30% of
   weekly cap, you have headroom for Opus.
3. Edit `.github/workflows/march.yml`, change the model in
   `claude_args`, push.

If you ever hit weekly-cap pressure, drop back to Sonnet.

## What the cloud agent will not do

These are encoded in the brief and in `agents.md`'s standing rules:

- **Will not run `/oversight`.** It's interactive; cloud has no human.
- **Will not run `/critique`.** Reader sub-agent needs Chrome.
- **Will not promote `/expand` candidates.** Only local `/oversight` does that.
- **Will not `--no-verify` or force-push.** Standing rule.
- **Will not half-commit.** A blocked tick exits without committing.
- **Will not amend or rewrite published commits.** Always a new commit.

## Failure mode quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Workflow not firing on schedule | Schedule disabled, or repo inactive (GH pauses crons after 60d of no commits) | `gh workflow enable march.yml` and push something |
| `Claude Code is not installed` | App not installed on the repo | https://github.com/apps/claude |
| `Could not fetch an OIDC token` | Missing `id-token: write` permission | already in template; check you didn't strip it |
| `OAuth token expired` (Claude side) | Token revoked or rotated | `claude setup-token`, update `CLAUDE_CODE_OAUTH_TOKEN` secret |
| `Permission denied` on `git push` | (User mode only) PAT expired or rescoped | Mint a new fine-grained PAT, update `ACTIONS_PAT` |
| Tick failed, issue opened | Tick hit a real error | Read the issue body for the run URL; fix root cause; close issue |
| Loop appears stuck | A previous tick is still running | `gh run list --workflow march.yml --status in_progress`, cancel the stale one |
| Quota pressure on Max | Cloud + heavy local work overlapping | Drop cloud cadence: change cron to every 4h instead of 2h |

## Why this is structured this way

A few decisions that aren't obvious from reading the YAML:

- **Bot author by default.** Lowest setup friction; works
  zero-config for any public repo. Switch to user-author when
  you want a uniform git log and are willing to manage one PAT.

- **Schedule is on by default.** Some teams gate the schedule
  behind workflow_dispatch-only until validated; this template
  trusts the ceiling + concurrency group + failure-as-issue
  safety net to bound the blast radius of a bad first tick.

- **Concurrency group `march` instead of `cancel-in-progress`.**
  A tick that's already shipping should finish, not be aborted
  mid-`pnpm verify`. The next firing waits.

- **The brief is in the workflow YAML.** ~10 lines of cloud-mode
  instructions don't justify a separate file. If your brief
  grows past ~30 lines, split it into `.github/cloud-brief.md`
  and read it via `cat` into the prompt.

- **Failure issues, not workflow re-runs.** Auto-retry of
  failed ticks masks the underlying bug. A red tick surfaces
  as an issue that the next tick triages — same address loop
  the rest of the project uses.
