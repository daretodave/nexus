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
  to `/messy`, which the GUI calls explode: its themes come back as
  cards, each with the `/plot` line from its report, one click to
  send); the cloud loop; and Launch, which opens the first session's
  cockpit.
- **Fleet**: every live session on this machine as a tile with its
  star name (vega, sirius, deneb, altair), its phase, chunk and git
  strip: the session ledgers plus Claude Code's own session files for
  the repo. Link a terminal session and a tug or an answer sent to it
  reaches its next tool call, and only that session (the steer hook;
  nexus `customization/sessions.md`). Each tile shows the session's
  phase track, its progress through the chunks it claimed, and its
  orb; a terminal session is read-only. Pause all runs the reboot
  train. A fallen session resumes from its tile: a new session starts
  here on `/reboot-resume <star>`, takes its ledger, claims and
  worktree, and restarts its loop. Every owner line the
  GUI posts (a tug, an answer, a line to every loop: `POST
  /api/announce`) goes through the repo's own `scripts/announce.mjs`
  (its `postTo`: the board's lock and whole-file write); a repo
  without one gets a refusal, never a hand-written board.
- **Cockpit** (`/s/<id>`): the session's phase track (Questions,
  Working, Questions, Package). On the left are the conversation and a
  composer. Free text routes itself: a bug goes to `/bug`, a feature or
  task to `/plot`, and a question is answered in place. On the right
  is the agent stage: the session is an orb, sub-agents bloom out on
  filaments, and a question from an agent pulls toward you. Each tug
  or answer you aim at the session draws its path from the inbox to
  the orb with its state: sent (the pulse travels), seen (the steer
  hook handed it over: the line dashes) and applied (the session's
  next reply or ledger beat after that: a quiet line, for ten
  minutes). Each open question shows its age and the session's star.
  A live question waits six minutes, counting down on its tug, then
  the session takes its default (the recommended option, else the
  first) and says so. Tool rows show their diffstat and how long they
  took, and a Workflow call draws the junction its agents hang from.
