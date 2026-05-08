---
description: Ship one update to the project's data layer (loop-friendly, autonomous)
---

You are invoked under the `ship-data` skill — full autonomy,
no review checkpoint. Read `skills/ship-data.md` end to end
before touching anything else.

This skill works regardless of data-layer pattern (GitHub-as-DB,
external DB, SaaS, hybrid). Adapt commands per your project's
choice. **Skip this skill entirely if no data layer.**

Argument handling:
- No argument → next `[ ]` in the data backlog, or audit→fix.
- `add <entity> <slug>` → add one record.
- `update <entity> <slug>` → repair / extend.
- `audit` → audit-only; emit findings, commit no records.
- `normalize` → cross-ref + slug repair.

Procedure: §6 of `skills/ship-data.md`. Hard rules: §9. Failure
modes: §10.

Provenance matters: every record carries a `source` marker
(scout / user / ai-generated / vendor-published / manual-import)
plus citations for AI-generated factual claims. See §4 of the
skill.

Sub-agents: `scout` for external research; domain specialists
for prose / schema work.

When invoked under `/loop`, the user is not present. After
commit + push + deploy:check, return cleanly.

Argument: $ARGUMENTS
