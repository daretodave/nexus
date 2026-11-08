# Critique — external-observer findings

> Last pass: 2026-11-08
> Pass count: 31

## Pending

### [ ] [MED] playbooks/new-project.md:864-867 — the Day-1 checklist's design-artifact box doesn't map back to a concrete already-completed step
- category: ordering
- observation: the "You're ready when" checklist at
  playbooks/new-project.md:864-867 requires "At least one design
  artifact (visual system, design tokens, or a
  `claude-design.prompt.md` for commissioning one) is either
  committed or has a written brief." None of the playbook's 11
  numbered steps walks through producing that artifact — the only
  earlier touchpoint is step 2's "Visual / tonal defaults"
  subsection (line 152), which just asks for dark-mode/type/
  palette intent jotted into `bearings.md`. It is never stated
  whether that jot satisfies the checklist box, so a stranger
  ticking through the final checklist hits what reads as a new,
  unaddressed requirement.
- evidence: playbooks/new-project.md:152-156,864-867
- suggested fix: add a one-line cross-reference in step 2 ("this
  also satisfies the Day-1 checklist's design-artifact box — see
  `customization/visual-system.md` if you want more than a text
  brief") so the checklist item maps back to a concrete,
  already-completed action.
- source: dry-run

### [ ] [MED] playbooks/new-project.md:695-711 — step 9's automated `/bootstrap` path can wire a ticking cloud loop before a single `/next` chunk has shipped, contradicting the cloud loop's own precondition
- category: instruction-drift
- observation: `README.md:426-428` states, routing to the cloud
  loop: "Don't reach for this until your verify gate is
  genuinely hermetic and the local loop has run cleanly for a
  few days — the cloud surfaces every flake." `playbooks/cloud-loop.md:40`
  repeats the same precondition. But `playbooks/new-project.md`
  step 9 ("(Optional) Run `/bootstrap`...") sits between step 8
  (sub-agents) and step 10 (the *first* `/next` invocation) —
  before the local loop has run even once. Step 9's "Automated"
  path says running `/bootstrap` "ends with a green deploy + a
  ticking cloud loop." The shipped manifest an adopter is told to
  copy at this exact step, `templates/setup/bootstrap.example.json:38`,
  defaults `"cloud_loop": {"enabled": true, ...}`.
  `customization/bootstrap-automation.md:164`'s phase-of-life
  table confirms a "Pre-everything" project (exactly where step 9
  stands) runs the full chain ending in "cloud loop." Nothing in
  step 9, `customization/bootstrap-automation.md`, or the
  manifest's `_help` block warns that enabling the cloud loop
  this early violates the precondition both README and
  cloud-loop.md state as a hard "don't."
- evidence: `README.md:426-428`; `playbooks/cloud-loop.md:40`;
  `playbooks/new-project.md:695,708-711` (step 9 precedes step
  10's `/next` smoke test); `templates/setup/bootstrap.example.json:38`
  (`"enabled": true`); `customization/bootstrap-automation.md:164`.
- suggested fix: either (a) default `bootstrap.example.json`'s
  `cloud_loop.enabled` to `false` with an `_help` note to flip it
  on only once the local loop has proven itself, or (b) add one
  sentence to `new-project.md` step 9's "Automated" bullet and
  the phase-of-life table noting the cloud-loop leg should be
  deferred (or re-run later via `/bootstrap cloud-loop`) until
  the verify gate is hermetic and the local loop has run cleanly
  for a few days.
- source: dry-run

### [ ] [MED] prompts/pitch.md:68-71 — Phase A's own "Standing rules" block never received the Co-Authored-By harness-strip carve-out added to agents.md, templates/agents.md, and prompts/adopt.md
- category: instruction-drift
- observation: a prior pass (this file's Done section, "HIGH
  prompts/adopt.md:89 / templates/agents.md:24-26") fixed the
  kit's absolute "no Co-Authored-By trailers" rule in three
  places so it no longer deadlocks against harnesses that
  auto-append one by default — each now reads "...strip it
  before every commit — this rule overrides that convention
  here" (confirmed live at `prompts/adopt.md:117-121`).
  `prompts/pitch.md` carries its own separate "Standing rules"
  block for Phase A (the pre-spec interview, which commits
  `spec.md` and `plan/bearings.md` before Phase B ever reads
  `adopt.md`), and that block still reads the bare, pre-fix text:
  "No Co-Authored-By trailers, no emojis." with no carve-out
  sentence — a fourth copy of the rule the earlier fix missed.
- evidence: `prompts/pitch.md:68-71` vs `prompts/adopt.md:117-121`.
- suggested fix: add the same carve-out sentence to
  `prompts/pitch.md`'s "Standing rules" block, mirroring
  `adopt.md`'s wording.
- source: dry-run

### [ ] [LOW] README.md:177-178 — "Review what landed"'s "Files added" checklist omits `nexus.secrets.json`, which step 4's copy also lands at the repo root
- category: comprehension
- observation: `README.md:177-178` lists files added as
  `agents.md`, `CLAUDE.md`, `plan/`, `skills/`, `.claude/`,
  `scripts/`, `.env.example` — but `playbooks/new-project.md:325`'s
  step-4 bulk-copy command also lands
  `templates/env/nexus.secrets.json` as `nexus.secrets.json` at
  the repo root (a file README's own "What's in this kit" tree
  documents elsewhere). A stranger diffing the adoption commit
  against this checklist sees an unlisted new root file. Same bug
  class as the already-fixed "'Files added' checklist omits
  CLAUDE.md" entry below — that fix added `CLAUDE.md` but not
  `nexus.secrets.json`, copied by the same step-4 command even
  then.
- evidence: `README.md:177-178` vs `playbooks/new-project.md:325`
  (`['templates/env/nexus.secrets.json','nexus.secrets.json']`).
- suggested fix: add `nexus.secrets.json` to the "Files added"
  list in `README.md:177-178`.
- source: dry-run

### [x] [MED] prompts/adopt.md:89 — owner/contributor heuristic errors with no fallback on a repo with no git remote yet — routed to 39.15
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

### [ ] [HIGH] playbooks/new-project.md §4 "Prune adopt-by-need files" — the worked example breaks the test suite it leaves behind
- category: missing-file
- observation: an adopter who follows the "Prune" step's own
  worked example literally (a `Surface: service` project with
  no `/bootstrap`, removing `scripts/bootstrap.mjs` + its own
  test) is left with `scripts/__tests__/cadence.test.mjs`
  still importing `../bootstrap.mjs` for a cross-check
  assertion — a file the same worked example never adds to its
  `rm` list. The test suite breaks right after the "adopt
  nexus" commit, before a single `/next` chunk ships.
- evidence: `node scripts/adopt-dryrun.mjs` against a scratch
  clone (reproduced twice) → `adopt-dryrun: FAIL (1)\n  prune
  step: scripts/__tests__/cadence.test.mjs imports
  ../bootstrap.mjs, which the example prune removed`.
  `templates/scripts/__tests__/cadence.test.mjs:15` —
  `import { CADENCES as BOOTSTRAP_CADENCES, DEFAULT_CADENCE as
  BOOTSTRAP_DEFAULT } from '../bootstrap.mjs';`. The worked
  example's `rm` list (`playbooks/new-project.md` §4) removes
  `scripts/bootstrap.mjs` and
  `scripts/__tests__/bootstrap.test.mjs` but never
  `scripts/__tests__/cadence.test.mjs`.
- suggested fix: either add
  `scripts/__tests__/cadence.test.mjs` (or just its bootstrap
  cross-check block) to the prune list whenever
  `scripts/bootstrap.mjs` is removed, or make the
  cross-check assertion conditional on `bootstrap.mjs`
  existing so the test degrades gracefully instead of failing
  to import.
- source: dry-run

### [ ] [MED] prompts/adopt.md "The prompt" → "Then:" bullet list — write-before-ask ordering contradicts its own rule
- category: ordering
- observation: the prompt instructs the agent to read its
  sources "in order. Do not skip steps or invent scope," yet
  its own "Then:" bullet list places "Copy templates from
  ../nexus/templates/ into this repo" and "Replace
  placeholders... with values you derive" (both filesystem
  writes) before the "Ask the user ONLY for..." bullet, which
  itself says "Ask them all before your first write." A
  literal top-to-bottom executor hits the copy/replace bullets
  first and could reasonably start writing before the batched
  ask — exactly the sequencing the rule exists to prevent.
- evidence: `prompts/adopt.md:61-87` — bullets run Copy →
  Replace placeholders → Ask the user ONLY for... ("Ask them
  all before your first write...").
- suggested fix: reorder the bullets so "Ask the user ONLY
  for..." appears immediately before "Copy templates," or add
  an explicit forward-pointer at the Copy bullet ("see the Ask
  step below — do that first").
- source: dry-run

### [ ] [LOW] playbooks/new-project.md §2 "Hard rules" — install-hooks mentioned before scripts/ exists
- category: comprehension
- observation: §2 tells the reader to run `node
  scripts/install-hooks.mjs` "before the first push," but at
  that point in the playbook `scripts/` hasn't been copied yet
  (that's §4) — a reader working section-by-section at human
  pace could try the command right away and hit
  `MODULE_NOT_FOUND` before realizing it's forward-referenced.
  (The line does carry a "(§4 copies the script)" parenthetical,
  which softens but doesn't eliminate the stumble.)
- evidence: `playbooks/new-project.md:200-204` — the
  install-hooks run instruction appears inside §2, two
  sections before §4's copy step.
- suggested fix: move the actual run instruction to §4 (right
  after the copy), leaving only a forward pointer ("see §4") in
  §2's hard-rules list.
- source: dry-run

### [ ] [HIGH] /onboarding/welcome @ mobile (plain-folder) — hero headline buries the primary CTA below the fold
- category: ui-comprehension
- observation: on a phone-width viewport the "Using Claude
  Code? Enjoy a GUI on us. For free." headline keeps its
  forced line breaks at the same large font size, so each
  short phrase wraps word-by-word into an 8+ line stack. The
  entire first screen is consumed by half the headline; the
  primary "Set up this repo" button and the loop diagram are
  scrolled out of view, with only "Skip setup" visible up top.
  A stranger has to know to scroll to find the real next
  click.
- evidence: `plain-folder--mobile--onboarding-welcome.png` in
  walk-42516406663 (cloud run artifact); the same cutoff
  appears identically in
  `cloud-token--mobile--onboarding-welcome.png` and
  `fleet-to-tug--mobile--onboarding-welcome.png` — scenario-
  independent, same shared Welcome step.
- suggested fix:
  `packages/cli/src/screens/onboarding/Welcome.jsx` hard-codes
  three `<br/>` breaks in the `<h1 className="t-display-l">`.
  `packages/cli/src/styles/nexus.css` only shrinks `.ob
  .t-display-l` (64px→54px) under `@media (max-height: 820px)`
  — there's no narrow-width rule, so a tall phone viewport keeps
  the full-size font. Add a narrow-width breakpoint that shrinks
  `.ob .t-display-l` further and lets the headline wrap
  naturally (drop or condition the hard `<br/>`s) so the CTA
  stays on the first screen.
- source: walk

### [ ] [MED] / @ desktop (cloud-token) — Fleet session tiles show two unlabeled "Q" phase segments with no legend
- category: ui-comprehension
- observation: on the Fleet home screen (what a returning,
  already-onboarded user lands on), each session tile shows a
  phase track reading "Q · Working · Q" with no hover text or
  legend. A stranger can't tell the two "Q" segments apart —
  `phaseItems()` marks two different phases that happen to
  share the same letter — and the bare label gives no clue
  which is which.
- evidence: `cloud-token--desktop--fleet.png` in
  walk-42516406663 (cloud run artifact); the same unlabeled
  "Q...Q" track appears on every tile in
  `fleet-to-tug--desktop--fleet.png` too.
- suggested fix: in `packages/cli/src/ui/package.jsx`, `MTrack`
  renders each phase as `<span>{it.label}</span>` with no
  `title`/`aria-label`. Add a `title` per segment (sourced from
  `packages/cli/src/screens/fleet/model.js`'s `phaseItems`,
  which already distinguishes the two `'q'` keys by position)
  so hovering explains what each Q means.
- source: walk

## Done

### [x] [HIGH] prompts/adopt.md:107-108 vs playbooks/new-project.md:201,306,542,582,667 — the delegated-agent prompt and the playbook it must follow give contradictory commit instructions — this commit
- category: instruction-drift
- observation: `prompts/adopt.md` tells the delegating agent to
  "Follow the matching playbook end-to-end. Do not skip steps"
  (adopt.md:55) and separately "At the end: produce a single
  commit titled 'chore: adopt nexus methodology'"
  (adopt.md:107-108). But `playbooks/new-project.md` — the
  playbook it is told to follow exactly — gives five separate,
  named commit instructions along the way: "Commit `bearings.md`
  separately" (line 201), "Commit the roadmap and the specs"
  (line 306), "Commit the templates as a single commit: `chore:
  nexus templates copied`" (line 542), "then commit both specs"
  (line 582), "Commit `package.json` + `scripts/deploy-check.mjs`
  + `.env.example`" (line 667). A delegated agent literally
  obeying "do not skip steps" produces ~5-6 commits with varied
  messages, not the one commit titled "chore: adopt nexus
  methodology" that `README.md:177` ("Review what landed") tells
  the human to look for. Nothing resolves which instruction wins.
- evidence: prompts/adopt.md:55,107-108; playbooks/new-project.md:201,306,542,582,667
- suggested fix: either have `adopt.md` explicitly say "ignore
  the playbook's intermediate commit instructions; squash
  everything into the one final commit described here," or have
  the final-commit instruction acknowledge the playbook's commit
  points and state how they reconcile (e.g. the playbook's
  intermediate commits are for the manual/human path only; the
  delegated-agent path stages everything and commits once at the
  end).
- fix: applied suggested-fix (a) — `prompts/adopt.md:55`'s
  "Follow the matching playbook end-to-end. Do not skip steps"
  now carries an explicit exception for the playbook's own
  intermediate commit instructions ("those are for a human
  working the playbook by hand"), and the final-commit bullet
  (adopt.md:111-114) now says the one commit squashes everything
  "the playbook's own intermediate commit instructions would
  otherwise have split off." `prompts/pitch.md` carries no
  matching "follow the playbook"/single-commit language, so it
  needed no parallel edit.
- source: dry-run

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
