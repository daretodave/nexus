# 42 — Secrets: manifest, vault, sinks

> A loop can use a secret without ever holding one. A tracked
> manifest names every secret and where it goes; the values
> live in a local vault the model never reads; nexus pushes
> them to GitHub Actions, Vercel or Cloudflare for you; and a
> chunk that needs a missing secret parks and asks, instead of
> stopping.

## Why

An adopter's first hard question is "where do the secrets
go?", and today the kit has no answer beyond an
`env.example` template. Worse, the easy answer, "the loop
reads `.env`", puts every key into the model's context, and
from there into transcripts, workflow logs and anything a
prompt injection can reach. nexus already denies `Read(.env)`
in its own settings. The missing piece is a way to *use*
secrets without *holding* them.

The roles differ:
- **Contributors never need project secrets.** They open
  pull requests; the owner's loop deploys. Some still keep
  their own local `.env` to run the app (a dev API key, a
  local database URL): that stays theirs, local-only, never
  pushed to a sink and never required by a chunk.
- **The owner is the sysadmin.** A chunk that deploys
  somewhere should be able to say "I need `VERCEL_TOKEN`",
  wait for it, and then carry on, with nexus doing the
  `gh secret set` / `vercel env add` plumbing.

What exists today (2026-10-21):
- `templates/env/env.example` (names and comments, no values).
- `templates/scripts/check-secrets-liveness.mjs` and
  `deploy-check.mjs`, which load `.env` into `process.env`
  inside scripts, never into the model.
- The `Read(.env)` deny rule in `.claude/settings.json`.
- The candidate "Two-ring secrets topology (.env vs
  .env.workspace)" in `CANDIDATES.md`, which this spec
  absorbs as the vault's file layout.
- The oversight queue and the GUI inbox, which already carry
  questions.

## Design

**The rule: the model sees names, never values.**
- Every surface the model touches carries a name and a status
  ("`VERCEL_TOKEN`: set · local, Actions"), never a value.
- Values move only between the vault, a sink and a child
  process, inside scripts and the GUI server.

**The manifest: `nexus.secrets.json`, tracked.** One entry per
secret:
- name, what it is for, where to get it (a link);
- destinations: `local`, `github-actions`, `vercel`,
  `cloudflare`;
- provider (`owner`), and the chunk that first asked for it.

It replaces `.env.example` as the contract; an import step
builds it from an existing `.env.example`. A chunk line gains
an optional field beside `needs`: `secrets VERCEL_TOKEN`.
plan-check refuses a name the manifest doesn't declare.

**The vault: where values live, local and untracked.**
- **Default: `.env`-style files.** `.env` in the repo for the
  loop's own tokens; `.env.workspace` at the workspace root
  for secrets several repos share (the two-ring layout). Repos
  already on that layout change nothing.
- **Opt-in: the OS keychain,** through the OS's own command
  line (`security` on macOS, the Windows credential manager
  via PowerShell, `secret-tool` on Linux), so the scripts stay
  dependency-free.
- **Import:** a `.env` dropped in stores its values in the
  vault and writes only the names into the manifest.

**Running with secrets.** `nexus secrets run -- <command>`
adds the declared names to the command's environment at run
time. The model writes the command; the wrapper supplies the
values.

**Sinks: nexus pushes values where they're needed.** Each sink
is a small adapter that pipes the value through stdin, never
as an argument, and records where each secret was pushed and
when:
- GitHub Actions (`gh secret set`) first;
- then Vercel (`vercel env add`) and Cloudflare
  (`wrangler secret put`).

**Rails, in code, not prose:**
- The guard hook blocks reading `.env` or `.env.workspace`,
  echoing a declared name's variable, and a vault value on a
  command line.
- The GUI server knows the values, so it masks any occurrence
  in a transcript before it is shown or logged.
- A gate leg refuses a commit whose diff contains any vault
  value.

