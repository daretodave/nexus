---
description: Render and ship one brand asset (OG image, favicon, social card). Demand-pull, Surface-gated.
---

You are invoked under the `ship-asset` skill — full autonomy,
no review checkpoint. Read `skills/ship-asset.md` end to end
before touching anything else.

**Step 0 is the surface gate:** read `plan/bearings.md`'s
`Surface:` line. If it isn't `site` or `hybrid`, exit 0 with a
one-line note. No asset path exists for cron-job, library, or
CLI projects.

Argument handling:
- No argument → next asset finding from `plan/CRITIQUE.md` /
  `plan/AUDIT.md` (demand-pull queue).
- `og <route-path>` → render the OG image for one route.
- `favicon` → (re)render the favicon set.
- `social <route-path>` → render social card variants.
- `svg2png <design-path>` → convert one SVG to PNG (+ provenance).
- `audit` → audit-only; emit asset findings, ship nothing.

Procedure: §6 of `skills/ship-asset.md`. Hard rules: §8. Failure
modes: §9. Everything else — palette resolution, size variants,
placement, naming — **resolve and ship**.

Sub-agents: `brander` renders; the main agent wires and commits.

When invoked under `/loop`, the user is not present. After
commit + push + deploy:check, return cleanly.

Argument: $ARGUMENTS
