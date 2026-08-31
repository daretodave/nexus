# Sibling repos

> One row per repo under this workspace. Clone every row to
> reproduce the workspace on a new machine. Drop rows that
> don't apply; add more as the workspace grows — same
> convention as `setup/00_files.md`'s service index.

| Repo | Purpose | Visibility | Clone |
|---|---|---|---|
| `plan` | The ledger — build plan, audit, critique queue | private | `git clone https://github.com/<WORKSPACE_ORG>/plan.git` |
| `<PROJECT>` | <one line: what it ships> | public | `git clone https://github.com/<WORKSPACE_ORG>/<PROJECT>.git` |
| `<add more rows as the workspace grows>` | | | |

Each product repo also needs its own
`.claude/settings.local.json` bridging `../plan` via
`additionalDirectories` — see `playbooks/polyrepo.md`. This
file itself is ledger content; keep the canonical copy in
`plan/` and treat the one at workspace root as the quick
reference, updating both when a repo is added or removed.
