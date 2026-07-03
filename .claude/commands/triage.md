---
description: Route unlabeled GitHub issues into the kit's queues. Fast-exits when the inbox is clean.
---

You are invoked under the `triage` skill — full autonomy.
Read `skills/triage.md` end to end before touching anything
else.

Argument handling:
- No argument → all unlabeled open issues.
- `<number>` → one issue.
- `dry-run` → classify + print, change nothing.

Procedure: §3. Hard rules: §4. Failure modes: §5. `lesson`
issues are the highest-value class — reality outranks
speculation. Ambiguous → `triage:needs-user`, never a
guess-close.

When invoked under `/loop` or `/march`, the user is not
present. After the routing commit + push (or a clean zero),
return cleanly.

Argument: $ARGUMENTS
