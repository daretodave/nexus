# Phase 30 — Candidate-aging silt guard in digest/expand

> Source: `plan/PHASE_CANDIDATES.md` → Promoted 2026-08-23
> (oversight, user-directed), score 6.9.
> One screen: deliverables, non-goals, decisions.

## Problem

`plan/PHASE_CANDIDATES.md` has no aging counter-pressure: 17
candidates have piled up over 7 weeks with zero promotions, the
top scorer re-evidenced eight times while waiting. `/digest`
already reports a bare pending count and the oldest-pending age
(via `pulse.mjs`), but nothing turns that number into a
decision — a human has to happen to run `/oversight` and notice
the queue is old. `skills/digest.md` already names "a starved
queue" as a meta-loop tuning trigger; it just has no number
that trips it for this specific queue.

## Deliverables

- `skills/digest.md` step 2 (gather the pulse): instruct the
  agent to also count, from `plan/PHASE_CANDIDATES.md`'s
  `## Pending` `- proposed: <date>` fields, how many pending
  candidates are older than 21 days — a hand-derived read of a
  file the step already reads, not a `pulse.mjs` change (this
  phase is doc-only per its promoted scope).
- `skills/digest.md` step 4 (write `plan/DIGEST.md`): the
  `Queues now` candidates line grows the ">21 days" count
  alongside the existing pending-count and oldest-age numbers.
  A new conditional line lands under `Needs you` — "oversight
  needed: candidate queue silting (N pending >21d, oldest
  Xd)" — when either ≥5 candidates are pending >21 days, or
  the oldest pending candidate exceeds 45 days.
- `skills/expand.md`'s candidate schema (§ Step 2's template
  and § Step 4/5's procedure): a new optional field,
  `- last re-evidenced: <ISO date>`, absent until first use.
  When a signal reinforces a candidate already `## Pending`
  instead of describing something new, `/expand` updates that
  row's `last re-evidenced` date and appends the new signal to
  its `source signals` list, rather than filing a duplicate
  candidate.
- `templates/skills/digest.md` and `templates/skills/expand.md`
  (adopter twins): the same two changes, in the templates'
  own voice (`pnpm`, `spec.md`, `<DEFAULT_BRANCH>` — no
  nexus-specific `pulse.mjs` reference, since adopter projects
  don't have that script).

## Non-goals

- **No `scripts/pulse.mjs` change.** The promoted candidate's
  scope is explicit: "doc-only edits to `skills/digest.md`,
  `skills/expand.md`, and their template twins." Teaching
  `pulse.mjs` the >21-day count is a fair follow-up but not
  this phase's scope — filed as a loose end below.
- **`last re-evidenced` does not feed the silting threshold.**
  The flag in `/digest` triggers purely on count/age of the
  `## Pending` section, regardless of whether a candidate has
  been re-evidenced recently. A candidate silting *despite*
  active re-evidence is exactly the signal `/oversight` needs
  to see — collapsing the two would hide it.
- **No change to `/expand`'s cap or scoring.** Formalizing
  re-evidence tracking doesn't relax the 3-candidates-per-pass
  cap or the scoring rubric; it only stops a re-affirmed
  candidate from being filed twice.
- **Not fixing the pre-existing `[promoted]`-tag filing drift**
  noted in `plan/DIGEST.md` (4 rows never relocated from
  `## Pending` to `## Promoted`, inflating `pulse.mjs`'s
  mechanical count by 4). Out of scope for this phase; already
  on record as a loose end, not a duplicate candidate.

## Decisions

1. Threshold is OR, not AND (≥5 pending >21 days, OR oldest
   >45 days) — either signal alone is enough evidence of
   silting; requiring both would let a queue with one ancient
   outlier and four fresh candidates pass silently.
2. 45 days for the age leg is roughly double the 21-day count
   window — long enough that a candidate crossing it has
   survived multiple `/expand` passes (rate-limited to ≥20
   commits or >7 days) without promotion, short enough to catch
   problems before a queue reaches today's real 58-day outlier.
3. The >21-day count stays a hand-derived read in the skill
   procedure rather than a `pulse.mjs` feature, honoring the
   promoted candidate's explicit "doc-only" scope. `pulse.mjs`
   already reads `PHASE_CANDIDATES.md`'s proposed dates for the
   oldest-age number, so a future phase can fold the count in
   cheaply if the hand-derived read proves error-prone.
4. `last re-evidenced` is optional and additive to the existing
   candidate schema — old candidate rows without the field stay
   valid; nothing in `/expand`'s Step 2 template or the
   `pendingSection`/`countRows` parsing in `pulse.mjs` depends
   on its presence.
