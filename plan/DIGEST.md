# Digest — 2026-11-27

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet day: two short chains closed the heartbeat-cadence
issue's 10th and 11th recurrence (`#143`, `#144`) and filed
two candidates — one from field research, one from `/expand`
naming the cadence alarm's own re-fire pattern — nothing
blocks tonight's pass.

## While you were out

`seven_day utilization: 0.06 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-26 19:48:47 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-27 01:43 → 01:47 | march → triage | `e766ff7` — 1 issue routed (`#143` closed, heartbeat-cadence recurrence, same owner call as `#96`/`#127`/`#129`/`#130`/`#131`/`#132`/`#137`/`#139`). |
| 11-27 01:47 → 01:53 | march (chain) → research | `819c443` — field pass, 1 candidate filed (bounded loops with an explicit stop condition); two more findings dropped by the naming gate as re-evidence of existing rows. |
| 11-27 01:53 → 01:57 | march (chain) | no-op — nothing ready. |
| 11-27 01:57 → 02:05 | march retry → expand | `4001151` — pass 31, 1 candidate (heartbeat's cadence alarm re-firing on an already-answered tradeoff, now 10 times). |
| 11-27 02:05 → 02:12 | march (chain) | no-op — nothing ready; chain ended. |
| 11-27 12:13 → 12:16 | march → triage | `d8d0d9b` — 1 issue routed (`#144` closed, same recurrence/owner call, the 11th). |
| 11-27 12:16 → 12:23 | march (chain) | no-op — nothing ready; latest completed tick. |

`heartbeat` ran clean throughout (2/2 sampled). Two unbroken
chains: 01:43 → 02:12 (~29m: 1 triage + 1 research pass +
1 expand pass + 2 no-ops) and 12:13 → 12:23 (~10m: 1 triage +
1 no-op). Quiet gaps: 02:12 → 12:13 (~10h1m), 12:23 → now
(~7h10m).

## Shipped

- Triage closed `#143` and `#144` — the 10th and 11th
  identical "heartbeat: march realized cadence below 40%"
  report since `#91`, each closed on the owner's standing
  call: the 3-hourly cron keeps delivering under 40% of its
  promised slots on purpose, because chained ticks, not the
  cron, carry the throughput.
- `research` searched this pass's due topics (loop
  engineering, Claude Code/Agent SDK releases, spec-driven dev
  kits, AI code review in CI) and filed one candidate — short,
  bounded loops with an explicit stop condition and a
  trustworthy check outperform long autonomous ones, a second
  independent line of field guidance for the shape this kit
  already uses.
- `expand` pass 31: both Pending AUDIT rows still sit below the
  promote floor, so it handed off per `iterate.md` §6 instead
  of manufacturing churn. Signal C (triage pattern) cleared the
  bar on its own — ten identical cadence-alarm closes since
  `#91`, none changing anything — and filed that pattern itself
  as a candidate.

## Queues now

- **Build plan:** 1 spec, 2 chunks left, 0 held. 73.1 is still
  local-session-only (needs an interactive `/doctor
  prompt-audit` run); no cloud-pickable chunk exists.
- **AUDIT:** 2 pending (both LOW, README voice/comprehension),
  last pass 2026-11-26 17:29 UTC (pass 137) — not stale.
- **CRITIQUE:** 3 pending, last pass 44h ago (pass 40).
- **CANDIDATES:** pulse reads 16 pending (7 >21d), oldest 148d
  (proposed 2026-07-03) — still inflated by the same 4
  `[promoted]`-tagged rows never relocated out of `## Pending`
  (the known gap, `[score 3.5]` below); genuine open count is
  12, up 2 today (research + expand each filed one).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Improve:** `bold` · overrides: Support fix-all, Promote
  aged, Generators 7 listed, stall_action promote, loop on,
  Research 3d.

## Unreleased CLI fixes

16 since `cli-v0.6.5` (0 new this window) — `1245523`
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

- Issue `#133` (spec 76's mirror) is still stuck open, now
  ~2 days after spec 76 shipped — nobody has closed it by hand
  yet. The `spec-close` root cause is already filed as a
  candidate (`[score 5.5]`), not yet promoted.
- auto-promoted none — `promote.mjs sweep`: clean, no candidate
  inside its veto window this tick. oversight needed: candidate
  queue silting (7 pending >21d, oldest 148d) — tracked by the
  already-filed heartbeat quota-skip (`[score 4.8]`),
  crash-alarm dedupe (`[score 4.5]`), pulse-count (`[score
  3.5]`) rows, and now the cadence-alarm re-fire pattern itself
  (`[score 6.8]`, filed this window).

## Today's intent

No cloud-pickable chunk: spec 73 is the only one on the board
(0 of 2), and 73.1 still needs a local/interactive session
(Claude Code's own prompt-audit tool). The top AUDIT finding is
`[LOW, 2.4]` README.md:41-90 — "Three doors in" promises three
doors but a 4th sibling heading ("Used v1? On v2?") follows
under the same `##`.

## Tuning proposals

None. Tonight's pulse shows no new mistuned gate: the
cadence alarm's repeated re-firing and the candidate queue's
silting are both already tracked candidates (filed this very
window, in the alarm's case), not fresh findings.
