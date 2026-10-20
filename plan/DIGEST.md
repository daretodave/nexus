# Digest — 2026-10-20

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet, healthy day: three `march` ticks since last night's
digest, one no-op and a clean critique → fix pair — pass 27
found one HIGH and one MED friction point in the dry-run
adoption walk, and the very next tick shipped the HIGH fix
(agents.md's no-trailer rule now covers harness-injected
attribution trailers). The MED row, the two blocked phases, and
the silting candidate queue are all unchanged.

## While you were out

Window: since the last digest commit (2026-10-19 17:15 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-19 23:17 | march | No-op — no gate due, no AUDIT/CRITIQUE row cleared the ship floor. |
| 10-20 07:08 | march → critique | Pass 27: 2 findings (1 HIGH, 1 MED) from a fresh dry-run adoption walk. Commit `ec8238d`. |
| 10-20 13:19 | march → iterate | Shipped the HIGH row: agents.md rule 2's no-trailer stance had no carve-out for harness-injected attribution, and the guard hook hard-blocked the resulting commit — reproduced directly. Fixed in `agents.md`, `templates/agents.md`, and `prompts/adopt.md`. Commit `1fd6a1a`. |

`heartbeat` ran green throughout the window (5/5 success) — no
flatline alarms, consistent with `march` never going quiet for
longer than one tick.

## Shipped

- `ec8238d` — critique pass 27: 2 findings (1 HIGH, 1 MED), dry-run
  adoption walk delegated to a fresh sub-agent.
- `1fd6a1a` — closed the HIGH row: documented how to strip a
  harness-injected attribution trailer before every commit,
  since the kit's own no-trailer rule overrides that convention
  here. CRITIQUE row moved Pending → Done in the same commit.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 58
  days blocked) and phase 32 (`#49`, 51 days blocked), both on
  the same cloud-push-token workflows-scope gap; unchanged this
  window.
- **AUDIT:** 4 pending, unchanged. Header dated 2026-10-19
  (<48h old), so no refresh was due this tick. Three durable
  `[user-issue #40/#35/#49]` rows (0.8 each, still blocked) and
  the carried `[D/A, 2.7, low confidence]` row (new-project.md's
  "12-17" vs "10-20" phase count) remain Pending.
- **CRITIQUE:** 1 pending (the MED row from pass 27 —
  `playbooks/new-project.md`'s agents.md-prune step has no
  mechanical check, unlike the copy+sweep step). Last pass
  today (2026-10-20), nowhere near the 72h/12-commit gate.
- **PHASE_CANDIDATES:** 31 raw rows under `## Pending` (4 are
  stale `[promoted]` rows never relocated — already tracked by
  the filed score-3.5 candidate, unchanged). True pending is 27
  (25 >21d, oldest 111d per `pulse.mjs`, proposed 2026-07-02).
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`),
  unchanged this window. No open `triage:needs-user` or
  `loop:do` issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both still need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  58/51 days blocked, unchanged in mechanism.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (25 pending >21d,
  oldest 111d) — both silting thresholds (≥5 pending >21d,
  oldest >45d) stay cleared, same standing alarm as every
  digest since phase 30. The score-3.5 `pulse.mjs` double-count
  candidate that would relocate the 4 stale `[promoted]` rows
  is still unpromoted.

## Today's intent

No pending build-plan phase (0 `[ ]` rows); critique gate not
due (pass 27 ran this morning, 0 commits since); expand gate
not due (3 commits / ~5 days since pass 23, posture `bold`
needs ≥20 commits or >7 days). The next `/march` tick falls
through to `/iterate`, whose combined queue holds one fresh
CRITIQUE MED row (bands 5-7) outscoring the three durable
blocked AUDIT rows (0.8 each) and the low-confidence `[D/A,
2.7]` row — expect it to ship the agents.md-prune-mechanization
fix next.

## Tuning proposals

None filed this pass. The one new signal worth naming isn't a
mistuned gate: `pulse.mjs`'s critique "last pass" age is
computed from the header date at `T00:00:00Z` rather than the
actual commit timestamp, so it read "15h ago" this morning when
the real gap to pass 27's commit was ~8h. The error is bounded
well under a day and the critique gate's threshold is 72h, so
it has never once flipped a dispatch decision — not worth a
candidate on its own.
