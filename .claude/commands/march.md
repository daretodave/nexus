---
description: Kit dispatcher — triage → critique → phase → expand → iterate. The autonomous entry point.
---

You are invoked under the `march` skill — the kit's outer
dispatcher. Read `skills/march.md` end to end before touching
anything else; it is the single source of truth. Decide
instead of asking; document calls in commit bodies.

Argument handling:
- No argument → one tick: dispatch + execute + return.

Procedure: §3. Failure modes: §5. Fully adopt the dispatched
child skill's contract (§4) — including the verify gate
(`node scripts/verify.mjs`, foreground) and atomic
commit+push.

When invoked under `/loop` or in the cloud, the user is not
present at this tick. After the child completes, return
cleanly.

Argument: $ARGUMENTS
