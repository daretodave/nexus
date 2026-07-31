# Digest — 2026-07-31

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four clean back-to-back march ticks, four shipped fixes, zero
no-ops and zero crashes — the cleanest 24h window logged yet —
closing two auto-filed issues (#31, #32) along the way; queues
otherwise steady (AUDIT down to 4 open rows plus the durable
blocked one, CRITIQUE empty and not yet due, candidates flat at
21 with a 29-day promotion drought).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-30 14:47 | march → iterate | fresh A-G sweep (header ~24h old); shipped `[B/E, 6.3]` — `existing-project.md`'s brownfield overlay copied only `deploy-check.mjs` from `templates/scripts/`, missing seven other scripts the bulk-copied skills/settings already assume exist (`0245df6`, closes #31); six lower-scoring findings queued to AUDIT Pending |
| 07-30 20:27 | march → iterate | shipped AUDIT `[A, 5.4]` — `skills-anatomy.md`'s "seven (or eight) skills" count reworded to drop the hardcoded, drift-prone number (`019970b`) |
| 07-31 03:05 | march → iterate | shipped AUDIT `[C, 4.0]` — `iterate.md`'s `ship-data.md` audit-pass citation was §6, corrected to §7 (`8bb0f73`, closes #32) |
| 07-31 09:02 | march → iterate | shipped AUDIT `[D, 3.6]` — three doc H1s (`cloud-loop.md`, `auth-aware-critique.md`, `branding.md`) missing their sibling family's prefix (`1c34db1`) |
| 07-31 11:16 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `0245df6` — closed AUDIT `[B/E, 6.3]`: brownfield overlay now
  bulk-copies all of `templates/scripts/`, matching
  `new-project.md`. Reproduced the gap in a scratch dir first.
- `019970b` — closed AUDIT `[A, 5.4]`: dropped the stale "seven
  (or eight) skills" hardcoded count in `skills-anatomy.md`.
- `8bb0f73` — closed AUDIT `[C, 4.0]`: `iterate.md`'s
  `ship-data.md` section citation corrected §6 → §7.
- `1c34db1` — closed AUDIT `[D, 3.6]`: three doc H1s now carry
  their sibling family's `# Playbook:`/`# Customization:` prefix.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header `2026-07-30` (~20h old this tick, under the
  48h refresh threshold — no re-sweep needed). 4 non-blocked
  Pending rows left, all `impact 3` cosmetic drift: `[A, 2.7]`
  (three docs still describe/quote the old, shorter
  `templates/claude/CLAUDE.md`), `[C, 2.4]` (two docs cite
  `skills/digest.md §4` for content actually in §3 item 4),
  `[A, 2.4]` (`templates/plan/README.md`'s layout tree omits
  `CURRENT-STATE.md`), `[A, 1.35]` (`cloud-loop.md`'s "three new
  files" header lists only two). Standing `[user-issue #12]`
  unchanged since 2026-07-12 (19 days), still the durable
  blocked top row.
- **CRITIQUE:** 0 pending. Last pass 2026-07-28 (pass 9). Not yet
  due — 9 commits / ~63h since, approaching but still below both
  the 12-commit and 72h triggers.
- **PHASE_CANDIDATES:** 21 pending, flat — no `/expand` tick ran
  this window. Posture still bold. Zero promotions since the
  queue opened 2026-07-02, now 29 days running.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. #31 and #32 both auto-filed and closed
  within this window by the ticks that fixed them. No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 4 `Cloud-Run:`-tagged commits in the trailing
  24h, all four carrying the trailer correctly (no recurrence of
  the trailer-gap candidate below) — well under the 8/24h
  ceiling.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml` still
  needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues only,
  so the cloud loop can never push to `.github/workflows/*.yml`
  itself. Needs a human, or a locally-run `/iterate` with a
  personal workflow-scoped `gh` token. Tracked as AUDIT
  `[user-issue #12]`, still the only blocked row.
- **Candidate backlog** — 21 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted in 29 days. The `[score 9.0]`
  `new-project.md` step-4/7 rewrite remains the clearest
  promote-first candidate (six re-evidencing cycles to date);
  worth an `/oversight` pass. Unchanged in substance from prior
  digests, no new evidence this window.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE is close
to its due threshold but not there yet. AUDIT's own top-scoring
open row, `[A, 2.7]` (the stale "old CLAUDE.md" description
across three docs), is the clean next `/iterate` pick over the
three remaining `2.4`/`1.35` rows.

## Tuning proposals

None new this tick. This window is the cleanest sampled to date
— four march ticks, four green runs, four shipped commits, zero
no-ops, zero crashes — which argues against, not for, a gate
retune. All four commits carried the `Cloud-Run:` trailer
correctly, continuing to hold against the trailer-gap candidate
already filed in `plan/PHASE_CANDIDATES.md` (no fresh evidence
either way, since no `/critique` commit landed this window — that
gap has only ever been observed on critique-verb commits). The
29-day candidate-promotion drought is a standing observation (see
"Needs you" above), not a gate defect: `/oversight` is the only
skill that promotes, and it's user-in-the-loop by design, so its
cadence isn't this loop's tuning to propose. Per `skills/digest.md`
§4, gate tunings remain proposals only.
