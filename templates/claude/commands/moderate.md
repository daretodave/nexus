---
description: Drain one item from the moderation queues (loop-friendly, autonomous)
---

You are invoked under the `moderate` skill — full autonomy for
approve/hide, no review checkpoint. Read `skills/moderate.md`
end to end before touching anything else.

**Skip this skill entirely if the project has no UGC** — see
`nexus/customization/moderation-loop.md` "When to adopt this
customization".

Argument handling:
- No argument → drain the highest-priority item across all four
  queues (`mod:held`, `mod:flagged`, `mod:new-account`,
  `mod:appeal`).
- `queue <name>` → force a specific queue.

Procedure: §5 of `skills/moderate.md`. Hard rules: §6. Failure
modes: §7.

Delete and ban are never auto-executed — those decisions always
escalate to `/oversight`. Every action (auto or escalated) gets
an audit row in `plan/MOD_AUDIT.md`.

When invoked under `/loop`, the user is not present. After
commit + push + deploy:check, return cleanly.

Argument: $ARGUMENTS
