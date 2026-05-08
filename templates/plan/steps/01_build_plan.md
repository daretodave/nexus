# 01 — Build plan

> Style guardrails for every phase below. Always ship unit tests
> alongside code — never "add tests later". Break work into
> small, focused components in folders. Pure helpers go in their
> own modules with their own tests. Prefer 5 small files with
> clear names over 1 dense file.

## Status (at-a-glance)

`/march`, `/ship-a-phase`, and (transitively) `/loop` read this
block to find the next phase. Format: `[ ]` pending → `[x]`
shipped (with commit hash). Tick in this file in the same
commit that ships the phase.

> **Replace this section with your project's actual phases.**
> The structure below is one shape (substrate + page families
> + cross-cutting); adapt to your domain. Aim for 10–20 phases.

**Substrate (phases 1–<N>):**
- [ ] Phase 1 — Bootstrap (project init, base layout, design
      tokens, verify gate green)
- [ ] Phase 2 — <Data layer setup, if applicable>
- [ ] Phase 3 — <Content layer setup, if applicable>
- [ ] Phase 4 — <Contract scaffolding + hermetic e2e infra>

**Feature surfaces (phases <N+1>–<M>):**
- [ ] Phase 5 — <CANONICAL SIBLING — the structural template>
- [ ] Phase 6 — <next surface>
- [ ] Phase 7 — <next surface>
- ...

**Cross-cutting (phases <M+1>–<end>):**
- [ ] Phase <X> — Search (if applicable)
- [ ] Phase <X+1> — Polish (404, about, sources, footer, OG, a11y)
- [ ] Phase <X+2> — Performance + meta

> **After phase <end>:** the loop transitions to `/iterate` —
> content gaps, data gaps, link rot, ongoing audits. `/march`
> makes that transition automatic.

> **Note on deploys before phase 1 ships:** auto-publishing
> stays on; deploys will fail until the bootstrap lands. The
> deploy gate (`pnpm deploy:check`, run as Step 12 in every
> shipping skill) reports the failure clearly. Phase 1's first
> push trips it; the patch loop within phase 1 iterates to a
> green deploy.

---

## Per-phase scope

Each row above corresponds to one phase. The detailed brief
lives at `plan/phases/phase_<N>_<topic>.md`. If a brief is
missing when the loop reaches its phase, the loop generates one
from the scope below + canonical sibling + any
`design/<family>/` export.

### Phase 1 — Bootstrap

<Concise scope description. Detailed brief:
`phase_1_bootstrap.md`.>

### Phase 2 — <topic>

<Concise scope description.>

### Phase 3 — <topic>

<...>

### Phase 5 — <CANONICAL SIBLING>

<This phase establishes the structural template every later
feature-surface phase mirrors. Spend extra care here. Detailed
brief: `phase_<N>_canonical.md`.>

<...continue for each phase...>

---

## Carry-overs / known gaps (update as phases ship)

(Empty until phases ship. Add `[-]` rows for partial-but-shipped
phases with linked notes here.)

## Phase log (commit hashes)

(Empty until phase 1 ships. One line per shipped phase, format:
`phase <N> — <commit hash> — <one-line summary>`.)
