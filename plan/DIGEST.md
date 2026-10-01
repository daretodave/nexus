# Digest — 2026-10-01

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet, clean window — two march ticks, both dispatched to
`/iterate`, each shipped one small fix and closed its mirror
issue; nothing in AUDIT or CRITIQUE clears the 3.0 ship floor
right now, and the build plan has nothing left but its two
long-blocked phases.

## While you were out

Window: since the last digest commit (2026-09-30 16:30 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-30 23:27 | march → iterate | shipped `plan/CRITIQUE.md`'s pending finding — `playbooks/new-project.md`'s step-4 data-layer copy was prose-only ("also copy ... to ./data/"); added an explicit `cp -r` + PowerShell `Copy-Item -Recurse` pair matching the playbook's other copy steps. Closed #68, commit `7af5db9`. |
| 10-01 08:17 | march → iterate | documented the confirmed cloud-push workflows-scope gap: `agents.md`'s `ACTIONS_PAT` bullet and `.github/CLOUD_LOOP.md` setup step 3 both described the 2026-08-23 grant as settled, but AUDIT's own `#35`/`#40`/`#49` rows show three confirmed push failures caused by the Claude Code Action's App token overriding `ACTIONS_PAT` for workflow-file pushes. Added the caveat plus a "when something breaks" pointer at the local-`/oversight` workaround. Closed #69, commit `7be0a04`. |

`heartbeat` ran green across the window (5/5 success, no
alarms). No gate failures — both ticks committed clean on the
first pass.

## Shipped

By `/march` this window (see table above): the new-project
data-layer copy-command fix (#68) and the agents.md/CLOUD_LOOP.md
workflows-scope-gap note (#69). This digest ships nothing
beyond itself — no doc fixes, no template edits, per its own
rails; `plan/AUDIT.md` is same-day fresh (header `2026-10-01`,
last touched by the second tick above) so it gets no refresh
this pass.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 39
  days blocked) and phase 32 (`#49`, 32 days blocked), both
  still on the same cloud-push-token workflows-scope gap, now
  explicitly documented in `agents.md` as of this window's
  second tick (unchanged mechanically — still needs a local
  `/ship-a-phase` or `/oversight` session with normal
  repo-write push).
- **AUDIT:** 6 pending rows (net unchanged this window — neither
  tick touched AUDIT's Pending block beyond logging). Header
  fresh (2026-10-01). Top score is `[F, ~2]` at 2.0 (impact 4 ×
  ease 5 / 10) — still below the 3.0 ship floor on its own; the
  other five rows are the four durable blocked/external-issue
  rows (`#67`, `#54`, `#40`, `#35`, `#49`, all ≤0.8) that can't
  be shipped from inside a tick.
  Pending confirmed empty — both this window's fixes drained it.
  Last pass 41h ago (pass 22, 2026-09-30).
- **PHASE_CANDIDATES:** 30 pending (23 >21d), oldest 92d
  (proposed 2026-07-02, unchanged row) — flat vs. yesterday, no
  new candidate filed this window. Raw count still includes
  four `[promoted …]` rows never relocated out of `## Pending`
  (real actionable pending is 26) — already filed as its own
  candidate (score 3.5, 2026-09-29), still pending, not yet
  promoted.
- **Issues:** 7 open (`#67`, `#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`) — unchanged from yesterday; no new issues opened
  or closed by this window's ticks beyond `#68`/`#69` above.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't —
  documented but still unresolved.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (23 pending >21d,
  oldest 92d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) are cleared; the queue's own aging-silt fix (score 3.5)
  is itself one of the 23.

## Today's intent

No `[ ]` build-plan rows remain — per `skills/march.md` §3 the
next tick dispatches to `/iterate`'s audit queue. But AUDIT's
Pending block is now empty and CRITIQUE's queue is also empty,
so the next organic tick is most likely a fresh A-G AUDIT
re-sweep or a new `/critique` pass turning up something new —
or a human `/oversight` session to unblock phases 20/32 and
start draining the aging candidate queue.

## Tuning proposals

None this pass. The one live mistune signal (candidate-queue
silting) already has its own pending candidate (score 3.5,
2026-09-29); nothing else in this window's pulse suggests a
gate, cadence, or ceiling needs re-tuning.
