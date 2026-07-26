# Digest — 2026-07-26

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Clean 26h window: 3 of 4 `march` ticks shipped (one legitimate
no-op), but one shipped commit (`427eb91`, the pass-8 critique
tick) landed with no `Cloud-Run:` trailer at all — a live
recurrence of the exact gap yesterday's-yesterday's digest
already flagged as `[score 6.5]` in `plan/PHASE_CANDIDATES.md`.
Build plan stays empty (18/18); candidate backlog flat at 21,
still zero promotions since 2026-07-02 (now 24 days running).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-25 14:32 | march → iterate | shipped AUDIT `[D, 1.8]` — README.md's three unwrapped bullets rewrapped to the ~62-64 col rule, closes #28 (`deb73cb`) |
| 07-25 20:20 | march → critique | pass 8, 2 findings (0 high, 1 med, 1 low) (`427eb91`) — **no `Cloud-Run:` trailer**, see Needs you |
| 07-26 03:05 | march → iterate | shipped CRITIQUE's MED row — `scripts/bootstrap.mjs` never offered for removal when `/bootstrap` isn't adopted (`0f19039`) |
| 07-26 08:49 | march → iterate/expand | clean no-op — nothing cleared threshold |
| 07-26 11:00 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `deb73cb` — hard-wrapped the three unwrapped bullets at
  `README.md:309, 310, 324` to the standing ~62-64 col rule,
  matching the continuation style at `README.md:613-624`.
  Closed AUDIT `[D, 1.8]` and issue #28.
- `427eb91` — `/critique` pass 8: 2 findings (0 high, 1 med, 1
  low) filed to `plan/CRITIQUE.md`.
- `0f19039` — added `scripts/bootstrap.mjs` to the `/bootstrap`
  adopt-by-need row in `templates/README.md` and
  `playbooks/new-project.md`'s prune bullet + worked examples,
  so the 1009-line provider-CLI executor no longer ships
  unpruned when `/bootstrap` isn't adopted. Closed
  `plan/CRITIQUE.md`'s MED dry-run row.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header `2026-07-24` — last full A-G sweep was
  2026-07-24 11:22 UTC, ~47h38m before this tick; still just
  under the 48h threshold, no refresh due this pass. 4 Pending
  rows (was 5 yesterday: `[D, 1.8]` shipped, none new): standing
  `[user-issue #12]` (blocked, unchanged since 2026-07-12);
  `[A, 1.6]` — build plan's stale carry-over counts (now further
  stale: cites "5 Pending" for AUDIT and "4 candidates" for
  PHASE_CANDIDATES, actuals are 4 and 21); `[C/F, 1.6]` —
  fictional `ember.vercel.app` URL now resolving to a real site;
  `[A, 1.35]` — `cloud-loop.md`'s "three new files" header lists
  two.
- **CRITIQUE:** 1 pending (pass 8, LOW) — README.md:281 uses
  "GitHub-as-DB" with no gloss or cross-reference, unlike
  sibling adopt-by-need rows. Last pass 2026-07-25 (pass 8).
- **PHASE_CANDIDATES:** 21 pending, flat since yesterday. Last
  `/expand` pass still 4 (2026-07-22); posture bold. None
  promoted or rejected — zero promotions since the queue opened
  2026-07-02 (now 24 days running).
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3 `Cloud-Run:`-tagged commits in the trailing 24h
  (`deb73cb`, `0f19039`, plus this tick's own digest commit once
  it lands), well under the 8/24h ceiling — but `427eb91` shipped
  in the same window with no trailer at all, so it silently
  doesn't count toward the ceiling either (see Needs you /
  Tuning proposals).

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **Missing Cloud-Run trailer, `427eb91`** — the 2026-07-25
  20:20 UTC cloud tick's prompt block explicitly quoted the
  exact trailer line to append (confirmed in the run log,
  `gh run view 30173383094 --log`), yet the shipped commit
  (`critique: pass 8 — 2 findings (0 high, 1 med, 1 low)`) has
  no commit body at all. This is a live recurrence of
  `plan/PHASE_CANDIDATES.md`'s open `[score 6.5]` candidate
  ("Mechanically verify the Cloud-Run trailer on cloud ticks"),
  re-evidenced below rather than re-filed.
- **Candidate backlog** — 21 pending in
  `plan/PHASE_CANDIDATES.md`, zero promoted in 24 days. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite is still
  re-evidenced across four cycles (2026-07-06, -10, -13, -21)
  and remains the clearest promote-first candidate; worth an
  `/oversight` pass. Unchanged from yesterday's digest.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE holds
one LOW row (README.md:281's ungloseed "GitHub-as-DB" term);
AUDIT's highest open scorer excluding the blocked `#12` is now
`[A, 1.6]` (build plan's stale carry-over counts) or `[C/F,
1.6]` (fictional URL), both tied — either is a cheap, mechanical
next `/iterate` pick with no design judgment needed.

## Tuning proposals

Re-evidenced, not newly filed: `plan/PHASE_CANDIDATES.md`'s
open `[score 6.5]` candidate ("Mechanically verify the
Cloud-Run trailer on cloud ticks") already proposes a
post-agent `march.yml` step that diffs `HEAD` against the
pre-run SHA and opens an unlabeled issue if any new commit
lacks the trailer. This tick's pulse adds a second live
instance (`427eb91`, 2026-07-25 20:20 UTC) to the one the
candidate was filed against (`a74f7b6`, 2026-07-19) — two
misses observed across roughly 60 cloud ticks sampled by digest
passes to date, both silently undercounting the ceiling. Per
`skills/digest.md` §4, the fix belongs in the existing candidate
(gate tunings are proposals only, and this one is already
proposed); `/oversight` still owns promoting it.
