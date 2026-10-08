# Digest — 2026-10-08

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three clean ticks, three fixes shipped — `/iterate` drained
both fresh CRITIQUE rows from pass 24 plus one AUDIT-native row,
no orphaned delegations this window; this pass's own fresh
sweep (header was 59h stale) found exactly one new row, a repeat
of the same AskUserQuestion-carve-out bug class in
`pre-spec.md`.

## While you were out

Window: since the last digest commit (2026-10-07 17:35 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-07 19:43 | march → iterate | Shipped the first of pass 24's two CRITIQUE MED rows: `playbooks/new-project.md:250-251`'s "Node ≥18" callback contradicting the file's own "Node 20+" prerequisite (and the same stale phrasing in `existing-project.md:134`). Verify green. Commit `f348e7e`. |
| 10-08 00:00 | march → iterate | Shipped pass 24's remaining CRITIQUE MED row: reworded README Hard Rule #6 to scope the "AskUserQuestion only in /oversight and /bootstrap" claim to "once a skill is running," naming `pre-spec.md`'s interactive interview as the carve-out outside that list. `plan/CRITIQUE.md`'s Pending queue now empty. Verify green. Commit `a5bd02f`. |
| 10-08 08:24 | march → iterate | Shipped the AUDIT-native `[A, 3.6]` row queued two ticks ago: `package.json`'s `engines.node` still read `">=18"`, contradicting both CI workflows (`node-version: 20`/`22`) and the just-reconciled "Node 20+" floor. Verify green. Commit `a8e1e1a`. |

`heartbeat` ran green across the window (5/5 success, no
flatline alarms). No `triage` or `loop:do` activity.

## Shipped

- `f348e7e` — `new-project.md`/`existing-project.md` Node-floor
  self-contradiction (20+ vs ≥18), CRITIQUE pass 24's first MED.
- `a5bd02f` — README Hard Rule #6 now acknowledges pre-spec.md's
  AskUserQuestion carve-out, CRITIQUE pass 24's second MED.
- `a8e1e1a` — `package.json` `engines.node` bumped `>=18` →
  `>=20`, closing the AUDIT row the Node-floor fix left behind.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 46
  days blocked) and phase 32 (`#49`, 39 days blocked), both on
  the same cloud-push-token workflows-scope gap; unchanged this
  window.
- **AUDIT:** 4 pending — the three durable `[user-issue #N]`
  rows (`#40`, `#35`, `#49`, all scoring 0.8, same root cause)
  plus one new row this pass: `[A, 3.6]`
  `playbooks/pre-spec.md:41,48` restates the AskUserQuestion
  carve-out using only "`/oversight`," the same stale-shorthand
  bug the Hard-Rule-6 fix (`a5bd02f`) just patched in README but
  never touched here. Header refreshed to today — full A-G sweep
  delegated to a research agent; G confirmed empty (no sibling
  checkout, no `NEXUS_LESSONS.md`), verify.mjs green throughout.
- **CRITIQUE:** 0 pending — both pass-24 MED rows shipped this
  window. Last pass 2026-10-07 08:14 UTC (pass 24), 3 commits
  since; not due again yet.
- **PHASE_CANDIDATES:** 30 raw rows under `## Pending`, 4 are
  `[promoted → phase N]` rows never relocated out of Pending
  (phases 19/20/21/22, all promoted 2026-08-23); true pending is
  26 (22 >21d, oldest 99d, proposed 2026-07-02). Already a filed
  candidate (score 3.5, `plan/PHASE_CANDIDATES.md:1076`) tracking
  the relocation bug — not this digest's to fix.
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`) —
  unchanged this window. No open `triage:needs-user` or
  `loop:do` issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both still need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  46/39 days blocked, unchanged in mechanism since last digest.
  `#40` (apply phase 23's patch by hand) shares the same root
  cause and waits on the same session.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (22 pending >21d,
  oldest 99d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) stay cleared past their bar, same as every digest since
  the alarm shipped (phase 30).

## Today's intent

No pending build-plan phase (0 `[ ]` rows). CRITIQUE gate just
closed (pass 24's last row shipped this window, 0 CRITIQUE-only
commits since re-opening) — not due. So the next `/march` tick
falls to `/iterate` again. Scoring favors this pass's fresh
`[A, 3.6]` pre-spec.md row over the stuck AUDIT cluster
(`#40`/`#35`/`#49`, impact 4 × ease 2 = 0.8, not
cloud-actionable) — expect `/iterate` to ship the pre-spec.md
carve-out reword next.

## Tuning proposals

None filed this pass. No mistuned gate, starved queue, or
hibernating ceiling surfaced in this window's pulse — three
ticks, three clean ships, no orphaned delegations (unlike the
prior window's background-subagent critique orphan). The two
standing structural signals (candidate-queue silting, the
PHASE_CANDIDATES stale-relocation rows) are unchanged from
yesterday and already tracked as candidates (score 3.5 each);
re-filing either here would duplicate, not add evidence.
