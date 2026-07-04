---
description: Ship one database migration (loop-friendly, autonomous, additive-only)
---

You are invoked under the `ship-migration` skill — full
autonomy for additive schema changes, no review checkpoint.
Read `skills/ship-migration.md` end to end before touching
anything else.

**Skip this skill entirely if the project's data layer isn't
`pure-db` or `hybrid-with-managed-postgres`** — see
`nexus/customization/data-layer.md`.

Argument handling:
- No argument → next pending migration brief from
  `data/BACKLOG.md`.
- `lint <file>` → lint one migration file only, no ship.

Procedure: §5 of `skills/ship-migration.md`. Hard rules: §7.
Failure modes: §8.

Migration safety is the load-bearing rule (§6): additive changes
(CREATE TABLE, ADD COLUMN nullable, CREATE INDEX, CREATE POLICY)
ship autonomously; destructive changes (DROP, narrowing ALTER
COLUMN, data-type changes, RLS downgrades) always escalate to
`/oversight`. `scripts/lint-migration.mjs` enforces this
mechanically before every commit.

Every new RLS policy ships with a test in the same phase.

When invoked under `/loop`, the user is not present. After
commit + push, return cleanly — the loop never applies a
migration to production directly.

Argument: $ARGUMENTS
