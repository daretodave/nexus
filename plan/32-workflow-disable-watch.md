# 32 — Scheduled-workflow disable watch in heartbeat

> The heartbeat pages when any scheduled workflow is disabled
> (by GitHub's 60-day inactivity rule or by hand), and its
> flatline check covers `night` as well as `march`.

## Why

GitHub silently disables a scheduled workflow
(`disabled_inactivity`) after 60 days with no repo commits;
the 2026-08 outage walked 21 days toward it. The heartbeat
only measures `march`'s run recency: `night.yml` failed for
the same 21 days with no watcher, and a disabled schedule
produces no runs for a recency check to measure. The watchdog
must watch armed-ness, not just completions, and cover every
scheduled workflow.

What exists today (2026-10-20): `.github/workflows/heartbeat.yml`
and its template twin alarm on a wedged run and on "no
successful march tick in 14h"; nothing reads
`gh workflow list`. Promoted 2026-08-23 (oversight, score 7.1);
it waited on a local session because the cloud token can't
push workflow files.

## Design

- **Armed-ness step** (new, its own step): `gh workflow list
  --json name,state`; for `march`, `night` and `heartbeat`,
  any state but `active` opens one deduped alarm issue per
  workflow (the existing dedup-by-open-title pattern). The
  body names the state, both causes (60-day inactivity, a
  human's `gh workflow disable`) and the fix
  (`gh workflow enable <name>`).
- **Cadence check** generalizes the 14h march step into a
  shell function `check_cadence <workflow> <threshold_h>`,
  called for `march` (14h, unchanged) and `night` (48h: daily
  cadence, one skipped day tolerated). Both keep
  `--status success` (a workflow failing every tick must not
  reset its own timer).
- Both files: `.github/workflows/heartbeat.yml` and
  `templates/.github/workflows/heartbeat.yml`.

Decisions made upfront (do not ask):

- `disabled_inactivity` and `disabled_manually` alarm alike;
  the body explains both. Same behavior, no branch.
- Night's threshold is 48h, not march's 14h: a 14h threshold
  on a daily workflow pages every day.
- Armed-ness and cadence stay two steps: a disabled workflow
  and a flatlined active one are different signatures.
- No auto-recovery: the heartbeat never runs
  `gh workflow enable` itself. Watchers stay dumber than what
  they watch.
- No new workflow file, no schedule change (still every 6h),
  no edit to the 60-day-rule prose (already documented).

## Contracts

- The alarm issue titles follow the existing heartbeat titles'
  dedup pattern; no new label.

## Acceptance

- **A3** `concepts/loop-shapes.md` §3 and
  `.github/CLOUD_LOOP.md`'s heartbeat bullet describe the
  armed-ness check and night's cadence check.

## Open questions

(None.)

## Chunks
Measure: 1 open · 2 closed · next A4

- [ ] **32.2** Loop-shapes and CLOUD_LOOP describe the new
  checks · S · closes A3 · needs —
