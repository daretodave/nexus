# 01 — Build plan (nexus on nexus)

> Style guardrails for every phase: match the voice exemplars
> in `plan/bearings.md`; every new doc discoverable (linked +
> in the README tree) in the same commit; every new invariant
> teaches the gate in the same commit; hard-wrap ~62–64 cols.

## Status (at-a-glance)

`/march` and `/ship-a-phase` read this block to find the next
phase. Status vocabulary: `[ ]` pending → `[x]` shipped (with
commit hash); `[skipped]` (only via `/oversight`);
`[blocked: <reason> <date>]` (`/march` skips, `/oversight`
unblocks). Tick in the same commit that ships the phase.

**Substrate (the ouroboros):**
- [x] Phase 1 — The kit itself (pre-adoption history,
      b27d21f → cf05598: methodology, templates, playbooks,
      customization, bootstrap layer)
- [x] Phase 2 — The kit's own verify gate (commit 84ea179)
- [x] Phase 3 — Harness enforcement layer + template
      hardening for unattended runs (commit e593606)
- [x] Phase 4 — Hands-off + recovery playbooks; claude-code +
      lanes customization (commit fe75c78)
- [x] Phase 5 — Self-adoption substrate: agents.md, plan/,
      skills/, .claude/ (this commit)
- [x] Phase 6 — Cloud loop: nexus marches on Actions,
      Sonnet 5, 4 ticks/day (this commit; armed once the
      `CLAUDE_CODE_OAUTH_TOKEN` repo secret exists)

**Growth (the loop's food — briefs in `plan/phases/` where
written):**
- [x] Phase 7 — Lessons layer: reflexes + domain-keyed lessons
      with hard caps, extracted from kintilla (this commit)
- [x] Phase 8 — Polyrepo variant playbook: plan/ as its own
      repo + sibling product repos (commit 4dc4840)
- [x] Phase 9 — Windows-first pass: dual-shell commands +
      hazards page (this commit)
- [x] Phase 10 — Ship `templates/skills/moderate.md` — the
      moderation Option A that moderation-loop.md promises
      (this commit)
- [x] Phase 11 — Ship `templates/skills/ship-migration.md` +
      additive-migration linter — data-layer Pattern D promise
      (this commit)
- [x] Phase 12 — Critique-session refresher script + secret
      liveness probes — auth-aware-critique promise (this
      commit)
- [x] Phase 13 — Nightly full-smoke workflow template +
      stack:up/down scripts — hermetic-e2e promise (this
      commit)
- [x] Phase 14 — Bootstrap v2: de-stub cloud-loop verbs,
      runbook status write-back, vercel --sensitive, Supabase
      key extraction (the Ember lessons list) (this commit)
- [x] Phase 15 — Brownfield kit: templates/plan/CURRENT-STATE.md
      + preview-branch deploy-gate pattern (this commit)
- [x] Phase 16 — Heartbeat watchdog: model-free workflow that
      cancels wedged runs and alarms on flatline — nexus +
      template (this commit)
- [x] Phase 17 — Budget-aware ceiling: read
      bootstrap.local.json cloud_loop.daily_ceiling; weight
      phase commits vs churn commits (this commit)
- [x] Phase 18 — Loop shapes: the genus taxonomy
      (`concepts/loop-shapes.md`), the night shift (`/digest`
      + `night.yml` + `plan/DIGEST.md`), and the concierge
      lane (`loop:do` + verb dispatch) — kit + ouroboros
      (this commit)

> **After the pending phases run dry:** `/march` transitions
> to `/iterate` — the audit dimensions (drift, completeness,
> voice, friction, freshness, lessons) always have food, and
> `/expand` grows this list from evidence.

## Carry-overs / known gaps

- `plan/AUDIT.md` is seeded with 9 iterate-sized findings from
  the survey passes — they compete with phases via `/march`
  order (phases first).
- `plan/PHASE_CANDIDATES.md` holds 4 candidates awaiting
  `/oversight` promotion (plugin packaging, closeloop,
  critique-household, staged hardening).
- Issue #12: `.github/workflows/march.yml` (nexus's own) still
  needs phase 17's weighted-ceiling step applied by hand — the
  cloud loop cannot push `.github/workflows/*.yml` itself
  (`ACTIONS_PAT` has no `workflows` scope, by design). The
  template + bootstrap.mjs half of phase 17 shipped; this is
  the self-hosting instance's manual sync step.

## Phase log

- phase 1 — b27d21f → cf05598 — the kit, pre-adoption
- phase 2 — 84ea179 — verify gate; first run caught 5 defects
- phase 3 — e593606 — enforcement templates + hardening
- phase 4 — fe75c78 — hands-off, recovery, claude-code, lanes
- phase 5 — df709e0 — the ouroboros substrate
- phase 6 — b4d40ef — cloud loop armed; went live after four
  live-fire fixes (app install 914299c, observability +
  critique-never-clause ce66263, permission wall 5dcbf37,
  claude_args flag form 803c940); first shipped tick 62a3875
- phase 16 — (this commit) — heartbeat
- phase 18 — (this commit) — loop shapes: night shift +
  concierge + taxonomy
- phase 7 — (this commit) — lessons layer: reflexes/lessons
  two-tier + staged-hardening lint pattern
- phase 8 — 4dc4840 — polyrepo variant: plan/ as its own repo
  + sibling product repos
- phase 12 — (this commit) — refresh-critique-session.mjs +
  check-secrets-liveness.mjs, closing the Pattern B promise
- phase 14 — (this commit) — bootstrap v2: Supabase key
  extraction, loose JSON parsing, vercel push-env with
  --sensitive, decorated-march identity edit, runbook
  write-back
- phase 9 — 1cfab4b — Windows-first pass: dual-shell commands
  + hazards page
- phase 10 — e318b64 — ship `templates/skills/moderate.md`,
  the moderation Option A promise
- phase 11 — fc54023 — ship-migration skill + additive-
  migration linter
- phase 13 — fbeaa40 — nightly full-smoke workflow +
  stack:up/down scripts
- phase 15 — 7cd7836 — brownfield kit: CURRENT-STATE.md +
  preview-branch deploy-gate pattern
- phase 17 — 1f3818c — budget-aware ceiling: weighted phase
  vs. churn commits
