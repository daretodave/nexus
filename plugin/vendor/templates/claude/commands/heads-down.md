---
description: Ask every question up front, claim a list of chunks, then loop /next through them heads down, assuming defaults, with ASCII progress each iteration
argument-hint: "[<NN> | <chunk ids> | <a pasted /loop /next prompt>] [base <branch>] [standing instructions]"
---

You are invoked under the `heads-down` skill. Read
`skills/heads-down.md` end to end before touching anything
else; every iteration it starts is a full `/next` under
`skills/next.md`.

Argument handling:
- No argument → owner: every ready chunk in pick order;
  contributor: a package (one spec's ready chunks, about 4 h).
- `<NN>` → that spec's chunks. `<NN.k …>` → those chunks.
- A pasted `/loop /next` prompt → its ids, its instructions kept.
- `base <branch>` → build on that branch.
- Other words → standing instructions for every iteration.

Ask only at the two gates: every question before the first
write, the parked ones at the end. In between, never ask:
take the recommended default and log it. Print
`node scripts/plan/progress.mjs` at the start and the end of
every iteration.

Argument: $ARGUMENTS
