

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

- 39.4 in daretodave/nexus-scratch (private), 2026-10-21: march run 39696351110 (pick, build, land green; owner and release skipped as PR mode should) claimed 01.1 as cloud-39696351110, opened PR #1 with the fix and plan/pending/01.1.md only, and recorded pr:1 on the claim; the merge ran pr-flow (claims.json back to {}) and pr-resolve, both green; the owner's settle folded the close in. What broke went into spec 39 as 39.5 onward.

Defaults taken under this cloud tick:

- Build mode: chunk 67.4 is sized L (next.md's default build mode
  is a Workflow — build, adversarial verify, fix) but this
  environment's Workflow tool cannot run foreground
  (`run_in_background: false`), which the cloud loop's rule 5
  requires for every subagent dispatch. Used next.md Step 3's L
  override instead: one builder subagent (Agent tool, foreground),
  then the lead (this session) did the adversarial-verify pass
  itself — read every file, re-ran `node scripts/__tests__/build-
  plugin.test.mjs` and the full gate independently, found and fixed
  one gate-red miss (below) — rather than a second Workflow phase.
- `upgrade-pinned-old`'s eval case is scoped to the dry-run/report
  stage only (`npx @usenexus/cli upgrade --verify`), never
  `--write`/`--pr`/`--land`: that landing step needs an owner's
  answer no eval turn can give.
- Pinned models: `claude-haiku-5-5` for both `--model` and
  `--judge-model`, in the eval suite's local run command and in
  `plugin-ci.yml` — cheapest available, keeps the suite well under
  its `--max-cost-usd 2` ceiling at the default 3 runs/case.
- `claude plugin eval` could not be scored locally in either this
  session's sandbox or the builder's: no model credential is
  injected into a shelled `claude` CLI subprocess here (`Not logged
  in`), only into this agent's own runtime. Structural checks passed
  (plugin loads, all three cases parse with no schema/scaffold
  error, each reaches its agent run before hitting the auth wall).
  Real scoring happens on `plugin-ci.yml`'s first live run, where
  `CLAUDE_CODE_OAUTH_TOKEN` is a configured repo secret — the lead
  is watching that run after this lands (see the tick's oversight
  audit for the result) and will push a follow-up fix if it is red
  for a mechanical reason (a missing `socat` package on
  `ubuntu-latest` is the one flagged risk; the eval's sandboxed Bash
  tool needs both `bubblewrap` and `socat`, and this dev sandbox
  needed `socat` installed by hand).
- Found and fixed one gate miss the builder's commits left red:
  `plugin/evals/adopt-clean/prompt.md` named a bracketed-token
  example generically, in a form `node scripts/verify.mjs`'s
  `placeholders` leg reads as an unknown real placeholder token (it
  scans every doc repo-wide, not just `templates/`) — reworded; gate
  is green.
