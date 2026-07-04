# Digest — 2026-07-04

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two phases shipped since yesterday's digest (9 — Windows-first
pass, 10 — the moderate.md skill), one of them closing an
AUDIT row in passing; this tick's own work is refreshing the
now-48h-stale audit (one row confirmed fixed, the rest
confirmed still open) rather than banking new ship activity
itself.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-03 20:26 | march | no-op — clean tick, nothing to ship |
| 07-04 03:06 | march | shipped — phase 9, Windows-first pass (commit `1cfab4b`) |
| 07-04 08:55 | march | shipped — phase 10, `templates/skills/moderate.md` (commit `e318b64`) |
| 07-04 11:02 | night (scheduled) | this tick |

`heartbeat` ran 4 times since yesterday's digest (12:54, 18:42,
00:59, 07:15 UTC), all green.

## Shipped

- `1cfab4b` — phase 9: Windows-first pass — cross-platform
  `node -e` one-liners replace the bash-only template-copy and
  audit-snippet blocks in both adoption playbooks; new
  `playbooks/windows-notes.md` hazards page (nul devices, EBUSY
  from lane CWDs, truncation races, psql via docker exec);
  `bootstrap.mjs` handoff verify no longer pipes through
  `findstr`/`grep`. Closed AUDIT `[5.4]` **and**, as a side
  effect, `[4.2]` (the existing-project audit snippet crudeness)
  — caught by this tick's audit refresh, see Queues below.
- `e318b64` — phase 10: `templates/skills/moderate.md` +
  paired `templates/claude/commands/moderate.md` — the Option A
  file `customization/moderation-loop.md` had been describing
  in prose without shipping; wired into `templates/README.md`
  and both README trees.

## Queues now

- **Build plan:** 6 open phases (11–15, 17), 0 blocked. Phases
  9 and 10 shipped since yesterday.
- **AUDIT:** refreshed this tick (header was 2026-07-02, past
  the 48h staleness bar). Each pending row spot-checked against
  the current tree: `[4.2]` (existing-project audit snippet) is
  now fixed by phase 9's commit and moved to Done; the other 7
  pending rows (`[6.6]`, `[7.2]`, `[6.3]`, `[4.9]`, `[3.8]`,
  `[3.5]`, `[3.2]`) all confirmed still open by direct grep
  against the files they cite. No full dimension re-sweep this
  pass — phase 9/10's own diffs were checked clean, and a fresh
  A–G survey belongs to `/iterate` once phases 11–15/17 run dry.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW), pass 1 from
  2026-07-03, unchanged. Top: README's sibling-clone layout
  breaks `playbooks/new-project.md`'s bare `nexus/...` copy
  paths.
- **PHASE_CANDIDATES:** 16 pending, 0 promoted, 0 rejected,
  unchanged since 2026-07-03. Top: workspace-of-repos as a
  first-class adoption path (score 8.8).
- **Issues:** none open — `triage:needs-user` and `loop:do`
  both empty, and no open issues at all.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

None — no blocked build-plan rows, no needs-user issues, no
`[needs-user-call]`s.

## Today's intent

Next build-plan row: **Phase 11 — Ship
`templates/skills/ship-migration.md` + additive-migration
linter** (the data-layer Pattern D promise).

Top audit finding: **`[7.2]` data-layer.md cites an invented
model id** — `customization/data-layer.md:513`'s example still
uses `"claude-opus-4.7"`, not a real id (impact 6, ease 9,
score 5.4 — highest of the 7 pending rows).

## Tuning proposals

none — the one AUDIT row this tick could have flagged as a gate
defect (a finding going stale unnoticed) is instead exactly
what `/digest`'s own 48h staleness check is for, and it fired
correctly this tick. march cadence over the window (3 ticks,
2 shipped, 1 clean no-op) shows no stagnation. CRITIQUE and
PHASE_CANDIDATES sitting unchanged for a second day running is
the same deliberate-human-review shape noted in yesterday's
digest, not a starved automated gate — `/oversight` promotion
and a fresh `/critique` pass are infrequent by design, not by
defect. No duplicate-tick collision this time (single scheduled
`night` run, no overlapping manual dispatch) — nothing to
retune.
