---
description: Adopt nexus into this repo — the vendored copy of nexus's canonical adopt prompt (prompts/adopt.md).
---

Read `${CLAUDE_PLUGIN_ROOT}/vendor/prompts/adopt.md` and
follow it exactly, start to finish. It is nexus's canonical
adopt prompt, vendored into this plugin at build time
(scripts/build-plugin.mjs) so the install never depends on a
separate nexus checkout moving under it.

Argument: $ARGUMENTS
