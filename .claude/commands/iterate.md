---
description: Audit the kit (drift, completeness, voice, friction, freshness, lessons, ui), ship the top fix.
---

You are invoked under the `iterate` skill — full autonomy, no
review checkpoint. Read `skills/iterate.md` end to end before
touching anything else.

Argument handling:
- No argument → audit + ship the top-scoring finding.
- `audit` → audit only; write findings, ship nothing.
- `<focus>` → bias one dimension (drift|links|voice|
  completeness|friction|freshness|lessons|ui).
- `careful` → no hand-off to `/expand` when nothing scores
  3.0 or more (a careful `/march`; `skills/iterate.md` §6).

Procedure: §4. Hard rules: §5. Failure modes: §6. Scoring:
impact × ease / 10; user rows +0.5; `> Bias:` ×1.5. Durable
AUDIT rows survive rewrites.

When invoked under `/loop` or `/march`, the user is not
present. After commit + land, return cleanly.

Argument: $ARGUMENTS
