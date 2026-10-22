# 52 — A fresh repo onboards cleanly

> On a repo nexus has never been in, onboarding adopts before
> anything plots, a session stays inside its own repo, and the
> skills run as written in PowerShell.

## Why

A user ran the GUI on a brand-new repo (one commit, "Initial
commit", no nexus files) on Windows, 2026-10-22. Onboarding's
Plot step started its `/plot` session before nexus was adopted:
neither the Plot step nor `POST /api/plot` checks adoption. For
40 minutes the agent had no `skills/plot.md`, no
`scripts/plan/*.mjs`, no `plan/`, so it improvised: it read the
CLI's own files out of the npm cache (`npm-cache\_npx\…`),
shallow-cloned the kit into `Temp\nexus-kit-…`, and read a plan
file in a different repo on the same machine for an example.
Its commands were bash-shaped while the session ran PowerShell:
a worktree was created but the step reported "failed" (an empty
`git config core.hooksPath` exits 1), and two of its builders
failed the same way. The transcript's tool rows overlapped:
"PowerShell", "ToolSearch" and "WebSearch" are wider than the
tool-name column, and those tools fell back to a generic icon.

## Design

- **Adopt first.** The Plot step and `POST /api/plot` refuse an
  unadopted repo (no `plan/nexus.lock` and no `agents.md` /
  `plan/` / `.claude/commands`, the same test Detect uses). The
  step says "nexus isn't in this repo yet" and offers Adopt now
  (the server's existing adopt path, `server.adopt()`), holding
  the kept ideas; once adoption lands the plot runs. Launch
  keeps adopting first, as today.
- **A session stays in its repo.** Hosted sessions get their
  working folder and the repo's worktree root as their allowed
  directories (Agent SDK options); reading or writing anywhere
  else asks, whatever the permission mode, and a denial says
  why. The CLI's own install folder is never a source for an
  agent's procedure.
- **Skills run in PowerShell.** The procedures that run git
  (`/plot`, `/next` and its build/land, worktree steps) call
  the kit's node scripts for multi-step git work instead of
  shell one-liners; no bash-only syntax in steps a session
  runs; an expected non-zero exit (an unset config key) is
  never read as failure. A docs lint flags bash-only syntax in
  skills.
- **Tool rows fit their names.** The tool-name column sizes to
  its longest name (or truncates with a tooltip), and
  PowerShell, WebSearch, WebFetch and ToolSearch get their own
  icons.

## Acceptance

- **A2** A hosted session's allowed directories are its repo and its worktree root; a read outside them asks even in Allow everything, and the card says why. Checked live against a scratch repo.
- **A3** `/plot` and `/next` run end to end in a PowerShell session on Windows with no step reported failed when it worked; the docs lint flags bash-only syntax in skills. Checked live: a `/plot` in a scratch repo from a PowerShell session.

## Open questions

(None.)

## Chunks
Measure: 2 open · 2 closed · next A5

- [ ] **52.2** A session stays inside its repo · S · closes A2 · needs —
- [ ] **52.3** Skills run as written in PowerShell · M · closes A3 · needs —
