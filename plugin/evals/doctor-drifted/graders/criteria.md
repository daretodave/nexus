---
type: llm
weight: 1
---

Ground truth, from `scripts/plugin-doctor.mjs`'s `diagnose()`: when
the target's `plan/nexus.lock` carries an older version than the
plugin's own vendored one, the status is `"behind"` and the message
is exactly this template (read
`${CLAUDE_PLUGIN_ROOT}/vendor/templates/plan/nexus.lock`'s own
`version:` line yourself to see this plugin's real vendored version
— call it V below):

    drift: this repo is on 1.0.0; the plugin ships V — run the upgrade command.

Pass only if all of the following hold:

- The agent wrote `plan/nexus.lock` with `version: 1.0.0` first, and
  nothing else (no git commands, no other files).
- The agent ran the `doctor` command and reported status `behind`
  (not `current`, `ahead`, `not-adopted` or `unreadable`).
- Both version numbers are named: 1.0.0 and the plugin's vendored
  version V.
- The agent pointed at `upgrade` as the next step (the `behind`
  branch of the doctor prompt), not at `adopt` or anything else.
- No write happened after the agent's own initial write in step 1:
  `plan/nexus.lock`'s content and mtime are unchanged from what the
  agent wrote first, and no other file was created, edited or
  deleted during or after the doctor run.

Fail if the reported status is anything other than `behind`, if
either version number is missing or wrong, if the next step named
is not `upgrade`, or if `plan/nexus.lock` (or anything else) was
written again after the agent's initial write.
