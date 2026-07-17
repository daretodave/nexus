# Digest — 2026-07-17

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two productive ticks, one clean triage no-op, and one silently
wasted tick since yesterday's digest: `/critique` pass 5 filed
3 findings, the next `/iterate` tick closed the MED one at the
source and folded in a fresh audit sweep — but the tick between
them reached iterate's audit-refresh step, launched a
background subagent for the sweep, and the cloud job exited
before that agent could ever return. No commit, no crash, just
a lost tick — filed below as a tuning proposal. Build plan
stays empty (18/18); ceiling 2/8; heartbeat 5/5 green.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-16 14:41 | march → triage | two unlabeled issues (#22, #23), both the same transient `oauth_org_not_allowed` infra flake as the closest prior failure (07-16 08:48); root-caused, commented, closed `triage:closed` (matching #21 precedent). Clean no-op, no commit |
| 07-16 20:20 | march → critique | pass 5: dry-run adoption walk (halcyon/netlify/main) into a scratch dir; 3 findings (0 high, 1 med, 2 low) — MED dead `.claude/commands/*.md` pointers left behind by the adopt-by-need prune; two LOW doc-redundancy findings (commit `0d120c1`) |
| 07-17 03:04 | march → iterate | reached the audit-refresh step, found `plan/AUDIT.md` >24h stale, and launched an async background subagent to run the A-G sweep instead of running it inline — the log shows it deciding to "wait for the audit agent to finish," then the job's own `terminal_reason` flips to `completed` ~4 seconds later with no commit, no verify run, and no trace of the subagent's output. Silent no-op tick (run `29551508864`) |
| 07-17 08:45 | march → iterate | closed the same `.claude/commands/*.md` dead-pointer gap CRITIQUE pass 5 found (score 5.2 by impact×ease/10, top of the re-sweep): extended `templates/README.md`'s adopt-by-need table + `playbooks/new-project.md`'s prune examples to the other 4 prunable skills (ship-data, ship-migration, ship-asset, moderate); ran the A/C/F/G audit sweep inline in the same tick — no async agent this time, ~6 minutes wall-clock (commit `4ca0c36`, closes #24) |
| 07-17 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window. One `march` failure just outside the strict 26h
window (07-16 08:48, run `29484794188`) was the same
`oauth_org_not_allowed` flake the 14:41 triage tick already
closed out via #22/#23 — no separate action needed.

## Shipped

- `0d120c1` — CRITIQUE pass 5: filed 1 MED + 2 LOW findings
  from a fresh dry-run adoption walk plus a stranger-read of
  `README.md`. The MED row (adopt-by-need prune leaves dead
  `.claude/commands/*.md` pointers for 4 of 5 prunable skills)
  became the top-scoring queue item for the next tick.
- `4ca0c36` — AUDIT + CRITIQUE MED, closes #24: added the
  missing `.claude/commands/*.md` table pointers for
  ship-data/ship-migration/ship-asset/moderate in
  `templates/README.md`'s adopt-by-need table, and extended
  `playbooks/new-project.md`'s worked `rm -f` /
  `Remove-Item` prune examples to match. Also ran a fresh C/F/G
  audit re-sweep in the same tick (link rot: none beyond the
  already-fixed `thock.netlify.app`, now confined to historical
  log prose; model ids: all three current; sibling lessons:
  still absent locally) and refreshed `plan/AUDIT.md`'s header
  to 2026-07-17.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 2 pending — `[user-issue #12]` (standing, blocked
  on `ACTIONS_PAT` lacking `workflows` scope, unchanged since
  2026-07-12) and `[A/E, 2.7]` README's "Files added" checklist
  undersells `scripts/`. Header dated 2026-07-17 (this window's
  08:45 tick) — fresh, no refresh needed.
- **CRITIQUE:** 8 pending, pass 5 (2026-07-16 20:27). One MED
  row closed this window (`4ca0c36`); the remaining MED (the
  unworked npm/yarn/bun sed example vs. `settings.json`'s
  pnpm-only allowlist) and 7 LOW rows are unchanged. Not due
  for a fresh pass (2 commits, <24h since pass 5 — threshold is
  ≥12 commits or >72h).
- **PHASE_CANDIDATES:** 18 pending + 1 filed by this digest
  (below) = 19, last pass 3 (2026-07-16), posture bold. Only 2
  commits since that pass — nowhere near the ≥20-commit or
  >7-day `/expand` gate.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row
  as AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open. #22/#23/#24 all closed this window.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 2/8 Cloud-Run-tagged commits in the trailing 24h
  (before this digest's own commit lands as the 3rd).

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE and
PHASE_CANDIDATES are both freshly-passed and far from their
rate-limit thresholds, so the next tick or two will most likely
be another `/iterate` pass, picking off AUDIT's remaining
unblocked row (`[A/E, 2.7]`, the `scripts/` checklist undersell)
or one of CRITIQUE's 8 pending rows (the pnpm/npm sed-example
MED is the highest-scoring unblocked queue item right now).
Worth a human glance at whether the 03:04 async-agent no-op
(see below) is a one-off or will recur on the next stale-audit
tick — the fix is filed as a candidate, not yet applied.

## Tuning proposals

Filed one candidate to `plan/PHASE_CANDIDATES.md`: cloud march
ticks must not dispatch background/async agents — a GitHub
Actions job is single-shot, so there is nothing left running to
deliver a background agent's completion notification once the
step (and the job) exits. The 07-17 03:04 tick (run
`29551508864`) proved this concretely — it hit the same
"AUDIT.md >24h stale" branch the very next tick (07-17 08:45,
run `29567537795`) also hit, but that tick ran the sweep inline
and shipped cleanly in ~6 minutes. Same input, two different
dispatch strategies, one silent loss — 1 of 4 ticks in this
window burned for nothing. Not self-tuned per the meta-loop
rail: proposal only, `/oversight` decides whether and how to
wire an explicit "run synchronously" instruction into the
cloud-mode prompt block.
