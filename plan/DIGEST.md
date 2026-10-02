# Digest — 2026-10-02

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four ticks, two shipped: an `/expand` re-evidencing pass and a
fresh `/iterate` A-G sweep that fixed one doc citation and queued
three more, lower-scoring findings; the other two were clean
no-ops (nothing cleared the 3.0 ship floor). The candidate queue
keeps silting past its own alarm threshold with no cloud-side
relief valve by design.

## While you were out

Window: since the last digest commit (2026-10-01 17:07 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-01 19:15 | march → iterate → expand | no pending build-plan phase, queues sub-floor; `/expand` found nothing new beyond a changelog re-check (Claude Code still v2.1.287) and re-evidenced the standing "auto mode" candidate instead of filing a duplicate. Commit `77e7d53`. |
| 10-01 23:40 | march → iterate → expand → oversight audit | clean no-op — zero new signals since the previous tick 4.3h earlier. No commit. |
| 10-02 07:55 | march → iterate → expand → oversight audit | clean no-op — same floor/gate state as the prior tick. No commit. |
| 10-02 14:26 | march → iterate | AUDIT header was ~30h old (past iterate's 24h threshold); ran a fresh A-G sweep (delegated the read-only pass, verified by hand before shipping). D/E/G swept clean; A/B/C/F each turned up one new row. Shipped the top scorer — `customization/moderation-loop.md` cited the wrong Level 4 pre-flight item number (8 instead of 9) for the UGC mod-drain confirmation — and queued three more lower-scoring rows (`[C,3.6]`, `[A/B,2.4]`, `[F,2.4]`) to AUDIT. Commit `274d015`. |

`heartbeat` ran green across the window (5/5 success, no
alarms). No gate failures — both shipping ticks committed clean
on the first pass.

## Shipped

By `/march` this window (see table above): `/expand` pass 17's
re-evidencing of the standing auto-mode candidate (no new
candidate filed, commit `77e7d53`) and `/iterate`'s fresh A-G
sweep fixing the moderation-loop.md item-number citation
(commit `274d015`, three more AUDIT rows queued, not shipped).
This digest ships nothing beyond itself — no doc fixes, no
template edits, per its own rails; `plan/AUDIT.md`'s content is
same-day fresh (last full sweep 2026-10-02 14:38 UTC, this
window's second tick) even though its literal H1 still reads
"2026-10-01" — a known gap already tracked by the pending
score-4.2 candidate — so no refresh action needed this pass.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 40
  days blocked) and phase 32 (`#49`, 33 days blocked), both
  still on the same cloud-push-token workflows-scope gap;
  unchanged this window, still needs a local `/ship-a-phase` or
  `/oversight` session with normal repo-write push.
- **AUDIT:** 9 pending rows (net +3 this window — today's sweep
  added three, shipped one). Top score is now `[C, 3.6]`
  (`templates/skills/jot.md` mis-cites `iterate.md`'s scoring
  section) — still below the 3.0-plus-margin bar most ticks ship
  at, but the closest row to clearing it. The rest: two more
  fresh low-score rows (`[A/B,2.4]`, `[F,2.4]`), the durable
  blocked/external-issue rows (`#67`, `#54`, `#40`, `#35`, `#49`,
  all ≤0.8), and the pre-existing `[F, ~2]` model-id hedge gap.
  CRITIQUE Pending still empty. Last critique pass 3d ago (pass
  22, 2026-09-30).
- **PHASE_CANDIDATES:** 30 pending (24 >21d), oldest 93d
  (proposed 2026-07-02, unchanged row) — flat vs. yesterday, no
  new candidate filed this window (pass 17 only re-evidenced an
  existing row). Raw count still includes four `[promoted …]`
  rows never relocated out of `## Pending` (real actionable
  pending is 26) — already filed as its own candidate (score
  3.5, 2026-09-29), still pending, not yet promoted.
- **Issues:** 7 open (`#67`, `#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`) — unchanged from yesterday; no new issues opened
  or closed by this window's ticks.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't —
  unresolved, now 40/33 days blocked respectively.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (24 pending >21d,
  oldest 93d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) are cleared, same as every digest since the alarm shipped
  (phase 30); the queue's own aging-silt fix (score 3.5) is
  itself one of the 24.

## Today's intent

No `[ ]` build-plan rows remain — per `skills/march.md` §3 the
next tick dispatches to `/iterate`'s audit queue. Top AUDIT
finding is `[C, 3.6]`: `templates/skills/jot.md` cites
`iterate.md`'s `§Scoring` section for the `/jot` user-source
`+0.5` bump, which actually lives under a `§User-source bump`
heading — a one-line citation fix, likely the next thing shipped
once it, or something fresher, clears whatever floor the next
tick applies.

## Tuning proposals

None this pass. The one live mistune signal (candidate-queue
silting) already has its own pending candidate (score 3.5,
2026-09-29); nothing else in this window's pulse — two clean
no-ops dispatching correctly through the full march chain, one
clean AUDIT sweep, zero gate failures — suggests a gate, cadence,
or ceiling needs re-tuning.
