# Digest — 2026-11-08

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four ticks, four small fixes off the audit queue — a
secrets-vault doc link, the CLI favicon 404, a test wired into
the scripts gate, and a critique-filed contradiction in
`adopt.md`'s commit instructions — plus a fresh audit pass
(126 → 127, 0 findings on two full sweeps). Nothing moved on
the three Held specs or the candidates queue: motion is still
reading `stalled`, and `#96` (cadence) remains parked
needs-user-call.

## While you were out

Window: since the last digest commit (2026-11-07 20:42 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-07 20:53→20:59 | march → iterate | `2b540f7` — closed `[B, 5.6]` (closes `#99`): README's "What you get" section never linked `customization/secrets.md` from prose; added it to the `/bootstrap` row. |
| 11-08 00:37→00:46 | march → iterate | `972fe48` — closed `[H, 5.6]` (closes `#100`): fleet-to-tug's missing favicon 404'd on every screen; added `favicon.svg` (the GUI's own fleet-grid glyph) and the `<link rel="icon">` tag. |
| 11-08 07:22→07:27 | march → iterate | `faec80f` — closed `[B, 4.2]` (closes `#101`): `design-render-run.test.mjs` ran in no gate; wired into `GIT_SUITES`. Step 0 swept clean (no veto/release); no ready chunk; expand not due. |
| 11-08 15:12→15:22 | march → critique | `080cdb3` — pass 30's HIGH row: `adopt.md` told the delegating agent "one commit" while `new-project.md` gives five named commits along the way; `adopt.md` now excepts the playbook's own intermediate commits. Also ran a full `/iterate` pass: dimension H (72-screen walk, 0 findings), dimension F (no stale model-id refs) — AUDIT's Pending rows all held, pass bumped 126 → 127. |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.66 (allowed)` — up from 0.35
yesterday, still comfortably clear.

## Shipped

- `/iterate`: closed `[B, 5.6]` (README secrets-vault link,
  `#99`), `[H, 5.6]` (CLI favicon 404, `#100`), `[B, 4.2]`
  (`design-render-run.test.mjs` ungated, `#101`) — three
  Pending rows in three ticks, each mirrored to its issue
  before shipping.
- `/critique` pass 30: fixed `adopt.md`'s commit-instruction
  contradiction with `new-project.md` (the HIGH row this pass
  picked).
- `/iterate` audit refresh: a fresh 72-screen UI walk and a
  model-id sweep both came back clean; `plan/AUDIT.md`'s
  existing Pending rows all still hold (pass 126 → 127).

## Queues now

- **Build plan:** 3 specs, 0 chunks (`60`, `61`, `62` all "not
  chunked yet"), 3 held — all three still in veto window (see
  Needs you).
- **AUDIT:** 6 pending, header 2026-11-08 (fresh, this pass).
  Top content finding is `[A, 3.6]`: `plan/bearings.md`'s
  locked Stack table still says "Node ≥18" against the 20+
  floor.
- **CRITIQUE:** 5 pending, last pass 16d ago — unchanged
  (today's pick was pass 30's own HIGH row, already filed).
- **CANDIDATES:** 26 pending (22 >21d), oldest 129d (proposed
  2026-07-02) — no promotions or cuts since the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 2 since `cli-v0.6.5` — `972fe48`
  fix(cli): favicon 404, and `ca3c79f` feat: loop throughput
  (mirror-orphan generator, depth promotion, product-first
  pick, Research `<n>d`); one new since yesterday.

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
  throttling. Re-flagged again this pass with no new action.
- motion stalled: shipped 25 / baseline 153.25 · 2026-W44
  against 2026-W40..2026-W43 (12 so far in 2026-W45).
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (local-only check, skipped on
  this cloud run). No new Pending-cap cuts since the last
  digest.

## Today's intent

No ready chunk — all three specs (`60`, `61`, `62`) are
"planned," not yet chunked, and all sit in their veto windows.
Audit's top content finding (score 3.6): `plan/bearings.md`'s
locked Stack table still says "Node ≥18," three ticks after the
floor moved to 20+.

## Tuning proposals

none — the candidate-aging silt guard (phase 30) is already
surfacing the queue's growth above in Needs you; no new
mistuned gate observed this pass.
