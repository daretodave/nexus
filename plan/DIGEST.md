# Digest — 2026-11-07

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four quiet-looking ticks closed real ground: `/expand`
auto-promoted spec 62 (handshake runbook, depth promotion
under the stalled-motion lever), `/iterate` pass 126 fixed a
silent routing bug in `support.mjs` (a dropped `gh` field had
every triage call falling back to stock routing unnoticed),
and `#93`/`#96` both got owner-aware closes instead of pointless
replots — but motion is still reading `stalled` and the
candidates queue keeps silting.

## While you were out

Window: since the last digest commit (2026-11-06 17:42 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-06 23:16, 23:20 | march → triage | `582d0fc`/`dbe03c9` — `#96` (cadence alarm, recurring) and `#97` (support.mjs `gh` field bug) routed, both `triage:loop-queued`. |
| 11-07 02:54→03:01 | march → expand/support/iterate | `2f567bf`→`cdb3008` — depth-promoted candidate 62 into Held (veto until 2026-11-10, `#98`); closed `#93` (heartbeat flatline, non-recurring, `#67`/`#54` precedent); fixed `support.mjs`'s `ghIssue()` (stale `authorAssociation` field). |
| 11-07 10:11→10:16 | march → support SLA | `4d0eb6a` — `#96` parked `[needs-user-call]` on its existing AUDIT row (plot's own Step 5 failure mode: a workflow-file push no cloud tick can land). |
| 11-07 16:27→16:32 | march → iterate | `53fe400` — pass 126's top finding: builder briefs never told a delegated builder about the Cloud-Run trailer; fixed in both `skills/next/build.md` and its template twin. |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.35 (allowed)` — comfortably clear.

## Shipped

- `triage`: 2 issues routed (`#96` cadence recurrence, `#97`
  support.mjs bug).
- `/expand` depth promotion: candidate 62 ("Handshake runbook
  profile for setup/", score 7.9, 127d old) auto-promoted into
  Held — spec `62-handshake-runbook-profile.md` plus its
  roadmap row, veto until 2026-11-10 (`#98`).
- `support.mjs sla`: `#93` closed (non-recurring flatline,
  `#67`/`#54` precedent); `#96` parked `[needs-user-call]`
  rather than plotted — the only remaining lever is a
  workflow-file push.
- `/iterate` pass 126: fixed `support.mjs`'s `ghIssue()` (was
  reading a `gh` field current CLI dropped, silently defeating
  spec 54's trust-based routing on every tick); added direct
  test coverage that had never existed. Also closed out the
  builder-brief Cloud-Run-trailer gap (`[B, 5.6]`) in
  `skills/next/build.md` and its template twin.

## Queues now

- **Build plan:** 3 specs, 0 chunks (`60`, `61`, `62` all
  "not chunked yet"), 3 held — all three in veto window (see
  Needs you).
- **AUDIT:** 9 pending, header 2026-11-07 (fresh, this pass).
  Top score is a tie at 5.6: README's secrets-vault
  entry-point gap (`[B, 5.6]`) and the GUI favicon 404
  (`[H, 5.6]`).
- **CRITIQUE:** 6 pending, last pass 15d ago — unchanged.
- **CANDIDATES:** 26 pending (23 >21d), oldest 129d (proposed
  2026-07-02) — no promotions or cuts since the last digest
  (62's promotion came from depth promotion, not the Pending
  cap).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 1 since `cli-v0.6.5` — `ca3c79f`
  feat: loop throughput (mirror-orphan generator, depth
  promotion, product-first pick, Research `<n>d`); unchanged
  from yesterday.

## Needs you

- auto-promoted 60 README above-the-fold conversion pass (veto
  until 2026-11-08, `#94`), 2 awaiting.
- auto-promoted 61 Versioned releases + plan/nexus.lock +
  upgrade story (veto until 2026-11-08, `#95`), 2 awaiting.
- auto-promoted 62 Handshake runbook profile for setup/ (veto
  until 2026-11-10, `#98`), 2 awaiting.
- `[needs-user-call]` — `#96` (heartbeat: march realized cadence
  below 40%, recurring): the only remaining lever is reverting
  the cadence preset, a workflow-file push no cloud tick can
  land (`agents.md` Operational secrets); needs an owner session
  to run `cadence.mjs apply <preset> --write` or accept the
  throttling.
- motion stalled: shipped 25 / baseline 153.25 · 2026-W44
  against 2026-W40..2026-W43 (9 so far in 2026-W45).
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (`secrets.mjs audit`: 0 events).
  No new Pending-cap cuts since the last digest.

## Today's intent

No ready chunk — all three specs (`60`, `61`, `62`) are
"planned," not yet chunked, and all sit in their veto windows.
Audit's top finding (tie, score 5.6): README's missing
secrets-vault entry point, or the GUI favicon 404 — whichever
`/iterate` picks first.

## Tuning proposals

none
