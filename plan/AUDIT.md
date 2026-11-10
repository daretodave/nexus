# Kit audit

> Last pass: 2026-11-08
> Pass count: 127
> Bias: none

## Pending

### [user-issue #96] [HIGH] [needs-user-call] heartbeat: march realized cadence below 40% — recurs after #91's close (hourly cron already off :00)
- category: external-issue
- evidence: opened 2026-11-06T19:23:23Z by the workflow token;
  body reports 4 of 30 promised hourly slots ran in 30h (13%).
  Cron is already `17 * * * *` (off minute :00 — the fix #91
  recommended and the owner applied in `79980b2`). `gh run list
  --workflow march --event schedule -L 20` this tick still shows
  irregular multi-hour gaps between hourly-promised firings
  (e.g. 2026-11-04 and 2026-11-02 each show 6-11h gaps), so the
  throttling is real under the hourly preset, not a stale alarm.
  This tick's `support.mjs sla` flagged #96 past `sla_hours`
  with no Asap line naming it; `/plot asap` is the written
  next step (`skills/march.md` Step 1.5), but its own Step 1
  failure mode applies first (`skills/plot.md` §5: "needs an
  owner's call before it can be shaped" — ask, or under a loop
  park in `/oversight` and stop), since the fix is a
  workflow-file push no cloud tick can land.
- next: #91's close already named the only remaining lever — a
  slower cadence preset (fewer promised slots for GitHub to
  drop) — as an owner call, not a loop fix (nexus runs its own
  cadence in place from the template:
  `node templates/scripts/cloud/cadence.mjs apply <preset>
  --march .github/workflows/march.yml --heartbeat
  .github/workflows/heartbeat.yml --write`, a local session
  only — `.github/CLOUD_LOOP.md` "Cadence preset",
  `agents.md` Operational secrets). Watch for further
  recurrence; close if the schedule recovers on its own.


### [C, 2.4] identity/footguns.md:10 links to a README.md anchor that doesn't exist in its target
- category: link + tree hygiene
- impact: 3, ease: 8
- evidence: `identity/footguns.md:10` carries
  `[README.md](README.md#footguns-the-ladder)`, resolving to
  `identity/README.md` — which has one heading and no
  `## Footguns: the ladder` section; the line was copied
  verbatim from `templates/identity/footguns.md:10`, whose own
  `templates/identity/README.md:49` does carry a matching
  heading. nexus's self-hosted `identity/README.md`
  deliberately condensed that content into a table row
  instead, orphaning the anchor. The verify gate's `links` leg
  doesn't catch this (`scripts/verify.mjs:231/233` strips any
  `#anchor` suffix before checking file existence).
- next: either restore a `## Footguns: the ladder` heading in
  `identity/README.md`, or drop the `#footguns-the-ladder`
  fragment from `identity/footguns.md:10`'s link.

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

