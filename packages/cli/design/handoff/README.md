# The Claude Design handoff

The nexus GUI's design, as delivered by Claude Design on
2026-10-21. This folder is the **source of truth for the UI**:
fidelity reviews diff the app against it, and a screen that
differs from its board is a bug in the screen, not in the board.

- `nexus.css`: every token (colour, type, space, radius,
  elevation, motion, night and dawn) and every component class.
  The app's stylesheet, `src/styles/nexus.css`, is a verbatim copy;
  change both together, or neither.
- `canvas.json`: the index of boards, grouped into pages
  (design system, fleet, cockpit, views, onboarding).
- `*.dc.html`: one board each. A `*Light.dc.html` board only
  re-imports its dark board with `theme="light"`.

The boards are the design tool's documents, not app code. Their
`<x-dc>`, `<helmet>`, `{{holes}}`, `<sc-for>`, `<sc-if>` and
`<dc-import>` tags are its runtime; the app translates them to
React (`src/ui/`, `src/screens/`) and never ships them. The
boards link `./support.js` and Google Fonts, neither of which is
here: the app bundles its fonts offline (`@fontsource`).

This folder is not in the npm package (`package.json` `files`).

## Revisions

1. **2026-10-21, first delivery:** the design system, fleet,
   cockpit, views and onboarding (ported in 41.3).
