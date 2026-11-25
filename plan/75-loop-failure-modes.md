# 75 — Which loop failure modes the gate catches, and which it takes on trust

> A loop that builds and gates its own work has three known
> ways to fool itself: approving its own work with nothing
> outside checking, meeting the letter of a goal instead of
> its intent, and reporting something it did not do. Go
> through the kit's cycle and write down, for each, what
> catches it mechanically and what still rests on the
> builder's word. Then close the cheapest gap.

## Why

Field research (2026-11-13) finds autonomous build loops now
described by their failure modes: self-approval, spec gaming
and misreported outcomes. This kit's loop claims, builds,
gates and closes in one tick, with one model. Parts of that
are checked by machine: the verify gate's legs, the `chunks`
leg holding a close to its spec, the guard hook, the
`Cloud-Run:` trailer, the lost-to-background check. Other
parts are a sentence in a skill that the builder is trusted
to follow: that an A-ID it closes is actually met, that
"tests pass" in a commit body is true, that a `says:` line
describes what shipped. Nobody has listed which is which. A
session on 2026-11-21 found one such gap by accident: fix
commits that said "Mirrored as #N" where the skill asked for
`Closes #N`, left unchecked for a week.

## Design

- A new doc, `concepts/loop-honesty.md`: one table. Rows are
  the steps of the cycle (pick, claim, build, gate, close,
  land, report). Columns are the three failure modes. Each
  cell names the mechanical check that covers it (a gate leg,
  a hook rule, a workflow step, a test) or reads "trust"
  with the skill sentence it rests on.
- From the "trust" cells, pick the one that is cheapest to
  mechanize and has already cost something, and build it in
  this spec. The rest become candidates with their evidence.
- The doc is linked from `concepts/architecture.md` and the
  README tree, and says plainly that a one-model loop cannot
  fully check itself: `/critique`, the owner's `/oversight`
  and a pull-request review are the outside checks.
- A pattern is named, never a product.

## Acceptance

- **A3** One trust cell is mechanized in this spec, with a
  test or a gate leg.
- **A4** Each remaining trust cell worth closing is a row in
  `plan/CANDIDATES.md`.

## Open questions

- Which trust cell to mechanize is decided by the table, not
  ahead of it. Whether a closed A-ID is really met is the
  likely hardest and the least likely pick.

## Chunks
Measure: 2 open · 2 closed · next A5

- [ ] **75.2** From the table's trust cells, pick the one
  cheapest to mechanize that has already cost something (the
  "Mirrored as #N" vs `Closes #N` gap from 2026-11-21 is one
  candidate) and mechanize it with a gate leg or a test · S ·
  closes A3 · needs —
- [ ] **75.3** File each remaining trust cell worth closing as
  a row in `plan/CANDIDATES.md`, with its evidence · S ·
  closes A4 · needs 75.2
