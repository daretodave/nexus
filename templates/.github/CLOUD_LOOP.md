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
`BACKLOG.md`, `CANDIDATES.md`, the build plan. The cloud
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
- Sonnet 5: ~$0.40–0.60/tick → ~$3–5/day at 7 ticks
  (ids age — check `/model`)
- Opus 5.5: ~$2.00–3.00/tick → ~$15–20/day at 7 ticks
  (ids age — check `/model`)

The 12-point/24h weighted ceiling caps the worst case either
way (see "The daily ceiling" below).

## Owner mode or pull requests

One repo variable decides how a tick lands, the cloud's
`.owner` (`nexus/playbooks/owner-mode.md`):

| `NEXUS_LOOP_MODE` | A tick | Its safety |
|---|---|---|
| `owner` | the `owner` job: `/march` as the owner's checkout runs it (an untracked `.owner` on the runner): claims as the owner, settles `plan/pending/`, pushes `<DEFAULT_BRANCH>` | the gate, and a token that holds the ruleset's bypass |
| unset, or `pr` | `pick` → `build` → `land` (→ `release`): one chunk, a pull request | the owner's review, and a credential split |

Pull-request mode, job by job (`scripts/cloud/tick.mjs`):

1. **`pick`** claims the first ready, unclaimed chunk in
   `/next`'s pick order as the contributor `nexus-cloud`,
   session `cloud-<run id>`. It claims nothing while
   `NEXUS_PR_LIMIT` (default 3) loop PRs wait on you, or when
   no chunk is ready (an unchunked spec is yours to chunk).
2. **`build`** runs `/next` on that chunk with **no token at
   all** (read-only job, `persist-credentials: false`, the
   Claude Code CLI rather than the action, which fetches a token
   of its own), on the branch `nexus/<run id>`. Plan changes go
   only into `plan/pending/<id>.md` (and a new spec file).
3. **`land`** runs the default branch's scripts, never the
   tick's: it fences the diff (`tick.mjs fence`: no shared plan
   or identity file edited, nothing under `.github/workflows/`
   or `.github/actions/`), then mints the app token if you set
   one, pushes, opens the PR and attaches it to the claim.
4. **`release`** gives the claim back when nothing landed.

Then `pr-flow.yml` releases a PR's claims when it closes,
merged or not (`claims prune`), and `pr-resolve.yml` merges
`<DEFAULT_BRANCH>` into conflicted loop and contributor PRs
after every push (the union driver first, a model with Read and
Edit only for what is left). You merge; your next local
`/next` (or an owner-mode tick) settles the pending files.

**The app (optional, recommended for PR mode).** A PR opened
with the workflow's own token never starts its checks, so you
would re-run them by hand. Create a GitHub App with Contents and
Pull requests read/write on this repo only, install it, then:

```
gh variable set NEXUS_APP_ID --body <app id>
gh secret set NEXUS_APP_PRIVATE_KEY < app-private-key.pem
```

The token is minted in `land` after the fence, so the agent
never holds it. Without the app, also allow Actions to open
PRs: Settings → Actions → General → "Allow GitHub Actions to
create and approve pull requests".

Every job runs on GitHub-hosted runners, and no secret sits in
`run-name` or a job's `env:`; `scripts/workflow-lint.mjs`
checks both, and the night shift (`night.yml`) switches the
same way (its PR carries only the digest's files). The lint
also fails a run script or an agent's `with:` input
(`prompt`, `direct_prompt`, `claude_args`) that interpolates
issue or pull request text: a tick receives an issue's
number, and reads the rest with `gh` as data.

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
   if you want the agent to open PRs in the future. Add
   **Workflows: read+write** only if you want the loop to
   maintain its own `.github/workflows/` files — a deliberate
   trade: the loop can then also rewrite the workflow that
   runs it, so grant nothing beyond what you'd hand a
   prompt-injected tick. Never Secrets/Webhooks/Variables.)
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

### 0. Choose how ticks land

```
gh variable set NEXUS_LOOP_MODE --body owner   # or leave it unset: pull requests
```

