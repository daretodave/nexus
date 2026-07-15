# Digest — 2026-07-15

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three productive ticks and one clean no-op since yesterday's
digest: two `/iterate` doc-drift fixes (link rot, a missing
README command-table row), one full A-G `/iterate` sweep
(stale "six skill files" count), and `/expand` fired on its
bold-posture + signal gate but filed zero candidates — the
fresh CRITIQUE findings were single-file fixes, not
phase-worthy clusters. Build plan stays empty (18/18); ceiling
4/8; heartbeat 5/5 green.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-14 14:35 | march → iterate | AUDIT `[C, 4.8]`: `thock.netlify.app` 404s across five call sites; confirmed dead via curl, replaced all five with `thock.xyz` (commit `e1d4607`) |
| 07-14 20:26 | march → iterate | AUDIT `[A, 4.2]`: README's "What you get" command tables never listed `/digest` or `/moderate`; added both, deliberately skipped `/lessons-pr` (nexus-self meta-skill, no `templates/skills/` counterpart) (commit `abf2cdb`) |
| 07-15 03:04 | march → expand | rate-limit gate opened (bold posture + signals present) but filed nothing — the two fresh CRITIQUE findings since the last pass were single-file doc fixes, not a phase-worthy cluster; clean no-op, no commit |
| 07-15 08:48 | march → iterate | AUDIT `[A, 3.2]`: `README.md`/`new-project.md` both promised a fixed "six skill files" count against a 15-file (11-15 pruned) reality; reworded to "the skill set" (commit `8802058`) |
| 07-15 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `e1d4607` — AUDIT `[C, 4.8]`: replaced all five
  `thock.netlify.app` occurrences (`README.md:53`,
  `templates/README.md:87`, `playbooks/new-project.md:98,245,261`)
  with `thock.xyz` after confirming the Netlify domain 404s and
  the `.xyz` one returns 200.
- `abf2cdb` — AUDIT `[A, 4.2]`: added `/digest` to the main
  command table and `/moderate` to the opt-in table in
  README.md's "What you get" section. Scoped down from the
  finding's original suggestion by skipping `/lessons-pr` — it's
  a nexus-self meta-skill adopters never copy, so the existing
  forward-reference at `README.md:237` already covers it more
  accurately than a table row would.
- `8802058` — AUDIT `[A, 3.2]` + matching CRITIQUE LOW row:
  reworded `README.md:381` and `playbooks/new-project.md:18`'s
  stale "six skill files" claim to "the skill set", since
  `templates/skills/` ships 15 files and adopt-by-need pruning
  leaves 11-15 depending on scope.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 2 pending — `[user-issue #12]` (standing, blocked
  on `ACTIONS_PAT` lacking `workflows` scope, unchanged since
  2026-07-12) and `[A/E, 2.7]` README's "Files added" checklist
  undersells `scripts/` (lists only `deploy-check.mjs`, not the
  full bulk-copied set). Header dated 2026-07-14 — under the
  48h staleness threshold, no refresh needed.
- **CRITIQUE:** 6 pending, pass 4 (2026-07-13 15:09), unchanged
  this window — no new dry-run pass due yet.
- **PHASE_CANDIDATES:** 18 pending, last pass 2 (2026-07-10
  20:36), posture bold. 19 commits since that pass (threshold
  ≥20) — `/expand` dispatched this window on the bold-posture +
  signal check and correctly filed nothing rather than pad the
  queue; one more shipping commit likely crosses the raw
  20-commit mark, but with no fresh phase-worthy cluster behind
  it that alone won't force new candidates.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row
  as AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 4/8 Cloud-Run-tagged commits in the trailing 24h
  (before this digest's own commit lands as the 5th).

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
fully built; every tick routes to `/critique`, `/expand`, or
`/iterate`. With CRITIQUE's queue unchanged (6 pending, pass 4
still ~2 days old) and PHASE_CANDIDATES sitting just under its
commit threshold with nothing fresh to add, the next tick or
two will most likely be another `/iterate` pass, picking off
AUDIT's remaining unblocked row (`[A/E, 2.7]`, the
`scripts/` checklist undersell) or one of CRITIQUE's pending
MED rows (the unworked npm/yarn/bun sed example vs.
`settings.json`'s pnpm-only allowlist; the prune-table
subsection covering only 4 of ~12 adopt-by-need rows).

## Tuning proposals

None. This window ran as designed: `/expand`'s gate opened
right on its posture-and-signal check and correctly produced a
clean no-op rather than filing weak candidates just to fill the
cap — that's the rate limit working, not starving. AUDIT and
CRITIQUE both drained normally (one row each closed this
window) with no flakes or unexplained no-ops, and the ceiling
(4/8) is nowhere near saturation. Worth another look once
PHASE_CANDIDATES' pass-2 backlog (18, unpromoted since
2026-07-02/03 seeding) gets an `/oversight` pass — that queue's
only drain is interactive and it's been five days quiet, but
that's a human-cadence question, not a gate to tune.
