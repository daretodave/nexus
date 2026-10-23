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
| `scripts/secrets.mjs` | The command line: `status`, `set`, `import`, `names`, `check`, `push`, `audit`, `request`. Prints names, never values. |
| `scripts/secrets-vault.mjs` | The vault: reads and writes `.env` and `.env.workspace`, and the keychain when it is on. Hands a value to code only. |
| `scripts/secrets-keychain.mjs` | The opt-in OS keychain, through the OS's own command line. |
| `scripts/secrets-sinks.mjs` | The sinks that push a value where it is needed (GitHub Actions, Vercel, Cloudflare), and the push record. Needs `scripts/ledger.mjs` (its lock). |
| `scripts/secrets-audit.mjs` | Set and rotation in the same record, by name; the rotation nudge. Needs `scripts/secrets-sinks.mjs`. |
| `scripts/secrets-run.mjs` | `secrets run`: a command with the declared values in its environment, its output masked. |
| `scripts/secrets-scan.mjs` | `secrets scan`: a diff that adds a vault value is refused, by file, line and name. |
| `.claude/hooks/guard.mjs` | The guard hook's vault rails: no read of a vault file, no echoed secret, no value on a command line. |
| `scripts/plan/secrets-manifest.mjs` | The shape and the import, as pure functions. It sits in `scripts/plan/` because `plan-check.mjs` imports it: a copy of `scripts/plan/` plus `plan-check.mjs` still runs. |
| `scripts/plan-check.mjs` | Checks the manifest's shape and every chunk's `secrets` field against it. |
| `.env` | The local ring: values, untracked, at the primary checkout. |
| `.env.workspace` | The workspace ring: values several repos share, at the workspace root, outside every repo. |
| `.nexus/secrets-audit.jsonl` | The audit record: each set, push and rotation, by name, and when. Untracked, at the primary checkout. Never a value. |
| `.nexus/secrets-local.json` | A contributor's own local key names (never values), untracked, at the primary checkout. |

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
| `optional` | Optional key. `true` for a secret the repo runs without (a token `gh auth login` stands in for locally). Unset, it reads `optional · not set` in `status` and the GUI, never `missing`, and no warning. Leave it out otherwise. |

Nothing else (`optional` is the one key an entry may leave out). A `value` key is refused outright, and so is any
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

A key **file** (a PEM) stays a file, outside every repo (a
`.secrets/` folder at the workspace root is the convention).
The vault holds its path under a name
(`TLS_KEY_FILE=/home/me/work/.secrets/tls.pem`), never its
contents: a vault value is one line. A service account's JSON
key is the one exception, because JSON folds to one line: Set
up a stack stores Google Cloud's and Firebase's key minified,
as one value, and the app hands it to the client library from
the environment, so no key file sits on disk at all. Run
`set` with a key you minified yourself; the stack's paste
field minifies for you.

### Set, unset, status, import

