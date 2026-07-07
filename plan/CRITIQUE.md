# Critique — external-observer findings

> Last pass: 2026-07-07
> Pass count: 2

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

### [HIGH] playbooks/new-project.md — step 4's bulk copy never lands CLAUDE.md at the repo root
- category: instruction-drift
- observation: templates/README.md documents `claude/` copying
  to the repo's `.claude/` "(+ CLAUDE.md → repo root)" and
  labels `claude/CLAUDE.md` explicitly "copy to repo ROOT" —
  but the one-liner `node -e` command in step 4 only does
  `fs.cpSync('../nexus/templates/claude','.claude',{recursive:true})`,
  which deposits it at `.claude/CLAUDE.md` and nowhere else.
  Verified by running the exact command in a scratch repo:
  `find . -maxdepth 2` shows `./.claude/CLAUDE.md` but no
  `./CLAUDE.md`. Claude Code auto-loads `CLAUDE.md` from the
  project root, not from `.claude/`, so the pointer file's
  entire purpose (being auto-read) never fires in a fresh
  adoption.
- evidence: `templates/README.md:43-44` (copy contract) vs.
  `playbooks/new-project.md:199` (copy command omits a root
  copy).
- suggested fix: add an explicit
  `cp ../nexus/templates/claude/CLAUDE.md ./CLAUDE.md` (or a
  second `fs.cpSync` line) to the step-4 command block in both
  `new-project.md` and `existing-project.md`.
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

### [MED] playbooks/new-project.md — plan/PHASE_CANDIDATES.md is listed as copied but the playbook never copies it
- category: missing-file
- observation: templates/README.md's copy contract lists
  `PHASE_CANDIDATES.md` under `plan/`, but the playbook's full
  step-4 copy block never mentions it — yet the skills that
  step 4 *does* copy (`expand.md`, `triage.md`, `march.md`,
  `oversight.md`) all read/write that file. A literal walk
  ships skills that depend on a file the playbook never
  creates.
- evidence: `templates/README.md:19` (lists
  `PHASE_CANDIDATES.md`) vs. `playbooks/new-project.md:199-206`
  (copy block omits it); referenced by `skills/expand.md:13,51,77`,
  `skills/triage.md:37,73`, `skills/march.md:74,106`,
  `skills/oversight.md:35,82`.
- suggested fix: add `cp nexus/templates/plan/PHASE_CANDIDATES.md
  ./plan/PHASE_CANDIDATES.md` to the step-4 command block.
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
