# Concepts: the design round trip

> When the owner designs in Claude Design, the design is not
> written in the repo; it is written on a canvas, and the repo
> takes it in. The round trip is five moves: a prompt goes
> out, addenda follow as the plan changes, an artifact link
> comes back, the session ingests every board into the repo,
> and a port turns the boards into the app. The handoff in the
> repo is the source of truth from then on: a screen that
> differs from its board is a bug in the screen.

---

nexus's own GUI was built this way on 2026-10-21 (chunk 41.3),
and that run is the model for everything below. The kit's
commands for it arrive in spec 43; until each one lands, the
same moves are done by hand
([`../playbooks/design-handoff.md`](../playbooks/design-handoff.md)
walks both).

It is opt-in. The round trip runs only when the owner is in
the Claude Design flow and hands over a link. A project that
designs another way, or not at all, is untouched.

## Two ways to get a design

The kit knows two paths to a designed product. Both end with
a design in the repo that the build chunks consume rather than
reinvent; they differ in where the design is made and how it
crosses into the repo.

| | In-repo session | Claude Design round trip |
|---|---|---|
| **Seed** | [`../templates/design-prompt.md`](../templates/design-prompt.md), filled in | a paste prompt written from the plan (`/design prompt`, 43.2) |
| **Where it is made** | a fresh Claude Code session in a working copy | Claude Design, on a canvas of boards |
| **What the designer reads** | `spec.md`, `bearings.md`, `design/reference/` | only the prompt and its addenda: it cannot read the repo |
| **What comes out** | `design/`: tokens, JSX primitives, compositions, `decisions.md` | an artifact: one stylesheet, a canvas index, one HTML board per screen or state |
| **How it lands** | the design session commits `design: visual system v1` | the build side reads the artifact link and keeps the export in `design/handoff/` |
| **Who turns it into the app** | build chunks, as they go | one port chunk (L), then re-port chunks per delivery |
| **Changes later** | a new design session | an addendum pasted into the running Claude Design session, then a new delivery |
| **Fidelity** | `/iterate`'s visual-system finding | per-theme fidelity reviews against rendered boards; the port map's check, an opt-in gate leg |

Pick the in-repo session when the design is a system the build
chunks extend piece by piece. Pick the round trip when the
owner wants to see and steer whole screens before any code
exists, and wants them adopted as drawn.
[`../customization/visual-system.md`](../customization/visual-system.md)
covers the system layer both paths feed.

## The five moves

### 1. Prompt out

One paste prompt for Claude Design, written from the plan:
what each screen must show, its states, the roles that see it
(owner or contributor), design system first, no emoji. nexus's
was written on 2026-10-20 by hand. `/design prompt [<scope>]`
(43.2) writes it from the plan's specs and stores it in
`design/prompts/`, numbered, so the addenda know where it left
off.

### 2. Addenda

The plan keeps moving while the design session runs. Each
change worth a board goes over as an addendum: only what
changed since the last prompt, numbered to continue it, pasted
on top of the running session. nexus's vault (spec 42) and a
contributor's local keys reached the canvas this way.
`/design addendum` (43.2) writes them.

### 3. Artifact link

The owner shares the artifact's link. That is the go-ahead:
nothing is held for a second yes. Each later delivery is a new
artifact version behind the same link.

### 4. Ingest

The session reads every board through the Artifact tool and
keeps the export verbatim in the repo, beside a README that
names it the source of truth and logs each delivery: the
artifact version, the new and changed boards, and which chunk
ports each change. A cloud tick has no Artifact access, so a
downloaded folder is the fallback. `/design ingest` (43.3)
adds a manifest (boards, pages, a sha256 per file) under
`design/handoff/<date>/` and plots the port as an L chunk.

### 5. Port

The port is a Workflow, not one long session:

1. **Foundation:** the stylesheet copied verbatim, fonts
   bundled offline, one component per design class, every
   screen a route with a stub.
2. **Screens:** one agent per canvas page, in parallel.
3. **Integrate:** the screens on real data; an endpoint the
   server lacks shows the design's empty state, never made-up
   values.
4. **Fidelity:** one reviewer per theme renders every board
   and the built app and compares them element by element.
5. **Land:** every board pattern the app leaves out or draws
   differently goes in the close, with its reason.

The recipe is a kit Workflow, `scripts/design/port.workflow.js`,
with the board renderer and the screenshot compare beside it in
`templates/scripts/design/`; the handoff's `port.json` records
where each board went, and its check keeps every board ported,
skipped with a reason, or pending a chunk. In the GUI, "Hand off a
design" takes the link and shows each board's port status
(43.6).

## What nexus's run taught

- **Verbatim beats faithful.** The stylesheet ships as
  delivered and changes only with the handoff. Where the
  delivered render is wrong (nexus's element resets outranked
  the component rules, so primary buttons drew pale ink), the
  app repairs it at build time and logs the departure; the
  file stays untouched.
- **Edits to the export are for the gates only.** Two glyphs
  with emoji presentations were swapped for look-alikes so the
  emoji leg holds, and logged in a was/now table. Everything
  else stayed byte for byte.
- **The skip list is part of the close.** Documentation
  boards, frozen demo states, demo data and timers, the design
  tool's own delivery, and boards the tokens already produce
  (every light board, the narrow cockpit) are skipped with a
  reason each, in the close and in the handoff's README.
- **Deliveries keep coming.** Three arrived on the same day.
  Each one splits its changes between the chunks that own
  them: nexus's second went to a re-port (41.10) and the
  vault's chunk (42.8), its third mostly to 42.8 and 42.9,
  with its wording changes riding on 41.10.
- **Static renders miss motion.** The night and dawn reviews
  compared renders; a later live pass (41.6) drove the app in
  a browser for hover, popovers and window sizes, and found
  five more fixes.

## Failure modes

- **Reinterpreting the design.** A port that "improves" a
  board drifts from the source of truth, and the next delivery
  can't be diffed. Adopt every pattern unless it is clearly
  superfluous; log every skip.
- **A delivery nobody logs.** A new artifact version ingested
  without a README entry leaves the next re-port guessing what
  changed. Log the version and the changed boards on ingest.
- **Demo data shipped as data.** Boards carry sample sessions,
  names and timers. Real data replaces them; a missing value
  draws blank or a dash.
- **The design tool's runtime shipped.** Boards use the tool's
  own tags and support script. The port translates them; the
  app never ships them.

## See also

- [`../playbooks/design-handoff.md`](../playbooks/design-handoff.md):
  the round trip step by step, by hand today and by command as
  spec 43 lands.
- [`../customization/visual-system.md`](../customization/visual-system.md):
  the system layer, and the in-repo design session.
- [`../templates/design-prompt.md`](../templates/design-prompt.md):
  the in-repo session's prompt.
- [`../packages/cli/design/handoff/README.md`](../packages/cli/design/handoff/README.md):
  nexus's own handoff: three deliveries, the departures, the
  fidelity passes, the patterns not adopted.
