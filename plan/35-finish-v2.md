# 35 — Finish the v2 move, then tag it

> Every trace of the phase shape is gone from the kit's words,
> commands and tools; a v1 adopter converts with one script;
> and `v2.0.0` is tagged with both lock files pointing at it.

## Why

The chunks-only shape landed on 2026-10-20 (paths and skill
names), but the vocabulary, a hook verb, an issue-title
contract and the converter were left behind. Until they go,
adopters see two shapes at once, and `plan/nexus.lock` points
at a moving `main` ("2.0.0-pre").

What exists today: `playbooks/upgrade.md` (guided-manual
Step 4), `templates/scripts/loop-issue.mjs` (the
`Phase <N> — ` title contract), the `phases` commit verb in
both `guard.mjs` copies, `plan/PHASE_CANDIDATES.md`, and
`scripts/adopt-dryrun.mjs` reading only `new-project.md` §4.

## Design

- **Vocabulary sweep** (words only; paths and names are done):
  `customization/*`, `concepts/intervention-spectrum.md`,
  `concepts/skills-anatomy.md`; template skills expand
  (scoring rows, "estimated phases"), iterate, critique, jot,
  ship-migration, digest, oversight §3; nexus's iterate and
  expand. A sibling adopter's name in public docs goes too
  (`customization/lessons-layer.md`, `customization/lanes.md`,
  `concepts/loop-shapes.md`, `.claude/commands/lessons-pr.md`,
  and nexus's skills): "learned from a sibling adopter".
- **Issue titles:** `loop-issue.mjs` gains `spec-open` /
  `spec-close` (title `Spec NN — `), with tests;
  ship-a-chunk Steps 2.5 and 12.5 (template and nexus) move
  to it.
- **Guard:** retire the `phases` commit verb and its
  self-test cases in both copies.
- **Rename** `plan/PHASE_CANDIDATES.md` → `plan/CANDIDATES.md`
  across templates, skills, `pulse.mjs`, both trees and the
  gate, in one commit (public API).
- **Converter:** `scripts/upgrade-plan.mjs` turns a v1 plan
  into v2: `[x]` rows and the phase log become ARCHIVE lines
  (dates from git), `[ ]` rows become spec stubs, blocked rows
  become Held lines. Dry-run by default; `upgrade.md` Step 4
  calls it.
- **adopt-dryrun** also walks `new-project.md` §3 (copy the
  plan starters, sweep, `plan-check` green), and runs on
  Windows through Git Bash when `/bin/bash` is absent.
- **Plan notes:** `plan/README.md` says new specs also arrive
  through `/plot` and `/messy`; `templates/plan/README.md`'s
  "How the loop reads this folder" names priority rows.
- **The pointer:** `CLAUDE.md` names `plan/README.md`'s pick
  order (`/next peek`) instead of the deleted build plan.
  Held: `CLAUDE.md` is the owner's configuration.
- **Tag:** once the rest is in, tag `v2.0.0`; both
  `nexus.lock` files say `version: 2.0.0` / `ref: v2.0.0`;
  `concepts/plan-shape.md` drops "until tagged". Held: a
  release is the owner's word.

## Acceptance

- **A1** No v1 phase vocabulary in the listed docs and skills;
  no sibling adopter named in public docs.
- **A2** `loop-issue.mjs spec-open|spec-close` exist with
  tests; ship-a-chunk uses them.
- **A3** Neither guard knows a `phases` verb.
- **A4** `plan/CANDIDATES.md` replaces `PHASE_CANDIDATES.md`
  everywhere, gate included.
- **A5** `scripts/upgrade-plan.mjs` converts a v1 fixture plan
  to one `plan-check` passes; `upgrade.md` Step 4 runs it.
- **A6** adopt-dryrun covers `new-project.md` §3 and runs on
  Windows.
- **A7** Both plan READMEs describe `/plot`, `/messy` and
  priority rows.
- **A8** `CLAUDE.md` points at the v2 pick order.
- **A9** `v2.0.0` is tagged; both lock files and
  `plan-shape.md` say so.

## Open questions

(None.)

## Chunks
Measure: 9 open · 0 closed · next A10

- [ ] **35.1** Both plan READMEs name /plot, /messy and
  priority rows · S · closes A7 · needs —
- [ ] **35.2** Vocabulary sweep: phase words and a sibling's
  name out of public docs · M · closes A1 · needs —
- [ ] **35.3** loop-issue spec-open/spec-close; ship-a-chunk
  moves to them · S · closes A2 · needs —
- [ ] **35.4** Retire the guard's phases verb · S · closes A3 ·
  needs —
- [ ] **35.5** PHASE_CANDIDATES.md becomes CANDIDATES.md ·
  S · closes A4 · needs 35.2
- [ ] **35.6** scripts/upgrade-plan.mjs, the v1 to v2
  converter · M · closes A5 · needs —
- [ ] **35.7** adopt-dryrun walks new-project §3, and on
  Windows · S · closes A6 · needs —
- [ ] **35.8** CLAUDE.md points at the v2 pick order · S ·
  closes A8 · needs —
- [ ] **35.9** Tag v2.0.0 and point both lock files at it ·
  S · closes A9 · needs 35.2, 35.3, 35.4, 35.5, 35.6, 35.7
