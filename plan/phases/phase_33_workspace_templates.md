# Phase 33 — Workspace templates (phase 22's deferred half)

> Source: `plan/steps/01_build_plan.md` row (score 8.8),
> deferred from phase 22 — see
> `plan/phases/phase_22_workspace_playbook.md` non-goals.
> One screen: deliverables, non-goals, decisions.

## Problem

`playbooks/workspace.md` (phase 22) documents the un-versioned
root and its `CLAUDE.md`/`AGENTS.md` pointer file as a hand-
written inline snippet — deliberately, to avoid promising a
template file before the playbook's shape had proven itself.
It has: no drift since, no findings against it. The snippet is
ready to become a real copyable template, and `prompts/adopt.md`
still has no way for a fresh adopter to say "I'm landing into a
workspace, not a single repo" — it only ever infers greenfield
vs brownfield.

## Deliverables

- `templates/workspace/` — new adopt-by-need template family
  (mirrors the `setup/00_files.md` adopt-by-need pattern, not
  the standard-copy path):
  - `CLAUDE.md` — the agent-facing root pointer, templated from
    `playbooks/workspace.md`'s inline snippet with
    `<WORKSPACE_ORG>` and `<PROJECT>` placeholders in place of
    the hand-written example.
  - `AGENTS.md` — identical body to `CLAUDE.md` (same mirror
    relationship the playbook already describes: Claude Code
    reads the former, other agents the latter).
  - `README.md` — the human-facing root orientation ("scratch
    README"): what's here, the un-versioned-root rule in one
    paragraph with a link out, where to look next.
  - `REPOS.md` — the repo-clone propagation template: one row
    per sibling repo (name, purpose, visibility, clone command),
    modeled on `setup/00_files.md`'s index-table convention
    ("drop rows that don't apply, add more as it grows").
- `templates/README.md`: new `workspace/` entry in the Layout
  tree (four files, not collapsed — small enough to enumerate)
  and a new row in "Adopt-by-need files" pointing at
  `playbooks/workspace.md`.
- `scripts/verify.mjs`: `<WORKSPACE_ORG>` added to
  `PLACEHOLDER_VOCABULARY`; `templates/workspace` added to
  `REVERSE_CHECK_DIRS` (it's now an enumerated dir, same rule
  as the other bulk-copy families).
- `prompts/adopt.md`: one new ask item in the existing "Ask the
  user ONLY for" list — confirm topology (single-repo default /
  polyrepo / workspace), inferred from the existing directory
  layout (sibling `plan/` already present? multiple sibling
  repos already present?) but always confirmed, since guessing
  wrong reshapes file locations from phase 1 onward. The read
  list gains conditional lines: read `playbooks/polyrepo.md`
  and/or `playbooks/workspace.md` when the inferred/confirmed
  topology is one of those two.
- `playbooks/workspace.md`: the inline-snippet section now
  notes the snippet has a copyable counterpart in
  `templates/workspace/`, with the un-versioned-root caveat
  (copy the *content*, not the file's git history — the root
  itself still never becomes a repo).

## Non-goals

- **`playbooks/polyrepo.md` gaining its own `templates/`
  family.** Polyrepo's `additionalDirectories` snippet stays
  inline — it's a two-line JSON fragment, not a multi-file root
  pointer; this phase's template contract is about the
  workspace root specifically, not retrofitting polyrepo.
- **A `git clone` automation script.** `REPOS.md` is a
  markdown manifest a human or agent reads and executes by
  hand, matching every other template in this kit (docs, not
  scripts, unless a script already exists to extend — see
  `agents.md`'s repo shape). No new `.mjs` file.
- **Rewriting `new-project.md` / `existing-project.md`.**
  Same deferral reason as phase 22: topology is additive
  context for adopters past single-repo, not a rewrite of the
  greenfield/brownfield entry points.

## Decisions

1. `templates/workspace/` is adopt-by-need, not standard-copy —
   it ships empty of any single project's specifics and only
   matters once a workspace exists, same tier as
   `setup/00_files.md`.
2. Four files, enumerated in `templates/README.md`'s tree
   (not collapsed) — small enough that collapsing would just
   hide the reverse-check leg's one useful guarantee here: no
   template file drifts silently out of the diagram.
3. The adopt-prompt topology ask joins the existing "Ask the
   user ONLY for" list rather than becoming a new confirm-stop
   mechanism — `prompts/adopt.md` already has exactly one such
   list; a second pattern for the same kind of question would
   fragment the contract for no reason.
