# Kit audit

> Last pass: 2026-11-25
> Pass count: 135
> Bias: none

## Pending

### [ ] [MED, 3.0] /onboarding/welcome @ mobile (plain-folder) — the stepper collapses to a bare "1 of 8" with every step name hidden
- category: ui-comprehension
- impact: 6, ease: 5
- evidence: `nexus.css:901-917` hides every step but the
  current one on mobile, leaving only the numeric counter; a
  mobile adopter can't see what the remaining steps involve.
- next: `packages/cli/src/ui/feedback.jsx` (`Stepper`, ~line
  17) or the same media query — surface the next step's label
  beside the counter on mobile.
- source: plan/CRITIQUE.md (Pending)

### [ ] [LOW, 2.4] README.md:18 — the "nexus runs on nexus" teaser forward-references and duplicates a section the reader hasn't reached yet
- category: voice
- impact: 3, ease: 8
- evidence: README.md:18 links `#nexus-runs-on-nexus`
  (README.md:407), unexplained this early, and duplicates that
  section's own framing once the reader gets there.
- next: README.md:18 — trim to a bare forward link, or move the
  line to sit just above the `## nexus runs on nexus` section.
- source: plan/CRITIQUE.md (Pending)

## Done

### [x] [MED, 4.2] /onboarding/welcome @ desktop (plain-folder) — stepper step names are unexplained jargon with no hover hint — this commit
- category: ui-comprehension
- impact: 6, ease: 7
- evidence: `Stepper` (`packages/cli/src/ui/feedback.jsx:22`)
  renders labels ("Detect," "Shape," "Plot," "Cloud loop";
  `packages/cli/src/ui/steps.js:9-16`) as plain links with no
  `title`/hint, so a stranger can't learn what a remaining step
  does before clicking in.
- fix: each `STEPS` entry (`packages/cli/src/ui/steps.js`) now
  carries a short `hint` string; `Stepper` passes it through as
  the `NavA`'s `title` (`packages/cli/src/ui/feedback.jsx:22`),
  so hovering a step surfaces what it does.
- source: plan/CRITIQUE.md (Pending)

### [x] [MED, 5.4] README.md:150,155 — `[needs-user-call]` rows are never glossed before the TL;DR tells an adopter to resolve them — this commit
- category: comprehension
- impact: 6, ease: 9
- evidence: "Review what landed" tells the adopter to expect
  `[needs-user-call]` rows (line 150) then "resolve
  `[needs-user-call]` rows" (line 155), with no gloss in
  README.md itself; `agents.md:112` is the only existing gloss,
  in a file the TL;DR never points the reader to first.
- fix: README.md:150 now glosses the tag inline the first time
  it appears: "any `[needs-user-call]` rows (a question the
  agent couldn't decide alone and left for you) in
  `plan/AUDIT.md`".
- source: plan/CRITIQUE.md (Pending)

### [x] [cli-ci #45687001768] [HIGH] cli-ci red on main since 3962535 (1 red run) — this commit (issue: #135)
- category: cli-ci
- impact: 9, ease: 6
- evidence: cli-ci run 45687001768 concluded failure at 3962535;
  the real failing test (`npm --prefix packages/cli test`) was
  `owner: presets that share a cron still change the cadence...`
  (`cloud.test.mjs`), unrelated to that commit's actual diff —
  `one line: the ceiling` asserted `4 !== 2` diff lines.
- resolution: `runClean` (`packages/cli/server/cloud.mjs`)
  accumulated a spawned process's stdout/stderr with `out += d`
  on each `data` Buffer chunk; Node decodes a Buffer to a string
  per `+=`, so a multi-byte UTF-8 character split across a chunk
  boundary decodes to U+FFFD independently on each half. `git
  show`'s output for `templates/.github/workflows/march.yml`
  (box-drawing `═` comment dividers) hit this on the box-drawing
  line, turning a 1-line cadence-preset diff into a spurious
  2-line one. Fixed: collect raw Buffer chunks and decode once
  at close (`Buffer.concat(...).toString('utf8')`); `onErr`'s
  streaming callback uses a stateful `TextDecoder({ stream:
  true })` so a split character carries over between chunks
  there too. Verified: `cloud.test.mjs` 27/27 green (a
  sandbox-only `safe.bareRepository` restriction, not this
  repo's code, blocks unrelated bare-repo fixtures elsewhere in
  the suite in this environment; same failures, same count
  minus this one, before and after the fix).
