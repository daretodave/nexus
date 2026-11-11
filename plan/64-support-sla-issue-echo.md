# 64 — support.mjs sla: echo the issue number past close

> An issue-born Asap chunk's archive line still names its
> issue once the chunk closes, so `support.mjs sla`'s done
> check stops re-flagging already-shipped work forever.

## Why

Filed from `#103` (loop-filed 2026-11-10: this tick closed
`#102` by hand instead of re-plotting it). `support.mjs
sla`'s `placed()` already treats an issue as done once
`ARCHIVE.md`'s text names `#N` (`names(archive, n)`) or a
still-open chunk's own title does. But a chunk plotted asap
for an issue only carries the issue number on its *Asap lane
line* (`skills/march.md` Step 1.5: "the chunk title and its
Asap lane line ending (#N)"); `issueBorn()` matches either the
lane line or the chunk's own title, but only while the chunk
is still open and listed there. Once the chunk closes, settle
removes the lane line and the chunk's own spec text; all that
survives into `ARCHIVE.md` is the pending close's `says` field
(`skills/next/land.md` §2) — and nothing teaches a closer to
carry the issue number into it. Reproduced on `#102`: chunk
63.1's title and `says` never carried `(#102)`, so
`ARCHIVE.md`'s line doesn't either, and `sla` re-flagged `#102`
every later tick until it was closed by hand.

## Design

- `skills/next/land.md` §2's pending-file format gains one rule
  on the `says:` bullet: when the chunk being closed is
  issue-born (`support.mjs`'s `issueBorn()` finds `#N` on its
  still-open Asap lane line, or on the chunk's own title),
  `says` ends ` (#N)` — the same suffix `/plot asap` already
  writes on the lane line and the chunk title. Settle carries
  `says` into the `ARCHIVE.md` line unchanged, so the issue
  number survives the lane line's removal, and `placed()`'s
  existing `names(archive, n)` check keeps working with no
  further code change.
- `templates/skills/next/land.md` §2 mirrors the same rule in
  the same commit (`agents.md` rule 7: templates are the
  product).
- No change to `support.mjs`, `settle.mjs` or the `tell` /
  `Refs #N` convention: this fix is scoped to the one gap
  `#103` found (an issue-born chunk's own close losing the
  issue number), not the separate GitHub auto-close path
  `/bug` and `/iterate` already document.

## Open questions

(None.)

## Acceptance

- **A1** `skills/next/land.md` §2's pending-file format
  documents that an issue-born chunk's `says` ends ` (#N)`,
  naming `issueBorn()` as the mechanism that finds the number
  before the close removes it.
- **A2** `templates/skills/next/land.md` §2 carries the
  matching rule, the two files differing only in the
  `<DEFAULT_BRANCH>`-class placeholders already between them.

## Chunks
Measure: 2 open · 0 closed · next A3

- [ ] **64.1** `says:` echoes an issue-born chunk's `#N` past
  close · S · closes A1, A2 · needs —
  - `skills/next/land.md` and `templates/skills/next/land.md`
    both carry the rule in the same commit; the two files'
    diff still varies only in `<DEFAULT_BRANCH>`-class
    placeholders.
