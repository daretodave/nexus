# The cloud loop (nexus on nexus)

> Operator's guide for `workflows/march.yml` — the ouroboros.
> The kit that turns repos into self-shipping projects is
> itself a self-shipping project: four times a day, a cloud
> tick reads `plan/`, dispatches one verb, runs the verify
> gate, and pushes. This file is the 2-minute operator manual;
> the full generic story lives in
> [`playbooks/cloud-loop.md`](../playbooks/cloud-loop.md) and
> the walk-away rigging in
> [`playbooks/hands-off.md`](../playbooks/hands-off.md).

## Setup (one app install + two secrets)

1. **Install the Claude Code GitHub App** on this repo:
   https://github.com/apps/claude → Install → select
   `daretodave/nexus`. The action exchanges its OIDC token for
   an app token; without the app the run dies at
   `401 — Claude Code is not installed on this repository`
   before Anthropic auth ever runs. (The kit knew this — see
   the template's setup step 1 and the bootstrap handoff; this
   manual learned it from crash issue #1.)
2. `claude setup-token` → copy the OAuth token → Repo →
   Settings → Secrets and variables → Actions → new secret
   `CLAUDE_CODE_OAUTH_TOKEN`.
3. `ACTIONS_PAT` — a fine-grained PAT (Contents + Issues +
   Workflows: read/write on this repo). Workflows was added
   2026-08-23 so cloud ticks can ship `.github/workflows/`
   edits themselves; grant nothing beyond these three — this
   token is what a prompt-injected tick runs with, so no
   Secrets/Webhooks/Variables. In practice the scope grant
   alone hasn't been enough — see "When something breaks"
   below. This repo runs **user-author mode**: cloud commits
   author as `nexus` (the PAT account's noreply email), never
   `github-actions[bot]`. Identity rides `GIT_AUTHOR_*` /
   `GIT_COMMITTER_*` env vars on the action step — NOT
   `git config`, which the action's own internal config step
   silently overrides.
4. Validate once by hand: `gh workflow run march`, watch the
   run end green, read the closing `/oversight audit` block.

That's all. The kit's gate needs no other secrets (zero
dependencies, no deploy provider); the CLI's install needs
none either. If `ACTIONS_PAT` expires or
is removed, checkout fails red on the next tick — re-mint and
re-set, nothing else to repair. The crash-alarm issue still
files even then: it authenticates with the run's own
`GITHUB_TOKEN`, not `ACTIONS_PAT`, so the alarm never shares
the failure mode of the thing it watches.

## Daily operation

- **Cadence:** the `eager` preset: every 3h at :17 UTC
  (`17 */3 * * *`, off the busy top of the hour), chained
  ticks up to 3 deep while work is ready, behind the quota
  governor at `NEXUS_QUOTA_MAX` 0.80 (nexus yields the shared
  quota first), plus manual `gh workflow run march` whenever
  curious. Revert: `gh variable set NEXUS_CADENCE --body
  steady` when realized runs fall under 6 a day after 48h, or
  utilization passes 0.80 while another loop is starved.
- **Cadence preset:** the first step, Cadence
  (`templates/scripts/cloud/cadence.mjs`, run in place), turns
  the repo variable `NEXUS_CADENCE` (`calm | steady | eager |
  sprint | off`) into the ceiling, chain max and idle backoff
  at run time, and `heartbeat.yml` into the march flatline
  hours; a per-field variable (`NEXUS_DAILY_CEILING`,
  `NEXUS_CHAIN_MAX`, `NEXUS_IDLE_BACKOFF`,
  `NEXUS_HEARTBEAT_HOURS`) overrides its preset. Unset, the
  literals below stand and nothing chains. The cron line is
  the file's: `node templates/scripts/cloud/cadence.mjs apply
  <preset> --march .github/workflows/march.yml --heartbeat
  .github/workflows/heartbeat.yml --write` (a local session:
  the cloud token cannot push a workflow).
- **Ceiling:** 20 weighted points per 24h, counted by the
  `Cloud-Run:` trailer. The count is weighted, not flat: a
  chunk-shipping commit (one that adds a line to
  `plan/ARCHIVE.md`) costs 3, a churn commit
  (`/iterate`, `/critique`, `/triage`, `/digest`) costs 1.
  Local commits don't count.
- **Dispatch ceiling:** the same step stops a
  `workflow_dispatch` run once `NEXUS_DISPATCH_MAX` (12)
  dispatch runs of any workflow started in the repository in
  24h (`quota.mjs dispatch`; the job holds `actions: write`,
  read for this count and write for the chain step).
  It bounds a tick that dispatches runs itself, nudges and
  chained runs; scheduled ticks never skip on it.
- **Run name and reason:** every run is titled `march <verb>
  <reason>`; the `reason` input (`issue-<n>`, `chain`, empty by
  hand) reaches the gates through `env:` only. An issue a tick
  opens carries a `Cloud-Run: <run url>` body line and no
  urgent label (prompt rule 9), so it never starts a tick.
- **Event ticks:** `nudge.yml` (the template's, running
  `templates/scripts/cloud/nudge-check.mjs` in place) turns a
  collaborator's issue opened with `bug` or `loop:do`, or any
  issue the owner labels `loop:do`, into one march run titled
  `issue-<n>`, unless a march or night run is pending, a tick
  for that issue started in the last hour, or
  `NEXUS_EVENT_MAX` (6) event ticks ran in 24h. Off until
  `NEXUS_SUPPORT` is set (nexus: `fix-all`). The template's
  `CLOUD_LOOP.md` "Event ticks" has the checks.
- **Quota governor:** every march and night tick writes its
  `seven_day` utilization to the step summary and caches it
  (`templates/scripts/cloud/quota.mjs`, run in place). The
  next scheduled tick skips the model at or above
  `NEXUS_QUOTA_MAX` (0.80 here, so nexus yields first; `off`
  disables it), and every tick, support and `loop:do` ones
  included, skips at the hard ceiling of 0.97; a weekly lockout opens one `Loop paused:
  weekly quota until <ISO>` issue instead of a crash issue,
  and the first tick after the reset closes it. Only a
  labelled pause issue, or one the workflow token opened,
  counts: an outsider's issue with that title is ignored.
- **Lost to background:** in CI, `guard.mjs` denies a
  background Bash call or subagent (`NEXUS_ALLOW_BACKGROUND=1`
  lifts it), and the Lost-to-background check
  (`templates/scripts/cloud/lost.mjs`) marks a run whose result
  defers to background work with no `Cloud-Run:` commit:
  `no-op reason: lost-to-background` in the step summary.
- **Idle probe:** before the model, a scheduled tick that finds
  the repo as the last no-op left it (main's sha, open issue
  counts by label, the ready count, the newest issue update)
  after the idle backoff's scheduled no-ops (3), with nothing
  ready, exits clean (`templates/scripts/cloud/idle.mjs`, run
  in place); every `NEXUS_IDLE_WAKE_EVERY`th skip (4) runs
  anyway, and dispatched runs never skip. Every tick that lands
  nothing writes one `no-op reason: <why>` line to the step
  summary. `gh variable set NEXUS_IDLE_BACKOFF --body 0` turns
  the skip off.
- **Chained ticks:** the last step, Chain next tick
  (`templates/scripts/cloud/chain.mjs`, run in place),
  dispatches ONE next run (`-f chain=<N+1> -f reason=chain`;
  the job holds `actions: write`) when this tick landed a
  `Cloud-Run:` commit (or was lost to background work: one
  `reason=retry`) and every guard holds: `chain + 1` at or
  under the chain max, this tick's quota reading parsed
  and under `NEXUS_QUOTA_MAX`, the weighted budget + 3 at or
  under the ceiling, no march or night run queued or pending,
  not within 30 min of night's slot, and a ready chunk or an
  open `loop:do` or unlabeled issue. It fails closed, and
  writes one `chain: ...` summary line. The chain max is
  `NEXUS_CHAIN_MAX`, else the `NEXUS_CADENCE` preset's; with
  both unset it reads as 0 (no chain); spec 55.6's
  dispatch-latency probe decides whether the owner sets it to
  3. Stop: `gh variable set NEXUS_CHAIN_MAX --body 0`.
- **The CLI gate:** on Node 24, a tick that runs the model
  first installs and builds `packages/cli` (`npm ci
  --ignore-scripts && npm run build`, npm cached on its
  lockfile, about a minute). A `packages/cli` diff then ships
  only after `node scripts/verify.mjs` and `npm --prefix
  packages/cli test` (plus the build when `src/` changed) run
  green in the same log (prompt rule 10). `npm run walk`
  output under `.scratch/walk/` uploads as the `walk-<run id>`
  artifact (14 days); screenshots are never committed. Cloud
  never bumps the CLI's version or tags `cli-v*`. Off switch:
  `gh variable set NEXUS_CLI_GATE --body 0` (a failed install
  or build also turns it off for that tick); the kit's own
  gate stays zero-dependency either way.
- **Model:** `claude-sonnet-5` (set in the workflow; ids age —
  verify against current ids before changing).
- **Pause / resume:** `gh workflow disable march` /
  `gh workflow enable march`. Do this before driving the local
  loop for a session (one writer at a time).
- **Remote steering:** file an issue — that's remote `/jot`;
  the next tick's `/triage` routes it with user-source weight.

## What a tick does

`skills/march.md` dispatch: unlabeled issues → `/triage`;
critique due → `/critique` (the dry-run adoption — it runs
fully in CI); ready chunk → `/next top` (one chunk: claimed as
`cloud-<run id>`, built by a foreground builder, gated, closed
with a pending file, settled, pushed); expand due →
`/expand`; else `/iterate`. Every shipping path runs
`node scripts/verify.mjs` foreground and ends with an
`/oversight audit` briefing in the run log. The runner's
checkout gets an untracked `.owner` first, so the tick claims,
settles and lands as the owner (`NEXUS_NO_HOOK_CHECK=1` lets it
claim, since the action may not load project hooks; nexus's
cloud loop is owner mode; adopters can run theirs as pull
requests:
[`templates/.github/CLOUD_LOOP.md`](../templates/.github/CLOUD_LOOP.md)).

## Contributor pull requests

A contributor lands each chunk as a pull request, its claim
carrying the PR number (`npm run claims -- pr <id> <n>`).
`workflows/pr-flow.yml` (the template, byte for byte) runs
when any PR closes, merged or not, and runs
`node scripts/claims.mjs prune` from main with the workflow's
own token: every claim whose PR is closed leaves the `claims`
branch. No model and no secret. The owner settles the merged
PR's `plan/pending/` file afterwards. nexus carries no
`pr-resolve.yml`: the loop runs in owner mode and contributor
PRs are rare, so a conflicted one is rebased by hand.

## The trailer carve-out

`agents.md` rule 2 (plain commit bodies) has exactly one
exception: cloud commits end with
`Cloud-Run: <run-url>`. It's how the ceiling distinguishes
cloud volume from local work. Nothing else — no
`Co-Authored-By`, no other trailers.

## When something breaks

- **`401 — Claude Code is not installed on this repository`**
  in the app-token exchange — the GitHub App isn't installed
  (setup step 1). Install it, `gh run rerun`, done.
- **Green run, no commit, transcript full of `This command
  requires approval`** — the permission wall: the action ran
  without `permissionMode: bypassPermissions` (or a workflow
  edit dropped it) and starved. See the `claude_args` comment
  in `workflows/march.yml` and
  [`customization/claude-code.md`](../customization/claude-code.md)
  for why bypass-on-a-disposable-runner is the sanctioned
  posture (where hooks load, the guard enforces the hard rules
  in every mode; whether the action loads them is the hook
  probe's question, below).
- **`Cloud march tick crashed` issue appears** — read the run
  link. One-off infra flake → `gh run rerun`. Repeated →
  disable and debug locally per
  [`playbooks/recovery.md`](../playbooks/recovery.md) §H.
- **A run wedges `in_progress`** — cancel it; if the log
  stalls right after a green gate, that's the post-result exit
  hang: the gate was backgrounded, which agents.md rule 3
  forbids. Full story in
  [`playbooks/cloud-loop.md`](../playbooks/cloud-loop.md).
- **`git push` rejected on a `.github/workflows/*.yml` edit**
  despite `ACTIONS_PAT`'s Workflows scope — confirmed three
  times (phase 20, issues `#40`, `#49` in `plan/AUDIT.md`):
  the Claude Code Action's own GitHub App installation token
  overrides the configured `ACTIONS_PAT` credential for
  workflow-file pushes specifically, regardless of the PAT's
  actual scope. Apply the change from a local `/oversight`
  session instead, which pushes with normal repo-write
  credentials.
- **Green run, no commit, and the log shows a background or
  async agent launch just before the end** — a subagent was
  dispatched without `run_in_background: false`. The job is
  single-shot: the tick's turn ended, the job exited clean, and
  the builder's work never landed. The step summary reads
  `no-op reason: lost-to-background`. Re-run; the prompt's
  rule 5 and the guard's background rule keep every dispatch
  foreground (a workflow edit may have dropped the one, a
  settings edit the other).
- **Ticks no-op forever** — the step summary's `no-op reason:`
  line names why. The plan may be out of ready chunks
  (or every one is in the Held lane) and the queues drained (a good problem: run `/oversight`
  locally and promote candidates), or GitHub paused the cron
  after 60 days without repo activity (push anything or re-run
  manually to revive).
- **Do the hooks load here? Do dispatched runs start late?** —
  answered 2026-10-25 (decision D8): hooks load, a dispatched
  run starts within seconds, and a scheduled one starts about
  4h after its slot (p50; p90 5.3h). To ask again: `gh workflow
  run march.yml -f hook_probe=true` runs a normal tick whose
  Hook probe report step prints `HOOK_PROBE_RESULT=hooks loaded
  (...)` or `HOOK_PROBE_RESULT=no hook call reached guard.mjs`;
  for latency, add a one-step `workflow_dispatch`-only
  `probe.yml`, then `node scripts/cloud/probe-latency.mjs
  dispatch` (ten runs, 30 minutes apart) and `... report
  --hook-run <run id>`. Delete `probe.yml` after: its
  dispatches count toward NEXUS_DISPATCH_MAX.
- **A v1 adopter still burns the quota ungated?** — `node
  scripts/cloud/patch-v1.mjs --repo <fresh clone of its
  origin>` (spec 55.10, owner-run per repo) prints the diff
  that adds the quota cache, gate, read and pause steps to its
  `march.yml` and `night.yml`, quiets its issue steps on a
  lockout, and moves each cron minute off :00 (hours kept).
  `--write` applies it and copies `quota.mjs` in; it never
  commits or pushes, refuses a dirty workflow file, and
  refuses any workflow-lint problem it would add. Never point
  it at a working checkout.

## The other shapes

The dispatcher is one of three loops on this repo (the full
genus: [`concepts/loop-shapes.md`](../concepts/loop-shapes.md)):

- **`night.yml` — the night shift.** Daily at 10:30 UTC, one
  `/digest` tick writes
  [`plan/DIGEST.md`](../plan/DIGEST.md) — the morning
  briefing: what shipped (including no-op ticks), queues,
  what needs you, today's intent, and any gate-tuning
  proposals (filed as candidates, never applied). Read it
  with coffee instead of reading run logs.
- **`heartbeat.yml` — the immune system.** Every 6h, no
  model: cancels runs wedged past 2h (unblocking the shared
  concurrency group); opens one deduped issue per workflow
  when march, night or heartbeat itself is not `active`
  (GitHub's 60-day pause above, or a human's
  `gh workflow disable`), naming the state and
  `gh workflow enable <name>`; and opens a deduped issue
  when an active march has no successful tick in 14h or an
  active night none in 48h. A success is not a cadence: when
  march's schedule events in the last 72h fall under 40% of
  the slots its cron promised (`cadence.mjs realized`;
  chains, nudges and dispatches never count), one deduped
  `Heartbeat: march realized cadence below 40%` issue opens.
  It also watches `cli-ci` (the
  default `NEXUS_HEARTBEAT_WATCH` is `march night cli-ci`):
  when the newest push run of a watched gate on main failed,
  one deduped `Heartbeat: cli-ci is red on main` issue opens,
  and `/triage` routes it into `plan/AUDIT.md` as a bug the
  loop fixes. Liveness is not motion, so it also runs the
  motion pulse (`scripts/plan/motion.mjs`): when the last
  full week shipped under `Motion floor` (feat/fix/content
  commits and chunk closes against the 4-week baseline) it
  opens one `Heartbeat: motion stalled` issue (`loop:opened`,
  `loop:stall`) and closes it when a week recovers; nexus's
  `stall_action: promote` has the next tick promote one aged
  candidate behind its Held veto window. It never re-enables a workflow
  and never writes to the repo; it only tells on the others.
- **The concierge lane.** Two remote controls: label any
  issue `loop:do` and the next tick triages it straight to
  the top with a priority bump; or run a specific verb from
  anywhere — `gh workflow run march -f verb=critique`.

march's writers share one concurrency group. The night shift
has its own (a digest pending behind a long tick was cancelled
by march's next cron); it writes only its own files and lands
by rebase. The heartbeat never writes.

## Reviewing the loop's work

The commit log is the deliverable. Cloud commits carry the
run-URL trailer; each phase has a mirror issue that opened
when work started and closed on the shipping commit. The
`/oversight audit` block at the end of every run log is the
instrument panel — queues, blocked rows, flags — skimmable
from a phone.
