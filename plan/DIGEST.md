# Digest — 2026-07-03

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The cloud loop went live today — 4 of 5 `march` ticks green
after one self-resolved infra failure, critique's first pass
shipped 6 findings, and every queue is caught up with nothing
blocked.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 01:25 | march | failed — infra: Claude Code GitHub App not installed on the repo (self-resolved same session, see Shipped) |
| 01:31 | march | no-op — clean tick, nothing to ship |
| 01:42 | march | no-op — clean tick, nothing to ship |
| 01:49 | march | no-op — clean tick, nothing to ship |
| 01:57 | march → critique | shipped — critique pass 1, 6 findings (1 high, 3 med, 2 low), commit `62a3875` |

`heartbeat` has no runs yet — its workflow shipped in this
same window (phase 16), so there's no pulse to report until
its first cron fires.

## Shipped

- `84ea179`…`df709e0` — self-adoption substrate + the kit's own
  verify gate (foundational, start of window)
- `b4d40ef`, `e650aa2` — cloud loop phase 6: nexus marches on
  Actions
- `914299c` — operator manual gained the missed GitHub App
  install step (fixes the 01:25 failure's root cause)
- `4e5e185`, `ce66263` — ignore rule + tick observability /
  deterministic first critique dispatch
- `5dcbf37` — permission wall: bypass on the disposable runner
- `803c940` — `claude_args` must be CLI flags, not JSON —
  permission mode now reaches the SDK
- `62a3875` — critique pass 1: 6 findings filed to
  `plan/CRITIQUE.md` (first tick shipped by the live cloud loop)
- `056f8ef`, `d86bf10` — the loop genus: night shift, heartbeat,
  concierge lane; build plan phases 16 + 18 ticked

## Queues now

- **Build plan:** 10 open phases (7–15, 17), 0 blocked. Phases
  16 and 18 shipped today.
- **AUDIT:** 8 pending rows, header dated 2026-07-02 — fresh,
  no refresh needed.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW) from today's
  pass 1. Top: README's sibling-clone layout breaks
  `playbooks/new-project.md`'s bare `nexus/...` copy paths.
- **PHASE_CANDIDATES:** 4 pending, 0 promoted, 0 rejected.
  Top: package nexus as a Claude Code plugin (score 7.5).
- **Issues:** none open — `triage:needs-user` and `loop:do`
  both empty.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

None — no blocked rows, no needs-user issues, no
`[needs-user-call]`s.

## Today's intent

Next build-plan row: **Phase 7 — Lessons layer** (reflexes +
domain-keyed lessons with hard caps, extracted from kintilla;
brief `phase_7_lessons_layer.md`).

Top audit finding: **[7.2] data-layer.md cites an invented
model id** — `customization/data-layer.md`'s example uses
`"claude-opus-4.7"`, not a real id (impact 6, ease 9).

## Tuning proposals

none — one day of pulse data isn't enough to call a gate
mistuned. The single failure was a known, already-documented
infra gap (GitHub App install), not a gate or cadence issue;
worth another pass or two before drawing conclusions about
ceiling/critique-gate tuning.
