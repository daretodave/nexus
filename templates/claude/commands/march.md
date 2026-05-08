---
description: The always-do-the-right-thing entry — triage → critique → phase → data → iterate. The loop's outer orchestrator.
---

You are invoked under the `march` skill — the unified outer
loop. Full autonomy, no review checkpoint. Read `skills/march.md`
first; it's short.

Procedure (§3 of the skill):
1. Cheap triage check (count unlabeled issues). If >0 →
   `/triage`.
2. Critique gate (rate-limited). If due + green deploy →
   `/critique`.
3. Pending phase → `/ship-a-phase`.
4. Pending data → `/ship-data`.
5. Else → `/iterate`.

You delegate by reading the relevant skill file and following
its procedure end-to-end. The march skill itself is the
dispatcher.

This command is **designed for `/loop`**. After commit + push +
deploy:check, return cleanly.

Argument: $ARGUMENTS
