# Digest — 2026-07-24

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Quiet-but-clean window: all 4 march ticks shipped, zero no-ops
— two stale "Sonnet 4.6" model-name fixes, a `./data` grep-scope
guard, and the `.claude/` prune-list gap that emptied CRITIQUE's
queue. AUDIT's header had drifted 2 days past digest's own 48h
staleness threshold, so this pass ran a full A-G sweep: 3 new
findings (headlined by a real adopter-facing `claude_args`
doc-vs-gate mismatch, score 4.8) plus a corrected `next` on two
carried-over rows. One tuning proposal filed — a cheap AUDIT row
has been tying and losing the same tie-break for a week straight.
Build plan stays empty (18/18); candidate backlog now 21, still
zero promoted since the queue opened 2026-07-02.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-23 14:46 | march → iterate | shipped AUDIT `[F/A, 3.6]` — `cloud-loop.md:62`'s stale "Sonnet 4.6" model name |
| 07-23 20:24 | march → iterate | shipped CRITIQUE's LOW `./data` grep-scope row (bare `grep -rl` errored when `./data` didn't exist); tied AUDIT `[A/E, 2.7]` on score, tie-break favored the queue |
| 07-24 03:04 | march → iterate | shipped AUDIT row — `templates/.github/CLOUD_LOOP.md` still cited "Sonnet 4.6"/"Opus 4.7" (found via a targeted F/G check since the header was already past 24h) |
| 07-24 08:53 | march → iterate | shipped CRITIQUE's last remaining LOW row — `.claude/` Claude-Code bundle never offered for pruning; drained CRITIQUE's queue to empty |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `4de7268` — `playbooks/cloud-loop.md:62` "Sonnet 4.6" →
  "Sonnet 5", plus the standing "ids age — check `/model`"
  caveat. Closed AUDIT `[F/A, 3.6]`.
- `fe46a28` — bash placeholder one-liner's `grep -rl` scope
  gained `2>/dev/null` before the `xargs` pipe, matching the
  PowerShell twin's existing `-ErrorAction SilentlyContinue`
  guard on `./data`.
- `8062841` — `templates/.github/CLOUD_LOOP.md` (the copy
  adopters actually receive) "Sonnet 4.6"/"Opus 4.7" → "Sonnet
  5"/"Opus 4.8" in the cost table and "Upgrading the model"
  section — the template counterpart an earlier tick's fix to
  the internal playbook copy had missed.
- `9d404ce` — `playbooks/new-project.md`'s "Prune adopt-by-need
  files" section gained a ninth bullet covering the
  `.claude/settings.json` + `guard.mjs` + `.claude/CLAUDE.md` +
  `scripts/notify.mjs` bundle for non-Claude-Code adopters,
  matching `templates/README.md:131`'s adopt-by-need row.
  `plan/CRITIQUE.md`'s pending queue is now empty.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header was 2026-07-22 — 2 days old, past
  `skills/digest.md` §3's 48h threshold — so this pass ran a
  full A-G sweep and refreshed it to 2026-07-24. 8 rows now
  Pending (was 5): standing `[user-issue #12]` (blocked,
  unchanged since 2026-07-12); new `[A, 4.8]` —
  `customization/claude-code.md:310` teaches the `claude_args`
  JSON form `march.yml` documents as silently dropping
  `permissionMode` (highest-scoring open, non-blocked row);
  `[A/E, 2.7]` README's "Files added" checklist undersells
  `scripts/` (unchanged, still real); new `[A, 2.4]` — README's
  own `skills/` tree omits `digest.md`; `[D, 1.8]` two unwrapped
  bullets at `README.md:309`, widened to include a third at
  `:324`; new `[A, 1.6]` — `plan/steps/01_build_plan.md`'s
  carry-overs cite stale queue counts; `[C/F, 1.6]` fictional
  `ember.vercel.app` URL, now confirmed (via `curl`) to resolve
  to a real unrelated site; `[A, 1.35]` `cloud-loop.md`'s
  "three new files" header, `next` now settled by `git log
  --follow` (correct the count, no file was ever lost).
- **CRITIQUE:** 0 pending — drained this window. Last pass
  2026-07-22 (pass 7).
- **PHASE_CANDIDATES:** 21 pending (this digest added one — see
  Tuning proposals), last `/expand` pass still 4 (2026-07-22).
  Only 9 commits landed since, well under the ≥20-commit rate
  limit, so `/expand` wasn't eligible this window. Posture bold.
  None promoted or rejected.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 4 `Cloud-Run:`-tagged commits in the trailing
  ~24h (`4de7268`, `fe46a28`, `8062841`, `9d404ce`), well under
  the 8/24h ceiling; all carry the trailer correctly.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **Candidate backlog** — 21 pending in
  `plan/PHASE_CANDIDATES.md`, zero promoted since the queue
  opened 2026-07-02 (three weeks running). The `[score 9.0]`
  `new-project.md` step-4/7 rewrite is still re-evidenced across
  four separate cycles (2026-07-06, -10, -13, -21) and remains
  the clearest promote-first candidate; worth an `/oversight`
  pass. Two prior meta-loop candidates (`[score 7.5]`
  background-agent dispatch, `[score 6.5]` Cloud-Run trailer
  verification) and this pass's new `[score 6.0]` tie-break row
  also remain unpromoted.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
empty, AUDIT's new `[A, 4.8]` row — the `claude_args`
doc-vs-gate mismatch in `customization/claude-code.md:310` — is
now the clear highest-scoring open item excluding the blocked
`#12`, and the most likely next `/iterate` pick; it's also the
most adopter-facing finding this sweep produced (reintroduces a
bug the kit already paid to discover). `/expand`'s rate-limit
window stays closed until ≥11 more commits land (9 of 20 elapsed
since pass 4), so upcoming ticks should keep routing to
`/iterate` (CRITIQUE has nothing pending until the next
`/critique` pass).

## Tuning proposals

Filed one this pass: `plan/PHASE_CANDIDATES.md`'s new `[score
6.0]` row — AUDIT's `[A/E, 2.7]` row has sat Pending since
around 2026-07-17 and has been cited as tied-or-outscored by a
CRITIQUE row in at least ten separate tick log-lines since, a
textbook starved-queue pattern per `skills/digest.md` §4. The
"favor the queue on ties" convention that keeps beating it was
never written into `skills/iterate.md` §3 as an actual rule —
it exists only as repeated log narrative — so the proposal asks
for it to be made explicit and paired with a small aging nudge.
Filed as a candidate, not applied — the meta-loop does not vote
on its own constraints. Otherwise no mistuned gate this pass:
all four ticks found and shipped real work, heartbeat ran 5/5
green, and the ceiling sat well clear of its cap.
