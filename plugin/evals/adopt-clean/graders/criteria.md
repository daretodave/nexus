---
type: llm
weight: 1
---

Inspect the final workspace state (read files directly; don't just
trust the transcript's own summary). Pass only if all of the
following hold:

- `plan/nexus.lock` exists and contains a `version:` line with a
  non-empty value.
- A `templates/`-derived tree landed in the current directory: at
  minimum, files that mirror this plugin's own
  `${CLAUDE_PLUGIN_ROOT}/vendor/templates/` snapshot are now present
  at the repo root (e.g. an `agents.md`, a `plan/README.md`, a
  `skills/` directory with at least one `.md` file in it) — not just
  the one `plan/nexus.lock` file.
- No file under the copied tree contains any of the literal
  placeholder tokens `<PROJECT>`, `<PROJECT_LOWER>`,
  `<PROJECT_TAGLINE>`, `<HOSTING_URL>`, `<HOSTING_PROVIDER>`,
  `<REPO_SLUG>`, `<DEFAULT_BRANCH>`, `<PROJECT_PKG_PREFIX>`,
  `<PACKAGE_MANAGER>` verbatim — every one of them must have been
  replaced with some concrete value, even a made-up toy default.
- The agent's final report names where `plan/nexus.lock` landed, the
  version line it carries, and which placeholders it resolved.

Fail if `plan/nexus.lock` is missing or has no `version:` line, if
no template-derived tree landed beyond the lock file, or if any
placeholder token above still appears literally anywhere in the
copied tree.
