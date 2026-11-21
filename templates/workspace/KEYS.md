# Workspace keys

> Names only: every secret the workspace ring
> (`.env.workspace`) is meant to hold, which sibling repos
> read it, and where it's minted. A value never appears
> below — see `customization/secrets.md` for the vault that
> holds one.

---

A secret belongs here once more than one sibling repo reads
it or it grants power over more than one of them (an org-wide
API token, a shared database's admin URL); anything
single-repo stays in that repo's own `.env` and its own
`nexus.secrets.json`, not here.

## Index

| Key | Which sibling repos read it | Minted by |
|---|---|---|
| `CF_API_TOKEN` | `<PROJECT>` and any sibling that deploys to Cloudflare | https://dash.cloudflare.com/profile/api-tokens |
| `<add more rows as the workspace grows>` | | |

Set a row's value once it's minted:

```bash
node scripts/secrets.mjs set CF_API_TOKEN --ring workspace
```

run from whichever sibling repo has `scripts/secrets.mjs` —
the value lands in `.env.workspace` at the workspace root, not
in that repo's own `.env`.

## Orientation

- This is the workspace ring's manifest, not the kit's own
  credentials — those live in `identity/key-custody.md` and
  never leave the kit's repo.
- Keep the canonical copy in `plan/` and treat the one at
  workspace root as the quick reference, same convention as
  `REPOS.md`: update both when a key is added or retired.
