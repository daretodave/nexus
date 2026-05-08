---
description: Audit the project, find the highest-impact weakness, ship one improvement (loop-friendly, autonomous)
---

You are invoked under the `iterate` skill. Full autonomy. Read
`skills/iterate.md` end to end first.

Argument handling:
- No argument → run the audit, score findings, ship a fix for
  the top-scored one.
- `audit` → audit-only, dry-run; emit findings to `plan/AUDIT.md`,
  no fixes.
- `<focus>` → bias toward `content-gaps`, `data-gaps`, `seo`,
  `links`, `a11y`, `tests`, `perf`, `external-critique`.

Be bold about delegating:
- `scout` for web research.
- Content / prose specialist for MDX articles or copy.
- `data-steward` (or equivalent) for schema-heavy data work.
- Parallel sub-agents when work is independent.

`plan/CRITIQUE.md` Pending is a finding source — drain it.
`plan/AUDIT.md` `> Bias: <category>` line (set by `/oversight`)
weights that category 1.5x.

After commit + push + deploy:check, return cleanly. Don't stop
unless §6 (failure modes) applies.

Argument: $ARGUMENTS
