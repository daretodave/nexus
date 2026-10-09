# Digest — 2026-10-09

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three ticks, one clean no-op: `/iterate` closed #74's repeat
AskUserQuestion-carve-out bug (same class as README Hard Rule
#6, this time in `pre-spec.md`), `/expand` filed pass 20's one
new candidate (arm `CLAUDE_CODE_RETRY_WATCHDOG` against the
429/529 crashes AUDIT's own blocked rows can't touch), and the
morning tick found nothing fresh to score and deferred cleanly.
No gate drift, no orphaned delegations.

## While you were out

Window: since the last digest commit (2026-10-08 17:40 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-08 19:39 | march → iterate | Shipped the AUDIT-native `[A, 3.6]` row flagged in yesterday's digest: `playbooks/pre-spec.md:41,48` restated the AskUserQuestion carve-out naming only `/oversight`, omitting `/bootstrap`. Reworded both mentions and pointed the second back at the first. Closes #74. Verify green. Commit `6df4764`. |
| 10-09 00:07 | march → expand | Pass 20: no urgent issues, critique gate not due, no pending build-plan phase, iterate's queue held only the three durable 0.8-score blocked rows (below ship threshold) — dispatched to `/expand` per failure-mode 1 (posture bold). Signal E found three new Claude Code versions since pass 19; filed a score-6.5 candidate to arm `CLAUDE_CODE_RETRY_WATCHDOG` so transient 429/529s get ridden out instead of crash-alarming. Commit `dc900a9`. |
| 10-09 08:28 | march → iterate → (deferred) | Same three durable blocked rows, still none ≥3.0; expand's own signal sources unchanged since 8h earlier. **Clean no-op — no commit.** |

`heartbeat` ran green across the window (5/5 success, no
flatline alarms). No `triage` or `loop:do` activity.

## Shipped

- `6df4764` — `pre-spec.md`'s AskUserQuestion carve-out now
  names both `/oversight` and `/bootstrap`, closing #74.
- `dc900a9` — `expand` pass 20, one new candidate filed (score
  6.5, retry-watchdog env var).

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 47
  days blocked) and phase 32 (`#49`, 40 days blocked), both on
  the same cloud-push-token workflows-scope gap; unchanged this
  window.
- **AUDIT:** 3 pending — the three durable `[user-issue #N]`
  rows (`#40`, `#35`, `#49`), all impact 4 × ease 2 = 0.8, same
  root cause (GitHub App installation token overrides
  `ACTIONS_PAT` for `.github/workflows/*.yml` pushes). No fresh
  row this pass; header still <24h old (last touched by the
  `6df4764` commit).
- **CRITIQUE:** 0 pending, last pass 2026-10-07 (pass 24); not
  due again yet.
- **PHASE_CANDIDATES:** 31 raw rows under `## Pending`, 4 are
  stale `[promoted → phase N]` rows never relocated (phases
  19/20/21/22, promoted 2026-08-23) — already tracked by the
  filed score-3.5 candidate (`plan/PHASE_CANDIDATES.md:1076`).
  True pending is 27 (22 >21d, oldest 100d, proposed 2026-07-02).
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`) —
  unchanged this window. No open `triage:needs-user` or
  `loop:do` issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both still need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  47/40 days blocked, unchanged in mechanism. `#40` (apply
  phase 23's patch by hand) shares the same root cause and
  waits on the same session.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (22 pending >21d,
  oldest 100d) — both silting thresholds (≥5 pending >21d,
  oldest >45d) stay cleared past their bar, same as every
  digest since the alarm shipped (phase 30).

## Today's intent

No pending build-plan phase (0 `[ ]` rows). CRITIQUE gate not
due (last pass 2026-10-07, pass 24). So the next `/march` tick
again falls to `/iterate`, which will score the same three
durable 0.8-score blocked rows (`#40`/`#35`/`#49`, not
cloud-actionable) and — finding nothing ≥3.0 — defer to
`/expand` per failure-mode 1, same as this morning's tick,
unless a fresh issue or CRITIQUE row lands first.

## Tuning proposals

None filed this pass. No mistuned gate, starved queue, or
hibernating ceiling surfaced in this window's pulse — two clean
ships plus one clean no-op, no orphaned delegations. The two
standing structural signals (candidate-queue silting, the
PHASE_CANDIDATES stale-relocation rows) are unchanged from
yesterday and already tracked as candidates (score 3.5 and the
phase-30 alarm itself); re-filing either here would duplicate,
not add evidence.
