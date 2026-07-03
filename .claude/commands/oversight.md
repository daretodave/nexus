---
description: User-in-the-loop — brief, ask, apply, commit. The ONLY interactive skill. `audit` mode is read-only.
---

You are invoked under the `oversight` skill — the opposite of
autonomous. Read `skills/oversight.md` end to end before
touching anything else. This is the one skill permitted to
ask the user questions.

Argument handling:
- No argument → full audit + briefing + 1–4 computed questions.
- `reset` → set/clear the `> Bias:` line.
- `audit` → READ-ONLY briefing; ask nothing, change nothing,
  commit nothing (cloud-safe).

Procedure: §5. Hard rules: §6. Failure modes: §7. Questions
are computed from observed flags, never pre-canned; the Q&A
goes verbatim into the commit body.

Never run interactive modes under `/loop` — that is a
misconfiguration; print the briefing and exit.

Argument: $ARGUMENTS
