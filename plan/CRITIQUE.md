# Critique — external-observer findings

> Last pass: 2026-07-22
> Pass count: 7

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

(none)

## Done

### [x] [LOW] templates/README.md:131 vs playbooks/new-project.md §4's prune list — the `.claude/` bundle is documented as adopt-by-need but never offered for removal — this commit
- fix: added a ninth bullet to the prune list in
  `playbooks/new-project.md` — `.claude/settings.json` +
  `.claude/hooks/guard.mjs` + `.claude/CLAUDE.md` +
  `scripts/notify.mjs`, removed unless the adopter runs the loop
  on Claude Code — matching `templates/README.md:131`'s
  adopt-by-need row exactly. Root `CLAUDE.md` stays either way
  (noted inline) since Claude Code only auto-loads it from the
  repo root, not `.claude/`. Extended the worked example's
  preamble and both `rm -f`/`Remove-Item` commands to cover the
  new ninth condition (not running the loop on Claude Code).

### [x] [LOW] playbooks/new-project.md:251-262 — bash one-liner's `./data` scope errors on stdout when the adopter isn't using GitHub-as-DB — this commit
- fix: added `2>/dev/null` before the `| xargs` pipe in the
  bash one-liner's `grep -rl`, mirroring the PowerShell twin's
  existing `-ErrorAction SilentlyContinue` guard on the same
  `./data` entry. Reproduced first in a scratch dir (bare
  `grep -rl ... ./data` errors `grep: ./data: No such file or
  directory`, exit 2, when `./data` doesn't exist) then
  confirmed the guarded version exits 0 and still performs the
  replace on the files that do exist.

### [x] [MED] playbooks/new-project.md:248-261 — bash placeholder one-liner uses `sed -i` without a backup-extension arg, which breaks on stock macOS — this commit
- fix: reproduced the failure mode's root cause in a scratch
  dir (GNU sed accepts bare `-i` fine, which is why it hid on
  Linux) and took the suggested fix's portable-guard option:
  `playbooks/new-project.md`'s bash one-liner now runs
  `xargs sed -i.bak -e ... && find . -name '*.bak' -delete`
  instead of bare `sed -i`. `-i.bak` (suffix attached, no
  space) is the one spelling both BSD sed (stock macOS) and
  GNU sed parse identically — BSD sed no longer misreads the
  following `-e` as its required backup-suffix argument, and
  the trailing `find` deletes the backups the suffix now
  forces. Verified the updated one-liner still resolves all
  eight placeholders and leaves no `.bak` files behind under
  GNU sed. Added a short note above the code block explaining
  why, matching `playbooks/windows-notes.md:16-18`'s standing
  "every playbook code block works as written" claim for
  macOS/Linux/WSL. Left the "narrow the macOS claim" fix
  option unused — it would have downgraded a claimed-supported
  platform instead of fixing the actual bug.

### [x] [LOW] templates/README.md — `<PROJECT_PKG_PREFIX>` has no worked replacement example — re-confirmed resolved, closing
- fix: re-walked the dry-run adoption end to end.
  `templates/README.md:93-97` no longer carries a truncated
  worked example — it now points at
  `playbooks/new-project.md` §4 "rather than hand-rolling a
  partial version here," and that section's bash (`:261`) and
  PowerShell (`:277`) one-liners both resolve
  `<PROJECT_PKG_PREFIX>` (`@thock`). Confirmed zero unresolved
  occurrences after running both documented commands against a
  scratch copy. AUDIT.md's 2026-07-20 tick flagged this as
  already-resolved and left it pending for a `/critique` pass
  to close per `iterate.md` §5.4 — this is that pass.

### [x] [MED] playbooks/new-project.md:455-456 — "uncomment the matching block in the script" no longer matches deploy-check.mjs's actual mechanism — this commit
- fix: reworded `templates/scripts/deploy-check.mjs:14`'s header
  comment and `playbooks/new-project.md`'s step 7 to "set
  `DEPLOY_PROVIDER` in `.env` (defaults to `netlify`)" instead of
  "uncomment the matching block" — the suggested fix as filed,
  no scope changes.

### [x] [MED] playbooks/new-project.md:512-514 — step 9's manifest copy target directory doesn't exist yet — this commit
- fix: replaced the prose copy instruction with a literal
  `mkdir -p setup && cp ...` command block, and noted why —
  step 4's bulk copy never lands `templates/setup/`. Trimmed
  the following paragraph's duplicate explanation of the same
  gap.

### [x] [HIGH] playbooks/new-project.md:515-516 — step 9's `pnpm bootstrap:status` / `pnpm bootstrap` commands don't exist anywhere in the kit — this commit
- fix: reworded step 9's two invocations from `pnpm
  bootstrap:status` / `pnpm bootstrap` to `/bootstrap status` /
  `/bootstrap`, matching the documented command table at
  `customization/bootstrap-automation.md:143-149` — no template
  ever defined those as package.json scripts.

### [x] [HIGH] templates/skills/ship-a-phase.md:206-207 — documented `<PROJECT_PKG_PREFIX>` replacement corrupts package-import lines into `@@<name>/...` — this commit
- fix: dropped the literal `@` from the token in
  `templates/skills/ship-a-phase.md:206-207` and
  `customization/verify-gate.md:56`, so both now read
  `<PROJECT_PKG_PREFIX>/content` / `<PROJECT_PKG_PREFIX>/web` —
  matching the convention (confirmed against
  `templates/README.md:91` and `playbooks/new-project.md:244`)
  that the replacement value already carries the `@` sigil (e.g.
  `@thock`). Verified no other `@<PROJECT_PKG_PREFIX>` occurrences
  remain in the kit.

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
