# Digest — 2026-11-28

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A busy day: two chains closed the heartbeat-cadence issue's
12th and 13th recurrence (`#145`, `#149`), ran critique pass
41 (5 findings, most fixed same-day) and expand pass 32
(auto-promoting spec 79 into its veto window), and landed two
`/board` mobile fixes plus three README doc fixes — nothing
blocks tonight's pass.

## While you were out

`seven_day utilization: 0.08 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-27 19:37:00 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-27 21:17 → 21:20 | march → triage | `753ecbb` — 1 issue routed (`#145` closed, heartbeat-cadence recurrence, same owner call as `#144`/`#143`/`#139`/`#137`/`#132`/`#131`/`#130`/`#129`/`#127`/`#96`/`#91`). |
| 11-27 21:20 → 21:36 | march (chain) → critique | `582974b` — pass 41, 5 findings (1 high, 3 med, 1 low). |
| 11-27 21:36 → 21:51 | march (chain) → fix | `a3ee42c` — `/board` mobile grid stacks instead of squeezing the main column. |
| 11-27 21:51 → 21:57 | march (chain) → docs | `d7c1183` — README's playbook reading-time estimates agree. |
| 11-27 21:58 → 22:09 | march (chain) → fix | `31189d9` — `/board` empty-state CTA matches the toolbar's wording. |
| 11-27 22:09 → 22:15 | march (chain) → docs | `7904950` — README's TL;DR checklist adds the prune sub-step. |
| 11-27 22:15 → 22:22 | march (chain) | no-op — nothing ready; chain ended. |
| 11-28 07:44 → 07:51 | march → docs | `58caff3` — README's "what landed" checklist names `package.json`. |
| 11-28 07:51 → 07:55 | march (chain) → triage | `5a180ce` — 1 issue routed (`#149` closed, same recurrence/owner call, the 13th). |
| 11-28 07:55 → 08:05 | march (chain) → expand | `a7846e8` — pass 32, 0 new, 3 re-evidenced, auto-promoted spec 79 (veto until 2026-11-30). |
| 11-28 08:05 → 08:13 | march (chain) | no-op — nothing ready; chain ended. |
| 11-28 17:30 → 17:37 | march | no-op — nothing ready; latest completed tick. |

`heartbeat` ran clean throughout (5/5 sampled). Two unbroken
chains: 21:17 → 22:22 (~1h5m: 1 triage + 1 critique pass +
2 fixes + 2 docs fixes + 1 no-op) and 07:44 → 08:13 (~29m:
1 docs fix + 1 triage + 1 expand pass + 1 no-op). Quiet gaps:
22:22 → 07:44 (~9h22m), 08:13 → 17:30 (~9h17m), 17:37 → now
(~44m).

## Shipped

- Triage closed `#145` and `#149` — the 12th and 13th
  identical "heartbeat: march realized cadence below 40%"
  report since `#91`, each closed on the owner's standing
  call: the 3-hourly cron keeps delivering under 40% of its
  promised slots on purpose, because chained ticks, not the
  cron, carry the throughput.
- `critique` pass 41 filed 5 findings (1 high, 3 med, 1 low);
  the chain fixed the top ones same-day — two `/board` mobile
  layout fixes and three README doc fixes — leaving 3 LOW
  findings pending (`plan/CRITIQUE.md`).
- `expand` pass 32: 0 new candidates, 3 re-evidenced, and spec
  79 (the cadence alarm's own re-fire pattern) auto-promoted
  into the roadmap's Held lane, `#151`, veto until 2026-11-30.

## Queues now

- **Build plan:** 2 specs, 2 chunks left, 0 held. 73.1 is
  still local-session-only (needs an interactive `/doctor
  prompt-audit` run); 73.2 waits on it; no cloud-pickable
  chunk exists.
- **AUDIT:** 2 pending (both LOW, README voice/comprehension),
  last pass 2026-11-27 (pass 139) — not stale.
- **CRITIQUE:** 3 pending, last pass 42h ago (pass 41).
- **CANDIDATES:** 15 pending (7 >21d), oldest 149d (proposed
  2026-07-03).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Improve:** `bold` · overrides: Support fix-all, Promote
  aged, Generators 7 listed, stall_action promote, loop on,
  Research 3d.

## Unreleased CLI fixes

18 since `cli-v0.6.5` (2 new this window: `31189d9`, `a3ee42c`)
— `1245523` fix(cli): /board — size badges and claims phase
words get a legend, `a01871a` fix(cli): onboarding stepper
names the next step on mobile, `ec03e70` fix(cli): onboarding
stepper steps get a hover hint, `0ad7117` fix(cloud): runClean
decodes stdout/stderr once, not per chunk, `3962535` fix(cli):
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
`ca3c79f` feat: loop throughput (mirror-orphan generator,
depth promotion, product-first pick, Research `<n>d`),
`a3ee42c` fix(cli): /board — mobile grid stacks instead of
squeezing the main column, and `31189d9` fix(cli): /board —
empty-state CTA matches the toolbar's wording.

## Needs you

- Issue `#133` (spec 76's mirror) is still stuck open, now
  ~3 days after spec 76 shipped — nobody has closed it by hand
  yet. The `spec-close` root cause is already filed as a
  candidate (`[score 5.5]`), not yet promoted.
- auto-promoted 79 Heartbeat's realized-cadence alarm re-fires
  for a cron tradeoff the owner already explicitly accepted,
  now 10 times (veto until 2026-11-30, `#151`), 0 awaiting —
  the only Held line. Candidate queue silting: 15 pending
  (7 >21d, oldest 149d) — already tracked by filed candidates,
  not a fresh finding.

## Today's intent

No cloud-pickable chunk: spec 73.1 still needs a
local/interactive session and 73.2 waits on it; spec 79 sits
in its veto window until 2026-11-30. The top AUDIT finding is
`[LOW, 2.4]` README.md:41-90 — "Three doors in" promises three
doors but a 4th sibling heading ("Used v1? On v2?") follows
under the same `##`.

## Tuning proposals

None. Tonight's pulse shows no new mistuned gate: the cadence
alarm's repeated re-firing and the candidate queue's silting
are both already tracked candidates, and motion is `ok`
against the floor (50 shipped vs. baseline 22.5).
