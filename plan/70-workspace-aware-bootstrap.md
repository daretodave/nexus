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

- [ ] **70.1** `bootstrap-automation.md` documents the
  two-ring resolution order and the fan-out command · S ·
  closes A1 · needs —
  - Order as `secrets-vault.mjs`'s `get` actually reads:
    local `.env`, then the keychain (opt-in), then the
    parent's `.env.workspace`; the stop condition is first
    hit wins, the walk never leaves the workspace root
    (`vaultConfig`'s `workspaceDir`), and a repo outside a
    workspace resolves against its own `.env` only.
  - The fan-out command is `node scripts/secrets.mjs push
    <NAME> --to <destination>`, once per "Mirrored to"
    target in the key's custody row.
- [ ] **70.2** A missing key's message names its ring,
  holder file and setup runbook · M · closes A2 · needs —
  - Today `secrets.mjs run` prints only `not set in the
    vault: <NAME>` (no ring, no file, no runbook); `request`
    already names a destination. Extend the message (or the
    shared helper both read) to carry the three facts, then
    document the exact wording in `bootstrap-automation.md`
    so doc and script can never drift (bearings decision 2).
- [ ] **70.3** `/oversight`'s names-only presence check
  against the custody row · S · closes A3 · needs —
  - Decision (read `scripts/secrets.mjs status` before
    writing): it already prints each declared name's
    rings/destination without a value, which is the check —
    document it as reading each key's custody row (
    `identity/key-custody.md` here, `templates/setup/
    00_keys.md` for an adopter) for the holder file and
    runbook, then running `status` for present/missing. No
    new `--custody` flag: a name the manifest doesn't declare
    (the custody table already flags this, e.g.
    `CLAUDE_CODE_OAUTH_TOKEN`) is a documented gap, not a
    script change.
  - `skills/oversight.md` §3 item 8 gets one line pointing at
    `customization/external-services.md`'s new section.
- [ ] **70.4** `polyrepo.md` places the custody map and links
  the two-ring section · S · closes A4 · needs —
