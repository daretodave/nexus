# 45 — Plan additions that never conflict

> A branch adds to an open spec without quoting a line of it:
> an `## Add` in its pending file, its ids written as
> placeholders, numbered and placed by settle in merge order.
> Any number of branches can extend one spec at once, and
> `/plot` extends before it adds a spec.

## Why

Concurrent branches that extend one spec all quote the same
moving lines: its last chunk, its last A-ID, its Measure line
and the roadmap's `N left`. Each pending file's `## Edit` is
right on main as it was, and wrong once the first of them
settles, so only the first settles and every other branch
re-quotes by hand. Learned from a mature adopter, where a dozen
runs adding bug fixes to one spec collided this way in an
afternoon.

New work also tends to arrive as a new spec when an open spec
already owns the surface, so the plan grows sideways. `/plot`
should extend first and add a spec only when nothing open can
hold the task.

## Design

- **The grammar:** `## Add plan/NN-<topic>.md` in a pending
  file, with fenced parts:
  - `~~~ acceptance`: `- **A?<slug>** …`;
  - `~~~ chunks`: `- [ ] **NN.?<slug>** …`, sub-bullets at any
    depth;
  - `~~~ questions`: `- …`, numbered when the spec's list is;
  - `~~~ section <Heading>`: text for the end of that `## `
    section, or a new section before `## Acceptance`.
- **Numbering at settle, in merge order** (date, then name):
  `A?<slug>` takes the Measure line's next A-ID, `NN.?<slug>`
  the next chunk number past every id the spec lists and every
  one `ARCHIVE.md` closed. The numbers are written into the
  file's own `## Edit` texts too (an Asap lane entry). A
  placeholder no Add defines is refused.
- **Settle keeps the counts:** each part goes at the end of its
  section, the Measure line counts again, and the roadmap row's
  `N left` is set.
- **The readers agree:** the settled view, plan-check and
  `order.mjs` read an Add as settled, so a pull request's gate
  sees the plan as it will be; `order.mjs --mark` takes a
  placeholder.
- **`/plot` extends before it adds**, uses `## Add` for every
  extension (bugs and features alike), never quotes a moving
  line, and checks open pull requests' pending files for a
  spec already being extended.
- **Limits:** a rewrite of existing text stays an `## Edit`
  with quotes (two rewrites of one paragraph still collide); a
  new chunk can't `needs` a chunk still in another open pull
  request (it has no number yet).

## Acceptance

- **A4** `/plot`, `/messy` and the pending README use `## Add`
  for every extension and never quote moving lines; extend
  before you add.
- **A5** A hold on a spec covers chunks an Add settles into it
  later, documented.

## Open questions

(None.)

## Chunks
Measure: 2 open · 3 closed · next A6

- [ ] **45.3** The docs and skills: `/plot`, `/messy`, the
  pending README, plan-shape, the claims doc · S · closes A4,
  A5 · needs —
