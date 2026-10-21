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
- **Data the stream does not carry yet:** tool-row durations and
  diffstats, message times, the workflow junction node and its
  dashed lines, stage captions with a tool's result (the tool's
  name shows), "3 tonight" (reads "this session"), heads-down's
  time bar and phase-track marks, the Inbox tug countdown
  ("default in 4:48"), CloudLoop's run sentences, PR and parked
  chips, "PRs opened" count and the topbar "next 03:30" line, run
  mode's locked state and the owner-mode confirm while a session
  runs, the Board rail's star names (an 8-character id until
  GET /api/sessions exists).
- **Inert or reduced interactions:** the Board's drag grip (no
  reorder action), Reassign (no target picker in the design), the
  orphaned worktree's "open" link (no page for it), Recover's "Pick
  a folder" (focuses the path field: a browser cannot return an
  absolute path), and Recover's "Resume from here", offered on the
  first unfinished step only (the Workflow tool resumes a run there,
  replaying every finished agent; it has no "from step N").
- **Fleet:** deneb's custom idle curve (the four quadrant paths
  stand in); the grid scrolls where the board's `.view` clips;
  there is no "no sessions" board, so only the start tile shows.
  CloudLoop's `.view` scrolls for the same reason.
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
  red-run and skipped-cloud states.
- **The stage's tug states** (41.2): each tug's path from the inbox
  to the session reuses the Cockpit board's `.fil.is-tug` (its pulse
  while sent) and the question line's dash once seen; applied draws
  quiet in `--st-done`. The marks at the inbox end (state, age, the
  session's `.sess-tag`) are app glue in `src/styles/stage-tugs.css`,
  built from `nexus.css` tokens only, so a port that replaces the
  tokens keeps them.
- **Shared Tug props** (`whyIcon`, why-label, result line): the
  Inbox keeps its own markup that matches its board.
- **The cockpit switcher** also shows terminal sessions (the
  terminal glyph); the board shows local stars only, and FleetKit
  does not settle it.