- generator: cli-ci-red · filed 2026-11-25

### [x] [H, 8.1] /onboarding/welcome @ mobile (plain-folder) — the footer's local-only trust line is clipped off-screen with no scroll — this commit (source: plan/CRITIQUE.md, moved to its own Done)
- category: ui-comprehension
- impact: 9, ease: 9
- evidence: `nexus.css:779` sets `.ob { overflow: hidden }`
  and `:1304` repeats `.ob { height: 100vh; min-height: 0 }`
  with no mobile-width override enabling scroll; the onboarding
  grid stacks the loop diagram below the copy on mobile,
  pushing total height past one viewport, so the footer's
  data-locality line, step counter and "Press ⏎ to begin" are
  unreachable, not just below the fold.
- fix: added `.ob { height: auto; min-height: 100vh; overflow-y:
  auto; }` inside the existing `@media (max-width: 760px)` block
  that already carries the `.ob-grid` mobile-stack override (it
  has to land there, after the unconditional "ONBOARDING STEPS"
  rules, to win the cascade — the same pattern the block's own
  comment documents for `.ob-grid`). Desktop's `.ob { height:
  100vh; overflow: hidden }` is untouched. Mirrored into
  `packages/cli/design/handoff/nexus.css`. Verified: mobile
  `scrollHeight` (1067px) now exceeds `clientHeight` (844px) and
  the footer's bounding rect sits inside the viewport after
  scrolling to the bottom; `npm --prefix packages/cli run walk`
  across 3 scenarios × 2 viewports on `/onboarding/welcome`
  reports 0 findings; desktop screenshot unchanged.
- source: plan/CRITIQUE.md, moved to its own Done

### [x] [user-issue #132] [HIGH] heartbeat: march realized cadence below 40% — closed 2026-11-25, same owner call as #131/#130/#129/#127/#96/#91
- category: external-issue
- resolution: recurrence confirmed (`templates/scripts/cloud/cadence.mjs
  realized` against `gh run list --workflow march --event
  schedule -L 1000` this tick: 8 of 24 promised slots in 72h,
  33%), but no new lever exists beyond what #96 (2026-11-21),
  #127 (2026-11-23), #129 (2026-11-24), #130 (2026-11-24) and
  #131 (2026-11-24) already settled: the owner's cron, every 3
  hours at `:17`, off the busy top of the hour, keeps
  delivering under 40% of the promised slots on purpose because
  chained ticks, not the cron, carry the throughput. Re-opening
  `/oversight` for a question the owner answered five times
  already would be noise (the #91 precedent). Closed with a
  comment pointing at #131.

### [x] [user-issue #131] [HIGH] heartbeat: march realized cadence below 40% — closed 2026-11-24, same owner call as #130/#129/#127/#96/#91
- category: external-issue
- resolution: recurrence confirmed (`templates/scripts/cloud/cadence.mjs
  realized` against `gh run list --workflow march --event
  schedule -L 1000` this tick: 8 of 24 promised slots in 72h,
  33%), but no new lever exists beyond what #96 (2026-11-21),
  #127 (2026-11-23), #129 (2026-11-24) and #130 (2026-11-24)
  already settled: the owner's cron, every 3 hours at `:17`,
  off the busy top of the hour, keeps delivering under 40% of
  the promised slots on purpose because chained ticks, not the
  cron, carry the throughput. Re-opening `/oversight` for a
  question the owner answered four times already would be
  noise (the #91 precedent). Closed with a comment pointing at
  #130.

### [x] [user-issue #130] [HIGH] heartbeat: march realized cadence below 40% — closed 2026-11-24, same owner call as #129/#127/#96/#91
- category: external-issue
- resolution: recurrence confirmed (`templates/scripts/cloud/cadence.mjs
  realized` against `gh run list --workflow march --event
  schedule -L 1000` this tick: 8 of 24 promised slots in 72h,
  33%), but no new lever exists beyond what #96 (2026-11-21),
  #127 (2026-11-23) and #129 (2026-11-24) already settled: the
  owner's cron, every 3 hours at `:17`, off the busy top of the
  hour, keeps delivering under 40% of the promised slots on
  purpose because chained ticks, not the cron, carry the
  throughput. Re-opening `/oversight` for a question the owner
  answered three times already would be noise (the #91
  precedent). Closed with a comment pointing at #129.

### [x] [user-issue #128] [HIGH] heartbeat: march has flatlined (2026-11-23) — closed 2026-11-24, schedule throttling not a code defect
- category: external-issue
- resolution: `gh run list --workflow march -L 30` this tick
  shows a genuine ~13.6h gap with no scheduled run between
  2026-11-23T12:32:52Z and this tick's 2026-11-24T02:12:13Z,
  but every run in the window that did fire (schedule or
  dispatch) completed `success` — no failing run, no auth
  error, just GitHub not firing the `17 */3 * * *` cron for a
  stretch, the same root cause `templates/scripts/cloud/cadence.mjs
  realized` measures for the sibling #129 report this tick (38%
  over 72h). Same shape as #93's 2026-11-07 close ("schedule
  throttling, not a code defect"): the watchdog's own job is
  firing this tick, so the gap already recovered. No new code
  lever; closed with a comment pointing at #93.

### [x] [user-issue #129] [HIGH] heartbeat: march realized cadence below 40% — closed 2026-11-24, same owner call as #127/#96/#91
- category: external-issue
- resolution: recurrence confirmed (`templates/scripts/cloud/cadence.mjs
  realized` against `gh run list --workflow march --event
  schedule -L 30` this tick: 9 of 24 promised slots in 72h,
  38%), but no new lever exists beyond what #96 (2026-11-21)
  and #127 (2026-11-23) already settled: the owner chose the
  sprint preset's cron, every 3 hours at `:17`, off the busy
  top of the hour, with full knowledge GitHub would keep
  delivering under 40% of the promised slots and that chained
  ticks, not the cron, carry the throughput. Re-opening
  `/oversight` for a question the owner answered twice already
  would be noise (the #91 precedent). Closed with a comment
  pointing at #127.

### [x] [user-issue #127] [HIGH] heartbeat: march realized cadence below 40% — closed 2026-11-23, same owner call as #96
- category: external-issue
- resolution: recurrence confirmed (`gh run list --workflow
  march --event schedule` plus `templates/scripts/cloud/cadence.mjs
  realized` this tick: 6 of 16 promised slots in 47h, 38%), but
  no new lever exists. #96's close (2026-11-21, owner) already
  chose the sprint preset's cron, every 3 hours at `:17`,
  knowing GitHub delivers 3 to 4 scheduled runs a day here
  regardless of what the cron promises, and that a fresh
  report near the 40% line was expected ("close enough to the
  40% line that the heartbeat may open a fresh report").
  `march.yml`'s own cron comment documents the same tradeoff:
  chained ticks carry the throughput, not the cron. Re-opening
  `/oversight` for a question the owner answered two days ago
  with full knowledge of this exact recurrence would be noise
  (the #91 precedent). Closed with a comment pointing at #96;
  a fresh issue fires on its own if the realized cadence stays
  under 40% under some future schedule change, judged on its
  own evidence.

### [x] [needs-user-call] re-mint `ACTIONS_PAT` with Contents and Workflows write, then pass it to the action as `github_token` — closed 2026-11-21
- category: key-custody
- resolution: the owner added Contents: Read and write to the
  token the same day (permissions edited in place, the value
  unchanged). The control probe then passed all three writes
  on `ACTIONS_PAT` (run `44908715342`: a ref create, a
  plain-file push, a `.github/workflows/` push). `a17f5af`
  set `github_token` on the model step in `march.yml` and
  `night.yml`; tick `44909096461` logged "Using provided
  GITHUB_TOKEN" and its commit `d6ea25d` reached main as a
  push by the owner's account, through the default-branch
  ruleset.

### [x] [needs-user-call] `ACTIONS_PAT`'s real expiry is unconfirmed in `identity/key-custody.md` — closed 2026-11-21
- category: key-custody
- resolution: the owner read it from GitHub's token settings:
  the token has no expiration date. `identity/key-custody.md`'s
  Expires cell says so.

### [x] [user-issue #96] [HIGH] [needs-user-call] heartbeat: march realized cadence below 40% — closed 2026-11-21
- category: external-issue
- resolution: `/oversight` put the numbers to the owner.
  GitHub delivered 3 to 4 scheduled march runs a day under
  every cron this repo has promised (4 a day in early October,
  8 a day from 2026-10-25, 24 a day from 2026-11-05), so the
  hourly cron could never clear the alarm. The owner chose the
  sprint preset's own cron, every 3 hours (`17 */3 * * *`):
  8 promised, about 42% delivered on that history, which sits
  near the 40% line and may alarm again. Chained ticks, not
  the cron, carry the throughput.

### [x] [A, 3.0] nexus's own `.github/workflows/*.yml` still pin `actions/checkout@v4` / `actions/setup-node@v4`, now behind the just-bumped `templates/` copies — closed 2026-11-21 (this commit)
- category: doc-drift
- fix: a local session moved all eight root workflows to
  `actions/checkout@v5` and `actions/setup-node@v5`, and
  `templates/.github/workflows/nudge.yml`'s checkout with its
  root twin in the same commit, so the `workflows` leg's twin
  check stays green. `night.yml` also moves from Node 20 to
  Node 24, march's and cli-ci's runtime.

### [x] [user-issue #115] [MED] night.yml is missing the touch .owner step march.yml has — closed 2026-11-18
- category: external-issue
- resolution: plotted as spec 68 (past `sla_hours` with no
  Asap line naming it, `skills/march.md` Step 1.5); not built
  the same tick — chunk 68.1 edits
  `.github/workflows/night.yml` directly, which no cloud
  tick's token can push (`agents.md` Operational secrets), so
  it waits in the Asap lane for a local session.

### [x] [loop, 4.0] motion stalled in 2026-W46: 20 shipped against a 4-week baseline of 159.5 — closed 2026-11-18, diagnosis only
- category: loop
- impact: 8, ease: 5
- evidence: `node scripts/pulse.mjs --motion`: shipped 20 /
  baseline 159.5 · 2026-W46 against 2026-W42..2026-W45; floor
  79.75 · stalled. `git log --since/--until` on W46 (2026-11-09
  to 2026-11-15) shows 62 total commits but only 20 `feat`/`fix`/
  `content` ones — the loop ran, it just spent most of the week
  on housekeeping (`plan`, `docs`, `critique`, `expand`, `audit`
  verbs never count toward motion). This tick hit the same
  shape directly: triage clean, critique not due, no ready chunk
  (spec 65's only chunk is local-session-only; specs 66 and 67
  are Held behind their veto window), refill/field-research both
  clean/not-due, expand not due (7 commits/1 day) — every lever
  this row's `next` names is already accounted for: `node
  scripts/plan/promote.mjs pick` returns `none: 3
  auto-promotions in the last 7 days (cap 3)` even though
  `plan/CANDIDATES.md`'s top row (`[score 6.6]`, proposed
  2026-09-23, well past `promote_floor`/`promote_after_days`)
  qualifies — confirming the "silted candidates queue" the
  `next` field named.
- fix: no lever change this tick. `promote_per_week` was already
  bumped 2 → 3 for this exact pattern two days ago (commit
  `7709737`, 2026-11-16), which is why specs 66/67 are now Held
  rather than still Pending; their veto window clears
  2026-11-19 (tomorrow), refilling the spec table. A further
  bump would repeat that fix without new evidence it's
  insufficient, and `node scripts/plan/loop-rows.mjs status`
  reports `ship: wait until 2026-11-23` for any dimension-I-shaped
  retune regardless. Closing as a diagnosis: the stall is the
  queue's held specs clearing on schedule, not a new lever gap.
- generator: motion · filed 2026-11-17

### [x] [E, 2.1] bash-only syntax ($(...), heredocs, && chaining) survives in skills/ and templates/skills/ outside 52.3's scope — this commit
- category: adopter friction
- fix: every bash fence under `skills/` and `templates/skills/`
  carrying the bash-only shapes this row named (`$(...)`,
  backticks, a bare `VAR=value` assignment, `&&`/`||` chaining,
  a heredoc) now carries `<!-- dualshell:posix-only -->` right
  above the fence — none were worth rewriting to a PowerShell
  equivalent (mktemp scratch files, `gh` reads, heredoc commit
  bodies). `scripts/verify.mjs`'s `SYNTAX_SCOPED_SKILLS` (a
  five-file allowlist) is now `SYNTAX_SCOPED_RE`, a path-prefix
  test covering all of `skills/` + `templates/skills/`, so new
  skills are checked without another gate-side edit.
- source: `plan/CANDIDATES.md`'s matching `[score 5.8]` row moved
  to `## Rejected` (built directly, no spec needed).

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
