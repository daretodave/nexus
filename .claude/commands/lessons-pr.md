---
description: Fold a sibling project's NEXUS_LESSONS.md (or lessons.md) into kit improvements, as a PR or commits.
---

You are invoked under the `lessons-pr` skill. Read
`skills/lessons-pr.md` end to end before touching anything
else; it is the single source of truth.

Argument handling:
- `<path>` → the sibling lessons file to drain
  (e.g. `../kintilla/plan/lessons.md`).
- No argument → look for `NEXUS_LESSONS.md` in known sibling
  layouts and pick the freshest.

Procedure, hard rules, and failure modes per the skill file.
Reality outranks speculation: a lesson from a real adoption
beats a hypothetical improvement at equal scope.

Argument: $ARGUMENTS
