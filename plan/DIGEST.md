# Digest — 2026-11-24

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two unbroken chains did a full day's work: a ~58m run at
02:12 finished spec 71's last chunk and shipped spec 72 start
to finish, then a ~74m run at 13:39 triaged one more cadence
issue, chunked specs 73 and 75, shipped spec 74 start to
finish, and ran the overdue field-research pass — nothing
needs you tonight.

## While you were out

`seven_day utilization: 0.02 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-23 22:14 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-24 02:12 → 02:17 | march → triage | `12ed861` — 2 issues routed (`#128`/`#129` closed, same precedent as `#93`/`#96`/`#91`/`#127`). |
| 11-24 02:17 → 02:28 | march (chain) → build | `a5d55e8`/`7af0f05`/`f07188c` — 71.3 (retry-watchdog vars + timeout headroom documented), closed + settled; spec 71 complete. |
| 11-24 02:28 → 02:33 | march (chain) → chunk | `fe93af7` — chunk spec 72 (72.1 next). |
| 11-24 02:33 → 02:50 | march (chain) → build | `7a48754`/`d373aeb`/`5c9dbd9` — 72.1 (`legTree` derives reverse-check dirs from the tree diagrams), closed + settled. |
| 11-24 02:50 → 03:02 | march (chain) → build | `a282bac`/`0680cbc`/`f4e2471`/`6429190` — 72.2 (tree leg fails a tracked root file missing from its diagram; `CLAUDE.md`'s own root tree line fixed first), closed + settled. |
| 11-24 03:02 → 03:10 | march (chain) → build | `53e5b96`/`d5ade80`/`ff12465` — 72.3 (tree leg's derivation helpers exported, three new cases tested), closed + settled; spec 72 complete. |
| 11-24 13:39 → 13:44 | march → triage | `acd7b28` — 1 issue routed (`#130` closed, same precedent). |
| 11-24 13:44 → 13:50 | march (chain) → chunk | `307811f` — chunk spec 73 (73.1 flagged local-session-only). |
| 11-24 13:50 → 13:55 | march (chain) → chunk | `c08710b` — chunk spec 74 (74.1 next; spec 73 skipped, no cloud-pickable chunk). |
| 11-24 13:55 → 14:07 | march (chain) → build | `ec08a9a`/`6a8d4a4`/`8a9896b` — 74.1 (plan-state reads audited, classified live/stale), closed + settled. |
| 11-24 14:07 → 14:22 | march (chain) → build | `5edc3e6`/`f068bb9`/`7052448`/`26b233e`/`b46f62c` — 74.2 (`order.mjs` `statusOf` + status CLI, plugin snapshot regenerated), closed + settled. |
| 11-24 14:22 → 14:33 | march (chain) → build | `35c06fd`/`47d3ef3`/`4d3075b` — 74.3 (`/next`'s close re-reads the chunk's live status first), closed + settled. |
| 11-24 14:33 → 14:40 | march (chain) → build | `c4b17f7`/`dfde336`/`7b32316` — 74.4 (`plan-shape.md` names the read-live rule), closed + settled; spec 74 complete. |
| 11-24 14:40 → 14:48 | march (chain) → research | `fc14616` — overdue field research (3d cadence, last run 11d ago): 2 candidates filed. |
| 11-24 14:48 → 14:53 | march (chain) → chunk | `9721d32` — chunk spec 75 (next unchunked spec in table order; 75.1 next). |

`heartbeat` ran clean throughout (5/5 sampled). Two unbroken
chains: 02:12 → 03:10 (~58m, 1 triage + 1 chunk op + 5 build
chunks across 2 specs) and 13:39 → 14:53 (~74m, 1 triage + 2
chunk ops + 4 build chunks + 1 research pass across 2 specs).
Quiet gaps bracket both: 22:14 → 02:12 (~3h58m), 03:10 → 13:39
(~10h29m), and 14:53 to now (~5h53m), still open as of this
digest.

## Shipped

- Spec 71 complete (3 of 3 chunks, last one this window):
  `.github/CLOUD_LOOP.md` and `playbooks/cloud-loop.md` now
  name `CLAUDE_CODE_RETRY_WATCHDOG` and
  `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` and their cap.
- Spec 72 complete (3 of 3 chunks, all this window): the
  gate's tree leg derives its reverse-check directory list
  from the README/templates tree diagrams instead of a
  hand-kept list, fails a tracked root file missing from
  either diagram, and exports its derivation helpers under
  test (`scripts/__tests__/tree-leg.test.mjs`).
- Spec 74 complete (4 of 4 chunks, all this window): every
  place `/next`, `/march`'s dispatch and the plan scripts read
  plan state is now audited and classified live or stale; the
  one stale read found (`/next`'s close acting on an earlier
  pick) is fixed by `order.mjs`'s new `statusOf`/status CLI
  and a re-read before the pending close, and
  `concepts/plan-shape.md` names the lasting rule.
- Spec 73 chunked (0 of 2 shipped): 73.1 runs the prompt audit
  and fixes or files what it flags, but is local-session only
  — no cloud-tick credential runs `/doctor prompt-audit`
  interactively (`claude -p` has no login from this tick's
  shell); 73.2 needs it. Skipped this chain for spec 74, the
  next spec with a cloud-pickable chunk.
- Spec 75 chunked (0 of 3 shipped): the next unchunked spec in
  table order — 75.1 (M) writes `concepts/loop-honesty.md`'s
  mechanical/trust table, cloud-pickable.
- Field research pass (3d cadence, was 11d overdue): 2
  candidates filed at the promote floor — early reasoning
  drift hiding until recovery is no longer possible, and
  capping retries against a failing check before escalating.
  Neither duplicates an existing Pending row or the
  already-promoted specs 74–76.
- 2 triage ticks, 3 issues routed (`#128`, `#129`, `#130`), all
  closed same-day on the established heartbeat-cadence
  precedent (`#93`/`#96`/`#91`/`#127`) — no new lever, nothing
  reopened.
- Audit untouched this digest: last pass 2026-11-23 (pass
  134), still under 48h old.

## Queues now

- **Build plan:** 3 specs, 5 chunks left, 0 held. 73.1 is
  next by table order but local-session-only; the next
  cloud-pickable chunk is 75.1 (M, `concepts/loop-honesty.md`).
  76 is not chunked yet.
- **AUDIT:** 0 pending, last pass 2026-11-23 (pass 134, still
  fresh — not refreshed this digest).
- **CRITIQUE:** 5 pending, last pass 4d ago (pass 38: 1 high,
  3 med, 1 low).
- **CANDIDATES:** 9 pending (6 >21d), oldest 145d (proposed
  2026-07-03) — up from 7 yesterday, both new rows this
  tick's research pass (early reasoning drift, retry-cap
  escalation), proposed today so neither counts toward the
  >21d figure. The unchanged 6 >21d stays tracked by three
  already-filed candidates (`[score 4.8]` heartbeat's
  quota-skip blind spot, `[score 4.5]` crash-alarm dedupe
  matching by title only, `[score 3.5]` `pulse.mjs`'s own
  `[promoted]`-row pending-count gap) rather than a fresh one.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.

## Unreleased CLI fixes

11 since `cli-v0.6.5` (unchanged this window — no
`packages/cli` commits landed) — `6b1a5da` fix(cli): hono
4.13.19 and `@hono/node-server` 2.1.11 in the lockfile,
clearing seven advisories, `da4d724` fix(cli): onboarding
stepper shows a step count instead of clipping on mobile,
`9213170` fix(cli): Fleet tile phase track titles disambiguate
the two "Q" segments, `00b0a69` fix(cli): Oversight filter row
scrolls instead of clipping on mobile, `b348c6e` fix(cli):
mobile Welcome loop diagram no longer overlaps itself,
`a36935f` fix(cli): the onboarding Welcome headline wraps
naturally on narrow phones, `49f54b5` fix(cli): bump stale
Fable 5.1 model id/label to Fable 5.2, `23c4632` fix(test):
feed.test.mjs's fixture commits stop drifting to the loop's
own git identity, `7767c92` feat(upgrade): sync report cites
CHANGELOG.md entries (61.3), `972fe48` fix(cli): the favicon's
own 404 stops showing up as a UI-walk finding, and `ca3c79f`
feat: loop throughput (mirror-orphan generator, depth
promotion, product-first pick, Research `<n>d`).

## Needs you

- No `triage:needs-user` issues, no `loop:do` issues, no open
  `[needs-user-call]` rows, and no blocked chunks — all three
  issues this window (`#128`, `#129`, `#130`) closed themselves
  same-day on precedent, nothing waiting on you.
- auto-promoted none — no candidate is inside its veto window
  this tick (`promote.mjs sweep`: clean), even though the
  queue is silted enough to qualify (6 pending >21d, oldest
  145d) — see Queues now for the three candidates already
  tracking it.

## Today's intent

By table order, 73.1 (S) is next, but it's local-session only
(no cloud credential runs `/doctor prompt-audit`
interactively) — the next cloud-pickable chunk is 75.1 (M,
`concepts/loop-honesty.md`'s mechanical/trust table). AUDIT is
empty (pass 134, still fresh); CRITIQUE's top pending row
(HIGH: the onboarding mobile footer's local-only trust line
clips off-screen) is the next real UI fix once a session can
run the CLI gate.

## Tuning proposals

none — two unbroken chains today (3 specs shipped complete,
2 specs chunked, 3 issues triaged, one research pass) are
themselves evidence the gate isn't starved; the quiet gaps
bracketing them are the same realized-cadence shape already
closed three times over by precedent (`#93`/`#96`/`#91`/`#127`/
`#130`) with "no new lever exists." The candidates queue's
silting (6 pending >21d, oldest 145d) stays tracked by the
three already-filed candidates rather than a fresh one.
