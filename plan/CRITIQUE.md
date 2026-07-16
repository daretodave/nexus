# Critique — external-observer findings

> Last pass: 2026-07-16
> Pass count: 5

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

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

### [MED] playbooks/new-project.md:270-302 — the "Prune adopt-by-need files" fix only covers 4 of templates/README.md's ~12 adopt-by-need rows
- category: instruction-drift
- observation: step 4's prune subsection only gives worked removal
  instructions for `ship-data.md`, `ship-migration.md`+
  `lint-migration.mjs`, `ship-asset.md`+`brander.md`,
  `moderate.md`. But the bulk `fs.cpSync` in the same step also
  unconditionally lands `skills/digest.md`, `skills/bootstrap.md`,
  `scripts/refresh-critique-session.mjs`,
  `scripts/check-secrets-liveness.mjs`, and
  `scripts/stack-lifecycle.mjs` — all listed in
  `templates/README.md`'s adopt-by-need table as conditional (on
  cloud-loop adoption, `/bootstrap` adoption, `Auth:` being set,
  and hermetic-e2e Pattern B, respectively). A literal follower
  with `Auth: none` and no cloud loop ends up with 5
  conditionally-scoped files present with no prompt to remove
  them — the exact "presence is misleading" problem
  `templates/README.md:139-141` warns about, just for a different
  file set than the one already fixed.
- evidence: ran the step-4 copy + prune in a scratch halcyon repo;
  `scripts/check-secrets-liveness.mjs`,
  `scripts/refresh-critique-session.mjs`,
  `scripts/stack-lifecycle.mjs`, `skills/digest.md`,
  `skills/bootstrap.md` all remained. `grep -n -i
  'digest\|check-secrets-liveness\|refresh-critique-session\|stack-lifecycle'
  playbooks/new-project.md` → no matches in the prune subsection
  or anywhere else in the file.
- suggested fix: extend the prune subsection's table/worked
  example to cover all adopt-by-need rows from
  `templates/README.md`, not just the four Surface/Structured-data/
  UGC-gated ones.
- source: dry-run

