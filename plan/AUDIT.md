# Kit audit — 2026-07-19

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

Cloud tick 2026-07-14: #12 still the only AUDIT row, still
blocked for the same reason. Re-scored `plan/CRITIQUE.md`'s
remaining queue (three MED, four LOW) and shipped the
bootstrap-manifest-placeholder MED row — cheapest fix of the
three MEDs (a one-line note + scoped sed, vs. the prune-table
row's five new worked examples and the npm/yarn/bun row's
settings.json-allowlist redesign). Not a fresh A-G sweep; last
full sweep still 2026-07-11.

Second full dimension sweep (A-G) since phase 18 ended the
build plan. Re-verified the two rows still pending from the
2026-07-09 pass (both confirmed real) and swept fresh for new
drift: templates/ vs. both tree diagrams, verify.mjs's own leg
coverage, model-id freshness, and placeholder-sample accuracy.
Sibling lessons files (`../kintilla`, `../semilayer`) still not
present in this checkout — dimension G came up empty, not
skipped. No stale/invented model ids found; placeholder table
still correctly 8 entries.

Third full dimension sweep (A-G), cloud tick 2026-07-14 — first
full A-G sweep since 2026-07-11 (the intervening four ticks
only re-scored `plan/CRITIQUE.md`'s pending queue, per their own
log lines above). Dimension G still empty (no sibling lessons
files present). Top finding shipped this tick (below); four more
queued to Pending, ranked below `[user-issue #12]` which stays
the oldest row but remains blocked on a workflows-scoped token.

Cloud tick 2026-07-14 (second): #12 still the only blocked row.
Verified and shipped the next-highest scorer — the
`thock.netlify.app` link rot (score 4.8) — over the two
remaining A-class rows (4.2, 3.2) which score lower. Not a fresh
A-G sweep; last full sweep still today's third sweep above.

Cloud tick 2026-07-14 (third): #12 still the only blocked row.
Shipped the next-highest scorer — the README command-table
completeness row (score 4.2) — but narrowed its scope: added
`/digest` (main table) and `/moderate` (opt-in table), skipped
`/lessons-pr`. `skills/lessons-pr.md` documents itself as a
nexus-self meta-skill adopters never copy (confirmed: no
`templates/skills/lessons-pr.md` exists), so listing it beside
adopter-facing commands in "What you get" would misrepresent it
as something adopters run in their own repo. The existing
forward-reference at README.md:237 (capture lessons during
adoption, land them via a later `/lessons-pr` pass *against the
nexus repo*) already covers it accurately.

Cloud tick 2026-07-15: #12 still the only blocked row (same
`ACTIONS_PAT` scope constraint). Shipped the next-highest
scorer — the "six skill files" stale count (score 3.2, [A,
3.2] below) — over the `scripts/` checklist row (2.7). Not a
fresh A-G sweep; last full sweep still cloud tick 2026-07-14
(third).

Cloud tick 2026-07-17: fresh sweep of C (link rot — no new dead
links beyond the already-fixed `thock.netlify.app`, which now
only appears in historical AUDIT/DIGEST log prose, not live
docs), F (model-id freshness — `claude-sonnet-5`,
`claude-haiku-4-5`, `claude-opus-4-8` all current, none stale),
and G (sibling lessons — `../kintilla/plan/lessons.md` and any
`NEXUS_LESSONS.md` still absent from this checkout, dimension
empty). A/B/D leaned on `verify.mjs`'s green tree and emoji
legs rather than a manual re-derive. #12 still the only blocked
AUDIT row. Shipped `plan/CRITIQUE.md`'s top-scoring pending row
— the `.claude/commands/*.md` dead-pointer gap in the
adopt-by-need prune instructions (MED, reproduced and
confirmed real) — over the remaining MED (pnpm/npm allowlist
conflict, larger redesign-shaped fix) and six LOW rows.

Cloud tick 2026-07-17 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (one MED, six
LOW) and shipped the MED — the npm/yarn/bun sed-replace row —
over the AUDIT block's own `[A/E, 2.7]` row (lower score) and the
prune-coverage MED (larger edit, similar impact). Took the
suggested fix's cheaper option: state pnpm as a hard prerequisite
for the unattended path instead of building an unmaintained
worked npm/yarn/bun example. Not a fresh A-G sweep; last full
sweep still today's first tick (above).