**A chunk that needs a missing secret.**
- `/next` sees the chunk's `secrets` field and checks the
  vault. If a name is missing, the chunk parks (under
  `/heads-down` the loop moves on) and a secret request goes
  to the oversight queue: the name, why, where to get it, and
  the destinations to push to.
- Once the value is set, the chunk is ready again.
- A contributor's `/next` treats any chunk with a `secrets`
  field as owner-only and passes over it.
- A contributor's own local keys live in their vault as
  `local` only: the import works the same, sinks are
  refused, and their Vault reads "No project secrets needed"
  above their local keys.

**The audit log.** Every set, push and rotation is recorded
with the name, the destinations and the time, never a value.
A secret older than 90 days gets a rotation nudge in the
digest and the GUI.

**The GUI** (held until the owner's Claude Design export for
the vault arrives):
- a vault screen (names, status per destination, the chunk
  that asked, age);
- a secret-request card in the oversight inbox (a masked
  paste field, destination checkboxes, "Save and resume
  chunk"), whose value goes from the browser to the local
  server to the vault and sinks, never through a session;
- a `.env` import dropzone that previews names only;
- a contributor view that says no secrets are needed;
- an optional Secrets step in onboarding;
- a "needs secret" key badge on the plan board;
- the audit timeline.

## Acceptance

- **A5** `nexus secrets run -- <cmd>` gives the command the
  declared values in its environment and nothing else.
- **A6** The guard hook blocks reading the vault files,
  echoing a declared variable, and a vault value in argv, with
  self-tests.
- **A7** A gate leg refuses a staged diff that contains a
  vault value, with tests.
- **A9** The Vercel and Cloudflare sinks do the same.
- **A10** `/next` parks a chunk whose secret is missing and
  files a secret request in the oversight queue; `/heads-down`
  moves on.
- **A11** A contributor's `/next` never picks a chunk with a
  `secrets` field.
- **A12** The audit log records set, push and rotation by name
  only, and a secret older than 90 days gets a nudge.
- **A13** The GUI server lists names and status, takes a value
  through a masked POST into the vault and sinks, and masks
  vault values in every transcript it serves or logs.
- **A14** The GUI draws the vault, the secret request card,
  the import, the contributor view, the onboarding step, the
  board's key badge and the audit timeline from the owner's
  Claude Design export.

## Open questions

(None. The owner chose `.env`-style files as the default vault
on 2026-10-21; the keychain is opt-in.)

## Chunks
Measure: 9 open · 6 closed · next A16

- [ ] **42.3** `nexus secrets run` and the rails · M ·
  closes A5, A6, A7 · needs —
  - The run wrapper, the guard hook rules with self-tests,
    and the gate leg that scans a staged diff for vault
    values.
- [ ] **42.5** The Vercel and Cloudflare sinks · S · closes
  A9 · needs —
- [ ] **42.6** `/next` parks and asks; contributors skip; the
  audit log · M · closes A10, A11, A12 · needs —
- [ ] **42.7** The GUI server's secrets API and transcript
  masking · M · closes A13 · needs 42.3
- [ ] **42.8** The vault in the GUI, from the design export ·
  L · closes A14 · needs 42.6, 42.7
  - The export arrived 2026-10-21 (the handoff's second
    revision): Vault, VaultImport, VaultContributor,
    VaultKit, Secrets and SecretsContributor (onboarding step
    4 of 7), BoardOwnerAll ("Waiting on a secret"), the
    Inbox's key card, CloudLoop's sign-in card. Port it with
    the 41.3 fidelity rule.
  - The design's decisions, adopted: a stored value always
    shows as eight dots (its length never leaks); Show only
    reveals your own paste before saving; a secret request has
    no default, no countdown, and batch-answer skips it; "Skip
    <chunk> for now" leaves it "needs secret"; the cloud
    loop's `CLAUDE_CODE_OAUTH_TOKEN` is the loop's sign-in,
    not a project secret; GitHub Actions, Vercel and
    Cloudflare are named only as vault destinations.
