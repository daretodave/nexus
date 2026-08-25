# Digest — 2026-08-25

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The loop is back: a ~3-week silent outage (`ACTIONS_PAT` auth
broke checkout/push and a heartbeat bug let failing march ticks
reset their own flatline timer, so no alarm ever fired) was
fixed 2026-08-23, march has run 9/9 green since, and this is
the first clean night tick since `38e8ab0` on 2026-08-01 — a
24-day digest gap now closed. In the last 26h: a RED-gate
self-inflicted block got found and fixed same-day, critique
filed a HIGH finding, and phase 22 (workspace playbook)
shipped; today's audit refresh (23 days stale) turned up one
new freshness gap and reconfirmed three open rows.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-24 08:15 | march → ship-a-phase | shipped phase 21 — `prompts/` as canonical files (`ad8ae3c`); widened the `discover` gate leg to cover `prompts/`, but `prompts/README.md` itself was never linked with a real markdown link — left the gate RED from this commit forward |
| 08-24 10:41 | night → digest | **blocked, no commit** — gate RED (see above); filed issue #36 loud per rule 6 instead of shipping a briefing that couldn't land; queue pulse gathered that tick was discarded as stale |
| 08-24 14:15 | march → iterate | shipped `fa31773` — added the missing link, gate green again, closed #36 |
| 08-24 20:07 | march → critique | **no-op** — dispatched a background dry-run adoption agent and returned without committing ("I'll wait for its completion notification"); the container ends when the run ends, so the background agent's work was lost. Live reproduction of the exact failure mode phase 20 exists to close (`[blocked: cloud push token lacks workflows scope 2026-08-23]`, tracked as issue #35) |
| 08-25 02:26 | march → critique | shipped `b7be77a` — pass 12, 1 finding (1 HIGH, 0 MED, 0 LOW): `README.md:614`'s "AskUserQuestion only in `/oversight`" hard rule is directly contradicted by `templates/skills/bootstrap.md`'s own bolded carve-out |
| 08-25 08:15 | march → ship-a-phase | shipped `ec77ec1` + `5d2d16c` — phase 22, `playbooks/workspace.md` (the un-versioned workspace root + org-per-project layout, generalizing polyrepo.md; closes #37) |
| 08-25 10:41 | night → digest | this tick — refreshed `plan/AUDIT.md` (23 days stale), wrote this briefing |

`heartbeat` ran green every ~6h throughout (60/60 sampled back
to 08-10); its own flatline-detection bug (see Headline) is
already fixed (`d28175d`, 2026-08-23) and is not itself a
finding this tick.

## Shipped

- `fa31773` — closed the self-inflicted RED gate: linked
  `prompts/README.md` from `README.md` (closes #36).
- `b7be77a` — critique pass 12: 1 HIGH finding filed to
  `plan/CRITIQUE.md`.
- `ec77ec1` + `5d2d16c` — phase 22: `playbooks/workspace.md`
  ships (closes #37); phase 22's deferred template half filed
  forward as phase 33.

## Queues now

- **Build plan:** 21/33 shipped, 11 pending, 1 blocked (phase
  20, cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]` is
  phase 23.
- **AUDIT:** refreshed this tick — header was `2026-08-02` (23
  days stale, far past the 48h threshold). Fresh A-G sweep
  (delegated to an agent): durable `[user-issue #35]` unchanged;
  the three rows from the last sweep (`[A, 1.35]` cloud-loop.md
  "three new files", two `[C, 2.4]` dead-section citations) all
  still reproduce, only line numbers drifted. One new row:
  `[F, 3.6]` — `templates/.github/CLOUD_LOOP.md` hedges "Sonnet
  5" mentions with "(ids age — check `/model`)" in two spots but
  leaves the adjacent "Opus 4.8" mentions in the same two spots
  unhedged. Phases 21/22 (newest surfaces) checked clean.
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW) — pass 12 landed this
  window (see Shipped). Not due again this window.
- **PHASE_CANDIDATES:** 17 pending, 14 promoted. Header
  `2026-08-02` (pass 6) — `/expand`'s to refresh, not digest's;
  last pass predates the outage. Posture still bold.
- **Issues:** 2 open — `#34` (phase-20 mirror, open until phase
  20 ships) and `#35` (the blocking cloud-token issue, same
  root cause). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3 `Cloud-Run:`-tagged commits in the trailing 26h
  (`ad8ae3c` just outside the window, `fa31773`, `ec77ec1`/
  `5d2d16c` sharing one run's trailer), well under the 8/24h
  ceiling — no signal of a hibernating or overheating gate.

## Needs you

- **Issue #35 / Phase 20** — nexus's own cloud push token still
  can't write `.github/workflows/*.yml`, despite the
  2026-08-23 re-mint note in `agents.md`. Needs a local session
  to inspect the actual `ACTIONS_PAT` scope grants and test a
  plain `git push` against a workflow file with that token.
  Fresh evidence this window: the 08-24 20:07 tick reproduced
  the exact failure mode phase 20 would close (a background
  agent dispatched and lost mid-tick) — this is not a new
  finding, just a live instance of the tracked one.
- No `[needs-user-call]` rows.

## Today's intent

Phase 23 — cloud tick failure auto-alarm via a `GITHUB_TOKEN`-
authenticated deduped issue — is next in the build plan, and
this window supplies a concrete worked example for why it
matters: `night.yml`'s own crash-alarm step
(`Open night-failed issue if action crashed`) authenticates
with `ACTIONS_PAT`, the same secret whose failure caused the
3-week outage this digest opens with — so the alarm meant to
catch that exact failure was itself silenced by it. Phase 23's
`GITHUB_TOKEN` design (matching `heartbeat.yml`'s already-
independent watcher) closes that single point of failure.
Runner-up: AUDIT's fresh top row, `[F, 3.6]` (CLOUD_LOOP.md's
inconsistent id-hedging).

## Tuning proposals

None new this tick. The two structural gaps visible in this
window's pulse — heartbeat counting failed runs as ticks, and
the cloud-push-token scope wall — are both already tracked
(the former fixed 2026-08-23 via `d28175d`; the latter is
`[user-issue #35]`, blocking phase 20, with phase 23 queued
right behind it to close the adjacent alarm-sharing-a-token
gap). Filing either as a new `plan/PHASE_CANDIDATES.md` entry
would duplicate existing rows, so per `skills/digest.md` §3
step 4 this window's pulse is evidence for existing rows, not
grounds for a new one.
