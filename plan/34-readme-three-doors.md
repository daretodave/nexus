# 34 — README terraform: three doors, one art style

> A stranger lands on the README and picks one of three doors
> in ten seconds: the GUI (`npx @usenexus/cli`), a prompt to
> hand any agent, or the manual path. The diagrams beside the
> doors are generated, in one art style, under `assets/`.

## Why

The README grew phase by phase and reads like a changelog of
the kit. v2 changed the plan shape, the verbs (`/next`,
`/heads-down`, `/plot`, `/bug`) and added a GUI, so the front
page now undersells the kit and points newcomers at the long
path first. Hand-drawn or ad-hoc diagrams drift in style and
in truth; a generator keeps them consistent and lets the gate
notice a stale one.

What exists today (2026-10-20): `README.md` with a TL;DR, the
hard rules and two file trees; no `assets/` folder; diagrams
are ASCII inside docs. `@usenexus/cli` 0.0.2 (a placeholder)
is on npm; 0.1.0 (the GUI) is on main, untagged (spec 41).

## Design

- **Three doors**, first screen of the README, in this order:
  1. **Claude Code users:** `npx @usenexus/cli`, "a GUI on
     us, free". One line on what it opens (local server,
     your own Claude Code login).
  2. **Anything else:** "give this prompt to your agent",
     linking `prompts/adopt.md` with a copy-ready block.
  3. **Manual:** the playbooks (`new-project.md`,
     `existing-project.md`), as today.
- Everything below the doors stays (rules, trees), tightened:
  v1 vocabulary out, the v2 verbs in.
- **Diagrams:** `scripts/diagrams.mjs` writes every SVG under
  `assets/` from one style table (palette, stroke, corner
  radius, type, arrowheads). Light and dark both readable
  (`prefers-color-scheme` inside the SVG). First set: the
  plan shape (spec → chunk → A-ID → archive), the landing
  split (owner to main, contributor to a PR), the loop
  (`/next` one chunk; `/heads-down` many; `/march` timed).
- The gate regenerates into a temp dir and fails on a diff,
  so a committed SVG can't drift from its source.

Decisions made upfront (do not ask):

- Generated SVG, not PNG: diffable, small, themable.
- No external fonts or scripts inside the SVGs.
- The npx door ships before 0.1.0 is tagged; until then the
  placeholder prints where the GUI is.

## Contracts

- `assets/*.svg` are generated; hand edits fail the gate.
- `node scripts/diagrams.mjs [--check]` writes, or checks.

## Acceptance

- **A1** `scripts/diagrams.mjs` writes the first three SVGs
  under `assets/` from one style table; both themes legible.
- **A2** The verify gate fails when a committed SVG differs
  from the generator's output; `assets/` and the script are
  in the README tree.
- **A3** The README opens with the three doors (GUI via
  `npx @usenexus/cli`, the agent prompt, manual), embeds the
  diagrams, and carries no v1 phase vocabulary.

## Open questions

(None.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **34.1** Diagram generator, one art style, and its gate
  leg · M · closes A1, A2 · needs —
- [ ] **34.2** The README's three doors, with the diagrams ·
  M · closes A3 · needs 34.1
