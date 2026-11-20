---
description: Ship the next ready chunk of the plan end-to-end and close it (loop-friendly, autonomous)
---

You are invoked under the `ship-a-chunk` skill — full autonomy,
no review checkpoint. Read `skills/ship-a-chunk.md` end to end
before touching anything else; that file is the single source
of truth for this command. The user's standing instruction is
**"more get-it-done, less ask me questions."** Decide instead
of asking; document the call in the commit body.

Argument handling:
- No argument → ship the next ready chunk (pick order in
  `plan/README.md`: Asap lane, then table order; needs done;
  Held skipped).
- `<NN.k>` → ship that chunk.
- `<NN>` → ship spec NN's next ready chunk.
- `<NN.k> dry-run` → read and plan, no code commit.

Procedure: §6 of `skills/ship-a-chunk.md`. Hard rules: §7.
Failure modes: §10. Everything else — empty data, design
ambiguity, an unchunked spec — **resolve and ship**. The chunk
closes in the same commit that ships it: line out, A-IDs out,
Measure fixed, one line in `plan/ARCHIVE.md`.

Be bold about delegating: spawn `scout` for external research,
domain specialists for prose / schema work. Main agent's job is
wiring + decisions.

When invoked under `/loop` or `/march`, the user is not present.
After commit + land + deploy:check, return cleanly.

Argument: $ARGUMENTS
