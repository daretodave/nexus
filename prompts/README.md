# prompts/

> Canonical paste-prompts for nexus adoption — versioned,
> gate-linted, public API. README.md's TL;DR sections point
> here instead of embedding the full text inline.

---

## What's here

| File | Job |
|---|---|
| [`adopt.md`](./adopt.md) | The full agent prompt for "I already have a spec.md, delegate the adoption." Paired with README's [TL;DR — clone + delegate the adoption](../README.md#tldr--clone--delegate-the-adoption). |
| [`pitch.md`](./pitch.md) | The full agent prompt for "I have a pitch, no spec yet." Paired with README's [TL;DR — I have a pitch, no spec yet](../README.md#tldr--i-have-a-pitch-no-spec-yet). |

## Why a separate file

The README's TL;DR sections used to embed each ~60-line prompt
inline — every prompt fix meant re-copying the new blob into
every doorway that quoted it (README, and eventually an npx
installer or a Claude Code plugin manifest). Pulling the text
out here means:

- README's paste shrinks to a few lines: clone nexus, then
  read and follow the file.
- Every other doorway can reference the same canonical text
  instead of carrying its own copy.
- A fix to the adoption instructions is one file edit, not a
  find-and-replace across doorways.

## Not a template

Unlike `templates/design-prompt.md` (which adopters copy INTO
their own repo and fill in), these files stay in nexus and get
read directly out of `../nexus/prompts/` — an adopter's agent
clones nexus, then reads and follows the file in place. Nothing
here is copied by the adoption flow itself.

## Public API

These files are pasted by adopters and may be linked to
directly from outside this repo. Treat paths and section
structure the same as `templates/` (`agents.md` rule 7):
renames are breaking changes.

## See also

- [`README.md`](../README.md) — the two TL;DR sections that
  point here.
- [`playbooks/new-project.md`](../playbooks/new-project.md) /
  [`playbooks/existing-project.md`](../playbooks/existing-project.md)
  — what `adopt.md` tells the agent to follow.
- [`playbooks/pre-spec.md`](../playbooks/pre-spec.md) — what
  `pitch.md`'s Phase A tells the agent to follow.
