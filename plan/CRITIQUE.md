# Critique — external-observer findings

> Last pass: 2026-07-13
> Pass count: 4

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

### [MED] playbooks/new-project.md:458-463 — step 9's bootstrap manifest copy leaves standard-vocabulary placeholders unresolved with no replace instruction
- category: placeholder
- observation: step 9 says to copy
  `../nexus/templates/setup/bootstrap.example.json` to
  `setup/bootstrap.local.json` and "fill in your project
  settings" — but the source file contains the standard
  `<PROJECT>` and `<PROJECT_LOWER>` tokens (the same vocabulary
  swept everywhere else by step 4's sed). Step 9 runs after step
  4's placeholder sweep, and its scope (`./skills ./.claude
  ./plan ./agents.md ./scripts ./.env.example`) doesn't include
  `./setup` (which doesn't exist until step 9). Nothing tells the
  adopter these are the same tokens needing the same treatment, so
  a literal follower who already did the "big sed pass" once may
  not think to sed this file too, leaving a live-looking config
  with literal `<PROJECT>` / `<PROJECT_LOWER>` strings that `pnpm
  bootstrap` / `pnpm bootstrap:status` would then read as-is.
- evidence: `grep -n '<[A-Z_]*>'
  templates/setup/bootstrap.example.json` →
  `10:"name": "<PROJECT>"`, `13:"github_repo": "<PROJECT_LOWER>"`.
  Confirmed by copying it into a scratch repo after running step
  4's full sed pass — the tokens remained untouched.
- suggested fix: add a one-line note in step 9 pointing back to
  the step-4 placeholder table/sed command (or a scoped variant
  covering `./setup`) so the manifest gets the same replace pass.
- source: dry-run

### [LOW] playbooks/new-project.md:13 — "Six skill files in skills/" is a stale count
- category: comprehension
- observation: the playbook's opening "by the end you'll have"
  bullet list promises "Six skill files in `skills/`." Even in the
  minimal-adoption case (no `ship-data`/`ship-migration`/
  `ship-asset`/`moderate`), step 4's bulk copy plus the prune step
  still leaves 11 skill files (`ship-a-phase`, `plan-a-phase`,
  `iterate`, `critique`, `triage`, `expand`, `march`, `oversight`,
  `jot`, `digest`, `bootstrap`); a fuller adoption keeps all 15. A
  stranger following the intro literally would expect to count six
  and be confused finding nearly double that.
- evidence: `ls templates/skills/*.md | wc -l` → 15; after
  removing the four adopt-by-need files named in step 4's own
  worked example → 11. `playbooks/new-project.md:13` still says
  "Six."
- suggested fix: update the count (or drop the specific number and
  just say "the skill set") — it looks like a leftover from an
  earlier, smaller skill roster.
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

## Done

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
