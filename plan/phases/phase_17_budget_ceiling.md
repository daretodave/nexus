# Phase 17 — Budget-aware ceiling

> One screen: deliverables, non-goals, decisions.

## Deliverables

1. **Weighted ceiling, both march.yml files.** The daily-
   ceiling step in `.github/workflows/march.yml` (nexus) and
   `templates/.github/workflows/march.yml` (adopters) stops
   counting cloud-shipped commits flatly and instead sums a
   weight per commit: **3** for a phase-shipping commit, **1**
   for churn (iterate/critique/triage/digest). A commit is
   phase-shipping iff it touches `plan/steps/01_build_plan.md`
   AND the diff adds a `[x]` line — that's the one thing only
   `ship-a-phase` Step 8 does, so it's an exact discriminator
   with no false positives from `phases: brief for phase N`
   commits (which never flip the checkbox).
2. **Manifest-driven ceiling value, template only.**
   `templates/scripts/bootstrap.mjs`'s `install-workflow` verb
   bakes `manifest.cloud_loop.daily_ceiling` into the ceiling
   line when it installs `march.yml`, so the field the manifest
   has always had (`bootstrap.example.json` since v1) finally
   does something. Manual (non-bootstrap) adopters keep hand-
   editing the `ceiling=` line, same as they already hand-edit
   the cron line — no new placeholder token.
3. **Docs updated in the same commit:** `templates/.github/
   CLOUD_LOOP.md`, `.github/CLOUD_LOOP.md`, `playbooks/
   cloud-loop.md`, `playbooks/hands-off.md` Step 6,
   `customization/bootstrap-automation.md` — all describe
   "weighted budget" instead of "commit count" wherever the
   ceiling is explained.

## Non-goals

- **`schedule_cron` wiring.** The manifest has had this field
  since v1 too, and `install-workflow` doesn't apply it either
  — but that's a separate gap (cadence, not budget). Filed as
  an AUDIT row instead of folded in here.
- **A `<CLOUD_LOOP_DAILY_CEILING>` placeholder token.** The
  cron line already sets precedent: cadence/ceiling knobs in
  `march.yml` are literal values adopters hand-edit or bootstrap
  bakes in, not `<PLACEHOLDER>` tokens resolved by the
  documented sed one-liner (that scope is `./skills ./.claude
  ./plan ./agents.md` — `.github` was never in it). Matching the
  existing pattern beats inventing a second mechanism for the
  same job.
- **Configurable weights.** 3-for-phase / 1-for-churn is a
  judgment call, not a manifest field. If it needs tuning later,
  that's a `/critique` or `/iterate` finding against real data,
  not a day-one knob.

## Decisions

- Discriminator is the build-plan tick, not the commit-message
  type prefix (`feat:` etc.) — prefixes overlap between phase
  and churn commits (`templates:`/`docs:` are used by both;
  phase 10's ship commit didn't even say "phase 10" in its
  subject). The tick is unambiguous and free: `ship-a-phase`
  Step 8 already guarantees it happens in the same commit
  "when possible" — the rare split-commit case undercounts by
  one phase-weight for that tick, which is the conservative
  direction (favors *more* runway, not less, so it can't runaway
  the loop).
- Ceiling numbers stay the same (8 for nexus, 12 default for the
  template) — this phase changes what's being measured, not
  the budget line itself. Re-tuning the number is a future
  `/iterate` finding once there's a week of weighted-budget data
  to look at.
