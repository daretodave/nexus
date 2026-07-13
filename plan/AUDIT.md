# Kit audit — 2026-07-11

> Bias: none

Cloud tick 2026-07-12 (first): picked [2.1] over the
higher-scoring [user-issue #12] because #12's fix touches
`.github/workflows/march.yml`, which `ACTIONS_PAT` cannot push
(no `workflows` scope, by design — see its own evidence). Left
#12 pending for a human or locally-run `/iterate` with a
workflow-scoped token, per its `next`.

Cloud tick 2026-07-12 (second): #12 still the only AUDIT row
and still blocked for the same reason, so this tick shipped the
next highest-scoring queue item instead — `plan/CRITIQUE.md`'s
MED "sed one-liner's scope misses files" row (queue rows
compete with AUDIT rows on the same scale, per `skills/iterate.md`
§3). AUDIT block otherwise unchanged; still <24h old.

Cloud tick 2026-07-12 (third): #12 still the sole AUDIT row,
still blocked (no `workflows`-scoped token in this environment).
Shipped `plan/CRITIQUE.md`'s remaining MED row — the blanket
`skills/` copy contradicting the adopt-by-need contract. AUDIT
block otherwise unchanged; still <24h old.

Cloud tick 2026-07-13: #12 still the only AUDIT row, still
blocked (no `workflows`-scoped token in this environment).
Re-scored `plan/CRITIQUE.md`'s pending queue (five MED, four
LOW rows) and shipped the highest-scoring one — the README /
playbook estimated-time contradiction (agent-paced vs
human-paced figures reading as flatly incompatible) — over the
prune-table-coverage and bootstrap-manifest-placeholder MED
rows, both larger edits for a similar score. Not a fresh A-G
sweep; last full sweep still 2026-07-11 (below).

Second full dimension sweep (A-G) since phase 18 ended the
build plan. Re-verified the two rows still pending from the
2026-07-09 pass (both confirmed real) and swept fresh for new
drift: templates/ vs. both tree diagrams, verify.mjs's own leg
coverage, model-id freshness, and placeholder-sample accuracy.
Sibling lessons files (`../kintilla`, `../semilayer`) still not
present in this checkout — dimension G came up empty, not
skipped. No stale/invented model ids found; placeholder table
still correctly 8 entries.

## Pending

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

### [x] [2.1] templates/README.md's sample placeholder one-liner uses variable names that don't match its own 8-entry table — this commit
- fix: deleted the abbreviated, partially-wrong bash sample
  (declared `PROVIDER`/`REPO` vars but the table uses
  `HOSTING_PROVIDER`/`REPO_SLUG`, and it only covered 2 of 8
  placeholders behind an `# ...etc` comment) and pointed
  `templates/README.md` straight at
  `playbooks/new-project.md` §4's exhaustive, correct bash +
  PowerShell one-liners instead of maintaining two copies that
  can drift.

### [x] [3.2] data-layer mermaid diagram is a style outlier — this commit
- fix: both mermaid flowcharts in the kit (README's playbook
  picker, `customization/data-layer.md`'s variant picker) are
  the same shape — a branching decision tree — used
  consistently, not two unrelated one-offs. Kept both as-is and
  formalized the pattern as voice rule 8 in `plan/bearings.md`:
  mermaid `flowchart` is the accepted idiom for decision-routing
  only, prose/tables stay default for everything else.

### [x] [5.6] verify.mjs's tree leg never parses templates/README.md — this commit
- fix: generalized `legTree()`'s fence parser into
  `parseTreeBlock(text, rootLabel, prefix)`, called once for
  `README.md`/`nexus/` (prefix `''`, root IS disk root) and once
  for `templates/README.md`/`templates/` (prefix `'templates'`,
  a real subdirectory). The comment stripper (`stripTreeComment`)
  now cuts at whichever comes first, a bare `#` or a run of 2+
  spaces — needed because `README.md` mixes both single-space-
  before-`#` and double-space-before-`#` styles while
  `templates/README.md` uses `→`/`(...)` after 2+ spaces only.
  Added a reverse disk→tree check (`REVERSE_CHECK_DIRS`:
  `templates/scripts`, `templates/skills`,
  `templates/claude/commands`, `templates/claude/agents`) that
  walks each dir's real files and fails if one is missing from
  both diagrams' entry sets — but only for dirs a diagram
  actually expands per-file; `claude/commands/` and
  `claude/agents/` stay intentionally collapsed to one entry in
  both docs, so they're correctly skipped rather than false-
  flagged. Verified both directions catch induced gaps (an
  untracked probe file under `templates/scripts/`, and a renamed
  tree entry) before reverting the probes.

### [x] [1.8] templates/scripts/__tests__/loop-issue.test.mjs isn't in either layout tree — this commit
- fix: added `│   └── __tests__/loop-issue.test.mjs` to
  `templates/README.md`'s `scripts/` tree block, and the
  equivalent leaf to `README.md`'s own kit tree (a second,
  previously-unreported instance of the identical gap found
  during the 2026-07-11 re-sweep) — both now list the file every
  bulk `scripts/` copy already silently includes.

### [x] [3.5] cloud-loop reference implementation is an external link — this commit
- fix: `playbooks/cloud-loop.md`'s "Reference implementation"
  section now points primarily at this repo's own `.github/`
  (the ouroboros — nexus runs the loop on itself), keeping
  `thock` as the secondary reference instead of the sole link.

### [x] [3.6] plan/steps/01_build_plan.md's Phase log is missing 6 of 18 phases — this commit
- fix: appended phases 9, 10, 11, 13, 15, 17 to the Phase log
  in `plan/steps/01_build_plan.md`, commit order, matching the
  existing one-line style — closing the gap against the 18
  phases the Status block already marks `[x]`.

### [x] [4.2] three onboarding docs claim "six placeholders," templates/README.md's canonical table has eight — this commit
- fix: added `<PROJECT_TAGLINE>` and `<PROJECT_PKG_PREFIX>` to
  `README.md`'s TL;DR placeholder list, `new-project.md`'s §4
  mapping table, both one-liners (bash `grep -rl`/`sed -i` and
  the PowerShell `$repl` hashtable), relabeled "all six" → "all
  eight" in `new-project.md` and `windows-notes.md`, and fixed
  the same stale "all six" in `existing-project.md`'s §3 (same
  root cause, outside the original three-doc citation but
  caught while fixing the others).

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
