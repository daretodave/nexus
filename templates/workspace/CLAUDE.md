# Workspace root — not a repo

This directory is a plain folder, never `git init`'d. Every
child directory is its own GitHub repo under the
`<WORKSPACE_ORG>` org:

- `plan/` — the ledger (private). See `plan/bearings.md`.
- `<PROJECT>/` — <one line: what it ships>

`cd` into the repo you need; each has its own `agents.md`/
`CLAUDE.md`, verify gate, and git history. Nothing at this
level is tracked or shipped — see `REPOS.md` (this directory)
for the full sibling list and how to clone them fresh.
