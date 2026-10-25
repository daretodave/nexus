# Playbook: add the cloud loop to a repo that already has Actions

> Your repo already runs a local workflow (`/next`,
> `/heads-down`, claims, pending files) and its own GitHub
> Actions (CI, deploys, maybe a PR bot). This adds nexus's
> cloud loop beside them without breaking either: one step at
> a time, each with a check you can run and a line that says
> when it's done. Every command has a PowerShell twin.

The generic, greenfield story is
[`cloud-loop.md`](./cloud-loop.md). This page is for the repo
that has history: workflow names that may collide, a
concurrency group already called `deploy`, a self-hosted
runner, a PR bot that already releases claims, a ruleset on
main. The order below was learned from a mature adopter that
grew all of those before it grew a cloud loop.

**For tools that drive this page** (the `@usenexus/cli`
Actions-setup screen): each step is a `## Step N` heading
with a `<!-- step: <id> -->` marker, a **Check** (read-only
commands whose output says whether the step is done), a
**Do** (the change), and a **Done when** line. A step whose
check already passes is skipped, never redone.

---

## Step 0 — preflight
<!-- step: preflight -->

**Check:**

```bash
claude --version
gh auth status
git remote get-url origin
node --version
```

```powershell
claude --version
gh auth status
git remote get-url origin
node --version
```

