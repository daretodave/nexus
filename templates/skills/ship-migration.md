# Skill: ship-migration

> The companion to `ship-data.md` for the DB-backed half of a
> data layer: `pure-db` and the dynamic side of
> `hybrid-with-managed-postgres` (see
> `nexus/customization/data-layer.md` Patterns B and D). One
> phase = one migration + its RLS policies + its rollback note
> + its tests.
>
> Adopt only if `plan/bearings.md`'s `Structured data` row is
> `pure-db` or `hybrid-with-managed-postgres`. **`gh-as-db` /
> `saas-cms` / `none` → delete this skill file** and skip
> `/ship-migration` entirely; `/march` handles its absence the
> same way it handles a missing `ship-data.md`.

## 1. Purpose

Ship one schema change to the project's managed Postgres (or
Postgres-compatible) database per tick: the migration SQL, its
RLS policies, a rollback note, and the test proving the RLS
policy keeps the wrong actors out. Applying the migration to
production stays the deploy provider's job, not this skill's —
see "Migration safety" below.

## 2. Invocation

```
/ship-migration                    # next pending migration brief
/ship-migration lint <file>        # lint one migration file, no ship
/loop 30m /ship-migration          # autonomous backlog burndown
```

## 3. Autonomy contract

- **Additive change → decide and ship.** CREATE TABLE, ADD
  COLUMN (nullable or with a default), CREATE INDEX, CREATE
  POLICY are loop-drainable.
- **Destructive change → never auto-execute.** DROP, narrowing
  ALTER COLUMN, data-type changes, RLS posture downgrades always
  escalate to `/oversight` with the migration file, the linter
  output, and a proposed rollback plan.
- **RLS policy without a test → block the ship.** Write the test
  in the same phase; never land a policy untested.
- **Schema-design judgment call → delegate to `data-steward`**
  (see `nexus/customization/sub-agents.md` §`data-steward`)
  rather than guessing at index selection or anti-abuse
  weighting math.

## 4. Delegation

- **`data-steward`** — RLS policy design, index selection,
  anti-brigade vote-weighting math. Spawn for any schema-design
  subtask more involved than a single additive column.

## 5. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Pick the work

Read the pending migration brief from `data/BACKLOG.md` or a
phase brief. Empty backlog → return cleanly, nothing to do this
tick.

### Step 2 — Write the migration

`supabase/migrations/NNNN_<name>.sql` (or `<db>/migrations/` per
the project's provider) — next sequential number, descriptive
name.

### Step 3 — Write the RLS policies

Same file, or a sibling `NNNN_<name>_rls.sql` — whichever the
project's existing migrations do.

### Step 4 — Write the rollback note

A comment block at the top of the migration file. This is the
one place destructive SQL (`DROP TABLE`, etc.) legitimately
appears in a migration authored by this skill — the linter (§6)
only scans executable statements, not comments.

### Step 5 — Write the RLS test

One `plan(N)` test per policy, proving the wrong actor is denied
and the right actor succeeds (see
`nexus/customization/data-layer.md` "RLS testing" for the
worked `pgTAP` example). A migration without an RLS test for
every new policy is a `/ship-migration` failure.

### Step 6 — Lint

```bash
node scripts/lint-migration.mjs supabase/migrations/NNNN_<name>.sql
```

Exit 0 → additive, proceed. Exit 1 → destructive statement
found; stop and escalate per §3, do not proceed to Step 7.

### Step 7 — Test against a throwaway DB

```bash
pnpm db:migrate:test
```

Runs against a local Postgres (Docker container or local
install) — verifies the migration applies cleanly and every RLS
test passes.

### Step 8 — Verify gate

```bash
pnpm verify
```

Typecheck + unit + build + the `db:test` leg (RLS tests) against
the local DB.

### Step 9 — Commit + push

```bash
git add supabase/migrations/NNNN_<name>.sql supabase/tests/<name>.test.sql
git commit -m "migration: <name>

<one-line summary of the schema change and its RLS policy>
"
git push origin <DEFAULT_BRANCH>
```

The push triggers the deploy provider's migration pipeline.

### Step 10 — Done

Return cleanly. **The loop does not apply the migration to
production** — see "Migration safety" below.

## 6. Migration safety (the load-bearing rule)

This skill ships migrations through commits; **applying** them
to production is gated by the deploy provider's migration
pipeline (Supabase's migrations runner, a custom GitHub Action,
Sqitch, or similar). The loop does not hold production DB
credentials by default.

- **Allowed** through the loop: additive migrations (CREATE
  TABLE, ADD COLUMN as nullable, CREATE INDEX, CREATE POLICY).
- **Stop and ask via `/oversight`**: destructive migrations
  (DROP, ALTER COLUMN narrowing, data-type changes, RLS posture
  downgrades).

`scripts/lint-migration.mjs` makes this mechanical: it
classifies every executable statement in a migration file as
additive or destructive and exits non-zero on the latter, so
Step 6 blocks a destructive migration before it ever reaches a
commit.

## 7. Hard rules

1. **Additive-only for autonomous ship.** Destructive migrations
   always route through `/oversight` — never bypass the linter.
2. **No `Co-Authored-By:`. No emojis.**
3. **Every new RLS policy ships with a test in the same phase.**
4. **Rollback note required** — a comment block at the top of
   every migration file.
5. **Sequential migration numbers.** Never reuse or skip a
   number; a gap signals a lost migration.
6. **The loop never holds production DB write credentials** —
   local/throwaway DB only (Step 7).

## 8. Failure modes

1. **Linter flags a destructive statement.** Stop; open an
   `/oversight` escalation with the file and the flagged
   statement; do not ship.
2. **`pnpm db:migrate:test` fails ≥3 times on the same root
   cause.** Stop the tick per `agents.md` rule 6.
3. **RLS test fails.** The policy is wrong, not the test — fix
   the policy, never loosen the test to pass.
4. **No local/throwaway DB available** (Docker unavailable, no
   local Postgres). Surface as `[needs-user-call]`; the next
   tick retries.
5. **Migration requires a data backfill of existing rows.**
   That's a `/plan-a-phase` task — write the backfill as its own
   reviewed migration, not bundled into a schema-change tick.
6. **`git pull` divergence.**

## 9. Quick reference

```bash
# Reads
data/BACKLOG.md                        # pending migration briefs
plan/bearings.md                       # DB provider, RLS posture

# Writes
supabase/migrations/NNNN_<name>.sql
supabase/tests/<name>.test.sql

# Commands
git pull --ff-only
node scripts/lint-migration.mjs supabase/migrations/NNNN_<name>.sql
pnpm db:migrate:test
pnpm verify
git add <explicit files> && git commit && git push origin <DEFAULT_BRANCH>
```

## See also

- [`../../customization/data-layer.md`](../../customization/data-layer.md) —
  Pattern B (`pure-db`) and Pattern D
  (`hybrid-with-managed-postgres`), the full migration-safety
  contract, and the worked RLS test example.
- [`./ship-data.md`](./ship-data.md) — the shape this skill
  mirrors, for the static/editorial half of a hybrid data layer.
- [`../scripts/lint-migration.mjs`](../scripts/lint-migration.mjs) —
  the additive-migration linter Step 6 runs.
