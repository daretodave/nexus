# Digest — 2026-09-28

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet, routine window: one tick closed a CRITIQUE finding
(`#66`), one was a clean no-op (nothing cleared the 3.0 ship
floor), and one ran expand pass 16, filing a single new
candidate. Nothing promoted, nothing blocked newly — candidate
queue silting ticked up by one row and a day, still the loudest
open item.

## While you were out

Window: since the last digest commit (2026-09-27 15:23 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-27 18:02 | march → iterate | shipped `25b7d35` — **closes `#66`**: `prompts/adopt.md`'s reading-list item 7 named only 4 of the 13 files `customization/*.md` matches, reading as exhaustive rather than example; reworded to "e.g. …" per CRITIQUE pass 21's finding. |
| 09-27 22:47 | march | no-op — nothing scored ≥3.0 (AUDIT topped out at `[F, ~2]`) and no fresh `/expand` signal since pass 15. Budget 4/8 weighted, not a ceiling-skip; genuinely nothing to ship. |
| 09-28 08:11 | march → expand | shipped `19a2ad7` — pass 16: swept signals A–E, filed 1 new candidate (score 6.2) — Claude Code's `/doctor prompt-audit` (and `/checkup prompt-audit`) isn't reflected in the kit's prompt-maintenance story, confirmed via a fresh raw changelog fetch. |

`heartbeat` ran green throughout (5/5 sampled this window). Both
shipped commits above carry an intact `Cloud-Run:` trailer.

## Shipped

- `25b7d35` — iterate: `prompts/adopt.md`'s reading-list item 7
  reworded from an undercounted exhaustive list to "e.g. …".
  Closes `#66`.
- `19a2ad7` — expand pass 16: 1 candidate filed (score 6.2) —
  `/doctor prompt-audit` isn't in the kit's prompt-maintenance
  story.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 36
  days blocked) and phase 32 (`#49`, 29 days blocked), both
  still on the same cloud-push-token workflows-scope gap,
  unchanged.
- **AUDIT:** 5 pending rows, unchanged content. Header
  2026-09-27, ~24h old — under the 48h refresh threshold this
  pass, so no fresh A-G sweep. Top score still ~2.0 (the
  already-hedged `[F, ~2]` model-id row), under the 3.0 ship
  floor.
- **CRITIQUE:** 0 pending, last pass 42h ago (pass 21,
  2026-09-27) — pass 21's lone finding was closed this window
  by `25b7d35`.
- **PHASE_CANDIDATES:** 29 pending (22 >21d), oldest 89d
  (proposed 2026-07-02, unchanged row) — up one row from
  yesterday (expand pass 16's new score-6.2 candidate); nothing
  drained.
- **Issues:** 6 open (`#54`, `#49`/`#48`, `#40`, `#35`/`#34`),
  unchanged. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 89d).** Both trigger conditions remain met; this
  window's ticks (one docs fix, one no-op, one expand pass) all
  left the candidate queue untouched except to add to it —
  unchanged or worse for at least four digest passes running.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 36 days) and phase 32 (`#49`, 29 days).
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31, now 28
  days old) targets the exact recurring blocker behind both
  stuck phases — it would close `#35`, `#40`, and `#49` together
  if promoted.

## Today's intent

No `[ ]` build-plan phase pending (only the two blocked rows).
AUDIT unchanged, still under the 3.0 ship floor and not yet
stale. CRITIQUE is empty. Expect the next `/march` tick to
dispatch to `/expand` again (per `iterate.md` failure mode 1)
unless a fresh CRITIQUE pass surfaces a new pending row first.

## Tuning proposals

None new. This window's three ticks were routine — a docs fix,
a genuine no-op, and an expand pass — with no new mistuned-gate
signal. The standing candidates already on file
(workflow-scope-blocked lane, candidate-queue silting) still
cover what this pass's pulse numbers would otherwise motivate.
