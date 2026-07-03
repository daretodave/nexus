# Digest — 2026-07-03

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A productive day already banked (phases 7 and 8 shipped, 12
candidates filed, the cloud author-identity fix landed and
self-validated) — this tick is the scheduled night run landing
two minutes behind a manual `workflow_dispatch` of the same
workflow, so the pulse is unchanged since the last digest.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 01:25 | march | failed — infra: Claude Code GitHub App token exchange 401'd (transient; issue #1 filed and auto-closed same session) |
| 01:31 | march | no-op — clean tick, nothing to ship |
| 01:42 | march | no-op — clean tick, nothing to ship |
| 01:49 | march | no-op — clean tick, nothing to ship |
| 01:57 | march | shipped — phase 7, lessons layer (commit `91b0266`) |
| 03:06 | march | shipped — phase 8, polyrepo variant playbook (commits `4dc4840`, `40cfa74`) |
| 09:05 | march | shipped — README provenance trim + 12 filed candidates + cloud author-identity fix (commits `d225ea6`, `63530d5`, `34bcac0`) |
| 11:17 | night (manual dispatch) | shipped — digest for 2026-07-03 (commit `eafaacd`) |
| 11:19 | night (scheduled) | this tick — no new commits, march runs, issues, or heartbeat activity since 11:17; queues unchanged |

`heartbeat` ran once since yesterday's digest (07:23 UTC),
green.

## Shipped

- `91b0266` — phase 7: lessons layer, reflexes + domain-keyed
  corpus (two-tier system extracted from kintilla, replacing
  the single-scratch-file story)
- `4dc4840`, `40cfa74` — phase 8: polyrepo variant playbook
  (`plan/` as its own repo + sibling product repos)
- `d225ea6` — README provenance trimmed (kintilla dropped, per
  the lanes/lessons-layer docs still crediting origins in
  place)
- `63530d5` — 12 adoption candidates filed to
  `plan/PHASE_CANDIDATES.md` from a five-lens ideation pass
- `34bcac0` — cloud ticks now author as `nexus`, not the bot;
  `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars replace the
  overridden `git config` mechanic. This same tick is the proof
  it works — the commit itself lands authored as `nexus`.

Nothing new shipped between the 11:17 and 11:19 ticks — this
digest is a re-confirmation, not a new pass.

## Queues now

- **Build plan:** 8 open phases (9–15, 17), 0 blocked. Phases
  7 and 8 shipped today.
- **AUDIT:** 9 pending rows, header dated 2026-07-02 — content
  fresh (a row was added today by `34bcac0`), no refresh needed.
  One row (`[6.6]` template author mechanic) has its "next"
  condition now met by today's `34bcac0` — ripe for the next
  `/iterate` pass once phases run dry.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW), pass 1 from
  2026-07-03, unchanged today. Top: README's sibling-clone
  layout breaks `playbooks/new-project.md`'s bare `nexus/...`
  copy paths.
- **PHASE_CANDIDATES:** 16 pending, 0 promoted, 0 rejected.
  Top: workspace-of-repos as a first-class adoption path
  (score 8.8) — two independent sibling adoptions converged on
  the same topology unprompted.
- **Issues:** none open — `triage:needs-user` and `loop:do`
  both empty; the one crash issue from 01:25 and both phase
  mirror issues (#2, #3) are closed.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

None — no blocked rows, no needs-user issues, no
`[needs-user-call]`s.

## Today's intent

Next build-plan row: **Phase 9 — Windows-first pass**
(dual-shell commands + hazards page; brief
`phase_9_windows_pass.md`).

Top audit finding: **[7.2] data-layer.md cites an invented
model id** — `customization/data-layer.md`'s example uses
`"claude-opus-4.7"`, not a real id (impact 6, ease 9).

## Tuning proposals

none — today's only failure was a known transient (GitHub App
token exchange), cleared on the very next scheduled tick.
AUDIT and CRITIQUE queues are static by design (phases run
first per the build plan's own transition rule; `/iterate`
only picks up once phase 9–15/17 run dry) — not evidence of a
starved gate. PHASE_CANDIDATES growing to 16 pending with 0
promoted reflects `/oversight` being a deliberate, infrequent
human review step, not an automated gate. The 11:17/11:19 near-
simultaneous night runs are a manual `workflow_dispatch`
landing two minutes ahead of the scheduled cron tick — ordinary
GitHub Actions scheduling jitter serialized safely by the
shared `march` concurrency group (`cancel-in-progress: false`),
not a cadence defect — no tuning proposal to file.
