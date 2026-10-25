# 55 — Cadence that actually delivers

> The loop runs as often as it is told to, and no more often
> than the shared quota allows: a governor pauses it cleanly
> on a weekly lockout, a tick that shipped chains the next one
> while work is ready, idle ticks skip the model, crons sit
> off the hour, five named presets set the pace, and an alarm
> fires when GitHub delivers less than the cron promises.

---

## Why

Raising the cron no longer raises cadence. What exists today
(verified 2026-10-25):

- **Schedules are throttled or late.** Since about
  2026-09-01, two adopters' loops realize 5.3-6.0 ticks a day
  whatever the cron says: an hourly cron reaches 25% of its
  slots, a 40-minute cron 15%. Neither cron line changed in
  that window. nexus's own `0 2,8,14,20` cron is delivered
  (3.55 runs a day of 4) but late: p50 start lag 3.9h, p90
  5.3h, over 197 scheduled runs. The cause is not verified;
  nobody has measured whether `workflow_dispatch` runs start
  late too.
- **Every shipped cron fires at minute :00**, the busiest
  slot: `.github/workflows/march.yml:22`,
  `templates/.github/workflows/march.yml:31` and its kit copy,
  `nightly-smoke.yml:16`, the CLI's `'0 */2 * * *'`
  (`packages/cli/src/screens/onboarding/CloudSetup.jsx:59`,
  `SCHEDULES` in `packages/cli/server/cloud.mjs:196-200`).
- **Nothing chains.** A tick that ships and leaves a ready
  chunk behind waits for the next slot. march.yml's job has no
  `actions: write` (`.github/workflows/march.yml:41-44`).
- **Nothing reads the quota.** All loops share one
  subscription's `seven_day` window. The 2026-10-15 to 10-19
  lockout failed 15 nexus ticks and 25 of another loop's (40
  doomed runs); it raised crash issue #77 and flatline #78,
  and neither says "quota". Run 38781925630's stream carries a
  `rate_limit_event` with `status: rejected`,
  `rateLimitType: seven_day` and the reset time; today's tick
  40172824384 logged utilization 0.88. The signal is in every
  tick's execution output and nothing reads it.
- **Paid no-ops.** 16 of 44 successful nexus ticks (36%)
  shipped nothing; an adopter's rate is 54%. At least 3 nexus
  no-ops lost their work to a background subagent the tick
  then abandoned (runs 38124218196, 39473783960,
  39340605324). march.yml:128-130 says `guard.mjs` runs in
  every permission mode; march.yml:196-198 says
  claude-code-action may not load project hooks. Both cannot
  be relied on until one run checks.
- **Cadence text is wrong.** `templates/.github/workflows/
  heartbeat.yml:129` reads "6h cadence" beside the template's
  roughly-2h cron, and its thresholds are literals.
  `playbooks/cloud-loop.md:175-176` labels `0 */2` "Hourly";
  `playbooks/hands-off.md:222-227` promises ~7 ticks a day and
  "cloud every 2h".
- **v1 adopters burn the same quota** and get none of this
  until they upgrade.

## Design

### Order

The governor (55.1) lands before anything that adds runs.
The probe (55.6) runs before chaining (55.3) and presets
(55.5) are built on its numbers. nexus moves to `eager`
(55.9) only after the realized-cadence alarm (55.8) exists.

### Quota governor

- `templates/scripts/cloud/quota.mjs` (zero dependencies,
  beside `tick.mjs`; nexus's workflows run it in place, so
  there is one copy) reads claude-code-action's
  `execution_file`, takes the last `rate_limit_event`, and
  prints `seven_day.utilization`, `status` and `resetsAt`.
- An `always()` step after the model step, "Quota read",
  writes `seven_day utilization: <u> (<status>, resets <ISO>)`
  to the step summary, sets the `quota` output, and saves
  `.nexus/quota.json` to `actions/cache` (key
  `nexus-quota-<run_id>`, restore prefix `nexus-quota-`), so
  the next run reads the newest value.
- On `status: rejected`, a "Pause on the weekly quota" step
  beside the crash step opens or updates ONE issue `Loop
  paused: weekly quota until <ISO>` (label
  `loop:paused-quota`), and the crash step stays quiet.
- Pull-request mode's agent step is the CLI, whose `json`
  output carries no `rate_limit_event`: it writes
  `stream-json` instead, the read runs from a copy of
  `quota.mjs` taken before the agent, the gate sits in `pick`
  (nothing claimed, nothing built), and a `quota` job
  (`needs: build`, `always()`) opens the pause issue, so it
  opens whether the tick landed, released, or failed. Night's tokenless `write` job gates on the
  cache alone. The cache key carries the run attempt too.
