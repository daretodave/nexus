---
description: Put a task into the plan with its place in line, researched, specced and chunked so /next builds it (asap | anytime | worked out). With and do, it builds it now
argument-hint: "[asap | anytime | peek] <task> [and do | --do]"
---

You are invoked under the `plot` skill. Read `skills/plot.md`
end to end before touching anything else; it is the single
source of truth.

Argument handling:
- `asap` → onto the Asap lane. `anytime` → table order.
- No mode word → work out the slot, and say why in one line.
- `peek` → research and slot only; change nothing.
- A trailing `and do` (or `--do`) → also build it now: plot,
  build, close and land as one unit. Off unless asked.

Show the build order before and after
(`node scripts/plan/order.mjs`). Shared plan files change only
through `plan/pending/plot-<slug>.md` (an `## Add` extends an
open spec before a new one is written); land per owner mode
(owner: settled on main; contributor: a `plot/<slug>` PR).

Argument: $ARGUMENTS
