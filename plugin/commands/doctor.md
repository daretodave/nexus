---
description: Read-only drift check — this repo's plan/nexus.lock version against the version this plugin install ships (prompts/doctor.md).
---

Read `${CLAUDE_PLUGIN_ROOT}/vendor/prompts/doctor.md` and
follow it exactly. It is nexus's canonical doctor prompt,
vendored into this plugin at build time
(scripts/build-plugin.mjs). Wherever it names a script path
relative to a separate nexus checkout, run the vendored copy
instead: `${CLAUDE_PLUGIN_ROOT}/vendor/scripts/plugin-doctor.mjs`.

Argument: $ARGUMENTS
