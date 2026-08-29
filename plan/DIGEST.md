# Digest — 2026-08-29

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

One phase shipped overnight (29 — dual-shell parity lint leg
for playbooks); the ceiling spent the rest of the window
capped from yesterday's three-phase run and cleanly skipped
three ticks in a row before freeing up enough room for phase
29 to land; AUDIT stayed fresh (~22.5h old) so no re-sweep was
due, and both queues (AUDIT, CRITIQUE) are unchanged from
yesterday's digest.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-28 11:51 | march → ship-a-phase | shipped `bcd7326`+`2c2e90c` — phase 28 (already covered in yesterday's digest) |
| 08-28 18:01 | march → (ceiling skip) | no-op — weighted budget 9/8, ceiling capped |
| 08-28 21:57 | march → (ceiling skip) | no-op — weighted budget 9/8, ceiling capped |
| 08-29 02:12 | march → (ceiling skip) | no-op — weighted budget 8/8, ceiling capped |
| 08-29 08:11 | march → ship-a-phase | shipped `c8d5255`+`d4d7470` — phase 29, dual-shell parity lint leg for playbooks (budget was 4/8 pre-ship) |

`heartbeat` ran green throughout (5/5 sampled, ~5-6h cadence).

## Shipped

- `c8d5255` + `d4d7470` — phase 29: a dual-shell parity lint
  leg for `playbooks/`, added to `scripts/verify.mjs`'s leg
  chain alongside the existing `dualshell` check (per commit
  title; templates/plan cross-references updated in the same
  commit per the templates-are-public-API rule).

## Queues now

- **Build plan:** 29/33 shipped, 4 pending, 1 blocked (phase 20,
  cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]` is
  phase 30 (candidate-aging silt guard in digest/expand, score
  6.9, oversight-promoted 2026-08-23).
- **AUDIT:** header ~22.5h old (last touched 2026-08-28 12:00,
  phase 28's own sibling finding) — under the 48h threshold, no
  re-sweep due. Same 7 rows Pending as yesterday: durable
  `[user-issue #40]` and `[user-issue #35]`, `[F, 3.6]`
  (`CLOUD_LOOP.md`'s Sonnet/Opus id-hedging gap, top scorer),
  `[C, 2.7]` (`PHASE_CANDIDATES.md`'s stale `digest.md §4`
  citation), `[C, 2.4]` (triage.md's dead `ship-data.md §6`
  citation), `[A, 2.4]` (`templates/claude/hooks/guard.mjs`'s
  regex drift from phase 28's hardened copy), `[A, 1.35]`
  (cloud-loop.md's "three new files" header).
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW), last pass 2026-08-25
  (4 days ago, pass 12). Gate not due — the pending HIGH row
  (README's AskUserQuestion contradiction) suppresses re-trigger
  regardless of the 72h clock, per `skills/march.md` §Step 2.
- **PHASE_CANDIDATES:** 17 genuinely pending, 14 promoted total.
  `pulse.mjs` reports 21 pending mechanically — 4 rows still
  carry a `[promoted 2026-08-23 → phase N]` tag (phases 19-22)
  but were never relocated from `## Pending` into `## Promoted`,
  so the raw `### ` count over-reads by 4. Pre-existing filing
  drift, not new this window; noted here rather than fixed
  (ship-nothing-else rail). Header still 2026-08-02 (pass 6);
  oldest genuinely pending candidate now 58 days old. Posture
  still bold.
- **Issues:** 3 open — `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud token issue, phase 20), `#34` (phase-20
  mirror, open until phase 20 ships). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** phase 29 landed at 4/8 weighted budget; with its
  own weight-3 added, the trailing-24h window sits near 7/8 as
  of this tick, so the next `march` run is likely to skip again
  until phase 28's or 29's commits age out of the window.

## Needs you

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

Build plan's next `[ ]` is phase 30 — candidate-aging silt
guard in digest/expand, which (per its promoted-candidate scope
note) targets `/digest` gaining a standing "candidates pending
>21 days" line and `/expand` stamping a `last re-evidenced`
date — not the `[promoted]`-tag filing gap noted above, which
stays an open loose end. `plan/AUDIT.md`'s top row stays
`[F, 3.6]` (`CLOUD_LOOP.md`'s Opus-4.8 hedge gap), competing
against `plan/CRITIQUE.md`'s HIGH row (the AskUserQuestion
documentation contradiction, now 4 days old) on the next
`/iterate` tick — the HIGH row should still win on score.

## Tuning proposals

None new this tick. The ceiling's three-skip stretch (18:01,
21:57, 02:12) is the gate doing its job after yesterday's
three-phase run, not hibernating a productive day — no fix
needed. The `[promoted]`-tag filing gap in
`plan/PHASE_CANDIDATES.md` (4 rows un-relocated, inflating
`pulse.mjs`'s mechanical count by 4) is real but isn't a gate
mistuning — it's a filing-convention drift closer to an AUDIT
row than a tuning candidate, and AUDIT isn't due for a re-sweep
this tick. The candidate queue's silting itself (17 pending,
oldest 58 days, header stale since pass 6) is already queued as
build-plan phase 30 — filing a second candidate for the same
gap would be duplicate noise.
