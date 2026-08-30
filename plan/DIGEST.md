# Digest — 2026-08-30

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

One phase shipped overnight (30 — candidate-aging silt guard in
digest/expand); the ceiling then capped for three ticks running
at 8/8 weighted budget; AUDIT sits at ~46.5h old, still under
the 48h re-sweep threshold but close; and this is the first
digest run under phase 30's own new mechanism, which fires
immediately — all 21 pending phase candidates are >21 days old
and the oldest is 59 days, well past both silting thresholds.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-29 14:08 | march → ship-a-phase | shipped `e758f16`+`9b11149` — phase 30, candidate-aging silt guard in digest/expand (budget was 6/8 pre-ship) |
| 08-29 20:08 | march → (ceiling skip) | no-op — weighted budget 8/8, ceiling capped |
| 08-30 02:14 | march → (ceiling skip) | no-op — weighted budget 8/8, ceiling capped |
| 08-30 08:11 | march → (ceiling skip) | no-op — weighted budget 8/8, ceiling capped |

`heartbeat` ran green throughout (5/5 sampled).

## Shipped

- `e758f16` + `9b11149` — phase 30: `skills/digest.md` (+
  `templates/skills/digest.md`) gains a hand-derived >21-day
  pending count alongside the existing oldest-age number, plus
  a conditional "oversight needed: candidate queue silting"
  line in Needs you (fires when ≥5 candidates are pending >21
  days OR the oldest exceeds 45 days — OR, not AND, since
  either signal alone is real silting evidence). `skills/expand.md`
  (+ `templates/skills/expand.md`) gains an optional
  `last re-evidenced` candidate field: a signal that reinforces
  an already-pending candidate updates that row instead of
  filing a duplicate. Doc-only per the promoted candidate's
  scope — no `scripts/pulse.mjs` change; the >21-day count is a
  hand-count from rows the digest step already reads.

## Queues now

- **Build plan:** 30/33 shipped, 3 pending, 1 blocked (phase 20,
  cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]` is
  phase 31 (`scripts/install-hooks.mjs` opt-in pre-commit gate,
  score 6.7, oversight-promoted 2026-08-23).
- **AUDIT:** header ~46.5h old (last touched 2026-08-28 12:00,
  phase 28's own sibling finding) — still under the 48h
  threshold, no re-sweep due this tick, but the next tick will
  almost certainly cross it. Same 7 rows Pending as the last two
  digests: durable `[user-issue #40]` and `[user-issue #35]`,
  `[F, 3.6]` (`CLOUD_LOOP.md`'s Sonnet/Opus id-hedging gap, top
  scorer), `[C, 2.7]` (`PHASE_CANDIDATES.md`'s stale `digest.md
  §4` citation), `[C, 2.4]` (triage.md's dead `ship-data.md §6`
  citation), `[A, 2.4]` (`templates/claude/hooks/guard.mjs`'s
  regex drift from phase 28's hardened copy), `[A, 1.35]`
  (cloud-loop.md's "three new files" header).
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW), last pass 2026-08-25
  (5 days ago, pass 12), unchanged. Gate not due — the pending
  HIGH row (README's AskUserQuestion contradiction) suppresses
  re-trigger regardless of the 72h clock, per `skills/march.md`
  §Step 2.
- **PHASE_CANDIDATES:** 21 pending mechanically per `pulse.mjs`
  (4 of those still carry a stale `[promoted 2026-08-23 → phase
  N]` tag from phases 19-22 that was never relocated into
  `## Promoted` — pre-existing filing drift, unchanged this
  window). Under phase 30's new hand-count rule: **all 21**
  pending rows carry a `- proposed:` date more than 21 days old
  (earliest qualifying cutoff 2026-08-09; the newest proposed
  date in the whole Pending section is still 2026-07-24).
  Oldest pending candidate is 59 days (proposed 2026-07-02).
  Header still 2026-08-02 (pass 6). Posture still bold.
- **Issues:** 3 open — `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud token issue, phase 20), `#34` (phase-20
  mirror, open until phase 20 ships). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** phase 30 landed at 6/8 pre-ship weighted budget;
  its own weight-3 pushed the trailing-24h window to 8/8, where
  it sat for three consecutive ticks (20:08, 02:14, 08:11). Both
  phase 29's and phase 30's commits are still inside the 24h
  window as of this digest, so the next `march` tick is likely
  to skip again until one of them ages out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 59d).** Both trigger conditions from phase 30's new
  guard are met (≥5 pending >21d, and oldest >45d) — this is the
  first tick to surface the line, since the guard itself shipped
  this window. The queue has been aging since the 2026-08-23
  oversight pass that last promoted candidates (7 phases' worth);
  nothing has been promoted or rejected since. Worth an
  `/oversight` pass to triage the 21 pending rows — promote,
  reject, or re-evidence.
- **Issue #35 / Phase 20** — nexus's own cloud push token still
  can't write `.github/workflows/*.yml`. Needs a local session
  to inspect `ACTIONS_PAT`'s actual scope grants and test a
  plain `git push` against a workflow file with that token.
- **Issue #40 / phase 23 follow-up** — the identical wall on
  nexus's own `march.yml`/`night.yml` crash-alarm patch. The
  issue body carries a ready `git apply`-able diff; needs the
  same local, human-authenticated push as #35.
- No `[needs-user-call]` rows.

## Today's intent

Build plan's next `[ ]` is phase 31 — `scripts/install-hooks.mjs`
opt-in pre-commit gate. `plan/AUDIT.md`'s top row stays
`[F, 3.6]` (`CLOUD_LOOP.md`'s Opus-4.8 hedge gap), competing
against `plan/CRITIQUE.md`'s HIGH row (the AskUserQuestion
documentation contradiction, now 5 days old) on the next
`/iterate` tick — the HIGH row should still win on score. Beyond
the loop's own dispatch, the queue-silting line above is the
thing most worth a human's attention today.

## Tuning proposals

None new this tick. The three-skip ceiling stretch (20:08,
02:14, 08:11) is the gate doing its job after landing two
phases (29 and 30) within the trailing 24h window, not
hibernating a productive day — no fix needed. The candidate
queue silting is real and now surfaced mechanically by phase
30's own guard exactly as designed — that guard is the fix, and
it just shipped; filing a second candidate for the same gap
would be duplicate noise. The `[promoted]`-tag filing gap in
`plan/PHASE_CANDIDATES.md` (4 rows un-relocated) is unchanged
and stays a filing-convention drift, not a gate mistuning.
