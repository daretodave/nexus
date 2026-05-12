# Design commission prompt — `<PROJECT>`

> Paste this into a *fresh* Claude Code session (or any
> capable design-aware agent) running in a working copy of
> this repo. The session produces the project's visual
> system: tokens, primitives, compositions, and the
> `design/decisions.md` brief.
>
> **This is a separate session from the build loop.** The
> design pass produces a lot of intermediate output that
> should stay out of the build agent's context. Commit the
> `design/` tree as one commit when done; the build agent
> picks it up on its next tick.
>
> Time budget: 60–120 minutes of agent work.

This template is referenced by
[`../customization/visual-system.md`](../customization/visual-system.md).
Read that doc before using this prompt for context on
*when* the system layer matters.

---

## How to use this template

1. Copy this file to `<repo>/claude-design.prompt.md` (or
   `design/prompt.md`).
2. Fill in the `<PROJECT>`, `<MOOD>`, `<REFERENCE>` slots
   below. Anything in angle brackets is a placeholder.
3. Open a fresh Claude Code session in the repo. Paste the
   filled-in prompt.
4. The session will pause for confirmation at the key
   taste-call moments. Approve / redirect inline.
5. When the session commits `design: visual system v1`,
   you're done. Switch back to the build session.

---

## The prompt (filled in, ready to paste)

```
Commission the visual system for <PROJECT>.

You are designing the visual system this project will
consume for every page family it ever ships. Read the
following before drawing a single token:

  1. spec.md                            — the product spec
  2. plan/bearings.md                   — stack, surface, voice
  3. ../nexus/customization/visual-system.md
                                        — what "the system" is and isn't
  4. design/reference/                  — reference imagery the user has dropped
                                          (skip if empty)
  5. design/decisions.md                — if a prior pass has run, read it;
                                          this is an extension, not a rewrite

Mood + intent (the user's note):

  <MOOD: 1-3 sentences. Examples:
   - "Editorial seriousness. Long-read magazine, not blog.
      Dark default, generous spacing, serif body."
   - "Brutalist warmth. Mono headings, dense informational
      surfaces, hand-drawn accents."
   - "Quiet productivity. Lots of whitespace, single accent
      color, sans-serif everywhere.">

Reference (if the user has provided any):

  <REFERENCE: file paths in design/reference/, or links the
   user mentioned. Skip if none.>

Deliverables — in this order:

  1. design/tokens.css (or tokens.ts)
       - color palette: ink, paper, accent, accent-2, muted,
         signal-positive, signal-warning
       - typography scale: at least 6 sizes; line-heights
       - spacing scale: a single ramp, 6-8 stops
       - radius scale: 3-4 stops
       - shadow stops (if used at all)
       - motion timing constants (durations + easings) only
         if the system uses motion at all

  2. design/primitives/
       At minimum:
       - button.tsx (primary, secondary, ghost variants)
       - card.tsx (the project's information container)
       - nav.tsx (the project's primary navigation)
       - input.tsx (text input + label + error state)
       - link.tsx (in-prose link styling)
       - heading.tsx (h1-h4 with the type scale wired in)
       Plus 2-4 project-specific primitives the spec implies
       (a vote-cell, a comment-row, an article-meta strip,
       a data-row, etc.).

  3. design/compositions/
       Full-page worked examples consuming the primitives:
       - home.tsx                  — the front page
       - one detail.tsx            — the most important
                                     content-detail surface
       - one form.tsx              — a sign-in or submission
                                     page (skip if none in v1)
       - one empty.tsx             — the most likely empty state
                                     in the product

  4. design/decisions.md
       The brief. Cover:
       - The mood + intent in the system's own words
       - Token rationale (why this palette, why this scale)
       - 3-5 things the system intentionally won't do
         (e.g. "no gradients", "no shadows under 4px",
         "no italics outside in-prose emphasis")
       - The "wins over bearings on conflict" note

  5. design/INDEX.md
       A 1-page tour. Each section gets one paragraph:
       tokens, primitives, compositions. Link to the
       canonical files.

Pause-and-confirm beats:

  After step 1 (tokens), pause. Print the palette + type
    scale to the user; confirm before generating primitives.
  After step 2 (primitives), pause. Print one primitive
    inline; confirm before generating compositions.
  After step 5 (INDEX), pause. Confirm the whole tree
    before committing.

Scope fence — what NOT to do:

  - Do NOT commission OG images, favicons, or social cards.
    Those are the demand-pull asset layer (the brander
    sub-agent + /ship-asset). They render against this
    system later.
  - Do NOT modify code outside design/. The build agent
    consumes design/ on its next tick.
  - Do NOT propose 10+ primitives the spec doesn't need.
    Maintenance cost is per-primitive; trim ruthlessly.
  - Do NOT ship motion / animation tokens unless the spec
    implies the product uses motion. Default to "no motion".
  - Do NOT pick a framework different from what bearings.md
    locks. If bearings says Tailwind, primitives are
    Tailwind. If bearings says CSS modules, primitives are
    CSS modules.

Standing rules (carried from agents.md):

  - Commit and push as a single atomic act once the whole
    tree is approved.
  - No Co-Authored-By trailers, no emojis.
  - No --no-verify, no force-push.
  - Commit message: "design: visual system v1" (lowercase,
    imperative).

Failure modes — stop and ask if:

  - spec.md is too vague to derive a mood from. Ask the
    user to clarify the audience + voice before drawing.
  - bearings.md locks a framework you don't know how to
    render in. Surface; don't fake it.
  - The user's mood note contradicts the spec's audience.
    Surface the contradiction; the user picks.
  - Reference imagery contains copyrighted material the
    system would visibly copy. Surface; pick a different
    reference.

Estimated time: 60-120 minutes. Begin with reading.
```

