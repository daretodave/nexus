# Kit audit

> Last pass: 2026-11-16
> Pass count: 130
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

### [A, 3.0] nexus's own `.github/workflows/*.yml` still pin `actions/checkout@v4` / `actions/setup-node@v4`, now behind the just-bumped `templates/` copies
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

### [loop] [HIGH] motion stalled in 2026-W46: 20 shipped against a 4-week baseline of 159.5
- category: loop
- impact: 8
- ease: 5
- evidence: node scripts/pulse.mjs --motion: shipped 20 / baseline 159.5 · 2026-W46 against 2026-W42..2026-W45 (6 so far in 2026-W47); floor 79.75 · stalled (20 is under 50% of the baseline).
- next: /iterate: find what keeps the loop from shipping (no ready chunk, a silted candidates queue, a lock with no fallback) and move it: build the top Pending row, ask /oversight to promote a candidate, or name the plan/bearings.md lever (Motion floor, stall_action, Promote) to retune.
- generator: motion · filed 2026-11-17

### [user-issue #115] [MED] night.yml is missing the touch .owner step march.yml has
- category: external-issue
- evidence: opened 2026-11-17, reported during a `/digest` cloud
  tick. `.github/workflows/march.yml` has an explicit `touch
  .owner` step (around line 231-236) so its checkout reports
  owner mode and the tick can push main directly (`agents.md`
  Standing rule 1). `.github/workflows/night.yml` runs on the
  same `ACTIONS_PAT` checkout and is documented
  (`skills/digest.md`) to land the same way, but has no
  matching step — `npm run claims -- whoami` in that checkout
  currently reports `contributor`. The pre-push hook isn't
  armed in CI so tonight's push wasn't blocked, but it is a
  latent gap: an armed hook, or any script branching on
  `claims.mjs whoami` the way `skills/next/land.md` already
  does, would get night.yml's push rejected.
- next: a local `/oversight` session adds the same `touch
  .owner` step to `night.yml`'s job, mirroring `march.yml` — a
  `.github/workflows/` edit, so it needs a human token
  (`agents.md` Operational secrets: the Claude Code Action's
  own installation token overrides `ACTIONS_PAT` for
  workflow-file pushes specifically).

## Done

### [x] [mirror #114] [MED] "prompts/pitch.md's Standing rules block missing the attribution-trailer carve-out" — closed 2026-11-17, already fixed by 4500253
- category: docs
- fix: none needed this tick — 4500253 (the prior tick) already
  added the carve-out sentence to prompts/pitch.md's Standing
  rules block, before #114's mirror-orphan row even landed in
  this file. Closed #114 citing that commit.
- source: generator: mirror-orphan · filed 2026-11-17

### [x] [MED] playbooks/new-project.md:695-711 — step 9's automated `/bootstrap` path can wire a ticking cloud loop before a single `/next` chunk has shipped, contradicting the cloud loop's own precondition — this commit
- category: instruction-drift
- fix: `playbooks/new-project.md` step 9's "Automated" bullet now
  says to skip the cloud-loop leg this early (run `/bootstrap
  cloud-loop` on its own later) until the verify gate is
  hermetic and the local loop has run cleanly for a few days,
  linking the same precondition in `README.md`'s "Pick a
  playbook" table and `cloud-loop.md`.
  `customization/bootstrap-automation.md`'s phase-of-life table
  gets the matching note for its "Pre-everything" and "Remote,
  nothing else" rows.
- source: plan/CRITIQUE.md, moved to its own Done

