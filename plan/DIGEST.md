# Digest — 2026-07-09

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, three shipped, one
no-op: all three routed to `/iterate` (build plan stays dry,
critique and expand gates both under threshold) and each closed
an AUDIT row — the `[4.8]` `cloud_loop.schedule_cron` fix that
yesterday's digest flagged as top intent, the generic-specialist
`model:` lever gap, and the adopt-by-need table's missing rows.
AUDIT also got its first full A-G dimension sweep since phase
18 drained the build plan, landing at 7 pending (6 scored + the
standing `user-issue #12`).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-08 14:49 | march | iterate — shipped AUDIT `[4.8]`, wired `cloud_loop.schedule_cron` into `bootstrap.mjs` following the `applyDailyCeiling` anchor-and-warn pattern (commit `bd6f048`) |
| 07-08 20:29 | march | no-op — no commit produced this tick |
| 07-09 03:07 | march | iterate — shipped AUDIT `[3.8]`, added the `model:` lever to the generic-specialist template (commit `fd1e41c`) |
| 07-09 09:08 | march | iterate — shipped AUDIT `[4.8]`, added the nightly-smoke/stack-lifecycle rows templates/README.md's tree already called out but the adopt-by-need table omitted (commit `8f0f185`) |
| 07-09 (this tick) | night (this tick) | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `bd6f048` — `cloud_loop.schedule_cron` was declared in the
  install-workflow schema but never applied; wired the same
  anchor-and-warn mechanism phase 17 used for `daily_ceiling`.
- `fd1e41c` — the generic-specialist template had no `model:`
  lever, unlike its siblings; added it.
- `8f0f185` — `templates/README.md`'s own tree comments call
  out nightly-smoke and stack-lifecycle as conditional files,
  but the adopt-by-need table never listed them; added both
  rows.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
- **AUDIT:** 7 pending (6 scored `[ ]` rows + `[user-issue
  #12]`) — `[4.8]` heartbeat.yml alarm-text cadence mismatch,
  `[4.2]` placeholder-count doc drift (six vs. eight), `[3.6]`
  phase-log missing 6/18 entries, `[3.5]` cloud-loop reference
  is an external link, `[3.2]` data-layer mermaid style
  outlier, `[1.8]` a test file missing from the layout tree.
  Header dated 2026-07-09 (today) — first full A-G sweep since
  phase 18 drained the build plan; not stale.
- **CRITIQUE:** 5 pending, unchanged, last pass 2026-07-07
  (pass 2). 8 commits / ~44h since last pass — under both
  rate-limit thresholds (≥12 commits or >72h), correctly quiet.
- **PHASE_CANDIDATES:** 15 pending, unchanged, last pass
  2026-07-06 (pass 1), posture bold. 14 commits / 3 days since
  last pass — under both expand thresholds (≥20 commits or >7
  days), correctly quiet.
- **Issues:** 1 open (`#12`, labeled `triage:loop-queued`). No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). Critique and
expand both sit under their rate-limit thresholds, so the next
several march ticks route to `/iterate`. Top AUDIT finding:
`[4.8]` heartbeat.yml's alarm text hardcodes a cadence that
doesn't match the template's default `march.yml` cron — align
the alarm copy with whatever cron the template actually ships,
or derive it instead of hardcoding.

## Tuning proposals

None. The pulse shows every rail working as designed this
window: critique and expand both stayed quiet under their own
thresholds, the build-plan-dry path correctly fell through to
`/iterate` three times running, and each of those ticks closed
a real AUDIT row (including the exact item yesterday's digest
flagged as top intent). One no-op tick out of four is normal
loop noise, not a starved queue.
