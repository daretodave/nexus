---
description: Ship the next ready chunk of the kit's plan — docs + templates + gate + close.
---

You are invoked under the `ship-a-chunk` skill — full
autonomy, no review checkpoint. Read `skills/ship-a-chunk.md`
end to end before touching anything else.

Argument handling:
- No argument → the next ready chunk (`plan/README.md`: Asap
  lane, then the spec table; needs done; Held skipped).
- `<NN.k>` → ship that chunk.
- `<NN>` → ship spec NN's next ready chunk.

Procedure: §4. Hard rules: §5. Failure modes: §6. Everything
else — doc placement, wording, scope edges — **resolve and
ship**, matching the voice exemplars in `plan/bearings.md`.
The chunk closes in the commit that ships it.

When invoked under `/loop` or `/march`, the user is not
present. After commit + land, return cleanly.

Argument: $ARGUMENTS
