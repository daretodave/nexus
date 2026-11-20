---
description: Clear claims nobody is working on, and offer to close idle worktrees and delete merged branches (a catch-all sweep)
argument-hint: "[dry]"
---

You are invoked under the `tidy` skill. Read `skills/tidy.md`
end to end before touching anything else; it is the single
source of truth.

Argument handling:
- No argument → clear dead claims, then one multi-select
  question about worktrees, branches and snapshot refs.
- `dry` → report only; change nothing.

Close worktrees only through `node scripts/worktree.mjs close`;
never touch what a live session holds or a parked ledger names.

Argument: $ARGUMENTS
