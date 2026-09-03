# Digest — 2026-09-03

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three `/iterate` ticks drained the CRITIQUE/AUDIT overlap —
each shipped the tied top-scorer per the established tie-break,
closing three CRITIQUE LOW rows (7→6 AUDIT pending, 5→2
CRITIQUE pending) — before a fourth tick hit a transient
upstream `API Error: 500` and self-filed issue #52 instead of
shipping; build plan stays fully drained bar its two
`workflows`-scope-blocked phases; and the candidate-silt line
fires for the tenth straight digest — 21 of 22 pending
candidates are now >21 days old, oldest 64 days, no promotions
since 2026-08-23.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-02 17:35 | march → iterate | shipped `7c03090` — closed AUDIT's `[A, 3.2]` and CRITIQUE's matching LOW row (README's kit tree omitted `templates/workspace/`) |
| 09-02 22:20 | march → iterate | shipped `cd56ed3` — closed CRITIQUE's LOW row (README's "2-4 hours" setup estimate vs the reconciled "2-3 hours") on a score tie with AUDIT's top scorer |
| 09-03 06:50 | march → iterate | shipped `d940743` — closed CRITIQUE's LOW row (undefined "Posture-gated" in the `/expand` table) on a score tie with AUDIT's `[C, 2.7]` row |
| 09-03 12:35 | march → (crashed) | no commit — Claude API returned a 500 mid-turn (`is_error:true`, terminal_reason `api_error`); action exited non-zero, filed issue #52 automatically |

`heartbeat` ran green throughout (5/5 sampled).

## Shipped

- `7c03090` — added a collapsed `workspace/` entry to README's
  "What's in this kit" tree, matching `templates/README.md:84`'s
  phrasing; phase 33 had landed the `templates/workspace/`
  family but only the templates-side tree picked it up.
- `cd56ed3` — reworded README.md:242's "2-4 hours of setup" to
  match the reconciled "2-3 hours" figure already used in
  `playbooks/new-project.md:4`.
- `d940743` — linked "Posture-gated" (README's `/expand`
  command-table row) to
  `templates/plan/bearings.md#plan-expansion-posture`, matching
  the table's existing `/ship-data` → `customization/data-layer.md`
  pattern.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase 20
  (`workflows`-scope gap, `[user-issue #35]`) and phase 32 (same
  gap, `[user-issue #49]`), both unchanged since their respective
  block dates (2026-08-23, 2026-08-30). No next `[ ]` row exists.
- **AUDIT:** 6 pending (down from 7), last edited 2026-09-03
  06:52 (<48h, no refresh needed this tick; header line still
  reads "2026-09-01" but that's the last full A-G sweep date,
  not last edit). Three durable rows unchanged (`[user-issue #40]`,
  `[user-issue #35]`, `[user-issue #49]`, all the same
  `workflows`-scope root cause). Three non-durable rows remain:
  `[C, 2.7]` PHASE_CANDIDATES.md's stale `digest.md §4` citation
  (tied for top score twice this window, lost the tie-break both
  times), `[C, 2.4]` triage.md's dead `ship-data.md §6` citation,
  `[A, 2.4]` guard.mjs template drift (missing `\n`-exclusion in
  the `templates/` regex mirror).
- **CRITIQUE:** 2 pending (both LOW), last pass 2026-09-01 (pass
  13, ~3d ago). All three rows shipped this window; remaining:
  undefined "canonical sibling" (README.md:48) and "How to use
  this kit" step 5 naming only 2 of 8 documented placeholders.
- **PHASE_CANDIDATES:** 22 pending mechanically per `pulse.mjs`,
  oldest 64 days (proposed 2026-07-02). Hand-count per phase
  30's rule: **21 of 22** pending rows carry a `- proposed:` date
  more than 21 days old — only the newest (score 7.8, proposed
  2026-08-31) is inside the window. Header still 2026-08-31 (pass
  7). Posture still bold.
- **Issues:** 6 open — `#52` (new: cloud march tick crashed on a
  transient API 500), `#49` (phase 32 blocked mirror), `#48`
  (phase 32 loop mirror), `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud-token issue, phase 20), `#34` (phase 20
  mirror). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** 3/8 weighted budget in the trailing 24h (all three
  shipped commits are churn-weight iterate commits, none ticked a
  build-plan `[x]` row) — 5 of budget still open for the next
  tick.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 64d).** Both trigger conditions are met, same as the
  last several digests — no promotions since 2026-08-23 (11
  days, tenth consecutive digest now). Worth an `/oversight` pass
  to triage the 22 pending rows.
- **Issues #35 / #40 / #49 (phases 20/32 blocked)** — all three
  trace to the identical cloud-push-token `workflows`-scope gap.
  A structural-fix candidate (score 7.8, proposed 2026-08-31) is
  already queued and would resolve all three durable AUDIT rows
  at once if promoted alongside the silting pass above.
- **Issue #52 (new)** — self-filed crash report; root cause was
  a transient upstream `API Error: 500` (Claude API side, not a
  kit bug — see https://status.claude.com). No action needed
  beyond routine `/triage`; likely closes as non-actionable.
- No `[needs-user-call]` rows.

## Today's intent

No next `[ ]` build-plan phase — fully drained bar the two
blocked rows. CRITIQUE's gate isn't due yet (last pass ~3d ago,
2 LOW rows remain pending, well under rate-limit thresholds).
The next `/march` tick should dispatch to `/iterate`: top of the
queue is AUDIT's `[C, 2.7]` (PHASE_CANDIDATES.md's stale
`digest.md §4` citation, score 2.7) — it has now lost the
score-tie tie-break twice in a row to CRITIQUE rows that no
longer exist, so it should ship outright next tick barring a new
tie. Beyond the loop's own dispatch, the queue-silting line above
is the thing most worth a human's attention today — it's now
been true for ten consecutive digests.

## Tuning proposals

None new this tick. Issue #52's crash was a transient upstream
API error, not a gate mistuning — no candidate warranted. The
systemic `workflows`-scope blocking pattern already has a
top-scored candidate (7.8, filed 2026-08-31) proposing exactly
the fix this digest would otherwise suggest — filing a second
would be duplicate noise. Candidate-queue silting is already
surfaced mechanically by phase 30's own guard, working as
designed; the fix is an `/oversight` pass, not a new gate tuning.