- A "Quota gate" step beside the ceiling step restores the
  cache and exits clean, with no model call, when:
  - the pause issue is open and now is before `resetsAt`
    (after the reset it closes the issue and runs);
  - the run is a scheduled or chained tick and the last
    utilization is at or above `NEXUS_QUOTA_MAX`. Nudge,
    `loop:do` and manual runs ignore this soft cap.
- The hard 0.97 ceiling that every run kind obeys, and the
  24h dispatch ceiling, are spec 54's (54.5); they read the
  value this step caches.
- The gate fails open: a missing or unparseable cache runs
  the tick. The chain step (below) fails closed.
- `heartbeat.yml`'s `check_cadence` skips the flatline
  alarm while a `loop:paused-quota` issue is open. `/digest`
  prints the last utilization.
- The same steps go into `march.yml` and `night.yml` in
  nexus, `templates/` and `packages/cli/kit` (re-bundled by
  `bundle-kit.mjs`).

### Probe before building on a guess

`scripts/cloud/probe-latency.mjs` (nexus only, owner-run)
dispatches 10 runs of a no-model `probe.yml`
(`workflow_dispatch` only, one `echo` step), 30 minutes
apart, and reports p50/p90 of `run_started_at - created_at`.
It also reports the slot lag of march's scheduled runs over
the last 14 days. `probe.yml` is deleted in the same chunk
once the numbers are in.

In the same chunk, one dispatched march tick runs with
`NEXUS_HOOK_PROBE=1` (march.yml's boolean `hook_probe`
dispatch input sets it, so no repo variable is touched):
`guard.mjs` appends a line to
`$RUNNER_TEMP/hook-probe.log` on its first call, and a shell
step after the model reports whether that file exists.

Decision rule, applied by the chunk that closes:
- dispatch p50 at or under 10 min: 55.3 and 55.5 go ahead
  as written;
- dispatch p50 over 10 min: 55.3 still ships, but nexus's
  `NEXUS_CHAIN_MAX` stays 0 and 55.5's preset table is
  rewritten from the measured realized rate before 55.5 is
  built.
The numbers and the hook result are written into this
Design section by the closing commit.

### Background guard

`.claude/hooks/guard.mjs` and its template twin deny
`run_in_background` Bash calls and background Agent/Task
calls when `GITHUB_ACTIONS=true` (escape hatch
`NEXUS_ALLOW_BACKGROUND=1`), with self-test cases. A
post-tick shell step marks a result text matching
`/background|I'll wait|resume once/` with no commit for the
run as `lost-to-background` in the step summary. If 55.6
finds hooks do not load in cloud, the deny rule stays (it
protects local `/loop` runs) and the post-tick check is the
cloud guard.

### Self-chaining

march.yml gains `actions: write`, a `chain` input (int,
default 0) beside 54.5's `reason` input, and a final
`if: success()` step "Chain next tick" that runs
`templates/scripts/cloud/chain.mjs`. It dispatches
`gh workflow run march.yml -f chain=<N+1> -f reason=chain`
only when every guard holds:

