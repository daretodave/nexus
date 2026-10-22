# Critique — external-observer findings

> Last pass: 2026-10-22
> Pass count: 28

`/critique` for this repo is a **dry-run adoption**: a
fresh-eyes agent follows the README's TL;DR into a scratch
directory as a would-be adopter and files every friction point
— broken instruction, missing file, ambiguous step, stale
path, comprehension stumble. See `skills/critique.md`.

## Pending

### [ ] [MED] prompts/adopt.md:89 — owner/contributor heuristic errors with no fallback on a repo with no git remote yet
- category: instruction-drift
- observation: adopt.md's ask-list item (e) computes its
  recommended default for the owner/contributor question via
  `gh repo view --json viewerPermission` (ADMIN → recommend
  owner). But `playbooks/new-project.md`'s Prerequisites only
  requires a repo initialized with `git init` and a GitHub repo
  existing somewhere — nothing in new-project.md or adopt.md
  ever instructs creating the GitHub repo or wiring a remote
  first. A literal walk from a freshly `git init`'d repo with no
  remote hits this gap immediately: the heuristic command errors
  before producing a recommendation, which also breaks
  `concepts/asking-well.md` rule 2 ("if you genuinely don't have
  a recommendation, you don't have a question yet"). Door 2's
  prompt explicitly tells the agent "Do not skip steps or invent
  scope beyond what it says," so a strict-literal agent has no
  instructed path to resolve this.
- evidence: in a scratch repo (`git init` only, no remote),
  running the exact command adopt.md names —
  `gh repo view --json viewerPermission` — fails with
  "no git remotes found", exit 1.
- suggested fix: either add a "create/confirm the GitHub remote"
  sub-step to new-project.md's Prerequisites (or step 1) with the
  `gh repo create` / `git remote add origin` commands, or have
  adopt.md's ask-list fall back explicitly ("no remote yet →
  recommend owner by default, since a solo greenfield repo has no
  other contributor to be a contributor against") so the
  heuristic degrades gracefully instead of erroring with no
  guidance.
- source: dry-run

### [ ] [MED] playbooks/new-project.md:51 — Prerequisites claims GitLab support that nothing else in the kit delivers
- category: instruction-drift
- observation: the line reads "A GitHub repo (or GitLab/
  equivalent) — push to `main` triggers deploy." A repo-wide
  case-insensitive search for "gitlab" turns up exactly this one
  line and nothing else — no GitLab CI deploy-gate wiring in
  `playbooks/ci-providers.md`'s provider matrix, no GitLab
  equivalent for `owner-mode.md`'s rulesets/`gh api` calls, no
  GitLab issue support in `/triage`'s `gh`-CLI-based tooling, and
  the cloud loop (`playbooks/cloud-loop.md`) is GitHub Actions
  only. An adopter who takes this parenthetical at face value and
  picks GitLab hits undocumented territory almost immediately
  after adoption, with no playbook acknowledging the gap.
- evidence: `grep -rni "gitlab" .` (excluding `.git/`) across the
  whole repo returns exactly one hit: `playbooks/new-project.md:51`.
- suggested fix: either drop the "(or GitLab/equivalent)"
  parenthetical (state the real requirement as "a git host that
  can push-to-deploy main" without naming a specific unsupported
  competitor), or add a one-line caveat pointing at
  `ci-providers.md`'s "Self-hosted" section as the actual
  GitLab/other-host path, since today nothing names what
  "equivalent" would mean in practice.
- source: dry-run

## Done

### [x] [MED] playbooks/new-project.md:376-382 — agents.md prune cross-references have no mechanical check, unlike the copy+sweep step — this commit
- category: comprehension
- observation: step 4's "Prune adopt-by-need files" explicitly
  requires manually stripping the matching row from the
  just-copied root `agents.md` (Skills table + Invocation block
  + `brander` row) for each adopt-by-need skill removed —
  "Leaving them means the kit's own cold-start entry point still
  advertises a command that isn't on disk." Unlike the
  copy+placeholder-sweep step (verified by
  `node scripts/adopt-dryrun.mjs`), nothing mechanizes this
  check. Following the playbook's own example `rm` block
  literally (pruning `ship-data`/`ship-migration`/`ship-asset`/
  `moderate`/`digest`/`bootstrap` in a scratch repo) leaves
  `agents.md` referencing all six removed skills/commands —
  exactly the "misleading" state the doc warns against, and
  nothing in the adoption flow catches it.
- evidence: after running the playbook's own prune `rm` command
  in a scratch repo, `grep -n
  "ship-data\|ship-migration\|ship-asset\|moderate\|digest\|bootstrap\|brander"
  agents.md` still returned 10 live rows pointing at files that
  no longer exist on disk.
