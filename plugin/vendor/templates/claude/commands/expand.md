---
description: Read accumulated signals (audit, critique, triage, spec drift, design, data) and propose new candidates (future specs) to plan/CANDIDATES.md. Posture-controlled (bold default).
---

You are invoked under the `expand` skill — the plan-expansion
pass. Full autonomy. Read `skills/expand.md` end to end first.

This skill produces **candidates**, not specs. It does
**not** ship code or modify the plan directly (in default
**bold** posture). Candidates flow into `plan/CANDIDATES.md`;
`/oversight` reviews and promotes.

Posture comes from `bearings.md`:

- **bold** (default) — file candidates to CANDIDATES.md.
- **strict** — exit 0 as a no-op. The user wants the plan
  to stay exactly as authored.
- **autonomous** — write new unchunked specs directly to
  `plan/`. Use only when the loop is deeply trusted.

Argument handling:
- No argument → full pass.
- `audit` / `spec` / `design` → bias toward that signal source.
- `dry-run` → report candidates; do not commit.
- `careful` | `bold` | `promote` → the cap and bar, or (owner)
  this pass writes its picks as specs; `skills/expand.md` §2.

Procedure: §6 of `skills/expand.md`. Hard rules: §7. Failure
modes: §8.

When invoked under `/loop` or `/march`, the user is not present.
After commit + land + deploy:check, return cleanly.

Argument: $ARGUMENTS
