# Digest — 2026-11-26

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three unbroken chains cleared last night's cli-ci alarm plus
five more audit/critique fixes, then ran a quiet triage +
critique morning and a triage + four-fix + expand afternoon —
cli-ci is green again, but issue `#133` (spec 76's mirror)
is still stuck open and the candidate queue is still silting;
neither blocks tonight's pass.

## While you were out

`seven_day utilization: 0.06 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-25 20:11:55 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-25 20:11 → 20:16 | march (chain) → build | `0ad7117` — last night's top Needs-you item fixed: `runClean` (packages/cli/server/cloud.mjs) decodes stdout/stderr once at close instead of per chunk; cli-ci green again. |
| 11-25 20:16 → 20:23 | march (chain) → build | `737af6f` — README's `[needs-user-call]` tag glossed inline at its first mention. |
| 11-25 20:23 → 20:33 | march (chain) → build | `ec03e70` — onboarding stepper step names get a hover hint. |
| 11-25 20:33 → 20:47 | march (chain) → build | `a01871a` — onboarding stepper names the next step on mobile. |
| 11-25 20:47 → 20:56 | march (chain) → build | `7e45510` — adopt.md's playbook exception now names the smoke-test carve-out. |
| 11-26 03:32 → 03:36 | march → triage | `6c8fa33` — 1 issue routed (`#137` closed, heartbeat-cadence recurrence, same owner call as `#96`/`#127`/`#129`/`#130`/`#131`/`#132`). |
| 11-26 03:36 → 03:43 | march (chain) → build | `f530514` — playbooks/new-project.md §4 names the `<DEPLOY_URL>` exclusion. |
| 11-26 03:43 → 03:52 | march (chain) → critique | `0713735` — pass 40, 3 findings (0 high, 1 med, 2 low). |
| 11-26 03:52 → 03:56 | march (chain) | no-op — nothing ready. |
| 11-26 03:56 → 04:00 | march retry | no-op — nothing ready. |
| 11-26 16:52 → 16:55 | march → triage | `70887d6` — 1 issue routed (`#139` closed, same recurrence/owner call). |
| 11-26 16:55 → 17:04 | march (chain) → build | `72dcfa3` — playbooks/new-project.md step 6 now writes `package.json`. |
| 11-26 17:04 → 17:12 | march (chain) → build | `ea47c3e` — playbooks/new-project.md §2 paragraph order fixes the "Before that question" forward reference. |
| 11-26 17:12 → 17:23 | march (chain) → build | `1245523` — `/board` size badges and claims phase words get a legend (closes `#142`). |
| 11-26 17:23 → 17:30 | march (chain) → build | `8665c94` — README.md:18 teaser trimmed to a bare forward pointer. |
| 11-26 17:30 → 17:37 | march (chain) → expand | `bef13cf` — pass 30, 0 new, 1 re-evidenced (Welcome mobile structural-pass row, 6.0 → 6.5). |
| 11-26 17:37 → 17:44 | march (chain) | no-op — nothing ready; latest completed tick. |

`heartbeat` ran clean throughout (5/5 sampled). Three unbroken
chains: 20:11 → 20:56 (~45m, the cli-ci fix plus four more
audit/critique fixes), 03:32 → 04:00 (~28m, 1 triage + 1 fix +
1 critique pass + 2 no-ops) and 16:52 → 17:44 (~52m, 1 triage +
4 fixes + 1 expand pass + 1 no-op). Quiet gaps: 20:56 → 03:32
(~6h36m), 04:00 → 16:52 (~12h51m).

## Shipped

- cli-ci back to green: `runClean` accumulated a spawned
  process's output by decoding each Buffer chunk separately,
  so a multi-byte character split across a chunk boundary
  corrupted the diff `cloud.test.mjs` compares against; now
  collected as raw Buffers and decoded once at close.
- Six more audit/critique fixes cleared the rest of last
  night's queue: README's `[needs-user-call]` gloss, the
  onboarding stepper's hover hint and mobile next-step label,
  `prompts/adopt.md`'s named exceptions, `playbooks/new-
  project.md`'s `<DEPLOY_URL>` note, its §2 paragraph order,
  its step-6 `package.json` write, `/board`'s size/status
  legend (closes `#142`), and README.md:18's teaser trim.
- Two triage ticks closed `#137` and `#139` — both the same
  recurring "heartbeat: march realized cadence below 40%"
  report, no new lever beyond the owner's call already made
  seven times (`#96`/`#127`/`#129`/`#130`/`#131`/`#132`).
- `critique` pass 40: 3 findings (0 high, 1 med, 2 low); the
  MED one (new-project.md's forward reference) fixed in the
  same chain, the 2 LOW ones stay pending.
- `expand` pass 30: 0 new candidates, 1 re-evidenced (the
  Welcome mobile structural-pass row, 6.0 → 6.5) — still short
  of `promote_floor`'s age/re-evidence bar.

## Queues now

- **Build plan:** 1 spec, 2 chunks left, 0 held. 73.1 is still
  local-session-only (needs an interactive `/doctor
  prompt-audit` run); no cloud-pickable chunk exists.
- **AUDIT:** 2 pending (both LOW, README voice/comprehension),
  last pass today (pass 137) — not stale.
- **CRITIQUE:** 3 pending, last pass today (pass 40).
- **CANDIDATES:** pulse reads 14 pending (6 >21d), oldest 147d
  (proposed 2026-07-03). Still inflated by the same 4
  `[promoted]`-tagged rows never relocated out of `## Pending`
  (the known gap, `[score 3.5]` below) — genuine open count is
  10, unchanged today (expand pass 30 added 0 new).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Improve:** `bold` · overrides: Support fix-all, Promote
  aged, Generators 7 listed, stall_action promote, loop on,
  Research 3d.

## Unreleased CLI fixes

16 since `cli-v0.6.5` (4 new this window) — `1245523`
fix(cli): /board — size badges and claims phase words get a
legend, `a01871a` fix(cli): onboarding stepper names the next
step on mobile, `ec03e70` fix(cli): onboarding stepper steps
get a hover hint, `0ad7117` fix(cloud): runClean decodes
stdout/stderr once, not per chunk, `3962535` fix(cli):
onboarding Welcome mobile footer scrolls instead of clipping,
`6b1a5da` fix(cli): hono 4.13.19 and `@hono/node-server`
2.1.11 in the lockfile, clearing seven advisories, `da4d724`
fix(cli): onboarding stepper shows a step count instead of
clipping on mobile, `9213170` fix(cli): Fleet tile phase track
titles disambiguate the two "Q" segments, `00b0a69` fix(cli):
Oversight filter row scrolls instead of clipping on mobile,
`b348c6e` fix(cli): mobile Welcome loop diagram no longer
overlaps itself, `a36935f` fix(cli): the onboarding Welcome
headline wraps naturally on narrow phones, `49f54b5` fix(cli):
bump stale Fable 5.1 model id/label to Fable 5.2, `23c4632`
fix(test): feed.test.mjs's fixture commits stop drifting to
the loop's own git identity, `7767c92` feat(upgrade): sync
report cites CHANGELOG.md entries (61.3), `972fe48` fix(cli):
the favicon's own 404 stops showing up as a UI-walk finding,
and `ca3c79f` feat: loop throughput (mirror-orphan generator,
depth promotion, product-first pick, Research `<n>d`).

## Needs you

- Issue `#133` (spec 76's mirror) is still stuck open, 24h
  after spec 76 shipped — nobody has closed it by hand yet.
  The `spec-close` root cause is already filed as a candidate
  (`[score 5.5]`), not yet promoted.
- auto-promoted none — no candidate is inside its veto window
  this tick (`promote.mjs sweep`: clean). oversight needed:
  candidate queue silting (6 pending >21d, oldest 147d) —
  tracked by the already-filed heartbeat quota-skip
  (`[score 4.8]`), crash-alarm dedupe (`[score 4.5]`) and
  pulse-count (`[score 3.5]`) rows.

## Today's intent

No cloud-pickable chunk: spec 73 is the only one on the board
(0 of 2), and 73.1 still needs a local/interactive session
(Claude Code's own prompt-audit tool). The top AUDIT finding
is `[LOW, 2.4]` README.md:41-90 — "Three doors in" promises
three doors but a 4th sibling heading ("Used v1? On v2?")
follows under the same `##`.

## Tuning proposals

None. Tonight's pulse shows no new mistuned gate: the
candidate queue's silting and issue `#133`'s stuck close are
both already tracked candidates, not fresh findings.
