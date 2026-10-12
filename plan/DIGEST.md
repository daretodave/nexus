# Digest — 2026-10-12

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A third confirmed instance of the exact wasted-tick pattern
phase 20 exists to close hit overnight — and this time it
nested one level deeper (the delegated audit agent itself
fanned out three background sub-agents, then both it and the
tick above it ended their turns waiting on notifications that
can never arrive) — bookended by two ticks that shipped
cleanly, including one that closed a real user-filed issue
across seven files.

## While you were out

Window: since the last digest commit (2026-10-11 16:27 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-11 18:36 | march → iterate | Fresh A-G sweep (delegated, single foreground-awaited agent) found nothing new. Shipped CRITIQUE's queued LOW row instead: `playbooks/new-project.md`'s "usually phase 4 or 5" hedge (lines 471, 746) dropped its unexplained "4 or," matching the fixed "phase 5" convention everywhere else. Commit `b8aa764`. |
| 10-11 23:26 | march → iterate | Delegated the AUDIT sweep to a background agent; that agent itself spawned three further background sub-agents (doc-drift/completeness, link+voice, friction+freshness), then reported back "still running" instead of compiling. The tick above it accepted that hand-back and also ended its turn waiting — "I'll end this turn and wait for the background sub-agents' completion notifications." No commit; cloud ticks are stateless between invocations, so nothing resumed. Third confirmed instance of the phase-20 failure mode (prior: 10-09 19:14, 10-11 08:16, both previous digests), and the first to recur one dispatch level deeper than the two prior instances. |
| 10-12 08:35 | march → iterate | Fresh A-G sweep (again a single foreground-awaited agent — no async wait this time) found 2 findings. Shipped the higher-scoring one (`[A, 4.5]`): README's Hard Rule #6 claimed `pre-spec.md`'s interview was "the one carve-out" outside `/oversight`+`/bootstrap`, but `skills/lessons-pr.md` §3 already documents its own AskUserQuestion carve-out — a second, already-shipped exception the absolute phrasing missed. Reworded all seven live mentions (`README.md`, `concepts/architecture.md`, `concepts/asking-well.md` ×3, `playbooks/pre-spec.md`, `agents.md`, `skills/oversight.md`) to name both carve-outs, and added `lessons-pr.md` to asking-well.md's "used today" list. Closed `#75`. Commit `af8126c`. |

`heartbeat` ran green across the window (3 runs inside it, all
success, no flatline alarms). No `triage` or `loop:do`
activity; no open `triage:needs-user` issues.

## Shipped

- `b8aa764` — `playbooks/new-project.md`'s canonical-sibling
  phase number no longer hedges "4 or 5"; it agrees with step
  3's fixed substrate-phase count and the shipped template
  everywhere.
- `af8126c` — README's AskUserQuestion carve-out rule now names
  both exceptions (`/bootstrap`, `/lessons-pr`) instead of
  implying `pre-spec.md` is the only one, across all seven live
  mentions. Closes `#75`.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 50
  days blocked) and phase 32 (`#49`, 43 days blocked), both on
  the same cloud-push-token workflows-scope gap; unchanged this
  window.
- **AUDIT:** 4 pending (up from 3) — the three durable
  `[user-issue #N]` rows (`#40`, `#35`, `#49`, 0.8 each,
  unchanged) plus one fresh row from the 08:35 sweep: `[D/A,
  2.7, low confidence]` — `playbooks/new-project.md:705`'s
  "Common pitfalls" narrows the phase-count target to 12–17
  against the canonical "10–20" stated three times elsewhere,
  with no stated reason for the tighter band. Header fresh (the
  08:35 tick's own sweep, ~11h old).
- **CRITIQUE:** 0 pending, last pass 2026-10-10 (pass 25), 4
  commits since — nowhere near the 72h/8-commit gate.
- **PHASE_CANDIDATES:** 31 raw rows under `## Pending`
  (unchanged); 4 are stale `[promoted → phase N]` rows never
  relocated (already tracked by the filed score-3.5 candidate).
  True pending is 27 (23 >21d, oldest 102d, proposed
  2026-07-02).
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`) — `#75`
  closed this window by the 08:35 tick. No open
  `triage:needs-user` or `loop:do` issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both still need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  50/43 days blocked, unchanged in mechanism. The 10-11 23:26
  tick adds a third, more severe data point for the same
  already-scoped fix: the background-default dispatch bug now
  demonstrably recurs one delegation level deeper than the
  evidence phase 20 was written against, confirming the
  platform-default-backgrounding root cause applies wherever a
  sweep is further delegated, not just at the top dispatch.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (23 pending >21d,
  oldest 102d) — both silting thresholds (≥5 pending >21d,
  oldest >45d) stay cleared past their bar, same as every
  digest since the alarm shipped (phase 30).

## Today's intent

No pending build-plan phase (0 `[ ]` rows) — the loop routes to
`/iterate`'s audit queue. CRITIQUE is empty; AUDIT's top
non-durable row is the fresh `[D/A, 2.7, low confidence]`
phase-count hedge (`new-project.md:705`), which outscores the
three durable 0.8 rows but carries a flagged low-confidence
caveat (could be deliberate nuance, not drift) worth a human
glance before shipping. Neither the critique gate (4 commits /
2 days since pass 25) nor the expand gate (8 commits / 3 days
since pass 20, both under posture `bold`'s ≥20/>7d thresholds)
is due, so the next `/march` tick stays on `/iterate`.

## Tuning proposals

None filed this pass. The 10-11 23:26 tick's nested
background-dispatch failure is fresh evidence for an
already-filed, already-promoted item (phase 20 /
`plan/PHASE_CANDIDATES.md:546`), blocked only on the
push-token gap — re-filing would duplicate, not add a new
candidate. No other mistuned gate, starved queue, or
hibernating ceiling surfaced this window.
