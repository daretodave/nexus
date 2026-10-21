# 44 — The README in motion: the GUI in one or two GIFs

> One or two 5–8 second GIFs in the README's GUI section show
> the app doing something remarkable: real interactions over
> pre-populated, complex runs, recorded from scripted demo
> scenarios so they can be re-shot whenever the UI changes.
> The diagrams stay; the GUI doesn't take over the README.

## Why

The README's three doors and diagrams (34.1, 34.2) say what
nexus does. A reader gets excited by *seeing* it: a fleet of
star-named sessions breathing, a question pulling toward you
and the run moving the moment you answer, a bug report
turning into a plotted, built, archived chunk. Still
screenshots of the GUI (taken from the mocked app on
2026-10-21) already looked good; motion is the GUI's point.

The GIFs must not drift from the app. So they are recorded
from scripted scenarios against the real build, not drawn by
hand, and re-recorded with one command.

What exists today (2026-10-21):
- `packages/cli`, ported from the Claude Design export (41.3);
- the scratchpad mock layer from the fidelity reviews, which
  fed the app `/api` fixtures and a one-shot SSE hello;
- `scripts/diagrams.mjs` and its gate leg for the README SVGs;
- no ffmpeg on the owner's machine.

## Design

- **Demo scenarios:** `nexus --demo <scenario>` serves fixture
  data and replays a timed beat script over SSE (sessions,
  agents, tugs, closes), with no repo, no Claude session and
  no network. The fixtures are fictional; no real project is
  named. They are reusable for docs, screenshots and UI
  tests.
- **The recorder:** a dev script that runs a scenario, drives
  the page with Playwright, captures frames at a fixed rate,
  and encodes a palette-optimised GIF in pure JavaScript (no
  ffmpeg).
  - Budget: 5–8 seconds and about 3 MB each.
  - It writes `assets/gifs/<moment>.gif` plus a still poster
    frame for reduced-motion readers.
- **At most two moments** (the owner, 2026-10-21: the
  existing diagrams stay, and the UI must not claim the
  README):
  1. **Fleet to tug (required):** star-named sessions
     breathing on the fleet; fly into vega's cockpit; an agent
     asks, everything hushes and the card pulls into the left
     pane; the owner answers; the stage wakes and the chunk
     drops into the shipped river.
  2. **Bug to archive (optional):** typing "the PDF export
     crashes on long seasons" routes to `/bug`; "Plan it and
     do it"; the board shows the chunk slot in, get claimed,
     build and close.

  Scenarios for fall-and-resume and heads-down exist for
  docs and tests, but are not placed in the README.
- **In the README:** one short GUI section beside the
  `npx @usenexus/cli` door, each GIF with alt text that says
  what happens and a link to its poster. The diagrams are not
  replaced or moved. A gate check confirms every referenced
  GIF exists and stays within budget. The bytes aren't compared, because
  recordings aren't byte-stable.

## Acceptance

- **A1** `nexus --demo <scenario>` serves fixtures and a timed
  beat script with no repo, session or network, with tests.
- **A2** One command records a scenario to a 5–8 second GIF
  and a poster frame, pure JavaScript, within budget.
- **A3** Fleet to tug (and optionally bug to archive) is
  recorded and placed in the README's GUI section with alt
  text, the diagrams untouched, and the gate checks every
  referenced GIF exists and fits the budget.

## Open questions

(None.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **44.1** Demo scenarios: fixtures and a timed beat
  script · M · closes A1 · needs —
- [ ] **44.2** The recorder: Playwright frames to a GIF,
  pure JavaScript · M · closes A2 · needs 44.1
- [ ] **44.3** Fleet to tug (and optionally bug to archive),
  recorded and placed in the README · M · closes A3 · needs 44.2, 41.6, 41.10
