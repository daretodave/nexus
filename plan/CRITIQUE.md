# Critique — external-observer findings

> Last pass: 2026-07-10
> Pass count: 3

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

### [HIGH] playbooks/new-project.md — step 4's bulk copy never lands plan/phases/, so step 5's briefs ship with unresolved placeholders
- category: missing-file
- observation: step 4's `fs.cpSync` array (the bulk template
  copy) does not include `templates/plan/phases/`. Step 5 says
  "Use `../nexus/templates/plan/phases/phase_1_bootstrap.md` as
  the starting point. Edit it to match your stack" and later
  "Commit both briefs" — but never gives a copy command, and by
  this point step 4's placeholder sed (scoped to `./skills
  ./.claude ./plan ./agents.md`) has already run and finished.
  Verified live in a scratch dir: after running step 4's exact
  command, `plan/phases/` does not exist; if an adopter then
  copies `phase_1_bootstrap.md` in directly at step 5, its
  `<DEFAULT_BRANCH>` / `<PROJECT>` tokens (present at multiple
  lines in the template) never get swept, so phase 1's brief —
  the first file `/ship-a-phase` reads — ships with literal
  placeholder text.
- evidence: `playbooks/new-project.md:206` (step 4 copy array
  omits `templates/plan/phases/`) vs. `:280-302` (step 5
  references the directory with no copy command); confirmed via
  dry-run scratch adoption.
- suggested fix: add an explicit `cp -r
  ../nexus/templates/plan/phases ./plan/phases` at the top of
  step 5, then re-run (or extend) the placeholder sweep to cover
  `./plan/phases` afterward.
- source: dry-run

### [MED] playbooks/new-project.md:35 — "sed-replace if you use npm/yarn/bun" has no worked example and conflicts with settings.json's pnpm-only allowlist
- category: instruction-drift
- observation: the line "templates assume pnpm; sed-replace if
  you use npm/yarn/bun" gives no worked replacement, unlike the
  fully worked placeholder example later in the same playbook.
  A naive `s/pnpm/npm/g` also breaks command syntax for custom
  scripts (`npm typecheck` is invalid; npm needs `run`). Separately,
  `templates/claude/settings.json`'s permission allowlist is
  hardcoded to `Bash(pnpm verify:*)`, `Bash(pnpm test:*)`, etc. —
  an npm/yarn/bun adopter's equivalent commands never match, so
  every unattended tick silently stalls on a permission prompt,
  which defeats the walk-away promise in `README.md`'s "leave it
  for 80 hours" pitch.
- evidence: `playbooks/new-project.md:35` (unworked pnpm caveat)
  vs. `templates/claude/settings.json:15-20` (pnpm-only
  allowlist entries).
- suggested fix: give a real worked npm/yarn/bun sed example
  mirrored against `settings.json`'s allowlist (or generate the
  allowlist from the same package-manager choice), or state
  plainly that pnpm is a hard prerequisite until that's wired up.
- source: dry-run

### [LOW] README.md:167-168 — "Files added" checklist omits CLAUDE.md after it was patched into step 4's copy
- category: instruction-drift
- observation: `plan/CRITIQUE.md`'s Done log records that
  `playbooks/new-project.md` was already fixed to copy
  `CLAUDE.md` to the repo root (load-bearing: Claude Code only
  auto-loads it from root, not from `.claude/`). `README.md`'s
  own "Review what landed" checklist was never updated to match
  — it still lists only `agents.md`, `plan/`, `skills/`,
  `.claude/`, `scripts/deploy-check.mjs`, `.env.example`.
- evidence: `README.md:167-168` vs. `plan/CRITIQUE.md`'s Done
  entry for the CLAUDE.md-at-root fix.
- suggested fix: add `CLAUDE.md` to the "Files added" list.
- source: dry-run

### [LOW] playbooks/new-project.md — step 7 re-copies deploy-check.mjs already placed by step 4
- category: ordering
- observation: step 7 says "Copy
  `../nexus/templates/scripts/deploy-check.mjs` to
  `./scripts/deploy-check.mjs`" as if introducing the file for
  the first time, but step 4's bulk copy already recursively
  copies `templates/scripts` → `scripts`, which includes
  `deploy-check.mjs`. A literal follower re-runs a no-op copy
  and may wonder why `./scripts/` already exists.
- evidence: `playbooks/new-project.md:199` (bulk `scripts`
  copy) vs. `:338-339` (redundant single-file copy).
- suggested fix: reword step 7 to "already present from step
  4" and skip straight to wiring it into `package.json`.
- source: dry-run

### [MED] playbooks/new-project.md — blanket `skills/` copy contradicts templates/README.md's adopt-by-need contract
- category: instruction-drift
- observation: the playbook's copy command lands the whole
  `skills/` directory unconditionally, including
  `ship-asset.md`, `ship-data.md`, `bootstrap.md`, but
  templates/README.md says those should be copied "only when
  adopting the corresponding capability" and calls leaving
  `ship-asset.md` present for a non-surface project
  "misleading." The playbook never tells the adopter to prune.
- evidence: `playbooks/new-project.md:199` (`cp -r
  nexus/templates/skills/ ./skills/`) vs.
  `templates/README.md:119-131` (adopt-by-need files).
- suggested fix: add a prune step right after the bulk copy in
  `new-project.md`, keyed off the Surface/data-layer decisions
  made in `bearings.md`.
- source: dry-run

### [MED] templates/README.md / playbooks/new-project.md — documented sed one-liner's scope misses files the same step copies
- category: placeholder
- observation: the documented search-replace scope is `./skills
  ./.claude ./plan ./agents.md`, but step 4 also copies into
  `./scripts` and `./.env.example`, which sit outside that
  scope. Literal placeholder tokens are confirmed left behind
  post-replacement.
- evidence: `README.md:87-91` / `templates/README.md:82-91` /
  `playbooks/new-project.md:227-228` (grep scope excludes
  `./scripts`, `./.env.example`); confirmed unresolved tokens
  at `templates/scripts/deploy-check.mjs:51`
  (`'<PROJECT_LOWER>'`) and `:139` (`'<REPO_SLUG>'`).
- suggested fix: widen the documented grep scope to include
  `./scripts` and `./.env.example`, or move the
  placeholder-replacement step to after all copies and scope it
  to the whole repo diff.
- source: dry-run

### [LOW] playbooks/new-project.md — step 6 edits a package.json that doesn't exist yet at that point in the walk
- category: ordering
- observation: step 6 ("wire the verify gate") instructs
  editing a root `package.json`, but no template ships one —
  it's only generated later when the phase-1 bootstrap brief
  (step 5) actually scaffolds the stack. A literal top-to-bottom
  follower hits a missing file at step 6.
- evidence: `playbooks/new-project.md:270-287` (package.json
  edit); `find templates -iname package.json` → no results.
- suggested fix: note in step 6 that it describes the target
  shape for the phase-1 brief to produce (not something to run
  immediately in an empty repo), or fold it into step 5's
  guidance.
- source: dry-run

### [LOW] templates/README.md — `<PROJECT_PKG_PREFIX>` has no worked replacement example
- category: placeholder
- observation: the placeholder table lists
  `<PROJECT_PKG_PREFIX>`, but the worked sed example only
  demonstrates `<PROJECT>` and `<HOSTING_URL>` then truncates
  with "# ...etc per the table above." Copy-pasting the shown
  commands verbatim leaves it unresolved.
- evidence: `templates/README.md:77` (table entry) vs. `:82-91`
  (worked example omits it); confirmed unresolved occurrences at
  `templates/skills/ship-a-phase.md:206-207` and
  `templates/scripts/bootstrap.mjs:614`.
- suggested fix: add `<PROJECT_PKG_PREFIX>` to the worked
  one-liner example, or state explicitly it's optional/monorepo-only
  so an adopter knows it's safe to skip.
- source: dry-run

## Done

### [x] [MED] playbooks/new-project.md — plan/PHASE_CANDIDATES.md is listed as copied but the playbook never copies it (this commit)
- fix: added `['templates/plan/PHASE_CANDIDATES.md',
  'plan/PHASE_CANDIDATES.md']` to the step-4 `fs.cpSync` array in
  both `new-project.md` and `existing-project.md` — the gap
  existed in both playbooks' copy blocks, not just the one the
  finding cited.

### [x] [HIGH] playbooks/new-project.md — step 4's bulk copy never lands CLAUDE.md at the repo root (this commit)
- fix: added a second `fs.cpSync` entry
  (`['templates/claude/CLAUDE.md','CLAUDE.md']`) to the step-4
  copy block in both `new-project.md` and `existing-project.md`,
  plus a one-line note explaining the entry isn't redundant
  with the `.claude` copy above it — Claude Code only
  auto-loads `CLAUDE.md` from the repo root. Verified by
  running the updated command in a scratch dir: both
  `./CLAUDE.md` and `./.claude/CLAUDE.md` now land.

### [x] [HIGH] README.md + playbooks/new-project.md — sibling clone layout breaks the playbook's bare `nexus/...` copy paths (this commit)
- fix: rewrote every bare `nexus/templates/...` reference in
  `playbooks/new-project.md` (bearings, build plan, the
  templates-copy `node -e` one-liner, phase 1 brief,
  deploy-check, sub-agent copies, bootstrap.local.json) to
  `../nexus/templates/...`, matching README's recommended
  sibling clone and the convention `playbooks/existing-project.md`
  already used. Added a one-line note at first use pointing
  back to the README layout for readers who put their checkout
  somewhere else.
