# @usenexus/cli

Using Claude Code? Enjoy a GUI on us. For free.

```
npx @usenexus/cli
```

Run it from your project's root. It starts a local server on
`127.0.0.1` (random port, a token per launch, strict Host and Origin
checks), opens your browser, and drives your own Claude Code login.
You need no API key.

## What you get

- **Onboarding**: six steps. Welcome; Detect (Claude Code installed
  and signed in, `gh`, the git remote, whether nexus is adopted);
  Shape (owner or contributor checkout, and how `/next` builds: by
  size, sub-agents, workflows); Plot (a dump of messy thoughts, sent
  to `/messy`); the cloud loop; and Launch, which opens the first
  session's cockpit.
- **Fleet**: every live session on this machine as a tile with its
  star name (vega, sirius, deneb, altair), its phase, chunk and git
  strip: the session ledgers plus Claude Code's own session files for
  the repo. Link a terminal session and a tug or an answer sent to it
  reaches its next tool call, and only that session (the steer hook;
  nexus `customization/sessions.md`). Pause all runs the reboot train,
  and a fallen session resumes from its tile.
- **Cockpit** (`/s/<id>`): the session's phase track (Questions,
  Working, Questions, Package). On the left are the conversation and a
  composer. Free text routes itself: a bug goes to `/bug`, a feature or
  task to `/plot`, and a question is answered in place. On the right
  is the agent stage: the session is an orb, sub-agents bloom out on
  filaments, and a question from an agent pulls toward you.
- **Heads-down**: the session as a 120-column terminal view.
- **Oversight**: every open question across sessions, live
  (`AskUserQuestion` as buttons, tool permissions) and durable (from
  `plan/`). Answers land per owner mode.
- **Plan**: all chunks or by spec, sorted by next up, with claims by
  person and session. Claim, hold and release from the row.
- **Cloud loop**, **Git** (worktrees, main, open PRs, a `/tidy` dry
  run), **Recover** (a workflow folder as a timeline) and **Settings**
  (owner mode, run mode, night or dawn).

Some of this waits on server endpoints that are not built yet (the
plan, the merged inbox). Until they land, those
screens show the design's empty state, never made-up data.

Using another agent? The Welcome step quotes the canonical prompt
from nexus `prompts/`, ready to paste.

## Options

```
npx @usenexus/cli --repo <dir>   another folder
npx @usenexus/cli --no-open      print the link instead of opening it
npx @usenexus/cli --port <n>     a fixed port
NEXUS_PROVIDER=cli               use `claude -p` stream-json instead of the Agent SDK
```

## Develop

```
cd packages/cli
npm ci
npm test          # node --test: beat reducer, routing, hub, server guards, UI rules
npm run build     # bundles prompts/ and builds the UI into dist/
npm start         # serve this checkout's GUI
```

The UI is the Claude Design handoff in `design/handoff/` (the source
of truth; fidelity reviews diff against it). `src/styles/nexus.css`
is its stylesheet, verbatim: every token and component class.
`src/ui/` holds one React file per component family, plus the pure
rules they share (`stars.js`: session names, colours and places;
`theme-pick.js`; `run-mode.js`). `src/screens/` has one file per route,
with a folder per screen family for its parts and its pure view model,
and `src/data/` the server client and its hooks. Where the server does
not serve an endpoint yet, a screen shows the design's empty state;
`MISSING` in `src/data/hooks.js` lists those endpoints.
The agent stage moves only on structured beats
(`shared/beats.mjs`). Its pure reducer gives the same state whether
the page was opened mid-run, refreshed, or watched from the start.

The kit: https://github.com/daretodave/nexus
