# Digest — 2026-07-27

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet 26h window: 1 of 4 `march` ticks shipped (three clean
`/expand` no-ops, posture bold found no signal each time); the
stale audit (header 3 days old) got a full A-G refresh, surfacing
a genuine new gate blind spot — `[C, 3.6]` `scripts/verify.mjs`'s
`REVERSE_CHECK_DIRS` omits `templates/plan`, now AUDIT's top
non-blocked row. The prior digest's flagged trailer gap did not
recur this window (`34fe6d1` shipped with `Cloud-Run:` intact).
Build plan stays empty (18/18); candidate backlog flat at 21,
still zero promotions since 2026-07-02 (now 25 days running).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-26 14:32 | march → iterate | shipped CRITIQUE's sole LOW row — README.md's `/ship-data` row never links `customization/data-layer.md` (`34fe6d1`), `Cloud-Run:` trailer present |
| 07-26 20:22 | march → expand | clean no-op — no candidate cleared the bar |
| 07-27 03:06 | march → expand | clean no-op — no candidate cleared the bar |
| 07-27 09:08 | march → expand | clean no-op — no candidate cleared the bar |
| 07-27 11:37 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `34fe6d1` — closed `plan/CRITIQUE.md`'s sole pending row
  (pass 8, LOW): "GitHub-as-DB" appeared once in `README.md`'s
  `/ship-data` row with no gloss or cross-reference, unlike the
  sibling `/ship-asset`, `/moderate`, and `/bootstrap` rows in
  the same table. Added the missing link to
  `customization/data-layer.md`. `plan/CRITIQUE.md`'s Pending
  queue is now empty.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header refreshed `2026-07-24` → `2026-07-27` this
  tick — a full A-G sweep (past `skills/digest.md` §3's 48h
  threshold). 5 Pending rows (was 4): one genuinely new —
  `[C, 3.6]` `scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` array
  omits `templates/plan`, the same blind spot that let a
  previously-fixed `templates/plan` disk/doc mismatch
  (2026-07-19's `[A/C, 3.2]`) go undetected by the gate itself;
  confirmed locally that adding the one array entry keeps
  `verify.mjs` green (35 files reverse-checked, up from 24).
  The three carried-over rows all reproduced unchanged in
  substance: `[A, 1.6]` (build plan's stale carry-over counts —
  its own cited numbers drifted a second time, now corrected to
  4 Pending / 21 candidates); `[C/F, 1.6]` (fictional
  `ember.vercel.app` URL still resolving to a real unrelated
  site); `[A, 1.35]` (`cloud-loop.md`'s "three new files" header
  still lists two). Standing `[user-issue #12]` (blocked,
  unchanged since 2026-07-12) preserved verbatim as the durable
  top row.
- **CRITIQUE:** 0 pending — pass 8's lone LOW row shipped this
  window (`34fe6d1`). Last pass 2026-07-25 (pass 8).
- **PHASE_CANDIDATES:** 21 pending, flat since yesterday. Last
  `/expand` pass still 4 (2026-07-22); posture bold. Three
  `/expand` dispatches this window (20:22, 03:06, 09:08) all
  found no new candidate-worthy signal — none promoted or
  rejected either; zero promotions since the queue opened
  2026-07-02 (now 25 days running).
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 1 `Cloud-Run:`-tagged commit in the trailing 24h
  (`34fe6d1`, plus this tick's own digest commit once it lands),
  well under the 8/24h ceiling. No trailer-gap recurrence this
  window — `34fe6d1` shipped with the trailer intact, unlike the
  two past `/critique`-verb misses (`a74f7b6`, `427eb91`) the
  standing candidate below already cites.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **New cheap fix ready** — AUDIT's new top non-blocked row,
  `[C, 3.6]` (`scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` omits
  `templates/plan`), is a one-array-entry gate fix already
  confirmed to pass green locally — no design judgment needed,
  a clean next `/iterate` pick.
- **Candidate backlog** — 21 pending in
  `plan/PHASE_CANDIDATES.md`, zero promoted in 25 days. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite is still
  re-evidenced across five cycles (2026-07-06, -10, -13, -21,
  and clustering continues per this window's oversight-audit
  ticks) and remains the clearest promote-first candidate;
  worth an `/oversight` pass. Unchanged from yesterday's digest.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE is
empty; AUDIT's highest open scorer excluding the blocked `#12`
is now `[C, 3.6]` — add `'templates/plan'` to
`scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` array, a mechanical
next `/iterate` pick already verified locally to keep the gate
green.

## Tuning proposals

None new this tick. `plan/PHASE_CANDIDATES.md`'s open
`[score 6.5]` candidate ("Mechanically verify the Cloud-Run
trailer on cloud ticks") saw no new instance this window —
`34fe6d1` shipped with the trailer intact, unlike the two past
misses (`a74f7b6`, `427eb91`) it already cites — so it stays
as-is, not re-evidenced. The three `/expand` no-ops this window
match posture bold's own no-signal path (each ran, found
nothing, exited clean) rather than a starved queue, so no
mistuned-gate signal to file. Per `skills/digest.md` §4, gate
tunings remain proposals only; `/oversight` still owns
promoting the standing one.
