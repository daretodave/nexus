# Phase 10 — `templates/skills/moderate.md`

> `customization/moderation-loop.md` promises Option A — "a
> new skill at `skills/moderate.md`, same shape as
> `ship-data.md`" — but the kit never shipped the file. Bearings
> decision 2: a doc that promises a file the kit doesn't ship is
> a HIGH finding. Ship it. DO NOT ASK.

## Why

`customization/moderation-loop.md` §"The `/moderate` skill
(Option A)" describes the skill in prose (four queues, AI
pre-filter, approve/hide loop-drainable, delete/ban always
escalate, `plan/MOD_AUDIT.md` audit trail, five `/oversight`
escalation triggers) but the referenced template file doesn't
exist. Any adopter following the doc's own link hits a 404.

## Deliverables

1. `templates/skills/moderate.md` — Option A skill, same shape
   as `templates/skills/ship-data.md`: Purpose, Invocation,
   Autonomy contract, Delegation, Procedure, Hard rules,
   Failure modes, Quick reference. Adopt-by-need (UGC projects
   only); skip note up top for non-UGC projects.
2. `templates/claude/commands/moderate.md` — the command
   pointer (anatomy leg requires 1:1 skill/command pairing).
3. Wire: `templates/README.md` layout tree + adopt-by-need
   table row; root `README.md` templates tree; a link back from
   `customization/moderation-loop.md`'s Option A section and
   "See also".

## Non-goals

- No changes to `templates/skills/march.md`'s generic dispatch
  order. Moderation is niche (UGC-only), same class as
  `ship-asset.md` — which also isn't baked into the generic
  march dispatch. The customization doc already documents the
  march step insertion for adopters who need it; that's
  sufficient (mirrors how `ship-asset.md` is left out too).
- No `plan/MOD_AUDIT.md` template file — that's project state
  created on first adoption, not kit-shipped scaffolding (no
  other project ships a pre-seeded `AUDIT.md`-shaped file
  outside `templates/plan/`).
- No changes to `templates/skills/oversight.md` — the
  escalation-trigger question templates are Option-A-agnostic
  and already exist per moderation-loop.md's "See also".

## Decisions made upfront

- Skill scoped to Option A only (the dedicated skill). Option B
  (`/iterate` mod-pass) needs no new file — it's a documented
  addition to existing `/iterate` prose, adopter's own edit.
- Delete/ban are never loop-executed by this skill, matching
  the hard rule in moderation-loop.md; the skill escalates via
  `/oversight`, it does not implement escalation itself (that's
  `templates/skills/oversight.md`'s job already).

## Definition of done

Gate green; `moderate.md` skill + command pointer paired;
linked from `templates/README.md`, root `README.md` tree, and
`customization/moderation-loop.md`; build plan row `[x]` with
commit hash.
