# Playbook: the design handoff

> The Claude Design round trip, step by step: write the
> prompt, feed it addenda, take the artifact link back, keep
> the export in the repo, port it, and log every skip. Each
> step names the command spec 43 builds for it and, until
> that command lands, how to do it by hand. Opt-in: run it
> only when the owner is designing in Claude Design.
> [`../concepts/design-round-trip.md`](../concepts/design-round-trip.md)
> is the why; this is the how.

---

## When to adopt / when not

Adopt when the owner wants whole screens drawn and steered in
Claude Design before code, and adopted as drawn. nexus's GUI
went from a placeholder to a designed app this way in one
chunk (41.3).

Skip it when the design is a system the build chunks extend
piece by piece: commission it in-repo with
[`../templates/design-prompt.md`](../templates/design-prompt.md)
([`../customization/visual-system.md`](../customization/visual-system.md)).
Skip it too when the product has no screens worth a canvas.

## What arrives when

| Step | Command | Lands in | Today |
|---|---|---|---|
| Prompt | `/design prompt [<scope>]` | 43.2 | by hand |
| Addendum | `/design addendum` | 43.2 | by hand |
| Ingest | `/design ingest <link or folder>` | 43.3 | by hand, through the Artifact tool |
| Board renderer, screenshot compare | `templates/scripts/design/` | 43.4 | a session's own scratch scripts |
| Port | the port recipe Workflow | 43.5 | a Workflow written for the chunk |
| Fidelity leg | an opt-in gate leg | 43.5 | the handoff README, by review |
| GUI | "Hand off a design", the board gallery | 43.6 | none |

## Step 1 — prompt out (20 min)

Write one paste prompt from the plan. In order:

1. **Design system first:** tokens (colour, type, space,
   radius, elevation, motion), both themes if the product has
   two, then the component classes.
2. **Screens:** for each, what it must show, its states
   (empty, loading, error, the busy one) and the roles that
   see it (owner or contributor, if the project has both).
3. **Constraints:** no emoji (the kit's emoji leg rejects
   them, and some glyphs render as emoji on some systems);
   real copy, not lorem.

Number the sections; addenda continue the numbering. Keep the
prompt in the repo beside where the handoff will live, so the
next addendum knows where it left off. `/design prompt` (43.2)
writes it from the specs.

## Step 2 — addenda, as the plan moves

When a spec lands or changes while the canvas is open, write
only what changed since the last prompt, numbered to continue
it, and paste it on top of the running Claude Design session.
nexus's vault screens and a contributor's local keys reached
the canvas this way, as two later deliveries of the same
artifact. `/design addendum` (43.2) writes them.

## Step 3 — the artifact link

The owner shares the artifact's link. That is the go-ahead:
nothing is held for a second yes, and no chunk waits on one.

## Step 4 — ingest (local session)

Read every board through the Artifact tool: list the
artifact's files, read each, and save them verbatim. A cloud
tick has no Artifact access; there, the owner downloads the
export and the session ingests the folder instead.

What lands, nexus's shape:

| File | What it is |
|---|---|
| the stylesheet (`nexus.css`) | every token and component class; the app copies it verbatim |
| `canvas.json` | the board index, grouped into pages |
| `*.dc.html` | one board each; a light board may only re-import its dark one |
| `README.md` | names the folder the source of truth; logs each delivery |

`/design ingest` (43.3) writes it to `design/handoff/<date>/`
with a manifest (boards, pages, a sha256 per file) and plots
the port as an L chunk. nexus's own handoff predates the
command and sits flat in `packages/cli/design/handoff/`.

Edit a delivered file only to keep a gate green, and log the
edit in a was/now table. nexus swapped two glyphs with emoji
presentations for look-alikes; everything else stayed byte for
byte.

On every later delivery, add a revision entry to the README:
the artifact version, the new boards, the changed boards, the
fixes, and which chunk ports each change.

