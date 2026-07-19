# Critique — external-observer findings

> Last pass: 2026-07-19
> Pass count: 6

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

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

### [HIGH] templates/skills/ship-a-phase.md:206-207 — documented `<PROJECT_PKG_PREFIX>` replacement corrupts package-import lines into `@@<name>/...`
- category: placeholder
- observation: `templates/README.md`'s placeholder table and
  `playbooks/new-project.md`'s worked sed one-liner both replace
  `<PROJECT_PKG_PREFIX>` with a value that already includes the
  `@` sigil (e.g. `@thock`), but `ship-a-phase.md:206-207` writes
  the token with a literal `@` already prepended
  (`` `@<PROJECT_PKG_PREFIX>/content` ``). Running the documented
  sed verbatim turns it into `` `@@halcyon/content` `` — a broken
  package specifier, not a valid workspace import.
- evidence: reproduced in a scratch dry-run — after
  `sed -i ... -e 's/<PROJECT_PKG_PREFIX>/@halcyon/g'` (the exact
  one-liner at `playbooks/new-project.md:259`),
  `skills/ship-a-phase.md:206-207` reads "Reads via shared
  loaders (`@@halcyon/content`, `@@halcyon/data` ...)". Same
  double-`@` pattern also present at
  `customization/verify-gate.md:56`
  (`pnpm --filter @<PROJECT_PKG_PREFIX>/web start`), though that
  file isn't copied so isn't corrupted by the sed itself.
- suggested fix: drop the literal `@` from `ship-a-phase.md:206-207`
  (and `verify-gate.md:56`) so the token reads
  `<PROJECT_PKG_PREFIX>/content`, matching the convention that the
  replacement value already carries the `@`.
- source: dry-run

### [HIGH] playbooks/new-project.md:515-516 — step 9's `pnpm bootstrap:status` / `pnpm bootstrap` commands don't exist anywhere in the kit
- category: instruction-drift
- observation: step 9 tells the adopter to run `pnpm
  bootstrap:status` then `pnpm bootstrap`, but no template ever
  defines a `bootstrap` or `bootstrap:status` script in
  `package.json`. `customization/bootstrap-automation.md`
  documents the real invocation surface as the Claude Code slash
  command `/bootstrap status` / `/bootstrap` (a skill, not a
  shell script) — see its command table at
  `customization/bootstrap-automation.md:143-149`.
- evidence: `grep -rn '"bootstrap' --include='*.json'` across the
  repo returns nothing; `grep -rn "bootstrap:status"` matches only
  `playbooks/new-project.md:515` itself. Literally running `pnpm
  bootstrap:status` in an adopted repo fails with "missing
  script."