**Done when:** Claude Code is installed and logged in (if it
isn't, run `claude`, then `/login`), `gh` is logged in to the
host that holds `origin`, and Node is 20 or newer.
`scripts/claims.mjs` and `scripts/plan/order.mjs` exist (a
pull-request-mode tick claims and picks with them). The local
loop works: `/next peek` answers in this checkout.

## Step 1 — inventory the Actions you have
<!-- step: inventory -->

**Check:**

```bash
gh workflow list --all
ls .github/workflows
grep -n "group:\|runs-on:" .github/workflows/*.yml
gh secret list
gh variable list
gh api repos/<REPO_SLUG>/rulesets --jq '.[].name'
```

```powershell
gh workflow list --all
Get-ChildItem .github\workflows
Select-String -Path .github\workflows\*.yml -Pattern 'group:', 'runs-on:'
gh secret list
gh variable list
gh api repos/<REPO_SLUG>/rulesets --jq '.[].name'
```

**Do:** write down, in the PR or issue that tracks this
adoption:

- **Name collisions.** The loop adds `march.yml`, `night.yml`,
  `heartbeat.yml`, and in pull-request mode `pr-flow.yml` and
  `pr-resolve.yml`. Any of those you already have is merged
  by hand in Step 5, never overwritten.
- **Concurrency groups.** The loop's writers share the group
  `march`; `pr-resolve` uses `pr-resolve`; `pr-flow` one group
  per PR. A workflow of yours already in one of those groups
  would queue behind the loop: rename the loop's.
- **Runners.** Note every job on a self-hosted runner. The
  loop's jobs hold secrets, so they run on GitHub's hosted
  runners only (Step 4 checks it).
- **Secrets and variables** already named
  `CLAUDE_CODE_OAUTH_TOKEN`, `NEXUS_*`: reuse, don't re-mint.
- **Rulesets** on the default branch and on `claims`.

**Done when:** the list exists and names each collision.

## Step 2 — inventory the local workflow
<!-- step: local -->

**Check:**

```bash
node scripts/claims.mjs whoami
git ls-remote --heads origin claims
ls plan/pending
git config core.hooksPath
```

```powershell
node scripts/claims.mjs whoami
git ls-remote --heads origin claims
Get-ChildItem plan\pending
git config core.hooksPath
```

**Do:** answer three questions. They decide which templates
you copy in Step 5.

| Question | Yes | No |
|---|---|---|
| Does the repo run the claims module (`scripts/claims.mjs`, an orphan `claims` branch)? | Pull-request mode works as shipped. | Adopt it first ([`../customization/claims.md`](../customization/claims.md)), or run the loop in owner mode only. |
| Does a PR bot of yours already release a PR's claims when it closes? | Keep yours; skip `pr-flow.yml`. | Copy `pr-flow.yml`. |
| Does something already merge main into conflicted PRs? | Keep yours; skip `pr-resolve.yml`. | Copy `pr-resolve.yml` (it needs `merge=union` lines in `.gitattributes` for the append-only plan files). |

Your existing PR and claims flow stays as it is: the loop's
PRs are ordinary contributor PRs (`nexus/<run id>` branches,
claims under the session `cloud-<run id>`), so whatever
already reviews, labels or releases a contributor's PR handles
the loop's too.

**Done when:** each question has an answer.

## Step 3 — choose how ticks land
<!-- step: mode -->

**Check:** `gh variable list` shows `NEXUS_LOOP_MODE` (or
doesn't).

**Do:** pick one ([`owner-mode.md`](./owner-mode.md)):

- **Owner mode:** ticks push the default branch, as the
  owner's checkout does, and settle the plan. The safety is
  the gate: choose it when the gate (e2e included) is strong
  enough to trust a push nobody reviewed.
- **Pull-request mode** (the default when the variable is
  unset): each tick claims one chunk, builds it with no token,
  and opens a PR you review. The owner settles after merging.

```bash
gh variable set NEXUS_LOOP_MODE --body owner    # owner mode
gh variable delete NEXUS_LOOP_MODE              # pull-request mode
```

```powershell
gh variable set NEXUS_LOOP_MODE --body owner    # owner mode
gh variable delete NEXUS_LOOP_MODE              # pull-request mode
```

**Done when:** the variable says what you chose.

## Step 4 — lint the workflows you have
<!-- step: lint -->

**Check:**

```bash
mkdir -p scripts
cp ../nexus/templates/scripts/workflow-lint.mjs scripts/workflow-lint.mjs
node scripts/workflow-lint.mjs
```

```powershell
New-Item -ItemType Directory -Force scripts | Out-Null
Copy-Item ..\nexus\templates\scripts\workflow-lint.mjs scripts\workflow-lint.mjs
node scripts/workflow-lint.mjs
```

**Do:** fix what it names in your existing workflows before
the loop's arrive: a secret on a job that may run on a
self-hosted runner (move the job to a hosted runner, or move
the secret out), a secret or `github.token` in a job's
`env:` (move it onto the step that uses it), a context
`run-name` or a job's `env:` can't read, a run script that
interpolates a PR title or branch name (pass it through
`env:`), an agent's `with: prompt` (or `direct_prompt`,
`claude_args`) that interpolates an issue's body or title
(pass the number; the agent reads the rest as data). A
secret-free job may run on your own box through
`${{ vars.NEXUS_RUNNER || 'ubuntu-latest' }}`.

**Done when:** `node scripts/workflow-lint.mjs` exits 0.

## Step 5 — copy the templates, merging collisions
<!-- step: copy -->

**Check:** `ls .github/workflows .github/actions` (on Windows,
`Get-ChildItem .github\workflows, .github\actions`) shows the
files below.

**Do:** copy what Steps 1 and 2 said you need. For each
collision, open both files and move the loop's job into a new
file with a distinct name (`nexus-march.yml`), never overwrite
yours.

```bash
mkdir -p .github/workflows .github/actions/setup scripts/cloud scripts/pr
# cp -n never replaces a file you have: a collision stays yours, merged by hand
cp -n ../nexus/templates/.github/workflows/march.yml      .github/workflows/march.yml
cp -n ../nexus/templates/.github/workflows/heartbeat.yml  .github/workflows/heartbeat.yml
cp -n ../nexus/templates/.github/actions/setup/action.yml .github/actions/setup/action.yml
cp -n ../nexus/templates/.github/CLOUD_LOOP.md            .github/CLOUD_LOOP.md
cp -n ../nexus/templates/scripts/cloud/quota.mjs          scripts/cloud/quota.mjs
cp -n ../nexus/templates/scripts/cloud/lost.mjs           scripts/cloud/lost.mjs
cp -n ../nexus/templates/scripts/cloud/idle.mjs           scripts/cloud/idle.mjs
# the night shift, if you run /digest:
cp -n ../nexus/templates/.github/workflows/night.yml      .github/workflows/night.yml
# pull-request mode:
cp -n ../nexus/templates/scripts/cloud/tick.mjs           scripts/cloud/tick.mjs
# only when Step 2 said no:
cp -n ../nexus/templates/.github/workflows/pr-flow.yml    .github/workflows/pr-flow.yml
cp -n ../nexus/templates/.github/workflows/pr-resolve.yml .github/workflows/pr-resolve.yml
cp -n ../nexus/templates/scripts/pr/resolve.mjs           scripts/pr/resolve.mjs
```

```powershell
New-Item -ItemType Directory -Force .github\workflows, .github\actions\setup, scripts\cloud, scripts\pr | Out-Null
# Test-Path first: a collision stays yours, merged by hand
if (-not (Test-Path .github\workflows\march.yml)) { Copy-Item ..\nexus\templates\.github\workflows\march.yml .github\workflows\march.yml }
if (-not (Test-Path .github\workflows\heartbeat.yml)) { Copy-Item ..\nexus\templates\.github\workflows\heartbeat.yml .github\workflows\heartbeat.yml }
if (-not (Test-Path .github\actions\setup\action.yml)) { Copy-Item ..\nexus\templates\.github\actions\setup\action.yml .github\actions\setup\action.yml }
if (-not (Test-Path .github\CLOUD_LOOP.md)) { Copy-Item ..\nexus\templates\.github\CLOUD_LOOP.md .github\CLOUD_LOOP.md }
if (-not (Test-Path scripts\cloud\quota.mjs)) { Copy-Item ..\nexus\templates\scripts\cloud\quota.mjs scripts\cloud\quota.mjs }
if (-not (Test-Path scripts\cloud\lost.mjs)) { Copy-Item ..\nexus\templates\scripts\cloud\lost.mjs scripts\cloud\lost.mjs }
if (-not (Test-Path scripts\cloud\idle.mjs)) { Copy-Item ..\nexus\templates\scripts\cloud\idle.mjs scripts\cloud\idle.mjs }
# the night shift, if you run /digest:
if (-not (Test-Path .github\workflows\night.yml)) { Copy-Item ..\nexus\templates\.github\workflows\night.yml .github\workflows\night.yml }
# pull-request mode:
if (-not (Test-Path scripts\cloud\tick.mjs)) { Copy-Item ..\nexus\templates\scripts\cloud\tick.mjs scripts\cloud\tick.mjs }
# only when Step 2 said no:
if (-not (Test-Path .github\workflows\pr-flow.yml)) { Copy-Item ..\nexus\templates\.github\workflows\pr-flow.yml .github\workflows\pr-flow.yml }
if (-not (Test-Path .github\workflows\pr-resolve.yml)) { Copy-Item ..\nexus\templates\.github\workflows\pr-resolve.yml .github\workflows\pr-resolve.yml }
if (-not (Test-Path scripts\pr\resolve.mjs)) { Copy-Item ..\nexus\templates\scripts\pr\resolve.mjs scripts\pr\resolve.mjs }
```

Then, in the copies:

- **The toolchain.** Replace the install steps in
  `.github/actions/setup/action.yml` with your CI's own (copy
  them from your existing check workflow: the same Node, the
  same package manager, the same browser install).
