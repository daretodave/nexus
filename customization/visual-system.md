# Customization: visual system

> The difference between *brand assets* and a *visual
> system*. The default
> [`branding.md`](./branding.md) customization covers
> demand-pull asset rendering — OG images, favicons, social
> cards. This doc covers the layer below: the **system**
> those assets render against — primitives, palette
> contracts, type pairings, page compositions.
>
> When the project has a coherent visual identity worth
> preserving across phases, build the system first. Assets
> are downstream.

A project doesn't need this customization. Many ship fine
on a starter theme (Tailwind defaults, shadcn/ui, a
purchased UI kit). Adopt this when the visual identity is
*itself* a product feature.

---

## Assets vs. system

| | **Assets** | **System** |
|---|---|---|
| **Unit** | one OG image, one favicon, one wordmark | a palette + type scale + primitives + a worked-example page |
| **Lifecycle** | render on demand from a finding | designed once, extended across phases |
| **Skill** | `/ship-asset` (demand-pull, per-tick) | (none — pre-built; loop reads `design/`) |
| **When to invest** | once the project has a visible surface that needs sharing | when the visual identity is a deliberate part of the product |
| **Owner** | the `brander` sub-agent + assets findings | a one-off design-focused Claude session (separate from the build session) |

If your project doesn't have a strong visual identity, you
don't need the system layer. Ship on a starter theme; let
`/iterate` pick up minor visual debt as findings.

If your project *does* have a strong visual identity (a
content site whose look is its voice, a portfolio, a brand
showcase), the system is load-bearing. The assets render
against it; the phases consume it.

---

## What "the system" delivers

The output of a visual-system commission is a written set
of artifacts that lives in `design/` of the consuming
project:

```
<repo>/
├── design/
│   ├── INDEX.md             # what's in here, in order
│   ├── decisions.md         # the design brief — wins over bearings on conflict
│   ├── tokens.css           # CSS custom properties (or .ts for design-tokens-cli)
│   ├── primitives/          # JSX/HTML examples of the atomic primitives
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── nav.tsx
│   │   └── ...
│   ├── compositions/        # full-page worked examples
│   │   ├── home.tsx
│   │   ├── article.tsx
│   │   └── ...
│   └── assets/              # source SVGs, sigil, source files
│       ├── wordmark.svg
│       └── sigil.svg
```

`bearings.md`'s "Visual & tonal defaults" section points at
`design/tokens.css` and `design/decisions.md` as
authoritative. The build phases consume from
`design/primitives/` and `design/compositions/` as the
canonical shape — they don't re-invent.

The system landing is **a deliverable**, not a phase. It's
async: the user commissions it via a design-focused Claude
session, the design lands as a commit, and the next phase
consumes it. The loop does not block on design.

---

## How to commission a visual system

Use [`../templates/design-prompt.md`](../templates/design-prompt.md)
as the seed. Customize the working name, the audience, and
the mood notes, then paste into a *separate* Claude Code
session (or any agent that can read repo state + write
JSX). Best practice: run that session in a working copy of
your project repo, *not* the same session running phases —
the design pass produces a lot of intermediate output that
should stay out of the build agent's context.

The design session's contract:

1. Read `spec.md` + `bearings.md` + any reference images in
   `design/reference/`.
2. Propose primitives + tokens. Pause for confirmation
   *before* committing — taste calls land here.
3. Once confirmed, generate `design/primitives/*.tsx` and
   `design/tokens.css`.
4. Generate `design/compositions/*.tsx` — at least the
   home page, one content-detail page, and one form page.
5. Write `design/decisions.md` — the brief, the rationale,
   the things the system intentionally won't do.
6. Write `design/INDEX.md` — a 1-page tour of the system.
7. Commit and push the whole `design/` tree as a single
   commit: `design: visual system v1`.

The build session, on next tick, picks up `design/` and
proceeds.

---

## How the system feeds the build plan

The system is typically commissioned **after Phase 1**
(substrate ships) and **before Phase 5** (the canonical
sibling — the page family every later phase mirrors).
Place it at Phase 4 in a typical 17-phase plan:

```
Phase 1: bootstrap (substrate, deploy gate)
Phase 2: data foundation
Phase 3: content layer (MDX, schemas)
Phase 4: visual system (commission, land design/)   ← here
Phase 5: canonical sibling (first page family)
Phase 6+: page families consume primitives
```

If the visual identity is so central that Phase 5 can't
ship coherently without it, move the design landing
*before* Phase 4 substrate completion. The trade-off:
substrate is generic; design is specific — moving design
too early forces design decisions before the substrate
demands them.

