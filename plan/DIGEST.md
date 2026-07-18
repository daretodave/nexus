# Digest — 2026-07-18

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Clean sweep: all 4 ticks since yesterday's digest shipped an
`/iterate` fix, zero no-ops, zero failures, heartbeat 5/5
green — the async-background-agent loss flagged yesterday
didn't recur (that tuning proposal is still pending, unapplied,
per the meta-loop rail). CRITIQUE's pending queue dropped from
8 rows to 4, all LOW now (every MED closed). Build plan stays
empty (18/18); ceiling 5/8, rising to 6/8 once this digest's
own commit lands.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-17 14:34 | march → iterate | closed CRITIQUE's pnpm/npm sed-example MED: reworded `playbooks/new-project.md`'s prerequisites bullet to state pnpm as a hard requirement for the unattended path (naming the `settings.json` allowlist coupling explicitly) instead of building an unmaintained npm/yarn/bun worked example (commit `c160464`) |
| 07-17 20:21 | march → iterate | closed CRITIQUE's prune-coverage MED: extended `playbooks/new-project.md`'s adopt-by-need prune bullet + both worked `rm -f`/`Remove-Item` examples from 4 to all 8 conditional files, and added the missing `skills/bootstrap.md` row to `templates/README.md`'s adopt-by-need table (commit `57d129d`) |
| 07-18 03:03 | march → iterate | closed CRITIQUE's bearings.md placeholder-list LOW: swapped `<REPO_SLUG>` for `<DEFAULT_BRANCH>` in step 2's list (the token that's actually there), then found and fixed a second bug the same repro surfaced — `<PROJECT_TAGLINE>` was never a literal token in `templates/plan/bearings.md`, so renamed its TL;DR placeholder to match the table (commit `ed628f1`) |
| 07-18 08:35 | march → iterate | closed CRITIQUE's README/"How to use this kit" cross-reference LOW: added a one-line pointer marking the manual-path section as TL;DR's skippable equivalent when adoption was delegated to an agent (commit `33f4a5f`) |
| 07-18 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window. No `march` failures in the last 26h.

## Shipped

- `c160464` — CRITIQUE MED: pnpm named as a hard prerequisite
  for the unattended path instead of a sed-replace footnote,
  closing the gap where npm/yarn/bun commands silently never
  matched `settings.json`'s pnpm-only allowlist.
- `57d129d` — CRITIQUE MED: adopt-by-need prune coverage now
  spans all 8 conditional files (was 4), plus the missing
  `skills/bootstrap.md` table row.
- `ed628f1` — CRITIQUE LOW x2: step 2's bearings.md placeholder
  list now names the token that's actually there
  (`<DEFAULT_BRANCH>`), and `<PROJECT_TAGLINE>` is now a real
  literal token in `templates/plan/bearings.md` rather than a
  silent no-op.
- `33f4a5f` — CRITIQUE LOW: README's TL;DR and "How to use this
  kit" now cross-reference each other instead of reading as two
  unrelated required paths.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 2 pending — `[user-issue #12]` (standing, blocked
  on `ACTIONS_PAT` lacking `workflows` scope, unchanged since
  2026-07-12) and `[A/E, 2.7]` README's "Files added" checklist
  undersells `scripts/`. Header dated 2026-07-17 — under 48h
  old, no refresh needed this pass.
- **CRITIQUE:** 4 pending (down from 8), pass 5 (2026-07-16,
  unchanged — all 4 closures this window worked the existing
  queue, no fresh dry-run pass). All 4 remaining rows are LOW;
  no MED rows left. Not due for a fresh pass (4 commits, <24h
  since pass 5 — threshold is ≥12 commits or >72h).
- **PHASE_CANDIDATES:** 19 pending, last pass 3 (2026-07-16),
  posture bold, unchanged. 4 commits since that pass — nowhere
  near the ≥20-commit or >7-day `/expand` gate.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row
  as AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` and
  `../semilayer/plan/lessons.md` not present in this
  environment — skipped (cloud).
- **Ceiling:** 5/8 Cloud-Run-tagged commits in the trailing 24h
  (before this digest's own commit lands as the 6th).

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

Build plan still has no pending phase (18/18). CRITIQUE is down
to 4 LOW rows and PHASE_CANDIDATES is far from its rate-limit
threshold, so the next tick or two will most likely be another
`/iterate` pass picking off AUDIT's remaining unblocked row
(`[A/E, 2.7]`, the `scripts/` checklist undersell — currently
the highest scorer at 2.7, just above CRITIQUE's LOW rows) or
one of CRITIQUE's remaining LOW findings. Worth a human glance
at yesterday's async-background-agent tuning proposal (still
pending in `plan/PHASE_CANDIDATES.md`, unapplied) since today's
clean run doesn't retire it — it just means the stale-audit
branch that triggered it wasn't hit again this window.

## Tuning proposals

None filed this pass. Yesterday's candidate (cloud march ticks
must not dispatch background/async agents) remains pending and
unpromoted in `plan/PHASE_CANDIDATES.md`; this window's 4/4
clean ticks are consistent with it but don't add new evidence
either way — the audit-refresh branch that triggers it wasn't
exercised this window (AUDIT stayed under the 48h staleness
threshold throughout).
