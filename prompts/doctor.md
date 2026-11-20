# Doctor nexus — agent prompt

> A read-only version check: how far an adopted repo has
> drifted from the version a nexus plugin install (or this
> cloned checkout) actually ships. It never writes anything —
> not `plan/nexus.lock`, not `templates/`, nothing. Point an
> agent at this file directly, or run `/doctor` if you
> installed the Claude Code plugin (`/plugin install nexus`).
> Read it yourself first if you want to know exactly what it
> checks.

---

## The prompt

```
Check this repo's nexus version against the version nexus
itself (or the installed plugin) actually ships. Read-only:
make no writes, no commits, no file edits anywhere — not
plan/nexus.lock, not templates/, nothing.

nexus is at ../nexus (or ./.nexus if submoduled). Run, from
this repo's root:

  node ../nexus/scripts/plugin-doctor.mjs --target .

Read the status word back from its output and act only as
follows — never run the command the status points to yourself:

  - current      — this repo matches the version nexus ships.
                    Nothing to do; say so and stop.
  - behind       — this repo is pinned to an older version.
                    Report both version numbers and point the
                    user at ../nexus/prompts/upgrade.md (or the
                    plugin's /upgrade command).
  - ahead        — this repo is pinned to a newer version than
                    the one compared against (an unreleased or
                    stale comparison side). Report both numbers
                    and stop; there is nothing to fix here.
  - not-adopted  — no plan/nexus.lock found. Point the user at
                    ../nexus/prompts/adopt.md (or the plugin's
                    /adopt command) instead.
  - unreadable   — plan/nexus.lock exists but has no version:
                    line. Report it as a finding; change
                    nothing.

Report the exact version on each side and the status word.
Do not interpret further, do not fix anything, do not touch
plan/nexus.lock or any other file — doctor only reads and
reports.
```

---

## What to expect back

- The two version strings being compared (this repo's,
  nexus's) and the status word: current, behind, ahead,
  not-adopted or unreadable.
- For behind or not-adopted: a pointer to the upgrade or adopt
  prompt — never run automatically.
- No file changes, ever.

## See also

- [`adopt.md`](./adopt.md): a repo with no nexus yet — what
  doctor points to on `not-adopted`.
- [`upgrade.md`](./upgrade.md): a repo pinned to an older
  version — what doctor points to on `behind`.
- [`../scripts/plugin-doctor.mjs`](../scripts/plugin-doctor.mjs):
  the script this prompt runs.
- [`../playbooks/upgrade.md`](../playbooks/upgrade.md): the
  full upgrade runbook `upgrade.md` tells the agent to read.
