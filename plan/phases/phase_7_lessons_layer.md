# Phase 7 — Lessons layer

> Extract kintilla's evolved lessons discipline into the kit.
> Deliverable: one customization doc + two templates + one
> skill amendment. Everything below is decided — DO NOT ASK.

## Why

The kit's current lessons story is a scratch file
(`NEXUS_LESSONS.md`) drained by `/lessons-pr`. Kintilla
evolved it into a two-tier system that demonstrably works at
333-lesson scale: a tiny always-read core ("reflexes") + a
domain-keyed corpus with hard size caps, linted by the gate.

## Deliverables

1. `customization/lessons-layer.md` — the doc. Cover: the
   two tiers (reflexes = ≤50-line always-read core, loaded by
   every skill's Step 0; lessons = domain-keyed corpus read by
   offset, one domain per task); the caps (per-bullet ≤500
   bytes, hard); the promotion path (lesson → reflex when it
   changes behavior weekly); the drain path (reflex → skill
   procedure edit when it becomes structural); staged
   hardening (new caps start as warnings, flip to errors when
   the corpus drains).
2. `templates/plan/reflexes.md` + `templates/plan/lessons.md`
   — seeded with format + 3 example entries each, domain keys
   as `<!-- @domain:x -->` anchors.
3. Amend `skills/lessons-pr.md` (nexus-self) to route drained
   lessons into the two tiers rather than ad-hoc doc edits.
4. Wire: README tree + templates/README + link from
   `concepts/skills-anatomy.md` ("Maintaining skills over
   time" section) and `playbooks/new-project.md` Day-1 list.

## Non-goals

- No lint leg for adopter lessons files in this phase (the
  kit's gate doesn't reach adopter repos); document the
  check.mjs pattern instead.
- No retro-conversion of sibling repos.

## Decisions made upfront

- Names: `reflexes.md` / `lessons.md` (kintilla's names; they
  won in production).
- Caps: 50 lines / 500 bytes — copy kintilla's numbers, note
  they're tunable.
- The doc credits the pattern's provenance (kintilla) the way
  branding.md credits thock/tickpedia.

## Definition of done

Gate green; doc discoverable (linked ≥1 place + tree); both
templates exist; this row `[x]` with the commit hash.