- **The gate.** Replace `pnpm verify` in both prompts of
  `march.yml` with your gate command, word for word as
  `agents.md` names it.
- **Placeholders.** `<PROJECT>`, `<DEFAULT_BRANCH>` and
  `<PROJECT_PKG_PREFIX>` as in
  [`cloud-loop.md`](./cloud-loop.md) Step 2, in
  `pr-resolve.yml` too (its `branches: [<DEFAULT_BRANCH>]`).
- **Your PR bot.** If it acts on every PR, decide whether the
  loop's `nexus/*` PRs get the same treatment (usually yes).

**Done when:** `node scripts/workflow-lint.mjs` exits 0 with
the new files in place, and no file of yours was overwritten.

## Step 6 — secrets, the app, and Actions permissions
<!-- step: secrets -->

**Check:**

```bash
gh secret list
gh variable list
gh api repos/<REPO_SLUG>/actions/permissions/workflow
```

```powershell
gh secret list
gh variable list
gh api repos/<REPO_SLUG>/actions/permissions/workflow
```

**Do:**

1. `CLAUDE_CODE_OAUTH_TOKEN`: `claude setup-token` locally,
   then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` and paste it.
2. **Owner mode:** install the Claude Code GitHub App
   (https://github.com/apps/claude) on the repo; the owner job
   runs the action, which needs it. Its pushes need a token
   that may bypass the default branch's ruleset (Step 7).
3. **Pull-request mode, recommended:** a GitHub App of your
   own (Contents and Pull requests read/write, this repo only),
   so the loop's PRs run their checks:
   `gh variable set NEXUS_APP_ID --body <app id>` and
   `gh secret set NEXUS_APP_PRIVATE_KEY < key.pem`
   (PowerShell: `Get-Content key.pem -Raw | gh secret set
   NEXUS_APP_PRIVATE_KEY`). Without one, let Actions open PRs,
   keeping your workflows' default token permission as it is
   (setting it to read here would break a workflow of yours
   that relies on the write default):

```bash
keep=$(gh api repos/<REPO_SLUG>/actions/permissions/workflow --jq .default_workflow_permissions)
gh api --method PUT repos/<REPO_SLUG>/actions/permissions/workflow \
  -f default_workflow_permissions="$keep" -F can_approve_pull_request_reviews=true
```

```powershell
$keep = gh api repos/<REPO_SLUG>/actions/permissions/workflow --jq .default_workflow_permissions
gh api --method PUT repos/<REPO_SLUG>/actions/permissions/workflow `
  -f default_workflow_permissions=$keep -F can_approve_pull_request_reviews=true
```

**Done when:** `gh secret list` shows
`CLAUDE_CODE_OAUTH_TOKEN` (and `NEXUS_APP_PRIVATE_KEY` with
`NEXUS_APP_ID` set, if you made the app), and no secret
appears in a workflow's `run-name` or a job's `env:` (Step 4's
lint).

