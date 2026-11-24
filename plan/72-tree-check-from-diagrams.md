# 72 — The gate's tree check reads its directories from the tree diagrams

> The kit's most repeated bug is a README tree that no longer
> matches the disk: nine times in three months. The gate has
> a reverse check for it, driven by a second hand-kept list of
> directories that drifts the same way the trees do. Derive
> that list from the diagrams, and cover the repo root.

## Why

`scripts/verify.mjs`'s `legTree()` walks the directories named
in `REVERSE_CHECK_DIRS` and fails when a file on disk is
missing from the tree diagrams in `README.md` and
`templates/README.md`. The list is maintained by hand, apart
from the diagrams it polices: when a tree expands a new
directory, someone has to remember to add it here too. Commit
`e7b4172` found four template directories the list had missed
(`templates/.github`, `templates/data`, `templates/setup`,
`templates/env`), so drift inside them was invisible. Files
at the repo root (`CONTRIBUTING.md`, `CLAUDE.md`) are not
covered at all: only files under a listed directory are
walked. Each miss costs an `/iterate` tick to find and fix
something the gate should have caught.

## Design

- `legTree()` builds its directory list from the parsed
  diagrams: every top-level directory that appears as an
  entry in either tree is reverse-checked, with no list to
  keep in step.
- A short, explicit exclusion list replaces the allowlist:
  directories that never appear in an adopter-facing tree on
  purpose (`plan/`, `.git/`, `node_modules/`, and whatever
  else the first run shows). Each exclusion carries its
  reason in a comment.
- The repo root gets the same walk, non-recursive: a tracked
  file directly at the root that neither tree names is a
  failure.
- A directory a tree collapses to one line (`skills/ …`) is
  checked as collapsed, as today; only expanded directories
  are checked file by file.
- Tests beside the leg cover: a new expanded directory is
  picked up with no edit to the gate, a root-level file
  missing from the tree fails, an excluded directory passes.

## Acceptance

- **A1** `REVERSE_CHECK_DIRS` is gone; the reverse-checked
  directories come from the two parsed tree diagrams.
- **A2** Exclusions are an explicit list in `verify.mjs`, each
  with a one-line reason.
- **A3** A tracked root-level file missing from the root tree
  fails the `tree` leg.
- **A4** The leg's tests cover the three cases above, and the
  gate is green on the repo as it stands (any drift the wider
  check finds is fixed in the same chunk).

## Chunks
Measure: 4 open · 0 closed · next A5

- [ ] **72.1** `legTree()` derives its reverse-checked
  directories from the two parsed tree diagrams instead of
  the hand-kept `REVERSE_CHECK_DIRS` array · M · closes A1,
  A2 · needs —
  - Every top-level directory either tree expands (an entry
    whose children also appear, not a collapsed one-liner
    like `skills/ …`) becomes reverse-checked automatically;
    `REVERSE_CHECK_DIRS` is deleted. A short, explicit
    exclusion list (`plan/`, `.git/`, `node_modules/`, and
    whatever else this chunk's own gate run surfaces)
    replaces it, each entry carrying a one-line reason
    comment — directories that never belong in an
    adopter-facing tree on purpose.
- [ ] **72.2** The `tree` leg walks each tree's own root,
  non-recursively, and fails a tracked root file missing from
  that root's tree · M · closes A3 · needs 72.1
  - This chunking session counted the repo's tracked
    root-level files against README.md's root tree: four
    aren't named as their own entry — `.gitattributes`,
    `.gitignore`, `CLAUDE.md` and `LICENSE` (`CLAUDE.md` is
    only mentioned inside `agents.md`'s tree-line comment,
    which the parser doesn't read as a listing). Four is the
    spec's "a handful" case, so this chunk fixes the trees
    first instead of splitting: add a `CLAUDE.md` line to
    README.md's root tree (real, adopter-relevant content —
    exactly the gap the spec's Why section names), and
    exclude `.gitattributes`, `.gitignore` and `LICENSE` the
    same way as a directory exclusion (VCS/boilerplate, never
    adopter-facing content). `templates/README.md`'s own root
    already names every one of its root files, so the same
    walk applied there finds no drift to fix.
- [ ] **72.3** Tests beside the `tree` leg cover the three new
  cases · S · closes A4 · needs 72.2
  - `legTree`, `parseTreeBlock` and the new derivation/root-walk
    helpers export from `scripts/verify.mjs` for a new
    `scripts/__tests__/tree-leg.test.mjs` (the package's
    existing in-memory-tree pattern, e.g.
    `cadence-twins.test.mjs`): a newly expanded directory is
    picked up with no edit to the gate, a root-level file
    missing from its tree fails, and an excluded directory
    passes. The full gate green on the repo as it stands
    closes A4's other half.
