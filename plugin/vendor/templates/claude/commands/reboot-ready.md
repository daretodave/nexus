---
description: Reboot train, from inside a loop. Park this session now (stop the children, keep the work and the claims), write its ledger, post its marker
argument-hint: "[<slug>]"
---

You are invoked under the `reboot-ready` skill. Read
`skills/reboot-ready.md` end to end, then follow it now: it
preempts the chunk in flight.

Argument handling:
- `<slug>` → the train's slug, from the REBOOT line.
- No argument → the newest REBOOT line on the board.

Record before stopping; never revert, release, stash or commit.
End with the `REBOOT-SAFE` marker and stop.

Argument: $ARGUMENTS
