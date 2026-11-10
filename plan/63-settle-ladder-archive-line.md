# 63 — settle.mjs writes its own ladder "spec complete" line

> Closing the footgun ladder's last chunk leaves the gate
> green on its own, with no hand-written archive line.

## Why

`identity/footguns.md:10` wiring aside, the ladder spec
(`plan/99-guard-the-traps.md`, opened and closed by
`scripts/plan/settle.mjs`'s own machinery) is deleted by
`settle.mjs` once its last chunk closes
(`specFile === ladderFile` branch, confirmed in the repo
today, 2026-11-10). `scripts/plan-check.mjs`'s `checkHistory`
refuses any spec file that disappears with no matching
`· <num> · spec complete: …` (or `spec vetoed: …`)
`plan/ARCHIVE.md` line (`agents.md`'s verify gate, `chunks`
leg). The ladder branch pushes a `said` note but never writes
that line, unlike the non-ladder "truly empty" branch a few
lines below, which at least tells the owner to write it by
hand. The gate goes red on exactly this the next time the
ladder empties, until someone adds the line manually
(filed as `#102`, hit while landing chunk 99.1).

## Design

- `settle.mjs`'s `specFile === ladderFile` branch composes the
  `· ${cfg.ladder.spec} · spec complete: …` archive line itself,
  the way it already composes its `said` note, and appends it
  to the same `plan/ARCHIVE.md` write as the chunk's own close
  line (one write, two lines when the ladder empties).
- The fix lands in both `scripts/plan/settle.mjs` and its
  `templates/scripts/plan/settle.mjs` twin (`agents.md`'s
  dogfood-twins rule; the verify gate's `scripts` leg checks
  they stay byte-identical).
- A `templates/scripts/__tests__/settle-run.test.mjs` case
  closes a ladder spec's last chunk end to end and asserts the
  spec file is gone, its rows are gone, and both archive lines
  land — covering `scripts/plan/settle.mjs` too, since the two
  files are required to be identical.

## Contracts

- The ladder's "spec complete" archive line's wording is fixed
  by this chunk: `spec complete: the footgun ladder closed, no
  open trap left to automate (reopens the next time one is
  seen twice)`. A later chunk changing it updates this file's
  words to match (plain text, no code to grep for it).

## Acceptance

- **A1** Closing the footgun ladder's last chunk writes a
  `· <ladder spec num> · spec complete: …` line to
  `plan/ARCHIVE.md` in the same settle run that removes the
  spec file and its rows, so `plan-check.mjs`'s `checkHistory`
  (the gate's `chunks` leg) never goes red on it.

## Open questions

(None.)

## Chunks
Measure: 1 open · 0 closed · next A2

- [ ] **63.1** settle writes the ladder's own "spec complete" archive line · S · closes A1 · needs —
