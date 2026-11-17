# CHANGELOG

> `templates/` is the product — the files an adopter copies in,
> then upgrades later through `packages/cli/server/sync.mjs`'s
> three-way merge. That merge tells an adopter *that* a file
> changed and *whether* their copy conflicts; it can't say
> *why* the kit changed it. This file does. Newest first, one
> entry per commit that touched `templates/`, keyed by the path
> it touched. Surfaced at upgrade time — see
> `playbooks/upgrade.md`.

- templates/skills/*.md: every bash-only fence outside the
  original five git-procedure skills now carries `<!--
  dualshell:posix-only -->` (none had a PowerShell equivalent
  worth building), closing the gap the `dualshell` syntax leg
  left since 52.3 (2026-11-17, this commit).
- templates/README.md: "replace all eight" fixed to "nine" in
  two spots — the placeholder table above it lists nine rows
  (2026-11-17, this commit).
- templates/README.md: dropped the "Reference implementations"
  section — it pointed adopters at "the real projects" in the
  root README's Provenance section, which deliberately
  anonymizes every one of them, so the instruction was a dead
  end (2026-11-17, this commit).
- templates/scripts/plan/settle.mjs: `setLeft()` now also
  rewrites a roadmap row written in "N of M chunks" shape (not
  just "N left") after a close, so a spec chunked in that format
  keeps a true progress cell (2026-11-16, this commit).
- templates/scripts/__tests__/cadence.test.mjs: the bootstrap
  cross-check assertion now self-skips when `bootstrap.mjs` is
  pruned, instead of a static import crashing the whole suite
  (2026-11-16, this commit).
- templates/.github/workflows/pr-flow.yml: pr-flow now deletes
  a merged loop PR's branch after merge (2026-11-05, 2da8d42).
- templates/.github/actions/setup/action.yml: actions/checkout
  and actions/setup-node bumped to v5 across every workflow
  (2026-11-05, 050f6b6).
- templates/plan/bearings.md: documents the
  `DEPLOY_PROVIDER=none` path in the deploy gate section
  (2026-11-05, ddc0663).
- templates/agents.md: documents the no-deploy-host path in
  rules 1 and 4 (2026-11-05, b5c7f1b).
- templates/.github/workflows/march.yml: bumped
  actions/create-github-app-token to v3 and
  actions/download-artifact to v8 (2026-10-26, 89b75dc).
- templates/scripts/ui-walk.mjs: new adopter UI walk — checks
  the UI knobs the reader's Path A2 expects (2026-10-25,
  15f8a2a).
- templates/scripts/workflow-lint.mjs: now scans prompt
  inputs too, since issue and page text is treated as data
  (2026-10-25, c8a02e9).
- templates/setup/00_files.md: renamed the PHASE_N/PHASE_M
  placeholders to SPEC_N/SPEC_M (2026-10-21, 76b9f00).
- templates/claude/commands/march.md: committing skills now
  land per owner mode, never a bare push (2026-10-21,
  609b9b8).
- templates/skills/moderate.md: shipped — the Option A
  moderation-queue promise (2026-07-04, e318b64).
