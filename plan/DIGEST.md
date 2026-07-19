# Digest — 2026-07-19

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet, clean window: 3/3 ticks since yesterday's digest shipped
an `/iterate` fix (zero no-ops, zero failures, heartbeat 5/5
green), draining CRITIQUE from 4 LOW rows to 1. The AUDIT block
crossed the 48h staleness line overnight, so this pass did the
fresh A-G sweep itself and found two new low-scoring rows — the
kit tree undersells `templates/plan/` and a stale example URL in
`bootstrap.md`. Build plan stays empty (18/18); ceiling 3/8.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-18 20:19 | march → iterate | closed CRITIQUE's step-7 LOW: `playbooks/new-project.md` no longer tells readers to re-copy `deploy-check.mjs` (step 4's bulk copy already placed it) — reworded to wire the existing file instead (commit `4a87a19`) |
| 07-19 03:07 | march → iterate | closed CRITIQUE's step-6 LOW: reframed the verify-gate `package.json` snippet as the target shape step 5's brief produces, not an edit to a file that doesn't exist yet at that point in the walk (commit `3c679ed`) |
| 07-19 08:51 | march → iterate | closed CRITIQUE's step-8 LOW: sub-agent copy instructions reworded to point at what step 4 already placed, instead of re-copying `scout.md`/`reader.md` (commit `edbf4bc`) |
| 07-19 (this tick) | night | this digest — fresh AUDIT sweep (see Queues now) |

`heartbeat` ran 5/5 green over its last-5 sample; no red
`march` runs in the last 26h (4 runs: 3 `/iterate` ticks above
plus the 07-18 digest itself).

## Shipped

- `4a87a19` — CRITIQUE LOW: step 7's `deploy-check.mjs`
  instructions no longer imply a first-time copy of a file
  step 4 already landed.
- `3c679ed` — CRITIQUE LOW: step 6's `package.json` snippet
  reframed as a target shape, not a premature edit.
- `edbf4bc` — CRITIQUE LOW: step 8's sub-agent copy instructions
  point at step 4's existing placement instead of re-copying.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** refreshed this pass — header was 50h old, over the
  48h threshold, so a fresh A-G sweep ran (see
  `skills/iterate.md` §3). 4 pending rows now: `[user-issue
  #12]` (standing, blocked on `ACTIONS_PAT` lacking `workflows`
  scope, unchanged since 2026-07-12), `[A/E, 2.7]` README's
  "Files added" checklist undersells `scripts/` (still
  reproduces, unchanged), and two new rows — `[A/C, 3.2]`
  README's kit-tree omits `PHASE_CANDIDATES.md` and
  `CURRENT-STATE.md` under `templates/plan/` (both exist on
  disk, both correctly listed in `templates/README.md`'s own
  tree; `scripts/verify.mjs`'s reverse-check doesn't cover
  `templates/plan` so the gate misses it), and `[C/F, 1.6]` a
  fictional example deploy URL in
  `templates/skills/bootstrap.md:217` now resolves to an
  unrelated live site (plain text in a code block, not a
  hyperlink — low severity). Header now dated 2026-07-19.
- **CRITIQUE:** 1 pending (down from 4), pass 5 (2026-07-16,
  unchanged — all 3 closures this window worked the existing
  queue, no fresh dry-run pass). The one remaining row is LOW
  (`templates/README.md`'s `<PROJECT_PKG_PREFIX>` worked-example
  gap). Not due for a fresh pass (3 commits, <24h since pass 5
  — threshold is ≥12 commits or >72h).
- **PHASE_CANDIDATES:** 19 pending, last pass 3 (2026-07-16),
  posture bold, unchanged. 3 commits since that pass — nowhere
  near the ≥20-commit or >7-day `/expand` gate.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row
  as AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3/8 Cloud-Run-tagged commits in the trailing 24h
  (before this digest's own commit lands as the 4th).

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
down to a single LOW row and the fresh AUDIT sweep surfacing two
low-scoring rows (3.2 and 1.6) alongside the unchanged `[A/E,
2.7]` (2.7), the next tick or two will most likely be another
`/iterate` pass picking off `[A/C, 3.2]` (the `templates/plan/`
tree gap — highest scorer now) or one of the two remaining LOW
rows. `PHASE_CANDIDATES` is far from its rate-limit threshold, so
`/expand` is unlikely to fire soon. Worth a human glance at the
standing background-agent tuning proposal below, still
unpromoted.

## Tuning proposals

None filed this pass — the pulse was clean (3/3 ticks shipped,
0 failures, heartbeat green) and nothing in it points at a
mistuned gate, ceiling, or cadence. The prior pending candidate
(`[score 7.5] Cloud march ticks must not dispatch background/
async agents`, filed 2026-07-18) remains unpromoted in
`plan/PHASE_CANDIDATES.md`; this window's clean run is
consistent with it but adds no new evidence either way — a
decision for `/oversight`, not this pass.
