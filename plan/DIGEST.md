# Digest — 2026-10-25

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A ~24h marathon: 8 chunks shipped across specs 39/52/55/56/57
(spec 52 now complete), two `@usenexus/cli` releases (0.5.3,
0.5.4), three new specs planned (54–59), and aged candidate
promotion went live (57.1) — while three long-carried
`[user-issue #35/#40/#49]` audit rows turned out to have been
closed four days ago and only now got swept to Done.

## While you were out

Window: since the last digest commit (2026-10-24 14:07 UTC).
`seven_day utilization: unknown (no cached reading)` — no
quota cache available to this run; the next scheduled tick
restores it from its own cache.

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-24 16:37 | *(owner, local)* | `@usenexus/cli` 0.5.3 published — oversight questions read plainly, a talk-it-through breakout, the badge counts what the screen counts, a session's branch never double-checked-out. |
| 10-24 17:26 → 17:34 | march → next | Shipped `52.3` (worktree-cutting skills call `worktree.mjs` in one node call, no bash-only syntax; a new `dualshell` gate leg catches it) — spec 52 complete, archived. Filed `[E, 2.1]`: the new leg's scope deliberately excludes the rest of `skills/`. |
| 10-24 22:31 | march → next | Shipped `39.9` — package manager is a placeholder end to end, not hardcoded pnpm. |
| 10-25 07:39 | march → next | Shipped `39.10` — template settings allowlist, `.env.example` sweep note, tick-order fix. |
| 10-25 12:05 | *(owner, local)* | `@usenexus/cli` 0.5.4 published — `auto` and "Allow everything" stop asking about reads outside the repo; `body-parser` 2.4.0. |
| 10-25 13:17 → 13:18 | march → next | Shipped `39.12` — settle stops cleanly (not a crash) when a close empties a spec; fixed inline, same tick. |
| 10-25 13:35 | *(owner, local)* | Planned specs 54–58: support lane, cadence that delivers, the loop browses the GUI, the queue refills itself, one upgrade command. |
| 10-25 14:18 | *(owner, local)* | Shipped `55.1` — the quota governor: every tick reads `seven_day`, a lockout opens one pause issue, the gate skips the model until reset, heartbeat stays quiet meanwhile. |
| 10-25 14:23 | *(owner, local)* | Planned spec 59: one improvement dial over every expansion knob, plus a field-research track that never names anyone. |
| 10-25 14:23 | *(owner, local)* | Shipped `56.1` — the demo answers the tokenless hello, so no demo screen logs a 403. |
| 10-25 14:25 | *(owner, local)* | Shipped `57.1` — aged promotion lands in Held with a veto issue; `plan/bearings.md` flips `Promote: owner` → `Promote: aged`. |

`march` ran 20/20 clean through this window and the one before
it, then was disabled manually at 13:36 UTC — consistent with
`CLOUD_LOOP.md`'s "pause before driving the local loop"
guidance; the owner's local session above picked up right
after. `heartbeat` ran clean throughout (5/5 sampled, no
failures).

## Shipped

- **52.3** (spec 52 complete) — worktree-cutting skills call
  `worktree.mjs` in one node command; the new `dualshell` gate
  leg flags bash-only syntax in that scope.
- **39.9** — package manager is a placeholder end to end.
- **39.10** — template settings allowlist, sweep note, tick
  order.
- **39.12** — settle stops cleanly when a close empties a spec.
- **55.1** — the quota governor (read `seven_day`, pause on
  lockout, gate the next tick).
- **56.1** — the demo answers the tokenless hello (no 403).
- **57.1** — aged promotion lands in Held with a veto issue;
  nexus's own `Promote` posture is now `aged`.
- `@usenexus/cli` 0.5.3 and 0.5.4 published.
- Specs 54–59 planned (support lane, cadence, GUI browsing,
  queue refill, upgrade command, improvement dial).

## Queues now

- **Build plan:** 7 specs, 54 chunks left, 0 held. Next ready:
  spec 54 (priority 1), `54.1`.
- **AUDIT:** 2 pending (refreshed this pass — header was
  2026-10-22, 3 days stale). `[user-issue #35/#40/#49]` were
  all closed on GitHub 2026-10-21 and moved to Done; only
  `[B, 5.6]` (README's secrets-vault entry-point gap, top
  score) and `[E, 2.1]` (bash-only syntax outside 52.3's scope)
  remain.
- **CRITIQUE:** 7 pending, last pass 38h ago (pass 30,
  2026-10-24).
- **CANDIDATES:** 32 pending (30 >21d), oldest 116d (proposed
  2026-07-02) — unchanged count and age profile.
- **Issues:** 0 open.

## Needs you

- Candidate queue silting (30 pending >21d, oldest 116d) still
  clears both auto-promotion thresholds, but
  `node scripts/plan/promote.mjs sweep` reports **auto-promoted
  none** — nothing is in a veto window right now. `57.1`
  (shipped today) just switched nexus's own posture from
  `Promote: owner` to `Promote: aged`, so the next `/expand`
  pass is where a pick actually happens; this digest only
  reports state, it doesn't promote anything itself.
- No `triage:needs-user` issues, no `[needs-user-call]` rows,
  no secrets overdue for rotation (`secrets.mjs audit`: 0
  events).
- Durable rows `[user-issue #35/#40/#49]` are resolved and
  archived to AUDIT.md's Done section this pass (see Queues
  now) — nothing left to act on there.

## Today's intent

Next ready chunk for the dispatcher: spec 54's `54.1` (issue
and page text is data; lint scans prompt inputs, S). Audit's
top finding once no chunk is ready: `[B, 5.6]` (README's
secrets-vault entry-point gap).

## Tuning proposals

None this pass. Every sampled tick ran clean (march 20/20,
heartbeat 5/5) across an unusually productive window; no
ceiling skips, no gate mistunes, no starved queue beyond the
already-known candidate silt (above, now being addressed by
today's `Promote: aged` switch rather than a fresh gate
tuning).
