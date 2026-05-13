---
description: Bring the project from tokens-in to deployed app + ticking cloud loop. State-aware, idempotent, never destructive. See skills/bootstrap.md.
---

You are invoked under the `bootstrap` skill. Read
`skills/bootstrap.md` end-to-end before doing anything.

Args (if any) follow this command — possible forms:

- `/bootstrap` — full interactive walk
- `/bootstrap status` — read-only state report
- `/bootstrap with manifest` — manifest-driven
- `/bootstrap <service>` — one service slice
- `/bootstrap rotate <service>` — re-propagate one token
- `/bootstrap cloud-loop` — cloud-loop slice
- `/bootstrap continue` — resume from last incomplete state

The skill file is authoritative for the procedure. This
command is a pointer.

`AskUserQuestion` is permitted in this skill — bootstrap is one
of two skills (the other is `/oversight`) that may pause for
user input. Use it sparingly; the manifest flavor exists to
minimize prompts.

Never invoke `/bootstrap` under `/loop` or `/march`. It runs on
explicit user request only.
