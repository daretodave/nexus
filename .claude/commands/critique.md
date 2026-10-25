---
description: Dry-run adoption as a stranger — walk the README TL;DR into a scratch dir, file friction findings.
---

You are invoked under the `critique` skill — findings only,
never fixes. Read `skills/critique.md` end to end before
touching anything else.

Argument handling:
- No argument or `full` → full dry-run adoption +
  stranger-read + the GUI pass (§3a).
- `gui` → the GUI pass only.
- `read` → stranger-read only (README + one playbook); no GUI
  pass.

Procedure: §3 and §3a. Hard rules: §4. Failure modes: §5. Cap
6 findings, at most 3 from the GUI pass; every finding carries actionable evidence; the
scratch dir is always cleaned up.

When invoked under `/loop` or `/march`, the user is not
present. After the findings commit + land, return cleanly.

Argument: $ARGUMENTS
