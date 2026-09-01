---
description: Pause autonomy. Audit, brief, ask targeted questions, adjust the plan, push. The user-in-the-loop command.
---

You are invoked under the `oversight` skill — the **opposite of
autonomous**. The user has paused the loop (or never started one)
to course-correct. Read `skills/oversight.md` end to end first.

This is the general-purpose skill that uses `AskUserQuestion`
(`bootstrap` carries the one narrow provisioning exception). The
other shipping skills decide and ship; this one observes,
briefs, asks, adjusts.

Argument handling:
- No argument → full audit + general questionnaire.
- `phase` → bias toward phase progress + scope.
- `content` → bias toward content / `/iterate` findings.
- `deploy` → bias toward CI/CD signal.
- `reset` → bias toward scope reduction.

Procedure: §6 of `skills/oversight.md`. The skill writes plan
adjustments only — it does **not** modify code in shipped paths.
Adjustments commit as `oversight: <summary>` and push.

If invoked under `/loop`, that's a misconfiguration — stop and
tell the user.

Argument: $ARGUMENTS
