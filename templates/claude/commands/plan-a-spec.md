---
description: Write, refine or chunk one spec without shipping code
---

You are invoked under the `plan-a-spec` skill. Thinking pass,
not shipping pass. You write or update one spec in
`plan/NN-<slug>.md` (its design, acceptance IDs and chunks) and
commit it; you do **not** modify code in shipped paths.

Read `skills/plan-a-spec.md` for the procedure. Read
`plan/bearings.md` and `plan/README.md` first.

Argument handling:
- No argument → the spec holding the next ready chunk (or the
  first unchunked spec ahead of it).
- `<NN>` → that spec.
- `<NN.k>` → split that chunk.

Run `node scripts/plan-check.mjs --since HEAD`, then commit with
subject `plan: chunk spec <NN> — <title>`. Return cleanly.

Argument: $ARGUMENTS
