---
max_turns: 30
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
---

The current directory is a clean scratch repo: nothing has adopted
nexus yet (no `plan/nexus.lock`, no copied `templates/` tree). You
are proving the plugin's `adopt` command for an eval, not performing
a real adoption, so adapt its instructions to this toy, offline,
non-interactive setting rather than blocking on anything a real
adoption would ask a human for.

Run the plugin's `adopt` command (it is a Skill this plugin
registers once loaded). It will tell you to read
`${CLAUDE_PLUGIN_ROOT}/vendor/prompts/adopt.md` and follow it
exactly. That file assumes a sibling `../nexus` checkout and a human
to answer questions — neither exists here, so adapt as you go:

- Wherever it points at `../nexus/<path>`, read the same file from
  this plugin's own vendored copy instead:
  `${CLAUDE_PLUGIN_ROOT}/vendor/templates/<path>` for anything under
  `templates/`, `${CLAUDE_PLUGIN_ROOT}/vendor/prompts/<path>` for the
  three prompts. Skip reading anything it names that has no vendored
  counterpart (e.g. `README.md`, `concepts/`, `playbooks/`,
  `customization/` live in the real kit repo, not in this plugin) —
  you don't need them to land the template tree.
- There is no human in this session: do not block waiting for an
  answer. Pick sensible toy defaults yourself — single-repo
  topology, owner mode, a placeholder project name and tagline of
  your choosing, `main` as the default branch, `npm` as the package
  manager — and proceed.
- Skip anything that needs network access or a real git remote:
  installing hooks, running `gh`, committing and pushing. This case
  only needs the copy-and-replace step to land on disk.

Concretely: copy `${CLAUDE_PLUGIN_ROOT}/vendor/templates/` into the
current directory, then replace every placeholder token
(`<PROJECT>`, `<PROJECT_LOWER>`, `<PROJECT_TAGLINE>`, `<HOSTING_URL>`,
`<HOSTING_PROVIDER>`, `<REPO_SLUG>`, `<DEFAULT_BRANCH>`,
`<PROJECT_PKG_PREFIX>`, `<PACKAGE_MANAGER>`) with the defaults you
picked above, everywhere they appear in the copied tree.

When done, report: where `plan/nexus.lock` landed, what version line
it carries, which placeholders you resolved and to what values, and
confirm no bracketed placeholder token remains
anywhere in the copied tree.
