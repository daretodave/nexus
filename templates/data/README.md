# /data — GitHub-as-DB

> Only present if your project chose Pattern A (GitHub-as-DB)
> in `customization/data-layer.md`. Skip / delete this folder
> if you chose another pattern (external DB, SaaS, none).

Structured data for <PROJECT>. Every record is a JSON file. The
repo is the database. PRs are migrations. CI validates. The web
app reads via `<PROJECT_PKG_PREFIX>/data` typed loaders — never
reaches into the filesystem directly.

## Why JSON-in-repo

- **Hermetic.** No external DB to provision, no API keys, no
  rate limits. The autonomous loop never has to authenticate.
- **Diffable.** Every change is a reviewable PR.
- **Typed.** Zod schemas in `<schema-package>/src/schemas/`;
  generated JSON Schema in `data/schemas/`.
- **Portable.** If we outgrow this, exporting to a real DB is a
  one-time migration.

## Layout

```
data/
├── README.md                      # this file
├── BACKLOG.md                     # [ ] rows /ship-data reads next
├── AUDIT.md                       # latest /ship-data audit findings
├── schemas/                       # generated JSON Schema (do not hand-edit)
├── <entity>/<slug>.json           # one file per record
└── <entity>/archive/<slug>.json   # for time-bound entries past their date
```

## Provenance

Every record carries a `provenance` block:

```json
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

See `nexus/customization/data-layer.md` "Provenance" section
for the full contract on AI-generated vs user-sourced data.

## Ground rules

1. **Zod is the source of truth.** Schemas live in
   `<schema-package>/src/schemas/<entity>.ts`. JSON Schema files
   under `data/schemas/` are generated.
2. **One record per file.**
3. **Slugs are URL-safe.** `[a-z0-9-]+`. Filename = `slug` field.
4. **Cross-refs use slugs.**
5. **Append-mostly.** Never delete; archive or `status: "deprecated"`.
6. **`pnpm data:validate` must pass.**
7. **Provenance required** on every record.

## Backlog format

```markdown
# Data backlog

## Pending

- [ ] add <entity> <slug> — <one-line context>
- [ ] update <entity> <slug> — <field to backfill>

## Done

- [x] add <entity> <slug> (commit abc1234)
```

`/ship-data` flips `[ ]` → `[x]` in the same commit that ships
the record.
