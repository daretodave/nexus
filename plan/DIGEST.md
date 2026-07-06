# Digest — 2026-07-06

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, four shipped, zero
no-ops: phase 15 (brownfield kit), phase 17 (budget-aware
ceiling), a triage pass (issue #12 routed), an expand pass (1
candidate filed). The build plan is fully drained for the
first time — 18/18 phases shipped, 0 pending — so the next
march tick is `/iterate` territory. AUDIT's header was 48h+
stale; refreshed this pass, all 8 pending rows confirmed still
open.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-05 14:33 | march | shipped — phase 15, brownfield kit: `templates/plan/CURRENT-STATE.md` + preview-branch deploy-gate pattern (commit `7cd7836`) |
| 07-05 20:25 | march | shipped — phase 17, budget-aware ceiling: weighted phase-vs-churn commits (commit `1f3818c`); could not push the matching patch to this repo's own `march.yml` (token scope), filed issue #12 |
| 07-06 03:09 | march | triage — issue #12 classified, routed into `plan/AUDIT.md` as `[user-issue #12]`, labeled `triage:loop-queued` (commit `ac0be6e`) |
| 07-06 09:24 | march | expand — 1 phase candidate filed, clustering 4 CRITIQUE rows (1 HIGH + 3 MED, all tracing to `playbooks/new-project.md` step 4) into one rewrite (commit `615e4eb`) |
| 07-06 11:51 | night (this tick) | this tick |

`heartbeat` ran 4 times since yesterday's digest (07-05 12:43,
18:38, 07-06 01:05, 07:51 UTC), all green.

## Shipped

- `7cd7836` — phase 15: `templates/plan/CURRENT-STATE.md`
  (promoted from an inline block adopters had to hand-type) +
  a working `VERCEL_TARGET` filter in `deploy-check.mjs` +
  the preview-branch deploy-gate pattern spelled out in
  `existing-project.md` / `ci-providers.md`. Closes #10.
- `1f3818c` — phase 17: the template ceiling step now sums a
  weighted budget (3 for a phase-shipping commit, 1 for churn)
  instead of counting every `Cloud-Run:` commit as one unit;
  `bootstrap.mjs` gained `applyDailyCeiling` to bake
  `manifest.cloud_loop.daily_ceiling` into the copied workflow.
  Closes #11. Could not self-apply to this repo's own
  `.github/workflows/march.yml` — `ACTIONS_PAT` has no
  `workflows` scope by design — so filed issue #12 with the
  exact manual patch instead.
- `ac0be6e` — triage: issue #12 routed to AUDIT, four
  `triage:*` labels created idempotently.
- `615e4eb` — expand: filed the `playbooks/new-project.md`
  step-4 rewrite candidate (score 7.8) rather than four
  separate `/iterate` ticks on the same block.

## Queues now

- **Build plan:** 0 open phases, 18 shipped, 0 blocked — fully
  drained for the first time. Per the build plan's own note,
  the next march tick transitions to `/iterate` (audit
  dimensions always have food) rather than `/ship-a-phase`.
- **AUDIT:** header refreshed this pass (was 2026-07-04, 48h+
  stale). 8 pending rows, all spot-checked and confirmed still
  open: `[6.6]`, `[7.2]`, `[6.3]`, `[4.9]`, `[4.8]` (new since
  yesterday — phase 17 scoped `applyScheduleCron` out and filed
  it), `[3.8]`, `[3.5]`, `[3.2]`; plus `[user-issue #12]`.
  `[6.6]`'s trigger condition has now fired (this repo's own
  commits are authored as `nexus` via the env-var mechanic) but
  the template rewrite itself is still unshipped.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW), pass 1 from
  2026-07-03, unchanged — all 4 non-LOW rows now bundled into
  today's phase candidate rather than addressed individually.
- **PHASE_CANDIDATES:** 17 pending (was 16), 0 promoted, 0
  rejected — pass count 1, last pass 2026-07-06 (today's expand
  tick). Top: workspace-of-repos as a first-class adoption path
  (score 8.8), unchanged.
- **Issues:** 1 open (#12, `triage:loop-queued`) — see Needs
  you below. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

Issue #12 needs a human hand: phase 17's weighted-ceiling patch
is shipped in `templates/.github/workflows/march.yml` but the
cloud loop cannot push the matching edit to this repo's own
`.github/workflows/march.yml` — GitHub rejects workflow-file
pushes from a token without the `workflows` scope, and
`ACTIONS_PAT` is deliberately scoped to Contents + Issues only.
Apply the patch in the issue body by hand (or via a
workflow-scoped personal token), then align
`.github/CLOUD_LOOP.md`'s ceiling wording to match. No blocked
build-plan rows, no `needs-user` issues, no
`[needs-user-call]`s otherwise.

## Today's intent

The build plan has no next phase — it's fully drained. The
next march tick runs `/iterate` against the audit queue.

Top audit finding: **`[7.2]` data-layer.md cites an invented
model id** — `customization/data-layer.md`'s example still uses
`"claude-opus-4.7"`, not a real id (impact 6, ease 9, score
5.4 — highest of the 8 pending rows, unchanged from yesterday).

## Tuning proposals

none — this window shipped 4/4 march ticks (2 phases, a triage
pass, an expand pass), zero no-ops, zero failures; the build
plan draining to 0 is the loop working as designed (the plan's
own carry-over note anticipates the `/iterate` handoff), not a
starved queue. Issue #12's workflow-scope gap is a standing,
already-documented constraint (`AUDIT.md` `[user-issue #12]`),
not a new gate defect to retune. Nothing to propose this tick.
