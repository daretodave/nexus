# Digest — 2026-07-03

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A productive day: phases 7 and 8 shipped, an ideation pass
filed 12 phase candidates, and the cloud loop's author-identity
fix landed and self-validated — 6 of 7 `march` ticks green, the
one failure a self-resolved infra blip.

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

`heartbeat` ran once since the last digest, green.

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

## Queues now

- **Build plan:** 8 open phases (9–15, 17), 0 blocked. Phases
  7 and 8 shipped today.
- **AUDIT:** 9 pending rows, header dated 2026-07-02 — fresh
  (last touched today), no refresh needed. One row (`[6.6]`
  template author mechanic) has its "next" condition now met by
  today's `34bcac0` — ripe for the next `/iterate` pass once
  phases run dry.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW), pass 1 from
  2026-07-03, unchanged today. Top: README's sibling-clone
  layout breaks `playbooks/new-project.md`'s bare `nexus/...`
  copy paths.
- **PHASE_CANDIDATES:** 16 pending, 0 promoted, 0 rejected.
  Top: workspace-of-repos as a first-class adoption path
  (score 8.8) — two independent sibling adoptions converged on
  the same topology unprompted.
- **Issues:** none open — `triage:needs-user` and `loop:do`
  both empty; the one crash issue from 01:25 is filed and
  closed.
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

none — the day's only failure was a known transient (GitHub
App token exchange), not a gate or cadence defect, and it
cleared on the very next scheduled tick. AUDIT and CRITIQUE
queues are static by design (phases run first per the build
plan's own transition rule, `/iterate` only picks up once
phase 9–15/17 run dry) — not evidence of a starved gate.
PHASE_CANDIDATES growing to 16 pending with 0 promoted reflects
`/oversight` being a deliberate, infrequent human review step,
not an automated gate — no tuning proposal to file.
