# Phase 27 — scripts/new-skill.mjs, the skill scaffolder

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 6.8.
> One screen: deliverables, non-goals, decisions.

## Problem

`concepts/skills-anatomy.md` documents the canonical two-file
skill shape (`skills/<verb>.md` + `.claude/commands/<verb>.md`,
nine named sections, a frontmatter + `$ARGUMENTS` doorway), but
every one of the 15 skills shipped in `templates/skills/` so
far was hand-copied from a sibling and hand-renamed. That's
exactly how the anatomy drift the gate's `anatomy` leg keeps
catching gets introduced in the first place — a new skill is
born by mutating an unrelated one instead of starting from the
contract.

## Deliverables

- `scripts/new-skill.mjs <name> "<purpose>"` (nexus's own):
  - Validates `<name>` is lower-kebab-case
    (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`); rejects anything else
    with a one-line reason.
  - Refuses to run if either target file already exists
    (`skills/<name>.md` or `.claude/commands/<name>.md`) —
    prints which one and exits 1 rather than overwriting.
  - Emits `skills/<name>.md` pre-filled with the anatomy leg's
    four required sections (Purpose, Invocation, Failure modes,
    Quick reference) plus the standard Autonomy contract /
    Procedure / Hard rules scaffolding from
    `concepts/skills-anatomy.md`, `TODO`-marked throughout —
    this generates a gate-passable skeleton, not a finished
    skill; the author still writes the actual procedure.
  - Emits `.claude/commands/<name>.md` — frontmatter
    `description: <purpose>`, the standard doorway prose
    pointing at `skills/<name>.md`, and the literal
    `Argument: $ARGUMENTS` line the anatomy leg requires.
  - `--template` flag: same two files, written to
    `templates/skills/<name>.md` +
    `templates/claude/commands/<name>.md` instead — for
    scaffolding a new skill that ships to adopters, not one
    this repo runs on itself.
  - Multi-word purpose without quotes still works — remaining
    argv words after `<name>` are joined with a space rather
    than silently dropping everything past the second token.
- `templates/scripts/new-skill.mjs` — adopter twin, same
  logic, banner comment genericized (no nexus-specific phase
  citation), matching the existing `pulse.mjs` /
  `scripts/pulse.mjs` twin pattern: near-identical bodies, the
  narration is the only diff.
- `concepts/skills-anatomy.md`: one line in "The two-file
  pattern" and one in "When to write a new skill" pointing at
  the scaffolder instead of "hand-copy a sibling."
- `README.md` + `templates/README.md`: both `scripts/` tree
  listings gain the new file.

## Non-goals

- **A skill/command pair for `new-skill` itself.** This is a
  scaffolding utility invoked manually (or by an agent
  mid-`/expand` promotion), not a march-dispatched verb —
  matches the existing precedent of `scripts/pulse.mjs` and
  `scripts/adopt-dryrun.mjs`, neither of which has its own
  skill file.
- **Filling in the generated TODOs automatically.** The
  scaffold's job is structure, not content — the procedure,
  autonomy contract, and failure modes are the author's
  judgment call per phase, same as every hand-written skill
  today.
- **A `package.json` npm-script entry.** `verify`, `pulse`, and
  `deploy:check` get npm wiring because they're gate-shaped and
  invoked with zero args; `loop-issue.mjs`, `notify.mjs`, and
  `bootstrap.mjs` — the closer precedent, dev tools taking
  positional args — don't. `new-skill.mjs` follows the latter
  group.
- **Overwrite / `--force` mode.** Refuse-on-collision is the
  whole safety property; regenerating means deleting the two
  files first, deliberately.

## Decisions

1. Scaffold structure, not prose — every section body is
   `TODO`, not a guessed-at procedure. A wrong guess that reads
   as finished is worse than an honest blank; the anatomy leg
   only checks section presence, not content quality.
2. Collision refusal over silent overwrite — a skill file is
   load-bearing loop state; the scaffolder's failure mode on
   "name taken" is the same shape as `ship-a-phase`'s on a
   dirty tree: stop loud, don't guess.
3. `--template` as a flag on the same script rather than a
   second script — the two targets (this repo's own skills/ vs.
   the templates/ mirror adopters copy) differ only in the four
   destination paths; branching one script keeps the twin pair
   (`scripts/` + `templates/scripts/`) at two files total instead
   of four.
