# 60 — README above-the-fold conversion pass

> The README reads hook → proof → qualify → convert → deepen
> → trust → rules, converts within the first screenful, and
> states its pitch once.

## Why

Conversion happens in the first screenful. Today
(2026-11-05, `README.md` at 1048 lines, up from ~690 at
proposal) the pitch in the opening blockquote recurs across
both TL;DR sections before a reader reaches a door; three
separate sections ask "is this for me?" (`Used v1? On v2?`
at line 73, `When this TL;DR is the wrong path` at 232,
`When this is the right tool` at 357); two full TL;DR
walkthroughs plus a mermaid diagram cover the same
three-doors ground twice; and `Pick a playbook` spells out
all eight playbooks in prose blurbs instead of a scannable
table. None of this is wrong — all of it is long: a reader
gets a lot of restating before reaching proof the loop works.

The blocking dependency noted at proposal — `prompts/`
landing first, so the door's paste is five lines, not sixty
— shipped in phase 21 (`ad8ae3c`) and holds today (door 2
pastes ~10 lines). Scope is otherwise unchanged; it has only
grown more pressing as the file has grown ~360 lines since.

## Design

- **One pitch, stated once.** The opening blockquote carries
  it; the TL;DR sections and doors reference it instead of
  restating it.
- **One qualification gate, above the doors.** `Used v1? On
  v2?`, `When this TL;DR is the wrong path` and `When this is
  the right tool` merge into a single early section — a
  reader self-selects once, before `Three doors in`, not
  three times scattered through the file.
- **One three-door section.** `TL;DR — clone + delegate the
  adoption`, `TL;DR — I have a pitch, no spec yet`, and the
  mermaid diagram collapse into (or directly follow) `Three
  doors in`, so the walkthrough and the choice aren't two
  separate reads.
- **A router table, not eight blurbs.** `Pick a playbook`
  becomes one table — you have / do this / time — replacing
  the prose blurb per playbook; each still links to its own
  playbook file.
- **A proof strip, up top.** A one-line ouroboros claim (this
  README's own kit ships this README) plus the `march.yml`
  cron badge move up near `Three doors in`, ahead of the
  qualify step; `## nexus runs on nexus` keeps the full case
  further down, for the reader who wants it.
- **A dated adoption-receipt diffstat**, in a `<details>`
  block: a real, periodically refreshed example of a shipped
  chunk's diff, so a skimmer sees product before committing
  to read on.
- **The tree leg.** `scripts/verify.mjs`'s `tree` leg parses
  the fenced tree under `## What's in this kit`; untouched by
  this scope unless that section moves, in which case repoint
  it in the same commit.
- Target: roughly 350-500 lines, from today's 1048 — a
  reduction, not a rewrite of `## What's in this kit`,
  `## Provenance` or `## Hard rules carried across every
  project`, which stay as reference material past the fold.

## Acceptance

- **A4** `Pick a playbook` presents its eight playbooks as
  one table (you have / do this / time), not eight prose
  blurbs.
- **A5** A proof strip — the `march.yml` cron badge and a
  one-line ouroboros claim — sits within the first screenful.
- **A6** `README.md` is at most 500 lines.
- **A7** `scripts/verify.mjs`'s `tree` leg still parses `##
  What's in this kit` after the restructure (fixed in the
  same commit if that section moved).

## Open questions

(None.)

## Chunks
Measure: 4 open · 3 closed · next A8

- [ ] **60.2** Proof strip above the fold · S · closes A5 · needs —
  - The `march.yml` cron badge and a one-line ouroboros claim
    sit near `Three doors in`, ahead of the qualify step.
- [ ] **60.3** Router table for `Pick a playbook` · S · closes A4 · needs —
  - Replace the eight prose blurbs with one table (you have /
    do this / time); each row still links to its playbook file.
- [ ] **60.4** Trim to budget, verify the tree leg · M · closes A6, A7 · needs 60.2, 60.3
  - Cut `README.md` to at most 500 lines once the
    restructuring lands; `## What's in this kit`,
    `## Provenance` and `## Hard rules carried across every
    project` stay as reference material, trimmed elsewhere.
  - Confirm `scripts/verify.mjs`'s `tree` leg still parses
    `## What's in this kit`; repoint it in this commit if that
    section moved.
