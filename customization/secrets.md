# Customization: secrets — the manifest names them

> A loop can use a secret without ever holding one. The rule:
> the model sees names, never values. `nexus.secrets.json` is
> the tracked contract that names every secret a repo uses,
> what it is for, where to get it and where it goes; the
> values live somewhere the model never reads. A chunk that
> needs a secret says so by name on its line, and the plan
> gate refuses a name the manifest doesn't declare.

Adopt when the loop deploys anywhere, or when your
`.env.example` has grown past a handful of lines nobody can
vouch for. A repo with no secrets needs no manifest: the gate
only asks for one once a chunk names a secret.

---

## The files

| File | What it is |
|---|---|
| `nexus.secrets.json` | The manifest, tracked, at the repo root. Names and facts, never a value. Copied from `nexus/templates/env/nexus.secrets.json`. |
| `scripts/secrets.mjs` | The command line: `import`, `names`, `check`. Prints names, never values. |
| `scripts/plan/secrets-manifest.mjs` | The shape and the import, as pure functions. It sits in `scripts/plan/` because `plan-check.mjs` imports it: a copy of `scripts/plan/` plus `plan-check.mjs` still runs. |
| `scripts/plan-check.mjs` | Checks the manifest's shape and every chunk's `secrets` field against it. |

The vault (where the values live: `.env`, `.env.workspace`, or
the OS keychain), `nexus secrets run`, and the sinks that push
a value to GitHub Actions, Vercel or Cloudflare extend
`scripts/secrets.mjs` with more commands; this page grows with
them.

## The shape

```json
{
  "version": 1,
  "about": "Names every secret this repo uses, never a value.",
  "secrets": [
    {
      "name": "VERCEL_TOKEN",
      "for": "Deploys the site from the cloud loop.",
      "where": "https://vercel.com/account/tokens",
      "destinations": ["local", "github-actions"],
      "provider": "owner",
      "chunk": "07.3"
    }
  ]
}
```

| Key | Rule |
|---|---|
| `version` | `1`. |
| `about` | Optional. One line for the next reader. |
| `secrets` | A list, one entry per secret (empty is fine). |
| `name` | An environment variable's name: `A-Z`, `0-9`, `_`, starting with a letter. Declared once. |
| `for` | What it is for, in words. Required. |
| `where` | A link to where the owner gets it, or `null`. |
| `destinations` | One or more of `local` (the vault), `github-actions`, `vercel`, `cloudflare`. Each once. |
| `provider` | `owner`. Contributors never need project secrets: the owner is the sysadmin, and the owner's loop deploys. |
| `chunk` | The chunk that first asked for it (`07.3`), or `null` (imported, or there before the plan). |

Nothing else. A `value` key is refused outright, and so is any
key the shape doesn't name, so a value can't slip in under
another word. The check's messages name the entry and never
quote what it holds.

## The import from `.env.example`

The manifest replaces `.env.example` as the contract. Build
it from the one you have:

```bash
node scripts/secrets.mjs import --dry-run   # the names it would add
node scripts/secrets.mjs import             # write them into nexus.secrets.json
node scripts/secrets.mjs import path/to/other.env.example
```

- Every name counts, live (`NAME=`) or commented out
  (`# NAME=`, no space before the `=`), once, in file order.
- `for` is the line's trailing comment, else the comment block
  just above it; `where` is the first link in either. A name
  with no comment gets a placeholder `for` to edit.
- A value on the line is skipped, never read into the result.
  Example values in `.env.example` are ignored, and so are real
  ones: importing a real `.env` writes names only.
- An entry already in the manifest is never touched. A new one
  goes to `local`, provided by the owner, asked for by no chunk.

Then edit each new entry: the real `for`, the link, the
destinations, and drop the names that are configuration, not
secrets (a provider name, a page selector). Keep
`.env.example` if your stack's tooling reads it; the manifest
is what the plan and the gate read.

## A chunk's `secrets` field

A chunk line gains an optional field beside `needs`:

```
- [ ] **07.3** Deploy previews · S · closes A4 · needs 07.2 · secrets VERCEL_TOKEN, VERCEL_PROJECT_ID
```

Names only, comma or space separated (`secrets —` means none).
The grammar is in
[`concepts/plan-shape.md`](../concepts/plan-shape.md#a-chunk).
`plan-check.mjs` refuses a name that isn't an env-var name, a
name the manifest doesn't declare, and any `secrets` field
when there is no manifest. `scripts/plan/order.mjs --json`
carries each chunk's `secrets` (`[]` when none), so `/next` and
the GUI can see which chunks wait on a secret.

When a chunk first needs a secret, add its entry with
`"chunk": "<that chunk>"` in the same change that adds the
field.

## What is not a project secret

- **The loop's own sign-in.** The cloud loop's
  `CLAUDE_CODE_OAUTH_TOKEN` signs the loop in; it is not
  something a chunk needs, so it stays out of the manifest
  (set it as the cloud-loop setup says).
- **A contributor's own local keys** (a dev API key, a local
  database URL) stay theirs, in their own vault, never in the
  manifest and never required by a chunk.

nexus runs this on itself: its `nexus.secrets.json` declares
`GH_TOKEN` and `ACTIONS_PAT` (`agents.md`, "Operational
secrets") and leaves the loop's sign-in out.

## Hard rules

1. The manifest never holds a value; nothing prints one.
2. Every name a chunk line carries is declared in the manifest.
3. The model reads names and statuses. Values move only
   between the vault, a sink and a child process, inside
   scripts.

## You're ready when

- [ ] `nexus.secrets.json` is at the repo root and
      `node scripts/secrets.mjs check` is green.
- [ ] Every entry's `for`, `where` and `destinations` are
      true, and configuration that isn't a secret is gone.
- [ ] `plan-check.mjs` is in your verify composition (it gates
      the manifest and the `secrets` fields).

## See also

- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  chunk line and the plan gate.
- [`external-services.md`](./external-services.md): the
  `setup/` runbooks that produce most of these secrets.
- [`claude-code.md`](./claude-code.md): the guard hook and the
  `Read(.env)` deny rule.
