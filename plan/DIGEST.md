# Digest — 2026-07-30

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet window bookended by two clean no-ops: one docs fix shipped
(`913811f`), one tick crashed on a transient Claude API `529
overloaded` (10 retries exhausted, auto-filed issue #30), the
next tick root-caused and closed it as a one-off flake, and the
final tick fell all the way through iterate to expand — neither
found a signal worth acting on. Queues barely moved: AUDIT down
to 1 non-blocked row, CRITIQUE empty and not yet due, candidate
backlog flat at 21 pending with zero `/oversight` promotions ever
recorded in this repo's history (28 days since the queue opened).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-29 14:47 | march → iterate | shipped AUDIT `[C/F, 1.6]` — `bootstrap.md`'s `ember.vercel.app` example URL now resolves to a live unrelated site; swapped for `your-app.vercel.app` (`913811f`) |
| 07-29 20:22 | march → (crashed) | `Run /march` step failed: Claude API `error_status: 529 overloaded`, exhausted all 10 retries over ~3 min; no commit; auto-filed issue #30 |
| 07-30 03:04 | march → triage | closed issue #30 — root-caused to the transient overload, corroborated by the ticks immediately before and after both succeeding; no queue file changed, no commit |
| 07-30 08:56 | march → iterate → expand | AUDIT's only rows were sub-threshold (`#12` blocked, `[A, 1.35]` below the 3.0 bar) so iterate deferred per its own failure mode 1; expand checked all 5 signal sources (no AUDIT cluster, empty CRITIQUE, one open issue, no sibling lessons, no platform drift) — none cleared the bar; clean no-op |
| 07-30 11:14 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `913811f` — closed AUDIT `[C/F, 1.6]`: `templates/skills/bootstrap.md:217`'s
  illustrative "first deploy" URL, `https://ember.vercel.app`, now
  resolves to a real unrelated live app rather than a parked host
  — plain text in a fenced block, so `verify.mjs`'s links leg
  correctly missed it. Swapped for `https://your-app.vercel.app`,
  matching the placeholder-style hostname already used in
  `playbooks/new-project.md`.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header still `2026-07-29` (~20h old this tick, under
  the 48h refresh threshold — no re-sweep needed). 1 non-blocked
  Pending row left: `[A, 1.35]` (`cloud-loop.md`'s "three new
  files" header lists only two). Standing `[user-issue #12]`
  unchanged since 2026-07-12 (18 days), still the durable blocked
  top row.
- **CRITIQUE:** 0 pending. Last pass 2026-07-28 (pass 9). Not yet
  due — 4 commits / ~36h since last pass, below both the
  12-commit and 72h triggers.
- **PHASE_CANDIDATES:** 21 pending, flat — no `/expand` tick ran
  (the one tick that reached expand's gate this window found no
  signal above the bar). Posture still bold. Zero promotions
  since the queue opened 2026-07-02, now 28 days running; this
  tick's own `/oversight` audit block flagged it explicitly as
  worth a human pass.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. Issue #30 opened and closed within this
  window. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 1 `Cloud-Run:`-tagged commit in the trailing 24h
  (`913811f`), well under the 8/24h ceiling. No trailer-gap
  recurrence.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml` still
  needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues only,
  so the cloud loop can never push to `.github/workflows/*.yml`
  itself. Needs a human, or a locally-run `/iterate` with a
  personal workflow-scoped `gh` token. Tracked as AUDIT
  `[user-issue #12]`, still the only blocked row.
- **Candidate backlog** — 21 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted in 28 days. The `[score 9.0]`
  `new-project.md` step-4/7 rewrite remains the clearest
  promote-first candidate (six re-evidencing cycles to date);
  worth an `/oversight` pass. Unchanged in substance from prior
  digests, no new evidence this window.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE is empty
and not due; with AUDIT's `[C/F, 1.6]` row shipped last tick, the
sole remaining non-blocked AUDIT row — `[A, 1.35]`, `cloud-loop.md`'s
"three new files" header overcounting its own two-entry tree — is
the clean next `/iterate` pick.

## Tuning proposals

None new this tick. The one failure in this window (issue #30,
Claude API `529 overloaded`) is the documented one-off-flake case
in `.github/CLOUD_LOOP.md` — the very next tick succeeded,
confirming it's not a pattern. The two clean no-op ticks reflect
a genuinely dry queue (AUDIT down to one sub-threshold row,
CRITIQUE empty, expand's own five signals all quiet), not a gate
misfiring — nothing to route around. The 28-day promotion drought
is a standing observation (see "Needs you" above), not a gate
defect: `/oversight` is the only skill that promotes, and it's
user-in-the-loop by design, so its cadence isn't this loop's
tuning to propose. Per `skills/digest.md` §4, gate tunings remain
proposals only.
