# Critique — external-observer findings

> Last pass: 2026-07-03
> Pass count: 1

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

### [HIGH] README.md + playbooks/new-project.md — sibling clone layout breaks the playbook's bare `nexus/...` copy paths
- category: instruction-drift
- observation: README's recommended layout is a sibling clone
  (`cd <parent-of-your-project>; git clone ... nexus`, giving
  `my-project/` and `nexus/` side by side), but the playbook it
  hands off to copies with bare `nexus/templates/...` paths,
  which only resolve if nexus is cloned *inside* the project
  root. An agent that follows README's own recommended layout
  hits a broken `cp` on the first command of template-copying.
- evidence: `README.md:78-90` (sibling clone, `cd
  <parent-of-your-project>`) vs. `playbooks/new-project.md:199-206`
  (`cp -r nexus/templates/skills/ ./skills/` etc.) — running
  the literal command from the sibling layout gives `cp: cannot
  stat 'nexus/templates/skills/': No such file or directory`.
- suggested fix: either rewrite the playbook's copy paths to
  `../nexus/templates/...` to match the recommended sibling
  layout, or change the README's recommended clone step to put
  nexus inside the project root — make the two agree.
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

(empty)
