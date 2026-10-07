# Digest — 2026-10-07

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Two ticks shipped clean (expand pass 19, critique pass 24 with
two fresh MED findings) — but the window's first tick tried
critique at 19:17, delegated the dry-run walk to a background
subagent exactly as `skills/critique.md` step 3 prescribes, and
the job tore down before the subagent reported back: the same
background-agent-orphaning failure phase 20 exists to fix, now
confirmed at a second call site (critique's delegation, not just
iterate's audit sweep) and 45 days still unshipped.

## While you were out

Window: since the last digest commit (2026-10-06 16:56 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-06 19:17 | march → critique | Gate open (~78h since pass 23, over the 72h bar). Delegated the dry-run walk to a background sub-agent per `skills/critique.md` step 3 ("Delegate the walk to a fresh sub-agent when available"). The job's own result field reads "Waiting on the dry-run adoption agent to finish before I append findings... and ship the commit" — `terminal_reason: completed` fired first; `subagent_stats` shows `started_in_background: 1, completed: 0`. No commit; clean no-op, tree stayed clean. Same failure class as the already-promoted, still-blocked phase 20 fix, now reproduced in a second skill's delegation step. |
| 10-06 23:32 | march → expand | No pending build-plan phase. Critique gate read as "not due" this tick (commit message: "3 commits / 2 days since pass 23, below the 12-commit/72h bar") — arithmetically ~82h had actually elapsed since pass 23 (2026-10-03T13:09Z), over the 72h bar, and no commit had landed in between to change that; not pursued further here, noted as an observed inconsistency rather than a gate-tuning issue. Expand pass 19: 0 new candidates, 1 re-evidenced (auto-mode permission-model row, score 6.5, now five passes running). Delegated a fresh A-G audit sweep to a research agent — this one completed in time. Verify green. Commit `db6952b`. |
| 10-07 08:08 | march → critique | Gate still open. Ran the dry-run walk and filed findings inline (no delegation-orphan repeat). Critique pass 24: 2 fresh MED findings — a self-contradicting Node-version floor in `playbooks/new-project.md` (20+ vs ≥18) and a README Hard-Rule-6/pre-spec `AskUserQuestion` cross-reference gap. Verify green. Commit `8b606c2`. |

`heartbeat` ran green across the window (5/5 success, no
flatline alarms).

## Shipped

- Expand pass 19 (`db6952b`) — 0 new candidates, 1 re-evidenced.
- Critique pass 24 (`8b606c2`) — 2 MED findings filed to
  `plan/CRITIQUE.md`, both still open (see Queues now).
- The 19:17 tick's critique attempt shipped nothing — orphaned
  by the background-subagent bug described above.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 45
  days blocked) and phase 32 (`#49`, 38 days blocked), both on
  the same cloud-push-token workflows-scope gap; unchanged this
  window.
- **AUDIT:** 3 pending, all durable `[user-issue #N]` rows
  (`#40`, `#35`, `#49`), same root cause, all scoring 0.8 — no
  cloud-actionable row. Header 18h old, well under the 48h
  refresh trigger, left as-is.
- **CRITIQUE:** 2 pending (both MED, filed this morning by pass
  24, neither yet scored by `/iterate`); last pass 2026-10-07
  08:14 UTC (pass 24), 0 commits since — not due again yet.
- **PHASE_CANDIDATES:** 30 raw rows under `## Pending`, but 4
  are `[promoted → phase N]` rows never relocated out of Pending
  (phases 19/20/21/22, all promoted 2026-08-23) — true pending
  is 26 (21 >21d, oldest 97d, proposed 2026-07-02). Already a
  filed candidate (score 3.5, `plan/PHASE_CANDIDATES.md:1076`)
  tracking the relocation bug — not this digest's to fix.
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`) —
  unchanged this window. No open `triage:needs-user` or
  `loop:do` issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  45/38 days blocked. Tonight's 19:17 orphaned critique
  delegation is fresh evidence the bug phase 20 fixes isn't
  confined to iterate's audit sweep — it is a general
  background-Agent-default hazard that can bite any skill with
  a delegation step (`critique.md` step 3 explicitly prescribes
  one). The cost of staying blocked keeps compounding across
  skills, not just ticks.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (21 pending >21d,
  oldest 97d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) stay cleared past their bar, same as every digest since
  the alarm shipped (phase 30). The relocation bug (score 3.5)
  inflating the raw count by 4 is itself one of the 21 aging
  rows.

## Today's intent

No pending build-plan phase (0 `[ ]` rows). Critique gate just
closed (pass 24 landed this morning, 0 commits since) — not due.
Expand gate not due either (1 commit since pass 19, far under
the 20-commit/7-day bar). So the next `/march` tick falls to
`/iterate`. Scoring favors the two fresh CRITIQUE MED rows
(impact 5–7 × decent ease, both simple text fixes) over the
stuck AUDIT cluster (`#40`/`#35`/`#49`, impact 4 × ease 2 = 0.8,
not cloud-actionable) — expect `/iterate` to ship one of this
morning's two critique findings rather than touch the blocked
workflow-scope cluster again.

## Tuning proposals

None filed this pass. The one live mistune-shaped signal — a
cloud tick defaulting an `Agent` delegation to background mode
and losing the work — already has a promoted, scoped fix (phase
20, score 8.5) sitting blocked only on the workflows-scope push
gap, not on review or design. Tonight's reproduction broadens
the evidence (critique's dry-run-walk delegation, not just
iterate's audit sweep) but doesn't change the fix; filing a new
candidate would duplicate it. The candidate-queue silting and
PHASE_CANDIDATES stale-relocation signals are unchanged from
yesterday and already tracked (score 3.5 each).
