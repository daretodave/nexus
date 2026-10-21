# 43 — The Claude Design handoff: prompt out, artifact in

> When the owner designs in Claude Design, nexus writes the
> prompt to paste there, takes the finished artifact link
> back, keeps the export in the repo as the source of truth,
> and ports it at near-exact fidelity: the way nexus's own GUI
> was built.

## Why

nexus's GUI went from a placeholder to a designed app in one
pass on 2026-10-21 (41.3):
- a written Claude Design prompt, with add-ons pasted as the
  plan changed;
- the owner shared the artifact link;
- the session read every board through the Artifact tool and
  kept them in `packages/cli/design/handoff/`;
- a workflow ported it: foundation, screens in parallel,
  integrate, a night and a dawn fidelity review against
  rendered boards, then land with every skipped pattern
  logged.

The owner called the handoff the part that matters most. None
of it is a kit feature yet. It lived in one session's
scratchpad (a stand-in board renderer, mock data, a
screenshot compare).

It is opt-in: it runs only when the owner is in the Claude
Design flow and hands over a link. Projects that design some
other way are untouched.

What exists today (2026-10-21):
- `templates/design-prompt.md` and
  `customization/visual-system.md`, which cover an in-repo
  design session, not Claude Design;
- `packages/cli/design/handoff/`, the first real export, with
  its README and its "Patterns not adopted" list;
- the 41.3 close in `ARCHIVE.md` and `plan/notes.md` (the
  skip list).

## Design

- **Prompt out:** `/design prompt [<scope>]` writes the paste
  prompt for Claude Design from the plan:
  - what the screens must show, the states and the roles
    (owner or contributor), in the voice of the 2026-10-20
    prompt;
  - design system first;
  - no emoji.

  `/design addendum` writes only what changed in the plan
  since the last prompt, numbered to continue it, for pasting
  on top of a running Claude Design session.
- **Artifact in:** `/design ingest <artifact link | folder>`:
  - reads every board through the Artifact tool (a local
    owner session; a cloud tick has no Artifact access, so a
    downloaded folder is the fallback);
  - saves them to `design/handoff/<date>/` with a manifest
    (board list, pages, sha256 per file) and a README naming
    it the source of truth;
  - plots the port as an L chunk.

  Nothing is held: the owner handing over the link is the
  go-ahead.
- **The port recipe, reusable.** The 41.3 workflow becomes a
  kit script and a skill section:
  1. foundation: stylesheet verbatim, fonts bundled, one
     component per design class;
  2. one screen agent per canvas page;
  3. integrate;
  4. one fidelity reviewer per theme;
  5. land with the skip list in the close.

  The board renderer (a stand-in for the design tool's
  runtime) and the app-versus-board screenshot compare move
  from the scratchpad into `templates/scripts/design/`.
- **A fidelity check:** an opt-in gate leg confirms the
  handoff's files still match their manifest and that every
  board is either mapped to a route or component or listed as
  skipped with a reason.
- **In the GUI:** a "Hand off a design" action that takes an
  artifact link and runs `/design ingest` in a session, plus a
  gallery of the handoff's boards with each one's port status
  (ported, skipped with reason, pending).

## Acceptance

- **A1** A concept doc and playbook describe the Claude Design
  round trip (prompt, addendum, artifact link, ingest, port)
  and how it differs from `templates/design-prompt.md`'s
  in-repo session; `customization/visual-system.md` names
  both paths.
- **A2** `/design prompt` and `/design addendum` write a paste
  prompt from the plan, the addendum continuing the last
  prompt's numbering.
- **A3** `/design ingest` takes an artifact link or a folder,
  writes `design/handoff/<date>/` with a manifest and README,
  and plots the port chunk.
- **A4** The board renderer and the screenshot compare live in
  `templates/scripts/design/` with tests, and nexus's own
  41.3 handoff renders through them.
- **A5** The port recipe runs as a Workflow from the skill:
  foundation, screens per page, integrate, per-theme fidelity,
  land with the skip list.
- **A6** An opt-in gate leg checks the handoff against its
  manifest and every board's mapping or skip.
- **A7** The GUI takes an artifact link and shows the
  handoff's boards with their port status.

## Open questions

(None. The owner said on 2026-10-21 the handoff runs only when
they are in the Claude Design flow, by giving a link.)

## Chunks
Measure: 7 open · 0 closed · next A8

- [ ] **43.1** The Claude Design round trip, documented · S ·
  closes A1 · needs —
- [ ] **43.2** `/design prompt` and `/design addendum` · S ·
  closes A2 · needs 43.1
- [ ] **43.3** `/design ingest`: artifact link or folder in,
  handoff and port chunk out · M · closes A3 · needs 43.1
- [ ] **43.4** The board renderer and screenshot compare,
  promoted from the scratchpad · M · closes A4 · needs 43.3
- [ ] **43.5** The port recipe as a Workflow, and the
  fidelity leg · M · closes A5, A6 · needs 43.4
- [ ] **43.6** "Hand off a design" and the board gallery in
  the GUI · M · closes A7 · needs 43.3, 43.5
