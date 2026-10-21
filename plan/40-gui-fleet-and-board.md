# 40 — GUI: the fleet, the plan board, git and Actions

> One `npx @usenexus/cli` hosts every session in the repo; its
> home is a fleet of live tiles; the plan, the claims, git and
> the cloud loop each have a panel that reads the kit's own
> scripts, never a second copy of their rules.

## Why

`@usenexus/cli` 0.1.0 drives one session well (cockpit,
stage, oversight, a claims list, an Actions checklist). The
owner runs two or three `/heads-down` sessions at once, from
the GUI and from terminals, and needs to see all of them, the
plan they drain, who holds what, and the git state under each,
without leaving the page.

What exists today (2026-10-20): `packages/cli/server/
{server,hub,provider,repo,gh,preflight,sh}.mjs`, one SSE
stream, screens for cockpit, heads-down, oversight, claims
and actions; `scripts/ledger.mjs`, `announce.mjs`,
`worktree.mjs list --json`, `plan/order.mjs`,
`claims.mjs list|audit --json`.

## Design

- **Many sessions, one server:** each session has its own SDK
  `query()`, claims session id (`NEXUS_SESSION`, plus
  `NEXUS_GH_LOGIN` so `whoami` never calls out), worktree and
  SSE channel (`/api/events?session=<id>`); deep links
  `/s/<id>`. A second launch finds the first through
  `.nexus/server.json` (port, token) and opens it.
- **Fleet home:** a tile per session from
  `.nexus/sessions/*.json`: star name, orb, chunk, phase track
  (Questions, Working, Questions, Package), mini progress.
  Terminal sessions read-only. A fallen tile offers Resume
  (`/reboot-resume`). The inbox merges every session's
  questions, tagged.
- **Plan board:** an all-chunks view in `order.mjs --json`
  order (just-plotted chunks marked) and a spec view with %
  done (pending closes count) and "Chunk it" on an unchunked
  spec. Sort by next up, spec, size, claimed. A chunk without
  a description gets a one-line Haiku summary cached in
  `.nexus/cache/`, marked as AI, never written to the plan.
- **Claims:** grouped by person and session; claim, release,
  hold; owner assigns (`claims assign`) and reassigns anyone's;
  protected claims offer "request claim" (a GitHub issue).
- **Git:** per session the branch, worktree, ahead/behind,
  dirty and staged, last five commits, PR and checks, claims
  held; a repo panel with every worktree (`worktree.mjs list
  --json`: idle, orphaned, a `/tidy` dry run), main's recent
  commits, open PRs, the primary checkout's state.
- **Actions:** pause/resume the loop and "run one pass now"
  (`gh workflow run`); step-level status (`gh run view --json
  jobs`) with a stall per step; the permission check accepts
  least-privilege defaults instead of demanding `write`.
- **Tugs and explode:** owner lines go through `announce.mjs`;
  explode calls `/messy` and renders each theme as a card
  with its `/plot` line.
- **Headless:** `npx @usenexus/cli run "<prompt>"` (one turn,
  JSON out, no browser).
- **Recover:** point the GUI at a Workflow transcript folder;
  it reads `journal.jsonl`, shows which agents finished and
  what they returned, and offers resume.

## Acceptance

- **A1** One server hosts N sessions with their own channels
  and deep links; a second launch reuses it.
- **A2** The fleet home shows every session (GUI and terminal)
  by star name, and a fallen one resumes from its tile.
- **A4** Chunks without a description show a cached, marked
  AI summary; the plan is never written.
- **A5** The claims panel groups by person and session, and
  claims, releases, holds, assigns and requests.
- **A6** Every session and the repo show their git state, and
  the tidy dry run lists idle worktrees.
- **A10** The GUI resumes a Workflow from its transcript
  folder.
- **A11** Run mode and owner mode live in
  `.nexus/local.json`, read and written through
  `/api/local` by Settings and the cockpit alike.
- **A12** The board's grip reorders chunks within a spec,
  and Reassign picks its target from the claimants.

## Open questions

(None.)

## Chunks
Measure: 8 open · 4 closed · next A13

- [ ] **40.1** One server, many sessions, deep links, a reused
  launch · M · closes A1 · needs —
- [ ] **40.2** The fleet home: star tiles, merged inbox,
  Resume · M · closes A2 · needs 40.1
- [ ] **40.4** Cached AI one-liners for undescribed chunks ·
  S · closes A4 · needs —
- [ ] **40.5** The claims panel: group, hold, assign, request
  · M · closes A5 · needs 40.1
- [ ] **40.6** Git per session and the repo's worktree panel ·
  M · closes A6 · needs 40.1
- [ ] **40.10** Recover from a Workflow transcript folder · M
  · closes A10 · needs 40.1
- [ ] **40.11** `/api/local`: run mode and owner mode, one
  writer · S · closes A11 · needs 40.1
  - Settings reads run mode through `/api/prefs` today and the
    cockpit's run-mode menu writes prefs directly; both move
    to `ui/run-mode.js` over `/api/local`.
- [ ] **40.12** The board's grip reorders; Reassign picks a
  target · M · closes A12 · needs 40.5
  - The grip is drawn but inert in 41.3. A reorder lands as a
    pending edit in contributor mode.
