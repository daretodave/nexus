# Digest — 2026-07-12

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, all four shipped
(zero no-ops), all four routing to `/iterate` — build plan
stays empty (18/18) and both rate-limited gates (critique,
expand) sat under threshold all window. Closed AUDIT `[3.2]`
(mermaid style outlier), a CRITIQUE LOW row (CLAUDE.md missing
from README's post-adopt checklist), AUDIT `[2.1]` (closes
#18: templates/README.md's mismatched placeholder sample), and
a CRITIQUE HIGH row (`plan/phases/` missing from step 4's bulk
copy). AUDIT's queue is now down to its one standing blocked
row (`user-issue #12`); CRITIQUE still carries 6. Gate green,
ceiling 4/8.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-11 14:30 | march | iterate — closed AUDIT `[3.2]`, formalized mermaid `flowchart` as the decision-routing-only idiom in `bearings.md` voice rule 8 (commit `7ac0a97`) |
| 07-11 20:20 | march | iterate — closed a CRITIQUE LOW row, added CLAUDE.md to README's post-adopt "files added" checklist (commit `81b5e91`) |
| 07-12 03:07 | march | iterate — closed AUDIT `[2.1]` (closes #18), fixed `templates/README.md`'s mismatched placeholder sample vars (commit `bfff77e`) |
| 07-12 08:50 | march | iterate — closed a CRITIQUE HIGH row, folded `plan/phases/` into step 4's bulk copy array (commit `61e2a78`) |
| 07-12 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `7ac0a97` — AUDIT `[3.2]`: the kit's two mermaid flowcharts
  (README's playbook picker, `customization/data-layer.md`'s
  variant picker) are the same branching-decision shape used
  consistently, not unrelated one-offs; kept both and codified
  the rule in `plan/bearings.md` voice rule 8.
- `81b5e91` — CRITIQUE LOW: `playbooks/new-project.md` step 4
  already copies CLAUDE.md to the repo root (load-bearing —
  Claude Code only auto-loads it from root), but README's
  "review what landed" checklist never listed it; added.
- `bfff77e` — AUDIT `[2.1]` (closes #18): `templates/README.md`'s
  abbreviated bash sample declared `PROVIDER`/`REPO` while the
  placeholder table and `playbooks/new-project.md` #4's
  exhaustive script use `HOSTING_PROVIDER`/`REPO_SLUG`, and
  covered only 2 of 8 placeholders; deleted the sample, pointed
  straight at the exhaustive script instead.
- `61e2a78` — CRITIQUE HIGH: step 4's `fs.cpSync` array never
  included `templates/plan/phases/`, so step 5's brief shipped
  with unresolved placeholders (sed sweep ran before the file
  existed); added the pair to step 4's copy array and reworded
  step 5 to edit the already-swept local copy.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
- **AUDIT:** 1 pending — `[user-issue #12]` (standing, blocked
  on `ACTIONS_PAT` lacking `workflows` scope). Header dated
  2026-07-11 (~24h old, under the 48h refresh threshold) — not
  stale; two rows closed this window (`[2.1]`, `[3.2]`) and
  none replaced them, so the only thing left in AUDIT is the
  row no cloud tick can fix.
- **CRITIQUE:** 6 pending, last pass 2026-07-10 (pass 3, down
  from 8 at digest time yesterday — one HIGH and one LOW closed
  this window). 8 commits since pass 3 (~44h elapsed) — under
  the ≥12-commit/72h threshold, not due next tick.
- **PHASE_CANDIDATES:** 18 pending, last pass 2026-07-10 (pass
  2), posture bold, unchanged. 7 commits since — well under the
  ≥20-commit/>7-day threshold, not due next tick.
- **Issues:** 1 open (`#12`, `triage:loop-queued`). No
  `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` and
  `../semilayer/plan/lessons.md` not present in this
  environment — skipped.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]` — now AUDIT's
  only pending row.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). Neither critique
nor expand is due next tick (both well under threshold), so the
next march tick should route to `/iterate` again. With AUDIT's
only pending row blocked on a human, its top *actionable*
finding now comes from CRITIQUE's 6 pending rows — most likely
one of the three MED rows clustered in
`playbooks/new-project.md`'s step-4/7 region (the pnpm-only
sed-replace gap, the blanket `skills/` copy vs. adopt-by-need,
or the sed one-liner's scope missing `./scripts` and
`.env.example`) — the same region the standing score-9.0 phase
candidate already targets, a fourth cycle of signal reinforcing
it rather than raising anything new.

## Tuning proposals

None. Zero no-op ticks this window; both rate-limited gates
(critique at 8/12 commits and ~44/72h, expand at 7/20 commits)
fired on schedule last window and are correctly quiet now,
comfortably under threshold rather than starved. Daily ceiling
(8) isn't being approached — 4 commits in the last 24h. AUDIT
naturally drained to its one human-blocked row without a
mistuned gate; that's the loop working as designed, not a
starved queue. No tuning candidate filed.
