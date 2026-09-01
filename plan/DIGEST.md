# Digest — 2026-09-01

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Phase 33 shipped overnight (workspace templates), followed by an
expand pass and a hard-rule-6 docs fix; the build plan is now
fully drained bar its two `workflows`-scope-blocked phases (20,
32); AUDIT was 5 days stale and got a fresh sweep this tick,
surfacing one new finding and dropping one below the Top-5 cutoff;
and the candidate queue silting line fires again — 21 of 22
pending candidates are now >21 days old, oldest 61 days, no
promotions since 2026-08-23.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-31 14:11 | march → ship-a-phase | shipped `7933124`+`0d45e8d` — phase 33, `templates/workspace/` root pointer family + adopt-prompt topology ask |
| 08-31 20:09 | march → expand | shipped `6873076` — expand pass 7, 1 new candidate (`plan/PHASE_CANDIDATES.md` score 7.8, the workflows-scope-blocked lane) |
| 09-01 02:15 | march → iterate | shipped `7b2f208` — reworded the "AskUserQuestion only in `/oversight`" absolute claim to admit `/bootstrap`'s own documented carve-out, across 13 files (kit + `templates/` twins); closed `plan/CRITIQUE.md`'s pending HIGH row |

`heartbeat` ran green throughout (5/5 sampled).

## Shipped

- `7933124` + `0d45e8d` — phase 33: `templates/workspace/` gains
  the 4-file adopt-by-need family (`CLAUDE.md`, `AGENTS.md`,
  `README.md`, `REPOS.md`) plus an adopt-prompt topology
  confirm-with-user ask, closing out the workspace-adoption
  candidate started at phase 22.
- `6873076` — expand pass 7: one new candidate filed (score 7.8)
  naming the recurring root cause behind phases 20/32 both
  blocking on the same cloud-push-token `workflows`-scope gap —
  three built-and-discarded cloud ticks now cite it.
- `7b2f208` — iterate: fixed the kit's own Hard Rule 6 (and its
  12 `templates/` + doc mirrors) to say "`/oversight` and
  `/bootstrap`" instead of "`/oversight` only," matching
  `templates/skills/bootstrap.md`'s pre-existing carve-out;
  closed `plan/CRITIQUE.md`'s one pending HIGH row.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase 20
  (`workflows`-scope gap, `[user-issue #35]`) and phase 32 (same
  gap, `[user-issue #49]`), both unchanged since their respective
  block dates (2026-08-23, 2026-08-30). No next `[ ]` row exists;
  the build plan is fully drained apart from these two.
- **AUDIT:** header was 5 days old (last swept 2026-08-27), past
  the 48h threshold, so this tick ran a fresh A-G sweep
  (foreground agent, `run_in_background: false` — see the note
  in `plan/AUDIT.md` itself on why that matters in a cloud tick).
  All three durable rows (`[user-issue #40]`, `[user-issue #35]`,
  `[user-issue #49]`) confirmed still open, same root cause. Of
  the five non-durable rows, four reproduced unchanged (two with
  line drift) and one new row was found: `[A, 3.2]` — README.md's
  "What's in this kit" templates tree never picked up
  `templates/workspace/`, phase 33's same-day landing.
  `[A, 1.35]` (cloud-loop.md's "three new files" header) is still
  genuinely open but dropped below the Top-5 cutoff this rewrite.
  Current Pending, by score: `[F, 3.6]` CLOUD_LOOP.md's
  Sonnet/Opus id-hedging gap, `[A, 3.2]` README's missing
  workspace-tree line (new), `[C, 2.7]` PHASE_CANDIDATES.md's
  stale `digest.md §4` citation, `[C, 2.4]` triage.md's dead
  `ship-data.md §6` citation, `[A, 2.4]` guard.mjs's template
  regex drift.
- **CRITIQUE:** 4 pending (all LOW now — the HIGH row shipped
  this window), last pass 2026-08-25 (7 days ago, pass 12). Gate
  is due next tick: >72h since last pass (7 days) and 32 commits
  since, both well past the rate-limit thresholds, and no pending
  HIGH row remains to suppress it.
- **PHASE_CANDIDATES:** 22 pending mechanically per `pulse.mjs`,
  oldest 61 days (proposed 2026-07-02). Under phase 30's hand-count
  rule: **21 of 22** pending rows carry a `- proposed:` date more
  than 21 days old — only the newest (score 7.8, proposed
  2026-08-31, this window's expand-pass output) is inside the
  window. Header 2026-08-31 (pass 7). Posture still bold.
- **Issues:** 5 open — `#49` (phase 32 blocked mirror), `#48`
  (phase 32 loop mirror), `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud-token issue, phase 20), `#34` (phase 20
  mirror). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** 6/8 weighted budget in the trailing 24h (phase 33's
  ship commit weight-3, the other three commits weight-1 each) —
  2 of budget still open, unlikely to cap the next tick.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 61d).** Both trigger conditions are met, same as the
  last several digests — no promotions since 2026-08-23 (7
  phases' worth). Worth an `/oversight` pass to triage the 22
  pending rows.
- **Issues #35 / #40 / #49 (phases 20/32 blocked)** — all three
  trace to the identical cloud-push-token `workflows`-scope gap.
  This window's expand pass already filed a candidate (score 7.8)
  proposing a structural fix or documented fallback for the whole
  class — worth promoting alongside the queue-silting pass above,
  since it would resolve three durable AUDIT rows at once.
- No `[needs-user-call]` rows.

## Today's intent

No next `[ ]` build-plan phase — it's fully drained bar the two
blocked rows. The next `/march` tick should dispatch to the
critique gate (Step 2): 7 days and 32 commits since the last
pass, both past the rate-limit thresholds, and no pending HIGH
row to suppress it. After that clears, `/iterate`'s top queue
item is AUDIT's `[F, 3.6]` (CLOUD_LOOP.md's Opus-4.8 hedge gap),
narrowly ahead of the new `[A, 3.2]` README workspace-tree row
and whatever the critique pass adds. Beyond the loop's own
dispatch, the queue-silting line above is the thing most worth a
human's attention today — it's now been true for eight
consecutive digests.

## Tuning proposals

None new this tick. The systemic `workflows`-scope blocking
pattern already has a top-scored candidate (7.8, filed this
window by expand pass 7) proposing exactly the fix this digest
would otherwise suggest — filing a second would be duplicate
noise. Candidate-queue silting is already surfaced mechanically
by phase 30's own guard, working as designed; the fix is an
`/oversight` pass, not a new gate tuning.
