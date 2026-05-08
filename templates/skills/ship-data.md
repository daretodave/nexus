# Skill: ship-data

> **Full autonomy.** Add, repair, or normalize one entity in the
> project's data layer. Validate, commit (or upsert), confirm
> deploy, return.
>
> **The data layer pattern varies per project.** This skill
> describes the **contract**; your project's `bearings.md` and
> `customization/data-layer.md` choices fill in the storage
> specifics. Skip this skill entirely if your project has no
> structured data layer.

## 1. Purpose

The data layer is whatever your project uses for structured
records the app reads at runtime. Common patterns
(see `nexus/customization/data-layer.md` for full taxonomy):

- **A. GitHub-as-DB** — JSON / YAML / MDX records committed in
  the repo (e.g. `data/<entity>/<slug>.json`).
- **B. External DB** — Postgres / SQLite / MongoDB / Firebase /
  DynamoDB. Schema in code; records via SQL / driver.
- **C. SaaS data store** — Airtable / Notion / Sanity / Contentful /
  Supabase. Records via the provider's API.
- **D. Hybrid** — some data in-repo (slow-changing, design-y);
  some external (high-volume, user-generated).
- **E. None** — project has no structured data layer (most CLIs,
  libraries, single-page tools).

**This skill template applies regardless of pattern.** The
contract is the same; the bash/code that implements each step
varies.

If your project is pattern E (none), **delete this skill file**
and skip `/ship-data` entirely. `/march` handles its absence.

## 2. Invocation

```
/ship-data                          # next [ ] in the data backlog, or audit→fix
/ship-data add <entity> <slug>      # add one record
/ship-data update <entity> <slug>   # repair / extend an existing record
/ship-data audit                    # audit-only; emit data audit findings
/ship-data normalize                # cross-ref + slug repair (where applicable)
/loop 30m /ship-data                # autonomous backlog burndown
```

## 3. Autonomy contract

- **Missing field → research, don't ask.** Spawn `scout` for
  external sourcing.
- **Schema gap → propose addition** (as `optional()` in the
  source schema), regenerate / migrate, proceed.
- **Cross-reference broken → repair, don't ignore.** Create
  parent / vendor / referenced stubs in the same commit.
- **Audit finds 50 problems → ship one fix per phase, not all
  at once.**

## 4. Provenance — AI-generated vs user-sourced

Every record this skill writes carries a **provenance marker**
in its schema (or equivalent metadata for external DBs):

```
{
  ...record fields...,
  "provenance": {
    "source": "scout" | "user" | "ai-generated" | "vendor-published" | "manual-import",
    "verified": true | false,
    "verified_by": "<actor>" | null,
    "verified_at": "<ISO date>" | null,
    "citations": [<url-or-source-id>, ...]
  }
}
```

The trust contract by source:

| Source | Verification needed before publish | Citations required |
|---|---|---|
| `vendor-published` (manufacturer spec) | none | URL to vendor page |
| `user` (user-submitted via API/form) | shape + spam filter | optional |
| `scout` (open-web research) | cross-source confirmation if claim is high-stakes | yes, ≥1 primary source |
| `ai-generated` (LLM-drafted prose / summary) | factual claims must be cite-backed; non-factual prose can publish | yes for factual; no for editorial |
| `manual-import` (you, by hand) | trust your own | optional |

**`ai-generated` records require extra rigor.** When this skill
writes an AI-generated record (typically content like an
article, a summary, a description):

1. Every factual claim in the record must trace to a citation
   in `provenance.citations`. If a claim can't be cited, it
   must be removed or marked clearly as opinion.
2. Spawn `scout` to verify any specific factual claim before
   publish. The `verified` flag is `false` until scout returns
   confirmation.
3. Records published with `verified: false` are visible to the
   site but flagged (e.g. a `[draft]` badge or
   `noindex` meta). The next `/iterate` tick prioritizes
   verifying them.

The schema enforces this — see
`customization/data-layer.md` "Provenance schema" section.

## 5. Delegation

- **`scout`** — sourcing facts, vendor URLs, dates, specs.
  Required for `ai-generated` records' citation backfill.
- **`<content-curator>`** — drafting prose for `ai-generated`
  content records (articles, summaries).
- **`<data-steward>`** — schema-heavy work (new entity types,
  mass cross-ref repair, migrations).
- **Parallel calls** when researching multiple records.

## 6. The procedure

The procedure is the same shape across patterns; bash commands
vary. Use the variant matching your project's data layer.

### Step 0 — Re-sync

```bash
git pull --ff-only
```

### Step 1 — Pick the work

Pattern A (GitHub-as-DB): read `data/BACKLOG.md`, next `[ ]`
row.
Pattern B (DB): read `data/BACKLOG.md` OR query a "to-process"
queue table.
Pattern C (SaaS): read `data/BACKLOG.md` OR poll the SaaS API
for unprocessed records.
Pattern D (Hybrid): read both sources; pick by priority.

If empty, run audit (§7) and append top finding to backlog.

### Step 2 — Read the schema

Pattern A: `data/schemas/<entity>.schema.json` (Zod-derived).
Pattern B: schema-as-code in `<schema-package>/src/schemas/`.
Pattern C: provider's schema endpoint (`/v0/meta/bases/...` for
Airtable, schema introspection for Sanity, etc.).
Pattern D: combination.

