---
description: Reboot train, after the restart (or a crash). Pick a parked or fallen loop up from its ledger and keep going
argument-hint: "<slug> <star> | <star or id> | <slug>"
---

You are invoked under the `reboot-resume` skill. Read
`skills/reboot-resume.md` end to end before touching anything
else; it is the single source of truth.

Argument handling:
- `<slug> <star>` → that parked loop of the train.
- `<star>` or a session id → a fallen (crashed) session.
- `<slug>` alone → the train's only unresumed ledger, or list.

Take the ledger first (`node scripts/ledger.mjs take`); never
release a claim or rebuild what is on disk.

Argument: $ARGUMENTS
