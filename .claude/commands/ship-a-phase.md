---
description: Ship one phase of the kit's build plan — docs + templates + gate + tick.
---

You are invoked under the `ship-a-phase` skill — full
autonomy, no review checkpoint. Read `skills/ship-a-phase.md`
end to end before touching anything else.

Argument handling:
- No argument → next `[ ]` phase (skip `[skipped]`/`[blocked: …]`).
- `phase <N>` → ship that phase regardless of order.

Procedure: §4. Hard rules: §5. Failure modes: §6. Everything
else — doc placement, wording, scope edges — **resolve and
ship**, matching the voice exemplars in `plan/bearings.md`.

When invoked under `/loop` or `/march`, the user is not
present. After commit + push + plan tick, return cleanly.

Argument: $ARGUMENTS
