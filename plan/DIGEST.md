# Digest — 2026-09-30

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

An active window — three march ticks in a row shipped
something, one self-corrected its own log entry mid-tick — plus
a heartbeat false alarm that triage ran down and closed out as
a non-reproducible `gh run list` read, not an actual gap.

## While you were out

Window: since the last digest commit (2026-09-29 16:46 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-29 23:25 | march → iterate | shipped the `[A, 4.5]` AUDIT row from yesterday's digest — `customization/moderation-loop.md`'s dispatch illustration omitted `/expand` (commit `efcb7e7`). Same tick then caught its own mistake: the fix's AUDIT log line had claimed user-issue #54 was "closed since," but `gh issue view` showed it still open — corrected in a same-tick follow-up commit (`465b3e1`). Both share one `Cloud-Run` URL. |
| 09-30 07:57 | march → critique | scheduled critique pass came due; filed one new MED finding (`playbooks/new-project.md`'s step-4 data-layer copy has no runnable command, only prose) and shipped nothing else this tick — commit `a4c2d82`, pass 22. |
| 09-30 14:44 | march → triage | routed issue #67 (heartbeat's "march has flatlined" alarm) into `plan/AUDIT.md` as `[user-issue #67] [LOW]` — investigated and found march had actually ticked normally 5h before the alarm fired; the alarm read a stale, non-reproducible `gh run list` result. Commit `5f57223`. |

`heartbeat` itself fired once mid-window (12:32 UTC, the #67
alarm above) but otherwise ran green. No gate failures this
window — every tick that touched the tree committed clean on
the first pass.

## Shipped

By `/march` this window (see table above): the moderation-loop
`/expand` omission fix, its own log-line self-correction, one
new CRITIQUE finding filed (not yet fixed), and issue #67 routed
into AUDIT. This digest ships nothing beyond itself — no doc
fixes, no template edits, per its own rails; `plan/AUDIT.md` and
`plan/PHASE_CANDIDATES.md` are both <24h old (last touched by
the ticks above) so neither needs a refresh this pass.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 38
  days blocked) and phase 32 (`#49`, 31 days blocked), both
  still on the same cloud-push-token workflows-scope gap,
  unchanged.
- **AUDIT:** 6 pending rows (net unchanged — one shipped
  (`[A, 4.5]`), one added (`[user-issue #67] [LOW]`)). Header
  fresh (2026-09-30, <2h old at pulse time). Top score is
  `[F, ~2]` at 2.0 (impact 4 × ease 5 / 10) — still below the
  3.0 ship floor on its own.
- **CRITIQUE:** 1 pending (MED, filed this window, pass 22,
  2026-09-30) — the `playbooks/new-project.md` data-copy gap.
  Queue rows compete with AUDIT on the same scale (MED band
  impact 5–7); this row likely outscores AUDIT's own top finding.
- **PHASE_CANDIDATES:** 30 pending (22 >21d), oldest 91d
  (proposed 2026-07-02, unchanged row) — flat vs. yesterday (no
  new candidate filed this window). Note: pulse.mjs's raw count
  still includes four `[promoted …]` rows never relocated out of
  `## Pending` (real actionable pending is 26, not 30) — already
  filed as its own candidate (score 3.5) 2026-09-29, still
  pending, not yet promoted.
- **Issues:** 7 open (`#67`, `#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`) — up one from yesterday (`#67`, filed by
  heartbeat, already triaged into AUDIT as LOW). No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 91d).** Both trigger conditions remain met, unchanged
  in substance from yesterday (raw count crept from 90d to 91d
  oldest; the >21d count held at 22). The queue's own
  top-scoring pending row (score 7.8, "Workflow-scope-blocked
  lane," proposed 2026-08-31, now 30 days old) targets the exact
  recurring blocker behind both stuck build-plan phases below —
  promoting it would close `#35`, `#40`, and `#49` together.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 38 days) and phase 32 (`#49`, 31 days).
- Issue #67 (heartbeat false alarm) is logged LOW and left open
  per its own `next`: safe to close on inactivity, but worth
  watching — if the same stale-read alarm fires again, it's
  evidence for hardening heartbeat's query to a double-read
  before trusting one `gh run list` call.

## Today's intent

No `[ ]` build-plan phase is pending (both remaining rows are
blocked), and today's critique pass already ran (pass 22, this
window). Expect the next `/march` tick to dispatch to `/iterate`,
which will score the new CRITIQUE MED row (`playbooks/
new-project.md`'s data-copy gap) against AUDIT's current top
(`[F, ~2]` at 2.0) — the MED band's 5–7 impact range makes the
CRITIQUE row the likely pick, and the first queue item in
several days to clear the 3.0 ship floor without needing a fresh
audit sweep.

## Tuning proposals

None filed this pass. The pulse looked routine: three active
march ticks (no starved gates, no mistuned ceiling), one
non-reproducible heartbeat false alarm already logged with its
own conditional next step rather than a premature fix, and the
candidate-queue silting alarm is unchanged from yesterday with
its own remediation (the score-7.8 workflow-scope-blocked lane
candidate, and the score-3.5 pulse.mjs promoted-row fix) already
sitting in the queue awaiting `/oversight`. Filing another
candidate for either would just be noise on top of an existing
row.
