# 02 — <CANONICAL SIBLING>

> <The first feature surface, shipped end to end. Its structure
> is the template every later feature-surface spec mirrors.>

Agent-facing spec. Concise, opinionated, decisive. **This spec
establishes the canonical structure every later feature-surface
spec mirrors**, so spend extra care here.

## Why

<What a user can't do today, and what this surface gives them.
What exists today, verified in code, with the date you looked.>

## Design

**Routes / endpoints / CLI surface** (locked in `bearings.md`):

- <surface 1>
- <surface 2>

**Content / data reads:**

| Helper | Lookup | Use |
|---|---|---|
| <hook / fn> | <call> | <use> |

**Components / handlers** (in `<components-path>/<family>/`):

- `<Family>Section.tsx` — <description>
- `<OtherSection>.tsx` — <description>

**Cross-links.** In (already shipped; verify still wired):
<list>. Out (this spec ships these): <list>.

**Composition.**

```
<JSX or pseudocode showing structural composition>
```

**States.** Empty: <copy>. Loading: <treatment>. Error:
<treatment>.

**Responsive.** <How the family adapts at 375px.>

**Hermetic e2e registration** (every page family does this):
append an entry to the harness's page-reads fixture:

```ts
export const pageReads: PageReads = {
  '<route-pattern>': {
    sample: '<a real seed slug>',
    assertions: [
      'renders H1',
      'renders canonical link tag',
      'renders <expected component>',
      'no console errors',
      '375px viewport: scrollWidth - innerWidth ≤ 1',
    ],
  },
}
```

Decisions made upfront (do not ask):

- <Every judgment call resolved>

## Contracts

- **SEO / metadata / output schema.** <For web:
  generateMetadata + JSON-LD type. For an API: the OpenAPI
  shape. For a CLI: the --help output schema.>

## Acceptance

- **A1** <The main surface renders from real data, with unit
  tests for every helper and component.>
- **A2** <The detail / sub-surfaces render, and cross-links in
  and out resolve.>
- **A3** <The e2e registration passes, including the 375px
  reflow check; empty, loading and error states render.>

## Open questions

(None.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **02.1** <Main surface> from real data · M · closes A1 ·
  needs 01.3
- [ ] **02.2** <Detail surfaces> and cross-links · M · closes
  A2 · needs 02.1
- [ ] **02.3** E2e registration, states and reflow · S · closes
  A3 · needs 02.2