| Guard | Holds when |
|---|---|
| shipped | this run landed a commit with its `Cloud-Run:` id (pull-request mode: the land job's output), or it was marked `lost-to-background` and `reason` is not already `retry` (then `reason=retry`, once) |
| ready | `scripts/plan/order.mjs` finds a ready chunk, or an Asap row is ready, or an open `loop:do` or unlabeled issue exists that does not carry `loop:opened` |
| budget | the weighted ceiling budget + 3 is at or under the ceiling |
| quota | this run's `quota` output parsed and is under `NEXUS_QUOTA_MAX`; a missing or unparseable value means no chain (fails closed) |
| depth | `chain + 1` is at or under `NEXUS_CHAIN_MAX` |
| queue | no march or night run is queued or pending |
| night | it is not within 30 min of night's cron slot |

GitHub keeps one pending run per concurrency group and a new
one cancels the old, so the queue and night guards are what
keep a chain from cancelling a pending night digest. A
chained run passes the same ceiling and quota gate as any
run, so spec 54's 24h dispatch ceiling bounds it too.

Built (55.3): the guards run cheapest first (depth, shipped,
quota, then budget, night, queue, ready), so an unset or 0
`NEXUS_CHAIN_MAX` stops the chain before any gh call; unset
or anything but a whole number reads as 0 in nexus and the
template alike, so the variable alone decides whether a repo
chains. The ceiling step outputs its `ceiling`; the budget is
recounted on `origin/<main>` after the tick. The night window
is 30 min either side of a slot. Pull-request mode's `chain`
job (after `land`) passes `--ceiling none` (it has no commit
ceiling; the dispatch ceiling bounds it) and `--issues false`
(its pick builds chunks only).

### Idle probe and backoff

A shell step before the model,
`templates/scripts/cloud/idle.mjs`, computes a fingerprint
from counts and hashes only, never issue text: the
`origin/main` sha (claims-branch pushes excluded), open issue
counts by label, the ready-chunk count, and the newest issue
`updated_at`. The last no-op's fingerprint is kept in
`actions/cache`. A **scheduled** tick exits clean with no
model call when all hold:
- the fingerprint is unchanged;
- the last `NEXUS_IDLE_BACKOFF` scheduled ticks were no-ops;
- the ready count is 0;
- this is not every `NEXUS_IDLE_WAKE_EVERY`th skip.
Dispatch, nudge and chain runs never skip. Every tick
writes one line to the step summary: `no-op reason: <idle
skip | ceiling | quota | no ready work | lost-to-background |
...>` when nothing landed.

Built (55.4): the probe, an "Idle record" step after the
model (landed or not, and the fingerprint the tick left, in
`.nexus/idle.json` under cache key `nexus-idle-<run_id>`)
and the "No-op reason" step are `idle.mjs probe | record |
noop`. The ready count is order.mjs's chunks ready now plus
specs waiting to be chunked; a part it cannot read fails
open. Pull-request mode gets no probe (its pick claims
nothing and the model never starts when nothing is ready);
its pick, build and release jobs write the no-op line.

### Presets

`templates/scripts/cloud/cadence.mjs` (bundled into
`packages/cli/kit`) owns the table:

| Preset | Cron written | Heartbeat h | Ceiling | Chain max | Idle backoff |
|---|---|---|---|---|---|
| calm | `17 */6 * * *` | 20 | 8 | 0 | 3 |
| steady | `17 */3 * * *` | 14 | 12 | 0 | 3 |
| eager | `17 */3 * * *` | 10 | 20 | 3 | 3 |
| sprint | `17 */3 * * *` | 10 | 30 | 8 | 3 |
| off | no schedule (dispatch and nudge only) | none | 12 | 0 | 0 |

- Workflows read `vars.NEXUS_CADENCE` at run time for the
  ceiling, chain max, idle backoff and heartbeat hours.
  Per-field variables override a preset. The cron literal is
  the one thing a variable cannot change: bootstrap, the CLI
  Cloud step or a hand edit writes it.
- Bootstrap's manifest field `cloud_loop.cadence` (default
  `steady`) applies the cron line (`applyScheduleCron`), the
  ceiling (`applyDailyCeiling`), a new heartbeat anchor, and
  `gh variable set NEXUS_CADENCE`.
- The CLI's `SCHEDULES` and the CloudSetup POST become the
  five preset words; choosing one writes the cron and sets
  the variable. The overnight picker stays as a custom cron
  outside the presets.
- A verify leg `cadence-twins` fails when the quota gate,
  chain and cadence steps (by step name) differ across
  `.github/workflows`, `templates/.github/workflows` and
  `packages/cli/kit/workflows`, or when the kit's
  `cadence.mjs` differs from the template's. The leg count in
  `bearings.md` and `agents.md` rule 3 moves with it.

