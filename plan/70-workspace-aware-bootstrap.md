# 70 — Workspace-aware /bootstrap and /oversight

> A workspace keeps the secrets several repos share in one
> outer ring (`.env.workspace`), and each repo's own in an
> inner one (`.env`). The vault already reads both. The
> executor that bootstraps a repo and the skill that briefs
> its owner do not: one fans a workspace token out to repo
> secrets by hand, the other never says which ring a missing
> key belongs in. Teach both the two rings.

## Why

`customization/secrets.md` documents the rings and
`scripts/secrets-vault.mjs` resolves them, and spec 66 gave
every key a custody row naming its holder file. What is still
by hand is the walk between them. Resolving a name means
walking up: process env, then the repo's `.env`, then the
parent's `.env.workspace`, stopping at the workspace root.
Mirroring a name means walking down: one `gh secret set` per
"Mirrored to" target in the custody row. An adopter with a
workspace does both from memory today, and a missing key
fails with a bare "not set" that names neither the ring nor
the runbook that mints it.

## Design

- `customization/bootstrap-automation.md` states the
  resolution order (process env, repo `.env`, parent
  `.env.workspace`) with its stop conditions (the first hit
  wins; the walk never leaves the workspace root; a repo
  outside a workspace has one ring), and the fan-out: for a
  workspace-ring key, the executor runs `node
  scripts/secrets.mjs push <NAME> --to <destination>` once
  per "Mirrored to" target the custody row lists, names only.
- A missing key's message names three things: the ring it
  belongs in, the holder file its custody row gives, and the
  setup runbook that mints it.
- `customization/external-services.md` gives `/oversight` a
  names-only check: each key in its custody row's holder
  file, present or missing, never a value. A missing one is
  a `[needs-user-call] secret request` row, as today.
- `playbooks/polyrepo.md` says where the custody map lives in
  the polyrepo shape (it rides the plan repo) and that each
  repo's row points up at it.
- Edits to docs only; the scripts already resolve both rings.
  If a doc promises a message the script does not print, the
  script changes in the same chunk (bearings decision 2).

## Acceptance

- **A1** `customization/bootstrap-automation.md` documents the
  resolution order, its stop conditions and the fan-out
  command per "Mirrored to" target.
- **A2** A missing key's failure message, as documented and as
  printed, names its ring, its holder file and the runbook
  that mints it.
- **A3** `customization/external-services.md` describes
  `/oversight`'s names-only presence check against the
  custody table, and `skills/oversight.md` §3 item 8 points
  at it.
- **A4** `playbooks/polyrepo.md` places the custody map in the
  plan repo and links the two-ring section of
  `customization/secrets.md`.

## Open questions

- Whether `secrets.mjs status` already prints enough to serve
  as the presence check, or needs a `--custody` mode that
  reads `identity/key-custody.md`. The chunking session reads
  the script before deciding.

## Chunks
Measure: 4 open · 0 closed · next A5

Not chunked yet.