```bash
node scripts/secrets.mjs set VERCEL_TOKEN                     # a hidden prompt, or a pipe: never an argument
node scripts/secrets.mjs set CF_API_TOKEN --ring workspace    # into .env.workspace
node scripts/secrets.mjs unset VERCEL_TOKEN                   # out of every ring that holds it (or --ring R)
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
- A write rewrites the ring's file whole, under a lock, through
  a temp file renamed into place (owner-only, `0600`): every
  other name, comment, `export` and line ending stays as it
  was, and rewriting the same value changes nothing. For the
  root `.env` the temp file and the lock sit inside `.git`,
  where git never tracks anything, so a write cut short can't
  leave a value for `git add -A` to find. A value that needs
  quoting is single-quoted, so no dotenv reader expands a `$`
  or a backslash in it. One holding a `'` is double-quoted:
  if it also holds a `$`, dotenv-expand and docker compose
  expand that `$` (plain dotenv and nexus don't).
- `unset NAME` takes the value out of every ring that holds it
  (`--ring` for one), the same way, and records a `remove` in
  the audit log. The places it was pushed to keep their copy.
- `status` lists every declared name with the rings that hold
  it (or `missing`; `optional · not set` for an `optional`
  one) and its destinations. A `github-actions` destination is
  read from GitHub: `gh secret list --json name,updatedAt`,
  names and dates only, never a value. It shows `(set)` when GitHub lists the name,
  `(not set)` when it doesn't, and `(unknown)` when gh can't
  tell (not installed, not signed in, no permission, no GitHub
  remote). A name only GitHub holds, and the manifest sends
  nowhere else, reads `in github-actions only`, not `missing`,
  with its age from GitHub's `updatedAt`.
  The audit log stays the record of what the vault pushed.
  Then come any names the `.env` files hold that the manifest
  doesn't. `--json` gives the same as data (for the GUI), with
  each row's `remote` (`{ "github-actions": "set" }`). Never a
  value.
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

### A contributor's local keys

Project secrets are the owner's: contributors never need one.
Some still keep their own keys to run the app (a dev API key,
a local database URL), and the vault holds those too. A
contributor checkout is any checkout not in effective owner
mode ([`playbooks/owner-mode.md`](../playbooks/owner-mode.md)):
no `.owner`, owner mode switched off, or `NEXUS_CONTRIBUTOR=1`.
There:

```bash
node scripts/secrets.mjs set DEV_API_KEY             # -> local (this machine only)
node scripts/secrets.mjs import my.env --store       # values into the vault, names kept on this machine
node scripts/secrets.mjs status                      # "No project secrets needed", then your local keys
```

| | Owner | Contributor |
|---|---|---|
| `set`, `import --store` | any ring | `local` or `keychain`; the `workspace` ring is refused (it is shared with sibling repos) |
| The names | into `nexus.secrets.json` (import) | into the untracked `.nexus/secrets-local.json`, never the manifest |
| A sink (`push`) | pushes | refused, with one message |
| `status` | every declared name and where it is set | "No project secrets needed", then "Your local keys (this machine only)" |

- Because the names never reach the manifest, `plan-check.mjs`
  refuses a chunk that names one: no chunk can require a
  contributor's key.
- `.nexus/secrets-local.json` holds names only. It is the
  record `status` reads, since the keychain can't be listed.
- Setting a name the manifest declares works (the value stays
  on this machine), with a note that the owner provides it.
- `status --json` carries `mode` (`owner` or `contributor`),
  `projectSecretsNeeded` (`0` for a contributor) and
  `localKeys` (each name and its rings) for the GUI's Vault.

## Push: the sinks

A sink pushes a value from the vault to where it is needed, so
nobody pastes a token into a web form or a command line:

```bash
node scripts/secrets.mjs push GH_TOKEN                        # every destination the manifest lists for it
node scripts/secrets.mjs push GH_TOKEN --to github-actions    # one of them
node scripts/secrets.mjs push GH_TOKEN --repo me/other-repo   # another repo than this checkout's
node scripts/secrets.mjs push VERCEL_TOKEN --to vercel --env production,preview
node scripts/secrets.mjs push CF_API_TOKEN --to cloudflare --worker edge-api
```

| Destination | Sink | Through |
|---|---|---|
| `local` | none: it is the vault | |
| `github-actions` | `gh secret set NAME --app actions` | `gh` reads the value from stdin when `--body` is left out; `gh auth login` first |
| `vercel` | `vercel env add NAME <environment> --force --yes`, once per environment | `vercel` reads the value from stdin when `--value` is left out; `vercel login` and `vercel link` in the checkout first |
| `cloudflare` | `wrangler secret put NAME` | `wrangler` reads the value from stdin; `wrangler login` (or its own `CLOUDFLARE_API_TOKEN`) first |

The defaults, and the flags that change them:

| Flag | Sink | Default |
|---|---|---|
| `--repo OWNER/REPO` | `github-actions` | The checkout's own repo. |
| `--env E,E` | `vercel` | All three environments: `production`, `preview`, `development`. A name the app needs in one place only is narrowed here. `--force` overwrites, so a re-push is a rotation. |
| `--worker NAME` | `cloudflare` | The worker the checkout's wrangler config (`wrangler.toml` or `wrangler.jsonc`) names; `--worker` passes `--name` for a checkout without one, or another worker. |

The manifest stays as it is: a sink's target is a flag on the
push, not a key on the entry (the shape names no more keys).

- The name must be declared, and set in the vault; `--to`
  must be one of its destinations. A name that goes to `local`
  only has nothing to push.
- The value goes to the sink's tool on stdin, never as an
  argument. The tool's own output is dropped; a failure is
  named by its exit code, never by what it printed.
- `push` runs in owner mode only
  ([`playbooks/owner-mode.md`](../playbooks/owner-mode.md)).
  A contributor's keys are local-only: every sink refuses
  there ([A contributor's local keys](#a-contributors-local-keys)).
- A sink with several targets (Vercel's environments) runs
  them in order and stops at the first failure; the error
  names the environment, and the ones that landed are still
  recorded.
- Each push that lands is one line in
  `.nexus/secrets-audit.jsonl` at the primary checkout, with
  the repo, environments or worker when the push named them:

```json
{"time":"2026-10-21T10:00:00.000Z","action":"push","name":"GH_TOKEN","destination":"github-actions"}
{"time":"2026-10-21T10:01:00.000Z","action":"push","name":"VERCEL_TOKEN","destination":"vercel","environments":["production","preview","development"]}
```

The record is append-only, written under
`.nexus/secrets-audit.lock`. It refuses a `value` key and any
field that isn't a string, so a value can't slip in under
another word. Code adds events through
`scripts/secrets-sinks.mjs`'s `recordAudit` and reads them
with `readAudit`. A new sink is one entry in its `SINKS`
table: the command, its calls for a name (one argument list
per target), and what the audit line adds.

## Running with secrets

`nexus secrets run` is `node scripts/secrets.mjs run`: the
model writes the command, the wrapper supplies the values.

```bash
node scripts/secrets.mjs run -- npm run deploy                   # every declared name
node scripts/secrets.mjs run --only VERCEL_TOKEN -- vercel deploy  # just these
npm run secrets -- run -- npm run deploy                          # the same, through npm
```

- The command gets this shell's environment plus the declared
  names' values, and nothing else from the vault: a name in
  `.env` the manifest doesn't declare stays out. `--only`
  narrows it to a list; a name it gives must be declared.
- Every name it hands over must be set. A missing one stops it
  before the command starts, naming what to `set`.
- The command's stdout and stderr pass through with every value
  it was given replaced by `[secret NAME]`, a value split
  across two writes included, so a command that prints its
  token doesn't put it in a transcript. Stdin is the terminal's.
- Everything after `--` is the command's own: its flags never
  reach the wrapper. Its exit code is the wrapper's.
- On Windows an `.exe` runs directly; a `.cmd` or `.bat` (npm,
  npx) runs through the shell.

## The rails

Three rails hold the rule in code, not prose.

**The guard hook** (`.claude/hooks/guard.mjs`, copied from
`nexus/templates/claude/hooks/guard.mjs`) refuses, before the
call runs:

| Rule | Refuses | Passes |
|---|---|---|
| `vault-file` | Reading `.env` or `.env.workspace`: `cat`, `type`, `Get-Content`, `head`, `grep NAME .env`, `cp .env x`, `source .env`, `< .env`, a glob that matches one (`cat .env*`), `node -e` or `python -c` code that opens one, and the Read and Grep tools on one | A mention: `.env.example`, a grep pattern (`grep -rn .env src/`), a commit message or heredoc body, `echo .env >> .gitignore`, `ls`, `git check-ignore`, `cp .env.example .env`, `node scripts/secrets.mjs` itself |
| `secret-echo` | Printing a secret's variable (`echo $NAME`, `printenv NAME`, `$env:NAME`, `%NAME%`, `process.env.NAME` in `node -e`), or dumping an environment that holds one (`env`, `printenv`, `set`, `export -p`, `Get-ChildItem env:`) | Other variables (`echo $HOME`), a dump when no secret is in the environment or named, `$NAME` used without printing it (`curl -H "Authorization: Bearer $NAME"`) |
| `secret-value` | A vault value anywhere on the command line | Configuration-shaped values (below) |

The names are the manifest's, plus each name the vault's files
hold a secret-shaped value for; the values are the vault's
files, read through the repo's own `secrets-vault.mjs` (a repo
without it gets the file rules, not the value rule). The hook
never asks the keychain: a keychain call on every Bash call is
too slow. The command is read as a shell would read it (quotes,
heredocs, `$( )`, pipes, redirects, `bash -c` and `powershell
-Command` bodies, `secrets run`'s own command), and `node
.claude/hooks/guard.mjs self-test` runs every case above. The
template's `settings.json` wires the hook on Bash and on
Read|Grep (`pre-read`), and denies `Read` of both files.

**The scan** (`node scripts/secrets.mjs scan`) refuses a diff
that adds a vault value, naming the file, line and secret,
never the value. With no flag it reads the working tree against
`HEAD` plus the untracked files (what the next commit can
hold); `--staged` reads the staged diff only. Every ring counts,
the keychain included when it is on. No vault, it passes with a
note. Add it to your gate beside `plan-check.mjs`; nexus runs
it as its `secrets` leg.

**The run wrapper's mask** (above) covers a value a command
prints.

Two filters keep the rails quiet on ordinary text: a value
shorter than 8 characters, and one shaped like configuration
(one plain word such as `production`, a number, a localhost
URL), is not scanned, masked or refused. No real token looks
like either.

What the rails don't catch, so the prose still matters: a
recursive search over the checkout (`grep -rn TOKEN .` reads
`.env` too; `rg` and the Grep tool skip it as gitignored), a
value the model types itself, and any tool the hook isn't
wired on.

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

### A chunk waiting on a secret

`order.mjs` (what `/next` picks from) gates a chunk with a
`secrets` field:

| Checkout | The chunk's secrets | It reads |
|---|---|---|
| Contributor | any | `owner only`: never picked |
| Owner | every one set | ready, as any chunk |
| Owner | one missing | `needs secret <names>`: parked |

A name counts as set when a vault ring holds it or the
environment does (a cloud tick gets its secrets as env). The
vault is asked where a name is set, never what it is.
`--no-vault` skips the check; `--json` carries `needsSecret`.

When the owner's `/next` meets a parked chunk, it files the
ask and picks again (under `/heads-down` the loop moves on):

```bash
node scripts/secrets.mjs request 07.3
```

That writes `plan/pending/secrets-07.3.md`, a
`[needs-user-call]` note for the `/oversight` queue (and the
GUI's inbox) naming each missing secret, what it is for,
where to get it, where it goes and the `set` command, never a
value. Once per chunk: a row already in `plan/` is left
alone. The owner runs `set` in their own terminal (never in a
session), and the chunk is ready on the next pick; delete the
row then.

## The audit log

Every set, push and rotation is one line in the record the
sinks write, `.nexus/secrets-audit.jsonl` (untracked, beside
the vault): the time, the action, the name, the destination,
never a value.

| Action | Written by |
|---|---|
| `set` | the owner's `set` or `import --store`, a name the vault didn't hold |
| `rotate` | the same, a name it held: the value replaced |
| `push` | `push`, a sink sending a value to a destination |

```json
{"time":"2026-10-21T10:00:00.000Z","action":"rotate","name":"GH_TOKEN","destination":"local","ring":"local"}
```

```bash
node scripts/secrets.mjs audit           # every event, then the rotation nudges
node scripts/secrets.mjs audit --json    # the same as data
```

`scripts/secrets-audit.mjs`'s `recordSets` writes set and
rotate through the sinks' `recordAudit`. A contributor's own
keys are theirs and aren't recorded.

**The rotation nudge.** A secret the vault still holds whose
last set or rotation is over 90 days old gets a line,
`rotate <NAME>: last set N days ago`, in `audit` and
`status` (`status` also shows each name's age), and the
digest's `Needs you` carries it.

## What is not a project secret

- **The loop's own sign-in.** The cloud loop's
  `CLAUDE_CODE_OAUTH_TOKEN` signs the loop in; it is not
  something a chunk needs, so it stays out of the manifest
  (set it as the cloud-loop setup says).
- **A contributor's own local keys** (a dev API key, a local
  database URL) stay theirs, in their own vault, never in the
  manifest and never required by a chunk
  ([A contributor's local keys](#a-contributors-local-keys)).

nexus runs this on itself: its `nexus.secrets.json` declares
`GH_TOKEN` and `ACTIONS_PAT` (`agents.md`, "Operational
secrets") and leaves the loop's sign-in out.

## Stack hand-off

The GUI's Vault has **Set up a stack** (also onboarding's
Secrets step, recommended in a folder with nothing to import).
You pick the services the app runs on from 21 recipes, grouped
and searchable, or start from a preset (Supabase + Vercel +
Cloudflare, Next.js SaaS, AI app, Discord bot, Slack app):

| Group | Services |
|---|---|
| Hosting and DNS | Cloudflare, Vercel, Netlify, Fly.io |
| Data | Supabase, Neon, Upstash Redis, Firebase |
| Auth | Clerk |
| Payments | Stripe |
| AI | Anthropic, OpenAI |
| Messaging and chat | Discord, Slack |
| Email and SMS | Resend, Twilio |
| Observability | Sentry, PostHog |
| Cloud | AWS, Google Cloud, Azure |

Each one gets a card:
what it is for, the steps with links to the right console page,
the token to create and exactly which permissions to give it,
and a paste field per value that knows the value's shape.

What it writes:

- **The vault first, always.** Each value goes through the
  repo's own `secrets.mjs set` (the name declared in
  `nexus.secrets.json`, other keys untouched, the mask
  refreshed), under the framework's names: a public value gets
  the framework's prefix (`NEXT_PUBLIC_`, `VITE_`, ...) as well
  as its plain name; a secret never gets one.
- **Then the files the app reads**, when the vault's `.env` is
  not one of them: an app's own env file in a workspace (for
  example `apps/web/.env.local`), a root `.env.local` that
  already sets these names, or a `.env.workspace.json` in a
  layout nexus knows (flat, `env`, or per app). Each must be
  gitignored and inside the repo; the write is atomic and
  owner-only, and keeps every other line as it was.
- **The sinks you tick**: GitHub Actions for the deploy names
  CI reads (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
  `CLOUDFLARE_API_TOKEN`, `NETLIFY_AUTH_TOKEN`, `FLY_API_TOKEN`,
  `SENTRY_AUTH_TOKEN` and their IDs; never an AWS, Google Cloud
  or Azure key, which CI should get through OIDC), the `vercel`
  sink when the checkout is linked.
- A name the repo already reads (`SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL`,
  `AWS_DEFAULT_REGION`, `ARM_CLIENT_SECRET`, `KV_REST_API_URL`
  and the like) is kept in place of the new one.
- **The agent guide**: `docs/stack.md`, and a short pointer to
  it at the end of `agents.md` (or `AGENTS.md`, else
  `CLAUDE.md`). See below.

What it never does: send a value back to the browser, a log, a
URL or `.nexus/stack.json` (that file holds picks, ticks and
each check's allowlisted facts only). **Check it** and the
actions (DNS records on Cloudflare, the domain and the env on
Vercel) run only on a click, read tokens from the vault on the
server, call only each service's own API (an exact host list,
plus a project's own `supabase.co`, AWS STS and an Upstash
database by pattern) with the token in a header, read and never
write (a check is one read: who the key is, one price, one
PING), drop everything in the answer but a short list of facts,
and never pass on a service's own error text. Actions show a
plan before any change. It never runs `git push`; the last
card gives you the line to run.

When Supabase and Neon are both picked, both write
`DATABASE_URL`: the panel says so, and the last value saved
wins. Pick one to own it.

### The agent guide

Picking services, or saving a value, brings a marked block in
`docs/stack.md` up to date:

```
<!-- nexus:stack:begin. Written by Set up a stack ... -->
## The stack this app runs on
...one section per picked service...
<!-- nexus:stack:end -->
```

For each picked service it lists the env names as this repo
has them (the framework's prefix, an alias the repo already
reads), which ones are secret and which ship to the browser, how
code reads them (the SDK that picks them up, or the line that
passes them), the commands to run its CLI through
`node scripts/secrets.mjs run --only ...`, test against live,
rate limits, and what to do and not do. It never holds a value.
Notes written outside the block stay byte for byte, a rewrite
that changes nothing is skipped, and a CRLF file stays CRLF.
The rule book gets a short marked pointer once, so a session
that reads `agents.md` first finds the guide. Commit both
files: they are names and guidance, safe in git, and a cloud
session reads them too. The Vault's **For agents** line shows
the same text before it is written.

### Adding a service

A service is one entry in the registry; nothing else in the GUI
names it. To add one:

1. **The entry.** Add it to `SERVICES` (or one of the
   `services-*.mjs` files it spreads in) under
   `packages/cli/shared/stack/`: `id`, `name`, a two-letter
   `mono`, a `group` from `GROUPS`, `keywords` for search,
   `role` and `why`, the `token` to create (`grant` rows for
   least privilege, `resources`, `avoid`, `expiry`, `once`), the
   `steps` (each with a link, a tick, an `auto` fact or the
   values it asks for), the `values` (each with `env` names,
   `secret`, `required` and a `shape`; a secret has no public
   name), `gotchas`, and the `guide` (`reads`, `run`, `test`,
   `limits`, `do`, `dont`). Add it to `ORDER`, and its console
   hosts to `CONSOLE_HOSTS`.
2. **Its shapes**, in `shapes-more.mjs`: what each value looks
   like, the hint, and a `reject` for the value meant for the
   field next door. A format the service does not publish stays
   loose and says so.
3. **Its check**, in `packages/cli/server/stack-checks-more.mjs`:
   one read-only call, its host added to `ALLOW` exactly, its
   facts to `FACTS`. Read the status and a code, never the
   service's message.
4. **Its demo answer** in `server/demo/stack.mjs`, and its
   example value in the tests' `stack-examples.mjs`. The
   registry test then holds it to every rule above.

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
5. A sink takes the value on stdin, runs in owner mode only,
   and records each push by name, destination and time.
6. A command that needs a value runs under `secrets run`; the
   guard hook and the scan refuse the rest.

## You're ready when

- [ ] `nexus.secrets.json` is at the repo root and
      `node scripts/secrets.mjs check` is green.
- [ ] Every entry's `for`, `where` and `destinations` are
      true, and configuration that isn't a secret is gone.
- [ ] `.env` and `.env.workspace` are in `.gitignore`, and
      `node scripts/secrets.mjs status` shows every declared
      name set (a contributor needs none of them).
- [ ] `plan-check.mjs` is in your verify composition (it gates
      the manifest and the `secrets` fields), and so is
      `node scripts/secrets.mjs scan`.
- [ ] `node .claude/hooks/guard.mjs self-test` is green and
      `settings.json` wires `pre-read` on Read|Grep.

## See also

- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  chunk line and the plan gate.
- [`external-services.md`](./external-services.md): the
  `setup/` runbooks that produce most of these secrets.
- [`claude-code.md`](./claude-code.md): the guard hook and the
  `Read(.env)` deny rule.
