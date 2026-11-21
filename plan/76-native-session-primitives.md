# 76 — The reboot train against the runtime's own session calls

> The reboot train parks a running loop to a ledger file and
> resumes it by reading the file back. Agent runtimes now
> offer forking, listing and resuming a session as calls of
> their own. Compare the two honestly: move what the runtime
> does better, and write down why the rest stays a file.

## Why

`/rebooting`, `/reboot-ready` and `/reboot-resume` exist
because a restart used to lose every running loop: each
session writes a ledger (what it was building, its claims,
its worktree), posts a marker, and a new session picks the
ledger up. Field research (2026-11-13) shows runtimes adding
first-class calls to fork a running session, delete one, list
and resume past sessions, and read context-window usage by
category. Part of the ledger contract may now be something
the runtime already holds. Or the file may still be the
better tool, since it survives a crash, a different machine
and a different client. Either way the kit should know which,
and say it.

## Design

- Read the current docs for the runtime the kit targets and
  list what it offers natively: resume by id, list sessions,
  fork, and what state each carries (conversation, working
  directory, worktree, background tasks).
- A comparison in `concepts/` or the reboot skills' shared
  reference: for each thing the ledger records, whether a
  native call restores it, and under which conditions (same
  machine, same client, after a crash).
- Where a native call is strictly better, `/reboot-resume`
  uses it and falls back to the ledger when it is missing.
  The ledger stays the record of claims and worktrees: those
  are the kit's state, not the runtime's.
- The skills stay client-agnostic: a native call is an
  optimization behind a check, never a requirement
  (`agents.md` rule 7, the skill family is public API).
- A pattern is named, never a product.

## Acceptance

- **A1** The comparison is written and discoverable: each
  ledger field, what restores it natively, and when.
- **A2** `/reboot-resume` uses a native resume where one
  exists and the conditions hold, and the ledger otherwise;
  both paths are described in the skill.
- **A3** The reboot skills say why claims and worktrees stay
  in the ledger.
- **A4** Template twins and `CHANGELOG.md` updated for every
  `templates/` path touched.

## Open questions

- Whether a native resume keeps a session's worktree and
  claims session id. If not, A2 shrinks to the conversation
  only, and the comparison says so.

## Chunks
Measure: 4 open · 0 closed · next A5

Not chunked yet.
