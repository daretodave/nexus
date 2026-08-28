# Digest — 2026-08-28

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three phases shipped back-to-back overnight (26, 27, 28) — issue
templates, the skill scaffolder, and a commit-verb lint in the
guard hook — pushing the loop's own weighted budget past its
24h cap; AUDIT stayed fresh (2.5h old) so no re-sweep was due,
and one new AUDIT row landed as phase 28's own sibling finding
(the template guard hook's regex drifted from the kit's
hardened copy).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 08-27 17:46 | march → (ceiling skip) | no-op — 17s run, cloud ceiling still capped from the prior day's ships |
| 08-27 23:08 | march → ship-a-phase | shipped `9389717` + `96d7d17` — phase 26, issue templates keyed to triage routes |
| 08-28 04:43 | march → ship-a-phase | shipped `a415cef` + `fc871f1` — phase 27, `scripts/new-skill.mjs` |
| 08-28 11:51 | march → ship-a-phase | shipped `bcd7326` + `2c2e90c` — phase 28, commit-verb vocabulary lint |

`heartbeat` ran green throughout (5/5 sampled, ~6h cadence).

## Shipped

- `9389717` + `96d7d17` — phase 26: `.github/ISSUE_TEMPLATE/`,
  four forms (`bug_report`, `friction`, `idea`, `needs_user`)
  pre-labeling the route `/triage` already knows how to drain,
  plus `config.yml` disabling blank issues.
- `a415cef` + `fc871f1` — phase 27: `scripts/new-skill.mjs`, a
  scaffolder for the two-file skill pattern (`skills/<name>.md`
  + `.claude/commands/<name>.md`, TODO-marked); `--template`
  targets the adopter-facing `templates/` twin instead.
- `bcd7326` + `2c2e90c` — phase 28: a locked commit-verb
  vocabulary documented in `plan/bearings.md` and enforced by a
  new `guard.mjs` RULES entry that extracts the commit message
  (including the `-m "$(cat <<'INNER'...)"` heredoc shape) and
  blocks an unrecognized verb. Surfaced its own follow-up finding
  — the `templates/claude/hooks/guard.mjs` twin still carries the
  older, non-`\n`-excluding regex — filed to AUDIT rather than
  fixed in the same commit (out of phase 28's scope).

## Queues now

- **Build plan:** 27/33 shipped, 5 pending, 1 blocked (phase 20,
  cloud push token lacks `workflows` scope — tracked as
  `[user-issue #35]`, unchanged since 2026-08-23). Next `[ ]` is
  phase 29 (dual-shell parity lint leg for playbooks).
- **AUDIT:** header 2.5h old (last full sweep this morning's
  `12:00` commit indirectly, via phase 28's own finding) — well
  under the 48h threshold, no re-sweep due. 7 rows Pending:
  durable `[user-issue #40]` and `[user-issue #35]`, `[F, 3.6]`
  (`CLOUD_LOOP.md`'s inconsistent Sonnet/Opus id-hedging, top
  scorer), `[C, 2.7]` (`PHASE_CANDIDATES.md`'s stale
  `digest.md §4` citation), `[C, 2.4]` (triage.md's dead
  `ship-data.md §6` citation), `[A, 2.4]` (new this window —
  `templates/claude/hooks/guard.mjs`'s regex drifted from
  `.claude/hooks/guard.mjs`'s phase-28 hardening), `[A, 1.35]`
  (cloud-loop.md's "three new files" header).
- **CRITIQUE:** 5 pending (1 HIGH, 4 LOW), last pass 2026-08-25
  (pass 12, 3 days ago). Gate not due — a pending HIGH row
  suppresses re-trigger regardless of the 72h clock, per
  `skills/march.md` §Step 2.
- **PHASE_CANDIDATES:** 17 pending, 14 promoted. Header still
  2026-08-02 (pass 6) — oldest pending candidate now 57 days old.
  Posture still bold.
- **Issues:** 3 open — `#40` (phase 23 follow-up, blocked),
  `#35` (blocking cloud token issue, phase 20), `#34` (phase-20
  mirror, open until phase 20 ships). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.
- **Ceiling:** three phase-shipping commits landed inside the
  trailing 24h window (weight 3 each = 9), already past the
  ceiling of 8 — the next `march` tick should see a clean skip.
  Working as designed: a genuinely productive stretch capped
  after the fact, not a starved or hibernating day.

## Needs you

- **Issue #35 / Phase 20** — nexus's own cloud push token still
  can't write `.github/workflows/*.yml`. Needs a local session
  to inspect `ACTIONS_PAT`'s actual scope grants and test a
  plain `git push` against a workflow file with that token.
- **Issue #40 / phase 23 follow-up** — the identical wall on
  nexus's own `march.yml`/`night.yml` crash-alarm patch. The
  issue body carries a ready `git apply`-able diff; needs the
  same local, human-authenticated push as #35.
- No `[needs-user-call]` rows.

## Today's intent

Build plan's next `[ ]` is phase 29 — dual-shell parity lint leg
for playbooks. `plan/AUDIT.md`'s top row stays `[F, 3.6]`
(`CLOUD_LOOP.md`'s Opus-4.8 hedge gap), which will compete
against `plan/CRITIQUE.md`'s HIGH row (the AskUserQuestion
documentation contradiction, 3 days old) on the next `/iterate`
tick — the HIGH row should still win on score. The new `[A, 2.4]`
guard.mjs-drift row is a clean, self-contained fix (port one
regex change + a self-test case to the template twin) whenever
it surfaces to the top of the queue.

## Tuning proposals

None new this tick. Two candidate mistuning signals were
considered and both hold from the prior digest's reasoning:
the ceiling exceeding its 24h budget (9/8 weighted) is the gate
doing its job after three legitimate phase ships, not
hibernating a productive day — no fix needed. The candidate
queue's silting (17 pending, oldest 57 days, header stale since
pass 6) is real but its fix is already queued as build-plan
phase 30 (candidate-aging silt guard, promoted 2026-08-23);
filing a second candidate for the same gap would be duplicate
noise.
