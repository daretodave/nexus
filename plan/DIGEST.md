# Digest — 2026-09-23

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean, quiet day — 6 of 7 march ticks shipped single-line
drift/hygiene fixes with no crashes and every Cloud-Run trailer
intact, but the candidate queue kept silting (22 now over 21
days, up from 21) and the two workflows-scope-blocked phases
crossed 31 and 24 days waiting on a human.

## While you were out

Window: since the last digest commit (2026-09-21 16:35 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-21 22:59 | march → iterate | shipped `3a63235` — closed critique pass 19's MED finding (`prompts/adopt.md` step 4a's unresolved forward-reference to "the topology check below"). |
| 09-22 07:16 | march | clean no-op, no commit — 2-minute run, nothing due or scoring above threshold. |
| 09-22 13:04 | march → iterate | shipped `3eaf61d` — AUDIT `[C/A, 3.2]`: README's `templates/.github` tree omitted `ISSUE_TEMPLATE/`. |
| 09-22 17:55 | march → iterate | shipped `e7b4172` — fresh A-G sweep found and fixed `scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` missing 4 per-file-expanded template dirs (the same blind-spot class that let the prior tick's `ISSUE_TEMPLATE/` gap go undetected). |
| 09-22 22:43 | march → iterate | shipped `8ec86f3` — AUDIT `[B, 4.2]`: no documented step ever creates `setup/00_files.md`, despite two docs referencing it as already existing. |
| 09-23 07:19 | march → iterate | shipped `72c0aad` — `bootstrap-automation.md`'s "Provider adapters" section described a modular adapter-file architecture `bootstrap.mjs` doesn't actually have. |
| 09-23 13:20 | march → iterate | shipped `db27b37` — README's "What's in this kit" tree omitted the root `CONTRIBUTING.md`. |

`heartbeat` ran green throughout (5/5 sampled) — nothing to
watchdog this window. Every commit above carries an intact
`Cloud-Run:` trailer (checked by hand across all six).

## Shipped

- `3a63235` — critique pass 19's finding closed: `prompts/adopt.md`
  step 4a pointed at a topology check that textually followed the
  whole numbered reading list, unresolvable on a literal first read.
- `3eaf61d` — README's `templates/.github` tree gains the
  `ISSUE_TEMPLATE/` entry `templates/README.md` already had.
- `e7b4172` — `scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` widened to
  cover `templates/.github`, `templates/data`, `templates/setup`,
  and `templates/env` (198 tree entries, 59 files reverse-checked,
  up from 50) — closes the structural gate blind spot, not just
  the one instance found the prior tick.
- `8ec86f3` — `customization/external-services.md`'s runbook
  workflow gains a new step 1 (bash + PowerShell) that copies
  `templates/setup/00_files.md` in and sweeps the `<PROJECT>`
  token — no prior path ever created the file it assumed existed.
- `72c0aad` — `bootstrap-automation.md`'s "Provider adapters"
  section rewritten to match what `bootstrap.mjs` actually does.
- `db27b37` — README's kit tree gains the root `CONTRIBUTING.md`
  row.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 31 days
  blocked) and phase 32 (`#49`, 24 days blocked), both still on the
  same cloud-push-token workflows-scope gap, unchanged.
- **AUDIT:** 5 pending rows, unchanged in kind — `[F, ~2]` (low
  priority, explicitly flagged as possibly not worth a tick) plus
  the four durable blocked user-issue rows (`#54`, `#40`, `#35`,
  `#49`). Header reads 2026-09-22 (last full A-G sweep landed
  ~2026-09-22 18:10 UTC, per `e7b4172`'s tick) — well under the 48h
  refresh threshold, no re-sweep this pass.
- **CRITIQUE:** 0 pending, last pass 19 (2026-09-21), ~2 days ago.
- **PHASE_CANDIDATES:** 27 pending (22 >21d, up from 21 yesterday),
  oldest 84d (proposed 2026-07-02, unchanged row) — no new
  candidate added; the "Workflow-scope-blocked lane" row (proposed
  2026-08-31) crossed the 21-day mark since yesterday's digest.
- **Issues:** 6 open, unchanged (`#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 84d).** Both trigger conditions remain met and the >21d
  count grew again (21 → 22). Worth an `/oversight` pass to drain
  or explicitly defer the backlog.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 31 days) and phase 32 (`#49`, 24 days).
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31) targets this
  exact recurring blocker — it would close `#35`, `#40`, and `#49`
  together if it lands, and is itself now 23 days old and
  unpromoted. Worth surfacing to `/oversight` alongside the general
  silting line above.
- The standing `[score 4.2]` candidate ("AUDIT.md's H1 header date
  isn't mechanically bumped after a full sweep") is still pending;
  no new evidence this tick.

## Today's intent

No `[ ]` build-plan phase pending (only the two blocked rows).
`plan/CRITIQUE.md` is empty. AUDIT's only unblocked row is
`[F, ~2]`, already flagged as possibly not worth shipping — the
next `/iterate` pass will likely find both queues too thin to ship
from and route to `/expand` instead (pass 13 ran 2026-09-19, due
again soon).

## Tuning proposals

None. All six cloud commits this window carry an intact
`Cloud-Run:` trailer, no march tick crashed, and no new
gate-mistuning signal surfaced — the standing candidates already
on file (crash-alarm dedupe, candidate-queue silting, the AUDIT
header bump) cover everything this pass's pulse numbers would
otherwise motivate.
