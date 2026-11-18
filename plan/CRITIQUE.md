# Critique — external-observer findings

> Last pass: 2026-11-18
> Pass count: 37

## Pending

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

### [x] [MED] prompts/pitch.md:54-58 — Phase B's "four-item ask list" undercounts adopt.md's actual five-item list, dropping the owner/contributor question — this commit
- category: instruction-drift
- resolution: `prompts/pitch.md`'s Phase B named adopt.md's ask
  list as four items (hosting provider/token, project
  name/tagline, URL/API/CLI contract, topology confirmation),
  omitting adopt.md's own fifth item, (e) the owner/contributor
  mode confirmation — risking an agent concluding that question
  was out of bounds and silently deciding it instead of asking
  (agents.md rule 8). Changed "four-item" to "five-item", added
  "owner/contributor mode" to the parenthetical, and "those four
  items" to "those five items".
- source: dry-run
- issue: #118

### [ ] [LOW] README.md:480 — `/lessons-pr` is referenced with no prior definition anywhere in README.md
- category: comprehension
- observation: Hard Rule 6 name-drops `/lessons-pr` ("planning
  step only") as one of only two commands carrying a documented
  carve-out to the "ask before the first write" rule — the
  other being `/bootstrap`, already defined in the
  building-blocks table. `/lessons-pr` never appears in either
  command table (README.md:217-236 or :241-250), so a stranger
  meets the name for the first time inside a rule about an
  exception to a rule, with nothing to click and no idea what
  the command otherwise does.
- evidence: README.md:480 "`/lessons-pr` (planning step only)
  keep their documented" — absent from both command tables at
  README.md:217-250.
- suggested fix: add a one-line `/lessons-pr` row to the
  building-blocks table ("fold a sibling project's lessons into
  kit improvements") or link the mention at line 480 to its
  existing doc.
- source: dry-run

## Done

### [x] [MED] / @ desktop (cloud-token) — Fleet session tiles show two unlabeled "Q" phase segments with no legend — this commit
- category: ui-comprehension
- resolution: `phaseItems()`
  (`packages/cli/src/screens/fleet/model.js`) now carries a
  `title` per segment ("Questions" for the first `q`, "Review"
  for the second, "Working"/"Package" for the rest), and
  `MTrack` (`packages/cli/src/ui/package.jsx`) renders it as a
  `title` attribute on both the label and the track mark, so
  hovering either "Q" on a Fleet tile explains which phase it
  is.
- source: walk
- issue: #122

### [x] [MED] README.md — "Used v1? On v2?" interrupts the first-time-adopter flow — this commit
- category: ordering
- resolution: moved the "Used v1? On v2?" subsection out from
  between "Is this for you?" and "Three doors in" (where every
  first-time adopter had to read through upgrade-only CLI flags
  and banner language before reaching their actual entry point)
  to the end of "Three doors in", right before the TL;DR
  sections — so a brand-new adopter reaches door 1/2/3 first,
  and the v1/v2 upgrade path stays one scroll away for anyone
  who needs it. The heading text (and its `#used-v1-on-v2`
  anchor) is unchanged, so `prompts/README.md` and
  `prompts/upgrade.md`'s existing links still resolve.
- source: dry-run
- issue: #120

### [x] [MED] playbooks/new-project.md:864-867 — the Day-1 checklist's design-artifact box doesn't map back to a concrete already-completed step — this commit
- category: ordering
- resolution: step 2's "Visual / tonal defaults" subsection now
  ends with a cross-reference ("This also satisfies the Day-1
  checklist's design-artifact box below — see
  `customization/visual-system.md` if you want more than a text
  brief"), so the checklist item at the end of the playbook maps
  back to the concrete, already-completed step instead of reading
  as a new requirement.
- source: dry-run

### [x] [MED] README.md:231 vs README.md:414-416 — `/critique`'s job description contradicts itself within the same file — this commit
- category: instruction-drift
- resolution: the "nexus runs on nexus" bullet (README.md:414-
  416) now says explicitly that this `/critique` is this repo's
  own self-hosted dry-run, not the templated, product version
  the "What you get" table (README.md:231) describes earlier —
  so a stranger meeting the second mention reads it as a named
  distinction instead of a contradiction.
- source: dry-run

### [x] [MED] README.md:76-80 — the GUI teaser caption uses "fleet" and "cockpit" before either word is ever defined — this commit
- category: voice
- resolution: added a one-line gloss right after the "Three
  doors in" prose and before the GIF — "Fleet is the session
  list; cockpit is one session's live view." — so the caption's
  "fleet"/"cockpit" jargon reads against a definition instead of
  cold.
- source: dry-run
- issue: #119

### [x] [MED] playbooks/new-project.md:51 — Prerequisites claims GitLab support that nothing else in the kit delivers — this commit
- category: instruction-drift
- resolution: dropped the "(or GitLab/equivalent)" parenthetical;
  the line now states the real requirement (a GitHub repo) and a
  one-line pointer to `ci-providers.md`'s "Self-hosted" section
  for a non-GitHub deploy target, instead of implying GitLab
  itself works out of the box.
- source: dry-run
- issue: #117

### [x] [MED] templates/README.md:261,273 — "replace all eight" undercounts the adjacent 9-row placeholder table — this commit
- category: instruction-drift
- resolution: changed both "eight" occurrences in
  `templates/README.md` (the one-liner intro and the
  workspace-placeholders note) to "nine", matching the 9-row
  table above and `playbooks/new-project.md:384`'s own count.
- source: dry-run

### [x] [HIGH] templates/README.md:373-384 — "Reference implementations" section points adopters at real projects README.md's Provenance section fully anonymizes — this commit
- category: comprehension
- resolution: dropped the "Reference implementations" section
  outright (no other file links its anchor): it told adopters
  to go copy `skills/`, `plan/`, `.claude/` from "the real
  projects in the root README's Provenance section," but that
  section deliberately anonymizes every project (no name, link,
  or path), so the instruction was a dead end for any external
  adopter.
- source: dry-run

### [x] [MED] prompts/pitch.md:68-71 — Phase A's own "Standing rules" block never received the Co-Authored-By harness-strip carve-out added to agents.md, templates/agents.md, and prompts/adopt.md — this commit
- category: instruction-drift
- resolution: added `prompts/adopt.md:131-133`'s carve-out
  sentence to `prompts/pitch.md`'s Standing rules block, so
  Phase A's own copy now reads "...strip it before every
  commit — this rule overrides that convention here" like the
  other three copies.
- source: dry-run

### [x] [MED] playbooks/new-project.md:695-711 — step 9's automated `/bootstrap` path can wire a ticking cloud loop before a single `/next` chunk has shipped, contradicting the cloud loop's own precondition — this commit
- category: instruction-drift
- resolution: `playbooks/new-project.md` step 9's "Automated"
  bullet (option b of the suggested fix) now says to skip the
  cloud-loop leg this early and run `/bootstrap cloud-loop` on
  its own once the verify gate is hermetic and the local loop
  has run cleanly for a few days, linking the same precondition
  in `README.md`'s "Pick a playbook" table and `cloud-loop.md`.
  `customization/bootstrap-automation.md`'s phase-of-life table
  gets the matching note for its "Pre-everything" and "Remote,
  nothing else" rows.

### [x] [MED] README.md:379 — "all 8 placeholders" is stale; the table it links to has 9 — this commit
- category: placeholder
- resolution: `README.md:380` now says "replacing all 9
  placeholders" — `templates/README.md`'s `## Placeholders`
  table (lines 250-258) lists exactly 9 rows, the 9th being
  `<PACKAGE_MANAGER>`.
- source: dry-run

### [x] [MED] prompts/adopt.md "The prompt" → "Then:" bullet list — write-before-ask ordering contradicts its own rule — this commit
- category: ordering
- resolution: moved the "Ask the user ONLY for..." bullet to
  right after the topology-check bullet, before "Follow the
  matching playbook," "Copy templates" and "Replace
  placeholders" — so the ask now precedes every write the
  "Then:" list makes, matching the rule the bullet itself
  states ("Ask them all before your first write"). Added one
  closing clause to the ask bullet ("Do this now, before the
  playbook or any copy/replace step below — they write") and
  changed the topology bullet's forward-reference from "below"
  to "next" to match the new position.

### [x] [HIGH] /onboarding/welcome @ mobile (plain-folder) — the loop-diagram captions collide into unreadable overlapping text on a phone — this commit
- category: ui-comprehension
- observation: on the mobile Welcome screen, the four loop-node
  captions ("commit", "and around again", "build", "Claude Code
  writes it", "check", "against its acceptance IDs") and the
  "repo · main" center label render on top of each other in a
  dense, illegible cluster to the lower-right of the circle.
  Visible identically across all three scenarios (plain-folder,
  cloud-token, fleet-to-tug) on mobile. This is the very first
  screen a stranger sees on a phone, and the diagram meant to
  explain nexus's core plan/build/check/commit loop is unreadable.
- evidence: `plain-folder--mobile--onboarding-welcome.png` (same
  overlap in `cloud-token--mobile--onboarding-welcome.png` and
  `fleet-to-tug--mobile--onboarding-welcome.png`), this tick's
  `npm --prefix packages/cli run walk`,
  `.scratch/walk/critique-2026-11-16T22-28-44-439Z/`.
  `packages/cli/src/screens/onboarding/Welcome.jsx`'s `LOOP`
  array positions each `.loop-node` by percentage with no
  width constraint on `.loop-node .cap`
  (`packages/cli/src/styles/nexus.css:1322-1323`); the mobile
  media query at `nexus.css:1457-1464` only shrinks `.loop-art`'s
  container (`width: min(380px, 100%)`), never the caption text
  boxes, so at phone widths the four caption blocks overlap each
  other and the center label.
- suggested fix: in `packages/cli/src/styles/nexus.css`, give
  `.loop-node .cap` a bounded `max-width` (sized to the node
  spacing) and let it wrap within its own column instead of
  overflowing toward the center, so captions stop colliding at
  viewport widths around 390px. Layout/width only — no change to
  the particle animation or colors.
- fix: the caption overlap's deeper cause was `.ob-grid`'s mobile
  single-column override (inside the `@media (max-width: 760px)`
  block near the file's top) losing the cascade to the later,
  unconditional two-column `.ob-grid` rule in the "ONBOARDING
  STEPS" section — same specificity, later source wins, so mobile
  never actually stacked and `.loop-art` rendered in a squeezed
  ~120px column. Added a second `@media (max-width: 760px)` block
  right after both base rules (`.ob-grid`, `.loop-node .cap`) so
  the override lands last in source and actually wins; it also
  gives `.loop-node .cap` a 92px `max-width` so each caption wraps
  within its own column instead of overflowing toward the center.
  Mirrored the same edit into `packages/cli/design/handoff/nexus.css`
  per its own "change both together" contract. Verified: `npm
  --prefix packages/cli run walk` across all three scenarios ×
  both viewports reports 0 findings; a manual full-page capture of
  the mobile Welcome screen shows the stacked layout and
  non-overlapping, wrapped captions. Left `.ob`'s own
  `overflow: hidden` untouched — unclipping it surfaces the
  already-tracked stepper-overflow finding below, out of scope here.
- source: walk

### [x] [HIGH] /onboarding/welcome @ mobile (plain-folder) — hero headline buries the primary CTA below the fold — this commit
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
- fix: `nexus.css`'s existing `@media (max-width: 760px)` block
  now stacks `.ob-grid` to one column, shrinks `.ob
  .t-display-l` to 34px/40px, and hides a new `.ob-br` class;
  `Welcome.jsx`'s three `<br/>`s carry that class (with an
  explicit space each, trimmed as leading line-break whitespace
  on desktop) so the headline wraps naturally on narrow
  viewports. Verified with `npm run walk -- --scenarios
  fleet-to-tug --viewports mobile,desktop`: the CTA now renders
  on the first mobile screen and the desktop layout is
  unchanged.
- source: walk

### [x] [HIGH] prompts/adopt.md:62-64 — the delegated-adoption prompt's placeholder list omits `<PACKAGE_MANAGER>`, the 9th placeholder — this commit
- category: instruction-drift
- resolution: added `<PACKAGE_MANAGER>` to the placeholder list
  in `prompts/adopt.md`, matching `templates/README.md:258`'s
  9-item table.

### [x] [HIGH] playbooks/new-project.md §4 "Prune adopt-by-need files" — the worked example breaks the test suite it leaves behind — this commit
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
- fix: applied suggested-fix (b) — the static `../bootstrap.mjs`
  import left the whole test file unloadable once the file was
  pruned, so `templates/scripts/__tests__/cadence.test.mjs` now
  checks `fs.existsSync` on `bootstrap.mjs` and only runs the
  "bootstrap names the same five words" assertion (via a dynamic
  `import()`) when the file is still there; pruned, the test
  skips with a named reason instead of crashing the suite.
  Confirmed against a scratch clone: `adopt-dryrun` failed
  before the fix and passes after, with the pruned cadence
  suite reporting 1 skipped, 0 failed.
- source: dry-run

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

### [x] [MED] /inbox @ mobile (plain-folder) — the Oversight filter row clips its last option off-screen with no scroll affordance — this commit
- category: ui-comprehension
- observation: on a phone-width viewport, the Oversight filter
  row ("All 0 / Waiting now 0 / Parked 0 / In the plan 0 / Cloud
  runs 0") is cut off mid-word ("Cloud ru…") at the right edge,
  with no visible scroll hint, so the last filter's label is
  unreadable and its tap target is partially off-screen.
- evidence: `plain-folder--mobile--inbox.png` (this tick's `npm
  --prefix packages/cli run walk`,
  `.scratch/walk/critique-2026-11-17T23-09-24-151Z/`).
  `packages/cli/src/ui/controls.jsx`'s `ChoiceButtons` renders a
  `.choice` row of buttons; `packages/cli/src/styles/nexus.css`'s
  `.choice` and `.choice button` rules use `white-space: nowrap`
  with no `overflow-x`, while the ancestor `.view` sets
  `overflow: hidden`, so the overflowing row clips outright
  instead of scrolling.
- suggested fix: add `overflow-x: auto;
  -webkit-overflow-scrolling: touch;` to `.choice` in
  `packages/cli/src/styles/nexus.css` (or wrap it in a scrollable
  container) so all five filters stay reachable by horizontal
  swipe on narrow viewports. Layout only — no change to color,
  particles, or motion.
- fix: gave the shared `.choice` rule in `packages/cli/src/
  styles/nexus.css` its own `max-width: 100%; overflow-x: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: thin;` (the
  thin-scrollbar convention already used by `.pboard`, `.vt-col`
  and `.vault-scroll`), so any choice row wider than its container
  scrolls instead of clipping — the `.plotc-q .choice` override
  (wrap instead of scroll, a different use case) is untouched.
  Mirrored into `packages/cli/design/handoff/nexus.css` per its
  "change both together" contract. Verified: a fresh `npm
  --prefix packages/cli run walk -- --scenarios plain-folder
  --routes /inbox --viewports mobile` build, and the compiled
  `dist/assets/index-*.css` carries the new rule. Layout only — no
  change to color, particles, or motion.
- source: walk
- issue: #121

### [x] [MED] /onboarding/welcome @ mobile (plain-folder) — the 8-star stepper clips mid-sequence on a phone viewport with no "n of N" cue — this commit
- category: ui-comprehension
- observation: on a phone-width viewport the top stepper (`Welcome,
  Permissions, Detect, Shape, …`) shows only its first 4 of 8
  stars before the row is cut off flush at the viewport's right
  edge — no fade, arrow, or counter signals more steps exist. The
  desktop view of the same screen shows the full 8-star row plus
  a footer "1 of 8" counter; neither survives onto the mobile
  layout, so a phone user has no way to tell the setup is twice
  as long as what's visible.
- evidence: `plain-folder--mobile--onboarding-welcome.png` vs
  `plain-folder--desktop--onboarding-welcome.png` (this tick's
  `npm --prefix packages/cli run walk`,
  `.scratch/walk/critique-2026-11-10T17-55-24-790Z/`).
  `packages/cli/src/ui/feedback.jsx:16`'s `Stepper` renders one
  fixed-width `.stp` (`packages/cli/src/styles/nexus.css:610`,
  `width: 92px`) per step with no wrap; `.stepper`
  (`nexus.css:609`) is a bare `display: flex` with no
  `overflow-x`/wrap rule, and `nexus.css:1297`'s section comment
  ("Every step fits 1280 x 800 without scrolling") confirms the
  component assumes a desktop viewport. 8 × 92px (~736px) doesn't
  fit a ~390px phone width, so the row silently clips instead of
  wrapping, scrolling, or showing a counter.
- suggested fix: give `.stepper` a narrow-viewport treatment in
  `packages/cli/src/styles/nexus.css` — either an `overflow-x:
  auto` scroll strip with a visible fade/arrow, or collapse to
  the same "n of N" text the footer already has
  (`packages/cli/src/screens/onboarding/frame.jsx`'s footer logic)
  so the full step count is legible without widening every star.
- fix: added a `.stp-count` span to `Stepper`
  (`packages/cli/src/ui/feedback.jsx`), reusing the existing
  `stepCount()` helper the footer already calls, so it renders
  the same "N of 8" text. On phone widths (`nexus.css`'s existing
  `@media (max-width: 760px)` block) `.stp-lines` and every
  non-current `.stp` hide and `.stp-count` shows, collapsing the
  8-star row to the current step's star plus the count instead of
  clipping. Mirrored into `packages/cli/design/handoff/nexus.css`
  per its "change both together" contract. The current step's
  glow animation is untouched — layout only, no change to color,
  particles, or motion.
- source: walk
- issue: #123