## Step 7 — rulesets
<!-- step: rulesets -->

**Check:** `gh api repos/<REPO_SLUG>/rulesets --jq '.[].name'`
lists one ruleset on the default branch and one on `claims`.

**Do:** if you have none, post the two in
[`owner-mode.md`](./owner-mode.md) Step 3. If you have yours,
check three things against them:

- The default branch requires a PR. In owner mode, the loop's
  token is a bypass actor (the owner's own token, or your app
  added to `bypass_actors`); in pull-request mode, nothing of
  the loop's needs a bypass.
- `claims` refuses force pushes and deletions only (open
  claims), so `pick`, `land`, `release` and `pr-flow` can
  write it with the workflow's token. Protected claims: add
  the GitHub Actions integration or your app as a bypass
  actor, or every tick's claim fails with "claims are
  protected: ask the owner".
- `nexus/*` branches aren't blocked by a branch-name rule of
  yours.

**Done when:** both rulesets exist and the loop's writes are
allowed by them.

## Step 8 — land the files, schedule off
<!-- step: land -->

**Check:** `git status` is clean and `gh workflow list` shows
`march` as `disabled_manually` after the push.

**Do:** run your gate, commit the files from a local session
(a cloud token usually lacks the scope to push workflow
files), push per your own owner mode, then disable the
schedule until the first tick is watched:

```bash
git add .github scripts
git commit -m "ci: add the cloud loop"
git push origin HEAD
gh workflow disable march
```

```powershell
git add .github scripts
git commit -m "ci: add the cloud loop"
git push origin HEAD
gh workflow disable march
```

In pull-request mode for your own commits, that push is a
branch and the files land when its PR merges; disable the
workflow after the merge.

**Done when:** the files are on the default branch and the
schedule is off.

## Step 9 — turn it on
<!-- step: enable -->

**Check:** `gh workflow list` shows `march` and `heartbeat`
`active`.

**Do:**

```bash
gh workflow enable march
gh workflow enable heartbeat
gh variable set NEXUS_HEARTBEAT_WATCH --body "march night"
```

```powershell
gh workflow enable march
gh workflow enable heartbeat
gh variable set NEXUS_HEARTBEAT_WATCH --body "march night"
```

Add any of your own long-running writers to the heartbeat's
watch list (space-separated workflow names), and your CI
gate's workflow name too: a watched gate whose newest push run
on the default branch failed opens one issue the loop's triage
routes back into its queue. Then add
`node scripts/workflow-lint.mjs` to your gate so the next
workflow edit keeps the rules.

**Done when:** the next scheduled tick runs on its own, and
the heartbeat's first run is green.

## Step 10 — the first tick, watched
<!-- step: first-tick -->

**Check:**

```bash
gh run list --workflow march --json databaseId,status,conclusion,createdAt --limit 5
```

```powershell
gh run list --workflow march --json databaseId,status,conclusion,createdAt --limit 5
```

**Do:** dispatch one tick, then watch it. In pull-request
mode, name a small chunk to keep the first PR short:

```bash
gh workflow run march -f chunk=<chunk id>
gh run watch
```

```powershell
gh workflow run march -f chunk=<chunk id>
gh run watch
```

Poll the run list every few seconds rather than trusting a
clock: a run that stays `queued` for two minutes is waiting on
a runner or the concurrency group, not working.

**Done when:**

- **Owner mode:** the default branch has a commit with the
  `Cloud-Run:` trailer, and `node scripts/claims.mjs list`
  shows no leftover claim from `cloud-<run id>`.
- **Pull-request mode:** a PR from `nexus/<run id>` exists,
  `node scripts/claims.mjs list` shows its chunk with that PR,
  and closing the PR (or merging it) makes the claim leave
  within a minute (`pr-flow`, or your own bot).

## Rolling it back

Nothing here touches your existing workflows' files, so a
rollback is switching the loop off:

```bash
gh workflow disable march
gh workflow disable night
gh workflow disable heartbeat
gh variable delete NEXUS_LOOP_MODE
node scripts/claims.mjs audit --release
```

```powershell
gh workflow disable march
gh workflow disable night
gh workflow disable heartbeat
gh variable delete NEXUS_LOOP_MODE
node scripts/claims.mjs audit --release
```

Open loop PRs stay open for you to merge or close; `pr-flow`
releases their claims either way.

## See also

- [`cloud-loop.md`](./cloud-loop.md): the cloud loop from
  scratch, the costs, the schedule, the exit-hang failure.
- [`owner-mode.md`](./owner-mode.md): how work lands, the
  rulesets.
- [`../customization/claims.md`](../customization/claims.md):
  the claims module the pull-request mode runs on.
