# Phase candidates

> Last pass: 2026-07-22
> Pass count: 4
> Posture: bold

`/expand` files candidates here; `/oversight` promotes them
into `plan/steps/01_build_plan.md`. Seeded 2026-07-02 from the
kit + sibling surveys.

## Pending

### [ ] [score 8.8] Workspace-of-repos as a first-class adoption path
- proposed: 2026-07-03
- source signals: kintilla AND semilayer independently converged
  on the same topology — un-versioned workspace root,
  org-per-project GitHub layout, `plan/` its own repo, sibling
  product repos — which the kit only half-documents
  (`playbooks/polyrepo.md` covers the plan split alone).
- rationale: two real adoptions converging unprompted is the
  strongest possible signal; every workspace adopter currently
  re-improvises the root conventions.
- proposed scope: `playbooks/workspace.md` (un-versioned-root
  rule, org-per-project, what lives only at root, decision
  matrix, ready-when checklist); `templates/workspace/` root
  family (workspace CLAUDE.md + AGENTS.md mirror, scratch
  README, repo-claude propagation template); a
  topology-detection step in the adopt prompt with a
  confirm-with-user stop; edits to `playbooks/polyrepo.md` +
  `concepts/architecture.md` so single-repo -> polyrepo ->
  workspace reads as one ladder.
- estimated phases: 1-2
- conflicts: extends polyrepo.md, never replaces it.

### [ ] [score 8.6] prompts/ as canonical files + a five-line paste
- proposed: 2026-07-03
- source signals: the two ~60-line README paste-prompts are the
  funnel's biggest wall; prompt fixes today mean "re-paste the
  new blob".
- rationale: `prompts/adopt.md` + `prompts/pitch.md` as
  versioned, gate-linted files turn the paste into five lines
  that self-clone (or one raw.githubusercontent fetch line),
  client-agnostic by construction; every other doorway (npx,
  plugin) later references the same canonical text.
- proposed scope: `prompts/adopt.md`, `prompts/pitch.md`,
  `prompts/README.md`; README TL;DR sections shrink ~120
  lines; a verify leg keeping any README excerpt byte-synced
  with prompts/; `skills/critique.md` dry-runs the new short
  paste; agents.md notes prompts/ paths are public API.
- estimated phases: 1
- conflicts: pairs with the README conversion pass below —
  promote together or sequence prompts/ first.

### [ ] [score 8.5] Two-ring secrets topology (.env vs .env.workspace)
- proposed: 2026-07-03
- source signals: both mature adoptions run the same secrets
  layering the kit says nothing about — per-repo `.env` for the
  loop's own gate tokens, workspace-root `.env.workspace` for
  cross-repo operational secrets, `.secrets/` for key FILES.
- rationale: the safety property is structural, not procedural —
  the workspace root is outside every repo, so `git add -A`
  physically cannot leak Ring 2. Answers the scariest adopter
  question ("where do secrets go?") with architecture.
- proposed scope: `customization/workspace-secrets.md` (two
  rings + key-file pointer rule + placement tiebreaker: consumed
  by, or granting power over, more than one repo -> Ring 2);
  `templates/env/env.workspace.example` (names never values;
  per-key grammar: minted-by runbook, mirrored-to, expires);
  header pointer in `templates/env/env.example`; see-also links
  in polyrepo.md + external-services.md.
- estimated phases: 1
- conflicts: none — opens with "skip unless polyrepo/workspace".

### [ ] [score 8.3] README above-the-fold conversion pass
- proposed: 2026-07-03
- source signals: conversion happens in the first screenful;
  today the pitch is stated twice, the paste is 60 lines, and
  the workspace shape has no front door. Full restructure
  outline captured 2026-07-03 (ideation session).
- rationale: hook -> proof -> qualify -> convert -> deepen ->
  trust -> rules; target ~350 lines from ~690. The march.yml
  badge whose green is produced by the loop it sells is proof
  no competitor can hand-copy.
- proposed scope: README-only editing session: kill the
  blockquote echo, merge the three qualification sections into
  one gate above the doors, collapse the two TL;DRs + mermaid
  into a three-door section, replace eight playbook blurbs with
  a router table (you have -> do this -> time), ouroboros proof
  strip up top, date-stamped adoption-receipt diffstat in a
  details block. Repoint the verify tree leg in the same commit.
