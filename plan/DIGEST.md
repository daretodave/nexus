# Digest — 2026-09-29

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet window on the surface — three march ticks in a row
no-op'd — but the digest's own overdue audit refresh (header
was 2 days stale) turned up a genuinely new, ship-able AUDIT
row, and a 37-day-old loose end (pulse.mjs double-counting
already-promoted candidates as pending) finally got filed as
its own tuning candidate instead of staying buried in a phase
brief.

## While you were out

Window: since the last digest commit (2026-09-28 18:15 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-28 20:22 | march → iterate → oversight audit | no-op — AUDIT topped out at `[F, ~2]` plus four blocked user-issues, CRITIQUE empty, expand gate not due. Checked for a fresh `/expand` signal per failure mode 1: found Claude Code v2.1.284 (Sonnet 5.5 now the API default) but every kit reference to `claude-sonnet-5` already carries the standing "model ids age" hedge, so no new candidate filed. |
| 09-29 07:51 | march → iterate → oversight audit | no-op — same gate shape (triage/critique/expand all not due, no `[ ]` phase). Ran a targeted freshness re-check; queues genuinely empty. |
| 09-29 14:36 | march → iterate → oversight audit | no-op — delegated a full A-G sweep to a sub-agent (AUDIT.md's header was already >24h stale by this tick); it found fewer than 5 findings ≥3.0 and closed the tick without shipping, per `iterate.md` §6 failure mode 1. This digest's own independent sweep (below) reached the AUDIT.md header refresh a few hours later and did surface one row that clears the ship floor — the two sweeps disagree on `customization/moderation-loop.md` specifically; this digest's finding is verified against `skills/march.md`'s real dispatch order and stands. |

`heartbeat` ran green throughout (5/5 sampled). No commits
landed in this window before this one — all three ticks above
were clean no-ops, not gate failures.

## Shipped

Nothing by `/march` this window (three no-ops, see above). This
digest itself ships two doc-only updates, per its own rails
(proposals/audit only, never fixes):

- `plan/AUDIT.md` — full A-G sweep (first since 2026-09-25,
  header was stale past the 48h threshold). Five durable rows
  unchanged; one new row filed: `[A, 4.5]`
  `customization/moderation-loop.md`'s `/march` dispatch
  illustration omits `/expand` — the same defect class commit
  `9fd21c0` fixed in `concepts/architecture.md` two days ago,
  never propagated to this second copy.
- `plan/PHASE_CANDIDATES.md` — one new tuning candidate filed
  (score 3.5): `scripts/pulse.mjs`'s pending-candidate count
  still includes four `[promoted 2026-08-23 → phase N]` rows
  that were deliberately left in `## Pending` for their
  evidence trails but never taught to `pulse.mjs`'s counting
  logic — a gap phase 30's own brief already named as a loose
  end 37 days ago but that never got filed as an actual
  candidate until now.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 37
  days blocked) and phase 32 (`#49`, 30 days blocked), both
  still on the same cloud-push-token workflows-scope gap,
  unchanged.
- **AUDIT:** 6 pending rows (up 1). Header refreshed to
  2026-09-29 (first full A-G sweep since 2026-09-25). New top
  row `[A, 4.5]` clears the 3.0 ship floor — first actionable
  AUDIT row in several passes; the five durable rows
  (`[F, ~2]` + four blocked user-issues) all unchanged.
- **CRITIQUE:** 0 pending, last pass 3d ago (pass 21,
  2026-09-27) — within the normal cadence, not yet due.
- **PHASE_CANDIDATES:** 30 pending (22 >21d), oldest 90d
  (proposed 2026-07-02, unchanged row) — up one row from
  yesterday, this digest's own pulse.mjs tuning proposal.
- **Issues:** 6 open (`#54`, `#49`/`#48`, `#40`, `#35`/`#34`),
  unchanged. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending
  >21d, oldest 90d).** Both trigger conditions remain met,
  unchanged from yesterday. Note the raw count itself is now
  known to be off by +4 (see the new pulse.mjs candidate above)
  — real pending is 25 with 18 over 21 days, not 29/22 — but
  the oldest-age figure (90d) is genuine, not an artifact, so
  the alarm still stands either way.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase
  20 (`#35`, 37 days) and phase 32 (`#49`, 30 days).
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31, now 29
  days old) targets the exact recurring blocker behind both
  stuck phases — it would close `#35`, `#40`, and `#49`
  together if promoted.

## Today's intent

The freshly-filed `[A, 4.5]` AUDIT row — `customization/
moderation-loop.md`'s dispatch list omitting `/expand` — is the
first AUDIT finding in several passes to clear the 3.0 ship
floor. Expect the next `/march` tick to dispatch to `/iterate`
(no `[ ]` build-plan phase pending, CRITIQUE empty) and ship it
directly rather than falling through to `/expand`.

## Tuning proposals

One filed this pass: `scripts/pulse.mjs`'s candidate-pending
count and >21-day tally both include four `[promoted …]` rows
that a 2026-08-23 `/oversight` pass deliberately left in
`## Pending` for their evidence trails, but `pulse.mjs` never
learned to skip them — inflating today's reported numbers by
+4 on both counts (see `plan/PHASE_CANDIDATES.md`'s new
score-3.5 row for the full evidence and two proposed fixes).
Filed as a candidate, not applied — the meta-loop rail. No
other mistuned-gate signal this window; the three march no-ops
were routine gate checks, not evidence of a starved queue on
their own.
