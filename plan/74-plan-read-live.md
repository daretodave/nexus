# 74 — Every step reads the plan live

> The plan is what drives the loop, so a step that acts on a
> copy of it read earlier in the tick is acting on a guess.
> Find every place a skill or script reads plan state once
> and reuses it, and make each one read again at the moment
> it decides.

## Why

Field research (2026-11-06, re-evidenced 2026-11-13) shows
spec-driven tooling splitting in two: kits where the spec is
a planning document read at the start, and kits where the
spec state is an operational layer the agents keep reading
through the build. This kit claims the second. The claim
holds only if lanes, `needs`, Held lines, claims and pending
closes are read at each step that depends on them. A tick
that picks a chunk, builds for twenty minutes and then closes
it against the plan as it stood at pick time can land on a
chunk another session has since claimed, held or closed.

## Design

- An audit first, as a table in the spec's close: each skill
  step and script that reads `plan/README.md`, a spec file,
  `plan/pending/`, the claims ref or the Held lane, and
  whether it reads at the point of use or reuses an earlier
  read.
- Each stale read found is fixed where it lives: `/next`'s
  pick, claim, close and land steps, `/march`'s dispatch,
  `scripts/plan/order.mjs`, `settle.mjs`, `claims.mjs`.
- Where a re-read can disagree with the earlier one (the
  chunk was held or claimed mid-build), the step says what
  happens: stop and report, never overwrite.
- `concepts/plan-shape.md` gains a short "read live" rule so
  a new skill inherits it.
- A pattern is named, never a product (bearings, field
  research).

## Acceptance

- **A1** The audit table exists, one row per plan read, with
  its verdict.
- **A2** Every read the audit marks stale is re-read at the
  point of use, with a test where the code is a script.
- **A3** A mid-build change to the picked chunk (held,
  claimed elsewhere, closed) is detected before the close
  and stops the run with a named reason.
- **A4** `concepts/plan-shape.md` states the rule.

## Open questions

- Whether the audit finds anything. If every read is already
  live, the spec closes on A1 and A4 alone, and says so.

## Chunks
Measure: 4 open · 0 closed · next A5

Not chunked yet.
