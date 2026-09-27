# Digest — 2026-09-27

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet, clean window: three ticks shipped (one closed a
moderation-API naming defect, one ran critique pass 21, one
closed the finding it filed), plus a ceiling-skip no-op. The
48h audit-staleness threshold tripped this pass — a fresh A-G
sweep, dispatched to a foreground sub-agent, found nothing new;
all five durable rows reproduced unchanged. Candidate queue
silting is unchanged and still the loudest open item.

## While you were out

Window: since the last digest commit (2026-09-26 14:39 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-26 17:35 | march | no-op — cloud ceiling reached (8/8 weighted budget in trailing 24h; phase=3, churn=1). Exited cleanly, nothing shipped. |
| 09-26 22:21 | march → iterate | shipped `9a4340c` — **closes `#64`**: `templates/skills/moderate.md` + `customization/moderation-loop.md` named a nonexistent "Anthropic moderation API"; reworded to what the kit actually ships. |
| 09-27 07:34 | march → critique | shipped `942884e` — pass 21: 1 finding (0 high, 1 med, 0 low) — `concepts/architecture.md`'s Layer 2 dispatch list and Layer 4 prose both dropped `/expand`, even though the file's own top-of-file diagram includes it. |
| 09-27 13:31 | march → iterate | shipped `9fd21c0` — **closes `#65`**: fixed the same `/expand`-omission finding pass 21 just filed — added it to Layer 2's numbered dispatch list and Layer 4's prose. |

`heartbeat` ran green throughout (5/5 sampled this window). All
three shipped commits above carry an intact `Cloud-Run:`
trailer.

## Shipped

- `9a4340c` — iterate: moderation-API naming fixed to match what
  the kit actually ships. Closes `#64`.
- `942884e` — critique pass 21: 1 finding (0 high, 1 med, 0 low)
  — the `/expand`-dispatch-omission row.
- `9fd21c0` — iterate: `concepts/architecture.md` Layer 2/4 now
  include `/expand`. Closes `#65`.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 35
  days blocked) and phase 32 (`#49`, 28 days blocked), both
  still on the same cloud-push-token workflows-scope gap,
  unchanged.
- **AUDIT:** 5 pending rows, unchanged content. Header was
  2026-09-25 (~50h old), past the 48h refresh threshold this
  pass, so dispatched a fresh A-G sweep to a foreground
  sub-agent (read-only; no edits/commits) to protect context.
  It found nothing new across all seven dimensions — every
  tree/placeholder/link/count claim it re-derived from disk
  matched, sibling-lessons dimension (G) stayed skipped (no
  local checkout). All five durable rows (the low-priority
  `[F, ~2]` freshness row plus the four blocked user-issue rows
  `#54`/`#40`/`#35`/`#49`) reproduced unchanged; header bumped
  to today. Top score is still ~2.0, under the 3.0 ship
  threshold.
- **CRITIQUE:** 1 pending (LOW — `prompts/adopt.md`'s
  reading-list glob undercount), last pass 15h ago (pass 21,
  today).
- **PHASE_CANDIDATES:** 28 pending (22 >21d), oldest 88d
  (proposed 2026-07-02, unchanged row) — flat vs. yesterday;
  nothing drained.
- **Issues:** 6 open (`#64` and `#65` both closed this window;
  `#54`, `#49`/`#48`, `#40`, `#35`/`#34` remain). No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 88d).** Both trigger conditions remain met; this
  window's three shipped ticks all landed docs/critique fixes,
  none touched the candidate queue — unchanged for at least
  three digest passes running.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 35 days) and phase 32 (`#49`, 28 days).
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31, now 27
  days old) targets the exact recurring blocker behind both
  stuck phases — it would close `#35`, `#40`, and `#49` together
  if promoted.

## Today's intent

No `[ ]` build-plan phase pending (only the two blocked rows).
AUDIT's fresh sweep found nothing new; its top pending row still
scores ~2.0, below the 3.0 floor. CRITIQUE holds one LOW row
(the `prompts/adopt.md` glob mismatch) not yet re-scored against
it — expect the next `/iterate` tick to ship that row, or fall
through to `/expand` again if the tie-break says otherwise.

## Tuning proposals

None new. Today's fresh A-G sweep came back clean — no new
mistuned-gate signal surfaced, and the standing candidates
already on file (workflow-scope-blocked lane, candidate-queue
silting) still cover what this pass's pulse numbers would
otherwise motivate.