- suggested fix: change step 9's wording from `pnpm
  bootstrap:status` / `pnpm bootstrap` to `/bootstrap status` /
  `/bootstrap`, matching `customization/bootstrap-automation.md`'s
  documented command table.
- source: dry-run

### [MED] playbooks/new-project.md:512-514 — step 9's manifest copy target directory doesn't exist yet
- category: missing-file
- observation: step 9 says to copy
  `../nexus/templates/setup/bootstrap.example.json` to
  `setup/bootstrap.local.json`, but `setup/` is never created
  earlier in the walk — step 4's bulk copy doesn't touch
  `templates/setup/`, and step 9 itself has no `mkdir -p setup`
  before the `cp`.
- evidence: reproduced in a scratch dry-run:
  `cp ../nexus/templates/setup/bootstrap.example.json
  setup/bootstrap.local.json` → "cp: cannot create regular file
  'setup/bootstrap.local.json': No such file or directory" (exit
  1).
- suggested fix: prefix the copy instruction with `mkdir -p
  setup &&`, or note that `setup/00_files.md` (adopt-by-need, see
  `templates/README.md`'s table) should be copied first when
  external services are in scope.
- source: dry-run

### [MED] playbooks/new-project.md:455-456 — "uncomment the matching block in the script" no longer matches deploy-check.mjs's actual mechanism
- category: instruction-drift
- observation: step 7 and the script's own header comment
  (`templates/scripts/deploy-check.mjs:14`) both tell the adopter
  to "uncomment the matching block" for their provider. The
  script no longer has commented-out blocks — every provider
  (`netlify`, `vercel`, `github-actions`, `cloudflare-pages`,
  `render`, `fly`, `health-check`, `none`) is a live `if
  (PROVIDER === '...')` / `else if` branch selected at runtime by
  `DEPLOY_PROVIDER` (defaulting to `'netlify'`,
  `templates/scripts/deploy-check.mjs:32`). An adopter searching
  for a `/* ... */` block to uncomment will find none.
- evidence: `grep -n '^if (PROVIDER\|^} else if (PROVIDER'
  templates/scripts/deploy-check.mjs` lists 8 live branches, zero
  commented blocks; the header comment at line 14 still says
  "uncomment the matching block."
- suggested fix: reword both the script's header comment and
  `playbooks/new-project.md:455-456` to "set `DEPLOY_PROVIDER` in
  `.env` (defaults to `netlify`)" instead of "uncomment the
  matching block."
- source: dry-run

## Done

### [x] [LOW] playbooks/new-project.md §8 — sub-agent "copy" instruction re-introduces files step 4 already placed — this commit
- fix: reworded step 8's `scout`/`reader` bullets from "Copy
  from `../nexus/templates/claude/agents/...`" to "Already
  present from step 4's bulk copy
  (`.claude/agents/scout.md`/`reader.md`) — review and adapt",
  matching the already-fixed step-6/step-7 ordering findings'
  pattern.

### [x] [LOW] playbooks/new-project.md — step 6 edits a package.json that doesn't exist yet at that point in the walk — this commit
- fix: step 6 now opens by naming the gap directly — no
  `package.json` exists yet at that point in the walk, phase 1
  (the brief from step 5) is what scaffolds one — and reframes
  the shown JSON as the **target shape** for that brief to
  produce rather than something to edit immediately. Reworded
  the follow-on "Test it" line to "once phase 1 has scaffolded
  the file, test it" so the two paragraphs no longer contradict
  each other (the suggested fix's first option, folding into
  step 5, would have duplicated the scripts block there instead
  of once).

### [x] [LOW] playbooks/new-project.md — step 7 re-copies deploy-check.mjs already placed by step 4 — this commit
- fix: reworded step 7's opening line from "Copy
  `../nexus/templates/scripts/deploy-check.mjs` to
  `./scripts/deploy-check.mjs`" to note it's already present
  from step 4's bulk copy, then goes straight to wiring it into
  `package.json` — the suggested fix as filed, no scope changes.

### [x] [LOW] README.md:67 vs :582 — "How to use this kit" restates the TL;DR flow 500+ lines later with no cross-reference — this commit
- fix: added a one-line note at the top of "How to use this
  kit" (`README.md:582`) marking it as the manual-path
  equivalent of the TL;DR sections above and pointing readers
  who already delegated adoption to an agent to skip it — the
  suggested fix as filed, no scope changes.

### [x] [LOW] playbooks/new-project.md:88-96 — step 2's bearings.md placeholder list replaces a token that isn't there and omits one that is — this commit
- fix: swapped `<REPO_SLUG>` for `<DEFAULT_BRANCH>` in step 2's
  placeholder list (`playbooks/new-project.md`) — `<REPO_SLUG>`
  never appears anywhere in `templates/plan/bearings.md`, while
  `<DEFAULT_BRANCH>` does (3 occurrences). Also fixed a second,
  deeper mismatch found while reproducing the finding:
  `<PROJECT_TAGLINE>` was likewise never a literal token in
  `bearings.md` — its TL;DR line used a differently-named
  freeform placeholder (`<ONE-LINE PRODUCT DESCRIPTION>`) that no
  exact-string search-and-replace could ever match, silently
  dropping the tagline from the "8 canonical placeholders"
  contract for every adopter who followed step 2 literally.
  Renamed that line's token to the canonical `<PROJECT_TAGLINE>`
  in `templates/plan/bearings.md` so it now matches the 8-token
  table (`templates/README.md`) and gets swept by step 4's bulk
  sed even if a reader skips the manual step-2 pass — the same
  self-healing property `<DEFAULT_BRANCH>` already had.

### [x] [MED] playbooks/new-project.md:270-302 — the "Prune adopt-by-need files" fix only covers 4 of templates/README.md's ~12 adopt-by-need rows — this commit
- fix: extended the prune subsection's bullet list + both worked
  `rm -f`/`Remove-Item` examples in `playbooks/new-project.md` to
  cover `skills/digest.md`, `skills/bootstrap.md`,
  `scripts/refresh-critique-session.mjs`,
  `scripts/check-secrets-liveness.mjs`, and
  `scripts/stack-lifecycle.mjs` — the five files the finding
  reproduced as surviving prune. Also added the missing
  `skills/bootstrap.md` + `claude/commands/bootstrap.md` row to
  `templates/README.md`'s adopt-by-need table itself (it had none
  before this commit, so the prune subsection's "cross-check
  against the table" instruction couldn't have worked for it).
  `.github/workflows/*` files (night.yml, heartbeat.yml,
  nightly-smoke.yml) stayed out of scope — step 4's bulk copy
  never lands `.github/`, so they were never part of this gap.

### [x] [MED] playbooks/new-project.md:35 — "sed-replace if you use npm/yarn/bun" has no worked example and conflicts with settings.json's pnpm-only allowlist — this commit
- fix: took the suggested_fix's second option (state the
  constraint plainly) rather than the worked-example option —
  cheaper and more honest given `templates/claude/settings.json`
  isn't generated per package-manager choice. Reworded the
  prerequisites bullet in `playbooks/new-project.md` to name
  pnpm as a hard prerequisite for the unattended-loop path,
  cite the exact coupling (`settings.json`'s `Bash(pnpm
  ...:*)` allowlist entries), and tell an adopter who insists on
  switching that they must edit both the templates *and*
  `settings.json`'s allow list, not just sed the scripts.

### [x] [MED] templates/README.md:125-128 vs :133 — adopt-by-need table omits `.claude/commands/*.md` pointers for 4 of 5 prunable skills, and the prune instructions never clean them up — this commit
- fix: added the matching `claude/commands/<name>.md` file to
  each of the four adopt-by-need table rows in
  `templates/README.md` (`ship-data.md`, `ship-migration.md`,
  `ship-asset.md`, `moderate.md`), matching the existing
  `digest.md` row's pattern. Extended
  `playbooks/new-project.md`'s "Prune adopt-by-need files"
  subsection — both the bullet list and the worked
  `rm -f`/`Remove-Item` examples — to also remove the four
  `.claude/commands/*.md` files, plus a one-line note
  explaining why: each command file opens with "Read
  `skills/<name>.md` end to end" and becomes a dead pointer
  once its skill is pruned. `existing-project.md` only
  cross-references this same section, so no duplicate fix
  needed there.

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
