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
| `scripts/secrets.mjs` | The command line: `status`, `set`, `import`, `names`, `check`. Prints names, never values. |
| `scripts/secrets-vault.mjs` | The vault: reads and writes `.env` and `.env.workspace`, and the keychain when it is on. Hands a value to code only. |
| `scripts/secrets-keychain.mjs` | The opt-in OS keychain, through the OS's own command line. |
| `scripts/plan/secrets-manifest.mjs` | The shape and the import, as pure functions. It sits in `scripts/plan/` because `plan-check.mjs` imports it: a copy of `scripts/plan/` plus `plan-check.mjs` still runs. |
| `scripts/plan-check.mjs` | Checks the manifest's shape and every chunk's `secrets` field against it. |
| `.env` | The local ring: values, untracked, at the primary checkout. |
| `.env.workspace` | The workspace ring: values several repos share, at the workspace root, outside every repo. |

`nexus secrets run` and the sinks that push a value to GitHub
Actions, Vercel or Cloudflare extend `scripts/secrets.mjs`
with more commands; this page grows with them.

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

## The vault: where the values live

Values live in three places, local and untracked. The model
never reads one: `scripts/secrets-vault.mjs` is the only code
that does, and it hands a value to code (the run wrapper, a
sink, the GUI server), never to a terminal.

| Ring | File | Holds |
|---|---|---|
| `local` | `.env` at the primary checkout's root (every worktree of it shares the one file) | The loop's own tokens: what this repo's scripts and deploys need. |
| `keychain` | The OS keychain, service `nexus/<repo>` | Opt-in: the same names, kept out of plain files. |
| `workspace` | `.env.workspace` at the workspace root | Secrets several repos share. |

A name is read from `local`, then `keychain`, then
`workspace`: the first ring that holds it wins, so a repo can
override a shared value.

### Two rings

The workspace root is the folder that holds the sibling repos
(`~/work/` holding `~/work/app/` and `~/work/api/`): by
default the checkout's parent folder, or any folder set in
`.nexus/local.json`. It is never a repo itself
([`playbooks/workspace.md`](../playbooks/workspace.md)), and
that is the safety property: `.env.workspace` sits outside
every repo, so `git add -A` physically cannot reach it.

Where a secret goes, the tiebreaker: a secret consumed by, or
granting power over, more than one repo (an org-wide
Cloudflare token, a shared database's admin URL) goes to the
workspace ring; anything else stays in the repo's `.env`. A
single-repo project needs only `.env`; repos already on the
two-ring layout change nothing.

A key **file** (a PEM, a service account's JSON) stays a file,
outside every repo (a `.secrets/` folder at the workspace root
is the convention). The vault holds its path under a name
(`GCP_KEY_FILE=/home/me/work/.secrets/gcp.json`), never its
contents: a vault value is one line.

### Set, status, import

```bash
node scripts/secrets.mjs set VERCEL_TOKEN                     # a hidden prompt, or a pipe: never an argument
node scripts/secrets.mjs set CF_API_TOKEN --ring workspace    # into .env.workspace
node scripts/secrets.mjs status                               # each name: where it is set, where it goes
node scripts/secrets.mjs import incoming.env --store          # a real .env: values into the vault, names into the manifest
```

- `set NAME` reads the value from stdin, or from a prompt that
  doesn't echo when you type it in a terminal. Never from argv:
  arguments land in process lists and shell history. A name the
  manifest doesn't declare is stored too (a local-only key),
  with a note.
- `--ring` is `local`, `workspace` or `keychain`. The default
  is the keychain when it is on, else `local`.
- `status` lists every declared name with the rings that hold
  it (or `missing`) and its destinations, then any name the
  `.env` files hold that the manifest doesn't. `--json` gives
  the same as data (for the GUI). Never a value.
- `import FILE --store` takes a `.env` someone handed you: each
  live `NAME=value` goes into the vault (the ring as for
  `set`), the names go into the manifest exactly as the
  `.env.example` import does, and the output names them. Then
  delete the file. A value on more than one line is skipped
  and named.

**There is no `get`.** A command that prints a value is a
command the model can run, and then the value is in the
transcript. Code reads a value through the module:

```js
import { openVault } from './secrets-vault.mjs'
const vault = openVault({ root })
const { values, missing } = vault.resolve(['VERCEL_TOKEN'])   // values: a Map, for a child process's env
```

### The rails on a write

- `.env` is refused unless git ignores it here; add `.env` and
  `.env.workspace` to `.gitignore` before the first `set`.
- `.env.workspace` is refused inside a git repo (unless that
  repo ignores it): a misconfigured workspace path fails loud.
- A new file is created owner-only (`0600`; Windows keeps its
  own ACLs, which already scope a user's profile).
- An empty or multi-line value is refused. Every message names
  the secret, never the value.

### The OS keychain (opt-in)

Turn it on per checkout in the untracked `.nexus/local.json`:

```json
{ "secrets": { "keychain": true } }
```

| OS | Through | Notes |
|---|---|---|
| macOS | `security` (the login keychain) | A write goes through `security -i` on stdin. |
| Windows | Windows PowerShell 5.1 and the Credential Locker (`Windows.Security.Credentials.PasswordVault`) | Built in; `pwsh` 7 lacks the API, so it runs `powershell.exe`. The value crosses as base64 on stdin and stdout. |
| Linux | `secret-tool` (libsecret: GNOME Keyring, KWallet) | `apt install libsecret-tools` if it is missing. |

No new dependencies: each is the OS's own command line, and a
value travels on stdin and stdout only. Items file under the
service `nexus/<repo folder>`; the keychain is asked about
declared names only (it can't be listed cheaply).

The other settings, all optional, in the same `secrets` object:

| Key | Default | Means |
|---|---|---|
| `keychain` | `false` | Use the OS keychain, and write to it by default. |
| `keychainService` | `nexus/<repo folder>` | The keychain service the items file under. |
| `workspace` | `..` | The workspace root, relative to the checkout (or absolute). |

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

1. The manifest never holds a value; nothing prints one, and
   no command reads one back to a terminal.
2. Every name a chunk line carries is declared in the manifest.
3. The model reads names and statuses. Values move only
   between the vault, a sink and a child process, inside
   scripts.
4. A value goes in through stdin, never argv; `.env` and
   `.env.workspace` are gitignored, and the workspace ring sits
   outside every repo.

## You're ready when

- [ ] `nexus.secrets.json` is at the repo root and
      `node scripts/secrets.mjs check` is green.
- [ ] Every entry's `for`, `where` and `destinations` are
      true, and configuration that isn't a secret is gone.
- [ ] `.env` and `.env.workspace` are in `.gitignore`, and
      `node scripts/secrets.mjs status` shows every declared
      name set (a contributor needs none of them).
- [ ] `plan-check.mjs` is in your verify composition (it gates
      the manifest and the `secrets` fields).

## See also

- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  chunk line and the plan gate.
- [`external-services.md`](./external-services.md): the
  `setup/` runbooks that produce most of these secrets.
- [`claude-code.md`](./claude-code.md): the guard hook and the
  `Read(.env)` deny rule.
