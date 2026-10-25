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

- **Onboarding**: seven steps. Welcome; Detect (Claude Code installed
  and signed in, `gh`, the git remote, whether nexus is adopted);
  Shape (owner or contributor checkout, and how `/next` builds: by
  size, sub-agents, workflows); Secrets, optional (an owner imports a
  `.env`'s names into the vault, starts an empty manifest or skips; a
  contributor needs no project secrets and may add local keys); Plot (a dump of messy thoughts, sent
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
  composer. Text goes to the session as typed. When it reads like a bug
  or a task, a chip suggests `/bug` or `/plot`; a click on it (or
  Ctrl+Enter) sends it that way, and Enter alone never adds a command
  to your words. On the right
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
  repo's own `order.mjs`, else nexus's bundled copy; the board says
  which), or by spec with % done as `/next
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
- **Design** (`/design`, from the Plan's Design button): for a project
  designed in Claude Design. "Hand off a design" takes the artifact
  link Claude Design shared, checks it is a
  `https://claude.ai/artifact/<id>` or
  `https://claude.ai/code/artifact/<id>` link before anything is sent,
  and runs `/design ingest <link>` in this session or a new one
  (`POST /api/design/handoff { link, session? }`, `session: "new"`
  for a new one). The gallery shows each handoff's boards by canvas
  page, each with its port status: ported (the files that draw it),
  skipped (its reason) or pending (the chunk it waits on). It reads
  them from the repo's own `scripts/design/port-map.mjs` (`check
  --json` finds the handoffs in `design/handoff/` and
  `packages/*/design/handoff/`, `status <handoff> --json` gives the
  boards: `GET /api/design`); a repo without the script gets a note,
  never a guess. Cards show no thumbnail: the boards need the design
  tool's runtime to draw, and nothing renders on page load.
- **Settings** (owner mode, run mode, AI one-liners, secrets, night or
  dawn). Secrets is names only: the owner's in `nexus.secrets.json`, a
  contributor's local keys for this machine (the Vault rail item; the
  vault itself is still to come).
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
npx @usenexus/cli --port <n>     a fixed port (default: the last launch's, when free)
npx @usenexus/cli --replace      stop this repo's running nexus the safe way, then start (an upgrade)
NEXUS_PROVIDER=cli               use `claude -p` stream-json instead of the Agent SDK
npx @usenexus/cli --demo <name>  a scripted demo (below): no repo, no Claude, no network
npx @usenexus/cli upgrade        a nexus v1 repo to v2, dry run (below)
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
| `bug-to-archive` | 6.7 s | "the PDF export crashes on long seasons" goes to `/bug`; 15.3 slots into the plan, is claimed, built, gated and closed |
| `fall-and-resume` | 6.6 s | deneb fell over mid-chunk; Resume on its tile picks it up and 14.1 lands |
| `heads-down` | 7.6 s | altair works a claimed list of three chunks, one after another |
| `after-restart` | 6.2 s | nexus was stopped and upgraded: vega came back by itself, three tiles wait calmly as "stopped with nexus", and Pick up all brings each back where it left off |

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
name, a worktree at `<root>/<name>-<n>` on branch
`nexus/<name>-<n>`, and a ledger in `.nexus/sessions/`. The cockpit
opens at once: the worktree forms behind it ("A star is forming" on
the agent stage, the composer held until it is ready, Retry if git
refuses), through the repo's own hooks. The root is where the repo
keeps its worktrees: `worktreeRoot` in the checkout's untracked
`.nexus/local.json` (relative to the checkout, or absolute), else the
folder most of its linked worktrees already share (a folder inside the
repo counts only when the repo ignores it), else the kit's
`../<repo>-wt/`. Pause waits
for the turn in flight and holds what you send until you resume.
Closing a session ends its ledger; its worktree stays for `/tidy`.

### Restarts and upgrades

Stopping nexus never loses a session. Ctrl+C, closing the terminal
(SIGHUP) or `--replace` parks each session in its ledger first: its
Claude Code conversation, where it works, what it was doing (idle,
mid-step, asking, its worktree still forming), the messages waiting to
go and its open questions (they land in the inbox). A kill leaves the
ledgers as they were; the next launch parks them itself. Either way the
next launch lists them on This machine as "stopped with nexus", never
as terminal sessions or as fell over. One that stopped idle comes back
by itself (free until it is sent something); the rest wait for Pick up
on the tile, Pick up all on the fleet, or a message in the cockpit.
Pick up keeps the same star, worktree and ledger and resumes the same
conversation; one that was mid-step is asked to carry on, a loop goes
through `/reboot-resume` (one its reboot train parked waits for Pick up,
which sends it), and the waiting messages follow. A prompt typed while
its worktree formed is kept through a kill. A session taken on from a
terminal with `/reboot-resume` is that terminal's from then on: it reads
as a terminal session and is never picked up beside it. A worktree
an interrupted `git worktree add` left half made is finished in place
(the person's files kept), and one deleted from disk is checked out
again from its branch. Turn idle pick-ups off with `pickupIdle: false`
in the prefs.

A newer launch on the same repo says when the running nexus is another
version: stop it and launch again, or launch with `--replace` (from
0.5.2 on; 0.5.1 is stopped with Ctrl+C where it runs). The new
launch takes the last port, so an open tab reconnects: a tab the new
launch opened hands its token to the older tabs of the same origin
(nothing is written anywhere new), and a tab with no such neighbour
says to use the printed link. A ledger an older nexus wrote reads the
same way; going back to 0.5.1 reads a parked session as a paused
terminal one.

The claims panel runs `scripts/claims.mjs` as the acting session (the
home session unless a call names another) with the same two variables,
and drops `CLAUDECODE` and every `CLAUDE_CODE_*` variable from that
child's environment: the server acts for you, not as a Claude Code
session, so one started from inside Claude Code never claims under
that session's id or trips the module's hook-marker check.

## Secrets: names out, values in

The server is the one place outside your terminal that handles a
secret's value, so the model never has to. It runs the repo's own
secrets scripts (`scripts/secrets.mjs` and its modules, from
`nexus/customization/secrets.md`); a repo without them, or with
copies too old, gets a 409 that names the file to update.

| Endpoint | What it does |
|---|---|
| `GET /api/secrets` | Every name with where it is set (`local`, `keychain`, `workspace`), each destination's state (`set`, `missing`, `pushed` with when and `stale` when the vault's value is newer, `not pushed`), what it is for, the chunk that asked, its age, last set and rotation nudge, plus `mode`, `projectSecretsNeeded`, `localKeys`, the last audit events, the plan's open secret `requests` (chunk, names still missing) and the importable `envFiles` at the root, by name. Never a value. |
| `POST /api/secrets/:name` | `{ value, ring?, destinations?, declare?, for?, local?, repo?, environments?, worker? }`: the value into the vault through the repo's `set` (on its stdin seam, never argv), then each destination through its sink. `declare` (owner) first adds the name, or the places ticked, to `nexus.secrets.json`. Pushes are owner-only and checked against the manifest before anything is stored; a contributor's value stays local. Answers `{ stored, ring, pushed: [{ destination, ok, error? }] }`. |
| `POST /api/secrets/:name/push` | `{ destinations }`: push the stored value again (the vault's Sync and Retry), owner only. |
| `POST /api/secrets/import` | `{ text }` or `{ file }` (a dotenv at the root, read by the server): previewed as names only (declared, where set, how each looks: `secret`, `public` or `setting`, skipped and why). `{ ..., confirm: true, names?, destinations? }` stores the picked ones, adds new names to `nexus.secrets.json` with the places per name and pushes them (owner). |
| `POST /api/secrets/manifest` | An empty `nexus.secrets.json` (onboarding's Start empty), owner only; one that exists stays. |
| `GET /api/secrets/audit` | Every set, push and rotation by name, and the rotation nudges. |

The Vault (`/vault`, the key in the rail) draws this for the owner:
every name with eight dots for its value (a length never shows), a
dot per destination, Add value, Sync, Replace, Add a secret, the
import, the open requests as key cards, where values go and the audit
log. A secret request is also a key row in Oversight with no default
(batch-answer passes over it), and the plan board marks a chunk
waiting on one as needs secret. A contributor's Vault reads No
project secrets needed, above their own local keys.

A posted value is never echoed: not in an answer, an error, a header
or a log. Every JSON answer and every event-stream frame (transcripts,
session detail, Recover's journal previews, the claims and announce
passthroughs) passes through one mask fed by the vault's current
values, so a value a session prints reads `[secret NAME]`. The mask
refreshes when a vault file changes (a `secrets set` in a terminal
counts), right after a store here, and every minute when the keychain
is on. It skips values under 8 characters and ones shaped like
configuration, as the repo's scan does.

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
still prints, with `is_error: true`), and 2 on a usage error. A vault
value in the output prints as `[secret NAME]`, through the same mask
the server uses.

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

## Upgrade: a v1 repo, dry run first

```
npx @usenexus/cli upgrade                 the repo in this folder
npx @usenexus/cli upgrade --repo <dir>    another folder
npx @usenexus/cli upgrade --json          the report as JSON
npx @usenexus/cli upgrade --keep-workflow leave march.yml as it is (report only)
```

`upgrade` moves a nexus v1 repo (a phase plan:
`plan/steps/01_build_plan.md`) to v2 (specs and chunks). This
release carries the dry run, and it writes nothing. It never reads
your checkout either, which can be stale and dirty: it fetches
origin's default branch and works in a temporary worktree cut from
it. There it copies the v2 kit files (the CLI's bundled set, the
same list as the manual copy list in `playbooks/upgrade.md`), merges
the v2 lanes and spec table into your roadmap (your own sections
stay where they are), converts the build plan, retires the v1 files,
rewrites every v1 reference outside history files (workflow prompt
text included), flips the lock, and runs plan-check, its test and
workflow-lint.

Your cloud loop's workflow is merged, not replaced.
`.github/workflows/march.yml` takes the v2 owner-job shape and
keeps your cron, ceiling number, model pin, every extra `env:`
entry (deploy tokens by name), concurrency group, extra checkout
inputs and permissions, any step the kit never shipped, and any
prompt line no kit version ever held. The job's toolchain steps
(package manager, install, browser install) move into
`.github/actions/setup/action.yml`, which every v2 job calls; a
step that reads a secret stays in the job (a composite action has
no secrets context). The model pin and env go to the owner job
only: the pull-request build job holds no token by design.
`--keep-workflow` leaves `march.yml` as it is and reports what the
merge would have kept.

Your loop's own steps come across. Text in `skills/march.md` and
`skills/iterate.md` that no kit version ever held (the CLI carries
every header and paragraph the kit's skills have had, so a fork from
long before `v1.0.0` still reads as kit text) moves verbatim into
`skills/march.lanes.md` and `skills/iterate.lanes.md`, one lane per
custom section, under its own header: a march step ahead of the v1
phase pick becomes a `pre` lane, one after it a `queue` lane, an
iterate one a `dimensions` lane. A skill or command the kit never
shipped stays; a command with no skill becomes `skills/<name>.md`,
and the command points at it.

The report lists every file it touched (`added`, `replaced`,
`seeded`, `merged`, `converted`, `retired`, `renamed`, `rewritten
(N refs)`, `moved-to-lane (N)`, `moved-to-skill`, `kept-custom`,
`knobs written`),
the archive lines it would append, the warnings, the gate, what
the workflow merge kept, the first dispatch a tick would make
(march's pick order played forward), and the loop mode. A v1 loop that pushed the
default branch (`Cloud-Run` commits) prints the `gh variable set
NEXUS_LOOP_MODE --body owner` line, because pull-request mode picks
only chunks. The upgrade writes the conservative knobs (`Support:
triage-only`, `Promote: owner`, `stall_action: alert`, `loop: off`,
``**UI:** `none` ``, an empty `## Generators`) into a `## Loop knobs`
block of `plan/bearings.md`, creating the file when the repo has
none; a knob line the repo already has, with a value that knob
takes, is kept as it is (a line of prose under a knob name is
passed over and named in the report). The report's knobs section lists
`NEXUS_SUPPORT`, `NEXUS_CADENCE` and `NEXUS_QUOTA_MAX` as "leave
unset" and prints `gh variable set NEXUS_CHAIN_MAX --body 0` and
`gh variable set NEXUS_IDLE_BACKOFF --body 0`. A half-done repo (a lock saying `chunks` beside
`plan/steps/` or `PHASE_CANDIDATES.md`) gets Step 5 only. A v2 repo
prints "already on v2".

It exits 0 when the report prints, 1 when the gate is red (the
worktree is kept and its path printed), and 2 when the repo is not
v1, has no origin, or a flag names a step this release does not
carry yet (`--write`, `--land`, `--rollback`, `--pr`, `--no-pause`,
`--no-watch`).

The GUI says it too. Open a v1 repo and the Fleet view leads with
"This repo is on nexus v1" and an **Upgrade** button (a repo part
way to v2 gets "Finish the upgrade"). The button runs the same dry
run on the server, in its own process, so the GUI stays live while
it fetches and gates. The banner then shows the report: the
headline, the file, archive, warning and gate counts, the predicted
first dispatch, the loop-mode line and the full text as the terminal
prints it. One dry run runs at a time, and the last report stays
for a tab opened later (`GET /api/upgrade`, `POST
/api/upgrade/dry`). Nothing is written.

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

### Recording a GIF of a demo

```
npm run build
npm run record -- fleet-to-tug [--out <dir>] [--name <moment>] [--fps 12] [--width 960] [--height 600]
                               [--theme night|dawn] [--speed 1] [--seconds <5-8>] [--session vega]
                               [--poster last|first|<ms>] [--chrome <path>] [--headed]
```

`scripts/record.mjs` plays a demo scenario in headless Chrome and
writes `<out>/<moment>.gif` and a still poster, `<out>/<moment>.png`,
for readers who ask for less motion (default out: `assets/gifs/` at
the repo root; default moment: the scenario's name). The scenario runs
in-process on a manual clock that holds still while the page loads and
follows the wall once capture starts, so the first frame is the
script's first moment. The length is the script plus a 0.6 s hold.
Frames are captured on a fixed grid (a slow frame skips a slot rather
than bunching) and the GIF's delays come from the capture times.

A scenario's `shot` (`server/demo/scenarios.mjs`) is its camera: the
screen it opens on and the moves a drawn pointer makes there at script
times, a click (`{ at, click, text }`) or a line typed into a field
(`{ at, type, keys, ms, enter }`). `fleet-to-tug` opens on the fleet,
clicks vega's tile and then the recommended answer, so the owner's turn
is taken in the page, as the owner would; `bug-to-archive` types the bug
into vega's composer and clicks its `/bug` chip. The pointer leaves after the last move, so the
poster shows the app alone. `--session <name>` opens that session's
cockpit instead, with no moves.

The README shows `assets/gifs/fleet-to-tug.gif` and links its poster;
the kit's gate (`node scripts/verify.mjs gifs`) checks that every GIF
the README shows exists, runs 5 to 8 s, weighs at most 3 MB, has alt
text and has its poster. Re-record it from `packages/cli` with
`npm run build && npm run record -- fleet-to-tug`, look at it, and
commit both files.

There's no ffmpeg and no browser download.
`playwright-core` (a dev dependency) drives the Chrome already
installed (`--chrome` names another). The encoder is
`scripts/record/gif.mjs`, plain JavaScript: one median-cut palette
for the whole recording (255 colours plus one for "unchanged"), each
later frame cropped to what changed with the rest transparent, and
LZW. `scripts/record/png.mjs` reads the screenshots back. The run
fails, and says why, when the GIF is under 5 s, over 8 s or over
3 MB: the README's budget. Recordings are not byte-stable, so check
them by eye and by budget, not by diff.

### Walking the demo screens

```
npm run build
npm run walk -- [--scenarios fleet-to-tug,stack,grill-me|all] [--routes /,/inbox,...|all]
                [--viewports desktop,mobile] [--reduced-motion] [--out <dir>] [--settle 1200]
                [--chrome <path>] [--json]
```

`scripts/walk.mjs` starts each demo scenario in-process, opens every
screen (the twelve routes `App.jsx` draws) in a fresh headless Chrome
context at 1280×800 and 390×844, waits for `document.fonts.ready` and
a settle time, and writes down what it sees: the final path, console
errors, page errors, failed requests and 5xx, any 4xx on an endpoint
the scenario stages, horizontal overflow, buttons and links with no
name, images with no `alt`, and one PNG. A 404 from an endpoint the
demo does not stage is the page's "not served" state, so it is
allow-listed; the allow-list is read from `server/demo.mjs` (and
`server/demo/repo-start.mjs` for the scenarios that stage a folder),
so it follows the demo by itself. The walk records with
`reducedMotion: 'no-preference'`; `--reduced-motion` checks the
reduced path.

It writes `walk.json` and the PNGs to `--out` (default
`.scratch/walk/<iso>/` at the repo root, gitignored; screenshots are
never committed). `walk.json` holds `{ started, ms, chrome }` and one
row per screen: `{ scenario, route, viewport, path, console[],
pageErrors[], failed[], overflowPx, unnamed[], noAlt[], png }`. The
launch token never reaches it. `--json` prints it too.

It observes and never asserts: exit 0 with the findings in the JSON,
1 when the UI is not built (it says to run `npm run build`) or a demo
fails to start, 2 on a bad flag or no Chrome. It is never a CI gate
and never a screenshot diff; the loop reads the findings and decides.
The rules are plain functions, tested in `test/walk.test.mjs`.

The kit: https://github.com/daretodave/nexus
