# Digest — 2026-09-07

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three straight `/iterate` ticks drained CRITIQUE to zero and
closed two more AUDIT LOW rows; a fourth tick crashed on a bare
infra error ("bun: command not found", nothing to do with kit
content) and auto-filed issue #54, still open and unlabeled.
The candidate queue keeps silting unchanged — still 21 of 22
pending >21 days old, oldest now 68 days, no promotions since
2026-08-23 (15 days).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-06 16:41 | march → iterate | shipped `9109904` — CRITIQUE's last pending LOW row (README's undefined shorthand terms); queue now empty |
| 09-06 21:56 | march → iterate | shipped `fa040af` — closed AUDIT's `[A, 2.4]` row (guard.mjs's RULES regexes missing the newline exclusion, porting `[user-issue #33]`'s kit-side fix to the template twin) |
| 09-07 06:59 | march → iterate | shipped `a7e6ca5` — closed AUDIT's `[C, 2.4]` row (triage.md's citation pointing half at unrelated ship-data.md content) |
| 09-07 13:57 | march | FAILED — "bun: command not found" in the action's own post-step, before the agent could run; auto-filed issue #54 (unlabeled, still open) |

`heartbeat` ran green throughout (5/5 sampled). Three of four
ticks shipped; the fourth was an infra hiccup, not a kit-gate
failure.

## Shipped

- `9109904` — README's `/march` tick transcript (lines 43-53)
  used shorthand terms (`Triage`/`Critique`/`Expand`/`Dispatch`)
  roughly 130 lines before the table that defines them. Added a
  one-line pointer right after the transcript.
- `fa040af` — the kit's own `.claude/hooks/guard.mjs` got a
  newline-exclusion fix for `[user-issue #33]` (2026-08-02:
  `[^|;&]*` matches newlines, letting a rule span logical Bash
  command boundaries) but the template twin adopters actually
  copy never got it. Ported the `\n` exclusion to all nine
  occurrences and added the matching regression case to the
  template's self-test.
- `a7e6ca5` — `templates/skills/triage.md` §6 cited both
  `skills/iterate.md` §5 and `skills/ship-data.md` §6 for the
  issue comment/close follow-up flow; the latter is a generic
  CRUD walkthrough with zero matches for
  trailer/Closes/commit-body/issue. Dropped the dead half.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase
  20 (`#35`) and phase 32 (`#49`), unchanged since 2026-08-23
  and 2026-08-30.
- **AUDIT:** header 2026-09-07 07:00, well inside the 48h
  freshness window — no refresh needed. 3 pending, down from 5
  yesterday: the two LOW rows (`[C, 2.4]` triage citation,
  `[A, 2.4]` guard.mjs drift) both shipped this window, leaving
  only the three durable `workflows`-scope-blocked user-issues
  (`#40`, `#35`, `#49`, score 0.8 each).
- **CRITIQUE:** 0 pending, last full pass 2026-09-04 17:29
  (pass 14) — but the rate-limit gate is now due: 12 commits
  landed since that pass, meeting the "≥12 commits" trigger even
  though only ~70.5h have elapsed (under the 72h trigger). The
  next `/march` tick not diverted elsewhere will likely open a
  fresh `/critique` dry-run pass, not ship from the (empty)
  queue.
- **PHASE_CANDIDATES:** 22 pending mechanically per
  `pulse.mjs`, oldest 68 days (proposed 2026-07-02, up from 67
  yesterday). Hand-count per phase 30's rule: **21 of 22**
  pending rows carry a `- proposed:` date more than 21 days old
  — unchanged from yesterday; only the newest (score 7.8,
  proposed 2026-08-31) is inside the window. Header still
  2026-09-05 (pass 8) — `/expand` not due (only 2 commits since
  its last pass, far short of the 20-commit/7-day trigger).
  Posture still bold.
- **Issues:** 6 open — `#54` (new, unlabeled, cloud tick
  crash), `#49`/`#48` (phase 32 blocked + loop mirror), `#40`
  (phase 23 follow-up, blocked), `#35`/`#34` (phase 20 blocking
  token issue + loop mirror). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending
  >21d, oldest 68d).** Both trigger conditions remain met, same
  as the last several digests — no promotions since 2026-08-23
  (15 days now). Worth an `/oversight` pass to triage the 22
  pending rows.
- **Issue #54 (new)** — a cloud tick crashed on a bare infra
  error ("bun: command not found" in the action's own
  post-step), unrelated to kit content. Worth a glance and a
  close once confirmed transient — the two prior crash issues
  (`#52` API 500, `#38` directory mismatch) were each a
  different one-off cause and got closed by hand, not a
  recurring pattern.
- **Issues #35 / #40 / #49** — still tied at score 0.8, all
  blocked on the identical cloud-push-token `workflows`-scope
  gap. A structural-fix candidate (score 7.8, proposed
  2026-08-31) is already queued and would resolve all three at
  once if promoted.

## Today's intent

Issue #54 is unlabeled, so the next `/march` tick routes to
`/triage` first (step 1 beats the critique gate), not straight
to `/iterate` or `/critique`. Once triage clears it, the
critique rate-limit gate is due by commit count (12 since the
2026-09-04 pass) even though CRITIQUE's own queue is empty —
expect a fresh dry-run pass, not a queue ship. Behind that,
AUDIT's only pending rows are the three tied, blocked score-0.8
issues, so nothing else is shippable there without a human
unblocking the workflows-scope gap. Beyond the loop's own
dispatch, the queue-silting line above is the thing most worth
a human's attention today — fourteen consecutive digests now.

## Tuning proposals

None new this pass. The standing candidate-queue silting is
already captured structurally by phase 30's threshold (the
Needs You line above does the flagging). Today's one infra
failure (bun: command not found) has a different root cause
than the prior two crash issues (API 500 on 09-03, directory
mismatch on 08-25) — no repeating pattern yet, so no
gate/retry tuning proposal; if the same bun-missing failure
recurs, that's the moment to draft one for the crash-alarm
workflow's dependency setup.
