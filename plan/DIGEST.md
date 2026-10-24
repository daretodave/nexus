# Digest — 2026-10-24

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four clean cloud ticks (two triage passes routing 3 issues,
critique pass 30 filing 2 findings, a `next` tick closing 52.2
— spec 52 down to its last chunk) bookended an owner-driven CLI
marathon that shipped `@usenexus/cli` 0.5.2, while the
candidate queue's silting alarm ticks on unchanged for another
day (30 pending >21d, oldest 115d).

## While you were out

Window: since the last digest commit (2026-10-23 15:21 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-23 15:44 → 17:58 | *(owner, local)* | ~29 commits: the `@usenexus/cli` marathon continues to 0.5.2 — the 21-service stack builder completed, bidirectional secret-value pushes, session restart/recovery fixes, the infinite follow selector. |
| 10-23 18:11 → 18:16 | march → triage | 2 issues routed: #86 (oversight badge) queued into AUDIT; #85 (breakout chats) labeled needs-user. |
| 10-23 22:58 → 23:03 | march → triage | 1 issue routed: #88 (worktree collision) queued into AUDIT; #87 (oversight question context) labeled needs-user. |
| 10-24 07:02 → 07:11 | march → critique | Pass 30: 2 findings (1 HIGH: `adopt.md`/`new-project.md` commit-instruction contradiction; 1 MED: Day-1 checklist design-artifact cross-ref gap). |
| 10-24 12:31 → 12:51 | march → next | Shipped `52.2` — a hosted session's file-tool access stays inside its repo and worktree root (`additionalDirectories` honored, read-outside guard tested). |

`heartbeat` ran clean throughout (5/5 sampled, no failures).

## Shipped

- **52.2** — a hosted session's reads/writes stay inside its
  repo and worktree root; `additionalDirectories` honored and a
  read-outside guard tested. Spec 52 now has 1 chunk left
  (`52.3`).
- `@usenexus/cli` 0.5.2 published — restarts and upgrades lose
  nothing, infinite asks how to run, the 21-service stack
  builder complete with an agent guide for sessions, secret
  values that move both ways across every sink.
- Critique pass 30 — 2 new findings filed (1 HIGH, 1 MED; see
  table above).
- Triage — 3 issues routed across two ticks: #86 and #88 queued
  into `AUDIT.md`; #85 and #87 labeled needs-user for
  `/oversight`.

## Queues now

- **Build plan:** 2 specs, 9 chunks left (39: 8, pick-able; 52:
  1 — `52.3`), 0 held.
- **AUDIT:** 6 pending, header 2026-10-22 (46.5h old, <48h, not
  stale). Durable `[user-issue #35/#40/#49]` rows unchanged
  (still blocked on the cloud push token's missing `workflows`
  scope). Two fresh user-issue rows today (#86, #88). One native
  row, `[B, 5.6]` (README's secrets-vault entry-point gap) — top
  score; see Needs you.
- **CRITIQUE:** 7 pending, last pass 14h ago (pass 30, today) —
  added 1 HIGH + 1 MED this pass.
- **CANDIDATES:** 32 pending (30 >21d, oldest 115d, proposed
  2026-07-02) — unchanged count and age profile, one day older.
- **Issues:** 4 open — #86, #88 already routed into queues
  above; #87 (oversight questions lack context) and #85
  (breakout chats) sit `triage:needs-user`, undecided.

## Needs you

- **AUDIT row `[B, 5.6]`** (carried, unchanged): README's
  customization-layer doc list still never names
  `customization/secrets.md`, even though spec 42 shipped a
  full secrets vault weeks ago. Next `/iterate` pick once no
  chunk is ready.
- **oversight needed: candidate queue silting (30 pending >21d,
  oldest 115d)** — both thresholds (≥5 pending >21d, oldest
  >45d) have been blown through for weeks; nothing promoted out
  of `plan/CANDIDATES.md` in this window either.
- #87 and #85 sit `triage:needs-user`, awaiting `/oversight`'s
  call — neither is urgent, just flagging.
- Durable rows `[user-issue #35/#40/#49]` remain blocked on the
  `ACTIONS_PAT` workflows-scope gap; each needs a local/human
  session per its own `next`.

## Today's intent

Next ready chunk for the dispatcher: spec 52's `52.3` (skills
run as written in PowerShell, M). Audit's top finding once no
chunk is ready: `[B, 5.6]`.

## Tuning proposals

None this pass. All four cloud ticks in the window ran clean —
no ceiling skips, no gate mistunes, heartbeat 5/5. The standing
candidate-queue silting alarm (above) is an `/oversight` call,
not a gate tuning.
