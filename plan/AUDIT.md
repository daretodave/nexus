# Kit audit — 2026-07-04

> Bias: none

Seeded from two deep survey passes over the kit (playbooks +
customization + templates) and a survey of the sibling
adopters (`../semilayer`, `../kintilla`). Rows here are
iterate-shaped (one tick each); bigger items became phases in
`plan/steps/01_build_plan.md` or candidates in
`plan/PHASE_CANDIDATES.md`. Refreshed by `/digest` (48h+
stale header) — each pending row spot-checked against current
tree; `[4.2]` confirmed fixed by phase 9 and moved to Done, the
rest confirmed still open. No new dimension sweep this pass
(phases 9/10's own diffs checked clean); next full re-survey
belongs to `/iterate` once the build plan's phases run dry.

## Pending

### [ ] [6.6] template user-author mechanic teaches a config the action overrides
- category: doc-drift
- impact: 7
- ease: 6
- evidence: `templates/.github/CLOUD_LOOP.md` "Identity choice"
  step 3 tells adopters to edit the `Configure git author` step
  (`git config user.*`) — but the Claude Code action runs its
  own internal `git config` after workflow steps, silently
  overriding it. The reliable path is `GIT_AUTHOR_*` /
  `GIT_COMMITTER_*` env vars on the action step (proven on a
  sibling loop; adopted by this repo's own march.yml/night.yml
  2026-07-03).
- next: once this repo's next cloud tick lands authored as
  `nexus` (validating the env-var mechanic on @v1), rewrite the
  template's step 3 + `templates/.github/workflows/march.yml`
  author step/comments to the env-var mechanic.

### [ ] [7.2] data-layer.md cites an invented model id
- category: freshness
- impact: 6
- ease: 9
- evidence: `customization/data-layer.md` example uses
  `"claude-opus-4.7"` (not a real id; real ids look like
  `claude-opus-4-8`). Adopters copy examples verbatim.
- next: make the example provider-generic or use a real
  current id with the "ids age — check /model" caveat.

### [ ] [6.3] deploy-check.mjs covers 4 of 8 documented providers
- category: doc-drift
- impact: 7
- ease: 4
- evidence: `playbooks/ci-providers.md` walks 8 providers;
  `templates/scripts/deploy-check.mjs` implements netlify,
  vercel, github-actions, health-check. Cloudflare Pages,
  Render, Fly are "follow the patterns" prose.
- next: implement the three missing adapters in the template
  (each ~40 lines, same exit-code contract).

### [ ] [4.9] verify-gate composition drifts across three docs
- category: doc-drift
- impact: 7
- ease: 5
- evidence: `templates/agents.md` says `typecheck → test:run →
  data:validate → build → e2e`; `customization/verify-gate.md`
  web example omits `data:validate`, adds `lint`;
  `templates/plan/bearings.md` echoes agents.md.
- next: declare one canonical composition + one documented
  variance rule ("data:validate iff data layer; lint optional
  leg"), align all three in one commit.

### [ ] [4.8] cloud_loop.schedule_cron field is inert, same gap daily_ceiling had
- category: completeness
- impact: 6
- ease: 8
- evidence: `bootstrap.example.json`'s `cloud_loop.schedule_cron`
  has existed since v1; `install-workflow`
  (`templates/scripts/bootstrap.mjs`) never applies it — the
  installed `march.yml` always ships with the template's
  literal cron line. Phase 17 closed the identical gap for
  `daily_ceiling` (`applyDailyCeiling`); scoped that field out
  to keep the phase to one knob.
- next: add an `applyScheduleCron` following the same anchor-
  and-warn pattern, replacing the `- cron: '...'` line in the
  copied `march.yml`.

### [ ] [3.8] generic-specialist template omits the model: lever
- category: completeness
- impact: 4
- ease: 9
- evidence: `customization/claude-code.md` §5 documents
  per-agent `model:` frontmatter; no agent template shows it.
- next: add a commented `model:` line + one sentence to
  `templates/claude/agents/generic-specialist.md`.

### [ ] [3.5] cloud-loop reference implementation is an external link
- category: freshness
- impact: 3
- ease: 6
- evidence: `playbooks/cloud-loop.md` points at a live repo
  for the reference run; link-rot risk, and this repo now runs
  its own loop.
- next: point the reference at nexus's own `.github/` loop
  (the ouroboros) with the external repo as secondary.

### [ ] [3.2] data-layer mermaid diagram is a style outlier
- category: voice
- impact: 2
- ease: 8
- evidence: the kit's docs are prose+tables; one mermaid
  flowchart in `customization/data-layer.md` (README's is the
  only other).
- next: keep or convert to the decision-table idiom — decide
  once, note in bearings voice rules.

## Done

### [x] [4.2] existing-project audit snippet is crude — commit 1cfab4b
- fix: phase 9 rebuilt the snippet on `git rev-list --count
  HEAD` / `git rev-list --count --since=... HEAD` (cross-shell
  git primitives) instead of `git log | grep -c '^Author:'`.

### [x] [5.4] bootstrap.mjs mixes findstr (Windows) and awk (POSIX) — this commit
- fix: `handoff()`'s `verify` is now `{ describe, check }`;
  `check()` runs `gh api` and tests `stdout.includes(...)` in
  JS instead of piping through `findstr`/`grep`. Same fix
  applied to the Supabase-keys handoff's doc-only verify
  string (no shell pipe at all now).
