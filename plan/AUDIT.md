# Kit audit

> Last pass: 2026-10-25
> Pass count: 124
> Bias: none

## Pending

### [B, 5.6] README.md's "What you get" section has zero prose entry point for the secrets vault
- category: completeness
- impact: 7, ease: 8
- evidence: spec 42 shipped a full secrets subsystem — `npm run
  secrets` (status/set/import/names/check/push/audit/request/
  run/scan), a two-ring vault (`.env`/`.env.workspace`/OS
  keychain), sinks (gh/vercel/wrangler), a GUI vault panel —
  documented at `customization/secrets.md`. But README.md's
  customization-layer doc list (the prose rows for
  `data-layer.md`, `bootstrap-automation.md`, `branding.md`,
  `moderation-loop.md`, `hermetic-e2e.md`, `claude-code.md`)
  never names `secrets.md`, and that file is linked only from
  two narrow playbook asides (`playbooks/workspace.md:85`,
  `playbooks/new-project.md:670`'s gitignore note) — never
  from README prose. The only README mentions are generated
  file-tree code comments (lines ~494, 563, 749) and the
  generic "Customize per the docs in `customization/`" line
  (~780), neither of which an adopter scanning for features
  would read as feature discovery.
- next: add a bullet (or table row) to README's
  customization-layer doc list pointing at
  `customization/secrets.md`, or fold a one-line mention into
  the `/bootstrap` row (which already says "propagating
  secrets").

### [E, 2.1] bash-only syntax ($(...), heredocs, && chaining) survives in skills/ and templates/skills/ outside 52.3's scope
- category: adopter friction
- impact: 3, ease: 7
- evidence: 52.3 added a dualshell-syntax lint (`scripts/verify.mjs`
  leg `dualshell`, constant `SYNTAX_SCOPED_SKILLS`) scoped to the
  five git-procedure skills the 52 spec's "Skills run in PowerShell"
  bullet names (`skills/next/build.md`, `skills/next/land.md`,
  `skills/next.md`, `skills/plot.md`, `skills/tidy.md`, and their
  `templates/skills/` twins) — deliberately not the rest of `skills/`
  (`plan/52-fresh-repo-onboarding.md` chunk 52.3's own scoping note).
  Grepping every other skill's ```bash fences for the same bash-only
  shapes (`$(...)`, backtick substitution, a bare `VAR=value`
  assignment, `&&`/`||` one-liner chaining, a `<<` heredoc) finds real
  hits outside that scope: `skills/critique.md:5`
  (`scratch=$(mktemp -d)`), `skills/heads-down.md:2` (`git fetch
  origin && git show origin/main:plan/README.md`),
  `skills/iterate.md:6` and `skills/ship-a-chunk.md:27` (`git add
  <explicit> && git commit`), `skills/lessons-pr.md:1` (`git commit -m
  "$(cat <<'EOF' ...)"`, a heredoc inside a substitution),
  `skills/march.md:3-13` (`urgent=$(gh issue list ...)`,
  `unlabeled=$(gh issue list ...)`), `skills/reboot-ready.md:12`
  (`git stash create && git update-ref ...`), `skills/ship-a-chunk.md:2`
  (`issue_body=$(mktemp)`). Their `templates/skills/` twins carry the
  same shapes plus more: `bootstrap.md`, `moderate.md`,
  `reboot-ready.md`, `ship-migration.md` (an `&&`-chained `git add
  ... && git commit` line), `critique.md`, `expand.md`, `oversight.md`,
  `plan-a-spec.md`, `ship-a-chunk.md` (each a `git commit -m "$(cat
  <<'EOF' ... )"` heredoc-in-substitution), and `march.md`/`triage.md`
  (`export GH_TOKEN=$(awk ...)`, `export GH_REPO=$(awk ...)`). None of
  these are `/plot` or `/next` steps — they're mktemp scratch files, PR
  issue bodies and `gh` reads unrelated to the worktree-cutting
  incident 52 fixes — so widening the new lint's file list to them, as
  this chunk's build prompt weighed and rejected, would have forced
  rewriting all of it in one M chunk.
- next: a follow-up chunk either rewrites each shape (mktemp → a small
  node temp-file helper; `gh issue list ... --jq` → a small node
  script; the heredoc commit-message pattern → a node script that
  writes the message to a temp file and passes `git commit -F`) or,
  cheaper, adds `<!-- dualshell:posix-only -->` above fences with no
  PowerShell equivalent worth building, then widens
  `SYNTAX_SCOPED_SKILLS` (`scripts/verify.mjs`) to all of `skills/` +
  `templates/skills/` once they're clean.


## Done

### [x] [user-issue #40] [MED] apply phase 23's crash-alarm patch to nexus's own march.yml + night.yml by hand — closed 2026-10-21
- category: external-issue
- resolution: fixed in `8d21e16` — nexus's own `march.yml` and
  `night.yml` file the crash alarm with the run's `GITHUB_TOKEN`
  (not `ACTIONS_PAT`) and name the failed step, matching the
  template since `8dc2080`; `night.yml` gained `issues: write`.
  Applied from a local session, since cloud tokens can't push
  workflow files. Caught by this digest's refresh: the row sat
  in Pending four days past its close (the AUDIT.md header
  itself was already a day stale at the 2026-10-22 snapshot).

### [x] [user-issue #35] [MED] cloud push token still lacks workflows scope despite the 2026-08-23 re-mint — closed 2026-10-21
- category: external-issue
- resolution: phase 20 shipped as chunk 20.1 from a local
  session (archive `45b742c7..a1f5f127`, spec 20 complete). The
  underlying constraint still holds and stays documented in
  `agents.md` (Operational secrets): cloud ticks can't push
  `.github/workflows/*.yml` edits, so workflow-file changes land
  from a local session.

### [x] [user-issue #49] [MED] phase 32 blocked — same cloud push token workflows-scope gap as #35/#40 — closed 2026-10-21
- category: external-issue
- resolution: phase 32 shipped as spec 32 (32.1 and 32.2,
  `b6acc842..fe136587`) from a local session: heartbeat alarms
  once per unarmed scheduled workflow and checks cadence per
  workflow. Same documented constraint as #35 for workflow-file
  pushes.

### [x] [user-issue #88] [MED] fleet worktree creation can collide with a stale worktree registration ("already used by worktree") — cli 0.5.3
- category: external-issue
- impact: 6, ease: 3
- evidence: reporter's screenshot shows `git worktree add` failing
  with `fatal: 'nexus/polaris-1' is already used by worktree at
  'C:/Users/notrb/Workspace/.claude/mood-read/polaris-1'` while
  starting a session in a different project. Traced the GUI's
  worktree-creation path: `planPlace()`
  (`packages/cli/server/fleet.mjs:118-139`) picks the next free
  `n` by checking only that the candidate folder doesn't exist
  (`fs.existsSync`) and that `refs/heads/nexus/<name>-<n>` isn't
  already a branch in *this* repo — it never cross-checks the
  candidate branch name against `git worktree list`'s
  administrative entries. `formPlace()`
  (`packages/cli/server/fleet.mjs:148-176`) only runs `git
  worktree prune` when the *candidate's own* folder is missing,
  not when some other, unrelated administrative worktree entry
  still claims the same branch name. Git's own "already used by
  worktree" error fires from that stale administrative record,
  independent of whether the branch ref itself still exists —
  exactly the footgun `skills/reboot-resume.md:60-66` already
  documents and routes around for reboot/resume (`git worktree
  prune` before re-adding), but that workaround only runs on the
  resume path, not on ordinary new-session creation. A branch
  getting deleted (or its worktree folder moved/renamed, as the
  screenshot's `mood-read` vs. current-project mismatch suggests)
  without a `git worktree remove`/`prune` in between would leave
  exactly this kind of orphaned registration behind. Hypothesis,
  not yet reproduced locally — no access to the reporter's
  machine or a second project sharing a `.git`.
- next: have `formPlace` (or `planPlace`, before returning a
  candidate) run `git worktree prune` unconditionally before the
  existence/ref checks, not only in the "candidate folder
  missing" branch — cheap and idempotent, and it would absorb
  this exact class without needing the deeper "why did the old
  registration survive" root cause. Confirm with a repro: `git
  worktree add` a folder, delete the folder without `remove`, and
  try `planPlace`/`formPlace` again for the same name.
- fix: cli 0.5.3. Reproduced the real path: a GUI session's ledger `worktree`
  is rewritten to a chunk worktree by `ledger.mjs beat --set worktree=`
  (skills/next/build.md); once that chunk lands and its folder goes, a
  pick-up re-adds the session branch there, and git refuses because the
  branch is still checked out at the session's live home. `formPlace`
  (`packages/cli/server/fleet.mjs`) now prunes unconditionally and, when
  the branch is already checked out in a folder that exists
  (`branchHome`), works there (`moved`) instead; the server points the
  session and its ledger at it. Test: `test/repair.test.mjs` (#88).

### [x] [user-issue #86] [MED] oversight's "needs attention" badge doesn't decrement after all questions are answered and sent — cli 0.5.3
- category: external-issue
- impact: 6, ease: 4
- evidence: reporter answered all 7 pending oversight questions
  and sent them, but the GUI's notification count never went
  down. Traced the badge logic: `packages/cli/src/App.jsx:129-131`
  computes it from `useInbox()`'s `GET /api/inbox` poll (every
  5s, `packages/cli/src/data/hooks.js:142`), which merges live
  asks/permissions with `planQuestions()` →
  `repoMod.durableQuestions(repo)`
  (`packages/cli/server/repo.mjs:208-253`) — a fresh regex scan
  of `plan/**/*.md` on every call, with no "answered" state of
  its own. A row only drops out once `settledItem()`
  (`repo.mjs:228-233`) sees it struck, `[x]`, or replaced with
  "Settled/Decided/Answered/Resolved/Done/None" text in the
  markdown. But the GUI's "Send" action
  (`server.continueAnswers` → `POST /api/oversight/answer`) only
  delivers the kept answers as one chat message to a target
  session — it never itself edits the plan file. So "answered
  and sent" in the UI means "delivered to a session's inbox,"
  not "resolved in the plan": if that session is idle, busy, or
  just hasn't acted on the message yet, the `[needs-user-call]`/
  Open-questions rows stay unstruck and the badge keeps counting
  them on every 5s poll, even though the user did everything the
  UI asked of them.
- next: close the state gap between "sent" and "resolved" —
  either have the badge (or the answered item itself) show a
  distinct "sent, awaiting session" state instead of counting it
  as still-open, or have `continueAnswers` optimistically mark
  the row settled in the GUI's local view until the plan file
  catches up. Needs a GUI-side fix in `packages/cli`; no spec
  currently owns oversight's inbox/badge plumbing.
- fix: cli 0.5.3. Still live past the first CLI: the screen counted kept
  answers as done, the App badge did not. `GET /api/inbox` now marks a
  plan question `settled` (`kept` or `sent`) when `.nexus/answers.json`
  holds an answer for its current words (`inboxItems` `kept`), and the
  badge and Heads-down skip it. Test: `test/fleet-home.test.mjs` (#86).

### [x] [A, 4.5] README's Hard Rule #6 claims pre-spec.md is "the one carve-out" outside /oversight+/bootstrap, but skills/lessons-pr.md documents a second, already-shipped one — this commit
- category: doc-drift
- impact: 5, ease: 9
- evidence: `README.md:650-657` (introduced by commit
  `a5bd02f`, 4 days old) said "Once a skill is running,
  `AskUserQuestion` is allowed only in `/oversight` and
  `/bootstrap`"... and `pre-spec.md`'s interview "is the one
  carve-out outside this list." But `skills/lessons-pr.md`:57-61
  §3 (predates that commit) explicitly documents its own
  AskUserQuestion carve-out: "allowed at the planning step
  only... This is the same carve-out
  [`../playbooks/pre-spec.md`] has." That's a second
  already-shipped exception the absolute "the one" phrasing
  didn't account for. The same root claim recurred in
  `concepts/architecture.md`:352 ("`bootstrap` is the one named
  exception"), `concepts/asking-well.md` (header blockquote
  lines 3-9, the standing-rule quote, and "Where this is used
  today"'s "narrower of the two skill-level exceptions"),
  `playbooks/pre-spec.md`:41 (quotes the same standing rule),
  and two nexus-self-only mentions — `agents.md`:119 and
  `skills/oversight.md`:3, both "the only skill that asks."
- fix: reworded all seven to name both carve-outs (`/bootstrap`
  and `/lessons-pr`) explicitly, and added a `skills/lessons-pr.md`
  row to `asking-well.md`'s "Where this is used today" list.
  `templates/agents.md`:141 and the other `templates/` copies
  of this rule (fixed by the prior `a5bd02f` HIGH-row commit)
  were deliberately left untouched: `lessons-pr.md` has no
  `templates/` counterpart (confirmed by a 2026-09 AUDIT tick —
  it's a nexus-self-only meta-skill), so an adopter's copy
  never sees the second exception and the templated wording
  stays accurate as written.

### [x] [F, 3.6] three templates/scripts/*.mjs header comments still say "Node >=18" against the reconciled 20+ floor — this commit
- category: freshness
- impact: 4, ease: 9
- evidence: `templates/scripts/refresh-critique-session.mjs:22`,
  `templates/scripts/stack-lifecycle.mjs:14`, and
  `templates/scripts/check-secrets-liveness.mjs:18` each read
  "Zero dependencies, ESM, Node >=18." Commit `a8e1e1a`
  (2026-10-08) reconciled `package.json`'s `engines.node` from
  `>=18` to `>=20` after `f348e7e` fixed the same drift in
  `playbooks/new-project.md`/`existing-project.md`, but that
  sweep only grepped prose docs and `package.json`, missing
  these three comment headers inside scripts that ship directly
  into adopter repos (`agents.md` rule 7: templates are the
  product). Node 18 reached EOL in April 2025, so the comment
  as written claims support for an end-of-life runtime,
  contradicting both CI (`node-version: 20`/`22` in
  `march.yml`/`night.yml`) and the kit's own stated floor.
- fix: changed all three comments to "Node >=20."

### [x] [A, 3.6] playbooks/pre-spec.md restates the AskUserQuestion carve-out using only "/oversight," omitting "/bootstrap" — this commit (closes #74)
- category: doc-drift
- impact: 4, ease: 9
- evidence: `playbooks/pre-spec.md:41` ("Nexus's standing rule
  is 'skills decide; only `/oversight` asks.'") and `:48` ("the
  no-AskUserQuestion-outside-`/oversight` rule kicks back in")
  both state the rule with one carve-out. The actual rule,
  correctly stated with both carve-outs, lives at
  `README.md:650` ("allowed only in `/oversight` and
  `/bootstrap`") and `concepts/asking-well.md:8-9` ("only
  `/oversight` and `/bootstrap` ask"). Commit `a5bd02f` (prior
  cycle) fixed README's Hard Rule #6 to acknowledge pre-spec.md's
  own carve-out but never touched pre-spec.md's own two
  mentions, which still undersold the rule to a reader who
  starts here.
- fix: reworded `pre-spec.md:41` to name both `/oversight` and
  `/bootstrap`; simplified `:48`'s mention to point back at the
  first statement instead of repeating a long hyphenated
  compound (which also wrapped badly at this doc's line width).

### [x] [A, 3.6] package.json's engines.node still said ">=18", contradicting the just-reconciled Node 20+ floor — this commit
- category: doc-drift
- impact: 4, ease: 9
- evidence: commit f348e7e reconciled `playbooks/new-project.md`
  and `playbooks/existing-project.md` to both say "Node 20+" (one
  previously said ">=18"). `package.json:13`'s
  `"engines": { "node": ">=18" }` was never touched in that fix
  and still contradicted the reconciled floor — also inconsistent
  with `.github/workflows/march.yml` and `night.yml`, which both
  pin `node-version: 20`/`22`, never 18.
- fix: changed `package.json`'s `engines.node` to `">=20"`.

### [x] [user-issue #67] [LOW] heartbeat's "march has flatlined" alarm fired on a stale `gh run list` read, not an actual gap — this commit (closes #67)
- category: external-issue
- closed: own `next` said "safe to close on inactivity if it
  doesn't recur." Checked `gh issue list --search "heartbeat
  flatlined"` this tick (2026-10-04): no new heartbeat-flatlined
  issue since #67 itself (2026-09-30) — 4 days and dozens of
  march ticks (visible in this file's own log and `git log`)
  with no recurrence. Confirmed non-reproducible one-off, closed
  per its own documented exit condition.

### [x] [user-issue #54] [LOW] cloud march tick crashed on a transient Bun-download 504, not a code defect — this commit (closes #54)
- category: external-issue
- closed: own `next` said "close if it doesn't recur." Checked
  `gh issue list --search "crashed"` this tick (2026-10-04): the
  only other open crash-alarm issue is unrelated (#40, a
  follow-up task, not a crash report); every actual
  "cloud march tick crashed" issue since #54 (2026-09-07) has
  been none — nearly a month of normal cadence with zero
  recurrence of the Bun-install 504. Confirmed third-party CDN
  transient, closed per its own documented exit condition.

### [x] [F, 2.4] templates/setup/bootstrap.example.json ships a model id with no "ids age" hedge anywhere nearby — this commit (closes #72)
- category: freshness
- impact: 3, ease: 8
- evidence: `templates/setup/bootstrap.example.json:49` —
  `"model": "claude-sonnet-5"` inside the
  `optional_services.anthropic` block. The file's own
  `_help.schema_doc` (line 7) points to
  `customization/bootstrap-automation.md` for field descriptions,
  but that doc never documents or hedges this field. Every other
  live model-id mention in the repo carries an inline "ids age —
  check `/model`" caveat per `bearings.md` decision 5; this was the
  one unhedged live mention found repo-wide.
- fix: added a `"_note"` key near the `anthropic` block hedging
  the model id.

### [x] [A/B, 2.4] customization/bootstrap-automation.md quotes three playbooks as ending with text they don't contain — this commit
- category: doc-drift
- impact: 4, ease: 6
- evidence: `customization/bootstrap-automation.md:443-448`
  claimed `playbooks/pre-spec.md` "ends with: 'now run
  `/bootstrap`.'" (actual ending is a "See also" list, no
  `/bootstrap` mention), `playbooks/new-project.md` "ends with:
  'Day-1 checklist passed → run `/bootstrap`.'" (actual last line,
  `new-project.md:697`, is "invoke `/ship-a-phase` for the first
  time"; `/bootstrap` only appears mid-document at §9), and
  `playbooks/existing-project.md` "ends with: 'overlay applied →
  run `/bootstrap status`...'" (actual ending is a 9-item "You're
  ready when" checklist, no bootstrap mention). The fourth bullet
  in the same list (cloud-loop.md's `/bootstrap cloud-loop` note)
  was accurate — only these three were invented quotes.
- fix: corrected the three playbook-ending quotes in
  `bootstrap-automation.md:443-448` to match reality.

### [x] [C, 3.6] templates/skills/jot.md cites the wrong iterate.md section for the +0.5 user-source bump — this commit (closes #70)
- category: link-hygiene
- impact: 4, ease: 9
- evidence: `templates/skills/jot.md:9` read "user-source
  findings carry a `+0.5` score bump — see `iterate.md`
  §Scoring)." But in `templates/skills/iterate.md` the bump is
  documented under `### User-source bump (from `/jot`)` at line
  39; `### Scoring` (line 112) is a later, unrelated subsection
  covering only the generic impact×ease formula. Following the
  citation literally landed a reader in the wrong subsection.
- fix: changed `§Scoring` to `§User-source bump` at
  `templates/skills/jot.md:9`.

### [x] [A, 4.5] customization/moderation-loop.md miscites its own prerequisite checklist item number — this commit
- category: doc-drift
- impact: 5, ease: 9
- evidence: `customization/moderation-loop.md:263` and `:318`
  both cited "Level 4 pre-flight item 8" for the UGC mod-drain
  confirmation. But `intervention-spectrum.md`'s own numbered
  checklist (lines 207-224) has that content at item **9**; item
  8 is the unrelated runbook-checklist item, whose own doc
  (`customization/external-services.md:296,313`) correctly
  self-cites "item 8" for that content. A reader working the
  Level 4 pre-flight checklist could tick "item 8 verified"
  against the wrong prerequisite and silently skip confirming the
  moderation queue actually drains.
- next: change "item 8" to "item 9" at both
  `moderation-loop.md:263` and `:318`. Done.

### [x] [A, 3.5] agents.md + .github/CLOUD_LOOP.md assert cloud ticks "can push `.github/workflows/` edits themselves" despite three confirmed failures — this commit (closes #69)
- category: doc-drift
- impact: 5, ease: 7
- evidence: `agents.md`'s `ACTIONS_PAT` bullet and
  `.github/CLOUD_LOOP.md` setup step 3 both describe the
  2026-08-23 Workflows-scope grant as a solved capability. But
  this file's own Pending block (`[user-issue #35]`, `#40`,
  `#49`) documents three independent confirmed failures of
  exactly that — phase 20 (same day as the grant), then #40,
  then #49 — all blocked because the Claude Code Action's own
  GitHub App installation token overrides the configured
  `ACTIONS_PAT` credential specifically for
  `.github/workflows/*.yml` pushes. `.github/CLOUD_LOOP.md`'s
  "When something breaks" section listed five other failure
  modes but omitted this, the most-evidenced recurring one in
  the whole pending queue.
- fix: added a caveat to `agents.md`'s `ACTIONS_PAT` bullet and
  `.github/CLOUD_LOOP.md` setup step 3 pointing at the three
  confirmed failures and the "apply from a local `/oversight`
  session" workaround, plus a new bullet in `.github/
  CLOUD_LOOP.md`'s "When something breaks" section describing
  the symptom (`git push` rejected on a workflow-file edit
  despite the PAT's scope) and the same workaround.
- source: audit (fresh A-G sweep, delegated to a research
  subagent; verified directly before shipping)

### [x] [A, 4.5] customization/moderation-loop.md's /march dispatch illustration omits /expand — this commit
- category: doc-drift
- fix: added "expand due + bold/autonomous posture -> expand"
  as step 6 to the dispatch illustration
  (customization/moderation-loop.md), renumbering "else ->
  iterate" to step 7 - matching templates/skills/march.md's own
  dispatch order (triage -> critique -> phase -> data -> expand
  -> iterate). Same defect class fixed two days prior in
  concepts/architecture.md's Layer 2 list (commit 9fd21c0),
  which never touched this second, independent illustration.

### [x] [user-issue #63] [MED] critique's dry-run sub-agent overstepped its scope and shipped commit 0cdb345 without the required Cloud-Run trailer — this commit (closes #63)
- category: external-issue
- impact: 4, ease: 6
- evidence: `skills/critique.md` step 3 already scopes the
  delegated sub-agent to steps 3-5 only (stage, walk,
  self-assess) and reserves step 6 (append findings to
  `plan/CRITIQUE.md`) and step 7 (commit + push) for the
  dispatching agent, precisely so cloud-mode trailer discipline
  never depends on a sub-agent prompt the parent doesn't fully
  control. During the 2026-09-24 cloud tick, the delegate
  overstepped anyway: it appended findings to
  `plan/CRITIQUE.md` itself and committed + pushed directly
  (0cdb345, "critique: pass 20 — 2 findings (0 high, 1 med, 1
  low)") before returning control to the parent. Because that
  commit was authored outside the dispatching agent's control,
  it is missing the `Cloud-Run: <run-url>` trailer
  `.github/CLOUD_LOOP.md` rule 6 requires of every commit
  shipped during a cloud tick — so it silently won't count
  toward the cloud-run ceiling. The issue reporter spot-checked
  both findings in 0cdb345 against their cited file:line
  evidence and confirmed the content itself is legitimate; this
  is a pure process/gate gap, not a content defect. Amending or
  force-pushing a published commit is against `agents.md` rule
  5, so 0cdb345 stands as-is.
- fix: `skills/critique.md` step 3 now spells out the literal
  sentence the dispatching agent's `Agent(...)` prompt must
  carry verbatim — "Do not write to plan/CRITIQUE.md. Do not
  run git commit or git push. Return findings only; the
  dispatching agent handles steps 6 and 7." — closing angle (1)
  of the two independent fixes this row proposed. Angle (2) (a
  mechanical Cloud-Run trailer check) remains available as a
  follow-up if this recurs.

### [x] [5.6] phase 24's pulse.mjs fix landed for nexus-self, never ported to the adopter templates — this commit
- fix: `templates/scripts/pulse.mjs`'s own header comment says
  it exists so `/oversight`, `/oversight audit`, and `/digest`
  stop hand-deriving the same numbers — but only `skills/*.md`
  (this repo's own copies) were ever wired to call it;
  `templates/skills/oversight.md` and `templates/skills/
  digest.md` (what adopters actually get) still hand-counted
  build-plan/AUDIT/CRITIQUE/candidate rows. Ported `skills/
  oversight.md`'s item-0 read and `skills/digest.md`'s
  pulse.mjs bullet into their `templates/` counterparts
  (§3 item 0 and the quick-reference in oversight.md; the
  "Gather the pulse" step and quick-reference in digest.md),
  and added `Bash(node scripts/pulse.mjs:*)` to both
  `.claude/settings.json` and `templates/claude/settings.json`
  allowlists — it was missing from both, so even a manual
  invocation tripped an avoidable permission prompt.
- other findings this sweep, left unshipped (below threshold
  vs. the one above, or lower-value cleanups for a future
  tick): bare `sed -i` recurrence in `playbooks/new-project.md:613`,
  `playbooks/workspace.md:136`, `customization/external-services.md:195`
  (BSD/macOS sed swallows the next token as backup suffix,
  same bug already fixed once elsewhere — score 5.4);
  `templates/skills/ship-asset.md:95` cites a `bearings.md`
  "§3" that's actually §2 (score 2.7); Title Case leaking into
  four sentence-case sub-headings in
  `templates/setup/NN_service.md` +
  `customization/external-services.md` (score 1.6); possibly
  invented "Anthropic moderation API" product name in
  `templates/skills/moderate.md:52` +
  `customization/moderation-loop.md:123`, unverified against
  current offerings (score 2.4, PLAUSIBLE not CONFIRMED).

### [x] [E, 4.8] bare `sed -i` recurrence in three doc one-liners — this commit
- category: adopter friction
- impact: 6, ease: 8
- evidence: `playbooks/new-project.md`'s main placeholder
  one-liner already carries a documented BSD-sed fix (stock
  macOS `sed` requires a backup-suffix argument or misparses
  the next token and errors out) using `-i.bak` + a cleanup
  `find`. Three sibling one-liners never got the same fix:
  `playbooks/workspace.md:136` (`<WORKSPACE_ORG>` sweep),
  `customization/external-services.md:195` (`setup/00_files.md`
  copy-and-sweep), and `playbooks/new-project.md:613`
  (`setup/bootstrap.local.json` sweep) — flagged once before
  (previous tick's Done note, above) and left for a future
  tick; this is that tick.
- fix: all three now use `sed -i.bak ... && rm -f <file>.bak`
  (or the existing `find . -name '*.bak' -delete` idiom where
  multiple files are swept), matching the established pattern.
- other findings this sweep, left unshipped (one-fix-per-tick):
  `templates/skills/ship-asset.md:95`'s `bearings.md` "§3"
  miscite (actually §2, score 2.7) and the possibly-invented
  "Anthropic moderation API" naming in `templates/skills/
  moderate.md` + `customization/moderation-loop.md` (score 2.4,
  PLAUSIBLE) — both moved to Pending above for a future tick.

### [x] [C, 2.7] templates/skills/ship-asset.md:95 cites the wrong bearings.md section number — this commit
- category: link + tree hygiene
- impact: 3, ease: 9
- evidence: `templates/skills/ship-asset.md:95` read "read
  `plan/bearings.md`'s `Surface:` line per §3", but
  `templates/plan/bearings.md`'s headings run `## What we're
  building` (§1), `## Surface` (§2), `## Auth` (§3) — Surface
  is §2, not §3.
- fix: changed "§3" to "§2" in ship-asset.md:95.

### [x] [F, 2.4] templates/skills/moderate.md and customization/moderation-loop.md name a nonexistent "Anthropic moderation API" — this commit (closes #64)
- category: freshness
- impact: 4, ease: 6
- evidence: `templates/skills/moderate.md:51-52` and
  `customization/moderation-loop.md:123` both listed AI
  pre-filter options as "OpenAI moderation endpoint, Anthropic
  moderation API, or a local classifier," and
  `moderation-loop.md:286`'s placeholder token spelled it
  `anthropic:moderation` as if it were a real, distinct
  endpoint. Reproduced unchanged from the 2026-09-25 (second)
  sweep; confirmed CONFIRMED on reverify — Anthropic still ships
  no standalone moderation endpoint the way OpenAI does,
  moderation via Claude is a prompted classification call on the
  standard Messages API. Widened scope during the fix: the same
  invented `anthropic:moderation` placeholder token also appears
  in `templates/plan/bearings.md:185`, the actual adopter-facing
  bearings template — not cited in the original finding, but
  same root cause and same public-API surface (`agents.md` rule
  7).
- fix: reworded both prose mentions to "a prompted Claude
  classification call"; both placeholder-token spots
  (`moderation-loop.md:286`, `templates/plan/bearings.md:185`)
  now read `claude:prompted-classifier` instead of
  `anthropic:moderation`.

Cloud tick 2026-10-07: header ~20h old (last full sweep the
2026-10-06 tick, `db6952b` at 23:43:39Z), under the 24h
threshold, so re-scored rather than re-swept. This block's own
Pending rows are the same three durable `[user-issue #40/#35/
#49]` entries (impact 4 x ease 2 / 10 = 0.8 each, still blocked
on the cloud-push-token workflows-scope gap). `plan/CRITIQUE.md`'s
Pending queue held two fresh MED rows from critique pass 24
(commit `8b606c2`, same day), both well above 0.8: shipped the
cheaper, more confidently-scoped one — `playbooks/new-project.md`'s
self-contradicting Node floor ("20+" at line 40 vs "≥18" at
250-251) — over the README Hard-Rule-6/pre-spec cross-reference
gap, which needs a more careful wording call. Widened the fix to
`playbooks/existing-project.md:134`'s identical stale "Node ≥18"
phrasing, same root cause, no local contradiction but the same
drift from the kit's actual 20+ floor. `node scripts/verify.mjs`
green (all seven legs). Not a fresh A-G sweep; the three durable
rows and the remaining CRITIQUE MED row are unchanged and still
Pending.

Cloud tick 2026-10-09: no pending build-plan phase (all rows `[x]`
or `[blocked: ...]`); critique gate not due (8 commits / ~2 days
since pass 24, both under threshold); expand gate not due (pass 20
ran this same day, 0 commits/0 days since). `plan/CRITIQUE.md`'s
Pending queue confirmed empty. This block's three durable rows
(`[user-issue #40]`, `[#35]`, `[#49]`) stay blocked on the same
cloud-push-token workflows-scope gap, score 0.8 each. Header was
the 2026-10-08 digest tick's sweep (now >24h old), so delegated a
fresh A-G sweep to a research agent to protect context. Found one
new row, shipped this tick (above): `[F, 3.6]` — three
`templates/scripts/*.mjs` header comments still read "Node >=18"
against the floor `a8e1e1a` (two ticks ago) reconciled to `>=20`
everywhere else grepped, because that fix's sweep only covered
prose docs and `package.json`, not script-header comments. Rest
of the sweep clean: verify.mjs green throughout (links 284/284,
tree 199 entries/59 reverse-checked, discover 30 docs, placeholders
549 tokens, anatomy 25/25, emoji 146 files, dualshell 11 blocks);
all external links 200; README/templates-README trees match disk
both directions; placeholder table matches both bash/PowerShell
one-liners key-for-key; model ids current and hedged; G still
empty (no sibling lessons files reachable on disk). The three
durable rows and no other Pending rows remain.

Cloud tick 2026-10-14: no pending build-plan phase (all rows
`[x]` or `[blocked: ...]`); triage gate clear (0 urgent, 0
unlabeled); critique gate not due (0 commits / ~11h since pass
26); expand gate not due (2 commits / ~1 day since pass 21,
posture `bold` needs 20 commits or 7 days). Header is >24h old
(2026-10-12) but `plan/CRITIQUE.md`'s sole Pending row — the
MED "Three paths to start" diagram routing an existing-code
repo into `pre-spec.md`, which then disqualifies that exact
case (pass 26, `4814b91`) — scored well above this block's three
durable rows (0.8 each) and the low-confidence D/A row (2.7) on
impact×ease alone (MED impact 5-7 × a doc-only two-file fix),
so shipped it without a fresh A-G sweep rather than spend the
tick re-deriving a lower-value pick. Applied the row's suggested
fix (a): `README.md`'s mermaid diagram now gates on "Existing
repo with code?" immediately after the "no, but I have a pitch"
branch, before `pre-spec.md`, so "no spec, existing code" routes
straight to `existing-project.md`; only "no spec, no code" still
reaches the interview. `node scripts/verify.mjs` green (all
seven legs, 286 links). CRITIQUE row moved Pending → Done. The
three durable rows and the D/A row remain Pending; no other
findings surfaced this tick.

### [x] [F, 4.5] four model-id mentions still cite the prior "Opus 4.8" / "claude-haiku-4-5" lineup against the current Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.1 lineup — this commit
- category: freshness
- impact: 5, ease: 9
- evidence: `templates/.github/CLOUD_LOOP.md`:36 and :233 both
  said "Opus 4.8"; `customization/data-layer.md`:525's example
  comment used `"claude-opus-4-8"`; `templates/claude/agents/
  generic-specialist.md`:5 used `claude-haiku-4-5`. All four
  already carried the standing "ids age — check `/model`" hedge.
- fix: bumped "Opus 4.8" → "Opus 5.5" in both `CLOUD_LOOP.md`
  lines, `claude-opus-4-8` → `claude-opus-5-5` in
  `data-layer.md`:525, and `claude-haiku-4-5` →
  `claude-haiku-5-5` in `generic-specialist.md`:5 — hedge
  comments left verbatim, value swap only, exactly as the row's
  `next` prescribed. Widened scope during the fix: a fifth,
  previously-unflagged mention of the same stale id —
  `templates/.github/workflows/march.yml`:145's comment
  (`claude-opus-4-8 once you've measured a week of weekly-cap
  consumption`) — shares the same root cause and the same
  public-API-adjacent surface (a template file), so it was
  bumped to `claude-opus-5-5` too. Confirmed no matching gaps in
  nexus's own root `.github/workflows/march.yml` or
  `.github/CLOUD_LOOP.md` (grep clean).

Cloud tick 2026-10-14 (second): no pending build-plan phase;
triage gate clear (0 urgent, 0 unlabeled); critique gate not due
(3 commits / ~8h since pass 26); expand gate not due (pass 22
ran this same day, 0 commits/0 days since). Header <24h old
(updated by the prior tick this morning), so re-scored rather
than re-swept. This block's Pending rows were the three durable
`[user-issue #40/#35/#49]` (0.8 each, blocked on the cloud
push-token workflows-scope gap, needs a local session) and
`[D/A, 2.7, low confidence]` (new-project.md's phase-count
hedge, flagged low-confidence/possibly-deliberate) — but the
night shift's digest tick had already queued a higher scorer,
`[F, 4.5]` (model-id lineup drift), above both. Shipped that one
(above) rather than the blocked or low-confidence rows. `node
scripts/verify.mjs` green (all seven legs, 286 links, 549
placeholder tokens). The three durable rows and the `[D/A, 2.7]`
row remain Pending; no other findings surfaced this tick.

Digest tick 2026-10-19: header was 5 days old (last full sweep
2026-10-14's second tick, above), well past the 48h threshold,
so ran a fresh A-G sweep (delegated the read-only pass to a
foreground agent to protect context). All three durable rows
confirmed still `OPEN` via `gh issue view` (`#40`, `#35`, `#49`)
— same `ACTIONS_PAT` workflows-scope gap, unchanged. Reproduced
`[D/A, 2.7, low confidence]` unchanged: `playbooks/
new-project.md:705` ("Common pitfalls") still says "Aim for
12-17" against lines 15/228/744's "10-20 phases total" — still
flagged low-confidence, possibly deliberate tighter practical
guidance rather than drift. `node scripts/verify.mjs` green
(links 286, tree 199 entries/59 reverse-checked, discover 30
docs, placeholders 549 tokens, anatomy 25/25, emoji 146 files,
dualshell 11 blocks). Fresh whole-tree grep for stale model-id
patterns (`Opus 4.x`/`Haiku 4.x`/`Sonnet 4.x`/`claude-opus-4-*`
etc.) hit only historical log prose in this file, `plan/
DIGEST.md`, and `plan/PHASE_CANDIDATES.md` — zero live-doc
hits. G still empty — no `../kintilla`, no `NEXUS_LESSONS.md`
anywhere on disk in this checkout. A clean sweep: no new rows
found this pass. Separately (not an AUDIT finding, logged here
for continuity): this window also saw a four-day cloud outage,
2026-10-15 through 2026-10-19, 14 consecutive `march` ticks and
4 consecutive `night` ticks failing on `api_error:
usage_limit_reached` (the account's weekly usage quota, not a
transient rate limit) — self-reported as issues `#76`/`#77`/
`#78`, all triaged and closed by the first clean tick after the
quota's stated 2026-10-19 08:00 UTC reset. Not a kit bug, no
AUDIT row filed; full account in `plan/DIGEST.md`'s 2026-10-19
entry. Audit only — shipped nothing, per `skills/digest.md`
rule 2. The three durable rows and `[D/A, 2.7]` remain Pending,
unchanged.
