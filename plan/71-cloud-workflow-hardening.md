# 71 — Cloud workflow hardening: the canceller skips a paused workflow, ticks wait out a transient limit

> Two ways the cloud loop fails loudly for no good reason. The
> heartbeat's first step errors out whenever a workflow it
> watches is paused, taking the rest of the watchdog with it.
> And a tick that meets a transient 429 or 529 fails the whole
> job instead of waiting. Both are workflow-file fixes, held
> back until now because no cloud tick could push one.

## Why

`heartbeat.yml`'s "Cancel wedged runs" step loops `$WATCH`
and calls `gh run list --workflow "$wf"` with no armed-state
guard. `gh` cannot resolve a workflow by name once it leaves
the `active` state, so the step fails under `bash -e` for as
long as any watched workflow is disabled (two failed
heartbeats on 2026-10-21, runs `39545645949` and
`39594489838`, during a deliberate pause). The two later
steps already read `gh workflow list --all` and skip a
non-active workflow; the first never got the guard, and its
failure means they never run. The template twin is
byte-identical, so every adopter who pauses a workflow gets
the same.

Separately, Claude Code ships `CLAUDE_CODE_RETRY_WATCHDOG`
for unattended sessions and
`CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` to cap its wait.
Neither is set in any workflow here. Two 429 crashes inside
24 hours (2026-09-21, runs `35525362773` and `35540854118`)
each ended a tick that a bounded wait would have saved.

Since 2026-11-21 a tick pushes as `ACTIONS_PAT` and can land
`.github/workflows/` changes (`agents.md`, "Operational
secrets"), so both build from the cloud.

## Design

- `heartbeat.yml`, root and template twin: read `gh workflow
  list --all` once, ahead of all three steps, and skip `$wf`
  in the cancel loop when its state is not `active`, the way
  the two later steps do. A skipped workflow is one log line,
  never a failure.
- `march.yml` and `night.yml`, root and template twins: set
  the retry watchdog in the model step's `env:` with a
  `MAX_WAIT_MS` comfortably under the job's
  `timeout-minutes`. Read the current Claude Code docs for
  the flag's real value shape before writing it: the
  changelog line does not say whether it is a boolean.
- `.github/CLOUD_LOOP.md` and `playbooks/cloud-loop.md` name
  the two variables and why the wait is capped below the job
  timeout.
- The gate's `workflows` and `cadence-twins` legs keep the
  twins honest; a new required env line teaches the gate in
  the same commit.

## Acceptance

- **A2** `march.yml` and `night.yml` (root and template) set
  the retry watchdog and a max wait under each job's
  `timeout-minutes`, with the value shape confirmed against
  the current docs.
- **A3** `.github/CLOUD_LOOP.md` and `playbooks/cloud-loop.md`
  document both variables and the cap.
- **A4** `CHANGELOG.md` carries an entry for each template
  path touched, and the gate is green.

## Chunks
Measure: 3 open · 1 closed · next A5

- [ ] **71.2** `march.yml` and `night.yml` cap the retry
  watchdog's wait under each job's timeout · M · closes A2 ·
  needs — · partial A4
  - Root and template twin, on the `anthropics/
    claude-code-action@v1` step's `env:` (new on that step;
    today it carries no `env:` block, only `with:`). Read the
    current Claude Code docs for `CLAUDE_CODE_RETRY_WATCHDOG`
    and `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`'s real value
    shape before writing either — the changelog line alone
    doesn't say whether the first is a boolean or a mode
    string. `march.yml`'s job is `timeout-minutes: 60`,
    `night.yml`'s `timeout-minutes: 30`; the max wait sits
    comfortably under each.
  - Resolves the spec's open question: `heartbeat.yml` runs no
    `claude-code-action` step (confirmed by reading the file —
    it's shell plus one offline node script, no model), so it
    never gets the watchdog; only this chunk's two files do.
- [ ] **71.3** `.github/CLOUD_LOOP.md` and
  `playbooks/cloud-loop.md` document both variables and the
  cap · S · closes A3, A4 · needs 71.2
  - Names the two env vars, the value 71.2 actually picked for
    each workflow, and why the max wait sits under the job's
    `timeout-minutes`. Last chunk to land: A4's CHANGELOG
    entries (one per template path touched across 71.1-71.3)
    and a green gate are true once all three are in.
