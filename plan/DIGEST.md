# Digest — 2026-07-20

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Clean, productive window: 4/4 ticks since yesterday's digest
shipped, zero no-ops, zero failures — a fresh `/critique` pass
(6) fired mid-window and both its HIGH rows were drained same
night, plus AUDIT's `[A/C, 3.2]` kit-tree gap closed. One of the
four ticks landed without its required `Cloud-Run:` trailer,
silently exempting it from the ceiling's own count; filed as a
tuning candidate rather than fixed directly. Build plan stays
empty (18/18); ceiling reads 3/8 by trailer count but 4/8 by
actual cloud commits shipped.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-19 14:29 | march → iterate | closed AUDIT's `[A/C, 3.2]` row: README's kit-tree block now lists `PHASE_CANDIDATES.md` and `CURRENT-STATE.md` under `templates/plan/` (commit `a6bb5e9`) |
| 07-19 20:18 | march → critique | pass 6 — dry-run adoption filed 4 fresh findings (2 HIGH, 2 MED) into `plan/CRITIQUE.md` (commit `a74f7b6`); **shipped with no `Cloud-Run:` trailer** — see Tuning proposals |
| 07-20 03:06 | march → iterate | closed pass 6's top-scoring HIGH: `<PROJECT_PKG_PREFIX>` carried a literal `@` that duplicated the replacement value's own sigil, corrupting package imports into `@@<name>/...` (commit `65a87ce`) |
| 07-20 09:05 | march → iterate | closed pass 6's other HIGH: step 9's `pnpm bootstrap:status` / `pnpm bootstrap` don't exist as scripts anywhere in the kit — reworded to the real `/bootstrap status` / `/bootstrap` slash commands (commit `515247b`) |

`heartbeat` ran 4/5 green over its last-5 sample; the one
failure (07-20 00:56 UTC, run `29710186380`) was a transient
GitHub API `503` on `gh run list` mid-step, not a loop problem —
the next firing (07-20 07:21) completed clean. No wedged runs,
no flatline alarm.

## Shipped

- `a6bb5e9` — AUDIT `[A/C, 3.2]`: README's kit-tree gains the
  two `templates/plan/` files it was missing.
- `a74f7b6` — CRITIQUE pass 6: 4 findings filed (2 HIGH, 2 MED).
- `65a87ce` — CRITIQUE HIGH: `<PROJECT_PKG_PREFIX>` double-`@`
  bug fixed in `templates/skills/ship-a-phase.md` and
  `customization/verify-gate.md`.
- `515247b` — CRITIQUE HIGH: step 9's stale `pnpm bootstrap*`
  invocations reworded to the real `/bootstrap` slash commands.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 3 pending, header dated 2026-07-19 (~24h old, under
  the 48h refresh threshold — no fresh sweep this pass). Rows:
  `[user-issue #12]` (standing, blocked on `ACTIONS_PAT` lacking
  `workflows` scope, unchanged since 2026-07-12), `[A/E, 2.7]`
  README's "Files added" checklist undersells `scripts/` (still
  reproduces, unchanged), `[C/F, 1.6]` the fictional example
  deploy URL in `templates/skills/bootstrap.md:217` (unchanged).
  The fourth row from yesterday's sweep, `[A/C, 3.2]`, closed
  this window (see Shipped).
- **CRITIQUE:** 3 pending, pass 6 (2026-07-19, up from pass 5).
  One LOW carried over (`<PROJECT_PKG_PREFIX>` worked-example
  gap in `templates/README.md`, still unfixed — distinct from
  the double-`@` bug closed above). Two MED rows are new from
  pass 6 and not yet shipped: step 9's manifest-copy target
  directory doesn't exist yet at `playbooks/new-project.md:512-514`,
  and step 7's "uncomment the matching block" instruction no
  longer matches `deploy-check.mjs`'s live `if/else if` branches
  at `playbooks/new-project.md:455-456`. Not due for another
  fresh pass (4 commits, <24h since pass 6).
- **PHASE_CANDIDATES:** 20 pending (19 + 1 filed this pass — see
  Tuning proposals), last `/expand` pass still 3 (2026-07-16),
  posture bold. 16 commits since that pass — still short of the
  ≥20-commit or >7-day gate.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3/8 Cloud-Run-tagged commits in the trailing 24h
  by the workflow's own `--grep='Cloud-Run:'` count, but 4
  cloud commits actually shipped in that window — the gap is
  `a74f7b6`'s missing trailer (before this digest's own commit
  lands as a 4th/5th).

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **New this pass:** the 2026-07-19 20:18 UTC `/critique` tick
  (commit `a74f7b6`) shipped without the `Cloud-Run:` trailer
  agents.md rule 2 requires on every cloud commit. Nothing
  broke — the commit landed clean and the run itself was green —
  but it's a standing-rule miss worth a human's attention if it
  recurs; filed as a tuning candidate below rather than patched
  directly (out of this pass's remit).
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE's two
fresh MED rows from pass 6 now out-rank AUDIT's remaining
`[A/E, 2.7]` and `[C/F, 1.6]` scores, so the next tick or two
will most likely be another `/iterate` pass picking off one of
those MEDs — most plausibly the `deploy-check.mjs` "uncomment
the matching block" drift (a documentation/reality mismatch an
adopter would hit immediately) or the step 9 manifest-copy
target-directory gap. `PHASE_CANDIDATES` is still well short of
its rate-limit threshold, so `/expand` is unlikely to fire soon.
Worth a human glance at both standing candidates below — the
async-background-agent one from 2026-07-18, still unpromoted,
and this pass's new Cloud-Run-trailer one.

## Tuning proposals

One filed this pass: `[score 6.5] Mechanically verify the
Cloud-Run trailer on cloud ticks`, in
`plan/PHASE_CANDIDATES.md`. Evidence: 1 of 4 cloud commits in
the trailing 24h (`a74f7b6`) shipped without the trailer
agents.md rule 2 requires, which also means the workflow's own
`--grep='Cloud-Run:'` ceiling check silently undercounted that
tick — the miss is invisible from both the rule side and the
counting side. Proposed scope: a post-agent step in `march.yml`
that diffs `HEAD` against the pre-run SHA and opens an issue if
new commits landed without the trailer, since `scripts/verify.mjs`
can't distinguish cloud from local commits at gate time. The
prior pending candidate (`[score 7.5] Cloud march ticks must not
dispatch background/async agents`, filed 2026-07-18) remains
unpromoted; this window's clean run adds no new evidence either
way — a decision for `/oversight`, not this pass.
