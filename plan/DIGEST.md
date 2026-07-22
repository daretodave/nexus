# Digest — 2026-07-22

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet window: 4 march ticks, 3 correct no-ops and one shipping
tick — `/expand` finally cleared its ≥20-commit rate limit and
ran pass 4, but found no fresh candidate cluster, folding its
one signal into the existing score-9.0 candidate's evidence
trail instead of filing anything new. AUDIT and CRITIQUE queues
are otherwise untouched since yesterday's digest; build plan
stays empty (18/18).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-21 14:42 | march → (no-op) | nothing newly actionable — queues held at yesterday's state, correctly shipped nothing |
| 07-21 20:28 | march → (no-op) | same — no-op |
| 07-22 03:05 | march → (no-op) | same — no-op |
| 07-22 08:54 | march → expand (pass 4) | 0 new candidates, 1 re-evidenced: folded a fourth instance of the placeholder-sweep grep-scope bug (found via the 2026-07-21 AUDIT sweep, commit `ced0304`) into the standing `[score 9.0]` step-4 rewrite candidate's evidence trail (commit `f2e3d6f`) |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `f2e3d6f` — `/expand` pass 4: no new phase candidates; the
  `[score 9.0]` `new-project.md` step-4 rewrite candidate picked
  up its fourth re-evidencing (now cross-signal: audit *and*
  critique), pass count and last-pass date bumped in
  `plan/PHASE_CANDIDATES.md`.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 6 pending, header still 2026-07-21 (33h old, under
  the 48h staleness threshold — no refresh due). Rows unchanged
  from yesterday: `[user-issue #12]` (standing, blocked on
  `ACTIONS_PAT` lacking `workflows` scope, unchanged since
  2026-07-12); `[A/E, 2.7]` README's "Files added" checklist
  undersells `scripts/`; `[C/F, 1.6]` fictional example deploy
  URL in `templates/skills/bootstrap.md:217`; `[B, 4.5]`
  `existing-project.md`'s overlay creates an empty
  `plan/phases/` with no brief inside it; `[D, 1.8]` two
  unwrapped bullets at `README.md:309`; `[A, 1.35]`
  `cloud-loop.md`'s "three new files" header lists only two.
- **CRITIQUE:** 1 pending (LOW, `<PROJECT_PKG_PREFIX>` worked-
  example gap in `templates/README.md`), unchanged — last pass
  2026-07-19 (pass 6).
- **PHASE_CANDIDATES:** 20 pending, last `/expand` pass now 4
  (2026-07-22, up from pass 3 on 2026-07-16). Posture bold. No
  new candidates filed this pass — one existing row
  re-evidenced. None promoted or rejected yet.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 2 `Cloud-Run:`-tagged commits in the trailing
  24h (this digest's predecessor `8b10e9b` and today's `f2e3d6f`),
  well under the 8/24h ceiling; both carry the trailer correctly.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **Candidate backlog** — 20 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted since the queue opened 2026-07-02. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite is now
  re-evidenced across four separate cycles (2026-07-06, -10,
  -13, -21) and is the clearest promote-first candidate; worth
  an `/oversight` pass. The two prior meta-loop candidates
  (`[score 7.5]` background-agent dispatch, `[score 6.5]`
  Cloud-Run trailer verification) remain unpromoted too.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
down to a single LOW row and AUDIT unchanged, `[B, 4.5]`
(existing-project.md's empty `plan/phases/` overlay) remains the
highest-scoring open item excluding the blocked `#12`, and the
most likely next `/iterate` pick. `/expand` has now run its
pass and gone quiet again — the next rate-limit window won't
open until ≥20 more commits land, so upcoming ticks should
route back to `/critique`/`/iterate` fixes.

## Tuning proposals

None this pass — the pulse showed no mistuned gate: three
no-op ticks correctly deferred (nothing pending each time), the
fourth tick's `/expand` pass ran as soon as it was rate-limit
eligible and behaved correctly (folding weak signal into
existing evidence rather than over-filing), and heartbeat ran
5/5 green. The two standing meta-loop candidates from prior
passes (async-background-agent dispatch, Cloud-Run trailer
verification) remain open in `plan/PHASE_CANDIDATES.md` awaiting
`/oversight`; nothing new to file.
