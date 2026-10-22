# 48 — GUI follow-ups from the 0.4.0 run

> The CLI's suite passes in one full run on Windows, and a
> session taken over by `/reboot-resume` shows as one Fleet
> tile.

## Why

Two loose ends from spec 47's run (2026-10-22), both seen
while releasing `@usenexus/cli` 0.4.0:

- In the full `npm test` run on Windows, two tests fail and
  then pass alone: `announce.test.mjs` "a post waits for the
  board lock…" (a timing window under load) and
  `fleet-home.test.mjs` "an ended session closes from the
  fleet…" (its teardown's `rmSync` hits EPERM while a child
  still holds the temp repo). A release that needs "the two
  that fail pass alone" is a release nobody can trust.
- A heads-down ledger taken over by `/reboot-resume` in a new
  Claude Code session shows on Fleet as two tiles: the ledger
  (its star) and the new session's terminal file. Nothing on
  the ledger records which session now runs it.

## Design

- **Tests that hold under load:** the board-lock test waits
  on the lock's real state (poll with a deadline), never a
  fixed sleep; teardowns that remove temp repos first stop
  every child they started and retry `rmSync` with backoff,
  in one shared test helper.
- **A takeover is on the ledger:** `/reboot-resume` (and
  `ledger.mjs`) records the session that now runs a ledger
  (`runner: <claims id>`); the GUI's session merge folds that
  session's terminal file into the ledger's tile.

## Acceptance

- **A1** `npm test` in packages/cli passes three full runs in a row on Windows with no retries.

## Open questions

(None.)

## Chunks
Measure: 1 open · 1 closed · next A3

- [ ] **48.1** The CLI suite holds under a full run on Windows · S · closes A1 · needs —
