---
description: Drop a quick observation into plan/CRITIQUE.md so the next /iterate tick acts on it. The user-input quickfire — decide-and-ship in seconds, no questions back.
---

You are invoked under the `jot` skill — full autonomy, no
review checkpoint. Read `skills/jot.md` end to end before
touching anything else; that file is the single source of
truth for this command.

The user has spotted something on the live site (or in the
build, or in the data) and wants to capture it before they
forget. Your job: file one row to `plan/CRITIQUE.md`, commit,
push, exit. Target end-to-end <10 seconds.

Argument handling:
- Free-text observation is the body. Required.
- `--url <path>` → URL the user was on (default: `unspecified`).
- `--severity high|med|low` → severity (default: `med`).
- `--category <cat>` → explicit category override (default:
  inferred from observation text per §4 heuristics).
- `--authenticated` → mark `auth_state: authenticated`
  (default: `anonymous`).

Hard rules:
- **Never ask questions back.** The user provided the input;
  decide the rest. Hard rule #6 (only `/oversight` asks)
  stands.
- **No verify gate, no deploy gate.** No code change; nothing
  to verify or deploy.
- **Atomic commit + push.** Otherwise the cloud loop can't
  see the new finding.
- **`source: user` on the row.** Never spoof for non-user
  entries.
- **Commit subject is lowercase `jot:`** followed by a ≤70
  char summary.

Procedure: §4 of `skills/jot.md`. Failure modes: §7. Hard
rules: §6.

After the push, print one short confirmation line and exit.
The next `/iterate` (or `/march`) tick will score the new
row; user-source findings carry a +0.5 score bump (capped at
10) so they typically beat auto-detected findings at the same
severity.

If the user wants the jot acted on **right now**, they can
follow with `/iterate` directly — the new row will almost
certainly win the next pass.

Argument: $ARGUMENTS
