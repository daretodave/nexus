# Digest — 2026-09-04

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet, clean window: one transient crash (issue #52, upstream
API 500, already triage-closed) followed by a no-op tick and
three straight `/iterate` ships that drained CRITIQUE's queue
to empty; AUDIT's header was 3 days stale so this pass ran the
full A-G sweep by hand, reconfirming both surviving rows and
turning up one new one — README undercounts the verify gate's
leg count (six claimed, seven shipped since phase 29). The
candidate queue keeps silting: 21 of 22 pending are now >21
days old, oldest 65 days, no promotions since 2026-08-23.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-03 12:35 | march → (crashed) | no commit — Claude API returned a transient 500 mid-turn; action exited non-zero, self-filed issue #52 |
| 09-03 17:30 | march | no-op — clean run, nothing shipped |
| 09-03 22:15 | march → iterate | shipped `91a9c83` — fixed `plan/PHASE_CANDIDATES.md`'s citation pointing at the wrong section of `digest.md` |
| 09-04 06:55 | march → iterate | shipped `94e5f88` — closed CRITIQUE's LOW row (README's undefined "canonical sibling") on a queue-favoring tie-break |
| 09-04 12:29 | march → iterate | shipped `e9c7513` — closed CRITIQUE's last LOW row (step 5 named only 2 of 8 placeholders) |

`heartbeat` ran green throughout (5/5 sampled). Issue #52 has
since been triaged closed (transient, non-actionable).

## Shipped

- `91a9c83` — repointed `plan/PHASE_CANDIDATES.md:591`'s citation
  of `skills/digest.md`'s "starved queue" tuning-trigger language
  from "4. Hard rules" to its real location, step 4 of "3. The
  procedure" — matching a sibling fix `plan/DIGEST.md` had
  already picked up.
- `94e5f88` — changed README's sample `/march` transcript from
  "Read brief, canonical sibling" (an undefined term at line 48)
  to "Read brief, phase 8", matching the same sample's own
  "phase 8" references.
- `e9c7513` — reworded "How to use this kit" step 5 from naming
  2 of 8 placeholders by name to pointing at all 8 via
  `templates/README.md`'s table, closing CRITIQUE's last pending
  row.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase 20
  (`workflows`-scope gap, `[user-issue #35]`) and phase 32 (same
  gap, `[user-issue #49]`), unchanged since 2026-08-23 and
  2026-08-30 respectively. No next `[ ]` row exists.
- **AUDIT:** header was 3 days stale (last full sweep
  2026-09-01) — ran the fresh A-G sweep this tick per
  `skills/digest.md` step 5. Durable rows (`[user-issue #40]`,
  `#35`, `#49`) reconfirmed unchanged, still blocked. Both
  surviving non-durable rows reconfirmed still accurate:
  `[C, 2.4]` triage.md's dead `ship-data.md §6` citation,
  `[A, 2.4]` guard.mjs template drift (missing `\n`-exclusion).
  One new row: `[A, 3.6]` — README.md:565-568 says the verify
  gate runs "six hermetic legs" and lists six, but it has shipped
  seven since phase 29 added `dualshell`. Now 6 pending (up from
  5); header dated 2026-09-04. B/D/E/F came back clean; G stayed
  empty (no sibling checkouts or `NEXUS_LESSONS.md` present in
  this cloud environment).
- **CRITIQUE:** 0 pending (drained from 2), last pass 2026-09-01
  (pass 13, ~4d ago). Both remaining LOW rows shipped this
  window.
- **PHASE_CANDIDATES:** 22 pending mechanically per `pulse.mjs`,
  oldest 65 days (proposed 2026-07-02). Hand-count per phase
  30's rule: **21 of 22** pending rows carry a `- proposed:` date
  more than 21 days old — only the newest (score 7.8, proposed
  2026-08-31) is inside the window. Header still 2026-08-31
  (pass 7). Posture still bold.
- **Issues:** 5 open — `#49` (phase 32 blocked mirror), `#48`
  (phase 32 loop mirror), `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud-token issue, phase 20), `#34` (phase 20
  mirror). `#52` (crash report) triaged closed this window. No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 65d).** Both trigger conditions are met, same as the
  last several digests — no promotions since 2026-08-23 (12
  days now). Worth an `/oversight` pass to triage the 22 pending
  rows.
- **Issues #35 / #40 / #49 (phases 20/32 blocked)** — all three
  trace to the identical cloud-push-token `workflows`-scope gap.
  A structural-fix candidate (score 7.8, proposed 2026-08-31) is
  already queued and would resolve all three durable AUDIT rows
  at once if promoted alongside the silting pass above.
- No `[needs-user-call]` rows.

## Today's intent

No next `[ ]` build-plan phase — fully drained bar the two
blocked rows. CRITIQUE's queue is empty, so `/march` won't
dispatch there until a fresh `/critique` pass finds something.
The next `/march` tick should dispatch to `/iterate`: top of the
queue is AUDIT's freshly-found `[A, 3.6]` (README's six-vs-seven
verify-leg undercount) — a one-line-plus-list fix, highest score
in the block by a clear margin, no tie to break this time. Beyond
the loop's own dispatch, the queue-silting line above is the
thing most worth a human's attention today — it's now been true
for eleven consecutive digests.

## Tuning proposals

None new this tick. The crashed tick (#52) was a transient
upstream API error, not a gate mistuning — no candidate
warranted. The systemic `workflows`-scope blocking pattern
already has a top-scored candidate (7.8, filed 2026-08-31)
proposing exactly the fix this digest would otherwise suggest —
filing a second would be duplicate noise. Candidate-queue
silting is already surfaced mechanically by phase 30's own
guard, working as designed; the fix is an `/oversight` pass, not
a new gate tuning.