- suggested fix: extend `scripts/adopt-dryrun.mjs` (or add a
  small lint) to flag `agents.md` rows naming a `skills/*.md` /
  `.claude/commands/*.md` file that doesn't exist in the scratch
  tree after pruning.
- fix: extended `scripts/adopt-dryrun.mjs` to run the Prune
  step's own worked `rm` example after the copy+sweep, then
  check the scratch `agents.md` for any Skills-table row,
  Invocation-block line, or `brander` Sub-agents row still
  pointing at a file the prune removed. That surfaced the
  example itself as incomplete (it only removed files, never
  the `agents.md` rows the surrounding prose also requires), so
  extended the example's `bash`/`powershell` blocks in
  `playbooks/new-project.md` to strip those rows too — the
  mechanized check and the doc's own worked example now agree.
- source: dry-run

### [x] [HIGH] prompts/adopt.md:89 / templates/agents.md:24-26 — kit's "no Co-Authored-By" rule is unconditional and actively blocks commits under a common Claude Code attribution convention — this commit
- category: instruction-drift
- observation: `agents.md` standing rule 2 and the paste-prompt
  in `prompts/adopt.md` ("No Co-Authored-By trailers, no
  emojis. ... Nothing else, ever") are absolute, with zero
  carve-out for environments where the agent's own harness
  injects an attribution convention. This isn't hypothetical:
  cloud/team Claude Code setups commonly carry a system
  instruction to append a `Co-Authored-By:` trailer to every
  commit. A dry-run reproduction of the resulting deadlock: a
  `git commit` with that trailer, in a scratch repo with
  `.claude/hooks/guard.mjs` active (copied per the template),
  was hard-blocked by the guard hook.
- evidence: exact command and output —
  ```
  git commit -m "feat: probe attribution conflict

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
  ```
  →
  ```
  PreToolUse:Bash hook error: [node .claude/hooks/guard.mjs pre-bash]: guard: commit bodies are plain (agents.md standing rule 2) — no Co-Authored-By trailers, no emojis. The only sanctioned trailer is Cloud-Run: (cloud ticks only). Rewrite the message.
  ```
  (rule source: `agents.md:18`, `templates/agents.md:24-26`,
  `prompts/adopt.md:87-89`)
- suggested fix: add one line to `agents.md` rule 2 /
  `prompts/adopt.md`'s standing-rules block telling the
  adopting agent to strip any harness-injected attribution
  trailer before every commit, since some Claude Code
  environments add one by default.
- fix: applied the suggested fix in all three cited locations —
  `agents.md` rule 2, `templates/agents.md`'s matching rule, and
  `prompts/adopt.md`'s standing-rules block each now carry a
  sentence telling the agent to strip any harness-injected
  attribution trailer before every commit, since this rule
  overrides that convention in this repo.
- source: dry-run

### [x] [MED] README.md:276-282 vs playbooks/pre-spec.md:29-35 — "Three paths to start" diagram routes existing-code repos into pre-spec.md, which then tells them not to use it — this commit
- category: ordering
- observation: the mermaid flowchart's only gate before routing
  to pre-spec.md is "Have a spec.md?" — a "no, but I have a
  pitch" answer goes straight to `presp` regardless of whether
  the repo already has code. The "Existing repo with code?"
  check (`brown_check`) only appears *after* `presp --> green`,
  i.e. downstream of pre-spec.md, not before it. But
  `playbooks/pre-spec.md` itself (lines 29-35, "When not to use
  it") explicitly disqualifies this exact case: "The repo has
  existing code and history. Use existing-project.md instead;
  the pre-spec interview is for blank-slate work." A stranger
  with an existing-code repo and a pitch-but-no-spec follows the
  diagram into pre-spec.md, reads its own opening disqualifier,
  and has to backtrack to figure out they actually wanted
  existing-project.md (which itself handles writing a
  retrospective spec in its own §2) — the diagram sent them to a
  file that immediately tells them it isn't for them.
- evidence: `README.md:276-282` (`spec -- "no, but I have a
  pitch" --> presp[...]`; `brown_check` node only reachable via
  `green`, after `presp`) vs `playbooks/pre-spec.md:29-35` ("The
  repo has existing code and history. Use existing-project.md
  instead... the pre-spec interview is for blank-slate work.")
- suggested fix: either (a) add an existing-code check before
  the pitch/no-spec branch in the diagram (route "no spec,
  existing code" straight to `existing-project.md`, bypassing
  pre-spec.md, and only send fresh/no-code repos with a pitch to
  `presp`), or (b) soften pre-spec.md's disqualifier to
  acknowledge the diagram's ordering explicitly (e.g. "if you
  arrived here via the diagram and already have code, the
  retrospective-spec step in existing-project.md §2 covers this
  better — bail out now").
- fix: applied suggested-fix (a) — the diagram now gates on
  "Existing repo with code?" (`pitch_check`) immediately after
  the "no, but I have a pitch" branch, before `presp`. "No
  spec, existing code" now routes straight to
  `playbooks/existing-project.md`, bypassing pre-spec.md
  entirely; only "no spec, no code" still reaches it. The
  original downstream `brown_check` stays in place for the
  "have a spec.md" branch and now points at the same `brown`
  node. `pre-spec.md`'s disqualifier text is unchanged — it's
  no longer reachable from this case, so it stays accurate as a
  safety net for anyone who lands there by other means.
- source: dry-run

### [x] [LOW] playbooks/new-project.md:471,746 — canonical-sibling phase number hedged as "phase 4 or 5" against the file's own fixed "4 substrate phases" rule — this commit
- category: instruction-drift
- observation: step 3 fixes "4 substrate phases at the front"
  (bootstrap, data, content, URL contract) — making the first
  page-family phase structurally phase 5 — and step 5's own intro
  ("Phase 5 (the canonical sibling) gets a detailed brief"), step
  11's "Common Pitfalls" (line 706), and the shipped
  `templates/plan/steps/01_build_plan.md` (`### Phase 5 —
  <CANONICAL SIBLING>`, line 75) all agree on phase 5
  unconditionally. But line 471 ("rename it to match your phase
  number (usually phase 4 or 5)") and the Day-1 checklist line
  746 ("Canonical sibling brief (usually phase 4 or 5) is
  detailed") introduced an unexplained "4 or" alternative that
  contradicted the fixed substrate-phase count and the template's
  own hardcoded "Phase 5" heading.
- evidence: `templates/plan/steps/01_build_plan.md:75`
  ("### Phase 5 — <CANONICAL SIBLING>") vs
  `playbooks/new-project.md:471` ("...rename it to match your
  phase number (usually phase 4 or 5)...").
- fix: dropped the "4 or" hedge in both spots — both now read
  "usually phase 5," matching the template and the rest of the
  playbook.
- source: dry-run

### [x] [MED] playbooks/new-project.md:594 — step 9's "Manual" external-services path never shows the `setup/00_files.md` copy command — this commit
- category: ordering
- observation: step 9 offers two paths — "Manual. Walk each
  `setup/NN_<service>.md` runbook yourself" and "Automated. Run
  `/bootstrap`." Only the Automated branch got an inline copy
  command (`mkdir -p setup && cp
  ../nexus/templates/setup/bootstrap.example.json
  setup/bootstrap.local.json`, lines 605-611). A stranger who
  picks Manual had no instruction anywhere in this playbook for
  how `setup/00_files.md` (the runbook index) or
  `setup/NN_<service>.md` actually get copied in — step 4's bulk
  copy never lands `templates/setup/`. The only place that copy
  command exists is `customization/external-services.md:189-195`,
  which step 9 never linked to; the adopter only reached it later
  via the Day-1 checklist (line 737), after already being told
  to "walk the runbook."
- evidence: `grep -n "00_files\|NN_service\|setup/"
  playbooks/new-project.md` returned zero `cp .../00_files.md` or
  `cp .../NN_service.md` lines — the only matching `cp` was for
  `bootstrap.example.json` (610-611). The real copy command lived
  only at `customization/external-services.md:189-195`.
- fix: added a pointer in step 9's "Manual" bullet to
  `customization/external-services.md`'s "Per-service runbook
  authoring" step 1, which has the `setup/00_files.md` copy
  command this path needs first.
- source: dry-run

### [x] [MED] README.md:290-291 vs README.md:650,653 — Hard Rule #6's "AskUserQuestion is allowed only in /oversight and /bootstrap" doesn't acknowledge pre-spec.md's own carve-out, stated 359 lines earlier — this commit
- category: comprehension
- observation: reading top to bottom, a stranger hits the "Three
  paths to start" section first, where `pre-spec.md` is described
  as "The only nexus playbook where `AskUserQuestion` is allowed"
  (README.md:290-291). Much later, "Hard rules carried across
  every project" states Rule 6 as "`AskUserQuestion` is allowed
  only in `/oversight` and `/bootstrap`... Every other skill
  decides and ships" (README.md:650,653), with no mention of
  pre-spec. The kit's own `concepts/architecture.md` §6 and
  `templates/skills/oversight.md` scope their version of this
  rule to "skill" (deliberately excluding the pre-adoption
  `pre-spec.md` playbook), but README's Hard Rules list never
  surfaces or explains that skill-vs-playbook distinction, so a
  literal first read experiences it as two conflicting absolute
  claims about where `AskUserQuestion` lives.
- evidence: `README.md:290-291` ("The only nexus playbook where
  `AskUserQuestion` is allowed") vs `README.md:650,653` ("allowed
  only in `/oversight` and `/bootstrap`... Every other skill
  decides and ships") — no cross-reference between the two in
  README itself.
- fix: reworded Rule 6's opening clause to "Once a skill is
  running, `AskUserQuestion` is allowed only in `/oversight` and
  `/bootstrap`" and appended a sentence naming `pre-spec.md`'s
  one-time interactive interview (before any skill exists) as the
  one carve-out outside that list, linked back to "Three paths to
  start" — the row's first suggested-fix option, no scope changes.
- source: dry-run

### [x] [MED] playbooks/new-project.md:40 vs playbooks/new-project.md:250-251 — Prerequisites states "Node 20+" but step 4 calls back to it as "Node ≥18" — this commit
- category: instruction-drift
- observation: the Prerequisites section says "Node 20+ installed,
  plus **pnpm**." Later, step 4's copy command was introduced as
  "one `node` command (Node ≥18, already a prerequisite)" —
  explicitly referring back to the earlier prerequisite, but
  citing a different minimum version (18 vs 20). A first-time
  adopter reading top to bottom hit a self-referential
  contradiction in the same file: which number is the real floor?
- evidence: `playbooks/new-project.md:40` ("Node 20+ installed")
  and `playbooks/new-project.md:250-251` ("This is one `node`
  command (Node ≥18, already a prerequisite)").
- fix: reworded step 4's parenthetical in `playbooks/new-project.md`
  to "Node 20+, already a prerequisite", matching the Prerequisites
  floor. Widened scope to the same bug class found while fixing
  it: `playbooks/existing-project.md:134`'s overlay step carried
  the identical stale "Node ≥18" phrasing with no local
  contradiction but the same drift from the kit's actual 20+
  floor — fixed to "Node 20+" too.
- source: dry-run

### [x] [MED] playbooks/new-project.md §4 "Prune adopt-by-need files" never updates the just-copied root agents.md — this commit (closes #73)
- category: instruction-drift
- observation: §4's prune step removes skill/command/script
  files for capabilities the project doesn't adopt (e.g.
  `ship-migration.md`, `ship-asset.md`, `moderate.md`,
  `digest.md`, `bootstrap.md`, `.claude/agents/brander.md`),
  but `templates/agents.md`'s Skills table (lines 132-144),
  Invocation block (151-163), and Sub-agents table (173) list
  all of them with inline "(if X)" gating text, not a removal
  instruction. After following the documented prune example
  (a `Surface: service`, no-UGC, no-cloud-loop project), the
  adopted repo's root `agents.md` — the designated cold-start
  entry point for any agent — still advertises
  `/ship-migration`, `/ship-asset`, `/moderate`, `/digest`,
  `/bootstrap`, and `brander`, none of which exist on disk.
- evidence: `templates/agents.md:132-144,151-163,173` list all
  six; the §4 prune example's `rm -f` list never touches
  `agents.md`.
- fix: extended §4's prune bullet list in
  `playbooks/new-project.md` with an instruction to also delete
  the matching rows from the just-copied root `agents.md` —
  Skills table, Invocation block, and (for `ship-asset`) the
  `brander` Sub-agents row — for each of the six capabilities
  pruned. `existing-project.md`'s pointer to §4 inherits the fix
  since it references the section, not a copy of its text.
- source: dry-run

### [x] [HIGH] playbooks/new-project.md §2/§4 — adopting /ship-data never prompts the "Commit verb vocabulary" bearings.md row, so the first ship-data commit trips guard.mjs — this commit (closes #71)
- category: instruction-drift
- fix: took the suggested fix's cheaper alternative — shipped
  `data`/`migration`/`asset`/`mod`/`bootstrap` (all five
  adopt-by-need ship-skill verbs, not just `data`) in
  `templates/claude/hooks/guard.mjs`'s default `VERBS` array
  plus matching `self-test` cases, instead of adding
  prune-step instructions to `playbooks/new-project.md`. Pruning
  a skill file removes the only way to trigger its verb, so
  listing all five unconditionally is harmless and avoids
  relying on an adopter to remember a manual bearings.md +
  guard.mjs edit. Also updated `templates/plan/bearings.md`'s
  "Commit verb vocabulary" table with explicit rows for the five
  verbs (was one generic `<YOUR SHIP-SKILL VERB>` placeholder
  row), reserving that placeholder for genuinely new custom
  ship skills.
- source: dry-run

### [x] [MED] playbooks/new-project.md:255-267 — data-layer copy has no runnable command, only prose — this commit (closes #68)
- category: instruction-drift
- fix: added an explicit `cp -r ../nexus/templates/data ./data`
  + PowerShell `Copy-Item -Recurse` twin right in the
  parenthetical, matching the pattern used everywhere else in
  the playbook — cheaper than adding a conditional entry to the
  step-4 array, and keeps the data-layer copy properly optional.
- source: dry-run

### [x] [LOW] prompts/adopt.md:39-40 — reading-list item undercounts what its own glob covers — this commit (closes #66)
- category: comprehension
- fix: item 7 of the "read in order" list said
  "../nexus/customization/*.md — verify gate + hermetic e2e +
  data layer + sub-agents", reading as an exhaustive list even
  though the glob `customization/*.md` matches all 13 files in
  that directory. Reworded to "e.g. verify gate, hermetic e2e,
  data layer, sub-agents; skim the rest as needed" — the row's
  first suggested-fix option, cheaper than narrowing the glob
  and losing the playbook's per-topic inline links.
- source: dry-run

### [x] [MED] concepts/architecture.md:100-104,176-201 — Layer 2's numbered dispatch list and Layer 4's prose drop `/expand`, which the file's own diagram includes — this commit (closes #65)
- category: instruction-drift
- observation: the top-of-file ASCII diagram (lines 16, 27,
  31) lists `/expand` as a Layer 4 member and shows the
  dispatch chain as `triage → critique → phase → data →
  expand → iterate`. But the detailed Layer 2 prose a few
  dozen lines later — the numbered dispatch list at
  lines 100-104 and its "Why this order" rationale
  (107-119) — enumerates only triage, critique, phase, data,
  iterate; expand is never mentioned. The same omission
  repeats in Layer 4's detailed section: its header (line 176)
  reads "critique + triage" (not the three-item diagram box)
  and the body (177-201) describes only those two skills.
  `templates/skills/march.md:10-19` confirms the diagram is
  the accurate one — the prose in both places is stale.
- fix: added expand as step 5 in the Layer 2 numbered dispatch
  list plus a "why this order" bullet, renumbered iterate to
  6, extended the Layer 4 header to "critique + triage +
  expand", added a bullet describing expand's role, and
  widened the "rate-limited" / "write only to state files"
  paragraphs from "Both" to "All three" with expand's own
  rate-limit figures.
- source: dry-run

### [x] [MED] prompts/pitch.md:52-56 vs prompts/adopt.md:62-69 — Phase B tells the agent not to ask, then points at a prompt that explicitly asks — this commit
- category: instruction-drift
- observation: pitch.md's Phase B said, in the same breath:
  "switch to the standard adoption prompt: read and follow
  `../nexus/prompts/adopt.md` exactly... AskUserQuestion is no
  longer allowed (per nexus's standing rules — only /oversight
  may ask). Decide and document; don't ask." But adopt.md — the
  very file it says to follow exactly — contains its own
  explicit instruction: "Ask the user ONLY for: (a) the hosting
  provider name and auth token..., (b) the project's canonical
  name + tagline..., (c) the URL/API/CLI contract..., (d)
  confirmation of the topology guess..." A literal-following
  agent hit a direct contradiction between two adjacent
  sentences in pitch.md and the doc it references.
- fix: pitch.md's Phase B now names adopt.md's four-item ask
  list explicitly as its own carve-out (the same class as
  /oversight's), and scopes the "don't ask" instruction to
  everything beyond those four items.
- source: dry-run

### [x] [MED] prompts/adopt.md:20-38 — step 4a's "topology check below" is a forward reference the numbered reading list can't resolve in order — this commit
- category: ordering
- fix: the prompt told the agent to read items 1-7 "in order,
  before making a single change," but item 4a's condition
  ("only if the topology check below lands on either") pointed
  at the topology-check bullet in the `Then:` block, which
  appears textually after the entire numbered list in the same
  file. A literal in-order reader hit 4a with no way yet to
  resolve what "the topology check below" meant. Reworded 4a to
  say "under 'Then:' below (in this same prompt)" instead of the
  bare "below," per the row's own second suggested fix (cheaper
  than reordering the numbered list).
- source: dry-run

### [x] [LOW] README.md:272,526 — "Three paths to start" and "How to use this kit" are two separate onboarding checklists ~250 lines apart with no cross-link — this commit
- category: ordering
- fix: `## Three paths to start` (line 272) and `## How to use
  this kit` (line 526) each read as a standalone "how do I
  start" sequence with no link between them, ~120 lines of
  file-tree reference apart. Rather than merging or relocating
  either section (a larger structural edit, and one of two
  options the row itself only tentatively suggested), added a
  one-line cross-reference at the end of "Three paths to
  start" pointing forward to "How to use this kit", and turned
  the existing "manual-path equivalent of the TL;DR sections
  above" blockquote in "How to use this kit" into an explicit
  link back to "Three paths to start".
- source: dry-run

### [x] [MED] playbooks/new-project.md:464,494-533 — package.json is never actually created, only "wired into" — this commit (closes #58)
- category: instruction-drift
- fix: step 7 showed the target `package.json` `scripts`
  contents under "Wire it into `package.json` alongside the
  verify gate from step 6" but never actually created the file
  — no `pnpm init`/`npm init` and no `cat > package.json
  <<EOF` anywhere, even though step 6 explicitly says "step 7
  creates one." A stranger following the playbook literally hit
  pnpm's own "no package.json found" error at "Test both: `pnpm
  verify`" instead of the individual-script failures the text
  implies. Added an explicit `pnpm init -y` creation command
  before the "wire it in" language.
- source: dry-run

### [x] [MED] templates/env/env.example:26 — `.env.example`'s provider matrix and blocks cover 5 of the 8 `DEPLOY_PROVIDER` values the script and docs support — this commit
- category: instruction-drift
- fix: `env.example:26`'s "Supported:" comment listed only 5 of
  the 8 `DEPLOY_PROVIDER` values `deploy-check.mjs` implements.
  Widened it to all 8 (wrapped to two lines) and added three
  commented `.env` blocks — Cloudflare Pages, Render, Fly.io —
  mirroring the existing block style (dash-header width, var
  name + inline get-token URL comment), using the exact var
  names and URLs `playbooks/ci-providers.md` already documents
  for those three providers.
- source: dry-run

### [x] [LOW] README.md:193,283,292 — `bearings.md` is used repeatedly before it is ever plain-language defined — this commit
- category: comprehension
- fix: the literal string "bearings.md" first appears as
  visible reader-facing text at README.md:288 ("a `bearings.md`
  stub") — the earlier hit at old line 193 is inside a URL
  fragment (`./templates/plan/bearings.md#...`) behind link text
  that reads "Posture-gated," not "bearings.md," so it was never
  actually a first *reading* of the term. Added a parenthetical
  there: "a `bearings.md` stub (the file that locks your stack,
  conventions, and standing decisions)," anchoring the term
  before its two subsequent uses in the same file.
- source: dry-run

### [x] [MED] README.md:86,101,160 — the adopt-prompt's clone URL is a never-resolved placeholder with no canonical URL given anywhere in the file — this commit
- category: placeholder
- fix: added a one-line callout right above each of the three
  `<your-fork-or-mirror>` occurrences (README.md's step 1 clone
  block, the adopt-prompt paste block, and the pitch-prompt
  paste block) telling the reader to swap the token for the URL
  they forked/cloned — the suggested fix as filed, no scope
  changes.
- source: dry-run

### [x] [MED] playbooks/new-project.md:100,181 — step 2 and step 3's prose "Copy X to Y" instructions fail on a fresh repo (target dir doesn't exist yet) — this commit
- category: instruction-drift
- fix: replaced both prose "Copy X to Y" lines with fenced
  `mkdir -p` + `cp` bash blocks (plus PowerShell twins), matching
  the pattern already used for the analogous
  `setup/bootstrap.local.json` gap in step 9.

### [x] [HIGH] playbooks/existing-project.md:79 — brownfield playbook's first copy instruction fails as written (bad path + missing dir) — this commit
- category: instruction-drift
- fix: fixed the path to `../nexus/templates/plan/CURRENT-STATE.md`
  and prefixed the copy with `mkdir -p plan &&`, matching this
  file's existing inline-code style rather than introducing a
  fenced ```bash``` block (which would have tripped
  `scripts/verify.mjs`'s `dualshell` leg on the POSIX-only
  `mkdir`/`cp`). Went beyond the suggested fix's two options after
  finding a deeper bug while reproducing: step 3's bulk `fs.cpSync`
  overlay (line 128) already lists
  `['templates/plan/CURRENT-STATE.md','plan/CURRENT-STATE.md']`,
  and `fs.cpSync` overwrites existing files by default — so if
  step 1's copy had simply been moved after step 3 as the second
  suggested option proposed, step 3 would silently clobber the
  user's step-1-filled-in `plan/CURRENT-STATE.md` with the blank
  template. Removed that duplicate entry from step 3's list
  instead, leaving `plan/CURRENT-STATE.md` exclusively step 1's
  responsibility, consistent with `templates/plan/README.md:17`'s
  own annotation citing `existing-project.md` §1 (not §3) as the
  file's source. `node scripts/verify.mjs` green (dualshell leg
  unaffected — no new fenced POSIX block introduced).
- source: dry-run

### [x] [LOW] README.md:43-53 — the first concrete example (`/march` tick transcript) uses shorthand terms (`Triage`, `Critique`, `Expand`, `Dispatch`) roughly 130 lines before the "What you get" table defines the commands behind them — this commit
- fix: added a one-line pointer right after the transcript
  ("(Triage/Critique/Expand/Dispatch are the slash commands in
  [What you get](#what-you-get), below.)"), matching the
  suggested fix as filed.
- source: dry-run

### [x] [LOW] README.md:121 — "Review what landed" promises "A working `pnpm verify`" right after the adoption commit, before phase 1 (which scaffolds `package.json`) has shipped — this commit
- fix: softened README.md:121-122 to "`pnpm verify` (or
  stack-equivalent) and `pnpm deploy:check` specified and ready
  to wire once phase 1 lands — not necessarily passing yet",
  matching playbooks/new-project.md:693's own weaker claim
  ("may fail; runs") instead of promising a "working" gate
  before phase 1 has scaffolded `package.json`.

### [x] [MED] playbooks/new-project.md:693 — Day-1 checklist gates on `pnpm verify` running, but the playbook's own step 6 says `package.json` doesn't exist yet at this point — this commit
- fix: step 7 now wires the step-6 verify-gate scripts
  (`typecheck`/`test:run`/`build`/`e2e`/`verify`) into
  `package.json` alongside `deploy:check`, in the same edit —
  package.json is created there regardless, so both gates land
  together instead of only `deploy:check`. Step 6 now points
  forward to step 7 as the place the shape gets wired, instead
  of claiming phase 1 scaffolds it. By Day-1-checklist time,
  `pnpm verify` runs (and fails, as the checklist already
  hedges) instead of not existing at all.
- source: dry-run

### [x] [LOW] README.md:528-530 — "How to use this kit" step 5 names only 2 of the 8 documented placeholders — this commit
- fix: changed step 5 from naming `<PROJECT>` and
  `<PROJECT_LOWER>` by name (2 of 8 tokens) to "Replace all 8
  placeholders (see `templates/README.md`)", linked to the
  Placeholders table anchor, so the step no longer reads as a
  complete list to a reader who doesn't open the playbook.
- source: dry-run

### [x] [LOW] README.md:48 — "canonical sibling" used in the very first sample output with no definition anywhere in the file — this commit
- fix: changed the sample transcript's "Read brief, canonical
  sibling" to "Read brief, phase 8", matching the same sample's
  own "Dispatch: ... phase 8" and "Phase 8 shipped" lines
  instead of introducing an undefined term nowhere else
  explained in README.md.
- source: dry-run

### [x] [LOW] README.md:189 — "Posture-gated" used once with no definition or link — this commit
- fix: linked "Posture-gated" in the `/expand` command-table row
  to `templates/plan/bearings.md#plan-expansion-posture`,
  matching the pattern the same table already uses for
  `/ship-data` → `customization/data-layer.md`.

### [x] [LOW] README.md:242 — "2–4 hours of setup" doesn't match the reconciled "2–3 hours" figure used everywhere else — this commit
- fix: changed README.md:242's "2–4 hours of setup" to "2–3
  hours of setup", matching `playbooks/new-project.md:4`'s
  "Estimated time: **2–3 hours**" — the reconciled figure the
  row's original comparison line (README's old :161) no longer
  states verbatim (reworded away by an intervening fix to
  "well under an hour" for the delegated-agent case), but the
  underlying drift this row flags — a second, larger number for
  the same manual-setup concept — still held.

### [x] [LOW] README.md — "What's in this kit" tree omits `templates/workspace/` — this commit
- fix: added a collapsed `workspace/` tree entry to README.md's
  "What's in this kit" templates block, matching
  `templates/README.md:84`'s phrasing. Shipped via
  `plan/AUDIT.md`'s `[A, 3.2]` row, same finding.
- source: dry-run

### [x] [MED] playbooks/workspace.md — `templates/workspace/` ships `<WORKSPACE_ORG>` with no replace instruction anywhere — this commit
- category: placeholder
- observation: `templates/workspace/CLAUDE.md`, `AGENTS.md`, and
  `REPOS.md` contain literal `<WORKSPACE_ORG>` (and reuse
  `<PROJECT>`) tokens. `playbooks/workspace.md`'s only
  instruction for this family ("Copy the *content* into the
  root... not the files' git history") gives no
  search-and-replace step. `templates/README.md`'s Placeholders
  table lists only the original 8 tokens; `<WORKSPACE_ORG>`
  appears nowhere in it. Contrast with
  `playbooks/new-project.md` step 9, which explicitly flags and
  fixes the same class of gap for `bootstrap.local.json`.
- evidence: `grep -rn WORKSPACE_ORG` → hits only in
  `templates/workspace/{CLAUDE.md,AGENTS.md,REPOS.md}`,
  `plan/phases/phase_33_workspace_templates.md`, and
  `scripts/verify.mjs`'s placeholder vocabulary (which guards
  nexus's own repo, not an adopter's copy); zero hits in
  `playbooks/workspace.md` for any replace/sed instruction.
- suggested fix: add `<WORKSPACE_ORG>` to `templates/README.md`'s
  Placeholders table (or a workspace-specific mini-table), and
  add a sed/PowerShell one-liner to `playbooks/workspace.md`'s
  "Org-per-project GitHub layout" section, mirroring step 9's
  `bootstrap.local.json` pattern.
- source: dry-run

### [x] [MED] playbooks/new-project.md — "Prune adopt-by-need files" list omits `scripts/install-hooks.mjs` — this commit (closes #51)
- fix: added a `scripts/install-hooks.mjs` prune bullet to
  playbooks/new-project.md's "Prune adopt-by-need files" list
  and to both worked `rm -f` / `Remove-Item` examples (relabeling
  "nine" to "ten" and widening the example scenario's closing
  clause to cover the new file), matching the phrasing already
  used for the other opt-in files in that list.
- source: dry-run

### [x] [HIGH] README.md:614 — "AskUserQuestion is allowed only in /oversight" is a Hard Rule the kit's own bootstrap skill directly contradicts — this commit
- fix: applied option (a) from the row's own suggested fix
  (bootstrap's carve-out is real and load-bearing — it collects
  tokens and confirms destructive-feeling provisioning actions
  — so option (b), stripping it, would break bootstrap, not
  the docs). Reworded rule 6 to "allowed only in `/oversight`
  and `/bootstrap`" everywhere the absolute claim appeared:
  `README.md:628` (hard rule + the command-table `/oversight`
  and `/bootstrap` rows), `concepts/architecture.md:206,338`,
  `concepts/asking-well.md`'s header + "where this is used
  today" list, `templates/agents.md:138`,
  `templates/README.md:159`, `templates/skills/oversight.md:258,289`,
  `templates/claude/commands/oversight.md:9`,
  `templates/skills/ship-asset.md:272`,
  `templates/claude/commands/jot.md:26`,
  `templates/skills/jot.md:12`, and all three instances in
  `customization/branding.md` (18, 258-259, 286-288) — the last
  of which had argued "once a rule has two exceptions, it has
  three" while already unaware bootstrap was exception one;
  reworded to "no third" instead of "no second." `node
  scripts/verify.mjs` green.
- source: dry-run

### [x] [MED] README.md:159 vs playbooks/new-project.md:8-9 — agent-paced time estimate range still doesn't match the playbook's reconciled figure — this commit
- fix: dropped the numeric "30–90 minutes" range from
  README.md:159 entirely and replaced it with "well under an
  hour" — the exact phrase playbooks/new-project.md:8-9 already
  uses for the delegated-agent case — so the two docs quote the
  same words instead of two independently-maintained numbers
  that can drift apart again.

### [x] [LOW] concepts/skills-anatomy.md:121 — "canonical 12 steps" undercounts its own enumerated list — this commit (closes #29)
- category: instruction-drift
- observation: the prose says "the canonical 12 steps" but the
  list immediately below it enumerates Step 0 through Step 13
  (14 entries), matching `templates/skills/ship-a-phase.md`'s
  actual 14 numbered steps (0-13, plus 2.5 and 12.5).
- fix: changed "the canonical 12 steps" to "the canonical 14
  steps" at `concepts/skills-anatomy.md:121`.
- source: dry-run

### [x] [LOW] README.md:281 — "GitHub-as-DB" is used with no explanation or link, unlike sibling rows in the same table — this commit
- fix: appended a link to `customization/data-layer.md` inside
  the `/ship-data` row's parenthetical in `README.md:281`,
  matching the `/ship-asset` / `/moderate` / `/bootstrap` rows'
  existing pattern of linking their `customization/*.md` doc at
  first use.

### [x] [MED] templates/README.md:134 + playbooks/new-project.md:323-325 — `scripts/bootstrap.mjs` (1009 lines) is never offered for removal when `/bootstrap` isn't adopted — this commit
- fix: added `scripts/bootstrap.mjs` to the `/bootstrap` row in
  `templates/README.md`'s adopt-by-need table, to the matching
  prune bullet in `playbooks/new-project.md`, and to both worked
  `rm -f`/`Remove-Item` examples — the 1009-line executor no
  longer survives a by-the-book prune when `/bootstrap` isn't
  adopted.

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
