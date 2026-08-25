# Phase 22 — Workspace playbook (the un-versioned root)

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 8.8.
> One screen: deliverables, non-goals, decisions.

## Problem

Two real adoptions (kintilla, semilayer) independently
converged on the same topology once they outgrew `plan/` +
one product repo: an un-versioned local root, each repo —
`plan/` and every product — living under one GitHub org as a
sibling clone. `playbooks/polyrepo.md` documents the `plan/`
split in isolation; it never names the root itself, or what
changes once a workspace holds three-plus repos instead of
two. Adopters currently re-improvise the root conventions from
scratch.

## Deliverables

- `playbooks/workspace.md` — new playbook. Covers: when it
  earns its cost over polyrepo (decision matrix, not just
  prose); the un-versioned-root rule (the root directory is
  never `git init`'d — stated as the one rule that keeps a
  tick's atomic act from growing a third repo to sync); what's
  allowed to live only at root (local scratch, an editor
  multi-root workspace file, personal env bridges — nothing
  that needs its own history); org-per-project GitHub layout
  (`plan/` + every product as separate repos under one org,
  visibility set per repo); an inline root `CLAUDE.md`/
  `AGENTS.md` pointer-file snippet (same inline-snippet
  convention `polyrepo.md` already uses for
  `settings.local.json` — no new template file, so this phase
  makes no promise `templates/` doesn't yet keep); a
  "ready when" checklist. Voice/structure follow
  `playbooks/polyrepo.md` as the closest exemplar.
- `playbooks/polyrepo.md`: "See also" gains a link forward to
  `workspace.md`, framed as "outgrown two repos? this is the
  next rung."
- `concepts/architecture.md`: the "Topology" section's polyrepo
  paragraph gains one sentence naming workspace as what
  polyrepo generalizes to past two repos, with a link.
- `README.md`: new `### → playbooks/workspace.md *(variant)*`
  entry under "Three paths to start", positioned right after
  the polyrepo entry, same *(variant)* framing (not a
  flowchart node — matches how polyrepo already sits outside
  the mermaid diagram). Kit tree gains the one line.

## Non-goals

- **`templates/workspace/` root family** (workspace `CLAUDE.md`
  + `AGENTS.md` mirror as copyable template files, scratch
  README, repo-clone propagation template). The candidate's
  proposed scope bundles this with the playbook, but shipping
  it now means either an unshipped-file promise (bearings
  decision 2) or a rushed template contract. Filed forward as
  a new pending row (this tick adds it — see plan changes
  below) so it lands once the playbook's shape has had at
  least one real tick to prove itself.
- **Topology-detection step in the adopt prompt** (the
  confirm-with-user stop in `prompts/adopt.md` that asks a
  fresh adopter which topology they're landing into). Same
  deferral — it consumes the template family above, so it rides
  the same follow-up phase.
- **`playbooks/existing-project.md` / `new-project.md`
  rewrites.** Neither playbook's step 4 changes; workspace is
  additive context for adopters who've already outgrown
  single-repo, not a rewrite of the greenfield/brownfield
  entry points.
- **New verify leg.** `discover` and `tree` already cover a new
  playbook file mechanically; no new invariant is introduced.

## Decisions

1. Split the candidate's 1-2-estimated scope at the seam
   between "prose playbook" (this phase) and "mechanized
   templates + prompt integration" (deferred, new build-plan
   row appended after phase 32). The prose half is
   self-contained and immediately useful; the template half
   needs the prose settled first so the template contract
   doesn't get redesigned mid-flight.
2. No new template files this phase — the root pointer files
   are documented as an inline snippet (mirrors
   `polyrepo.md`'s existing `settings.local.json` snippet
   pattern), not a shipped template. Keeps this phase from
   tripping bearings decision 2 (never promise an unshipped
   file).
3. `workspace.md` extends `polyrepo.md` rather than replacing
   or duplicating its content — the layout diagram, the
   `additionalDirectories` bridge, and the push-order rule stay
   defined once in `polyrepo.md`; `workspace.md` links back for
   all three instead of re-explaining them.
