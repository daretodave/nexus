# Digest — 2026-07-28

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet-then-productive ~23.5h window: of 4 `march` ticks, 2 were
clean `/expand` no-ops, then `/expand` landed a real pass (pass
5 — 0 new candidates, 1 re-evidenced), then `/iterate` shipped
exactly yesterday's flagged pick — `[C, 3.6]` adding
`'templates/plan'` to `scripts/verify.mjs`'s `REVERSE_CHECK_DIRS`
(`1b1e211`), closing the gate blind spot the prior digest
surfaced. AUDIT header stays `2026-07-27` (re-scored, not
re-swept — still under the 48h threshold) with 3 non-blocked
Pending rows left, all low-scoring (1.6/1.6/1.35). Candidate
backlog flat at 21 pending despite the new pass; zero
promotions since 2026-07-02, now 26 days running.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-27 15:01 | march → expand | clean no-op — no candidate cleared the bar |
| 07-27 20:31 | march → expand | clean no-op — no candidate cleared the bar |
| 07-28 03:04 | march → expand | shipped pass 5 (`545367a`) — 0 new candidates, 1 re-evidenced (the score-9.0 step-4 rewrite candidate, now sextupled), `Cloud-Run:` trailer present |
| 07-28 08:57 | march → iterate | shipped AUDIT's top scorer, `[C, 3.6]` (`1b1e211`) — `verify.mjs`'s `REVERSE_CHECK_DIRS` gains `templates/plan`, 35 files reverse-checked (up from 24), `Cloud-Run:` trailer present |
| 07-28 11:15 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `545367a` — `/expand` pass 5: no fresh candidate cluster since
  pass 4 (2026-07-22), but four more instances landed in the
  already-tracked `[score 9.0]` step-4 rewrite candidate (two
  more placeholder-sweep breaks, two more missed adopt-by-need
  prune rows) — sixth re-evidencing cycle, folded into that
  candidate's evidence trail rather than filed separately.
- `1b1e211` — closed AUDIT's `[C, 3.6]` row: added
  `'templates/plan'` to `scripts/verify.mjs`'s
  `REVERSE_CHECK_DIRS` array, the exact blind spot that let a
  previously-fixed `templates/plan` disk/doc mismatch
  (2026-07-19's `[A/C, 3.2]`) go uncaught by the gate itself.
  Confirmed green post-fix: 35 files reverse-checked, up from 24.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header still `2026-07-27` — this window's `/iterate`
  tick (08:57) re-scored rather than re-swept (well under the
  48h digest threshold, and under `skills/iterate.md`'s own 24h
  threshold too), so no fresh A-G sweep ran today. 3 Pending rows
  now (was 4 before `1b1e211`): `[A, 1.6]` (build plan's
  carry-over counts, itself stale again — worth a fresh look
  next pass) and `[C/F, 1.6]` (fictional `ember.vercel.app` URL)
  tied at top; `[A, 1.35]` (`cloud-loop.md`'s "three new files"
  header) trails. Standing `[user-issue #12]` (blocked, unchanged
  since 2026-07-12) preserved verbatim as the durable top row.
- **CRITIQUE:** 0 pending, unchanged. Last pass 2026-07-25
  (pass 8).
- **PHASE_CANDIDATES:** 21 pending, flat in count despite a real
  pass landing — pass 5 (2026-07-28) only re-evidenced an
  existing candidate rather than adding or promoting one. Posture
  still bold. Zero promotions since the queue opened 2026-07-02,
  now 26 days running.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3 `Cloud-Run:`-tagged commits in the trailing 24h
  (`feb2364`, `545367a`, `1b1e211`, plus this tick's own digest
  commit once it lands — 4 total), well under the 8/24h ceiling.
  No trailer-gap recurrence — both non-digest commits this window
  shipped with the trailer intact.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml` still
  needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues only,
  so the cloud loop can never push to `.github/workflows/*.yml`
  itself. Needs a human, or a locally-run `/iterate` with a
  personal workflow-scoped `gh` token. Tracked as AUDIT
  `[user-issue #12]`, still the only blocked row.
- **Candidate backlog** — 21 pending in
  `plan/PHASE_CANDIDATES.md`, zero promoted in 26 days. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite is now
  re-evidenced across six cycles (2026-07-06, -10, -13, -21, and
  four more instances folded in at this window's pass 5) and
  remains the clearest promote-first candidate; worth an
  `/oversight` pass. Unchanged in substance from yesterday's
  digest, just further evidenced.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE is
empty; AUDIT's highest open scorers excluding the blocked `#12`
are now the tied `[A, 1.6]` (build plan's own carry-over counts,
drifted a third time) and `[C/F, 1.6]` (swap the fictional
`ember.vercel.app` example URL for one that can't resolve) — a
clean next `/iterate` pick either way, both cheap and
well-evidenced.

## Tuning proposals

None new this tick. `plan/PHASE_CANDIDATES.md`'s open
`[score 6.5]` candidate ("Mechanically verify the Cloud-Run
trailer on cloud ticks") saw no new instance this window — both
non-digest commits (`545367a`, `1b1e211`) shipped with the
trailer intact — so it stays as-is, not re-evidenced. The two
clean `/expand` no-ops this window match posture bold's own
no-signal path (each ran, found nothing, exited clean), and the
third `/expand` dispatch did land a real (if re-evidencing-only)
pass, so the queue isn't starved — no mistuned-gate signal to
file. The 26-day promotion drought is a standing observation
(see "Needs you" above), not a gate defect: `/oversight` is the
only skill that promotes, and it's user-in-the-loop by design,
so its cadence isn't this loop's tuning to propose. Per
`skills/digest.md` §4, gate tunings remain proposals only.
