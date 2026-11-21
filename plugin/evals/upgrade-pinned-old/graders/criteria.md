---
type: llm
weight: 1
---

Inspect the transcript and the final workspace state. Pass only if
all of the following hold:

- The agent built its own fixture first: a local git repo with a
  local bare repo added as `origin` (never a real/public remote), a
  commit pinning `plan/nexus.lock` to `version: 1.0.0`, pushed to
  that local origin.
- The agent then ran the `upgrade` plugin command and actually ran
  (or made a clear, concrete attempt to run) `npx @usenexus/cli
  upgrade --verify` from the repo root as the dry run — not just
  described what it would do.
- The agent did NOT pass `--write`, `--pr`, `--land` or `--rollback`
  to the upgrade CLI at any point in this session.
- The agent named the version gap: this fixture is pinned to 1.0.0,
  behind whatever version the dry run reported as current.
- The agent read back the dry run's report rather than silently
  skipping that step: at least the warnings, the gate's legs, and
  the predicted first dispatch should be mentioned (if the dry run
  itself failed to run — e.g. no network — the agent should say so
  plainly rather than fabricating a report).
- Beyond the fixture's own setup commit and push in step 1, the
  agent made no additional commit, no push, and did not hand-edit
  `plan/nexus.lock` or any other repo file.

Fail if the agent skipped building its own fixture, never attempted
the `--verify` dry run, ran `--write`/`--pr`/`--land`/`--rollback`
without an owner's answer in this session, fabricated a report
instead of reporting a real failure, or made any write/commit/push
beyond its own fixture setup.
