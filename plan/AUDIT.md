# Kit audit — 2026-07-06

> Bias: none

Seeded from two deep survey passes over the kit (playbooks +
customization + templates) and a survey of the sibling
adopters (`../semilayer`, `../kintilla`). Rows here are
iterate-shaped (one tick each); bigger items became phases in
`plan/steps/01_build_plan.md` or candidates in
`plan/PHASE_CANDIDATES.md`. Refreshed by `/digest` (48h+
stale header) — all 7 pending rows spot-checked against
current tree and confirmed still open, including `[4.8]`
(phase 17 shipped `applyDailyCeiling` only, deliberately
leaving `applyScheduleCron` for a future tick); `[6.6]` has
since shipped (this commit). Phases 15/17's own diffs checked
clean, no new rows from them. No new dimension sweep this
pass; next full re-survey belongs to `/iterate`
once the build plan's phases run dry.

## Pending

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

### [user-issue #12] [MED] nexus's own march.yml needs phase 17's weighted-ceiling patch applied by hand
- category: external-issue
- impact: 5
- ease: 8
- evidence: phase 17 shipped the weighted-ceiling mechanism to
  `templates/.github/workflows/march.yml` (the product) plus
  `bootstrap.mjs`'s `applyDailyCeiling`, but could not push the
  matching edit to this repo's own
  `.github/workflows/march.yml` — GitHub rejects pushes that
  touch `.github/workflows/` from a token without the
  `workflows` scope, and `ACTIONS_PAT` is deliberately scoped
  to Contents + Issues only (`agents.md` "Operational
  secrets"). Standing constraint for any future phase that
  touches `.github/workflows/*.yml`, not a one-off glitch.
- next: a human (or a locally-run `/iterate` using a
  workflow-scoped personal token) replaces the `Daily commit
  ceiling check` step in `.github/workflows/march.yml` with the
  weighted version already shipped in
  `templates/.github/workflows/march.yml` (same step, minus the
  bootstrap.local.json comment block — nexus has none), keeping
  `ceiling=8`. Then align `.github/CLOUD_LOOP.md` "Daily
  operation" -> Ceiling wording with
  `templates/.github/CLOUD_LOOP.md`'s "The daily ceiling"
  section.

## Done

### [x] [6.3] deploy-check.mjs covers 4 of 8 documented providers — this commit (closes #15)
- fix: added `cloudflare-pages`, `render`, and `fly` blocks to
  `templates/scripts/deploy-check.mjs`, porting the patterns
  already documented in `playbooks/ci-providers.md` into the
  same `pollLoop`/`configFail`/`apiFail` contract the other
  providers use. Updated the script's "Supported:" list and the
  playbook's intro line + per-provider snippets to point at the
  template instead of prose-only patterns.

### [x] [6.6] template user-author mechanic teaches a config the action overrides — this commit (closes #14)
- fix: this repo's next few cloud ticks landed authored as
  `nexus` (multiple commits since 2026-07-03), validating the
  env-var mechanic on @v1. `templates/.github/CLOUD_LOOP.md`
  step 3 and `templates/.github/workflows/march.yml` (the
  `Configure git author` step, the `Run /march` env block, and
  prompt item 5) now teach `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env
  vars instead of `git config user.*`.

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

### [x] [7.2] data-layer.md cites an invented model id — this commit
- fix: `customization/data-layer.md`'s provenance schema
  comment now reads a real id (`claude-opus-4-8`) with the
  kit's standing "ids age — check /model" caveat, matching
  `.github/CLOUD_LOOP.md` and `customization/claude-code.md`.
