

- 2026-10-21 · 41.3 · design patterns not adopted, with their
  reasons (also kept in `packages/cli/design/handoff/README.md`):
  - Documentation boards (Main, Type, Space, Motion, Tokens) and
    the kit boards' .sheet/.sec/.specimen/.demo/.code/.ease-demo/
    .curve frames: they document the design, no app UI; nexus.css
    still ships them verbatim.
  - Frozen demo states (.is-hover, .is-focus, .is-active,
    .is-typed; git-pop, PlanKit popover, request popover, tidy pop
    and the "changing" parked card open by default): real hover,
    focus and clicks open the same classes live.
  - Board demo data and timers (sample sessions, commits, PRs,
    runs, questions, ideas; vega pausing, altair resuming): real
    data and server state; a missing endpoint shows an empty state
    or a dim dash, never made-up values.
  - The design tool's delivery (Google Fonts, support.js, inline
    font-family): fonts bundled offline with @fontsource.
  - Cockpit1024 and every Light board: no own code; nexus.css's
    breakpoints and data-theme tokens produce them.
  - Data the stream lacks (tool durations and diffstats, message
    times, workflow junction, tool results in captions, heads-down
    time bar and phase marks, the tug countdown, CloudLoop's run
    sentences, chips, PR count and "next 03:30", run mode's locked
    state, the Board rail's star names): drawn once the data
    exists; plotted as 41.7, 40.11.
  - Inert interactions (Board drag grip, Reassign target, the
    orphaned worktree's "open" link, Recover's folder picker):
    no action or page behind them; plotted as 40.12, 41.8.
  - Fleet: deneb's custom idle curve (quadrant paths stand in;
    41.8); the grid and CloudLoop's view scroll where the board
    clips; no "no sessions" board, so only the start tile shows.
  - Reader-only copy: Launch's "collapse 1.6s..." caption; the
    Welcome prompt and CloudSetup preview show the real prompt
    and workflow.
  - Authoring slips not copied: Inbox's "Why the default:"
    spacing, Detect's missing check mark.
  - Two HeadsDown glyphs swapped for look-alikes (U+25C0 to
    U+25C2, U+25AA to U+25A0) for the emoji gate.
  - Departures from the boards' literal render: the element
    resets wrapped in :where() at build (buttons follow their
    component rules; confirm in 41.6); box-drawing ranges served
    from full JetBrains Mono webfonts.
  - Shared Tug whyIcon / why-label / result-line props: the Inbox
    keeps its own markup matching its board.
  - Additions no board draws, from existing classes: permission
    question cards, inline "Edit description", the contributor
    /plot note, Recover's empty line, not-signed-in, checking,
    red-run and skipped-cloud states.
