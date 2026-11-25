# Digest — 2026-11-25

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two unbroken morning chains shipped spec 75 and spec 76 start
to finish (6 chunks, 2 triage ticks), then an evening chain
picked up an audit-top HIGH fix, filed one product candidate
and found five new critique rows — but that evening fix's own
`cli-ci` run went red on main, and this digest turned up a
second loose end: spec 76's mirror issue (`#133`) is stuck
open because its "shipped" comment landed on the chunk commit
instead of the spec's last chunk. Both need you; neither
blocks tonight's pass.

## While you were out

`seven_day utilization: 0.04 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-24 20:48:46 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-24 23:52 → 23:56 | march → triage | `ca25359` — 1 issue routed (`#131` closed, heartbeat-cadence recurrence, same owner call as `#96`/`#127`/`#129`/`#130`). |
| 11-24 23:56 → 11-25 00:08 | march (chain) → build | `4366a78`/`731efbb`/`4cf06e1` — 75.1 (`concepts/loop-honesty.md` tables what the loop checks vs trusts), closed + settled. |
| 11-25 00:08 → 00:28 | march (chain) → build | `33b2893`/`9cff712`/`3abcd7b`/`ae648ef`/`4feceb0`/`0801f41` — 75.2 (guard blocks a mirror commit missing its `Closes` trailer; loop-honesty's Report/misreported-outcomes cell mechanized), closed + settled. |
| 11-25 08:29 → 08:41 | march → build | `9ca0d84`/`0cdbde2`/`9167426` — 75.3 (3 remaining trust-cell candidates filed), closed + settled; spec 75 complete. |
| 11-25 08:41 → 08:45 | march (chain) → triage | `1f3b716` — 1 issue routed (`#132` closed, same precedent). |
| 11-25 08:45 → 08:50 | march (chain) → chunk | `f7c64b3` — chunk spec 76 (76.1/76.2 next; mirrored as `#133`). |
| 11-25 08:50 → 09:03 | march (chain) → build | `9335597`/`edf7929`/`74fb125`/`96c49b5`/`05c232b` — 76.1 (`concepts/reboot-train.md`: native session calls vs the ledger, field by field), closed + settled. |
| 11-25 09:03 → 09:15 | march (chain) → build | `a3183e9`/`5518678`/`d1fdba9`/`1cd0a69`/`8262de2` — 76.2 (`/reboot-resume` names the native-resume path concretely), closed + settled; spec 76 complete — but `#133` never got its `Closes` trailer (see Needs you). |
| 11-25 19:14 → 19:21 | march → expand | `9c14126` — pass 29, 1 candidate (Welcome mobile: a structural pass instead of a third ad hoc patch). |
| 11-25 19:21 → 19:38 | march (chain) → build | `3962535` — AUDIT pass 135's top HIGH row fixed (mobile footer-clip scroll override), closes `#134`. `cli-ci` went red on this commit (see Needs you). |
| 11-25 19:38 → 19:54 | march (chain) → critique | `0e93986` — pass 39, 5 findings (1 high, 3 med, 1 low). |
| 11-25 19:54 → 19:58 | march (chain) → refill | `3ad9caa` — filed the `cli-ci-red` AUDIT row. |
| 11-25 19:58 → now | march (chain) | still running as of this digest; no commit yet. |

`heartbeat` ran clean throughout (5/5 sampled). Two unbroken
morning chains: 23:52 → 00:28 (~36m, 1 triage + 2 build chunks,
spec 75 two-thirds done) and 08:29 → 09:15 (~46m, 1 build
chunk + 1 triage + 1 chunk op + 4 build chunks, spec 75's last
chunk then all of spec 76). A third chain is mid-flight now
(19:14 → ongoing, ~55m so far: expand, build, critique, refill,
one more tick still running). Quiet gaps: 00:28 → 08:29
(~8h01m), 09:15 → 19:14 (~9h59m).

## Shipped

- Spec 75 complete (3 of 3 chunks, all this window):
  `concepts/loop-honesty.md` tables the loop's Pick / Claim /
  Build / Close / Land / Report steps against self-approval,
  spec-gaming and misreported-outcomes failure modes; a new
  guard rule blocks a commit that names a mirror ("Mirrored as
  #N") without closing it in the same commit; the 3 remaining
  trust cells with a concrete, scoped mechanical fix are now
  candidates (the other 7 are the known "same model reads back
  its own work" limit, not buildable).
- Spec 76 complete (2 of 2 chunks, all this window):
  `concepts/reboot-train.md` compares the runtime's native
  session calls (resume by id, list, fork, context-window
  usage) against `scripts/ledger.mjs` field by field, and
  names why claims/worktrees stay in the ledger; `/reboot-
  resume` now names both the native and ledger resume paths
  concretely instead of a stub.
- AUDIT pass 135's top HIGH row fixed: the mobile Welcome
  footer's local-only trust line, step counter and "Press
  (Enter) to begin" were clipped off-screen with no scroll —
  now an `overflow-y: auto` override in the same mobile media
  block (closes `#134`).
- `expand` pass 29 filed one candidate (Welcome mobile screen:
  three comprehension findings in one walk pass share a root
  cause already named once — propose a structural pass, not a
  third one-off CSS patch).

## Queues now

- **Build plan:** 1 spec, 2 chunks left, 0 held. 73.1 is next
  by table order but local-session-only (no cloud credential
  runs `/doctor prompt-audit` interactively); 73.2 needs it —
  no cloud-pickable chunk exists right now.
- **AUDIT:** 5 pending, last pass 0h ago (pass 135, this
  window — not stale, not refreshed by this digest). The top
  row by impact is new: `cli-ci` red on main (HIGH, impact 9) —
  see Needs you.
- **CRITIQUE:** 9 pending, last pass 20h ago (pass 39: 5 new
  findings this window, 1 high/3 med/1 low).
- **CANDIDATES:** pulse reads 14 pending (6 >21d), oldest 146d
  (proposed 2026-07-03). Pulse's raw count is still inflated by
  the 4 `[promoted]`-tagged rows never relocated out of `##
  Pending` (the known gap, `[score 3.5]` below) — the genuine
  open count is 10, up 2 today: `expand`'s Welcome
  structural-pass row and this digest's `spec-close`/`#133`
  guard row (both proposed today, neither counts toward the
  >21d figure). The unchanged 6 >21d stays tracked by the
  already-filed `[score 4.8]` heartbeat quota-skip row,
  `[score 4.5]` crash-alarm dedupe row and `[score 3.5]`
  pulse-count row.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Improve:** `bold` · overrides: Support fix-all, Promote
  aged, Generators 7 listed, stall_action promote, loop on,
  Research 3d.

## Unreleased CLI fixes

12 since `cli-v0.6.5` (one new this window) — `3962535`
fix(cli): onboarding Welcome mobile footer scrolls instead of
clipping, `6b1a5da` fix(cli): hono 4.13.19 and
`@hono/node-server` 2.1.11 in the lockfile, clearing seven
advisories, `da4d724` fix(cli): onboarding stepper shows a step
count instead of clipping on mobile, `9213170` fix(cli): Fleet
tile phase track titles disambiguate the two "Q" segments,
`00b0a69` fix(cli): Oversight filter row scrolls instead of
clipping on mobile, `b348c6e` fix(cli): mobile Welcome loop
diagram no longer overlaps itself, `a36935f` fix(cli): the
onboarding Welcome headline wraps naturally on narrow phones,
`49f54b5` fix(cli): bump stale Fable 5.1 model id/label to
Fable 5.2, `23c4632` fix(test): feed.test.mjs's fixture commits
stop drifting to the loop's own git identity, `7767c92`
feat(upgrade): sync report cites CHANGELOG.md entries (61.3),
`972fe48` fix(cli): the favicon's own 404 stops showing up as a
UI-walk finding, and `ca3c79f` feat: loop throughput
(mirror-orphan generator, depth promotion, product-first pick,
Research `<n>d`).

## Needs you

- **`cli-ci` is red on main** since `3962535` (run
  `45687001768`, already filed as the top `plan/AUDIT.md` row,
  HIGH, impact 9). The failure is `test/cloud.test.mjs:274`
  ("owner: presets that share a cron still change the
  cadence…"), `AssertionError: 4 !== 2` ("one line: the
  ceiling"). `3962535` itself only touched `nexus.css`, so this
  reads as flaky or pre-existing rather than a regression from
  that change — but it's red right now. Reproduce with `npm
  --prefix packages/cli test`.
- **Issue `#133` (spec 76's mirror) is stuck open** though spec
  76 shipped hours ago. `loop-issue.mjs spec-close` posted its
  "shipped in `f7c64b3`" comment 10 seconds after that commit
  landed — but `f7c64b3` is `plan: chunk spec 76`, not a build
  commit; neither chunk's commit range (`9335597`..`05c232b`
  for 76.1, `a3183e9`..`8262de2` for 76.2) carries a `Closes
  #133` trailer, so the close the comment promised never
  arrived. Close `#133` by hand; filed as a candidate below so
  the next spec doesn't repeat it.
- auto-promoted none — no candidate is inside its veto window
  this tick (`promote.mjs sweep`: clean). oversight needed:
  candidate queue silting (6 pending >21d, oldest 146d) — see
  Queues now for the three rows already tracking it.

## Today's intent

No cloud-pickable chunk: spec 73 is the only one on the board
(0 of 2), and 73.1 needs a local/interactive session (Claude
Code's own prompt-audit tool) before 73.2 can follow. The top
AUDIT finding is `cli-ci` red on main (HIGH, impact 9, filed
this window) — reproduce and fix it in `packages/cli` before
anything else touches that package; the next doc/template
finding behind it is the `[MED, 5.4]` README `[needs-user-call]`
gloss row.

## Tuning proposals

Filed one: `[score 5.5]` `spec-close` fired at the chunk
commit instead of the spec's last chunk, leaving `#133`
permanently wrong (`plan/CANDIDATES.md`) — `cmdMirrorClose()`
in `templates/scripts/loop-issue.mjs` should refuse to post the
"shipped" comment while the spec's own Measure line still
reads open chunks, the same "check against data already
written down" shape as the Pick-order and claim-readiness rows
already pending. Proposal only; `/oversight` promotes.