Cloud tick 2026-07-17 (third): #12 still the only blocked AUDIT
row. Shipped the last remaining MED in `plan/CRITIQUE.md`'s
queue — the prune-coverage row deferred by the previous tick —
over the AUDIT block's own `[A/E, 2.7]` row (lower score) and six
remaining LOW rows. Extended `playbooks/new-project.md`'s prune
subsection to the five files the finding reproduced as surviving
(`skills/digest.md`, `skills/bootstrap.md`,
`scripts/refresh-critique-session.mjs`,
`scripts/check-secrets-liveness.mjs`, `scripts/stack-lifecycle.mjs`)
and closed a related gap surfaced while fixing it: `templates/README.md`'s
adopt-by-need table never had a row for `skills/bootstrap.md` in
the first place. `plan/CRITIQUE.md`'s pending queue is now six
LOW rows only. Not a fresh A-G sweep; last full sweep still
today's first tick (above).

Cloud tick 2026-07-18: #12 still the only blocked AUDIT row.
Re-scored `plan/CRITIQUE.md`'s remaining queue (all six LOW rows)
and shipped the highest scorer — the step-2 `bearings.md`
placeholder-list mismatch (score ~3.2) — over the AUDIT block's
own `[A/E, 2.7]` row and the other five LOW rows (2.4 and under).
Reproducing the finding surfaced a second, deeper bug in the same
root cause: `<PROJECT_TAGLINE>` was never an actual literal token
in `templates/plan/bearings.md` either (it used a freeform
`<ONE-LINE PRODUCT DESCRIPTION>` placeholder instead), so the
canonical 8-placeholder contract silently no-opped on the tagline
for every adopter — fixed alongside the originally-reported
`<REPO_SLUG>`/`<DEFAULT_BRANCH>` swap. Not a fresh A-G sweep; last
full sweep still 2026-07-17 (above).

Cloud tick 2026-07-18 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (five LOW
rows) and shipped the highest scorer — the README TL;DR vs "How
to use this kit" missing cross-reference (score ~3.6) — over the
AUDIT block's own `[A/E, 2.7]` row and the four remaining LOW
rows (2.4 and under). Not a fresh A-G sweep; last full sweep
still 2026-07-17 (above).

Cloud tick 2026-07-18 (third): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (four LOW
rows) against the AUDIT block's own `[A/E, 2.7]` row (tied
score) and shipped the CRITIQUE row — the step-7
`deploy-check.mjs` redundant-copy instruction (score ~2.7,
oldest pending queue row, dry-run-sourced) — as the cheaper,
more confidently-scoped single-line reword. Not a fresh A-G
sweep; last full sweep still 2026-07-17 (above).

Cloud tick 2026-07-19: #12 still the only blocked AUDIT row.
Re-scored `plan/CRITIQUE.md`'s remaining queue (three LOW rows)
against the AUDIT block's own `[A/E, 2.7]` row (tied score) and
shipped the CRITIQUE row — the step-6 package.json-doesn't-
exist-yet ordering row, oldest pending queue row — over the two
other LOW rows and the tied AUDIT row, continuing the pattern of
favoring the queue on ties (cheaper, single-section edit). Not a
fresh A-G sweep; last full sweep still 2026-07-17 (above).

