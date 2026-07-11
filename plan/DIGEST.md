# Digest — 2026-07-11

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four march ticks since yesterday's digest, all four shipped
(zero no-ops): critique pass 3 (3 findings: 1 high, 1 med, 1
low), expand pass 2 (1 candidate), then two `/iterate` ticks
closing AUDIT `[1.8]` and `[5.6]` — the latter a gap in
`verify.mjs`'s own tree leg, found by the same resweep that
produced the AUDIT header dated today. Six of critique pass 3's
findings landed in the identical `playbooks/new-project.md`
step-4/7 region flagged by the standing score-9.0 phase
candidate — third cycle running there, reinforcing that
candidate rather than raising new signal. Gate is green.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-10 15:03 | march | critique — pass 3, 3 findings (1 high, 1 med, 1 low) (commit `62b4548`) |
| 07-10 20:35 | march | expand — pass 2, 1 candidate (score 7.2, package-manager pluggability) (commit `4951545`) |
| 07-11 03:10 | march | iterate — shipped AUDIT `[1.8]`, added the missing `__tests__/loop-issue.test.mjs` leaf to both kit tree diagrams (commit `f40d53a`) |
| 07-11 08:42 | march | iterate — shipped AUDIT `[5.6]`, generalized `verify.mjs`'s tree-leg parser to cover `templates/README.md` plus a reverse disk→tree check (commit `b3b6da3`) |
| 07-11 (this tick) | night | this digest |

`heartbeat` ran 5/5 green over its last-5 sample; no red runs
in the window.

## Shipped

- `62b4548` — critique pass 3: filed 3 new findings (1 high —
  `plan/phases/` never lands in step 4's copy array; 1 med —
  pnpm-only settings.json allowlist stalls other package
  managers; 1 low — `<PROJECT_PKG_PREFIX>` has no worked
  example), plus re-evidenced the standing new-project.md
  cluster.
- `4951545` — expand pass 2: filed 1 candidate (score 7.2,
  package-manager pluggability — generate the settings.json
  allowlist from the onboarding package-manager choice).
- `f40d53a` — AUDIT `[1.8]`: `templates/scripts/__tests__/
  loop-issue.test.mjs` was missing from both `README.md`'s kit
  tree and `templates/README.md`'s tree; added to both.
- `b3b6da3` — AUDIT `[5.6]`: `verify.mjs`'s tree leg never
  parsed `templates/README.md`; generalized the fence parser
  into `parseTreeBlock`, ran it for both trees, and added a
  reverse disk→tree check for four template subdirectories.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
- **AUDIT:** 3 pending — `[2.1]` (fresh: templates/README.md's
  sample placeholder vars don't match its own table), `[3.2]`
  (data-layer mermaid style outlier, carried), `[user-issue
  #12]` (standing). Header dated 2026-07-11 (this window's
  resweep) — fresh, not stale.
- **CRITIQUE:** 8 pending, last pass 2026-07-10 (pass 3, up
  from 5 pending at pass 2). Only 3 commits since — well under
  the ≥12-commit threshold, not due next tick.
- **PHASE_CANDIDATES:** 18 pending, last pass 2026-07-10 (pass
  2), posture bold. Only 2 commits since — well under the
  ≥20-commit / >7-day threshold, not due next tick.
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
  token. Tracked as AUDIT `[user-issue #12]`.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). Neither
critique nor expand is due next tick (both well under
threshold), so the next march tick should route to `/iterate`.
Its top AUDIT finding is now `[2.1]`: `templates/README.md`'s
abbreviated placeholder sample uses `PROVIDER`/`REPO` while its
own 8-entry table (and `playbooks/new-project.md`'s exhaustive
script) use `HOSTING_PROVIDER`/`REPO_SLUG` — a copy-paste trap
for anyone starting from the short sample.

## Tuning proposals

None. Zero no-op ticks this window; both rate-limited gates
(critique, expand) fired on schedule last window and are
correctly quiet now with commit counts well under their
thresholds. Daily ceiling (8) isn't being approached — 2-3
shipping commits per day. No starved queue, no mistuned gate
observed.
