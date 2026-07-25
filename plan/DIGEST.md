# Digest — 2026-07-25

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Clean 26h window: 4 of 5 `march` ticks shipped, one legitimate
no-op (no candidate cleared threshold, not ceiling-starved).
Both of AUDIT's two highest scorers from yesterday's sweep
shipped — `[A/E, 2.7]` (README "Files added" undersells
`scripts/`) and `[A, 2.4]` (README kit tree omits
`skills/digest.md`) — which also confirms yesterday's
starved-queue tuning candidate: its target row is no longer
stuck. Build plan stays empty (18/18); candidate backlog holds
flat at 21, still zero promotions since 2026-07-02.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-24 08:53 | march → iterate | shipped CRITIQUE's last LOW row — `.claude/` bundle never offered for pruning; drained CRITIQUE to empty (`9d404ce`) |
| 07-24 11:09 | night → digest | wrote 07-24's `plan/DIGEST.md`, filed tuning candidate `[score 6.0]` (`86a9e5a`) |
| 07-24 14:35 | march → iterate | shipped AUDIT `[A, 4.8]` — `claude-code.md` taught the `claude_args` JSON form `march.yml` documents as broken (`a2a966a`) |
| 07-24 20:31 | march → iterate → expand | clean no-op — 21 candidates confirmed, no signal cleared threshold, tree stayed clean |
| 07-25 03:04 | march → iterate | shipped AUDIT `[A/E, 2.7]` — README "Files added" checklist undersells `scripts/` (`df2bb47`) |
| 07-25 08:42 | march → iterate | shipped AUDIT `[A, 2.4]` — README kit tree omits `skills/digest.md` from the `skills/` enumeration (`70028ff`) |
| 07-25 10:54 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `9d404ce` — `playbooks/new-project.md`'s "Prune adopt-by-need
  files" section gained a ninth bullet covering the
  `.claude/settings.json` + `guard.mjs` + `.claude/CLAUDE.md` +
  `scripts/notify.mjs` bundle for adopters not running the loop
  on Claude Code, matching `templates/README.md:131`. Emptied
  `plan/CRITIQUE.md`'s Pending queue.
- `a2a966a` — `customization/claude-code.md:310` no longer
  teaches the `claude_args: {"model": "..."}` JSON form as the
  cloud-loop model-routing lever; `.github/workflows/march.yml`
  ships the CLI-flag string form instead after a real incident
  showed the JSON form silently drops `permissionMode`. Closed
  AUDIT `[A, 4.8]`, this sweep's highest-scoring finding.
- `df2bb47` — README's "Files added" checklist now lists
  `scripts/` alongside the other bulk-copied directories. Closed
  AUDIT `[A/E, 2.7]`.
- `70028ff` — README's collapsed `skills/` tree gained a
  `skills/digest.md` leaf ("never dispatched by march"),
  matching `templates/README.md:41`'s templated twin. Closed
  AUDIT `[A, 2.4]`.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header `2026-07-24` — <48h old, no refresh due.
  5 Pending rows (was 5, net unchanged: two shipped, two
  carried, none new): standing `[user-issue #12]` (blocked,
  unchanged since 2026-07-12); new top scorer `[D, 1.8]` —
  `README.md:309, 324` unwrapped bullets; `[A, 1.6]` — build
  plan's stale carry-over counts; `[C/F, 1.6]` — fictional
  `ember.vercel.app` URL now resolving to a real site; `[A,
  1.35]` — `cloud-loop.md`'s "three new files" header lists two.
- **CRITIQUE:** 0 pending, unchanged. Last pass 2026-07-22
  (pass 7).
- **PHASE_CANDIDATES:** 21 pending, flat since yesterday. Last
  `/expand` pass still 4 (2026-07-22); posture bold. None
  promoted or rejected — zero promotions since the queue opened
  2026-07-02 (now three weeks running).
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 4 `Cloud-Run:`-tagged commits in the trailing 24h
  (`86a9e5a`, `a2a966a`, `df2bb47`, `70028ff`), well under the
  8/24h ceiling; all carry the trailer correctly.

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
  `plan/PHASE_CANDIDATES.md`, zero promoted in three weeks. The
  `[score 9.0]` `new-project.md` step-4/7 rewrite is still
  re-evidenced across four cycles (2026-07-06, -10, -13, -21)
  and remains the clearest promote-first candidate; worth an
  `/oversight` pass. Unchanged from yesterday's digest.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
empty, AUDIT's `[D, 1.8]` row — two (now three) unwrapped
bullets at `README.md:309, 324` breaking the locked ~62-64 col
wrap rule — is the clear highest-scoring open item excluding
the blocked `#12`, and the most likely next `/iterate` pick:
cheap (ease 9), mechanical, no design judgment needed.

## Tuning proposals

None this pass. Yesterday's `[score 6.0]` starved-queue
candidate (`plan/PHASE_CANDIDATES.md`) named `[A/E, 2.7]` as
the row losing ties for a week straight — that row shipped this
window (`df2bb47`), so the underlying symptom is resolved
without needing the tie-break rule written yet; the candidate
itself stays open for `/oversight` to judge on its own merits.
The one no-op tick this window was a legitimate "nothing cleared
threshold" outcome, not a starved or mistuned gate — no new
proposal filed.
