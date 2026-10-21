# 46 — `## Add`, finished: settle order, archive ranges, triage

> Spec 45 shipped `## Add`; its review left three edges, and
> issues still arrive as new work instead of extending the
> spec they belong to. This closes both: settle orders a
> plot before the closes it enables, archive ranges stop
> crossing, the last silent acceptances become refusals, and
> `/triage` files an issue that belongs to a spec as an
> `## Add` to it.

## Why

From the 45 build and review (2026-10-21):
- **Same-date order.** Settle sorts pending files by date,
  then name, so `45.4.md` settles before `plot-*.md` from the
  same day. In a `/plot … and do` run the roadmap's N left
  and the lane entry went stale and were fixed by hand
  (50e5533); a close of a chunk the plot is still adding is
  skipped until the next run.
- **Crossed archive ranges.** Two chunks built one after the
  other in one worktree get commit ranges that overlap; the
  45.3 and 45.4 ranges were set by hand, and 45.1's took in
  the plot commit.
- **Silent acceptances.** A part named `section Chunks` or
  `section Acceptance` with plain text is appended after that
  list; a placeholder in a new `## Footguns` line is neither
  checked nor numbered.

And `/triage` routes an issue to `AUDIT.md`, `CANDIDATES.md`
or the owner. A bug in something a spec covers should extend
that spec ("extend before you add", the rule `/plot` follows
since 45.3).

What exists today: `scripts/plan/{pending,settle,settled}.mjs`
and their template twins; `skills/triage.md` and
`templates/skills/triage.md`; `/plot`'s open-PR check and
`pendingSpecs()` (45.4).

## Design

- **Plots before closes.** Within one settle run, every
  file that adds (a plot, any file with an `## Add` or a lane
  entry) settles before the closes of the same date; between
  dates, date order stands. A close whose chunk a same-run
  Add creates resolves after that Add numbers it.
- **Ranges that don't cross.** A close's derived range
  starts after the previous close's last commit on the same
  branch, so back-to-back chunks in one worktree each get
  only their own commits; the plot commit belongs to no
  chunk.
- **The last refusals.** `section Chunks` and `section
  Acceptance` are refused (use the `chunks` and `acceptance`
  parts); a placeholder in a `## Footguns` line is checked
  and numbered like notes and decisions.
- **Triage extends.** When an issue's subject falls inside an
  open spec (its Design or a chunk names the area), `/triage`
  writes an `## Add` to that spec (a chunk, an acceptance
  item, or a `section Findings` entry with the issue link),
  labels it `triage:planned`, and comments the placeholder
  and spec. Before filing it reads open PRs' pending files
  (`pendingSpecs()`); an issue already covered gets "Already
  in PR #N". Everything else routes as today.

## Acceptance

- **A2** Back-to-back closes in one worktree get archive
  ranges that don't overlap, and the plot commit is in
  neither, with tests.
- **A3** Settle refuses `section Chunks` and `section
  Acceptance`, and checks and numbers placeholders in
  `## Footguns` lines, with tests.
- **A4** `/triage` (nexus's and the template) files an issue
  inside an open spec as an `## Add` to it, says "Already in
  PR #N" when an open PR covers it, and routes the rest as
  before.

## Open questions

(None.)

## Chunks
Measure: 3 open · 1 closed · next A5

- [ ] **46.2** Archive ranges that don't cross · S · closes
  A2 · needs —
- [ ] **46.3** The last refusals: section Chunks and
  Acceptance, footgun placeholders · S · closes A3 · needs —
- [ ] **46.4** `/triage` extends the spec an issue belongs
  to · M · closes A4 · needs —
