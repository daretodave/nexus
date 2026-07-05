# Digest — 2026-07-05

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, four shipped — no
no-op ticks this window: phase 11 (ship-migration skill),
phase 12 (critique-session refresher + secret liveness), phase
13 (nightly full-smoke workflow + stack lifecycle), phase 14
(bootstrap v2). Build plan down to 2 open phases (15, 17); the
AUDIT header is a day old (not yet 48h stale) so this tick
skips the refresh.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-04 14:32 | march | shipped — phase 11, `ship-migration.md` + additive-migration linter (commit `fc54023`) |
| 07-04 20:21 | march | shipped — phase 12, critique-session refresher + secret liveness probe (commit `5cee3e6`) |
| 07-05 03:07 | march | shipped — phase 13, nightly full-smoke workflow + stack:up/down scripts (commit `fbeaa40`) |
| 07-05 09:03 | march | shipped — phase 14, bootstrap v2 / Ember lessons list (commit `c2724f5`) |
| 07-05 11:10 | night (scheduled) | this tick |

`heartbeat` ran 4 times since yesterday's digest (07-04 12:40,
18:35, 07-05 01:05, 07:24 UTC), all green.

## Shipped

- `fc54023` — phase 11: `templates/skills/ship-migration.md` +
  `templates/scripts/lint-migration.mjs` — the data-layer
  Pattern B/D promise (companion skill + additive-only
  migration lint) the kit had described in prose but never
  shipped. Wired into both READMEs and `data-layer.md`.
- `5cee3e6` — phase 12: `templates/scripts/refresh-critique-
  session.mjs` + `templates/scripts/check-secrets-liveness.mjs`
  — auth-aware-critique Pattern B's promised session refresher,
  plus GH_TOKEN / CRITIQUE_* liveness checks for hands-off.md
  Step 5.2's pre-flight.
- `fbeaa40` — phase 13: `templates/scripts/stack-lifecycle.mjs`
  + `templates/.github/workflows/nightly-smoke.yml` — hermetic-
  e2e's Pattern B up/down mechanics and the nightly
  `SMOKE_SAMPLE=full` job for projects without the night shift.
- `c2724f5` — phase 14: bootstrap v2 — closes five
  `bootstrap.mjs` TODOs (Supabase JSON parsing + key
  extraction, `vercel push-env --sensitive`, the decorated-
  march install path, runbook checkbox write-back). Closes #9.

## Queues now

- **Build plan:** 2 open phases (15 — brownfield kit /
  CURRENT-STATE.md + preview-branch deploy-gate; 17 —
  budget-aware ceiling), 0 blocked. Four phases shipped since
  yesterday (11–14).
- **AUDIT:** header dated 2026-07-04 (refreshed by yesterday's
  digest tick) — under the 48h staleness bar, so no recompute
  this pass. 7 pending rows unchanged: `[6.6]`, `[7.2]`,
  `[6.3]`, `[4.9]`, `[3.8]`, `[3.5]`, `[3.2]`.
- **CRITIQUE:** 6 pending (1 HIGH, 3 MED, 2 LOW), pass 1 from
  2026-07-03, unchanged. Top: README's sibling-clone layout
  breaks `playbooks/new-project.md`'s bare `nexus/...` copy
  paths.
- **PHASE_CANDIDATES:** 16 pending, 0 promoted, 0 rejected,
  unchanged since 2026-07-03. Top: workspace-of-repos as a
  first-class adoption path (score 8.8).
- **Issues:** none open — `triage:needs-user` and `loop:do`
  both empty, and no open issues at all.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

None — no blocked build-plan rows, no needs-user issues, no
`[needs-user-call]`s.

## Today's intent

Next build-plan row: **Phase 15 — Brownfield kit:
`templates/plan/CURRENT-STATE.md` + preview-branch deploy-gate
pattern**.

Top audit finding: **`[7.2]` data-layer.md cites an invented
model id** — `customization/data-layer.md`'s example still uses
`"claude-opus-4.7"`, not a real id (impact 6, ease 9, score
5.4 — highest of the 7 pending rows, unchanged from yesterday).

## Tuning proposals

none — this window is the most productive since digest started
tracking it (4/4 march ticks shipped a phase, zero no-ops,
zero failures), the opposite of a starved dispatcher. CRITIQUE
and PHASE_CANDIDATES sitting unchanged since 2026-07-03 is the
same deliberate-human-review shape flagged in the prior two
digests, not a gate defect — `/oversight` promotion and a fresh
`/critique` pass are infrequent by design. No blocked rows, no
stale needs-user issues, no duplicate-tick collisions in the
pulse — nothing to retune this tick.
