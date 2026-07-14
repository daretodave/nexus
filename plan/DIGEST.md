# Digest — 2026-07-14

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four cloud ticks since yesterday's digest, all four
productive. `/critique`'s rate-limit gate fired right on
schedule (pass 4, 5 new findings, 0 high/3 med/2 low) and the
next three `/iterate` ticks each shipped a fix: two CRITIQUE
MED rows (the agent-paced/human-paced estimate contradiction,
step 9's bootstrap-manifest placeholder gap) and the top AUDIT
row from the fresh A-G sweep (`existing-project.md`'s overlay
never copying `plan/steps/01_build_plan.md`). Build plan stays
empty (18/18); ceiling 5/8. No flakes, no no-ops this window.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-13 15:00 | march | critique — pass 4, 5 new findings (0 high, 3 med, 2 low); dry-run adoption + stranger-read of a fresh scratch repo (commit `a0b3791`) |
| 07-13 20:27 | march | iterate — closed a CRITIQUE MED row: README's and the playbook's time estimates read as flatly contradictory (2-4x); kept both figures but made the agent-paced vs human-paced split explicit (commit `25d496e`) |
| 07-14 03:04 | march | iterate — closed a CRITIQUE MED row: step 9's bootstrap manifest copy left `<PROJECT>`/`<PROJECT_LOWER>` placeholders unresolved with no replace instruction; added a note + scoped sed one-liner (commit `919d4b6`) |
| 07-14 08:45 | march | iterate — full A-G sweep, shipped the top AUDIT row: `existing-project.md`'s overlay never copied `plan/steps/01_build_plan.md` despite §6 telling the reader to open it; added the missing `cpSync` entry and reworded §6 (commit `cfcd057`) |
| 07-14 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `25d496e` — CRITIQUE MED: `README.md`'s and
  `playbooks/new-project.md`'s time estimates contradicted each
  other by 2-4x. Fix keeps both figures but labels them
  explicitly — README's is agent-paced (delegated run, skips
  read-and-decide pauses), the playbook's is human-paced
  (manual, section-by-section) — and cross-links them.
- `919d4b6` — CRITIQUE MED: step 9's bootstrap manifest copy
  (`./setup`) postdates step 4's placeholder sweep, so its
  `<PROJECT>`/`<PROJECT_LOWER>` tokens went unresolved with no
  instruction to fix them. Added a note plus a scoped
  `sed -i ... setup/bootstrap.local.json` one-liner to run
  before `pnpm bootstrap`.
- `cfcd057` — AUDIT `[A/B, 7.2]`: `existing-project.md`'s
  overlay never copied `plan/steps/01_build_plan.md` (only
  `mkdirSync('plan/steps')`, an empty dir), despite §6 telling
  the reader to open it. Added the missing `cpSync` entry and
  reworded §6 to point at the already-copied local file.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Still routing every tick to `/critique`/`/iterate` (no
  pending phase, no expand-due signal).
- **AUDIT:** 5 pending — `[user-issue #12]` (standing, blocked
  on `ACTIONS_PAT` lacking `workflows` scope, unchanged since
  2026-07-06) plus 4 open from the fresh A-G sweep: `[C, 4.8]`
  `thock.netlify.app` link rot, `[A, 4.2]` README's command
  table omits `/digest`/`/lessons-pr`/`/moderate`, `[A, 3.2]`
  README repeats the stale "six skill files" count, `[A/E,
  2.7]` "Files added" checklist undersells `scripts/`. Header
  dated 2026-07-14 (this cycle's sweep) — fresh, no refresh
  needed.
- **CRITIQUE:** 7 pending (2 MED, 5 LOW), pass 4 (2026-07-13
  15:09). 3 commits / ~20h since pass 4 — nowhere near the
  ≥12-commits-or->72h rate limit; next `/critique` pass not
  expected soon.
- **PHASE_CANDIDATES:** 18 pending, last pass 2 (2026-07-10
  20:36), posture bold, unchanged. 15 commits since (threshold
  ≥20, up from 10 a day ago) and ~86h/3.6 days elapsed
  (threshold >7 days) — commit count is closing in on the
  expand trigger even though the wall-clock trigger is far off;
  worth a glance next digest.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row
  as AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` and
  `../semilayer/plan/lessons.md` not present in this
  environment — skipped (cloud).
- **Ceiling:** 5/8 Cloud-Run-tagged commits in the trailing 24h
  (before this digest's own commit lands as the 6th).

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

Build plan still has no pending phase (18/18) — the kit is
fully built; every tick routes to `/critique` or `/iterate`.
CRITIQUE's rate limit just reset (pass 4 yesterday), so the
next tick or two will most likely be `/iterate` picking between
its two remaining MED rows (the unworked npm/yarn/bun sed
example vs. `settings.json`'s pnpm-only allowlist; the
prune-table subsection covering only 4 of ~12 adopt-by-need
rows) and AUDIT's top unblocked row (`[C, 4.8]` the
`thock.netlify.app` → `thock.xyz` link-rot fix, the cheapest of
the open rows). Both remaining CRITIQUE MEDs are pricier than
the two just shipped (one needs a settings.json redesign or a
stated hard pnpm prerequisite, the other five new worked
examples), so the plain link-rot fix or the smaller LOW rows
may win on ease alone.

## Tuning proposals

None. This window ran exactly as designed: `/critique`'s
gate fired on its own schedule (pass 4, right where yesterday's
digest predicted), all four ticks shipped or filed findings
cleanly with no flakes or unexplained no-ops, and the ceiling
(5/8) is nowhere near saturation. PHASE_CANDIDATES' pending
count (18) is high, but its only drain is the interactive
`/oversight` — that a queue only a human clears grows between
human sessions is expected behavior, not a gate mistuning, so
no candidate filed. Worth re-checking once its commit count
crosses 20 without an `/expand` pass adding fresh candidates —
if `/expand` also stays quiet, no candidates.