## Step 5 — the port (one L chunk)

Run it as a Workflow, not one long session. The 41.3 run:

1. **Foundation.** Copy the stylesheet verbatim. Bundle the
   fonts offline (the boards' Google Fonts links never ship).
   Map one component to each design class. Give every screen
   a route and a stub.
2. **Screens.** One agent per canvas page, in parallel. The
   boards' runtime tags (the design tool's templating) are
   translated, never shipped.
3. **Integrate.** Real data only. An endpoint the server lacks
   shows the design's empty state or a dim dash, never the
   boards' demo values; list those endpoints in one place.
4. **Fidelity, one reviewer per theme.** Render every board
   (a stand-in for the design tool's runtime) and every
   screen with fixtures, screenshot both, compare element by
   element. nexus's night pass found the stylesheet's own
   cascade bug and missing box-drawing glyphs; the dawn pass
   found five slips any theme shared (a font the CSP
   refused, four copy and layout misses).
5. **Land.** The close carries the skip list (below), and the
   handoff README carries it too.

The kit Workflow (43.5) runs these five steps from the skill,
with the renderer and the compare from
`templates/scripts/design/` (43.4).

A live pass after the port is worth a chunk of its own: drive
the built app in a browser in both themes for hover,
popovers, motion and smaller windows. nexus's (41.6) found
five fixes the static renders could not.

## Step 6 — the skip list

Every board pattern the app leaves out or draws differently,
with its reason. nexus's categories, a fair starting set:

- documentation boards (colour, type, space, motion sheets);
- frozen demo states (`.is-hover` and the like): real hover
  and focus open the same classes;
- demo data and timers;
- the design tool's delivery (font links, support script);
- boards the tokens already produce (light boards, a narrow
  breakpoint);
- data the server does not carry yet, plotted as chunks;
- authoring slips not copied;
- departures from the delivered render, with the repair.

The fidelity leg (43.5) will check that every board is either
mapped to a route or component or listed here with a reason.

## Step 7 — the next delivery

Ingest it (step 4), log the revision, and split its changes
between the chunks that own them: a re-port chunk for what
changed in screens already built, and the owning spec's chunk
for new screens. nexus's second delivery went to 41.10 (the
re-port) and 42.8 (the vault's UI).

## Hard rules

1. **The handoff is the source of truth.** A screen that
   differs from its board is a bug in the screen.
2. **Adopt every pattern unless clearly superfluous.** Each
   skip is logged with its reason, in the close.
3. **The stylesheet ships verbatim.** Repair a delivered bug
   at build time, not in the file, and log the departure.
4. **Never ship demo data.** A value nobody saw draws blank.
5. **The link is the go-ahead.** No second confirmation.

## Failure modes

- **Ingesting from the wrong version.** The artifact moved on
  while the port ran. Log the version on ingest; diff against
  that one.
- **One agent ports everything.** The context fills with
  boards before the screens are half done. One agent per
  canvas page.
- **Reviewing only the dark theme.** Each theme gets its own
  reviewer; the light tokens can hide contrast slips.
- **A skip without a reason.** The next delivery can't tell a
  choice from an omission. No reason, no skip.

## You're ready when

- [ ] The prompt and every addendum are in the repo, numbered.
- [ ] The handoff folder holds every board, verbatim, with a
      README naming it the source of truth and logging each
      delivery's version.
- [ ] Every screen has a route; every board is ported or
      skipped with a reason.
- [ ] Both themes were reviewed against rendered boards.
- [ ] The close carries the skip list.

## See also

- [`../concepts/design-round-trip.md`](../concepts/design-round-trip.md):
  the five moves, and how the round trip differs from the
  in-repo session.
- [`../customization/visual-system.md`](../customization/visual-system.md):
  both paths to a designed product.
- [`../packages/cli/design/handoff/README.md`](../packages/cli/design/handoff/README.md):
  nexus's own handoff, the worked example.