### [x] [C, 2.4] identity/footguns.md:10 links to a README.md anchor that doesn't exist in its target — already fixed, finding stale
- category: link + tree hygiene
- resolution: the `#footguns-the-ladder` fragment this row
  described was already dropped in `4d7173d` ("plan: settle
  99.1", 2026-11-09) — `identity/footguns.md:10` has read
  `[README.md](README.md))` with no fragment since, matching
  this row's own second suggested fix. The audit block carrying
  this row was never refreshed after that commit; removing it
  now as stale, no code change needed.

### [x] [MEDIUM] next/build.md §2's brief scope and ship-a-chunk.md's Step 6/8 disagree on what a `/next` builder closes — this commit (closes #110)
- category: drift
- evidence: `next/build.md` §2 "How" briefs a builder to run
  "`skills/ship-a-chunk.md` steps read-spec through tests
  (read, build, wire, test)" — Steps 3-4b only — and its own
  Limits separately forbid the builder from ever touching
  `plan/README.md`, a spec's chunk list, `ARCHIVE.md` or
  `plan/pending/` (`skills/next.md` Step 4 instead has the
  *lead* write `plan/pending/<id>.md` and land through settle,
  `next/land.md` §1-3). But `ship-a-chunk.md`'s own Step 6
  ("Close the chunk") and Step 8 ("Commit + land") directly
  edit those same files in the chunk's own commit, with no note
  anywhere that a `/next` builder's brief should stop short of
  them. Chunk 61.3's builder (this cloud tick, 2026-11-11) was
  briefed to run Step 6/8 verbatim (closing spec 61, deleting
  its file, editing `plan/README.md` and `plan/ARCHIVE.md` in
  its own commit) rather than through a pending file; the end
  state was correct — nothing else touched `plan/` this tick,
  so no race — but the lead only caught the skipped pending-file
  path on review, after the commit already existed.
- next: fixed — `next/build.md` §2 item 3 now names the exact
  step range (3-5) and says Steps 6 and 8 stay the lead's,
  through the pending file.

### [x] [MEDIUM] settle.mjs's setLeft() never updates a spec row written in "N of M chunks" format — this commit
- category: drift
- evidence: `scripts/plan/settle.mjs`'s `setLeft()`
  (`scripts/plan/settle.mjs:243`) only rewrote a roadmap row
  that already ended `| N left |`; a row in `| N of M chunks |`
  shape (`node scripts/plan/progress.mjs`'s own `bar()` format)
  never updated after a close, so a spec chunked in that shape
  (plan/README.md's spec 65 row: `0 of 1 chunks`) could go
  stale the moment its chunk closed.
- next: done — `setLeft()` takes an optional `closed` count and
  rewrites an `N of M chunks` row from it
  (`closedChunks(archive, specNum(id)).length + 1`, the same
  ARCHIVE.md-backed count `progress.mjs`'s own bar uses), while
  an `N left` row's branch is untouched; a regression test
  covers both shapes and their independence
  (`templates/scripts/__tests__/settle.test.mjs`).

### [x] [I, 4.0] motion stalled in 2026-W45: 12 shipped against a 4-week baseline of 158.25 — closed 2026-11-16
- category: loop-config
- impact: 8, ease: 5
- evidence: `node scripts/pulse.mjs --motion`: shipped 12 /
  baseline 158.25 · 2026-W45 against 2026-W41..2026-W44; floor
  79.13 · stalled. The stall persists into 2026-W46 (20
  shipped, still under the 79.75 floor) and traces to the same
  friction this tick hit directly: `node
  scripts/plan/promote.mjs pick` returned `none: 2
  auto-promotions in the last 7 days (cap 2)` even though
  several Pending candidates clear `promote_floor` and
  `promote_after_days` (`plan/CANDIDATES.md` scores 7.0-7.5),
  while both open specs sit blocked — 65's only chunk is
  local-session-only (a workflow-file push no cloud tick can
  land), 66 is Held behind its veto window until 2026-11-19 —
  so the spec table can't refill past 2 auto-promotions/week.
- fix: bumped `plan/bearings.md`'s `promote_per_week` 2 → 3
  (`## Plan expansion posture`), the one lever in
  `scripts/plan/loop-rows.mjs`'s `BEARINGS_KEYS` that directly
  loosens the binding constraint observed this tick, so the
  aged-promotion queue refills one spec faster once the weekly
  cap window rolls over.
- generator: motion · filed 2026-11-10
- issue: #108

### [x] [F, 3.6] `packages/cli/shared/models.mjs` and its test fixtures still carry "Fable 5.1" against the current "Fable 5.2" lineup — this commit
- category: freshness
- impact: 4, ease: 9
- evidence: `packages/cli/shared/models.mjs:8` carried
  `{ id: 'claude-fable-5-1', label: 'Fable 5.1' }`, read by the
  server and GUI (cockpit badge, Fleet tiles, Settings) as the
  model list's first row. `packages/cli/test/model.test.mjs`
  (lines 28, 39, 47, 236, 238-239) and
  `packages/cli/test/model-ui.test.mjs` (lines 18, 47, 99)
  fixtured the same stale id/label pair.
- fix: bumped `claude-fable-5-1` → `claude-fable-5-2` and
  `Fable 5.1` → `Fable 5.2` in `models.mjs:8` and both test
  fixtures. `npm --prefix packages/cli test`: the two touched
  files' 14 tests pass; the suite's other 77 failures are a
  pre-existing sandbox artifact (`safe.bareRepository=explicit`
  in this session's `~/.gitconfig`, not the GitHub Actions
  runner) reproduced identically on an unmodified checkout.

### [x] [user-issue #103] [MEDIUM] support.mjs sla re-flags issues forever: plotted chunks never carry Refs #N for tell to close — closed 2026-11-11
- category: external-issue
- resolution: plotted as spec 64 (past `sla_hours` with no
  Asap line naming it, `skills/march.md` Step 1.5) and built
  as chunk 64.1 the same tick: `skills/next/land.md` §2 (and
  its `templates/` twin) now teach the `says` field to end
  ` (#N)` when the chunk closing is issue-born, so `ARCHIVE.md`'s
  line still names the issue once settle removes the Asap lane
  line, and `support.mjs sla`'s existing `names(archive, n)`
  check keeps recognizing the work as done (archive
  `edf529da..edf529da`, spec 64 complete).

### [x] [user-issue #102] [MEDIUM] settle.mjs: closing a ladder spec's last chunk never writes its ARCHIVE "spec complete" line — closed 2026-11-10
- category: external-issue
- resolution: plotted as spec 63 (past `sla_hours` with no
  Asap line naming it, `skills/march.md` Step 1.5) and built
  as chunk 63.1 the same tick (archive `bf7a38ca..bf7a38ca`,
  spec 63 complete).

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
