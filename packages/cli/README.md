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

- **Start**: a preflight (Claude Code installed and logged in, `gh`,
  git remote, whether nexus is already adopted). You choose owner mode
  (push straight to main) or contributor mode (pull requests), and how
  `/next` builds (sub-agents, workflows). Then adopt in one click, or
  "explode" a dump of messy thoughts into `/messy`.
- **Cockpit**: a 50/50 split. On the left are the transcript and a
  composer with slash autocomplete. Free text routes itself: a bug goes
  to `/bug`, a feature or task to `/plot`, and a question is answered
  in place. On the right is the agent stage: the session is an orb,
  sub-agents bloom out on filaments, and a question from an agent pulls
  toward you.
- **Heads down**: the repo's own `progress.mjs` output as ASCII, plus
  "go heads down" and "pause all".
- **Oversight**: live questions (`AskUserQuestion` rendered as
  buttons) and durable questions from `plan/`. Your answers are applied
  by `/oversight` and land per owner mode.
- **Claims**: who builds what, from `claims list --json`.
- **Cloud loop**: a GitHub Actions checklist, one checkbox per
  workflow, and live runs.

Using another agent? The Start screen quotes the canonical prompt
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
npm test          # node --test: beat reducer, routing, hub, server guards
npm run build     # bundles prompts/ and builds the UI into dist/
npm start         # serve this checkout's GUI
```

The UI uses tokenized placeholder styling. Every colour, size and
motion value lives in `ui/tokens.css`, which is the file the design
handoff replaces. The agent stage moves only on structured beats
(`shared/beats.mjs`). Its pure reducer gives the same state whether
the page was opened mid-run, refreshed, or watched from the start.

The kit: https://github.com/daretodave/nexus