### Step 3 — Research / draft

If external research needed: spawn `scout`. If AI-generated
content: spawn `<content-curator>` with the draft requirements.

For `ai-generated`: scout returns citation candidates → curator
drafts → main agent assembles the record with `provenance.citations`
populated.

### Step 4 — Validate

Pattern A: write JSON to `data/<entity>/<slug>.json`,
`pnpm data:validate`.
Pattern B: insert/upsert via driver inside a transaction; the
DB enforces schema; rollback on validation failure.
Pattern C: dry-run via the provider's validation endpoint where
available; otherwise post + check response.
Pattern D: validate per-source; fail if any side fails.

### Step 5 — Wire (only if first record of a new entity type)

Pattern A: add a loader at `<schema-package>/src/<entity>.ts`
plus tests. Re-export.
Pattern B: add a query helper / model / repository. Migrations
applied separately.
Pattern C: add a typed wrapper around the provider's client.
All patterns: tests for the wire layer.

### Step 6 — Persist + commit

Pattern A:

```bash
git add data/<entity>/<slug>.json [+ schema if changed]
git commit -m "data: add <entity> <slug>"
git push origin <DEFAULT_BRANCH>
```

Pattern B (external DB):

The record is already inserted (Step 4). Commit the **migration
or schema change** (if any) to the repo:

```bash
git add <migration-file>
git commit -m "data: schema <entity> + insert <slug>

Record inserted to DB. Migration: <file>.
DB ID: <id>.
"
git push origin <DEFAULT_BRANCH>
```

The actual record lives in the DB; the commit captures intent
and migration.

Pattern C (SaaS): record is in the SaaS provider. Commit a
**reference / log entry** or a sync manifest to the repo:

```bash
git add data/sync-log.md   # or similar
git commit -m "data: synced <entity> <slug> to <provider>

External ID: <id>.
"
git push origin <DEFAULT_BRANCH>
```

Pattern D: combine.

**Always commit something** — even if the data lives outside
the repo. The commit is the audit trail. "What did the loop do
in the last 80 hours?" must be answerable from `git log` alone.

### Step 7 — Confirm deploy

```bash
pnpm deploy:check
```

Pattern A: data lives in the build; deploy rebuild reflects
changes.
Pattern B/C: deploy may not change (data is read at runtime),
but the gate still runs to confirm no regression.

### Step 8 — Done

Return cleanly.

## 7. Audit pass

Score 0–10 by impact × ease:

1. **Orphan references.** App / content references a slug not
   in the data layer.
2. **Schema drift.** Records validating against an old schema.
3. **Stale time-bound entries.** Move to archive (Pattern A) or
   set `archived: true` (Pattern B/C).
4. **Coverage gaps.** Records mentioned but missing.
5. **Cross-reference symmetry.** Bidirectional refs that don't
   agree.
6. **Provenance hygiene.** Records with `verified: false` for
   > 7 days. AI-generated records without citations.
7. **Empty asset fields** (images, etc.).

Write findings to a data-audit file the loop can read next tick.

## 8. Normalize pass (Pattern A primarily; adaptable)

When invoked with `normalize`:

- **Slug consistency.** Filename / primary key matches the
  `slug` field.
- **Cross-ref repair.** Every foreign key resolves.
- **Dedup.** Same name/aliases merged.
- **Archive expired.** Time-bound entries moved.
- **Sort string arrays** for stable diffs (Pattern A).

Commit each category as its own commit.

## 9. Hard rules

1. **Schema is law.** Never persist a record that doesn't
   validate.
2. **No `Co-Authored-By:`. No emojis.**
3. **Provenance markers required** on every record (§4).
4. **`ai-generated` records must have citations** for factual
   claims. Editorial / opinion prose does not need citations
   but must be marked as such in provenance.
5. **Slugs / primary keys are stable** — never reuse a deleted
   slug for a new record.
6. **Cross-refs use slugs / IDs**, not names.
7. **Append-mostly.** Archive (don't delete) wherever the
   pattern allows.
8. **Validate before persist.** Failure aborts the tick.

## 10. Failure modes

1. **Validation fails ≥3 times on same root cause.**
2. **`pnpm deploy:check` fails ≥3 times** after a data ship.
3. **`<PROVIDER_AUTH_TOKEN>` missing** (deploy:check exit 3).
4. **External DB / SaaS unreachable.** Surface; the next tick
   retries.
5. **Schema change requires migration of >20 records.** That's
   a `/plan-a-phase` task; not bundled here.
6. **AI-generated record has unverifiable factual claims** that
   scout can't cite. Mark `verified: false`, file as
   `[needs-user-call]` in audit, ship anyway with the unverified
   flag visible in UI.
7. **Research requires login or paid access.**
8. **`git pull` divergence.**

## 11. Quick reference

Replace per your data layer. Pattern A canonical commands:

```bash
# Read
data/BACKLOG.md
data/AUDIT.md
data/schemas/<entity>.schema.json
<schema-package>/src/<entity>.ts

# Write
data/<entity>/<slug>.json
<schema-package>/src/schemas/<entity>.ts  # only if extending schema

# Validate + commit + push + deploy
pnpm data:validate
git add <explicit files>
git commit -m "..."
git push origin <DEFAULT_BRANCH>
pnpm deploy:check
```

For Patterns B/C/D, see `customization/data-layer.md` for the
equivalent commands.