- estimated phases: 1
- conflicts: depends on prompts/ landing first (the doors paste
  five lines, not sixty).

### [ ] [score 8.2] Versioned releases + plan/nexus.lock + upgrade story
- proposed: 2026-07-03
- source signals: adopters copy from a moving main and can never
  diff what changed; every packaging doorway needs something
  stable to pin against.
- rationale: "copy once, drift forever" becomes "pin, then
  upgrade deliberately" — dependency semantics with nothing but
  git tags and one JSON lock (kitVersion, kitCommit, per-file
  hashAtCopy). Three-way merge separates "stale, cleanly
  bumped" from "customized, needs eyes".
- proposed scope: KIT_VERSION + CHANGELOG.md keyed by template
  path; `scripts/kit-manifest.mjs` (hermetic sha256 walk);
  lock-writing step in prompts/adopt.md; `playbooks/upgrade.md`
  (git merge-file three-way; [needs-user-call] AUDIT rows for
  conflicted files; pre-lock fallback via re-hash against
  historical tags); verify legs for version/CHANGELOG sync.
- estimated phases: 2
- conflicts: prompts/ should land first (the lock step lives
  there); permanent CHANGELOG discipline cost — worth it.

### [ ] [score 7.9] Handshake runbook profile for setup/
- proposed: 2026-07-03
- source signals: kintilla's runbooks follow a proven handshake
  the kit's setup/ paradigm doesn't capture: "human dashboard
  steps (~N min) -> drop these exact keys into the env file ->
  say 'X is in' -> what the agent wires after the drop".
- rationale: turns every external service into a
  fill-in-the-blanks credential handoff; keys arrive in files,
  not chat. The "THE STEP THAT CAN BREAK <X>" destructive-step
  callout convention rides along.
- proposed scope: `templates/setup/NN_service.handshake.md`
  (four fixed sections; fenced env-block naming exact keys +
  exact target file + resume signal); "two runbook profiles"
  chooser in external-services.md (agent can do >80% via CLI
  once it has a token -> handshake); profile column in
  00_files.md legend.
- estimated phases: 1
- conflicts: none — second layer of the two-ring secrets story.

### [ ] [score 9.0] Rewrite playbooks/new-project.md's step-4 copy-and-placeholder walkthrough as one verified sequence
- proposed: 2026-07-06; re-evidenced 2026-07-10, 2026-07-13,
  2026-07-21