See "Owner mode or pull requests" above. Pull-request mode also
wants `pr-flow.yml` and `pr-resolve.yml` beside `march.yml`.
`/bootstrap cloud-loop` does both from the manifest's
`cloud_loop.mode` (`owner` or `pr`).

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
commits flatly — it weighs them. A **chunk-shipping** commit
(one that adds a line to `plan/ARCHIVE.md`, the one thing only
a chunk close does) costs **3** against the budget; a **churn** commit
(`/iterate`, `/critique`, `/triage`, `/digest` — one finding,
one file) costs **1**. The tick exits with no work once the
24h total meets the ceiling: the cadence's (`NEXUS_CADENCE`,
or `NEXUS_DAILY_CEILING`; see [Cadence](#cadence)) when set,
else the workflow's `ceiling=` line (`/bootstrap cloud-loop`
bakes your preset's, or `cloud_loop.daily_ceiling`, into it;
hand-edit that line directly if you didn't bootstrap).
Default is 12 — four chunk ships, or a dozen churn ticks, or
any mix between.

A tick that ships nothing is invisible to that count, so the
same step holds a second one: the **dispatch ceiling**
(`node scripts/cloud/quota.mjs dispatch`). A
`workflow_dispatch` run exits clean once
`NEXUS_DISPATCH_MAX` (repo variable, default 12)
`workflow_dispatch` runs of any workflow started in the
repository in the last 24 hours. It bounds a tick that calls
`gh workflow run` itself (a prompt-injected one), event nudges
and chained runs alike; scheduled ticks never skip on it, and
it fails open when `gh` cannot list the runs. The owner job
holds `actions: write` (read for this count, write for the
chain step) and the pick job `actions: read`. The step summary's no-op reason names
which ceiling stopped the tick.

Every run is titled `march <verb> <reason>` (`run-name`): the
`reason` input says why a run was dispatched (`issue-<n>` from
a nudge, `chain` from a chained tick, empty by hand). The gates
read it through `env:`, never inlined into a script or the
prompt.

An issue a tick opens carries a `Cloud-Run: <run url>` line in
its body (the loop-filed marker) and never a `bug`, `loop:do`
or other urgent label, so nothing the loop files starts another
tick; `/triage` still classifies it.

## The quota governor

Every loop on one Claude subscription shares its weekly
(`seven_day`) window, and a lockout fails every tick until the
reset. `scripts/cloud/quota.mjs` reads the window from each
tick's own model output and acts before the next tick spends:

| Step | What it does |
|---|---|
| Quota read | After the model: writes `seven_day utilization: <u> (<status>, resets <ISO>)` to the step summary and caches it (`actions/cache`, key `nexus-quota-<run id>`) |
| Quota gate | Before the model: restores the newest cached reading and exits clean, with no model call, while the weekly quota is out, for every tick at or above the hard ceiling (0.97), or when a scheduled or chained tick finds utilization at or above `NEXUS_QUOTA_MAX` |
| Pause on the weekly quota | On a `rejected` reading: ONE issue `Loop paused: weekly quota until <ISO>` (label `loop:paused-quota`) instead of a crash issue; the first tick after the reset closes it |

- `NEXUS_QUOTA_MAX` (repo variable): the soft cap, default
  `0.90`; `off` disables it. Nudge, `loop:do` and hand-run
  ticks ignore it; the lockout stops every kind of run.
- The hard ceiling: at or above 0.97 `seven_day` utilization
  every tick exits clean, whatever its event, verb, reason or
  label. A constant, not a knob: it keeps the last 3% of the
  week for the owner's own sessions.
- The gate fails open: no cache, or one it cannot parse, runs
  the tick.
- `heartbeat.yml` files no flatline while the pause issue is
  open; `/digest` prints the last reading
  (`node scripts/cloud/quota.mjs show`). A red CI gate is a
  different report: name the gate in `NEXUS_HEARTBEAT_WATCH`
  and a failed push run on the default branch opens one
  `Heartbeat: <wf> is red on <branch>` issue, quota or not.
- Issue text is untrusted: the gate and the heartbeat count a
  pause issue only when it carries `loop:paused-quota` or the
  workflow token opened it. An issue anyone else opens with
  that title never pauses the loop or silences the alarm.

## Lost to background

A tick is one single-shot process: work handed to a background
Bash call or subagent outlives the turn that would collect it,
the job exits clean, and nothing lands. Two checks hold the
line:

| Check | What it does |
|---|---|
| `guard.mjs` background rule | With `GITHUB_ACTIONS=true`, denies a `run_in_background: true` Bash call and any Agent dispatch that does not pass `run_in_background: false` (`pre-bash`, `pre-agent`). `NEXUS_ALLOW_BACKGROUND=1` lifts it |
| Lost-to-background check | After the model: a result that defers to background work (`background`, `I'll wait`, `resume once`) with no commit carrying the run's `Cloud-Run:` trailer writes `no-op reason: lost-to-background (...)` to the step summary and sets the step's `lost` output (`scripts/cloud/lost.mjs`) |

The guard only fires where the action loads the project's
hooks; the check runs either way.

## Idle ticks and the no-op reason

A scheduled tick that finds nothing new still pays for a model
call to learn so. `scripts/cloud/idle.mjs` decides before the
model, in the owner job:

| Step | What it does |
|---|---|
| Idle probe | Before the model: computes a fingerprint from counts and hashes only (the main branch's sha, open issue counts by label, the ready-chunk count, the newest issue `updated_at`; never issue text) and exits clean, with no model call, when a **scheduled** tick finds it unchanged since the last no-op, the last `NEXUS_IDLE_BACKOFF` scheduled ticks were no-ops, nothing is ready, and this is not every `NEXUS_IDLE_WAKE_EVERY`th skip |
| Idle record | After the model: whether a commit carries the run's `Cloud-Run:` trailer, and the fingerprint the tick left (`actions/cache`, key `nexus-idle-<run id>`) |
| No-op reason | Every tick: when nothing landed, ONE step-summary line `no-op reason: <why>` (ceiling, quota, idle skip, no ready work, lost-to-background, a failed model step, or the result's last line) |

- `NEXUS_IDLE_BACKOFF` (repo variable): default `3` (or the
  cadence preset's); `0` never skips.
  `NEXUS_IDLE_WAKE_EVERY`: default `4`.
- Dispatch, nudge and chain runs never skip; a ready chunk
  always runs; the probe fails open (no cache, gh unreachable,
  no plan scripts: the tick runs).
- Pull-request mode has no idle probe (its pick job claims
  nothing and the model never starts when nothing is ready);
  its pick, build and release jobs write the no-op reason.

## Chained ticks

A tick that shipped and leaves work ready behind it need not
wait for the next cron slot. The last step, **Chain next
tick** (`scripts/cloud/chain.mjs`), dispatches ONE next run,
`gh workflow run march.yml -f chain=<N+1> -f reason=chain`,
only when every guard holds (the job holds `actions: write`):

| Guard | Holds when |
|---|---|
| depth | `chain + 1` is at or under the chain max (`NEXUS_CHAIN_MAX`, else the cadence preset's) |
| shipped | this run landed a `Cloud-Run:` commit (pull-request mode: its land job succeeded), or it was marked lost-to-background and is not already the retry (then `reason=retry`, once) |
| quota | this run's seven_day reading parsed and is under `NEXUS_QUOTA_MAX` (`off`: under 0.97) |
| budget | the weighted 24h budget + 3 is at or under the ceiling (pull-request mode has none; the dispatch ceiling bounds it) |
| night | not within 30 min of a cron slot in `night.yml` (no `night.yml`: no guard) |
| queue | no march or night run is queued or pending (a new pending run would cancel it) |
| ready | a chunk is ready (Asap included), or (owner mode) an open `loop:do` or unlabeled issue without `loop:opened` |

- `NEXUS_CHAIN_MAX` (repo variable) overrides the cadence
  preset's chain max (`eager` 3, `sprint` 8, the rest 0).
  With neither set, or anything but a whole number, it reads
  as `0`, and `0` never chains. Turn it on with `gh variable
  set NEXUS_CHAIN_MAX --body 3`; off again with `--body 0`.
- It fails closed: a quota, ceiling, cron or run list it
  cannot read means no chain. The chained run passes the same
  ceilings and quota gate as any run, so the dispatch ceiling
  (`NEXUS_DISPATCH_MAX`) bounds a chain too.
- Every tick writes one `chain: ...` line to the step summary:
  `dispatched march.yml (chain=2, reason=chain)`, or `no
  (<guard>: <why>)`.

## Cadence

One repo variable sets how hard the loop runs.
`NEXUS_CADENCE` names a preset (`scripts/cloud/cadence.mjs`
owns the table), and each march job's first step, **Cadence**,
turns it into the ceiling, the chain max and the idle backoff
at run time; `heartbeat.yml` reads it for the march flatline
threshold. Switching presets is `gh variable set NEXUS_CADENCE
--body <preset>`: no file edit.

| Preset | Cron written | Heartbeat h | Ceiling | Chain max | Idle backoff |
|---|---|---|---|---|---|
| calm | `17 */6 * * *` | 20 | 8 | 0 | 3 |
| steady | `17 */3 * * *` | 14 | 12 | 0 | 3 |
| eager | `17 */3 * * *` | 10 | 20 | 3 | 3 |
| sprint | `17 */3 * * *` | 10 | 30 | 8 | 3 |
| off | no schedule (dispatch and nudge only) | none | 12 | 0 | 0 |

- A per-field repo variable overrides its preset:
  `NEXUS_DAILY_CEILING`, `NEXUS_CHAIN_MAX`,
  `NEXUS_IDLE_BACKOFF`, `NEXUS_HEARTBEAT_HOURS`.
- Unset (an upgraded repo, or one that never chose), the
  workflow's own `ceiling=` and heartbeat's `march_hours=`
  literals stand, the idle backoff is 3, and nothing chains.
  An unknown word is a warning in the log and reads as unset.
- The cron line is the one thing a variable cannot change:
  GitHub reads it from the file. `node
  scripts/cloud/cadence.mjs apply <preset> --write` writes the
  preset's cron, `ceiling=` and `march_hours=` lines (dry run
  without `--write`; `off` takes the schedule out and a later
  preset puts it back); commit them, then set the variable.
  `/bootstrap cloud-loop` does both from
  `cloud_loop.cadence` (default `steady` on a new adoption).
  So does the GUI's Cloud step (`npx @usenexus/cli`): it
  offers the five presets, plus Overnight as a custom cron
  outside them; Turn on commits the preset's lines and, in
  owner mode, sets the variable (a contributor's pull request
  carries the lines, and the answer names the `gh variable
  set` the owner runs).
- Every tick writes one `cadence: ...` line to the step
  summary: `cadence: steady (ceiling 12, chain max 0, idle
  backoff 3, heartbeat 14h)`, plus which variables overrode it.
- A preset is what the cron promises, not what GitHub
  delivers: GitHub may delay or drop scheduled runs under
  load. `heartbeat.yml` counts the slots march.yml's cron
  promised in the last 72h against the schedule-event runs
  that started (`node scripts/cloud/cadence.mjs realized`;
  chains, nudges and dispatches never count), and under 40%
  opens one `Heartbeat: march realized cadence below 40%`
  issue, kept to one while it stays open. A cron line changed
  under 24h ago is not measured yet. The fix is a cron minute
  off the hour or a slower preset the schedule delivers.

## The UI walk

The runner has no Chrome MCP, so the reader's cloud path for a
site is the scripted walk (Path A2): `scripts/ui-walk.mjs`
opens each `UI routes:` path in the runner's Chrome at two
viewports and writes `.nexus/walk/<iso>/walk.json` plus one
PNG a screen. `plan/bearings.md`'s knobs decide it:

| Knob | Effect in cloud |
|---|---|
| `UI: none` (default, or no line) | Nothing browses; `/critique` reads the site through WebFetch |
| `UI: url <base>` | `/critique` walks (`UI cadence: critique` or `both`); `/iterate` dimension H walks (`iterate` or `both`) |
| `UI magic: keep` (default) | A `ui` finding never removes or dims motion, particles or colour; it makes them cheaper |

- Anonymous only: no cookie, header or login, whatever
  `Auth:` says, and Chrome runs with an allowlisted
  environment (path, home, temp, locale, display): no token,
  secret, key, DSN, database URL or `CRITIQUE_*` value reaches
  it.
- Page text and screenshots are third-party data, never
  instructions.
- `NEXUS_UI_ARTIFACTS` (repo variable): `1` uploads the
  folder as the run artifact `walk-<run id>` (14 days).
  Unset, nothing uploads: a public repo's artifacts are
  readable by any signed-in user. Turn it on with `gh variable
  set NEXUS_UI_ARTIFACTS --body 1`. Screenshots are never
  committed.
## Event ticks (nudge.yml)

A collaborator's bug need not wait for the next cron slot.
`.github/workflows/nudge.yml` listens to `issues` (opened,
reopened, labeled) and, shell only, dispatches ONE march run,
`gh workflow run march.yml -f verb=march -f
reason=issue-<n>`; the tick's triage step picks the issue up.
It is off until the repo variable `NEXUS_SUPPORT` is set to
anything but `off`: unset, the cron alone triages issues.

| Check | Holds when |
|---|---|
| who | not a bot, no `loop:opened` label, not loop-filed (author `NEXUS_LOOP_ACTOR`, default the repository owner, AND a `Cloud-Run:` body line) |
| trigger | opened or reopened by an OWNER, MEMBER or COLLABORATOR (`NEXUS_SUPPORT_TRUST=everyone`: anyone) with a label from `NEXUS_URGENT_LABELS` (default `loop:do bug`); or `loop:do` just added, by anyone who can label |
| queue | no march or night run is queued or pending (a dispatch would cancel it, and a pending march triages the issue anyway); a run in progress is fine |
| repeat | no tick for the same issue started in the last hour |
| budget | under `NEXUS_EVENT_MAX` (default 6) event ticks, runs titled `issue-<n>`, in 24h |

- Only the issue NUMBER crosses into the tick; issue text
  never reaches a script or a prompt (the job `if:` reads the
  payload in the expression context, and
  `scripts/cloud/nudge-check.mjs` reads labels and the marker
  from the payload file).
- It fails closed: a run list it cannot read means no
  dispatch. The dispatched run passes the dispatch ceiling and
  the quota gate like any other.
- Each nudge writes one `nudge: ...` line to its step summary.

### The Support knobs

Repo variables (`gh variable set <NAME> --body <value>`); the
level, routing and digest line are in
`nexus/customization/support.md`.

| Variable | Values | Default |
|---|---|---|
| `NEXUS_SUPPORT` | `off` `triage-only` `fix-small` `fix-all` | unset: `triage-only` from `plan/bearings.md` `Support:`, no event ticks |
| `NEXUS_SUPPORT_TRUST` | `collaborators` `everyone` | `collaborators` |
| `NEXUS_URGENT_LABELS` | space-separated labels; empty = no nudge | `loop:do bug` |
| `NEXUS_LOOP_ACTOR` | the login the loop's token acts as | the repository owner |
| `NEXUS_EVENT_MAX` | event ticks per 24h | `6` |
| `NEXUS_DISPATCH_MAX` | `workflow_dispatch` runs per 24h | `12` |

Unset, the loop runs as it always has: the cron triages, a bug
becomes a `plan/AUDIT.md` row, and `nudge.yml` never
dispatches. `plan/bearings.md` carries the rest (`sla_hours`,
`escalate_days`, `asap_cap`).

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

Default is Sonnet 5 because it's cheap-on-quota and fast
enough for `/march`'s decision logic (ids age — check
`/model`). To upgrade to Opus 5.5 (same hedge applies):

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
| PR-mode tick: `fence:` lines, land failed | The tick edited a shared plan file or a workflow | Read the fence's lines; the claim was released; the next tick picks again |
| PR-mode tick: `nothing claimed until the owner merges` | `NEXUS_PR_LIMIT` loop PRs are open | Review and merge (or close) them |
| PR-mode PR's checks never start | Opened with the workflow's own token | Set up the app (`NEXUS_APP_ID`), or re-run the checks from the PR |
| Quota pressure on Max | Cloud + heavy local work overlapping | Drop cloud cadence: change cron to every 4h instead of 2h |
| `Loop paused: weekly quota until <ISO>` issue | The subscription's weekly quota is used up | Nothing: ticks skip the model until the reset, then the issue closes itself. Far off: `gh workflow disable march` |
| Ticks skip with `Quota gate (scheduled run): skip` | Cached utilization at or above `NEXUS_QUOTA_MAX` | Expected; raise the cap (`gh variable set NEXUS_QUOTA_MAX --body 0.95`) or switch it off (`--body off`) |
| Ticks skip with `Idle probe (scheduled run): skip` | Nothing changed since the last no-op, after `NEXUS_IDLE_BACKOFF` scheduled no-ops | Expected; a dispatch runs regardless (`gh workflow run march`), or turn it off (`gh variable set NEXUS_IDLE_BACKOFF --body 0`) |
| More march runs than the cron promises, titled `march march chain` | Chained ticks: a tick that shipped dispatched the next while work was ready | Expected up to the chain max deep; stop it with `gh variable set NEXUS_CHAIN_MAX --body 0` |
| `cadence: NEXUS_CADENCE "..." is not one of calm \| steady \| eager \| sprint \| off` in the log | A typo in the variable: it reads as unset | `gh variable set NEXUS_CADENCE --body steady` |
| The variable changed, but ticks still fire on the old cron | The cron lives in the file, not the variable | `node scripts/cloud/cadence.mjs apply <preset> --write`, then commit `march.yml` |
| `chain: no (dispatch: gh workflow run failed (HTTP 403 ...))` | The job lacks `actions: write` | Restore `actions: write` on the job that runs Chain next tick |
| Step summary: `no-op reason: lost-to-background` | The agent handed work to a background call and ended its turn | Check the prompt still says every dispatch passes `run_in_background: false`, and that `.claude/settings.json` wires `guard.mjs pre-agent` |

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
