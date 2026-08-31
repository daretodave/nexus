# `<WORKSPACE_ORG>` workspace

Local root for the `<WORKSPACE_ORG>` GitHub org's repos. This
directory is intentionally **not** a git repo — never
`git init`'d, never pushed, never has its own commit history.
See `playbooks/workspace.md` (in the `plan/` repo, or
`nexus/playbooks/workspace.md`) for the full rule and why it
matters: it's what keeps a tick's atomic commit-and-push act
from silently growing a third participant to sync.

## What's here

- `plan/` — the ledger (private repo). See `plan/bearings.md`.
- `<PROJECT>/` — <one line: what it ships>
- `<add a line per sibling repo as the workspace grows>`

## Orientation

- Landing here as an agent? Read `CLAUDE.md` or `AGENTS.md`
  first — same content, different filename per which agent
  reads which convention.
- Rebuilding this workspace on a new machine? `REPOS.md` lists
  every sibling repo and its clone command.
- Anything else that lives only at this level — scratch notes,
  an editor multi-root workspace file, a personal secrets
  bridge — is personal and untracked by design; nothing here
  should ever need a commit log. See `playbooks/workspace.md`
  "What lives only at root."
