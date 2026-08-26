# Digest — 2026-08-26

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Phase 23 shipped (the cloud crash-alarm no longer shares its
own watched failure mode), a transient rate-limit crash got
triaged and closed same-day, and the ceiling caught exactly
one overheating tick — but phase 23's own follow-up re-hit the
identical workflows-scope wall already blocking phase 20, this
time on nexus's own alarm fix, and needs a second local
human-applied patch (issue #40, same root cause as #35).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-25 14:16 | march → (crashed pre-dispatch) | **failed** — Claude API 429 rate-limit mid-turn; auto-filed issue #38 per the crash-alarm |
| 08-25 20:06 | march → triage | no-op commit-wise — closed #38 as a transient 429 flake, consistent with prior precedent (#30); no repo file changed |
| 08-26 02:26 | march → ship-a-phase | shipped `33d4ccf` + `8dc2080` — phase 23, cloud tick failure auto-alarm (`templates/` mirror: `GITHUB_TOKEN` survives PAT death, alarm now names the failed step); nexus's own `march.yml`/`night.yml` half blocked by the same workflows-scope wall as phase 20 — filed issue #40 with the exact diff for a human to apply |
| 08-26 08:15 | march → (ceiling skip) | no-op — cloud ceiling reached (9/8 weighted budget/24h); exited clean, no work this tick |

`heartbeat` ran green every ~6h throughout (5/5 sampled).

## Shipped

- `33d4ccf` + `8dc2080` — phase 23: cloud tick failure
  auto-alarm. The 2026-08-02 → 2026-08-23 outage went silent
  for 21 days because the crash-alarm step itself authenticated
  with the same dead `ACTIONS_PAT` it was meant to catch;
  `templates/.github/workflows/march.yml` + `night.yml` now
  authenticate that step with `GITHUB_TOKEN` (minted fresh per
  run, survives PAT death) and name which step failed.
  Nexus's own workflow files need the identical patch applied
  by hand — filed as issue #40 (same class of constraint phase
  17 and phase 20 already hit: a cloud tick's git credential is
  a GitHub App installation token that GitHub refuses for any
  push touching `.github/workflows/*.yml`).

## Queues now

- **Build plan:** 22/33 shipped, 10 pending, 1 blocked (phase
  20, cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]`
  is phase 24 (`scripts/pulse.mjs`).
- **AUDIT:** header still 2026-08-25 — under the 48h threshold,
  no refresh due. 4 rows Pending, unchanged: durable
  `[user-issue #35]`, `[F, 3.6]` (`CLOUD_LOOP.md`'s inconsistent
  Sonnet/Opus id-hedging), two `[C, 2.4]` dead-section
  citations.
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW), last pass 2026-08-25
  (pass 12). Gate not due this window (2 commits since, well
  under the ≥12-commit / >72h thresholds).
- **PHASE_CANDIDATES:** 17 pending, 14 promoted. Header still
  2026-08-02 (pass 6) — `/expand`'s to refresh; the pending-phase
  gate (3a) keeps outranking it while phases remain queued.
  Posture still bold.
- **Issues:** 3 open — `#40` (new this window, unlabeled — next
  tick's triage gate fires on it first), `#35` (blocking cloud
  token issue, phase 20), `#34` (phase-20 mirror, open until
  phase 20 ships). No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** hit its cap exactly once this window (9/8
  weighted budget at the 08:15 tick, driven by phase 23's
  weight-3 phase-shipping commit stacked on the prior window's
  churn); the 20:06 no-op tick ran at 5/8, well clear. Working
  as designed, not starved or overheating.

## Needs you

- **Issue #35 / Phase 20** — nexus's own cloud push token still
  can't write `.github/workflows/*.yml`. Needs a local session
  to inspect `ACTIONS_PAT`'s actual scope grants and test a
  plain `git push` against a workflow file with that token.
- **Issue #40 / phase 23 follow-up (new this window)** — a
  second, independent reproduction of the identical wall: this
  time on nexus's own `march.yml`/`night.yml` crash-alarm fix.
  The issue body carries the exact `git apply`-able diff;
  applying it needs a local, human-authenticated push (the same
  workaround phase 17's precedent used). Worth applying
  alongside whatever resolves #35, since both share one root
  cause.
- No `[needs-user-call]` rows.

## Today's intent

Next tick's triage gate fires first (issue #40 is unlabeled) —
expect it routed the same way `#35` was: an AUDIT row awaiting
a local session, not a guess-close, since the fix needs a push
right through the app-token wall. Once triage clears, the
build plan's next `[ ]` is phase 24 — `scripts/pulse.mjs`, the
offline instrument panel that would have hand-assembled this
exact digest's queue counts from one hermetic script instead of
six file reads and two `gh` calls.

## Tuning proposals

None new this tick. Issue #40 is a second occurrence of the
exact failure class `[user-issue #35]` already tracks (a cloud
tick's git credential can't push `.github/workflows/*.yml`
regardless of `ACTIONS_PAT`'s scope) — it reinforces that row's
evidence rather than describing a new one, so per
`skills/digest.md` §3 step 4 it stays a note under Needs You,
not a fresh `plan/PHASE_CANDIDATES.md` entry. The ceiling and
triage gates both behaved exactly as designed this window
(one clean ceiling-skip, one correct rate-limit-flake close) —
no mistuning signal either place.