- source signals: this is the second critique cycle in a row to
  land findings in the same step-4/7 block of
  playbooks/new-project.md. The four findings that originally
  motivated this candidate (sibling-clone copy paths,
  `PHASE_CANDIDATES.md` never copied, CLAUDE.md never landed at
  root, and their combined ordering) are now all fixed
  individually (see `plan/CRITIQUE.md` Done log) — and critique
  pass 3 (2026-07-10) immediately found six more in the identical
  region: `templates/plan/phases/` also never lands in step 4's
  copy array despite step 5 depending on it (HIGH — literal
  placeholder tokens ship in phase 1's brief); the placeholder
  grep scope still misses `./scripts` and `./.env.example` (MED,
  confirmed unresolved `<PROJECT_LOWER>`/`<REPO_SLUG>` tokens);
  the blanket `skills/` copy still contradicts the adopt-by-need
  contract (MED); step 7 redundantly re-copies
  `deploy-check.mjs` already placed by step 4's bulk copy (LOW);
  step 6 edits a `package.json` that doesn't exist at that point
  in the walk (LOW); the pnpm sed caveat has no worked example
  (MED, see the sibling candidate below). Critique pass 4
  (2026-07-13) sharpened the adopt-by-need prune finding still
  further: the "Prune adopt-by-need files" fix only gives worked
  removal steps for 4 of `templates/README.md`'s ~12 adopt-by-need
  rows, leaving `skills/digest.md`, `skills/bootstrap.md`,
  `scripts/refresh-critique-session.mjs`,
  `scripts/check-secrets-liveness.mjs`, and
  `scripts/stack-lifecycle.mjs` unconditionally landed with no
  prompt to remove them for adopters who don't need them —
  confirmed in a scratch repro. Third cycle in a row landing in
  this same block. A fresh A-G AUDIT sweep (2026-07-21, not a
  critique pass) found a fourth instance of the identical
  grep-scope bug: the same one-liners also omit `./data`, so
  `templates/data/README.md`'s `<PROJECT>`/`<PROJECT_PKG_PREFIX>`
  tokens survive the sweep unresolved for GitHub-as-DB adopters —
  fixed same-commit (`ced0304`), the third distinct scope gap
  found this way after `./scripts` and `./.env.example`. The bug
  class now reproduces from both signal A (audit) and signal B
  (critique), always in the same one-liners.
- rationale: tick-by-tick `/iterate` fixes keep patching this
  block and it keeps re-breaking on the next fresh-eyes pass —
  the strongest possible evidence that the block's *structure*
  (copy array + placeholder sweep + prune, spread loosely across
  steps 4-7) is the defect, not any single line in it. Signal B's
  cluster pattern, now quadrupled, and no longer critique-only.
- proposed scope: rewrite playbooks/new-project.md's step 4 (copy)
  and its placeholder-replace step so paths match the README's
  recommended sibling-clone layout; add the missing
  `templates/plan/phases/` copy line (and re-sweep placeholders
  over it); widen the grep scope to every directory step 4
  populates (`./scripts`, `./.env.example`, `./data`) once,
  structurally, instead of patching one omitted directory per
  sweep; add an explicit
  adopt-by-need prune sub-step right after the bulk copy that
  covers all ~12 of `templates/README.md`'s adopt-by-need rows,
  not just the 4 already worked (Surface/Structured-data/
  UGC-gated); fold step 7's now-redundant deploy-check.mjs copy
  into step 4's bulk copy and reword step 7 to "wire the file
  already present"; clarify step 6 describes the target shape for
  phase 1's brief to produce, not something to run against an
  empty repo. Carries all current CRITIQUE rows in this cluster to
  Done in the same commit (leaves the pnpm/settings.json row to
  the sibling candidate below, and the two single-instance LOW
  rows — step 2's bearings.md placeholder mismatch,
  `<PROJECT_PKG_PREFIX>`'s worked example — as plain `/iterate`
  ticks; they don't share this cluster's root cause).
- estimated phases: 1
- conflicts: none — tightens an existing playbook, no template
  API change.

### [ ] [score 7.6] Key custody map + hermetic keys lint
- proposed: 2026-07-03
- source signals: unattended windows die on "which file holds
  this token, where is it mirrored, when does it expire" —
  questions no kit file answers today.
- rationale: one greppable names-only registry row per
  credential (Key | Holder file | Minted by | Scopes | Mirrored
  to | Expires | Rotate via), updated in the same commit as the
  mint; a pure-string lint makes orphan/ghost/ambiguous keys a
  gate failure while staying offline.
- proposed scope: `templates/setup/00_keys.md`;
  `templates/scripts/keys-audit.mjs` (opt-in leg); hands-off.md
  pre-flight refuses a window that outlives any Expires cell;
  /bootstrap rotate consumes Mirrored-to as its propagation
  list.
- estimated phases: 1
- conflicts: builds on the two-ring topology + handshake rows.

### [ ] [score 7.5] Package nexus as a Claude Code plugin
- proposed: 2026-07-02 (design deepened 2026-07-03)
- source signals: adoption friction (clone + copy + replace is
  the whole TL;DR); Claude Code plugin/marketplace support.
- rationale: `/plugin install nexus` collapses adoption Step 1;
  the client-agnostic skills/ layout stays canonical. Deepened:
  the plugin ships adopt/upgrade/doctor commands ONLY — never
  the skill family, protecting the adopted-skills doctrine; the
  nexus repo is its own marketplace so push = publish survives.
- proposed scope: `.claude-plugin/marketplace.json` at root;
  plugin/ generated by `scripts/build-plugin.mjs` (version ==
  KIT_VERSION, commands wrap the canonical prompts/, vendored
  templates snapshot for offline determinism); one verify leg
  regenerating in-memory and byte-diffing; `playbooks/plugin.md`.
- estimated phases: 1
- conflicts: ship after prompts/ + releases/lock — the plugin
  commands consume both.

### [ ] [score 7.4] plan/ carries the workspace: resurrection files + doctor
- proposed: 2026-07-03
- source signals: the un-versioned root's obvious objection —
  lose the machine, lose the topology. kintilla's plan repo
  already half-plays this role.
- rationale: make plan/ the versioned carrier: canonical copies
  of the root files, a names-only keys manifest, a clone map,
  and a zero-dependency offline doctor. New-machine flow: clone
  org/plan, copy root files up, clone per repos.md, re-run each
  runbook's human beat, doctor until green.
- proposed scope: `templates/workspace/plan-workspace/`
  (keys.md names-only manifest, repos.md clone map, root/
  canonical copies); `templates/workspace/workspace-doctor.mjs`
  (root-not-a-repo, repos exist, keys present by name, no
  secret path inside any repo tree); Resurrection section in
  playbooks/workspace.md; pointer in recovery.md.
- estimated phases: 1
- conflicts: rides the workspace playbook candidate.

### [ ] [score 7.3] Workspace-aware /bootstrap + /oversight
- proposed: 2026-07-03
- source signals: kintilla's cloudflare runbook fans one
  workspace token out to repo Actions secrets by hand.
- rationale: teach the executor the two rings — env resolution
  walks up (process env -> repo .env -> parent .env.workspace,
  with stop conditions), secret fan-out walks down (gh secret
  set per Mirrored-to target); a missing key's failure message
  points at the runbook that mints it.
- proposed scope: edits only — bootstrap-automation.md (env
  resolution order + fan-out), external-services.md (/oversight
  checks each key in its Holder file, names only), polyrepo.md
  (custody map rides the plan repo).
- estimated phases: 1
- conflicts: depends on two-ring topology + custody map.

### [ ] [score 7.2] Package-manager pluggability: the pnpm-only settings.json allowlist silently stalls npm/yarn/bun adopters
- proposed: 2026-07-10
- source signals: critique pass 3 (2026-07-10) —
  `playbooks/new-project.md:35`'s "sed-replace if you use
  npm/yarn/bun" caveat has no worked example and a naive
  `s/pnpm/npm/g` breaks command syntax (`npm typecheck` needs
  `run`); separately, and more seriously,
  `templates/claude/settings.json`'s permission allowlist is
  hardcoded to `Bash(pnpm verify:*)` / `Bash(pnpm test:*)` etc.
  with no equivalent for other package managers.
- rationale: an npm/yarn/bun adopter's verify-gate commands never
  match the allowlist, so every unattended cloud tick silently
  stalls on a permission prompt nobody is present to answer —
  this directly defeats `README.md`'s "leave it for 80 hours"
  pitch, the kit's core promise, for any adopter who isn't on
  pnpm. Adopter-facing and severe out of proportion to how small
  the fix is.
- proposed scope: either (a) generate
  `templates/claude/settings.json`'s allowlist entries from the
  package-manager choice already captured during onboarding
  (bootstrap.mjs already prompts/knows this), so npm/yarn/bun
  land with matching `Bash(<pm> ...)` entries in the same commit
  the placeholders resolve; or (b), if (a) is out of scope for one
  phase, state plainly in `new-project.md` and `README.md` that
  pnpm is a hard prerequisite until (a) ships, and give a real
  worked sed example for the interim manual path. Either way,
  fixes the allowlist/caveat mismatch `plan/CRITIQUE.md` flagged.
- estimated phases: 1
- conflicts: none — settings.json's allowlist shape is internal
  to the template, not public API (agents.md rule 7 covers
  paths + placeholder vocabulary, not allowlist contents).

### [ ] [score 7.1] npx nexus-adopt: the mechanical half as an initializer
- proposed: 2026-07-03
- source signals: clone + copy + placeholder-replace is
  mechanical work no agent needs judgment for.
- rationale: a zero-dependency initializer does the mechanical
  half (infer placeholders from git remote/branch/dirname,
  shallow-clone at the latest tag, copy per the templates
  contract, write plan/nexus.lock) then prints exactly one
  paste line handing the judgment half to ANY agent.
- proposed scope: packaging/npx/ (bin + small test); release.yml
  publishing on tag push (one NPM_TOKEN secret); README
  one-command variant above the paste.
- estimated phases: 1
- conflicts: ship after prompts/ + releases; npm is a second
  publish surface to keep in lockstep.

### [ ] [score 7.0] ADOPTERS.md wall + badge + opt-in hatch beacon
- proposed: 2026-07-03
- source signals: the only zero-cost growth loop available under
  the $0-marginal constraint.
- rationale: registry rows are trivially mergeable community
  PRs; the differentiated part is the beacon — an adopter's
  first green tick (opt-in, off by default, loudly so) files a
  "hatched" issue with verifiable first-tick evidence, and
  /triage is the spam gate.
- proposed scope: ADOPTERS.md seeded with the provenance
  projects + paste-ready badge snippet; README "projects that
  ship themselves" strip; NEXUS_HATCH_OPTIN= (empty default) in
  env.example; one fires-once step in ship-a-phase.md; a
  hatched route in triage.md.
- estimated phases: 1
- conflicts: beacon must stay opt-in or it reads as phone-home
  telemetry in a kit whose brand is "you own everything".

### [ ] [score 5.5] playbooks/outgrow.md — the split ceremony
- proposed: 2026-07-03
- source signals: judged premature — no second real migration to
  validate the ceremony against yet.
- rationale: the single-repo -> workspace split will eventually
  need a numbered, safe ceremony; write it when the first real
  split happens and can serve as its test case.
- proposed scope: deferred; the workspace playbook's decision
  matrix + polyrepo.md cover the ladder's endpoints until then.
- estimated phases: 1
- conflicts: none.

### [ ] [score 6.8] closeloop: thank the humans who file issues
- proposed: 2026-07-02
- source signals: kintilla's `.claude/tools/closeloop.mjs`
  (Postmark batch thank-you emails to issue reporters,
  dry-run default, tested).
- rationale: the address loop closes with the fix; closing
  with the *reporter* compounds trust. Generalize as an
  opt-in template next to loop-issue.mjs.
- proposed scope: `templates/scripts/closeloop.mjs` +
  customization section in the triage/moderation story.
- estimated phases: 1
- conflicts: email provider becomes an optional external
  service (runbook required).

### [ ] [score 6.1] Critique-household pattern for auth-aware critique
- proposed: 2026-07-02
- source signals: kintilla's planned `/visit` seals an
  anonymous "critique household" so the observer never
  consents to analytics (no GA4 pollution) — a pattern
  auth-aware-critique.md doesn't cover.
- rationale: adds the "observer must not pollute product
  analytics/data" dimension to the five auth patterns.
- proposed scope: new section in
  `customization/auth-aware-critique.md` + env conventions.
- estimated phases: 1
- conflicts: none.

### [ ] [score 5.9] Staged hardening for verify legs
- proposed: 2026-07-02
- source signals: kintilla's `check.mjs` `*_IS_ERROR` flags —
  new invariants start as warnings, flip to errors once the
  corpus drains.
- rationale: lets adopters (and this repo) add aggressive lint
  legs without a big-bang cleanup; the flip commit is the
  celebration.
- proposed scope: warn-tier support in `scripts/verify.mjs` +
  a paragraph in verify-gate.md.
- estimated phases: 1
- conflicts: none.

### [ ] [score 7.5] Cloud march ticks must not dispatch background/async agents
- proposed: 2026-07-17 (digest)
- source signals: the 2026-07-17 03:04 UTC cloud tick (run
  `29551508864`) reached `/iterate`'s audit-refresh step, found
  `plan/AUDIT.md` >24h stale, and launched an async background
  subagent to run the A-G sweep instead of running it inline.
  The log shows it explicitly deciding to "wait for the audit
  agent to finish," then the GitHub Actions job's own
  `terminal_reason` flips to `completed` ~4 seconds later — no
  commit, no verify run, no trace of the subagent's output ever
  landing. The very next tick (07-17 08:45, run `29567537795`)
  hit the identical stale-audit branch but ran the sweep inline
  and shipped cleanly in ~6 minutes (commit `4ca0c36`), proving
  the sweep itself isn't the bottleneck — the async dispatch
  pattern is. 1 of 4 ticks in that 26h window was silently lost
  this way (full pulse in `plan/DIGEST.md` 2026-07-17).
- rationale: a GitHub Actions job is a single-shot process —
  once the step (and the job) exits there is nothing left
  running to deliver a background agent's completion
  notification, so dispatching `Agent(..., run_in_background:
  true)`-style work inside a cloud march tick is a guaranteed
  no-op, not a performance win. `templates/.github/workflows/march.yml`
  runs the identical one-shot pattern, so every adopter's cloud
  loop carries the same latent trap.
- proposed scope: add an explicit "cloud ticks run
  synchronously — never dispatch an agent in background mode;
  always await inline" line to the cloud-mode prompt block in
  `.github/workflows/march.yml` and its `templates/` mirror,
  plus a matching failure-mode entry in `.github/CLOUD_LOOP.md`
  ("a tick logs launching a background/async audit agent then
  exits clean with no commit" -> this root cause) and a note on
  `skills/iterate.md`'s audit-delegation step.
- estimated phases: 1 (doc/prompt-only, no template API change)
- conflicts: none.

### [ ] [score 6.5] Mechanically verify the Cloud-Run trailer on cloud ticks
- proposed: 2026-07-20 (digest)
- source signals: of the 4 cloud commits shipped in the trailing
  24h window (2026-07-19 14:31 to 2026-07-20 09:07 UTC — all
  4 `march` runs green, no failures), 1 — `a74f7b6` ("critique:
  pass 6 — 4 findings (2 high, 2 med)", from the 2026-07-19
  20:18 UTC tick) — landed with no `Cloud-Run:` trailer at all,
  breaking agents.md rule 2's carve-out. The workflow's own
  ceiling check (`march.yml`'s "Daily commit ceiling check"
  step) counts cloud volume by `git log --grep='Cloud-Run:'`,
  so this commit silently doesn't count toward the 8/24h
  ceiling either — the miss is invisible from both the rule
  side and the counting side. `scripts/verify.mjs` runs
  foreground on every tick but has no leg that inspects the
  commit trailer, since it can't distinguish a cloud commit
  from a local one at gate time.
- rationale: the trailer is the sole mechanism the ceiling
  trusts; a tick that forgets it both violates the standing
  rule silently and erodes the ceiling's accuracy in the
  direction that's hardest to notice (undercounting, not
  overcounting). One miss in 4 ticks this window is a real
  rate, not a one-off.
- proposed scope: a post-agent step in `march.yml` (and its
  `templates/` mirror) that diffs `HEAD` against the pre-run
  SHA when the ceiling didn't skip, and — if new commits landed
  without the trailer on all of them — opens an unlabeled
  issue naming the offending SHA (the loud-not-silent pattern
  agents.md rule 6 already prescribes elsewhere). Gate-side
  enforcement isn't possible (verify.mjs can't tell cloud from
  local commits), so this has to live in the workflow, not the
  gate.
