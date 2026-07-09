# Kit audit — 2026-07-09

> Bias: none

Seeded from two deep survey passes over the kit (playbooks +
customization + templates) and a survey of the sibling
adopters (`../semilayer`, `../kintilla`). Rows here are
iterate-shaped (one tick each); bigger items became phases in
`plan/steps/01_build_plan.md` or candidates in
`plan/PHASE_CANDIDATES.md`. First full dimension sweep (A-G)
since the build plan's phases ran dry (phase 18) — templates/
vs. docs diffed for drift, phase log cross-checked against
`git log`, onboarding placeholder path walked end to end.
Sibling lessons files (`../kintilla`, `../semilayer`) not
present in this checkout — dimension G came up empty, not
skipped. Anchor accuracy spot-checked (verify.mjs's `links` leg
skips `#anchor` fragments) — zero broken anchors found.

## Pending

### [ ] [4.2] three onboarding docs claim "six placeholders," templates/README.md's canonical table has eight
- category: doc-drift + completeness + adopter friction (A/B/E)
- impact: 7
- ease: 6
- evidence: `README.md:99-102` (TL;DR agent prompt),
  `playbooks/new-project.md:217-224` (table) + `:226` ("all
  six") + `:236-260` (bash/PowerShell one-liners), and
  `playbooks/windows-notes.md:30-34` ("all six") all omit
  `<PROJECT_TAGLINE>` and `<PROJECT_PKG_PREFIX>` from
  `templates/README.md`'s 8-row placeholder table.
  `<PROJECT_PKG_PREFIX>` is a real, consumed token
  (`templates/.github/workflows/march.yml`,
  `templates/data/README.md`, `templates/scripts/bootstrap.mjs`,
  `templates/skills/ship-a-phase.md`) — a day-1 gap since
  `b27d21f`. Overlaps in root cause with the `plan/CRITIQUE.md`
  pending LOW row on `templates/README.md`'s worked example;
  fix together.
- next: add both tokens to `new-project.md`'s table and both
  one-liners (bash `grep -rl` pattern + `sed -i` flags,
  PowerShell `$repl` hashtable), update "all six" → "all eight"
  in both `new-project.md:226` and `windows-notes.md:31`, and
  add both tokens to `README.md`'s TL;DR prompt list.

### [ ] [3.6] plan/steps/01_build_plan.md's Phase log is missing 6 of 18 phases
- category: completeness, kit-internal (B)
- impact: 4
- ease: 9
- evidence: `plan/steps/01_build_plan.md:88-111` lists phases
  1,2,3,4,5,6,16,18,7,8,12,14 but omits 9,10,11,13,15,17,
  despite each having a real commit: phase 9 `1cfab4b`, phase
  10 `e318b64`, phase 11 `fc54023`, phase 13 `fbeaa40`, phase
  15 `7cd7836`, phase 17 `1f3818c`.
- next: append those six lines to the Phase log in commit
  order, same one-line style as existing entries.

### [ ] [1.8] templates/scripts/__tests__/loop-issue.test.mjs isn't in templates/README.md's layout tree
- category: doc-drift + completeness, minor (A/B)
- impact: 2
- ease: 9
- evidence: file exists at
  `templates/scripts/__tests__/loop-issue.test.mjs`;
  `templates/README.md`'s `scripts/` tree block (lines 64-72)
  lists 8 files, no `__tests__/`. Silently copied by every bulk
  `scripts/` copy in `new-project.md`/`existing-project.md`.
- next: add `│   └── __tests__/loop-issue.test.mjs      (unit
  tests, node:test, no devDeps)` to the tree block.

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

### [x] [4.8] heartbeat.yml's alarm text hardcodes a cadence that doesn't match the template's default march.yml cron — this commit
- fix: `templates/.github/workflows/heartbeat.yml:64` no longer
  hardcodes "cadence is 6h" (only true of nexus's own instance
  cron, not the template's mostly-2h default in
  `templates/.github/workflows/march.yml:15`); reworded
  cadence-agnostic: "alarm threshold 14h — check your march cron
  schedule". This repo's own `.github/workflows/heartbeat.yml`
  left untouched (accurate as-is; `ACTIONS_PAT` also cannot push
  `.github/workflows/*.yml` here anyway — same constraint as
  user-issue #12).

### [x] [4.8] templates/README.md's Adopt-by-need table omits two conditional files its own tree comments call out — this commit
- fix: added rows for `.github/workflows/nightly-smoke.yml`
  (adopt when hermetic e2e is in use and `night.yml` doesn't
  already run `SMOKE_SAMPLE=full`) and `scripts/stack-lifecycle.mjs`
  (adopt when hermetic e2e uses Pattern B) to the "Adopt-by-need
  files" table in `templates/README.md`, matching the tree
  comments at lines 62 and 72.

### [x] [3.8] generic-specialist template omits the model: lever — this commit
- fix: added a commented `model:` frontmatter line + a one-line
  guidance comment to
  `templates/claude/agents/generic-specialist.md`, matching the
  per-agent routing lever `customization/claude-code.md` §5
  documents. Used a concrete example id
  (`claude-haiku-4-5`, with the standing "ids age — check
  /model" caveat) instead of a new bracket token, keeping the
  placeholder vocabulary unchanged.

### [x] [4.8] cloud_loop.schedule_cron field is inert, same gap daily_ceiling had — this commit
- fix: added `applyScheduleCron` to
  `templates/scripts/bootstrap.mjs`, same anchor-and-warn
  pattern as `applyDailyCeiling`, wired into `install-workflow`
  right after it. Updated
  `customization/bootstrap-automation.md`'s "GitHub Actions
  workflow quirks" note to describe both fields as wired
  instead of citing the cron line as the still-literal
  precedent.

### [x] [4.9] verify-gate composition drifts across three docs — this commit (closes #16)
- fix: declared the canonical composition + two variance rules
  ("data:validate iff data layer; lint optional leg") once in
  `templates/agents.md`, echoed the lint rule in
  `templates/plan/bearings.md` (also fixing a bare
  `customization/...` path to `nexus/customization/...`), and
  applied both rules explicitly in `customization/verify-gate.md`'s
  web-stack example (data:validate dropped, lint left standalone).

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
