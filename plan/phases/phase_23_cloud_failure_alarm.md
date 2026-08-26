# Phase 23 — Cloud tick failure auto-alarm

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.8.
> One screen: deliverables, non-goals, decisions.

## Problem

The 2026-08-02 → 2026-08-23 outage: every scheduled march/night
tick for 21 days (~84 runs) failed at checkout on an expired
`ACTIONS_PAT` (401), and nothing filed an issue. The reason:
nexus's own `.github/workflows/march.yml` and `night.yml` file
their crash-alarm issue using `GH_TOKEN: ${{ secrets.ACTIONS_PAT
}}` — the exact credential that was dead. A watcher that shares
its subject's failure mode isn't a watcher. The default
`GITHUB_TOKEN` is minted fresh per run regardless of PAT health
and can still open issues (the job's `permissions: issues:
write` block already grants it that, independent of which
secret authors commits).

`templates/.github/workflows/march.yml` and `night.yml` already
default their crash-alarm step to `secrets.GITHUB_TOKEN` — the
generic template was never wrong. Only the two nexus-own
workflow files carry the bug.

## Deliverables

- `.github/workflows/march.yml` (nexus): the "Open cloud-failed
  issue if action crashed" step's `GH_TOKEN` switches from
  `secrets.ACTIONS_PAT` to `secrets.GITHUB_TOKEN`. Add `id:`
  to the `Checkout` step (`checkout`) and the `Run /march
  (cloud mode)` step (`run_march`) — the existing `ceiling` id
  already exists. The step body now names which of the three
  tracked steps failed in the issue body (falls back to
  "unknown step (see run log)" for anything else, e.g. Node
  setup).
- `.github/workflows/night.yml` (nexus): same treatment —
  `GH_TOKEN` to `secrets.GITHUB_TOKEN` in the crash step; `id:
  checkout` and `id: run_digest` added; failed-step naming in
  the issue body.
- `templates/.github/workflows/march.yml` and `night.yml`:
  already on `GITHUB_TOKEN` — add the same `id:`
  (`checkout`, `run_march` / `run_digest`) and failed-step
  naming for parity, so the generic template teaches the same
  diagnosable-alarm shape adopters would otherwise have to
  discover the hard way.
- `.github/CLOUD_LOOP.md`: the "Setup" section's "If
  `ACTIONS_PAT` expires or is removed, checkout fails red on
  the next tick — re-mint and re-set, nothing else to repair"
  line gains a sentence: the crash-alarm issue still files
  (via `GITHUB_TOKEN`, which doesn't share the PAT's failure
  mode) even when the PAT itself is what died.

## Non-goals

- **Heartbeat changes.** `heartbeat.yml` already defaults to
  `GITHUB_TOKEN` (never touched `ACTIONS_PAT`) and already has
  its own flatline alarm (14h-no-success). Out of scope — it
  was never broken.
- **Retrying or auto-renewing `ACTIONS_PAT`.** GitHub fine-
  grained PATs can't be renewed via API; this phase makes the
  failure *loud*, not self-healing. Re-minting stays a human
  step (`.github/CLOUD_LOOP.md` setup step 3).
- **Naming every possible failing step.** Only the steps most
  plausible to fail get an `id` (checkout — the exact outage;
  the ceiling arithmetic; the agent run itself). Toolchain
  setup steps (Node, pnpm) essentially never fail in practice;
  adding ids to all of them for a `sh`-string comparison chain
  is churn without a matching signal.
- **A new verify leg.** No new placeholder or template
  contract; `scripts/verify.mjs`'s existing `tree`/`discover`
  legs already cover the touched files.

## Decisions

1. Fix nexus's own two files first (they're the ones that were
   actually blind during the real outage); bring templates/ to
   the same shape in the same commit for parity, since the
   candidate's proposed scope named both explicitly and leaving
   templates one step behind its own product's incident lesson
   would be a documentation smell the next `/critique` pass
   would just refile.
2. Step-failure naming via a short if-chain over `steps.<id>
   .outcome`, not a dedicated action or matrix — three checks
   in a `run:` block is the smallest correct diagnostic, and it
   keeps the workflow file self-contained (no new external
   action dependency).
3. `GH_TOKEN: secrets.GITHUB_TOKEN` on the crash-alarm step
   only — the rest of march.yml/night.yml (checkout, the agent
   run's own `gh` calls) keeps `ACTIONS_PAT` for user-author
   commits. The alarm step never commits or authors as a user;
   it only needs `issues: write`, which the job's `permissions:`
   block already grants `GITHUB_TOKEN`.