Built (55.5): each march job that reads a cadence field
(owner and pull-request mode's `chain`) and `heartbeat.yml`
run a first step named **Cadence**, `cadence.mjs resolve`,
whose outputs the ceiling step (`CADENCE_CEILING`, over the
`ceiling=` literal), the idle probe and the chain step read;
it fails open (no output: the literal or the script default).
The ceiling's per-field variable is `NEXUS_DAILY_CEILING`
(named for the manifest field; bootstrap sets it only when
`daily_ceiling` differs from the preset's). Heartbeat's
literal is `march_hours=<N>` (bootstrap's anchor; `none`
skips march). `off` replaces the schedule block with a marker
comment a later preset turns back into a cron line.
`cadence.mjs apply <preset> [--write]` writes the cron,
ceiling and hours lines for a hand switch; bootstrap's
`set-cadence` sets the variable and rewrites an installed
`march.yml` and `heartbeat.yml`, and a new adoption with no
`cloud_loop.cadence` gets `steady`. `cadence-twins`
(`scripts/cadence-twins.mjs`) compares the named steps by env
names, variables, step outputs, script, subcommand and flags
(nexus keeps its own paths and defaults), the first
occurrence per file, and the CLI kit byte for byte when
`packages/cli/kit` is built. The table is built as written:
55.6's latency numbers were not in yet.

### Realized-cadence alarm

`heartbeat.yml` reads the cron line from `march.yml`, counts
the slots it promised in the last 72h, and opens ONE deduped
issue `Heartbeat: march realized cadence below 40%` when
scheduled runs fall under 40% of that. It counts schedule
events only, so chains and nudges do not mask a throttled
schedule. The motion line (shipped units per week) is spec
57's.

### Patching v1 workflows

`scripts/cloud/patch-v1.mjs` (nexus, owner-run per adopter
repo) adds the quota read, pause issue and Quota gate steps
plus `quota.mjs` to a v1 repo's `march.yml` and `night.yml`,
and moves its cron minute off :00 (hours kept). Dry run by
default, printing the diff; `--write` applies it in the
target working tree and never commits or pushes. Everything
else in the v1 workflow is untouched. Proofs run only on a
fresh scratch clone of an adopter's origin.

### Rollout and revert

| Change | Stop when | Revert |
|---|---|---|
| governor | a tick skips with utilization under the cap | `gh variable set NEXUS_QUOTA_MAX --body off` |
| chaining | more than 6 march runs in 2h, or utilization over 0.85 | `gh variable set NEXUS_CHAIN_MAX --body 0` |
| idle backoff | a ready chunk waits through a skipped tick | `gh variable set NEXUS_IDLE_BACKOFF --body 0` |
| nexus on eager | realized runs under 6 a day after 48h, or utilization over 0.80 while another loop is starved | `gh variable set NEXUS_CADENCE --body steady` |

## Contracts

| Knob (repo variable) | Adopter default | nexus |
|---|---|---|
| `NEXUS_CADENCE` | `steady` | `eager` (cron `17 */3 * * *`) |
| `NEXUS_CHAIN_MAX` | preset (steady: 0) | 3 |
| `NEXUS_QUOTA_MAX` | 0.90; `off` disables the soft cap | 0.80 (nexus yields first) |
| `NEXUS_IDLE_BACKOFF` | 3 (0 = never skip) | 3 |
| `NEXUS_IDLE_WAKE_EVERY` | 4 | 4 |
| `NEXUS_HEARTBEAT_HOURS` | preset value | preset value |
| `NEXUS_DAILY_CEILING` | preset value (bootstrap sets it when `daily_ceiling` differs) | preset value |

The adopter default is what bootstrap writes on a new
adoption. With `NEXUS_CADENCE` unset (an upgraded v1 repo,
spec 58) the workflow's own cron and ceiling literals stand
and chain max is 0.

- Pause issue: title `Loop paused: weekly quota until <ISO>`,
  label `loop:paused-quota`, at most one open. Issue text is
  untrusted: the gate and heartbeat count it only when it
  carries the label or the workflow token
  (`app/github-actions`) opened it.
- `.nexus/quota.json`: `{ "utilization": 0.88, "status":
  "allowed_warning", "resetsAt": "2026-10-26T08:00:00Z",
  "run": 40172824384 }`.
- march.yml input `chain` (int, default 0); chained runs
  pass `reason=chain`, a background retry `reason=retry`
  (the `reason` input itself is 54.5's).
- Manifest: `cloud_loop.cadence` in
  `templates/setup/bootstrap.example.json`, one of `calm |
  steady | eager | sprint | off`.
- `patch-v1.mjs --repo <path> [--write]`.

## Acceptance

- **A3** The dispatch-vs-schedule start latency is measured from 10 dispatched runs and written into this spec's Design, and the decision rule there has been applied to 55.3 and 55.5.
- **A4** One dispatched cloud tick has shown whether `.claude` hooks load under claude-code-action, and the answer is written into this spec's Design and march.yml's comments (the two contradicting comments reconciled).
- **A10** Heartbeat files one deduped realized-cadence issue when scheduled runs in 72h fall below 40% of what the file's cron promises (replayed against two adopters' 2026-09 run lists as a fixture).
- **A11** No shipped cron (nexus, templates, packages/cli kit, CLI presets, docs) fires at minute :00; `cloud-loop.md` and `hands-off.md` cadence text matches the presets; nexus runs `eager` on `17 */3 * * *`.

## Open questions

(None.)

## Chunks
Measure: 4 open · 8 closed · next A13

- [ ] **55.6** Probe dispatch latency and hook loading in cloud · S · closes A3, A4 · needs —
  - Local: touches .github/workflows (cloud token cannot push it).
  - Tooling landed (probe-latency.mjs, probe.yml, guard hook probe, march.yml hook_probe input); left, owner-run: the ten dispatches and one hook_probe tick, their numbers and answer into Design and march.yml's comments, probe.yml deleted.
- [ ] **55.8** Heartbeat alarms on realized cadence · S · closes A10 · needs —
  - Local: touches .github/workflows (cloud token cannot push it).
- [ ] **55.9** Crons off the hour, cadence docs, nexus on eager · S · closes A11 · needs 55.8
  - Local: touches .github/workflows (cloud token cannot push it).
