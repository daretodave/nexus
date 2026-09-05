# Digest — 2026-09-05

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean, fully-shipped window: a `/critique` pass found 3 fresh
findings, two straight `/iterate` ticks fixed the MED and one of
the two LOWs, and a `/triage` tick caught the pass's own
`Cloud-Run:` trailer miss and routed it into `plan/AUDIT.md` as
`[user-issue #53]` — a third instance of a known bug, now
root-caused: sub-agent delegation strips the trailer, not a
missing line in `skills/critique.md`. Re-evidenced the standing
6.5 candidate with that root cause. The candidate queue keeps
silting: still 21 of 22 pending are >21 days old, oldest now 66
days, no promotions since 2026-08-23 (13 days).

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-04 17:21 | march → critique | shipped `3f29301` — pass 14, 3 findings (1 MED, 2 LOW); commit itself missing the `Cloud-Run:` trailer (see Shipped) |
| 09-04 22:05 | march → triage | shipped `8499870` — routed the trailer miss into `plan/AUDIT.md` as `[user-issue #53]` |
| 09-05 06:39 | march → iterate | shipped `fb3254c` — closed CRITIQUE's MED row (Day-1 checklist gated on an unwired `pnpm verify`) |
| 09-05 11:37 | march → iterate | shipped `b7bd527` — closed CRITIQUE's "working pnpm verify" LOW row |

`heartbeat` ran green throughout (5/5 sampled). No crashed or
no-op ticks this window — all four ran shipped something.

## Shipped

- `3f29301` — critique pass 14: filed a MED (Day-1 checklist
  gates on `pnpm verify` running, but step 6 says no
  `package.json` exists yet) and two LOWs (README's "working
  `pnpm verify`" overclaim; README's tick transcript uses
  `Triage`/`Critique`/`Expand`/`Dispatch` before the table that
  defines them). This commit itself landed with no `Cloud-Run:`
  trailer — the pass had been delegated to a sub-agent that ran
  the walk *and* the commit/push itself, using a prompt that
  never carried the trailer text.
- `8499870` — triage routed the above gap into `plan/AUDIT.md`
  as `[user-issue #53]` (score 3.7 — top of the AUDIT queue),
  naming the exact mechanism: delegation, not a skill-file typo.
- `fb3254c` — had `playbooks/new-project.md` step 7 wire the
  step-6 verify-gate scripts (`typecheck`/`test:run`/`build`/
  `e2e`/`verify`) into `package.json` alongside `deploy:check`,
  and repointed step 6's forward reference at step 7 instead of
  phase 1 — closes CRITIQUE's MED row.
- `b7bd527` — softened README's "Review what landed" bullet from
  "a working `pnpm verify`" to "specified and ready to wire once
  phase 1 lands," matching `playbooks/new-project.md:693`'s own
  weaker claim — closes one of CRITIQUE's two LOW rows.

Also re-evidenced `plan/PHASE_CANDIDATES.md`'s standing 6.5
candidate ("Mechanically verify the Cloud-Run trailer") with
this tick's root-cause finding — see Tuning proposals.

## Queues now

- **Build plan:** 31/33 shipped, 0 pending, 2 blocked — phase 20
  and phase 32, both on the same `workflows`-scope gap
  (`[user-issue #35]`/`#49`), unchanged since 2026-08-23 and
  2026-08-30. No next `[ ]` row exists.
- **AUDIT:** header dated 2026-09-04, ~23h since the last full
  sweep — inside the 48h freshness window, no resweep needed
  this pass. 7 pending (up
  from 6): the three durable `workflows`-scope rows (`#40`,
  `#35`, `#49`), the new `[user-issue #53]` trailer-delegation
  row (score 3.7, current top), `[A, 3.6]` README's verify-leg
  undercount, and two unchanged LOWs (`[C, 2.4]` triage.md's dead
  citation, `[A, 2.4]` guard.mjs template drift).
- **CRITIQUE:** 1 pending (drained from 3), pass 14, ~37h ago.
  Remaining row: `[LOW]` README's tick transcript uses undefined
  shorthand terms before the table that defines them.
- **PHASE_CANDIDATES:** 22 pending mechanically per `pulse.mjs`,
  oldest 66 days (proposed 2026-07-02). Hand-count per phase
  30's rule: **21 of 22** pending rows carry a `- proposed:` date
  more than 21 days old — only the newest (score 7.8, proposed
  2026-08-31) is inside the window. Header still 2026-08-31
  (pass 7). Posture still bold.
- **Issues:** 6 open — `#53` (new trailer-delegation mirror),
  `#49`/`#48` (phase 32 blocked + loop mirror), `#40` (phase 23
  follow-up, blocked), `#35`/`#34` (phase 20 blocking token issue
  + loop mirror). No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 66d).** Both trigger conditions remain met, same as the
  last several digests — no promotions since 2026-08-23 (13 days
  now). Worth an `/oversight` pass to triage the 22 pending rows.
- **Issues #35 / #40 / #49 (phases 20/32 blocked)** — all three
  trace to the identical cloud-push-token `workflows`-scope gap.
  A structural-fix candidate (score 7.8, proposed 2026-08-31) is
  already queued and would resolve all three at once if promoted.
- **Issue #53 (new)** — `/critique`'s sub-agent delegation can
  commit + push on the parent tick's behalf without the
  cloud-mode trailer. AUDIT's `next` field already names the
  fix: narrow `skills/critique.md` step 3 so a delegate only
  performs the walk (steps 3-5) and never step 6/7. Currently
  AUDIT's top-scored row (3.7).
- No `[needs-user-call]` rows.

## Today's intent

No next `[ ]` build-plan phase — fully drained bar the two
blocked rows. CRITIQUE has one LOW row left, competing with
AUDIT by score. AUDIT's current top is `[user-issue #53]`
(score 3.7, ease 8) — narrowing `skills/critique.md`'s
delegation note is a small, high-ease fix that also closes the
open issue. The next `/march` tick should dispatch there.
Beyond the loop's own dispatch, the queue-silting line above is
the thing most worth a human's attention today — it's now been
true for twelve consecutive digests.

## Tuning proposals

Re-evidenced (not new): `plan/PHASE_CANDIDATES.md`'s standing
6.5 candidate ("Mechanically verify the Cloud-Run trailer on
cloud ticks") now carries a third instance (`3f29301`,
2026-09-04) plus the root cause this tick's `/triage` surfaced —
delegation-shaped, not a missing line in the critique skill's
commit step. Filed as an evidence-trail update, not a new
candidate, since the existing row already proposes the right
mechanical safety net; `[user-issue #53]`'s own AUDIT fix
targets the specific delegation gap and the two are noted as
complementary rather than overlapping. No other gate mistuning
found this pass — the workflows-scope blocking pattern already
has its top-scored candidate (7.8) queued.
