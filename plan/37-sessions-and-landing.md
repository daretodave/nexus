# 37 — Sessions carry their names; every skill lands per owner mode

> A `/heads-down` session beats its ledger and shows its star
> name everywhere it appears; every skill that commits lands
> the way `/next` does; and a contributor's plot passes the
> gate before the owner settles it.

## Why

The ledger, star names and the reboot train shipped as
scripts, but `/heads-down` doesn't beat the ledger yet, so a
crashed overnight loop leaves nothing to resume from, and the
claims board shows a session id where the fleet shows a star.
Template skills still say `git push origin <DEFAULT_BRANCH>`
and lean on standing rule 1 to reinterpret it. A contributor's
`/plot` PR fails the roadmap checks until settle runs.

What exists today (2026-10-20): `scripts/ledger.mjs`,
`/reboot-ready` and `/reboot-resume`; `skills/heads-down.md`
(150-line budget); `plan-check.mjs` reading the plan as
committed; the guard hook.

## Design

- **Heads-down beats:** at each step it runs `ledger.mjs beat`
  (claims, worktree, chunk and step, builder agent id or
  Workflow runId/scriptPath, defaults taken, parked
  questions), prints its star name in the start banner, and
  records the loop command so `/reboot-resume` can rebuild it.
  Within the 150-line budget (details in a `heads-down/` file
  if needed).
- **Star in the claims tag:** `s:<id8>~<star>`; codec, tests
  and `customization/claims.md`.
- **Hooks-on:** `claims whoami` and `claim` refuse in a Claude
  Code session that loaded no project hooks (a marker a
  PreToolUse hook writes; settings wiring and a test), so the
  worktree guard can't be bypassed silently.
- **Landing steps:** ship-a-chunk, march, iterate, plan-a-spec
  and the other committing template skills say "land per
  owner mode (`/next` land)" instead of a bare push;
  `next/land.md` gains the contributor-cloud note (commits on
  `nexus/<run id>`, no push, no claims calls).
- **Contributor plots:** `plan-check` reads `settledView`
  (pending `## Edit` rows applied in memory) for the roadmap
  and `N left` checks.
- **Integration test:** one scratch-repo test writes a plot
  pending file (a roadmap row and a new spec) and checks that
  settle, `plan-check` and `order.mjs --mark` agree.

## Acceptance

- **A4** No committing template skill pushes main directly;
  each lands per owner mode.
- **A5** `next/land.md` says how a no-token cloud tick ends.

## Open questions

(None.)

## Chunks
Measure: 2 open · 5 closed · next A8

- [ ] **37.4** Every committing skill lands per owner mode;
  the cloud-tick note · M · closes A4, A5 · needs —
