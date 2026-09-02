# Digest — 2026-09-02

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

One ceiling-capped no-op then four shipped ticks: critique pass
13 landed 3 fresh findings, two of which were drained same-window
by `/iterate` alongside AUDIT's top scorer (the CLOUD_LOOP.md
Opus-4.8 hedge gap); build plan stays fully drained bar its two
`workflows`-scope-blocked phases; and the candidate-silt line
fires for the ninth straight digest — 21 of 22 pending candidates
are now >21 days old, oldest 62 days, no promotions since
2026-08-23.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-01 13:04 | march → (ceiling) | no-op — weighted budget hit 8/8, dispatch step skipped entirely |
| 09-01 17:34 | march → critique | shipped `73068d6` — pass 13, 3 findings (0 high, 2 med, 1 low) |
| 09-01 22:21 | march → iterate | shipped `efbd55b` — closed pass-13's top MED row (install-hooks.mjs missing from the prune list); closes #51 |
| 09-02 06:47 | march → iterate | shipped `bc75567` — closed pass-13's other MED row (`templates/workspace/` ships `<WORKSPACE_ORG>` with no replace step) |
| 09-02 12:31 | march → iterate | shipped `f89cdf3` — closed AUDIT's `[F, 3.6]` row (CLOUD_LOOP.md's Opus-4.8 mentions unhedged) |

`heartbeat` ran green throughout (5/5 sampled).

## Shipped

- `73068d6` — critique pass 13: 3 findings (0 high, 2 med, 1
  low) from a fresh dry-run adoption walk — `templates/workspace/`
  ships `<WORKSPACE_ORG>` with no documented replace step,
  README's top-level kit tree still omits `templates/workspace/`
  (added 2026-08-31), and `playbooks/new-project.md`'s prune list
  omits `scripts/install-hooks.mjs` (added 2026-08-30).
- `efbd55b` — fixed the install-hooks.mjs prune-list gap: added
  the missing bullet to `playbooks/new-project.md`'s cross-check
  list and both worked rm/Remove-Item examples.
- `bc75567` — fixed the `<WORKSPACE_ORG>` gap: added a
  workspace-specific placeholder mini-table plus a sed/PowerShell
  one-liner to `playbooks/workspace.md`, mirroring
  `new-project.md` step 9's pattern.
- `f89cdf3` — fixed CLOUD_LOOP.md's stale hedge: the Opus 4.8
  line in the cost table and "Upgrading the model" section now
  carries the same "(ids age — check /model)" hedge the adjacent
  Sonnet 5 line already had; same bug class as this file's two
  prior stale-model-id fixes.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase 20
  (`workflows`-scope gap, `[user-issue #35]`) and phase 32 (same
  gap, `[user-issue #49]`), both unchanged since their respective
  block dates (2026-08-23, 2026-08-30). No next `[ ]` row exists;
  fully drained apart from these two.
- **AUDIT:** 7 pending, header 2026-09-01 (<48h, no refresh
  needed this tick). Three durable rows unchanged
  (`[user-issue #40]`, `[user-issue #35]`, `[user-issue #49]`,
  all the same `workflows`-scope root cause). Four non-durable
  rows remain: `[A, 3.2]` README's kit-tree still omits
  `templates/workspace/` (also filed independently in CRITIQUE's
  queue below — same gap, two sources), `[C, 2.7]`
  PHASE_CANDIDATES.md's stale `digest.md §4` citation, `[C, 2.4]`
  triage.md's dead `ship-data.md §6` citation, `[A, 2.4]`
  guard.mjs template drift (missing `\n`-exclusion in the
  `templates/` regex mirror).
- **CRITIQUE:** 5 pending (all LOW), last pass 2026-09-01 (pass
  13, ~39h ago). Both pass-13 MED rows shipped this window,
  leaving 5 LOW rows: setup-time drift ("2-4 hours" vs the
  reconciled "2-3 hours"), undefined "canonical sibling",
  placeholder step-5 undersell, undefined "Posture-gated", and
  the same `templates/workspace/` tree-omit AUDIT's `[A, 3.2]`
  already carries.
- **PHASE_CANDIDATES:** 22 pending mechanically per `pulse.mjs`,
  oldest 62-63 days (proposed 2026-07-02). Hand-count per phase
  30's rule: **21 of 22** pending rows carry a `- proposed:` date
  more than 21 days old — only the newest (score 7.8, proposed
  2026-08-31) is inside the window. Header still 2026-08-31 (pass
  7). Posture still bold.
- **Issues:** 5 open — `#49` (phase 32 blocked mirror), `#48`
  (phase 32 loop mirror), `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud-token issue, phase 20), `#34` (phase 20
  mirror). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** 4/8 weighted budget in the trailing 24h (all four
  shipped commits are churn-weight critique/iterate commits, none
  ticked a build-plan `[x]` row) — 4 of budget still open for the
  next tick.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 62d).** Both trigger conditions are met, same as the
  last several digests — no promotions since 2026-08-23 (9 days,
  9 consecutive digests now). Worth an `/oversight` pass to triage
  the 22 pending rows.
- **Issues #35 / #40 / #49 (phases 20/32 blocked)** — all three
  trace to the identical cloud-push-token `workflows`-scope gap.
  A structural-fix candidate (score 7.8, proposed 2026-08-31) is
  already queued and would resolve all three durable AUDIT rows
  at once if promoted alongside the silting pass above.
- No `[needs-user-call]` rows.

## Today's intent

No next `[ ]` build-plan phase — fully drained bar the two
blocked rows. CRITIQUE's gate isn't due yet (last pass ~39h ago,
well under the rate-limit thresholds, and 5 LOW rows remain
pending). The next `/march` tick should dispatch to `/iterate`:
top of the queue is a tie between AUDIT's `[A, 3.2]` (README's
missing `templates/workspace/` tree line) and CRITIQUE's
identical finding — either closes both rows in one edit per the
"favor cheaper, single-section" pattern this loop already
follows. Beyond the loop's own dispatch, the queue-silting line
above is the thing most worth a human's attention today — it's
now been true for nine consecutive digests.

## Tuning proposals

None new this tick. The systemic `workflows`-scope blocking
pattern already has a top-scored candidate (7.8, filed
2026-08-31) proposing exactly the fix this digest would otherwise
suggest — filing a second would be duplicate noise. Candidate-
queue silting is already surfaced mechanically by phase 30's own
guard, working as designed; the fix is an `/oversight` pass, not
a new gate tuning.
