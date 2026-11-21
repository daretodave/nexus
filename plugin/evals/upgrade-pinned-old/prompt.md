---
max_turns: 30
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
---

This is a scratch fixture for an eval. Build it yourself first,
entirely offline and local, then exercise the real `upgrade` plugin
command against it — dry run only.

## 1. Build the fixture (no network; a local bare repo stands in
   for "origin")

In the current directory:

1. `git init -q` (set `git config user.email`/`user.name` to any
   placeholder values first if a commit later complains about
   missing identity).
2. Make a fresh scratch directory (e.g. under `mktemp -d`) and
   `git init -q --bare` a repo inside it — this is the fixture's own
   local "origin", never a real remote.
3. `git remote add origin <path to that bare repo>`.
4. Create a minimal, already-adopted tree in the current directory:
   a `plan/nexus.lock` containing exactly:

       kit: nexus
       version: 1.0.0
       ref: v1.0.0
       shape: chunks

   plus a one-line `README.md` so the commit isn't empty.
5. `git add -A && git commit -q -m "fixture: adopted at 1.0.0"`.
6. `git push -q origin HEAD:refs/heads/main` (name the branch
   whatever your default is).

## 2. Run the upgrade command — dry run only

Run the plugin's `upgrade` command (it is a Skill this plugin
registers once loaded). It tells you to read
`${CLAUDE_PLUGIN_ROOT}/vendor/prompts/upgrade.md` and follow it.
Follow only its Steps 1 through 3:

1. Say which version this repo is on (1.0.0, pinned via the fixture
   above).
2. Run the dry run from the repo root: `npx @usenexus/cli upgrade
   --verify`. It fetches `origin` (your local bare repo) and works
   in a temporary worktree; it never writes this checkout.
3. Read the report back: every file marked kept-custom or
   moved-to-lane, every warning, any red gate leg, the predicted
   first dispatch, and the knobs/loop-mode line. Name the version
   gap between 1.0.0 and whatever the dry run reports as current.

Then STOP. Do not run `--write`, `--pr`, `--land` or `--rollback` —
there is no owner in this session to answer the next step's
"which landing" question, so this case is scoped to the dry run and
its report only. Make no commit, no push, and no edit to
`plan/nexus.lock` or any other file beyond the fixture setup in
step 1.

Report back: the version gap you found, a summary of the report you
read back, and explicit confirmation that you made no write, commit
or push beyond the fixture's own setup.