2. **2026-10-21, second delivery** (artifact version
   1792601423-1084):
   - **New boards:** `Vault`, `VaultImport`, `VaultContributor`
     and `VaultKit` (the vault), `Secrets` and
     `SecretsContributor` (onboarding step 4 of 7), and
     `BoardOwnerAll` (owner, All chunks, with a "Waiting on a
     secret" section). Each has a `Light` board too, and
     `ControlsLight` arrived as well.
   - **Changed boards:** `Inbox` (the secret key card),
     `Board`, `CloudLoop` (the loop's sign-in card), `Fleet`,
     `FleetKit`, `GitPanel`, `Recover`, `Settings`,
     `PlanKit`, and the onboarding boards `Welcome`,
     `Detect`, `Shape`, `Plot`, `CloudSetup` and `Launch`.
   - **Fixes:** every component sheet had been cutting off
     about 140px on the right and at the bottom; the owner
     cockpit's composer was clipped by 11px; some values
     picked up their label's style.
   - `canvas.json` and `nexus.css` both changed.

   The vault work is ported in 42.8; everything else is
   re-ported in 41.10.

## Changes from the delivered files

One edit, so the kit's emoji gate holds: two glyphs in
`HeadsDown.dc.html` have emoji presentations on some systems, so
they are swapped for look-alikes without one (the gate now rejects
the originals; `scripts/verify.mjs`, the emoji leg).

| Was | Now | Where |
|---|---|---|
| U+25C0 (black left-pointing triangle) | U+25C2 (the small one) | the "has 4 questions waiting" pointer |
| U+25AA (black small square) | U+25A0 (black square) | the context legend swatches |

Everything else is byte for byte as delivered.

## How the app departs from the delivered render

Two places where the app draws what the handoff means rather than what
its own render shows, both found in the night fidelity review:

- **The element resets' cascade.** `nexus.css` resets
  `.nx button, .nx input, .nx textarea, .nx select` to `font: inherit;
  color: inherit` and draws `.nx :focus-visible` with an outline. Both
  outrank single-class component rules that follow them, so in the
  boards a `<button class="btn btn-primary">` loses its ink and weight
  (pale text on the aurora gradient), `.btn-s`, `.pause-btn`,
  `.switcher`, `.tug-opt` and `.tool-btn` buttons lose their type size,
  a `.field` input its 14px, and the composer's textarea draws a focus
  box inside the composer's own focus glow. The handoff patches the
  `<a>` cases by hand (`.nx a.btn`, `.nx a.btn-primary`,
  `.nx a.btn-ghost`), which says what it means. `nexus.css` still ships
  verbatim; `vite.config.mjs` wraps those two selectors in `:where()`
  at build time (`repairCascade`, tested), so every component rule wins
  as written.
- **Box-drawing glyphs.** The boards load JetBrains Mono from Google
  Fonts with a `text=` list that includes the box-drawing, block,
  geometric and arrow ranges. The `@fontsource` subsets leave those
  out, and a fallback mono with another advance width pulled the
  heads-down canvas's 120-column rows off their frame.
  `src/styles/mono-symbols.css` serves only those ranges from the full
  JetBrains Mono webfonts (`jetbrains-mono@1.0.6`, OFL-1.1).

## The dawn fidelity review

The paper-at-dawn pass rendered every board with `theme="light"` and
every screen in light with fixtures standing in for the missing
endpoints, then compared text, type and contrast element by element.
`nexus.css`'s light tokens are the only theme difference in the
handoff, and they ship verbatim, so the dawn render matched: every
low-contrast run of text in the app (the 11px `c-3` captions, the
skipped train cars) is the same ratio in the boards. What it fixed is
theme-agnostic:

- **Fonts and the CSP.** Vite inlined JetBrains Mono's small
  cyrillic-ext and vietnamese subsets as `data:` URIs, which the
  page's `font-src 'self'` refused. Fonts are never inlined now.
- **The docked composer** reads `/ commands` (with `.tb-long`) as the
  Cockpit board draws it; the free-standing Composer keeps `⏎ send`.
- **A pinned note** in the conversation carries the board's
  "Pinned · read on the next step" tag.
- **Heads-down** names the session's own repo and mode from its
  ledger, as the cockpit does.
- **Plot's empty thoughts box** keeps the board's ~440px height
  instead of collapsing to two lines before any idea card exists.

## Patterns not adopted

Every board pattern the app leaves out or draws differently, with
the reason (the 41.3 close carries the same list):

- **Documentation boards** (Main, Type, Space, Motion, Tokens) and
  the kit boards' `.sheet`, `.sec`, `.specimen`, `.demo`, `.code`,
  `.ease-demo`, `.curve` frames: they document the design and have
  no app UI. `nexus.css` still ships them verbatim.
- **Frozen demo states** (`.is-hover`, `.is-focus`, `.is-active`,
  `.is-typed`; FleetKit's git-pop and PlanKit's popover open by
  default; the Board's request popover, GitPanel's tidy pop, the
  cockpit's "changing" parked card): real `:hover`,
  `:focus-visible`, `:focus-within` and clicks open the same
  classes live. The info button, request popover and git-pop keep
  `.is-hover` while open.
- **Board demo data and timers** (tidepool, lantern, the sample
  sessions, commits, PRs, runs, questions, ideas, schedules; vega
  pausing after 3.2s, altair resuming): real data and server state
  replace them, using the board copy as templates. A missing
  endpoint shows an empty state or a dim dash, never made-up values.
- **The design tool's delivery** (Google Fonts links, `support.js`,
  each onboarding board's inline font-family): fonts are bundled
  offline with `@fontsource`.
- **Cockpit1024 and every Light board** have no code of their own:
  `nexus.css`'s breakpoints and `data-theme` tokens produce them.
- **Data the stream does not carry yet:** stage captions with a
  tool's result (the tool's name shows), "3 tonight" (reads "this
  session"), CloudLoop's run sentences, PR and parked chips and the
  topbar "next 03:30" line, run mode's locked state and the
  owner-mode confirm while a session runs, the Board rail's star
  names (an 8-character id until GET /api/sessions exists).
- **Drawn from real data since 41.7:** tool-row durations (the
  call's tool_use to its tool_result) and diffstats (an Edit's own
  old and new text; a Write shows only what it adds), message times
  (when the server read them), the workflow junction (a Workflow
  call) and its dashed lines, heads-down's time bar (the chunk's
  size against the plan's hours table) and the phase track's marks
  (closes and parked questions, dated by the stream or by the
  ledger's step), the tug countdown (a live question takes its
  default after six minutes, the board's own 4:48 at 80%) and
  CloudLoop's "PRs opened" (PRs created while a loop run was
  going). A value nobody saw draws blank or a dash.
- **Inert or reduced interactions:** the Board's drag grip in the
  all-chunks view and under a filter (it reorders only within a spec,
  in the spec view), Hold for a contributor
  (a hold is the owner's `claims assign`, so only the owner sees it), the
  orphaned worktree's "open" link (the board's `#rigel-3`: a
  worktree no session holds opens `/git?tidy=<branch>`, the panel's
  dry run saying whether /tidy would close it and why; closing it
  stays /tidy's job), Recover's "Pick a folder" (focuses the path
  field: a browser cannot return an absolute path), and Recover's
  "Resume from here", offered on the first unfinished step only
  (the Workflow tool resumes a run there, replaying every finished
  agent; it has no "from step N").
- **Fleet:** each star seats its agents as its board draws it
  (vega on the four quadrants, deneb on its own seats, altair's one
  helper up and left; a star no board draws working takes the
  quadrants), and a known idle agent draws its idle curve, deneb's
  `M0 0C40 0 60 100 100 100` bent to the seat's own end points
  (`src/screens/fleet/sky.js`). The agents and their states are the
  session's own; an agent with no state gets no idle curve. The
  grid scrolls where the board's `.view` clips; there is no "no
  sessions" board, so only the start tile shows. CloudLoop's
  `.view` scrolls for the same reason.
- **Reader-only copy:** Launch's "collapse 1.6s..." caption (the
  motion is kept); the Welcome prompt and CloudSetup preview show
  the real prompt and workflow, not `npx @usenexus/cli readme` and
  `loop --once`.
- **Authoring slips not copied:** Inbox's "Why the default:" with
  no space, and Detect's Claude Code row without its check mark.
- **Additions no board draws,** built from existing classes:
  permission requests as question cards (Allow / Always allow /
  Deny), an inline "Edit description" field, the contributor note
  under a routed `/plot`, Recover's "No recent runs yet" and its
  "Resume it yourself" note (the command and prompt to paste when
  the server cannot resume a run), the not-signed-in, checking,
  red-run and skipped-cloud states; the Board's moving row (the plotted
  row's accent edge: no board draws a dragging `.crow`) and Reassign's
  picker (the Composer board's `.menu`, placed as `.req-pop` is, with a
  `.field` for the login of a person no hold names).
- **The stage's tug states** (41.2): each tug's path from the inbox
  to the session reuses the Cockpit board's `.fil.is-tug` (its pulse
  while sent) and the question line's dash once seen; applied draws
  quiet in `--st-done`. The marks at the inbox end (state, age, the
  session's `.sess-tag`) are app glue in `src/styles/stage-tugs.css`,
  built from `nexus.css` tokens only, so a port that replaces the
  tokens keeps them.
- **Shared Tug props** (`whyIcon`, why-label, result line): the
  Inbox keeps its own markup that matches its board.
- **The cockpit switcher's rule for terminal sessions** (FleetKit
  draws local stars only and leaves terminals open): the menu lists
  the local stars first, as the board does; terminal sessions follow
  under a `.menu-sep`, each with the terminal glyph and its line
  ("terminal · linked" or "terminal · read-only until linked", then
  its chunk), and each opens its cockpit, where sending links and
  steers it. The button's small stars are the other local stars
  only. Someone else's session never appears
  (`src/screens/cockpit/switcher.js`).
