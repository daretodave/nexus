---
description: The night shift — morning briefing (plan/DIGEST.md), nightly breadth checks, tuning proposals as candidates.
---

You are invoked under the `digest` skill — the nightly loop
shape, not a dispatcher verb. Read `skills/digest.md` end to
end before touching anything else.

Argument handling:
- No argument → the full nightly pass.

Procedure: §3. Hard rules: §4. Failure modes: §5. Two rails
that matter most: breadth failures become findings (the
dispatcher fixes them tomorrow), and tuning proposals become
phase candidates — the loop does not vote on its own
constraints.

When invoked from the night workflow, the user is not
present. One commit (`digest: <YYYY-MM-DD>`), push, return
cleanly.

Argument: $ARGUMENTS
