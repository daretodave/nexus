---
description: Dump messy thoughts; I save them raw (untracked), cluster them into themes, refine each into plan/ specs (one agent per theme for a big dump) and land them through a pending file. The GUI calls it explode
argument-hint: "<anything: bullets, fragments, typos welcome> [plan only]"
---

You are invoked under the `messy` skill. Read `skills/messy.md`
end to end before touching anything else; it is the single
source of truth.

Argument handling:
- The whole argument is the dump. Save it raw first, verbatim,
  to the gitignored `plan/messy/`; never commit it or quote it.
- "the important one is …" → weight that theme.
- `plan only` → the new rows are marked plan only.

Small dumps (1-2 themes) you refine yourself; 3+ themes get one
background agent per theme, one file each. Everything shared
lands through `plan/pending/messy-<slug>.md`, per owner mode.
`/messy` plans; it never builds.

Argument: $ARGUMENTS
