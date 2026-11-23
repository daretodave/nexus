# Digest — 2026-11-23

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two quiet days of no-op ticks gave way this afternoon to one
unbroken ~1h13m chain: spec 69 finished its last chunk, spec
70 shipped start to finish (4 chunks), and spec 71 landed two
of its three chunks — one small doc chunk (71.3) is all that
stands between here and an empty board, and nothing needs
you right now.

## While you were out

`seven_day utilization: 0.01 (allowed, resets
2026-11-30T08:00:00Z)`.

Window: since the last digest commit (2026-11-21 17:51 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-21 20:53 → 20:54 | march | no-op. |
| 11-22 01:17 → 01:17 | march | no-op. |
| 11-22 11:19 → 11:26 | march → build | `146a131`/`04bb538`/`54870cf` — 69.4 (`recovery.md`'s "lost the machine" pointer to Resurrection), closed + settled; spec 69 complete. |
| 11-22 19:36 → 19:37 | march | no-op. |
| 11-23 01:40 → 01:41 | march | no-op. |
| 11-23 12:32 → 12:38 | march → triage | `87d4fe7` — 1 issue routed (`#127`, closed per the #96/#91 precedent — no new cadence lever). |
| 11-23 12:38 → 12:43 | march (chain) → chunk | `c72c06a` — chunk spec 70 (70.1 next). |
| 11-23 12:43 → 12:50 | march (chain) → build | `0db8e04`/`cb36bac`/`cfee76f` — 70.1 (`bootstrap-automation.md`'s two-ring resolution + fan-out), closed + settled. |
| 11-23 12:50 → 13:04 | march (chain) → build | `f0282a0`/`bc3974e`/`7ea59a8`/`90a3ae9` — 70.2 (missing-key message names ring + holder file + runbook), closed + settled. |
| 11-23 13:04 → 13:12 | march (chain) → build | `ea65207`/`9b5d2c0`/`ff8b217` — 70.3 (`/oversight`'s names-only custody-table presence check), closed + settled. |
| 11-23 13:12 → 13:21 | march (chain) → build | `e545430`/`2f0c8d1`/`25a5897` — 70.4 (polyrepo's custody map rides the plan repo), closed + settled; spec 70 complete. |
| 11-23 13:21 → 13:26 | march (chain) → chunk | `7296757` — chunk spec 71 (71.1 next). |
| 11-23 13:26 → 13:35 | march (chain) → build | `e39ead4`/`ea78296`/`a5e99ed`/`d8352f0`/`790bde2` — 71.1 (heartbeat's cancel step skips a non-active watched workflow), closed + settled. |
| 11-23 13:35 → 13:45 | march (chain) → build | `0c56d22`/`813b49c`/`2427d47`/`b9f3868`/`fc957a7` — 71.2 (march/night retry watchdog capped under job timeouts), closed + settled. |

`heartbeat` ran clean throughout (5/5 sampled). One unbroken
chain ran 12:32 → 13:45 (~1h13m, 1 triage + 2 chunk ops + 6
build chunks across 3 specs); a quiet gap follows, 13:45 to
now (~8h27m), still open as of this digest.

## Shipped

- Spec 69 complete (4 of 4 chunks): the workspace ring's
  resurrection story — `templates/workspace/KEYS.md`,
  `workspace-doctor.mjs`'s dead-ring check,
  `workspace.md`'s Resurrection section, and
  `playbooks/recovery.md`'s pointer at it.
- Spec 70 complete (4 of 4 chunks): nexus's own `/bootstrap`
  and `/oversight` read both secret rings end to end —
  `bootstrap-automation.md`'s resolution order + fan-out, the
  missing-key message's ring/holder/runbook, `/oversight`'s
  names-only custody-row check, and `polyrepo.md`'s shared
  custody map riding the plan repo.
- Spec 71 chunked; 2 of 3 chunks shipped: `heartbeat.yml`'s
  cancel step now skips a non-active watched workflow instead
  of failing the whole watchdog (71.1), and `march.yml`/
  `night.yml` cap the Claude Code retry watchdog's wait under
  the job's own timeout (71.2). Next ready chunk: 71.3 (S,
  `.github/CLOUD_LOOP.md` + `playbooks/cloud-loop.md` docs the
  two env vars), cloud-pickable.
- `#127` (heartbeat realized-cadence recurrence) triaged and
  closed same-day: the owner's #96 close already chose this
  tradeoff knowingly, no new lever exists, re-opening
  `/oversight` would be noise.
- Audit refreshed (pass 134, was 3 days stale): swept
  doc-drift, completeness, link/tree, freshness and loop
  dimensions (G/H skipped — no sibling repos locally, no
  `NEXUS_CLI_GATE`). Specs match the roadmap table, CHANGELOG
  trails 71.2, prompts/README cross-refs hold, no live stale
  model ids. Loop has shipped room (`loop-rows.mjs status`:
  room, last shipped 2026-11-16) but no new concrete lever
  beyond the cadence row already closed today. No findings —
  Pending stays empty.

## Queues now

- **Build plan:** 6 specs, 1 chunk left (71.3, S,
  cloud-pickable — no workflow-file edit), 0 held.
- **AUDIT:** 0 pending, last pass 2026-11-23 (pass 134, fresh
  — just refreshed this digest after going 3 days stale;
  narrative above).
- **CRITIQUE:** 5 pending, last pass 2d ago (pass 38: 1 high,
  3 med, 1 low).
- **CANDIDATES:** 7 pending (6 >21d), oldest 144d (proposed
  2026-07-03) — unchanged this window (no promotions, no
  cuts); already tracked by three filed candidates (`[score
  4.8]` heartbeat's quota-skip blind spot, `[score 4.5]`
  crash-alarm dedupe matching by title only, `[score 3.5]`
  `pulse.mjs`'s own `[promoted]`-row pending-count gap — the
  gap this section's count runs into) rather than a fresh one.
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
  `[needs-user-call]` rows, and no blocked chunks — the one
  issue this window (`#127`) closed itself same-day on a
  precedent, nothing waiting on you.
- auto-promoted none — no candidate is inside its veto window
  this tick (`promote.mjs sweep`: clean), even though the
  queue is silted enough to qualify (6 pending >21d, oldest
  144d) — see Queues now for the three candidates already
  tracking it.

## Today's intent

Spec 71's last chunk, 71.3 (S) — document
`CLAUDE_CODE_RETRY_WATCHDOG` and
`CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` in
`.github/CLOUD_LOOP.md` and `playbooks/cloud-loop.md` — is
ready and cloud-pickable. AUDIT is freshly empty this pass
(just refreshed); CRITIQUE's top pending row (HIGH: the
onboarding mobile footer's local-only trust line clips
off-screen) is the next real UI fix once a session can run
the CLI gate.

## Tuning proposals

none — today's unbroken ~1h13m chain (1 triage + 2 specs
finished end to end, one still mid-flight) is itself evidence
the gate isn't starved; the two-day quiet stretch before it
is the same realized-cadence shape `#127` already closed
today with "no new lever exists." The candidates queue's
silting (6 pending >21d, oldest 144d) stays tracked by the
three already-filed candidates rather than a fresh one.
