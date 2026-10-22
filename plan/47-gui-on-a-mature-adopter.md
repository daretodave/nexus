# 47 — The GUI on a mature adopter

> `npx @usenexus/cli` run in a large, long-adopted repo reads
> its plan, its questions and its sessions truthfully, every
> onboarding button does what it says, and a session's report
> reads as a designed page, not a wall of text.

## Why

The owner ran `@usenexus/cli` 0.3.0 end to end in a mature
adopter (2026-10-22): a repo with 60+ specs, vendored kit
scripts under its own paths, its own worktree convention, a
long-running heads-down session holding ~40 claims, and a
root `.env`. Onboarding, the cockpit, Oversight, Plan and
Fleet were each walked. The cockpit's transcript worked; most
other screens misread the repo or called a server route that
does not exist. A review of the same adoption found three
kit-script bugs the adopter had patched locally. The chunks
below fix both.

What exists today: `packages/cli/server/{repo,secrets,
sessions,reorder}.mjs`, `packages/cli/src/screens/
{onboarding/*,cockpit/*,Oversight,Plan,Fleet}.jsx`,
`templates/scripts/{claims,plan/settle,plan/order}.mjs`,
`skills/next.md`.

## Design

- **Every onboarding call is served.** `POST /api/explode`
  (split thoughts into sized ideas, no write), `/api/plot`
  (land kept ideas through a pending file per owner mode),
  `/api/cloud/workflow` (write and commit the loop workflow)
  and `/api/cloud/schedule` exist, each with a server test.
- **The plan is read by the kit, not the adopter.** The CLI
  bundles the kit's own `order.mjs` and runs it against the
  repo, so a repo that never vendored it still gets a board;
  a plan it cannot read says so, never "0 specs".
- **Script lookups share one candidate list** (`scripts/`,
  `scripts/dev/`, `scripts/plan/`) for claims, progress,
  worktree and announce.
- **Questions are questions:** list items under an "Open
  questions" heading in a spec, plus `[needs-user-call]`
  rows; wrapped items read whole; items that open with
  Settled, Decided or Answered are skipped; each carries its
  source (plan, session, cloud run).
- **Messages render:** a markdown renderer for every agent
  message (headings, lists, code, fenced blocks kept
  monospace); a `/plot` report gets its own card (task,
  built / not built / not planned, the chunk card, the build
  order drawn with the new chunk lit, open questions as
  answer cards, Plot / Plot asap / Plot and build now).
  Shell commands in tool rows are syntax-highlighted from
  theme tokens, day and night.
- **Sessions are honest:** one tile per session, idle shown
  as idle, claim holders shown even when not attached, a
  tile's preview shows its last message and chunk; the
  claims rail folds a session's run of chunks into one line.
- **Launch is instant:** the cockpit opens at once and the
  worktree is made behind it; worktrees go where the repo
  keeps them (a configured root, else the kit default).

## Acceptance

- **A2** The secrets step reads a repo whose root `.env` is already the vault as "already the vault: N names" with an offer to write the manifest, and a repo with no vault scripts says so before a file is picked.
- **A3** Onboarding copy and chrome fit an adopted repo: Detect shows the lock's version, the Plot step names the next spec number (never "the first spec"), error toasts sit clear of the footer and link docs, and the orb glyphs (thinking dots, `?`) are centred and coloured to the orb.
- **A4** Open the cockpit navigates at once; the worktree is created behind it with a visible forming state; worktrees go under the repo's configured worktree root.
- **A8** The Plan board works in a repo with no vendored `order.mjs` (the CLI runs its bundled copy), and an unreadable plan shows an honest state, not zeros.
- **A10** Fleet shows one tile per session, idle as idle, a dim tile for a claim holder that is not attached, and each tile's last message and chunk.
- **A11** A reorder from the GUI lands (owner: committed and pushed through settle; contributor: a PR), never an untracked pending file in the GUI's checkout; announce is found under `scripts/dev/` too.
- **A15** The session onboarding's Plot step starts reaches the person: a permission it waits on shows on the Plot, Cloud and Launch steps with Allow inline, and Launch opens that session's cockpit when it is still working.
- **A16** `/api/cloud/workflow` and `/api/cloud/schedule` are served, owner and contributor paths tested; onboarding's Cloud step adds the workflow and saves the schedule with no "not on this server" fallback.
- **A17** Plain text in the composer goes to the session as typed; a guessed route (/bug, /plot) shows as a chip the person can accept, never a command silently prefixed to their words.

## Open questions

(None.)

## Chunks
Measure: 9 open · 8 closed · next A18

- [ ] **47.2** Cloud workflow and schedule served for onboarding · M · closes A16 · needs —
  - Write `march.yml` from the template with the chosen cron; commit per owner mode.
- [ ] **47.3** The secrets step knows an existing vault and a missing one · S · closes A2 · needs —
  - The Vault screen too: a repo with no vault scripts gets an empty state with "Set up the vault" (the CLI's bundled scripts, landed per owner mode), not a red error naming a kit path.
- [ ] **47.4** Onboarding fits an adopted repo · S · closes A3 · needs —
- [ ] **47.5** The cockpit opens at once; worktrees follow the repo · M · closes A4 · needs —
- [ ] **47.9** The Plan board runs the kit's bundled order script · S · closes A8 · needs —
- [ ] **47.11** Fleet tiles are one per session and honest · M · closes A10 · needs —
- [ ] **47.12** Reorders land; script lookups share one list · S · closes A11 · needs —
- [ ] **47.15** Onboarding's plot session's asks reach the person · S · closes A15 · needs —
  - Found checking 47.1 in a scratch repo: the /plot session blocked on its first Bash permission while the person had moved on to the Cloud step.
- [ ] **47.16** The composer suggests a route, never prefixes one · S · closes A17 · needs —
  - Seen checking 47.6 and 47.7: a rendering request went out as `/bug ...` and a plain multi-line message as `/plot ...`.
