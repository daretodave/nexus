# 69 — plan/ carries the workspace: resurrection + a doctor

> `templates/workspace/` (phase 33) already ships the root
> pointer files and `REPOS.md`'s clone map, but losing the
> machine still leaves two open questions: which secret names
> the workspace ring needs, and whether a rebuilt root is
> actually whole again. This spec closes both with a
> names-only keys list, an offline doctor, and a written
> resurrection flow.

## Why

The un-versioned root's obvious objection — lose the machine,
lose the topology — is half-answered already:
`templates/workspace/CLAUDE.md`/`AGENTS.md`/`README.md` are
the root pointer to copy back, and `REPOS.md` is the clone map
(`playbooks/workspace.md`, "Org-per-project GitHub layout").
What's still missing is the other half: nothing today lists
*which secret names* the workspace ring
(`customization/secrets.md`'s `.env.workspace`) is supposed to
hold, and nothing checks a rebuilt root against either list —
a resurrection can silently finish partial (a repo not
re-cloned, a key never re-set) with no signal until something
downstream fails.

## Design

- `templates/workspace/KEYS.md` — a names-only manifest (never
  values, matching `nexus.secrets.json`'s existing rule) of
  every secret the workspace ring holds: name, which sibling
  repos read it, and where it's minted. Sits alongside the
  three files `playbooks/workspace.md` already documents
  copying to root.
- `templates/workspace/workspace-doctor.mjs` — zero-dependency,
  offline, run from the root. Flags: the root itself being a
  git repo (`.git/` present), a repo `REPOS.md` lists that
  isn't cloned on disk, a `KEYS.md` name with no matching entry
  in `.env.workspace`, and a `KEYS.md` name whose *value*
  (never logged, only tested for presence) turns up inside any
  sibling repo's tracked tree.
- A new "Resurrection" section in `playbooks/workspace.md`:
  clone the org's ledger repo first, copy the
  `templates/workspace/` files (including `KEYS.md`) to the new
  root, sweep `<WORKSPACE_ORG>`/`<PROJECT>` as the existing
  instructions already do, clone every repo `REPOS.md` lists,
  re-run each sibling's own onboarding, then run
  `workspace-doctor.mjs` until green.
- A new lettered section in `playbooks/recovery.md` (after `I`)
  pointing at that Resurrection section for "lost the machine,
  still have GitHub."
- `KEYS.md` stays separate from spec 66's
  `identity/key-custody.md`: that table is the kit's own
  credentials (`GH_TOKEN`, `ACTIONS_PAT` — this repo's
  secrets, minted by and scoped to nexus itself); `KEYS.md` is
  the workspace ring's cross-repo secrets, named by which
  sibling repos read each one. Different scope, no subsuming.
- `workspace-doctor.mjs`'s leaked-value check is a real content
  scan, not a filename heuristic: for each `KEYS.md` name, read
  its `.env.workspace` value once (never logged) and search
  every sibling repo's git-tracked files (`git ls-files`, read
  from disk) for that literal string. Cheap because `REPOS.md`'s
  repos are already cloned locally for this check to run at all
  — no network fetch, no extra clone — and exact-string match
  keeps the script dependency-free (no regex engine, no entropy
  scoring).

## Acceptance

- **A2** `templates/workspace/workspace-doctor.mjs` is
  zero-dependency and runs fully offline; it flags, as
  failures: the root being its own git repo, a `REPOS.md` repo
  missing on disk, a `KEYS.md` name absent from
  `.env.workspace`, and a `KEYS.md` value found inside any
  sibling repo's tracked tree.
- **A3** `playbooks/workspace.md` gains a Resurrection section
  walking the new-machine flow end to end: clone the ledger
  repo, copy the `templates/workspace/` files up (placeholders
  swept), clone every `REPOS.md` repo, re-run each sibling's own
  onboarding, run the doctor until green.
- **A4** `playbooks/recovery.md` gains a lettered section
  (after `I`) pointing readers at the Resurrection section for
  the "lost the machine" case.

## Open questions

(None — both resolved at chunking time, 2026-11-21: the
content-scan choice and the custody-table split, per the two
new Design bullets above.)

## Chunks
Measure: 3 open · 1 closed · next A5

- [ ] **69.2** `templates/workspace/workspace-doctor.mjs` —
  zero-dependency, offline, flags a self-hosted root, a missing
  clone, a missing `.env.workspace` entry, and a leaked value ·
  M · closes A2 · needs —
- [ ] **69.3** `playbooks/workspace.md`'s Resurrection section:
  clone the ledger repo, copy `templates/workspace/` up
  (placeholders swept), clone every `REPOS.md` repo, re-run each
  sibling's onboarding, run the doctor until green · S · closes
  A3 · needs 69.2
- [ ] **69.4** `playbooks/recovery.md` gains a lettered section
  (after `I`) pointing at the Resurrection section for "lost the
  machine, still have GitHub" · S · closes A4 · needs 69.3
