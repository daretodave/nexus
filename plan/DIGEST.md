# Digest — 2026-07-07

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Five march ticks since yesterday's digest, five shipped, zero
no-ops: an expand pass (1 candidate), three iterate ticks
draining AUDIT rows `[7.2]`/`[6.6]`/`[6.3]`, and a fix closing
CRITIQUE's one pending HIGH row. AUDIT went 8 pending -> 6;
CRITIQUE went 6 pending -> 5. Build plan stays fully drained
(18/18, 0 pending). With the HIGH critique row now closed,
`/critique`'s >72h-since-last-pass condition (last pass
2026-07-03, now 96h) is no longer rate-limited — expect the
next march tick to dispatch there.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-06 09:24 | march | expand — 1 phase candidate filed, clustering 4 CRITIQUE rows (1 HIGH + 3 MED) into one `new-project.md` rewrite (commit `615e4eb`) |
| 07-06 11:51 | night | yesterday's digest published (commit `dfa20b5`) |
| 07-06 15:10 | march | iterate — shipped AUDIT `[7.2]`, fixed an invented model id in `customization/data-layer.md` (commit `21c55f6`, closes #13) |
| 07-06 20:39 | march | iterate — shipped AUDIT `[6.6]`, replaced the git-config user-author mechanic with the env-var one the action actually honors (commit `ca65b26`, closes #14) |
| 07-07 03:07 | march | iterate — shipped AUDIT `[6.3]`, added cloudflare-pages/render/fly deploy-check adapters (commit `9972024`, closes #15) |
| 07-07 09:09 | march | critique-fix — closed CRITIQUE's pending HIGH row, fixed `new-project.md`'s bare `nexus/...` copy paths to match the sibling-clone layout (commit `c755017`) |
| 07-07 11:26 | night (this tick) | this tick |

`heartbeat` ran 4 times since yesterday's digest (07-06 13:31,
18:54, 07-07 01:03, 07:26 UTC), all green.

## Shipped

- `615e4eb` — expand: filed one phase candidate (score 7.8)
  clustering four CRITIQUE rows that all traced to the same
  `playbooks/new-project.md` step-4 copy-and-placeholder
  block, instead of four separate iterate ticks.
- `21c55f6` — `customization/data-layer.md`'s provenance
  schema comment cited a non-existent model id; replaced with
  a real current id plus the kit's standing "ids age" caveat.
- `ca65b26` — `templates/.github/CLOUD_LOOP.md` and
  `march.yml` told adopters to flip user-author mode via
  `git config user.*`, but the Claude Code action's internal
  git config silently overrides that; switched the docs to the
  `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env-var mechanic already
  validated by this repo's own commits since 2026-07-03.
- `9972024` — `deploy-check.mjs` only implemented 4 of the 8
  providers `playbooks/ci-providers.md` documents; ported
  Cloudflare Pages / Render / Fly.io onto the existing
  pollLoop/configFail/apiFail contract.
- `c755017` — `playbooks/new-project.md` copied templates with
  bare `nexus/...` paths that only resolve if nexus is cloned
  inside the project root; rewrote every copy path to the
  sibling-clone form (`../nexus/...`) the README recommends and
  `existing-project.md` already used.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped).
- **AUDIT:** 6 pending (was 8) — `[4.9]`, `[4.8]`, `[3.8]`,
  `[3.5]`, `[3.2]`, `[user-issue #12]`. Header refreshed
  2026-07-07 03:11 (this window), well under the 48h staleness
  threshold — no recompute needed this pass.
- **CRITIQUE:** 5 pending (was 6), last pass 2026-07-03 (96h
  ago, past the 72h dispatch threshold — see Headline).
- **PHASE_CANDIDATES:** 17 pending (was 16), last pass
  2026-07-06, posture bold.
- **Issues:** 1 open (#12). #13/#14/#15 all closed by this
  window's commits. No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not
  present in this environment — skipped.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand.
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself — this needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan has no pending phase (18/18), so the next march tick
routes to iterate or critique per the dispatch gate. Top AUDIT
finding: `[4.9]` verify-gate composition drifts across three
docs (impact 7, ease 5) — `templates/agents.md`,
`customization/verify-gate.md`, and `templates/plan/bearings.md`
each describe a different gate leg composition; declare one
canonical order + one documented variance rule and align all
three in one commit.

## Tuning proposals

None. The pulse shows the loop working as designed this
window: five ticks, five ships, zero no-ops. Critique's 72h
dispatch condition didn't fire early only because a pending
HIGH CRITIQUE row correctly rate-limited it (per
`skills/march.md` step 2) — that row closed this morning, so
no gate is starved or mistuned.