- estimated phases: 1 (workflow-only, no template API change)
- conflicts: none.

### [ ] [score 6.0] AUDIT's unwritten "favor the queue" tie-break is starving a cheap, real AUDIT-native row
- proposed: 2026-07-24 (digest)
- source signals: `plan/AUDIT.md`'s `[A/E, 2.7]` row (README's
  "Files added" checklist undersells `scripts/` — impact 3,
  ease 9, one of the cheapest fixes in the file) first appeared
  around cloud tick 2026-07-17 and has since been cited as tied
  or narrowly outscored by a `plan/CRITIQUE.md` row in at least
  ten separate tick log-lines through 2026-07-24, every single
  time it was in contention. The tie-break that keeps beating it
  ("favor the queue") is a real, consistently-applied
  convention, but it exists only as repeated log narrative in
  `plan/AUDIT.md` — it was never written into `skills/iterate.md`
  §3 as an actual rule, so nobody can inspect or challenge it as
  policy, and it has no aging counter-pressure.
- rationale: a one-line, ease-9 fix sitting seven-plus days
  unshipped purely because of an unwritten scoring convention is
  exactly the "starved queue" pattern `skills/digest.md` §4 names
  as a tuning trigger — not because the fix is hard, risky, or
  actually low-value.
- proposed scope: write the "favor the queue on ties" convention
  explicitly into `skills/iterate.md` §3 as an inspectable rule,
  paired with a small aging nudge (e.g. `+0.1` per tick an AUDIT
  row is passed over on a tie, capped) so a persistently-tied
  cheap row eventually wins instead of losing indefinitely.
- estimated phases: 1 (doc/rule-only, no template API change)
- conflicts: none.

## Promoted

(moves to the build plan via /oversight)

## Rejected

(kept for the record, with reasons)
