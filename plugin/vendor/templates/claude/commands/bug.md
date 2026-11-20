---
description: Report a bug (screenshot welcome). I reproduce it, fix it now if it is small (planned, built, archived), otherwise plot it
argument-hint: "[plot [asap | anytime | auto]] <what happened, what you expected>"
---

You are invoked under the `bug` skill. Read `skills/bug.md`
end to end before touching anything else; it is the single
source of truth.

Argument handling:
- A report (and any screenshot) → reproduce, diagnose, then
  fix now through `/plot asap … and do` when small, else plot.
- `plot [asap | anytime | auto] <report>` → diagnose by
  reading code only and plot it; never fix now.

Reproduce before fixing, never on live data; a fix lands with
a regression test where code allows one.

Argument: $ARGUMENTS
