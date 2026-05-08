# Phase <N> — <CANONICAL SIBLING — feature-surface template>

> Agent-facing brief. Concise, opinionated, decisive. Ship
> without asking; document any judgment calls in the commit
> body. **This phase establishes the canonical structure every
> later feature-surface phase mirrors.** Spend extra care here.

## Routes / endpoints / CLI surface (locked in `bearings.md`)

- <surface 1>
- <surface 2>

## Content / data reads

| Helper | Lookup | Use |
|---|---|---|
| <hook / fn> | <call> | <use> |
| ... | ... | ... |

## Components / handlers (in `<components-path>/<family>/`)

- `<Family>Section.tsx` — <description>
- `<OtherSection>.tsx` — <description>

## Cross-links

**In** (already shipped — verify still wired):
- <list>

**Out** (this phase ships these):
- <list>

## SEO / metadata / output schema

<For web: generateMetadata + JSON-LD type. For API: OpenAPI
spec. For CLI: --help output schema.>

## Hero / body / sub-section composition

```
<JSX or pseudocode showing structural composition>
```

## Empty / loading / error states

- **Empty:** <copy>
- **Loading:** <treatment>
- **Error:** <treatment>

## Decisions made upfront — DO NOT ASK

- <Every judgment call resolved>
- ...

## Mobile reflow / responsive

<How the family adapts.>

## Pages × tests matrix

| Page / surface | Unit tests | E2E |
|---|---|---|
| <name> | <list> | <list> |

## Hermetic e2e registration (every page family does this)

Phase 4 shipped the harness. This phase appends an entry to
`apps/e2e/src/fixtures/page-reads.ts`:

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

## Verify gate

```bash
pnpm verify
```

All checks must pass before commit.

## Commit body template

```
feat: <family> phase — phase <N>

- <what shipped>
- Reads from <helpers>
- Cross-links: <summary>

Canonical sibling for every later feature-surface phase.

Decisions:
- <design call 1>
```

## DoD

Flip Phase <N>'s `[ ]` → `[x]` in
`plan/steps/01_build_plan.md`, append commit hash, add to
"Phase log".

## Confirm deploy

```bash
pnpm deploy:check
```

## Follow-ups (out of scope this phase)

- <list>
