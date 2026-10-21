---
date: 2026-10-21
---
## Edit plan/README.md
~~~ old
- **39.4** creates a scratch repo on the owner's account
~~~
~~~ new
- **39.4** creates a scratch repo on the owner's account
- **42.8** waits on the owner's Claude Design export for the vault
~~~

## Edit plan/README.md
~~~ old
| 41 | GUI: steering, tugs, the design, the release | [41-gui-steering-design-release.md](41-gui-steering-design-release.md) | planned | 3 left |
~~~
~~~ new
| 41 | GUI: steering, tugs, the design, the release | [41-gui-steering-design-release.md](41-gui-steering-design-release.md) | planned | 3 left |
| 42 | Secrets: manifest, vault, sinks | [42-secrets-vault.md](42-secrets-vault.md) | planned | 8 left |
~~~

## Edit plan/README.md
~~~ old
plan moved to chunks on 2026-10-20). The next new spec is 42.
~~~
~~~ new
plan moved to chunks on 2026-10-20). The next new spec is 43.
~~~

## Edit plan/CANDIDATES.md
~~~ old
### [ ] [score 8.5] Two-ring secrets topology (.env vs .env.workspace)
~~~
~~~ new
### [x] [score 8.5] Two-ring secrets topology (.env vs .env.workspace) (absorbed into spec 42, 2026-10-21)
~~~

## Decisions
- **D?secrets-names-only** · 2026-10-21 · The model sees secret names and status, never values; values move only between the vault, sinks and child processes. *Why:* a value in context reaches transcripts, logs and prompt injections.