---

## How `/iterate` extends the system

The visual system is **not** static. Over time:

- New page families need new compositions. Add to
  `design/compositions/`.
- New primitives emerge (a tooltip, a tag, a callout). Add
  to `design/primitives/`.
- Token scale gets refined. Update `tokens.css` and
  audit consuming components.

`/iterate` should treat visual-system drift as a finding
category. The audit pass includes:

> **Visual-system fidelity.** Walk the canonical URL set.
> For each unique component used, check it has a matching
> entry in `design/primitives/`. Flag components that
> diverged from the canonical primitive (color drift, type
> scale drift, spacing drift). Score normally.

The fix is one of: update the consuming code to match the
primitive, update the primitive to match what shipped (if
the divergence is an intentional evolution), or surface to
`/oversight` if it's a taste call.

---

## When the system isn't enough — `/oversight` brand pass

If the system needs a refresh — a palette evolution, a
typography redirection, a wordmark update — the user runs
`/oversight` with a branding focus. `/oversight` reads the
current state of `design/`, asks targeted questions about
direction, and emits concrete asset-render rows to
`plan/AUDIT.md` (per
[`branding.md`](./branding.md)). The next `/iterate` or
`/ship-asset` ticks drain them.

The system itself — new primitives, new compositions — is
typically a new design session (a Claude Code commission)
rather than a `/iterate` change. The system is too
load-bearing to evolve via per-finding fixes.

---

## Hard rules

1. **`design/` wins over `bearings.md` on conflict.** If
   `design/decisions.md` says "use serif for body," that
   beats `bearings.md`'s visual-defaults section. Update
   bearings to match; don't let drift accumulate.
2. **No design system in `bearings.md` itself.** Bearings
   has a section listing pointers (mode, families, palette
   names) — the system lives in `design/`. Bearings is for
   pins; design is for system.
3. **One commit lands the system.** Not a phase, not a
   trickle of finds. The system arrives as a single
   commit: `design: visual system v1`. Easier rollback.
4. **The build loop does not commission design.** The
   commission is a separate session. The build loop reads
   `design/` and consumes; it does not generate the
   system.
5. **Primitive divergence is a finding, not a
   workaround.** If a phase needs a primitive that doesn't
   exist, file an audit finding to add it, then use the
   closest existing primitive. Don't ship a one-off
   `<Button2>` that looks like `<Button>`.

---

## Failure modes

- **Design session over-commits.** The session produces
  20 primitives the project never needs. Trim aggressively
  before committing — the system pays maintenance cost per
  primitive.
- **Design and substrate disagree on framework.** The
  design session emitted Tailwind, the project ships
  CSS-modules. Resolve before the commit lands — usually
  by re-doing the primitives in the chosen framework, not
  by retrofitting.
- **Tokens drift after Phase 5.** Phases 6+ start adding
  ad-hoc colors / spacing. `/iterate` catches as fidelity
  findings; the fix is consuming-code update, not new
  tokens.
- **The design session asks for a feature spec.** Hand off
  cleanly — the design session reads `spec.md`, not invents
  it. If `spec.md` is too vague, run `pre-spec.md` first
  and *then* commission design.

---

## Adopting the customization — checklist

For a project that wants the system layer:

1. Decide whether the project's visual identity is a
   product feature. If not, skip this customization.
2. Add Phase 4 (or wherever it fits) to the build plan:
   "Visual system commission — see
   `customization/visual-system.md`."
3. Copy [`../templates/design-prompt.md`](../templates/design-prompt.md)
   to `<repo>/claude-design.prompt.md` (or `design/prompt.md`).
   Customize.
4. When ready, open a fresh Claude session in a working
   copy. Paste the design prompt. Let it run.
5. Review the commit. Merge to main.
6. Resume the build loop. Next phase consumes `design/`.

---

## See also

- [`./branding.md`](./branding.md) — the demand-pull asset
  layer. Renders against the visual system.
- [`../templates/design-prompt.md`](../templates/design-prompt.md)
  — generic prompt skeleton for the design commission
  session.
- [`../templates/plan/bearings.md`](../templates/plan/bearings.md)
  — "Visual & tonal defaults" section pins the
  `design/`-vs-bearings precedence.
- [`../playbooks/pre-spec.md`](../playbooks/pre-spec.md) —
  Batch 3 Q2 (visual system depth) decides whether to adopt
  this customization at pre-spec time.