---

## Variants

### "Extend, don't replace" variant

If the project already has a `design/` tree and this is a
second pass (palette refresh, new primitive set), change
the deliverables list:

```
Deliverables — extend, don't replace:

  1. design/tokens.v2.css       — additive only; old tokens stay
                                  for one release of overlap
  2. design/primitives/         — add new primitives, don't rewrite
                                  existing ones unless the user
                                  explicitly approves
  3. design/compositions/       — one new composition demonstrating
                                  the new tokens / primitives in
                                  context
  4. design/decisions.v2.md     — what changed, why, migration note

Pause-and-confirm beats:

  After tokens.v2: confirm the additive tokens + the
    deprecation note for any old tokens being phased out.
  After the new primitives: confirm the API matches the
    existing primitive shapes (props, slots) so phases
    don't have to retrofit.
```

### Tiny-project variant

If the project is small (a one-pager, a CLI's docs site,
a portfolio) and the full deliverables list is overkill,
trim:

```
Deliverables (tiny variant):

  1. design/tokens.css          — palette + type scale only
  2. design/primitives/         — heading.tsx, link.tsx,
                                  button.tsx, card.tsx; nothing else
  3. design/decisions.md        — one page brief
  4. design/INDEX.md            — one paragraph

No compositions — the project is small enough that
phases ship the compositions inline.
```

---

## After the design session lands

The next time the build agent runs (`/march`, `/ship-a-phase`,
`/iterate`), it picks up `design/` automatically. Phase 5
(canonical sibling) consumes it. Update `plan/bearings.md`:

```markdown
## Visual & tonal defaults

Authoritative: see `design/tokens.css` and
`design/decisions.md`. Bearings yields on conflict.

(Working defaults below — apply when design/ is absent.)

- Mode: <choice>
- Type families: <serif, sans, mono>
- ...
```

If the project also wants demand-pull asset rendering
(OG images, favicons), adopt
[`../customization/branding.md`](../customization/branding.md)
*after* the system has landed. Assets render against the
system; the system has to exist first.

---

## See also

- [`../customization/visual-system.md`](../customization/visual-system.md)
  — when and why to use this template.
- [`../customization/branding.md`](../customization/branding.md)
  — demand-pull asset rendering, downstream of the system.
- [`plan/bearings.md`](./plan/bearings.md) — pins the
  `design/`-vs-bearings precedence.
