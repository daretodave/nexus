# Phase 32 — Scheduled-workflow auto-disable watch in heartbeat

> Source: `plan/PHASE_CANDIDATES.md` → Promoted 2026-08-23
> (oversight, user-directed), score 7.1.
> One screen: deliverables, non-goals, decisions.

## Problem

GitHub silently disables a scheduled workflow
(`disabled_inactivity`) after 60 days with zero repo commits —
a hazard the Aug 2–23 outage walked toward (21 days of zero
commits). The heartbeat only measures `march`'s run recency:
`night.yml` failed for the same 21 days with no watcher at
all, and a schedule GitHub has already *disabled* produces no
runs for a recency check to even measure — the watchdog needs
to watch armed-ness, not just completion history, and needs to
cover every scheduled workflow, not just march.

## Deliverables

- `.github/workflows/heartbeat.yml` (nexus's own) and
  `templates/.github/workflows/heartbeat.yml` (adopter twin):
  - New step: `gh workflow list --json name,state` checked for
    `march`/`night`/`heartbeat` in `disabled_inactivity` or
    `disabled_manually` state (anything but `active`) → one
    deduped alarm issue per workflow name, same
    dedup-by-open-issue-title pattern the existing steps use.
    Body names the state, both causes (60-day inactivity vs a
    human running `gh workflow disable`), and the one-line
    fix (`gh workflow enable <name>`).
  - The existing "Alarm if march has not succeeded a tick in
    14h" step generalizes into a small shell function
    (`check_cadence <workflow> <threshold_h>`) called for both
    `march` (14h — unchanged) and `night` (48h — daily cadence,
    one skipped day tolerated before paging). Same
    `--status success` reasoning carries to both (a workflow
    failing every tick must not reset its own timer).
- `concepts/loop-shapes.md` §3 (the heartbeat): third bullet
  added alongside the existing two ("wedged run" /
  "no completed tick"), naming the armed-ness check.
- `.github/CLOUD_LOOP.md` "The other shapes" heartbeat bullet:
  extend to mention the armed-ness check and that the flatline
  check now covers `night` too (currently says "march hasn't
  completed a tick in 14h" only).

## Non-goals

- **No change to the 60-day rule's documentation.** Both
  `.github/CLOUD_LOOP.md`:105 and
  `templates/.github/CLOUD_LOOP.md`'s failure-mode table
  already state the GitHub auto-pause behavior and its fix
  (push anything / `gh workflow enable`) — the promoted
  candidate's "document the 60-day rule" ask is already
  satisfied; this phase does not touch that prose again.
- **No new workflow file.** The armed-ness check and the
  widened flatline check both ride the existing
  `heartbeat.yml` — no second watchdog file, no schedule
  change (still every 6h).
- **No `playbooks/cloud-loop.md` edit.** That doc's walkthrough
  covers the minimal `march.yml` + `CLOUD_LOOP.md` setup only;
  `heartbeat.yml` is an adopt-by-need extra documented in
  `templates/README.md`'s table (already accurate — it
  describes the file generically as "model-free watchdog for
  the other two" and doesn't enumerate individual checks, so it
  needs no edit for new checks inside that file).
- **No auto-recovery.** The heartbeat still never writes
  anything but the alarm issue — it does not run
  `gh workflow enable` itself. Watchers stay dumber than the
  thing they watch (same rule the existing steps already
  follow).

## Decisions

1. `disabled_inactivity` OR `disabled_manually` both alarm,
   undifferentiated in the check logic (the issue body explains
   both causes) — a human who deliberately disabled a workflow
   and forgot is exactly as stuck as one GitHub auto-disabled;
   distinguishing them in code would add a branch for no
   behavior difference.
2. Night's flatline threshold is 48h, not a copy of march's
   14h — night's cadence is daily (24h) vs march's 6h, so a
   flat 14h threshold would page every single day even when
   night is healthy. 48h (2x cadence, one skipped day
   tolerated) mirrors march's own ~2.3x-cadence margin without
   inventing a new ratio rule.
3. `check_cadence` becomes a shell function inside the existing
   step rather than two near-duplicate steps — the two calls
   differ only in workflow name and threshold; a function keeps
   the dedup-issue logic in one place so a future third
   scheduled workflow (were one added) is a one-line addition.
4. The armed-ness check ships as its own new step, not folded
   into `check_cadence` — a disabled workflow and a flatlined
   active one are different failure signatures (the first
   produces zero runs to even measure cadence against), so they
   stay two separate reads of `gh workflow list` /
   `gh run list`.
