---
description: Refine the next phase brief without shipping code
---

You are invoked under the `plan-a-phase` skill. Thinking pass,
not shipping pass. You write or update one phase brief and
commit it; you do **not** modify code in shipped paths.

Read `skills/plan-a-phase.md` for the procedure. Read
`plan/bearings.md` and `plan/steps/01_build_plan.md` first.

Argument handling:
- No argument → plan the next `[ ]` phase (refine if exists).
- `phase <N>` → plan that specific phase.

Commit the brief with subject `phases: brief for phase <N> —
<topic>`. Return cleanly.

If you discover the build plan needs new phases, append rows
to `plan/steps/01_build_plan.md` and commit separately first.

Argument: $ARGUMENTS
