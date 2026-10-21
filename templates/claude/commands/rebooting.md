---
description: Reboot train, from the owner's terminal. Announce a reboot to every loop, then (ack) hand back one resume line per loop
argument-hint: "[<slug>] | status [<slug>] | ack [<slug>]"
---

You are invoked under the `rebooting` skill. Read
`skills/rebooting.md` end to end before touching anything
else; it is the single source of truth.

Argument handling:
- No argument or `<slug>` → announce the train.
- `status [<slug>]` → who has parked, who hasn't (read-only).
- `ack [<slug>]` → check every ledger, then print one
  `/reboot-resume` line per loop.

Never kill a loop, close a worktree or release a claim from
here: loops park themselves.

Argument: $ARGUMENTS
