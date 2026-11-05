# Digest — 2026-11-05

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Eleven days of silence, explained: `/digest` itself went dark
2026-10-25 → 2026-11-04 — not failing, just quietly skipped
every night by a quota gate holding a stale `allowed_warning`
reading — and only runs again tonight because `cc63b38` (this
window) taught the gate that a reading past its own
`resetsAt` is stale, whatever its status. `march` never missed
a beat through the same window and just moved to an hourly
cadence (`79980b2`). The detection gap that let 11 days pass
unnoticed is itself filed below as a candidate.

## While you were out

Window: since the last digest commit (2026-10-25). `seven_day
utilization: 0.89 (allowed_warning, resets 2026-10-26T08:00:00Z)`
— the last cached reading, itself the stale one `cc63b38` just
stopped trusting; the next tick that reaches the model refreshes
it.

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-26 → 11-04 (10 ticks) | night → *(quota-gate skip)* | `/digest` never ran — the cached `allowed_warning` reading's reset had passed, and a skipped tick can't refresh its own cache; every run still reported overall `success` (see Needs you). |
| 10-26 → 11-05 (continuous) | march → next/iterate | Kept running clean throughout the same window (`gh run list --workflow march`: every sampled tick `success`, several a day) — the stuck gate was night-only. |
| 11-05 13:31 | *(owner, local)* | `cc63b38` — the quota gate now treats any cached reading past its `resetsAt` as stale and fails open, whatever its status; the skip loop that parked night 10-26..11-04 is broken. |
| 11-05 13:33 | *(owner, local)* | `79980b2` — `march`'s cadence moves to the `sprint` preset: hourly at `:17` (was every 3h), ceiling 30 (was 20), `NEXUS_CHAIN_MAX` override removed so the preset's chain depth 8 stands. |
| 11-05 18:08 | night → digest | This tick — the first `/digest` to actually reach the model since 2026-10-25. |

`heartbeat` ran clean throughout (5/5 sampled, no failures) —
its own cadence alarm never fired on night's 11-day gap; see
Needs you for why.

## Shipped

- Nothing by `/digest` itself (it ships nothing, ever). In the
  window: `cc63b38` (quota-gate staleness fix) and `79980b2`
  (march → `sprint` cadence), both owner/local, both outside
  this tick.
- Audit refreshed this pass (see Queues now): two new Pending
  rows (`[A, 3.6]`, `[C, 2.4]`), the two pre-existing rows
  (`[B, 5.6]`, `[E, 2.1]`) re-verified unchanged.

## Queues now

- **Build plan:** 1 spec, 5 chunks left, 0 held. Next ready:
  spec 39 (priority 7), `39.8`.
- **AUDIT:** 4 pending (refreshed this pass — header was
  2026-10-25, 11 days stale; fresh A-G sweep delegated to a
  research agent to protect context, dimension H skipped —
  no `NEXUS_CLI_GATE`, no `node_modules`/`dist` — dimension I
  not separately filed, folded into this digest's own Tuning
  proposals instead). New: `[A, 3.6]` `plan/bearings.md`'s
  locked Stack table still says "Node ≥18"; `[C, 2.4]`
  `identity/footguns.md:10`'s `#footguns-the-ladder` anchor
  doesn't resolve in `identity/README.md`. Unchanged: `[B, 5.6]`
  (README's secrets-vault entry-point gap, top score), `[E,
  2.1]` (bash-only syntax outside 52.3's scope).
- **CRITIQUE:** 6 pending, last pass 13d ago.
- **CANDIDATES:** 31 pending (30 >21d), oldest 127d (proposed
  2026-07-02) — one new row filed this pass (see Tuning
  proposals).
- **Support:** 0 open user issues · first response none (0
  opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 1 since `cli-v0.6.5` —
  `ca3c79f` feat: loop throughput (mirror-orphan generator,
  depth promotion, product-first pick, Research `<n>d`).

## Needs you

- Candidate queue silting (30 pending >21d, oldest 127d) clears
  both auto-promotion thresholds, but `node
  scripts/plan/promote.mjs sweep` reports **auto-promoted
  none** — nothing is in a veto window right now.
  `Promote: aged` is nexus's own posture, so the next
  `/expand` pass is where a pick actually happens; this digest
  only reports state.
- `motion stalled`: shipped 25 / baseline 153.25 ·
  2026-W44 against 2026-W40..2026-W43 (1 so far in 2026-W45) —
  under the 76.63 floor. Partly explained by the same window
  this digest just diagnosed: `march` kept shipping through
  it, but the loop was carrying an undiagnosed quota-gate skip
  on its sibling workflow; worth re-checking after a clean full
  week on the new `sprint` cadence before tuning further.
- No `triage:needs-user` issues, no `[needs-user-call]` rows,
  no secrets overdue for rotation (`secrets.mjs audit`: 0
  events).
- **New finding, not yet actioned:** `heartbeat.yml`'s cadence
  alarm measures a workflow's overall run conclusion, which a
  quota-gate skip never flips to failure — it reported
  `success` all 10 days night sat dark, so the alarm built
  specifically to catch this never fired. Filed as a
  `plan/CANDIDATES.md` tuning proposal (score 4.8) rather than
  edited directly, per this skill's meta-loop rail; `/oversight`
  decides.

## Today's intent

Next ready chunk for the dispatcher: spec 39's `39.8` (a
no-deploy-host path in the templates, S). Audit's top finding
once no chunk is ready: `[B, 5.6]` (README's secrets-vault
entry-point gap).

## Tuning proposals

One: **heartbeat's cadence check counts a quota-gate-skipped
tick as a successful run** (`plan/CANDIDATES.md`, score 4.8,
proposed 2026-11-05). `check_cadence()`
(`.github/workflows/heartbeat.yml:159-194`) alarms on "no
successful tick in Nh" by reading `gh run list --workflow
"$wf" --status success` — but a quota-gate skip leaves every
step after the gate `skipped`, not `failed`, so the workflow's
own conclusion still reads `success` and the alarm's timer
keeps resetting even when zero real work happens underneath
it. That's exactly how night's 11-day gap (`cc63b38`'s root
cause) went unreported: the one watchdog built for this never
tripped. March's own cadence check shares the same `--status
success` filter, so it carries the identical blind spot,
untested only because march's ticks never actually stalled
this window. Proposal (not applied): key `check_cadence()` off
the newest run's own named model step via `gh run view --json
jobs`, not the bare workflow conclusion. Needs a human call on
how to name the step per workflow without hardcoding something
a future rename breaks, and whether a brand-new adopter repo
(no cached quota reading yet) needs a special case. Never
edited directly — proposal only; `/oversight` promotes.
