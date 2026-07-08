# Digest — 2026-07-08

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, four shipped, zero
no-ops: a critique pass (2 new findings: 1 HIGH, 1 LOW) and
three iterate ticks that closed the HIGH CRITIQUE row, AUDIT
`[4.9]` (closes #16), and a CRITIQUE MED row. Net effect:
AUDIT 6 -> 5 pending; CRITIQUE churned (+2 filed, -2 fixed)
but held at 5 pending. Build plan stays fully drained (18/18,
0 pending).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-07 15:07 | march | critique — pass 2, 2 new findings (1 HIGH: CLAUDE.md never reaches repo root; 1 LOW: step 7 re-copies deploy-check.mjs); 4 other findings reproduced but not re-filed, already pending since pass 1 (commit `6a2c767`) |
| 07-07 20:39 | march | iterate — closed the new CRITIQUE HIGH row, added a second `fs.cpSync` entry so `templates/claude/CLAUDE.md` lands at repo root in both playbooks' step 4 (commit `1d38b3a`) |
| 07-08 03:09 | march | iterate — shipped AUDIT `[4.9]`, declared the verify-gate variance rules once in `templates/agents.md` and aligned `bearings.md` + `verify-gate.md` (commit `56b2e41`, closes #16) |
| 07-08 08:56 | march | iterate — closed a pending CRITIQUE MED row, added the missing `plan/PHASE_CANDIDATES.md` copy to both playbooks' step-4 overlay (commit `5992bc4`) |
| 07-08 11:xx | night (this tick) | this digest |

`heartbeat` ran 4 times since yesterday's digest (07-07 13:03,
18:55, 07-08 00:53, 07:06 UTC), all green.

## Shipped

- `6a2c767` — critique pass 2: filed 1 HIGH (CLAUDE.md root
  landing) + 1 LOW (step 7 redundant copy); findings-only, no
  fix in this commit.
- `1d38b3a` — `playbooks/new-project.md` +
  `existing-project.md` step 4 only copied `templates/claude`
  to `.claude/`, so the root `CLAUDE.md` pointer Claude Code
  auto-loads never landed; added the missing copy entry to
  both playbooks.
- `56b2e41` — `templates/agents.md`'s canonical verify-gate
  composition had no documented variance rule, so
  `customization/verify-gate.md` and `templates/plan/bearings.md`
  drifted from it independently; declared the two variance
  rules once and aligned all three docs.
- `5992bc4` — `templates/README.md`'s copy contract lists
  `plan/PHASE_CANDIDATES.md` as mandatory, but neither
  playbook's step-4 copy block actually copied it; fixed both.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped).
- **AUDIT:** 5 pending (was 6) — `[4.8]`, `[3.8]`, `[3.5]`,
  `[3.2]`, `[user-issue #12]`. Header still reads 2026-07-06
  (last full Top-5 recompute); ~47h old at this tick, just
  under the 48h staleness threshold — no recompute this pass,
  but the four scored rows plus issue #12 were spot-checked
  against the current tree and all confirmed still open (will
  need a full refresh next tick if the header goes untouched).
- **CRITIQUE:** 5 pending (net unchanged; 2 filed + 2 fixed
  this window), last pass 2026-07-07 (pass 2) — now
  rate-limited again until ≥12 commits or >72h.
- **PHASE_CANDIDATES:** 17 pending, unchanged, last pass
  2026-07-06, posture bold.
- **Issues:** 1 open (#12). #16 closed this window by
  `56b2e41`. No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand.
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself — needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan has no pending phase (18/18). Critique just ran
(pass 2, 07-07 15:07) so it's rate-limited again; expand isn't
due (last pass 2026-07-06, needs ≥20 commits or >7 days) — the
next several march ticks route to `/iterate`. Top AUDIT
finding: `[4.8]` `cloud_loop.schedule_cron` is inert, same gap
`daily_ceiling` had before phase 17 (impact 6, ease 8) — add an
`applyScheduleCron` following the same anchor-and-warn pattern
in `bootstrap.mjs`. Note it will compete against CRITIQUE's two
pending MED rows (blanket `skills/` copy, sed grep scope gap),
which likely outscore it on the same 0-10 scale.

## Tuning proposals

None. The pulse shows both rate-limit gates working as
designed this window: critique fired once after clearing the
>72h-since-last-pass threshold, then correctly rate-limited
itself again on the very next tick; expand stayed quiet because
neither of its thresholds (≥20 commits / >7 days) has cleared.
Four ticks, four ships, zero no-ops — no starved queue, no
mistuned gate.
