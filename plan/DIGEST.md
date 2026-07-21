# Digest — 2026-07-21

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Clean window: 3 shipping ticks, 3 clean fixes, all three carrying
the `Cloud-Run:` trailer correctly — yesterday's one-off miss
didn't recur. The fourth tick correctly no-op'd (`/oversight
audit`, nothing pending to ship). A fresh AUDIT sweep ran mid-
window and turned up three new LOW/MED rows. Build plan stays
empty (18/18); `/expand` is now rate-limit-eligible again (20
commits since pass 3, right at the ≥20 threshold) for the first
time since 2026-07-16.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-20 14:46 | march → iterate | closed CRITIQUE pass-6 MED: step 9's bootstrap-manifest copy target didn't exist yet at `playbooks/new-project.md:512-514` (commit `c23a86f`) |
| 07-20 20:31 | march → iterate | closed CRITIQUE pass-6 MED: `deploy-check.mjs`'s provider comment / step 7's "uncomment the matching block" no longer matched the live runtime switch (commit `ffe7ffb`) |
| 07-21 03:05 | march → iterate | closed AUDIT `[A/E, 4.5]`: placeholder-sweep one-liners omitted `./data`, stranding GitHub-as-DB adopters' `<PROJECT>`/`<PROJECT_PKG_PREFIX>` tokens; fresh A-G sweep also filed 3 new AUDIT rows (commit `ced0304`) |
| 07-21 08:55 | march → oversight (audit mode) | read-only briefing — build plan empty, CRITIQUE/AUDIT queues held nothing newly actionable this tick — correctly shipped nothing |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `c23a86f` — CRITIQUE MED: step 9's bootstrap manifest copy
  now targets a directory that exists at that point in the walk.
- `ffe7ffb` — CRITIQUE MED: `deploy-check.mjs`'s header comment
  and playbook step 7 reworded from "uncomment" to the real
  `DEPLOY_PROVIDER` runtime switch.
- `ced0304` — AUDIT `[A/E, 4.5]`: placeholder-sweep one-liners
  (bash + PowerShell) now cover `./data`.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 6 pending, header refreshed today (2026-07-21, a
  full A-G sweep, not just the scope fix). Rows: `[user-issue
  #12]` (standing, blocked on `ACTIONS_PAT` lacking `workflows`
  scope, unchanged since 2026-07-12); `[A/E, 2.7]` README's
  "Files added" checklist undersells `scripts/`; `[C/F, 1.6]`
  fictional example deploy URL in
  `templates/skills/bootstrap.md:217`; three new rows from
  today's sweep — `[B, 4.5]` `existing-project.md`'s overlay
  creates an empty `plan/phases/` with no brief inside it,
  `[D, 1.8]` two unwrapped bullets at `README.md:309`, `[A,
  1.35]` `cloud-loop.md`'s "three new files" header lists only
  two.
- **CRITIQUE:** 1 pending (LOW, `<PROJECT_PKG_PREFIX>` worked-
  example gap in `templates/README.md`, still unfixed), last
  pass 2026-07-19 (pass 6) — both pass-6 MED rows drained this
  window (see Shipped).
- **PHASE_CANDIDATES:** 20 pending, last `/expand` pass still 3
  (2026-07-16), posture bold. Exactly 20 commits have landed
  since pass 3's commit (`6aaa6b9`) — at the ≥20-commit gate, so
  `/expand` is eligible on the next tick for the first time in
  five days. None promoted or rejected yet (all 20 sit in
  Pending since 2026-07-02 earliest).
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3 `Cloud-Run:`-tagged commits in the trailing 24h,
  well under the 8/24h ceiling; all three carry the trailer —
  yesterday's `a74f7b6` miss was a one-off, not a pattern.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **Candidate backlog** — 20 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted since the queue opened 2026-07-02. The `[score
  9.0]` `new-project.md` step-4/7 rewrite has now been
  re-evidenced across three separate critique cycles
  (2026-07-06, -10, -13) and is the clearest promote-first
  candidate; worth an `/oversight` pass. The two prior
  meta-loop candidates (`[score 7.5]` background-agent dispatch,
  `[score 6.5]` Cloud-Run trailer verification) remain
  unpromoted too — this window's clean, trailer-complete runs
  add supporting evidence for the latter but don't resolve the
  promotion decision either way.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
down to a single LOW row, AUDIT's `[B, 4.5]` (existing-
project.md's empty `plan/phases/` overlay) is now the highest-
scoring open item excluding the blocked `#12`, and the most
likely next `/iterate` pick. Separately, `/expand` cleared its
≥20-commit rate limit with this window's ticks — the next march
tick may run pass 4 instead of (or alongside) an `/iterate` pick,
its first opportunity since pass 3 on 2026-07-16.

## Tuning proposals

None this pass — the pulse showed no mistuned gate: all three
shipping ticks landed clean with correct trailers, the one
no-op tick deferred correctly (nothing pending), and heartbeat
ran 5/5 green. The two standing meta-loop candidates from prior
passes (async-background-agent dispatch, Cloud-Run trailer
verification) remain open in `plan/PHASE_CANDIDATES.md` awaiting
`/oversight`; nothing new to file.