### [A, 39.11] nexus's own `.github/workflows/*.yml` still pin `actions/checkout@v4` / `actions/setup-node@v4`, now behind the just-bumped `templates/` copies
- category: doc-drift
- impact: 5, ease: 6
- evidence: chunk 39.11 (2026-11-05, this run) bumped every
  `actions/checkout@v4` and `actions/setup-node@v4` under
  `templates/.github/workflows/` and `templates/.github/actions/`
  to `@v5` (GitHub deprecating the Node 20 runtime both majors
  ran on). Root `.github/workflows/{cli-ci,heartbeat,march,night,
  nudge,pr-flow,publish,scripts-ci}.yml` still pin `@v4` — left
  untouched because a cloud tick's token can't push
  `.github/workflows/*.yml` (`agents.md` "Operational secrets").
  One pair is tighter than drift: `nudge.yml`'s `workflows` gate
  leg (`scripts/verify.mjs`'s `nudgeCheck`) requires the root and
  template copies byte-identical past a path substitution, so its
  `checkout@v4` had to stay pinned in the template too (reverted
  mid-chunk; `identity/footguns.md`'s `nudge-twin-version-bump`
  line) — it can only move to `@v5` together with the root copy.
- next: a local session bumps every root workflow's
  `checkout`/`setup-node` to `@v5` (pushing `.github/workflows/`
  needs a human token), syncing `nudge.yml`'s pair at the same
  time so the twin check stays green.

### [loop] [HIGH] motion stalled in 2026-W44: 25 shipped against a 4-week baseline of 153.25
- category: loop
- impact: 8
- ease: 5
- evidence: node scripts/pulse.mjs --motion: shipped 25 / baseline 153.25 · 2026-W44 against 2026-W40..2026-W43 (8 so far in 2026-W45); floor 76.63 · stalled (25 is under 50% of the baseline).
- next: /iterate: find what keeps the loop from shipping (no ready chunk, a silted candidates queue, a lock with no fallback) and move it: build the top Pending row, ask /oversight to promote a candidate, or name the plan/bearings.md lever (Motion floor, stall_action, Promote) to retune.
- generator: motion · filed 2026-11-06

## Done

### [x] [user-issue #102] [MEDIUM] settle.mjs: closing a ladder spec's last chunk never writes its ARCHIVE "spec complete" line — plotted 63.1
- category: external-issue
- resolution: plotted as spec 63
  ([63-settle-ladder-archive-line.md](63-settle-ladder-archive-line.md)),
  chunk 63.1, Asap lane, ending (#102) — past `sla_hours` with
  no Asap line naming it (`skills/march.md` Step 1.5).

### [x] [A, 3.6] plan/bearings.md's locked Stack table still said "Node ≥18", three ticks after the floor moved to 20+ — this commit
- category: doc-drift
- impact: 4, ease: 9
- evidence: `plan/bearings.md:31` — `| Scripts | Node ≥18, zero
  dependencies, ESM `.mjs` | ... |` — in the "Stack (locked)"
  table, which the file's own header calls "law."
  `package.json:21` reads `"node": ">=20"`;
  `.github/workflows/march.yml`/`night.yml` pin node-version
  20/22/24. Three prior AUDIT Done rows (script headers,
  package.json, playbooks) already reconciled every other
  "Node ≥18" mention to 20+ — this table cell was never swept
  because none of those fixes grepped `plan/bearings.md`.
  Repo-wide grep confirms it's the only remaining stale
  mention.
- fix: changed `plan/bearings.md:31`'s "Node ≥18" to "Node
  ≥20".

### [x] [B, 4.2] `templates/scripts/__tests__/design-render-run.test.mjs` runs in no gate at all — this commit (closes #101)
- category: completeness
- impact: 6, ease: 7
- evidence: chunk 39.11's builder (2026-11-05, this run), while
  tightening `templates/README.md`'s per-test gate-cost notes,
  found every other `templates/scripts/__tests__/*.test.mjs` file
  listed in `scripts/verify.mjs`'s `PURE_SUITES` or `GIT_SUITES`
  (the `scripts` leg) except this one — it only runs if someone
  invokes it by hand. Its sibling `design-render.test.mjs` (the
  pure half) is wired; this Chrome-spawning `-run` half is not.
- fix: added `templates/scripts/__tests__/design-render-run.test.mjs`
  to `scripts/verify.mjs`'s `GIT_SUITES` (it already self-skips
  without a local Chrome, matching `ui-walk-run.test.mjs`'s
  pattern), so the `scripts` leg now exercises it.

### [x] [H, 5.6] / @ desktop (fleet-to-tug) — console error: "Failed to load resource: the server responded with a stat..." — this commit (closes #100)
- category: ui
- impact: 7
- ease: 8
- evidence: console error "Failed to load resource: the server responded with a status of 404 (Not Found) (/favicon.ico)", and on 2 more screens; fleet-to-tug--desktop--fleet.png; .scratch/walk/2026-11-06T01-35-51-943Z/walk.json
- generator: ui-walk · filed 2026-11-06
- fix: `packages/cli/src/index.html` never declared a
  `<link rel="icon">`, so every browser's automatic favicon
  probe 404s on every screen. Added
  `packages/cli/src/public/favicon.svg` (the app's own
  fleet-grid glyph: ink-900 background, aurora-cyan stroke,
  matching `icon-paths.js`'s `fleetRound`) and the `<link
  rel="icon" type="image/svg+xml" href="/favicon.svg" />` tag.
  A fresh walk (24 screens, desktop + mobile, built dist/)
  reports 0 findings.

### [x] [B, 5.6] README.md's "What you get" section has zero prose entry point for the secrets vault — this commit (closes #99)
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
  never named `secrets.md`, and that file was linked only from
  two narrow playbook asides (`playbooks/workspace.md:85`,
  `playbooks/new-project.md:670`'s gitignore note) — never
  from README prose.
- fix: added a `customization/secrets.md` link to the
  `/bootstrap` row in README's "building blocks" table,
  alongside its existing "propagating secrets" mention.

### [x] [B, 5.6] skills/next/build.md's builder-brief checklist never tells the lead to pass the Cloud-Run trailer to a delegated builder — this commit
- category: completeness
- impact: 7, ease: 8
- evidence: this tick (2026-11-05, cloud run 42112496090)
  delegated chunk 39.8 to a builder subagent per
  `skills/next/build.md` §2's checklist (Where/What/How/Limits/
  Return). The brief named `skills/ship-a-chunk.md` for "How"
  but never stated the literal `Cloud-Run: <run-url>` trailer
  line the carve-out (`agents.md` rule 2, `.github/
  CLOUD_LOOP.md`) requires on every commit this tick ships —
  the builder has no access to the run URL unless the lead's
  brief states it. Result: all three of the builder's commits
  (`b5c7f1b`, `ddc0663`, `ff29fb8`) plus the lead's own `plan:
  close 39.8` and `plan: settle 39.8` landed on main
  (`c6640c0..4d75bed`) with no trailer, undercounting this
  tick's shipped work against the ceiling. Unfixable after the
  fact: the commits are already on `origin/main` and rewriting
  them needs a force-push, forbidden outright. Earlier
  precedent commits (`11bca75`, `6b02306`, chunk 39.9) do carry
  the trailer, so some past lead manually added the instruction
  despite the checklist's silence — this chunk's lead didn't.
- fix: added a 6th bullet ("Cloud trailer") to
  `skills/next/build.md` §2's checklist stating that in a cloud
  tick (`CI`/`GITHUB_ACTIONS` set) the brief states the exact
  `Cloud-Run: <run-url>` line and tells the builder to append it
  (blank line first) to every commit. Ported the same bullet to
  `templates/skills/next/build.md` (the adopter twin), since
  `templates/.github/CLOUD_LOOP.md` documents the identical
  trailer convention for adopters' own cloud loops.

### [x] [user-issue #97] [HIGH] support.mjs's ghIssue() breaks on current gh CLI: authorAssociation field removed — this commit (refs #97)
- category: external-issue
- evidence: filed by a prior cloud tick (run 42309960903) while
  triaging #96. `scripts/plan/support.mjs`'s `ghIssue()` (line
  ~498) ran `gh issue view <N> --json
  number,authorAssociation,labels`; on gh 2.103.3 that field no
  longer exists ("Unknown JSON field: authorAssociation"), so
  every call returned `null` and `support.mjs route` silently
  fell back to `{ route: 'stock', why: 'gh unavailable: triage
  routes as today' }` — not because gh is actually unavailable,
  but because the field name was stale. This defeated spec 54's
  trust-based fix/asap/needs-user routing on every tick,
  silently — no error surfaced upstream.
- fix: `ghIssue()` now runs `gh api
  repos/{owner}/{repo}/issues/<N> --jq '{association: … ,
  labels: […]}'` in both dogfood twins
  (`scripts/plan/support.mjs`, `templates/scripts/plan/
  support.mjs`; confirmed byte-identical after). Added direct
  test coverage for `ghIssue()` in
  `templates/scripts/__tests__/support.test.mjs` (it had none
  before, which is how this shipped unnoticed): one test
  asserts the call shape is `gh api …`, never `gh issue view
  --json authorAssociation`, so this exact regression can't
  recur silently again.

### [x] [user-issue #93] [HIGH] heartbeat: no successful march tick in 13h (schedule throttling, not a code defect) — this commit (closes #93)
- category: external-issue
- closed: own `next` said "close per the #67/#54 precedent if
  the gap doesn't repeat." Checked `gh issue list --search
  "heartbeat flatlined"` and `gh run list --workflow march.yml`
  this tick (2026-11-07): no new flatline issue since #93 itself
  (2026-11-05), and every march run since — about 15 scheduled
  and manual firings across 2026-11-05 through today — completed
  `success` with no gap. Confirmed non-reproducible one-off
  (the dropped hourly slot GitHub itself causes sometimes),
  closed per its own documented exit condition.

### [x] [user-issue #91] [HIGH] heartbeat: march realized cadence below 40% — the recommended lever was overtaken by the owner's own same-day change — this commit (closes #91)
- category: external-issue
- closed: recurrence was real — `gh run list --workflow march
  --event schedule -L 20` this tick still shows irregular
  multi-hour gaps under the cron that was in effect through
  this morning, so the alarm was not a false positive. But the
  row's one remaining lever ("the remaining lever is a slower
  cadence preset … an owner call, not a loop fix") was overtaken
  same-day by the owner's own `79980b2` ("cloud: march runs the
  sprint preset hourly — nexus keeps pace with its sibling
  loops", 2026-11-05 08:33 -0500): `.github/workflows/march.yml`
  moved to hourly (`17 * * * *`, was every 3h) — the opposite
  direction, chosen with full knowledge of the throttling
  tradeoff. Re-opening that question for the owner would just
  ask them to reverse a call they made hours earlier; the only
  other lever (another cron edit) is a workflow-file push a
  cloud tick can't land anyway (`agents.md`'s Operational
  secrets note). Closing returns #91 to the heartbeat's own
  dedup gate (`in:title ... open` before it reopens one): a
  fresh issue fires on its own if the realized cadence stays
  under 40% under the new hourly schedule, judged on its own
  evidence instead of this one's stale recommendation.

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