### [LOW] playbooks/new-project.md:88-96 — step 2's bearings.md placeholder list replaces a token that isn't there and omits one that is
- category: placeholder
- observation: step 2 instructs replacing five placeholders in the
  freshly-copied `bearings.md`, including `<REPO_SLUG>` — but the
  template `bearings.md` contains no `<REPO_SLUG>` token anywhere,
  so that instruction is a silent no-op. Meanwhile `bearings.md`
  does contain `<DEFAULT_BRANCH>` (in the "Post-push: `pnpm
  deploy:check`" section), which step 2's list never mentions.
  Since step 2 ends with "Commit `bearings.md` separately" —
  before step 4's later, broader sed pass — a literal follower
  commits `bearings.md` with a literal `<DEFAULT_BRANCH>` still in
  it at that point (self-healed only later, incidentally, when
  step 4's sed sweeps `./plan`).
- evidence: `grep -n 'REPO_SLUG' templates/plan/bearings.md` → no
  match; `grep -n 'DEFAULT_BRANCH' templates/plan/bearings.md` →
  line 374 (`git push origin <DEFAULT_BRANCH>`). Reproduced in a
  scratch repo: after step 2's exact five-item replace,
  `<DEFAULT_BRANCH>` remained; the first `bearings.md` commit
  still had it.
- suggested fix: drop `<REPO_SLUG>` from step 2's bearings-specific
  list (it belongs to the later step-4 table, not this file) and
  add `<DEFAULT_BRANCH>` in its place, or just tell the reader
  bearings.md's remaining tokens get swept in step 4's later pass.
- source: dry-run

### [MED] templates/README.md:125-128 vs :133 — adopt-by-need table omits `.claude/commands/*.md` pointers for 4 of 5 prunable skills, and the prune instructions never clean them up
- category: instruction-drift
- observation: the adopt-by-need table's `digest.md` row
  explicitly pairs the skill with its command pointer
  (`skills/digest.md` + `claude/commands/digest.md`), but the
  `ship-data.md`, `ship-migration.md`, `ship-asset.md`, and
  `moderate.md` rows list only the skill (and in one case an
  agent) — never the matching `claude/commands/*.md` file.
  `playbooks/new-project.md`'s "Prune adopt-by-need files"
  subsection mirrors that gap: its worked `rm -f
  skills/ship-data.md skills/ship-migration.md
  scripts/lint-migration.mjs skills/ship-asset.md
  .claude/agents/brander.md skills/moderate.md` never touches
  `.claude/commands/`. Following the playbook literally for a
  `Structured data: none`, `Surface: service`, no-UGC project
  (exactly the pruning example given) leaves
  `.claude/commands/ship-data.md`, `ship-migration.md`,
  `ship-asset.md`, and `moderate.md` in place, each of which
  opens with "Read `skills/ship-data.md` end to end before
  touching anything else" — a file that no longer exists.
- evidence: reproduced in a scratch halcyon repo — after
  running `playbooks/new-project.md`'s step-4 bulk copy then
  its literal prune `rm -f` command, `.claude/commands/ship-data.md`
  still existed and still read (verbatim) "Read
  `skills/ship-data.md` end to end before touching anything
  else." `templates/claude/commands/` confirmed to ship
  `ship-data.md`, `ship-migration.md`, `ship-asset.md`,
  `moderate.md` alongside `digest.md`; `templates/README.md:125-128`
  vs `:133` — only the digest row pairs a skill with its
  command file.
- suggested fix: add the matching `claude/commands/<name>.md`
  file to each of the four adopt-by-need table rows (matching
  the digest row's pattern), and extend `new-project.md`'s
  prune `rm -f`/`Remove-Item` examples to also remove
  `.claude/commands/ship-data.md`, `ship-migration.md`,
  `ship-asset.md`, `moderate.md`.
- source: dry-run

### [LOW] README.md:67 vs :582 — "How to use this kit" restates the TL;DR flow 500+ lines later with no cross-reference
- category: comprehension
- observation: `README.md` opens with a fully-worked
  delegate-to-an-agent flow ("TL;DR — clone + delegate the
  adoption", line 67) that a reader is told is sufficient on
  its own ("skip the playbook, hand it to your agent"). Roughly
  500 lines later, "How to use this kit" (line 582) presents an
  unrelated-looking 8-step generic checklist covering much of
  the same ground (read playbook, copy templates, replace
  placeholders, wire CI, first `/ship-a-phase`) with zero
  pointer back to the TL;DR section or note that it's the
  manual-path restatement of the same journey. A stranger
  reading top-to-bottom is left to guess whether this second
  list is a redundant summary, a stricter/updated version, or
  an alternate path they also need to complete.
- evidence: `README.md:67` (`## TL;DR — clone + delegate the
  adoption`) and `README.md:582` (`## How to use this kit`) —
  no link between the two sections anywhere in the file.
- suggested fix: add a one-line note at the top of "How to use
  this kit" ("This is the manual-path equivalent of the TL;DR
  above — skip it if you delegated adoption to an agent
  already") so the two sections read as one system rather than
  two competing checklists.
- source: dry-run

### [LOW] playbooks/new-project.md §8 — sub-agent "copy" instruction re-introduces files step 4 already placed
- category: ordering
- observation: step 8 ("Sub-agents") says to copy `scout.md`
  and `reader.md` "from
  `../nexus/templates/claude/agents/scout.md`" as though
  introducing them for the first time, but step 4's bulk
  `fs.cpSync` of `templates/claude` → `.claude` already
  recursively lands the entire `.claude/agents/` directory
  (`scout.md`, `reader.md`, `generic-specialist.md`,
  `brander.md`) earlier in the same walk. This is the same
  class of issue as the already-pending step-7
  `deploy-check.mjs` re-copy finding above, just at a different
  location, so a literal follower hits a second no-op "copy"
  and may wonder if `.claude/agents/` is supposed to be empty
  before this step.
- evidence: in the scratch walk, `ls .claude/agents/` after
  step 4 (before reaching step 8) already showed `scout.md`,
  `reader.md`, `generic-specialist.md`, `brander.md` present;
  `playbooks/new-project.md:212` (bulk copy) vs `:428-436`
  (step 8's re-copy instructions).
- suggested fix: reword step 8 to "already present from step 4
  — review and adapt scout.md / reader.md, author 1-2 domain
  specialists" rather than "copy from
  `../nexus/templates/claude/agents/...`".
- source: dry-run

## Done

### [x] [LOW] playbooks/new-project.md:13 — "Six skill files in skills/" is a stale count — this commit
- fix: reworded to "The skill set in `skills/` (count varies
  with which adopt-by-need files you keep)" in
  `playbooks/new-project.md:18`, and fixed the same stale figure
  at `README.md:381`-383 (second, previously-unreported
  location, found via `plan/AUDIT.md`'s `[A, 3.2]` row).

### [x] [MED] playbooks/new-project.md:458-463 — step 9's bootstrap manifest copy leaves standard-vocabulary placeholders unresolved with no replace instruction — this commit
- fix: added a note right after step 9's manifest copy
  explaining `./setup` didn't exist during step 4's sweep so
  its `<PROJECT>`/`<PROJECT_LOWER>` tokens were never touched,
  plus a scoped one-liner (`sed -i ... setup/bootstrap.local.json`)
  to run before `pnpm bootstrap`.

### [x] [MED] README.md:159,258 vs playbooks/new-project.md:4 — delegated-agent time estimate contradicts the playbook's own estimate by 2-4x — this commit
- fix: kept both figures (agent-paced in README, human-paced in
  the playbooks) but made the split explicit instead of silent.
  `new-project.md`'s header now says its 2-3 hour estimate is
  for manual, section-by-section work, and that a fully
  delegated agent run (README's TL;DR) finishes well under an
  hour since it skips the read-and-decide pauses. Both README
  prompts now say "agent-paced" next to their own estimates and
  point back at that note; the pitch-flow prompt additionally
  calls out that Phase A (pre-spec.md) stays genuinely
  interactive while Phase B is the delegated, faster leg.

### [x] [MED] playbooks/new-project.md — blanket `skills/` copy contradicts templates/README.md's adopt-by-need contract — this commit
- fix: added a "Prune adopt-by-need files" subsection right
  after step 4's placeholder replace in `new-project.md`,
  mapping each adopt-by-need file (`ship-data.md`,
  `ship-migration.md` + `lint-migration.mjs`, `ship-asset.md` +
  `brander.md`, `moderate.md`) to the `Surface` / `Structured
  data` / UGC decision that keeps or drops it, plus a worked
  `rm` / `Remove-Item` example for the common case where none
  apply. `existing-project.md`'s overlay section (§3) got a
  pointer to the same worked commands, placed right after its
  own bearings-fill-in step where those decisions land.

### [x] [MED] templates/README.md / playbooks/new-project.md — documented sed one-liner's scope misses files the same step copies — this commit
- fix: widened `playbooks/new-project.md`'s bash grep/sed scope
  and PowerShell `Get-ChildItem` scope from `./skills ./.claude
  ./plan ./agents.md` to also include `./scripts` and
  `./.env.example` — the two paths step 4's bulk copy lands but
  the documented replace step skipped. Confirmed the fix now
  covers the cited unresolved tokens
  (`templates/scripts/deploy-check.mjs:51,141` and
  `templates/env/env.example:31,67`).

### [x] [HIGH] playbooks/new-project.md — step 4's bulk copy never lands plan/phases/, so step 5's briefs ship with unresolved placeholders (this commit)
- fix: added `['templates/plan/phases', 'plan/phases']` to step
  4's `fs.cpSync` array in `new-project.md`, so `plan/phases/`
  lands before step 4's placeholder sed runs — and since `./plan`
  was already in the sed's scope, both `phase_1_bootstrap.md` and
  `phase_canonical_sibling.md` now get swept for free. Reworded
  step 5 to point at the already-copied, already-swept local
  files instead of the `../nexus/templates/...` source path.
  `existing-project.md` doesn't reference these phase templates
  in its own step 5, so no matching change needed there. Verified
  in a scratch dir: after the updated step 4 command + sed sweep,
  `plan/phases/*.md` has zero leftover placeholder tokens.

### [x] [LOW] README.md:167-168 — "Files added" checklist omits CLAUDE.md after it was patched into step 4's copy (this commit)
- fix: added `CLAUDE.md` to the "Files added" line in
  README.md's "Review what landed" checklist, matching
  `playbooks/new-project.md`'s step 4, which already copies it
  to the repo root (load-bearing: Claude Code only auto-loads
  `CLAUDE.md` from root, not from `.claude/`).

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
