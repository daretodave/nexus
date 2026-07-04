# Phase 11 — `templates/skills/ship-migration.md` + linter

> `customization/data-layer.md` Pattern D promises "a new
> companion skill at `skills/ship-migration.md` — same shape as
> `/ship-data`" and a migration-safety hard rule ("the
> autonomous loop applies additive migrations only") — but the
> kit ships neither the skill file nor a mechanical check for
> the rule. Bearings decision 2: a doc that promises a file the
> kit doesn't ship is a HIGH finding. Ship both. DO NOT ASK.

## Why

Pattern B (`pure-db`) and Pattern D
(`hybrid-with-managed-postgres`) both reference `/ship-migration`
as the skill that ships schema changes, and both state the same
migration-safety rule: additive changes (CREATE TABLE, ADD
COLUMN nullable, CREATE INDEX, CREATE POLICY) are loop-allowed;
destructive changes (DROP, narrowing ALTER COLUMN, data-type
changes, RLS downgrades) require `/oversight`. Today that rule
is prose only — a loop tick has no mechanical gate stopping it
from writing a destructive migration and shipping it anyway.

## Deliverables

1. `templates/skills/ship-migration.md` — same shape as
   `templates/skills/ship-data.md`: Purpose, Invocation,
   Autonomy contract, Procedure (write migration + RLS policy +
   rollback note + RLS test, lint, `db:migrate:test` against a
   throwaway DB, verify gate, commit + push), Hard rules,
   Failure modes, Quick reference. Adopt-by-need (pure-db /
   hybrid-with-managed-postgres only); skip note up top for
   gh-as-db / saas-cms / none.
2. `templates/claude/commands/ship-migration.md` — the command
   pointer (anatomy leg requires 1:1 skill/command pairing).
3. `templates/scripts/lint-migration.mjs` — the additive-migration
   linter: given a `.sql` migration file, flags destructive
   statements (`DROP`, `TRUNCATE`, narrowing `ALTER COLUMN` /
   `TYPE` changes, `ALTER TABLE ... RENAME`) and exits non-zero;
   additive statements (`CREATE TABLE`, `ADD COLUMN`, `CREATE
   INDEX`, `CREATE POLICY`) pass. Zero dependencies, ESM, mirrors
   `deploy-check.mjs`'s CLI shape (`node lint-migration.mjs
   <file>`).
4. Wire: `templates/README.md` layout tree (skills/ + scripts/)
   and adopt-by-need table row; root `README.md` templates tree
   + "What you get" opt-in command table; a link back from
   `customization/data-layer.md`'s Pattern B and Pattern D
   sections (the "New companion skill" / "Migration safety"
   prose becomes a real link, and the linter is named as the
   mechanical enforcement of the additive-only rule).

## Non-goals

- No changes to `templates/skills/march.md`'s generic dispatch
  order — migrations are pattern-specific (pure-db / hybrid
  only), same class as `ship-asset.md`, left out of generic
  march the same way.
- No real DB connection or Docker orchestration in the linter —
  it's a static SQL-text lint (regex-based classification), not
  a live migration runner. `pnpm db:migrate:test` (driver-level,
  against a throwaway DB) stays project-specific per
  data-layer.md; the linter is the hermetic, dependency-free
  first gate before that step.
- No `data-steward` sub-agent file — `customization/data-layer.md`
  §`data-steward` already documents it via
  `customization/sub-agents.md`; no kit-shipped agent template
  exists for any other named specialist either (mirrors how
  `brander` alone got a template because branding is universal
  enough; data-steward is too project-specific for a stock
  file).

## Decisions made upfront

- Linter classifies by SQL statement keyword, case-insensitive,
  ignoring comments — false positives (e.g. a `DROP` inside a
  rollback comment block) are acceptable; the skill's Step
  "write the rollback as a comment block at the top" means
  rollback SQL legitimately contains `DROP`/destructive verbs,
  so the linter only scans **executable** (non-comment)
  statements.
- `ADD COLUMN` without `NOT NULL` or with a `DEFAULT` is
  additive; `ADD COLUMN ... NOT NULL` with no default is flagged
  (it fails on existing rows) — treated as destructive-class for
  linter purposes, matching data-layer.md's "ADD COLUMN as
  nullable" wording.
- Exit codes mirror `deploy-check.mjs`: 0 = clean, 1 = destructive
  statement found (block), matching "Stop and ask via
  `/oversight`" semantics — the loop treats non-zero as a hard
  stop, not a retry.

## Definition of done

Gate green; `ship-migration.md` skill + command pointer paired;
`lint-migration.mjs` shipped with its own inline usage doc;
linked from `templates/README.md`, root `README.md` tree, and
`customization/data-layer.md`; build plan row `[x]` with commit
hash.
