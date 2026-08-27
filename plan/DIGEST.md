# Digest — 2026-08-27

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean, productive day — triage cleared its one issue, phases
24 and 25 both shipped (the pulse instrument panel and its
adopt-dry-run twin), and the ceiling caught the day exactly at
its cap; the 48h-stale audit got a full A-G re-sweep tonight
that came back clean bar four already-tracked rows, one of
which shrank to a cheaper single-file fix.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-26 14:16 | march → triage | shipped `67fd00e` — 1 issue routed |
| 08-26 20:48 | march → ship-a-phase | shipped `65205bd` + `cdfb446` — phase 24, `scripts/pulse.mjs` |
| 08-27 03:45 | march → ship-a-phase | shipped `58f3c27` + `e1b2d00` — phase 25, `scripts/adopt-dryrun.mjs` |
| 08-27 11:24 | march → (ceiling skip) | no-op — cloud ceiling reached (8/8 weighted budget/24h); exited clean, no work this tick |

`heartbeat` ran green throughout (8/8 sampled, ~6h cadence).

## Shipped

- `67fd00e` — triage: 1 issue routed (no repo content changed
  beyond the queue).
- `65205bd` + `cdfb446` — phase 24: `scripts/pulse.mjs`, the
  offline instrument panel (queue Pending counts, last-commit
  age, build-plan pending/blocked rows, candidate silt — reads
  git locally, never the network). This tick used it directly
  for the pulse gather step above.
- `58f3c27` + `e1b2d00` — phase 25: `scripts/adopt-dryrun.mjs`,
  mechanizing the step-4 dry-run adoption walk (copy array +
  placeholder sweep into a temp dir, asserts zero unresolved
  tokens and the expected manifest) as an opt-in verify leg.
  Tonight's audit sweep ran it directly and confirmed it green.

## Queues now

- **Build plan:** 25/33 shipped, 8 pending, 1 blocked (phase 20,
  cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]` is
  phase 26 (issue templates keyed to triage routes).
- **AUDIT:** header refreshed tonight (was 51h old, past the
  48h threshold) — fresh A-G sweep, delegated to protect
  context. 6 rows Pending: durable `[user-issue #40]` and
  `[user-issue #35]` (both reconfirmed open/blocked via `gh
  issue view`), `[F, 3.6]` (`CLOUD_LOOP.md`'s inconsistent
  Sonnet/Opus id-hedging, top scorer), `[C, 2.7]`
  (`plan/PHASE_CANDIDATES.md`'s stale `digest.md §4` citation —
  narrowed from a two-file row after `plan/DIGEST.md`'s half
  was fixed by an intervening tick), `[C, 2.4]` (triage.md's
  dead `ship-data.md §6` citation), `[A, 1.35]`
  (cloud-loop.md's "three new files" header). No new findings —
  a genuine clean sweep.
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW), last pass 2026-08-25
  (pass 12, 2 days ago). Gate not due this window.
- **PHASE_CANDIDATES:** 17 pending, 14 promoted. Header still
  2026-08-02 (pass 6) — oldest pending candidate now 57 days old.
  Posture still bold.
- **Issues:** 3 open — `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud token issue, phase 20), `#34` (phase-20
  mirror, open until phase 20 ships). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** hit its cap exactly once this window (8/8
  weighted budget at the 11:24 tick, driven by two weight-3
  phase-shipping commits back to back). Working as designed —
  a genuinely productive day, not an overheating or starved one.

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

Build plan's next `[ ]` is phase 26 — issue templates keyed to
triage routes. `plan/AUDIT.md`'s top row after tonight's refresh
is `[F, 3.6]` (`CLOUD_LOOP.md`'s Opus-4.8 hedge gap), which will
compete against `plan/CRITIQUE.md`'s HIGH row (the
AskUserQuestion documentation contradiction, 2 days old) on the
next `/iterate` tick — the HIGH row should win on score. Note
for whoever next promotes candidates: the candidate-queue-silt
signal below (57 days oldest pending) already has its fix queued
as build-plan phase 30 (candidate-aging silt guard), just not
yet shipped — draining phases 26-29 first would surface it.

## Tuning proposals

None new this tick. The candidate queue's silting (17 pending,
oldest 57 days) is a real instance of `skills/digest.md` §3
step 4's "starved queue" trigger, but a fix is already queued
as build-plan phase 30 (promoted 2026-08-23) rather than shipped
— filing a second candidate for the same gap would be
duplicate noise, not a new signal. The ceiling behaved exactly
as designed this window (one clean cap-out after two genuine
phase ships, not a hibernation pattern); no mistuning signal
there either.