Cloud tick 2026-07-19 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (two LOW
rows) against the AUDIT block's own `[A/E, 2.7]` row (tied
score). Reproducing the `PROJECT_PKG_PREFIX` row found it
already resolved — an earlier commit (`[x] [2.1]` above) had
already replaced `templates/README.md`'s truncated worked
example with a pointer to `playbooks/new-project.md` §4, whose
one-liners fully cover the placeholder; left it in Pending
rather than closing without a `/critique` pass re-confirming
(this skill doesn't author CRITIQUE rows, per iterate.md §5.4).
Shipped the step-8 sub-agent redundant-copy row instead — tied
score, same ordering-bug class as the already-fixed step-6/
step-7 rows, cheaper single-section edit. Not a fresh A-G sweep;
last full sweep still 2026-07-17 (above).

Digest tick 2026-07-19: fresh A-G sweep (header was 50h old,
past the digest's 48h threshold). A/B (doc-drift,
completeness), C (link + tree hygiene beyond the gate), D
(voice), E (adopter friction), and F (model-id freshness) all
manually re-derived rather than leaning on a <24h-old block.
G stays empty (no sibling lessons files present in this
checkout). #12 still the only blocked AUDIT row. Confirmed
`[A/E, 2.7]` (README's "Files added" checklist undersells
`scripts/`) still reproduces unchanged at `README.md:170-171`.
Found two new rows: README's own kit-tree omits
`PHASE_CANDIDATES.md` and `CURRENT-STATE.md` under
`templates/plan/` (both exist on disk and both are correctly
listed in `templates/README.md`'s own tree — `scripts/verify.mjs`'s
tree-reverse-check doesn't cover `templates/plan`, so the gap is
invisible to the gate), and a fictional example URL in
`templates/skills/bootstrap.md:217` now resolving to an
unrelated live site (plain text in a code block, not a
hyperlink, so the gate's links leg correctly skips it — low
severity). Audit only; digest ships nothing — see
`skills/digest.md` rule 2.

Cloud tick 2026-07-19 (third): #12 still the only blocked AUDIT
row. Shipped the next-highest scorer — the digest-sourced
`[A/C, 3.2]` row (README's kit-tree omitting `PHASE_CANDIDATES.md`
and `CURRENT-STATE.md`) — over the `[A/E, 2.7]` and `[C/F, 1.6]`
rows, both lower-scoring. Not a fresh A-G sweep; last full sweep
still today's digest tick (above).

Cloud tick 2026-07-20: #12 still the only blocked AUDIT row.
`/critique` pass 6 (previous tick) landed two fresh HIGH rows in
`plan/CRITIQUE.md`, both outscoring this block's own `[A/E, 2.7]`
and `[C/F, 1.6]` rows on the shared scale. Shipped the
higher-impact of the two — the `<PROJECT_PKG_PREFIX>` double-`@`
corruption (`templates/skills/ship-a-phase.md:206-207`,
`customization/verify-gate.md:56`) — over the sibling HIGH row
(`playbooks/new-project.md:515-516`'s nonexistent `pnpm
bootstrap:status` command), reasoning the double-`@` bug fails
silently (a plausible-looking but wrong package specifier lands
in an adopter's docs) where the sibling row fails loud ("missing
script", immediately visible and easy to recover from) — same
impact/ease numerically, higher true cost from harder detection.
Not a fresh A-G sweep; last full sweep still the 2026-07-19
digest tick (above).

Cloud tick 2026-07-20 (second): #12 still the only blocked
AUDIT row. Shipped the remaining `plan/CRITIQUE.md` HIGH row —
`playbooks/new-project.md:515-516`'s nonexistent `pnpm
bootstrap:status`/`pnpm bootstrap` commands, deferred by the
previous tick in favor of the `<PROJECT_PKG_PREFIX>` double-`@`
fix — over the AUDIT block's own `[A/E, 2.7]` and `[C/F, 1.6]`
rows, both lower-scoring. `plan/CRITIQUE.md`'s pending queue is
now three LOW/MED rows, no HIGH. Not a fresh A-G sweep; last
full sweep still the 2026-07-19 digest tick (above).

Cloud tick 2026-07-20 (third): #12 still the only blocked
AUDIT row. Re-scored `plan/CRITIQUE.md`'s remaining queue (one
LOW, two MED). The LOW row (`<PROJECT_PKG_PREFIX>` worked
example) reproduced as already resolved (prior tick pointed
`templates/README.md` at `playbooks/new-project.md` §4, which
covers the token) — left in Pending per iterate.md §5.4 (this
skill doesn't author CRITIQUE rows; a `/critique` pass
re-confirms and closes it). Of the two MED rows, both scored
about even; shipped the step-9 `setup/` missing-directory row
over the step-7 "uncomment the matching block" row — its
evidence showed a literal reproduced command failure (`cp:
... No such file or directory`, exit 1) versus step 7's softer
stale-guidance drift, and the fix was a single self-contained
paragraph. Both outscored the AUDIT block's own `[A/E, 2.7]`
and `[C/F, 1.6]` rows. Not a fresh A-G sweep; last full sweep
still the 2026-07-19 digest tick (above).

Cloud tick 2026-07-20 (fourth): #12 still the only blocked
AUDIT row. Shipped the remaining `plan/CRITIQUE.md` MED row —
`playbooks/new-project.md:455-456`'s stale "uncomment the
matching block" instruction, which no longer matches
`deploy-check.mjs`'s live `if (PROVIDER === ...)` branches
selected via `DEPLOY_PROVIDER` — scoring higher (impact 6,
ease 8) than the AUDIT block's own `[A/E, 2.7]` and `[C/F, 1.6]`
rows. The remaining CRITIQUE row (`<PROJECT_PKG_PREFIX>` worked
example, LOW) reproduced as already resolved in a prior tick;
left in Pending per iterate.md §5.4. Not a fresh A-G sweep;
last full sweep still the 2026-07-19 digest tick (above).

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

### [A/E, 2.7] README's "Files added" checklist undersells `scripts/`
- category: doc-drift
- impact: 3, ease: 9
- evidence: `README.md:170-171` lists `scripts/deploy-check.mjs`
  as if it's the only file landing under `scripts/`, but step
  4's bulk copy (`['templates/scripts','scripts']`) lands all 8
  scripts.
- next: change `scripts/deploy-check.mjs` to `scripts/` in that
  checklist line, matching how `plan/` and `skills/` are already
  collapsed.

### [C/F, 1.6] Fictional example deploy URL in `templates/skills/bootstrap.md` now resolves to an unrelated site
- category: link hygiene (low severity — not a live hyperlink)
- impact: 2, ease: 8
- evidence: `templates/skills/bootstrap.md:217`'s sample
  terminal-output block shows `First deploy:
  https://ember.vercel.app  ✓ ready` as illustrative fictional
  output; the domain now serves an unrelated live site. Plain
  text inside a fenced code block, not a markdown link, so
  `verify.mjs`'s links leg correctly skips it and an adopter is
  very unlikely to click it — a small credibility ding in a
  worked example, not a functional break.
- next: swap the example hostname for one that will never
  resolve to real content (e.g. `https://your-app.vercel.app`
  or `https://example-app.vercel.app`), matching the placeholder
  style already used elsewhere (`https://your-site.netlify.app`
  in `playbooks/new-project.md:240`).

## Done

### [x] [A/C, 3.2] README's kit-tree omits two real files under `templates/plan/` — this commit
- fix: added `PHASE_CANDIDATES.md` and `CURRENT-STATE.md` (with
  a matching one-line annotation each) to README.md's
  `templates/plan/` tree block, closing the gap against
  `templates/README.md`'s own tree (lines 19, 22) and actual
  disk contents. Left `scripts/verify.mjs`'s
  `REVERSE_CHECK_DIRS` untouched — the suggested mechanical
  catch is a separate, larger change (would need to teach the
  reverse-checker `templates/plan`'s adopt-by-need annotations,
  which its current dirs don't have) and this tick is scoped to
  the one finding.

### [x] [A, 3.2] README.md:381 repeats the stale "six skill files" count — this commit
- fix: reworded both stale occurrences — `README.md:381`-383
  ("the six skill files" → "the skill set") and
  `playbooks/new-project.md:18` ("Six skill files in
  `skills/`" → "The skill set in `skills/` (count varies with
  which adopt-by-need files you keep)"). Closes the matching
  `plan/CRITIQUE.md` LOW row on the same root cause.

### [x] [A, 4.2] README's command table omits `/digest`, `/lessons-pr`, `/moderate` — this commit
- fix: added a `/digest` row to the main command table
  (`README.md`'s "What you get" section) and a `/moderate` row
  to the opt-in table alongside `/ship-asset`. Deliberately
  skipped `/lessons-pr` — it's a nexus-self meta-skill with no
  `templates/skills/` counterpart, never copied to adopter
  repos, so it doesn't belong beside commands adopters actually
  run; the existing forward-reference at `README.md:237` already
  covers it correctly.

### [x] [C, 4.8] `https://thock.netlify.app` 404s — this commit
- fix: replaced all five occurrences of
  `https://thock.netlify.app` with `https://thock.xyz` in
  `README.md:53`, `templates/README.md:87`, and
  `playbooks/new-project.md:98,245,261` — confirmed live via
  curl (netlify domain 404s, `.xyz` returns 200) before editing.

### [x] [A/B, 7.2] existing-project.md's overlay never copies plan/steps/01_build_plan.md, but §6 tells the reader to open it — this commit
- fix: added
  `['templates/plan/steps/01_build_plan.md', 'plan/steps/01_build_plan.md']`
  to the overlay's `cpSync` array in
  `playbooks/existing-project.md`'s §3 command (the
  `mkdirSync('plan/steps')` call next to it only ever made an
  empty directory), and reworded §6's "Open
  `plan/steps/01_build_plan.md` (the template)" to say the
  overlay step already copied it in — same bug class as the
  already-fixed `plan/phases/`/`CLAUDE.md` gaps in
  `new-project.md`, just never mirrored to this brownfield
  playbook.

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