- **Heads-down**: the session as a 120-column terminal view.
- **Oversight**: every open question across sessions in one inbox,
  each tagged with its session's star (`GET /api/inbox`): live
  (`AskUserQuestion` as buttons, tool permissions) from the sessions
  this server runs, parked (each session's ledger, terminal ones too)
  and durable (from `plan/`). The Oversight badge counts the same list.
  Answers land per owner mode.
- **Plan**: all chunks in the order `/next` would build them (the
  repo's `scripts/plan/order.mjs`), or by spec with % done as `/next
  status` reads it (`progress.mjs`, pending closes counted). Sort by
  next up, spec, size or claimed; just-plotted chunks are marked. Chunk
  it on an unchunked spec starts `/next chunk NN`. Claims show by
  person and session (the star from each claim's `s:<session>~<star>`
  tag); claim, release, hold, assign and reassign from the row or the
  rail, each one run of the repo's own `scripts/claims.mjs` (never a
  copy of its rules), so a refusal is the module's own words. The owner
  holds, assigns and reassigns anyone's claim; where claims are
  protected, a contributor's "Request claim" opens a GitHub issue asking
  the owner to assign it (`POST /api/claims/:verb`). A chunk
  the plan leaves without words gets a one-line summary from Claude
  Haiku, marked as AI, cached in `.nexus/cache/` and never written to
  the plan (one batched call per board load, on your Claude Code
  login; Settings turns it off). In the spec view a chunk's grip reorders it
  within its spec (drag it, or focus it, arrow up or down, Enter): the move
  lands as one pending file, `plan/pending/reorder-<spec>-<stamp>.md`, in
  either mode, so the spec file changes only when the owner settles. The
  owner's Reassign picks from the people holding claims, or the owner.
- **Cloud loop**: pause and resume the loop workflow (`gh workflow
  disable|enable`), run one pass now (`gh workflow run`), and each live
  run's current step, with a step running over 30 minutes (or a job
  waiting over 2 for a runner) marked stalled. Tonight's PRs opened
  counts the PRs created while a loop run was going. The checks ask for least
  privilege: write on the repo to pause and run (a fine-grained token
  needs only Actions: read and write), and a read-only workflow token
  default is fine when the loop workflow declares its own permissions,
  as the kit's do.
- **Git**: every session's strip (in its tile, cockpit and heads-down
  view) shows its branch, worktree, ahead and behind, uncommitted and
  staged files, the last five commits, its pull request with checks,
  and the claims it holds. The repo panel lists every worktree from the
  repo's own `scripts/worktree.mjs list --json` (active, idle,
  orphaned, fallen; a lock's pid alive or dead), the primary checkout,
  main's recent commits and open pull requests, and a `/tidy` dry run
  that only lists: closing a worktree stays `/tidy`'s job, in a
  terminal.
- **Recover**: point it at a Workflow run's transcript folder (under
  `~/.claude/projects/`, or pick one of the repo's recent runs). It
  reads `journal.jsonl` as a timeline: which agents finished, what
  each returned, and where the run stopped. Resume starts a session
  that reopens the run's own Claude Code session in the folder it
  worked in and asks it to call the Workflow tool with the run's
  `scriptPath` and `resumeFromRunId`: finished agents replay from
  the journal, the rest run again. When that session is still open,
  or its folder or script is gone, the screen shows the command and
  prompt to paste instead.
- **Settings** (owner mode, run mode, AI one-liners, night or dawn).
  Owner mode and run mode live in the checkout's untracked
  `.nexus/local.json`, read and written through `/api/local` by
  Settings and the cockpit alike.

Some of this waits on server endpoints that are not built yet (the
reboot train's Pause all, chunking in the page). Until they land, those
screens show the design's empty state, never made-up data.

Using another agent? The Welcome step quotes the canonical prompt
from nexus `prompts/`, ready to paste.

## Options

```
npx @usenexus/cli --repo <dir>   another folder
npx @usenexus/cli --no-open      print the link instead of opening it
npx @usenexus/cli --port <n>     a fixed port
NEXUS_PROVIDER=cli               use `claude -p` stream-json instead of the Agent SDK
npx @usenexus/cli --demo <name>  a scripted demo (below): no repo, no Claude, no network
```

## Demo: fixtures and a timed beat script

```
npx @usenexus/cli --demo list
npx @usenexus/cli --demo fleet-to-tug [--speed <n>] [--loop] [--port <n>] [--no-open]
```

`--demo` serves the real UI over a scenario's fixtures and replays its
beat script on the session channels, through the same endpoints and
event shapes the live server uses (`/api/sessions`, `/api/plan`,
`/api/inbox`, `/api/events?session=`, beats from `shared/beats.mjs`,
transcript items from `server/normalize.mjs`). It reads no repo, starts
no Claude session, opens no connection out and writes nothing: an
answer, a send or a setting lands in memory and is gone when it stops.
An endpoint the scenario does not stage answers 404, so its screen shows
the design's empty state. The project and everything in it is invented.

| Scenario | Script | What happens |
|---|---|---|
| `fleet-to-tug` | 7.0 s | Four sessions breathe on the fleet; vega asks, the stage hushes and the card pulls into the conversation; the owner answers; vega wakes and 12.4 lands on main |
| `bug-to-archive` | 5.7 s | "the PDF export crashes on long seasons" goes to `/bug`; 15.3 slots into the plan, is claimed, built, gated and closed |
| `fall-and-resume` | 6.6 s | deneb fell over mid-chunk; Resume on its tile picks it up and 14.1 lands |
| `heads-down` | 7.6 s | altair works a claimed list of three chunks, one after another |

The owner's turn (an answer, a send, a Resume) is a gate: click it in
the page and the script carries on from that moment, or leave it and
the script takes it on its own. `--speed 2` runs the script twice as
fast; `--loop` starts it over two seconds after it ends. `GET
/api/demo` reports the scenario, its length and the steps fired so far,
and `POST /api/demo/restart` starts it over: hooks for recorders and UI
tests. The scenarios live in `server/demo/scenarios.mjs`, the player in
`server/demo/world.mjs`, and tests drive them on a manual clock
(`server/demo/clock.mjs`).

## One server, many sessions

One server runs per repo. It writes `.nexus/server.json` (port and
token, owner-only, kept out of git) at the primary checkout's root,
and a second `npx @usenexus/cli` in the same repo prints and opens
that server's link instead of starting another. A record whose
process is gone, or whose server does not answer, is replaced.

Each session the server runs has its own Agent SDK session, its own
event channel (`/api/events?session=<id>`) and a deep link
(`/s/<id>`). Its environment carries `NEXUS_SESSION` (its claims and
ledger id) and `NEXUS_GH_LOGIN`, asked of `gh` once per server. Start
one from the fleet or the Launch step: it takes the next free star
name, a worktree at `../.nexus-wt/<name>-<n>` on branch
`nexus/<name>-<n>`, and a ledger in `.nexus/sessions/`. Pause waits
for the turn in flight and holds what you send until you resume.
Closing a session ends its ledger; its worktree stays for `/tidy`.

The claims panel runs `scripts/claims.mjs` as the acting session (the
home session unless a call names another) with the same two variables,
and drops `CLAUDECODE` and every `CLAUDE_CODE_*` variable from that
child's environment: the server acts for you, not as a Claude Code
session, so one started from inside Claude Code never claims under
that session's id or trips the module's hook-marker check.

## Headless: one prompt, JSON out

```
npx @usenexus/cli run "summarize plan/README.md"
echo "what ships next?" | npx @usenexus/cli run -
npx @usenexus/cli run --cwd ../other-repo "..."
```

`run` answers one prompt in one turn through the Agent SDK on your
Claude Code login, with no server and no browser. It prints one JSON
object on stdout:

```
{"result":"...","session_id":"...","is_error":false,"subtype":"success",
 "num_turns":1,"duration_ms":3794,"total_cost_usd":0.15,"usage":{...},
 "permission_denials":[]}
```

It exits 0 on success, 1 when the turn ends in an error (the JSON
still prints, with `is_error: true`), and 2 on a usage error.

Options: `--cwd <dir>` (default: this folder), `--model <name>`,
`--permission-mode <mode>`, `--json` (the default, accepted for
scripts), `-` to read the prompt from stdin. `npx @usenexus/cli run
--help` lists them.

Permissions stay safe by default. The mode is `default`, and the
repo's `.claude` settings load, so its allowlist and hooks (a guard
hook, if the repo has one) apply as they do in Claude Code. A tool
call the allowlist does not cover is denied, since no one is there
to approve it, and is listed in `permission_denials`. A question
(`AskUserQuestion`) is denied with a note to take the recommended
option. `--permission-mode` can widen this to `acceptEdits`, `auto`
or `plan`. `bypassPermissions` is refused.

## Develop

```
cd packages/cli
npm ci
npm test          # node --test: beat reducer, routing, hub, server guards, UI rules, headless run
npm run build     # bundles prompts/, builds the UI into dist/, checks its weight
npm start         # serve this checkout's GUI
```

The UI is the Claude Design handoff in `design/handoff/` (the source
of truth; fidelity reviews diff against it). `src/styles/nexus.css`
is its stylesheet, verbatim: every token and component class.
`src/ui/` holds one React file per component family, plus the pure
rules they share (`stars.js`: session names, colours and places;
`theme-pick.js`; `run-mode.js`). `src/screens/` has one file per route,
loaded as its own chunk when the route first renders (`App.jsx`),
with a folder per screen family for its parts and its pure view model,
and `src/data/` the server client and its hooks. Where the server does
not serve an endpoint yet, a screen shows the design's empty state;
`MISSING` in `src/data/hooks.js` lists those endpoints.
The agent stage moves only on structured beats
(`shared/beats.mjs`). Its pure reducer gives the same state whether
the page was opened mid-run, refreshed, or watched from the start.

The build holds the package's weight: `scripts/check-bundle.mjs`
fails `npm run build` when a JS chunk passes 500 kB or a font face
other than the latin and latin-ext woff2 faces and the three mono
symbol cuts (`src/styles/mono-symbols.css`) lands in `dist/`.
`npm test` runs the same rules on a fixture, and on `dist/` when a
build is there.

The kit: https://github.com/daretodave/nexus
