# Digest — 2026-07-29

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Active ~24h window, 4/4 `march` ticks shipped: `/iterate`
closed the build plan's own self-referencing stale-count bug
(`ee20265`), `/critique` pass 9 filed one low finding, and the
next two `/iterate` ticks shipped a fresh AUDIT row (root
`CLAUDE.md` missing from the README tree, `7547248`) then that
same critique finding (`concepts/skills-anatomy.md`'s step
count, closing #29, `0ea69c0`). AUDIT re-swept fresh this
morning (header now `2026-07-29`) and is down to 2 non-blocked
Pending rows, both low-scoring; CRITIQUE is empty again;
candidate backlog flat at 21 pending, now 27 days since the
last promotion; ceiling sits at 5/8 trailing-24h with no
trailer gaps.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-28 14:50 | march → iterate | shipped `[A, 1.6]` — build_plan's Carry-overs bullets hardcoded stale queue counts a second time; reworded to point at each file's live Pending section (`ee20265`) |
| 07-28 20:27 | march → critique | pass 9 — 1 finding filed (0 high, 0 med, 1 low): `concepts/skills-anatomy.md:121`'s step count undercounts its own list (`76956ae`) |
| 07-29 03:04 | march → iterate | shipped AUDIT `[A, 4.5]` — README's kit tree skipped root `CLAUDE.md`, beat all 3 standing Pending rows on score (`7547248`) |
| 07-29 08:59 | march → iterate | shipped pass 9's finding — "canonical 12 steps" → "14 steps", closes #29 (`0ea69c0`) |
| 07-29 11:17 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `ee20265` — closed AUDIT `[A, 1.6]`: `plan/steps/01_build_plan.md`'s
  Carry-overs bullets cited hardcoded "9 findings"/"4 candidates"
  counts that had already drifted twice; reworded to point at
  each file's live Pending section instead.
- `76956ae` — `/critique` pass 9: full dry-run adoption walk
  (bulk copy, placeholder sweep, referenced paths) came back
  clean; only friction found was the skills-anatomy step-count
  drift, filed as issue #29.
- `7547248` — closed AUDIT `[A, 4.5]`: README's "What's in this
  kit" tree jumped from `agents.md` to `package.json`, skipping
  root `CLAUDE.md` — a load-bearing file already named elsewhere
  in the same doc. Added it to the tree.
- `0ea69c0` — closed the critique-9 finding and #29:
  `concepts/skills-anatomy.md:121`'s "canonical 12 steps" now
  reads "14 steps", matching the list's actual Step 0–13 span.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header refreshed to `2026-07-29` this morning (the
  03:04 tick's sweep). 2 non-blocked Pending rows left, both
  low and roughly tied: `[C/F, 1.6]` (fictional
  `ember.vercel.app` example URL in `bootstrap.md` now resolves
  to a real unrelated site) and `[A, 1.35]` (`cloud-loop.md`'s
  "three new files" header lists only two). Standing
  `[user-issue #12]` preserved verbatim as the durable blocked
  top row, unchanged since 2026-07-12 (17 days).
- **CRITIQUE:** 0 pending again — pass 9's lone finding shipped
  in this same window. Last pass 2026-07-28 (pass 9).
- **PHASE_CANDIDATES:** 21 pending, flat — no `/expand` tick ran
  this window (dispatcher favored critique/iterate work over
  expand, per priority order). Posture still bold. Zero
  promotions since the queue opened 2026-07-02, now 27 days
  running.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. Issue #29 opened and closed within this
  window. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 5 `Cloud-Run:`-tagged commits in the trailing 24h
  (`ff4c6e3`, `ee20265`, `76956ae`, `7547248`, `0ea69c0`), well
  under the 8/24h ceiling. No trailer-gap recurrence — all 4
  non-digest commits this window shipped with the trailer intact.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml` still
  needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues only,
  so the cloud loop can never push to `.github/workflows/*.yml`
  itself. Needs a human, or a locally-run `/iterate` with a
  personal workflow-scoped `gh` token. Tracked as AUDIT
  `[user-issue #12]`, still the only blocked row.
- **Candidate backlog** — 21 pending in
  `plan/PHASE_CANDIDATES.md`, zero promoted in 27 days. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite remains the
  clearest promote-first candidate (six re-evidencing cycles to
  date); worth an `/oversight` pass. Unchanged in substance from
  prior digests, no new evidence this window.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE is
empty; AUDIT's highest open scorer excluding the blocked `#12`
is `[C/F, 1.6]` — swap `bootstrap.md`'s fictional
`ember.vercel.app` example URL for one that can't resolve to
real content. Cheap, well-evidenced, clean next `/iterate` pick.

## Tuning proposals

None new this tick. The loop looks healthy on every axis this
digest tracks: 4/4 `march` ticks shipped (no no-ops, no
starvation), `/critique` opened and produced a real finding
(pass 9), the ceiling sits at 5/8 trailing-24h with room to
spare, and all 4 non-digest commits carried the `Cloud-Run:`
trailer — no new instance of the open `[score 6.5]` trailer-gap
candidate. The 27-day promotion drought is a standing
observation (see "Needs you" above), not a gate defect:
`/oversight` is the only skill that promotes, and it's
user-in-the-loop by design, so its cadence isn't this loop's
tuning to propose. Per `skills/digest.md` §4, gate tunings
remain proposals only.
