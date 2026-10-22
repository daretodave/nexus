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

- **A3** Onboarding copy and chrome fit an adopted repo: Detect shows the lock's version, the Plot step names the next spec number (never "the first spec"), error toasts sit clear of the footer and link docs, and the orb glyphs (thinking dots, `?`) are centred and coloured to the orb.
- **A15** The session onboarding's Plot step starts reaches the person: a permission it waits on shows on the Plot, Cloud and Launch steps with Allow inline, and Launch opens that session's cockpit when it is still working.

## Open questions

(None.)

## Chunks
Measure: 2 open · 15 closed · next A18

- [ ] **47.4** Onboarding fits an adopted repo · S · closes A3 · needs —
- [ ] **47.15** Onboarding's plot session's asks reach the person · S · closes A15 · needs —
  - Found checking 47.1 in a scratch repo: the /plot session blocked on its first Bash permission while the person had moved on to the Cloud step.
