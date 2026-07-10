# Digest — 2026-07-10

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, all four shipped
(zero no-ops this window): every tick routed to `/iterate` and
closed an AUDIT row — `[4.8]` heartbeat.yml's hardcoded cadence,
`[4.2]` the six-vs-eight placeholder drift, `[3.6]` the build
plan's missing Phase-log entries, `[3.5]` the cloud-loop
reference link — draining AUDIT from 7 pending to 3. Bigger
signal: commits-since-last-pass for `/critique` just crossed the
≥12 rate-limit threshold for the first time since pass 2 (12
commits / ~68h); the next eligible march tick should route to
`/critique` before falling through to `/iterate` again.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-09 15:03 | march | iterate — shipped AUDIT `[4.8]`, reworded heartbeat.yml's alarm text cadence-agnostic (commit `d0dd6a2`) |
| 07-09 20:35 | march | iterate — shipped AUDIT `[4.2]`, taught onboarding docs eight placeholders instead of six (commit `d956fa7`) |
| 07-10 03:07 | march | iterate — shipped AUDIT `[3.6]`, completed the build plan's Phase log with 6 missing entries (commit `1cbfb27`) |
| 07-10 09:07 | march | iterate — shipped AUDIT `[3.5]`, pointed cloud-loop's reference implementation at nexus itself (commit `603aa56`) |
| 07-10 (this tick) | night (this tick) | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `d0dd6a2` — `templates/.github/workflows/heartbeat.yml`
  hardcoded "cadence is 6h" (only true of nexus's own cron);
  reworded to a threshold-only, cadence-agnostic alarm line.
- `d956fa7` — three onboarding docs said "six placeholders"
  while `templates/README.md`'s canonical table has eight;
  added the two missing placeholders to every citing doc and
  both replacement one-liners (bash + PowerShell).
- `1cbfb27` — the build plan's Phase log was missing 6 of 18
  phases; appended phases 9, 10, 11, 13, 15, 17 in commit
  order, matching the existing one-line style.
- `603aa56` — `playbooks/cloud-loop.md`'s "Reference
  implementation" section pointed only at an external repo
  (`thock`); now points primarily at this repo's own `.github/`
  (the ouroboros), keeping `thock` as the secondary reference.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
- **AUDIT:** 3 pending (2 scored `[ ]` rows + `[user-issue
  #12]`), down from 7 — `[3.2]` data-layer mermaid style
  outlier, `[1.8]` a test file missing from the layout tree,
  and the standing `[user-issue #12]`. Header dated 2026-07-09
  (~26h old); not stale.
- **CRITIQUE:** 5 pending, unchanged, last pass 2026-07-07
  (pass 2). ~12 commits / ~68h since last pass — the ≥12-commit
  rate-limit threshold is now met (no pending HIGH row is
  blocking it), so `/critique` is due on the next march tick,
  ahead of both `/ship-a-phase` (nothing pending) and
  `/iterate` in dispatch order.
- **PHASE_CANDIDATES:** 17 pending, unchanged, last pass
  2026-07-06 (pass 1), posture bold. 21 commits / 4 days since
  last pass — also over the ≥20-commit expand threshold, but
  march's critique gate is checked before the expand check, so
  `/critique` will run first.
- **Issues:** 1 open (`#12`, labeled `triage:loop-queued`). No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` and
  `../semilayer/plan/lessons.md` not present in this
  environment — skipped.

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

Build plan still has no pending phase (18/18). The next march
tick should route to `/critique` — its rate-limit threshold
just crossed (≥12 commits since pass 2) and no HIGH row is
queued to block it. After that clears, `/iterate`'s top AUDIT
finding is `[3.2]`: the data-layer mermaid diagram is the kit's
only diagram in an otherwise prose+tables doc set — decide
whether to keep it as a deliberate exception or convert it to
the decision-table idiom, and note the call in bearings voice
rules either way.

## Tuning proposals

None. Every rail behaved as designed this window: four
consecutive `/iterate` ticks, zero no-ops, each closing a real
AUDIT row (including the exact item flagged as top intent two
digests ago). The critique and expand gates both crossed their
commit thresholds this window for the first time in a while —
that is the rate limiter working on schedule, not a starved or
stuck queue; no candidate filed.
