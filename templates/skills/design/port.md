# The port: the recipe as a Workflow, the port map as its check

> `skills/design.md`'s port in full. A handoff's port chunk
> (plotted by `/design ingest`, size L) is built by one Workflow
> script, `scripts/design/port.workflow.js`, and the handoff's
> `port.json` records where every board went;
> `scripts/design/port-map.mjs check` holds the two together.
> `nexus/playbooks/design-handoff.md` Step 5 is the why of each
> step.

## 1. When

- The port chunk of a handoff, or the re-port chunk of a later
  delivery (its new and changed boards only, `boards` below).
  `/next` builds an L chunk with a Workflow; for a port, it is
  this one.
- A local session: the fidelity step renders the boards in the
  installed Chrome (`design/render.md`). Without Chrome the
  reviewers say so; the close names the fidelity pass as owed.
- Never for a design commissioned in-repo: there is no handoff.

## 2. Run it

From the chunk's worktree, the lead calls the Workflow tool:

```
Workflow({ scriptPath: "scripts/design/port.workflow.js",
           args: { handoff: "design/handoff/<date>",
                   worktree: "<the worktree's absolute path>",
                   chunk: "<id>" } })
```

| Arg | What it is |
|---|---|
| `handoff` | the folder ingest wrote (required) |
| `worktree` | where every agent works (required) |
| `chunk` | the port chunk's id (required) |
| `themes` | one fidelity reviewer each; default `["night", "dawn"]` |
| `boards` | a re-port: only these boards |
| `app` | the app folder, when not `port.json`'s `app` |

The steps, as the script runs them:

1. **Survey:** the manifest, the canvas pages and `port.json`:
   which boards to port, grouped by page; theme twins and
   documentation boards set aside with their reason.
2. **Foundation:** the stylesheet copied verbatim, the fonts
   bundled, one component per design class, a route and a stub
   for every screen.
3. **Screens:** one agent per canvas page, in parallel, each in
   its own screen files; shared changes go back to the lead.
4. **Integrate:** the shared changes, real data, the endpoints
   the server lacks listed in one place.
5. **Fidelity:** one reviewer per theme renders the boards
   (`render.mjs --theme`), screenshots the app and runs
   `compare.mjs`; one agent then fixes the findings.
6. **Land:** `port.json` complete, its check green, the skip
   list in the handoff README, the close drafted.

The agents edit the worktree and never commit. The script
returns the pages, the fixes, the departures, the check, the
skip list and the close: the lead runs the gate, commits, and
closes the chunk with that skip list (`next/land.md` §2). A run
that stops: `resumeFromRunId` replays every finished agent.

## 3. The port map

`<handoff>/port.json`, beside `manifest.json` and `README.md`
and, like them, outside the manifest:

```json
{
  "port": 1,
  "app": ".",
  "boards": {
    "Fleet": "src/screens/Fleet.jsx",
    "FleetTrain": ["src/screens/Fleet.jsx", "src/ui/fleet.jsx"],
    "Tokens": { "skip": "a documentation board: no app UI" },
    "Billing": { "pending": "12.4" }
  }
}
```

- A path, or a list: ported; each file must exist under `app`.
- `{ "skip": "<reason>" }`: left out, with its reason. No
  reason, no skip.
- `{ "pending": "<chunk>" }`: a later chunk ports it. Ingest
  seeds every board pending the port's chunk; the Land step
  leaves pending only what another chunk owns, and that chunk
  maps its boards when it lands.

## 4. The check

```bash
node scripts/design/port-map.mjs check [<handoff>...]   # every handoff found when none is named
node scripts/design/port-map.mjs status <handoff> [--json]
```

It finds every handoff in `design/handoff/` and
`packages/*/design/handoff/` (the folder itself and each one in
it), and fails on: a file that no longer matches the manifest
(ingest's `check`), a board with no entry, an entry for a board
the handoff lacks, a ported board's missing file, a skip with
no reason, a pending with no chunk. `status --json` is what the
nexus GUI's board gallery reads.

Add `check` to the verify gate as a leg of its own while a
handoff is in the repo; opt-in if hashing a large handoff slows
the gate (it changes only on a delivery or a port, so run it
then, and in the port chunk's close).

## 5. A handoff from before ingest

A folder of boards delivered before ingest (no manifest), flat
in `design/handoff/`: the check says so in its note, leaves its
files unchecked, and checks its `port.json` against the boards
on disk; a dated delivery inside that folder is a handoff of its
own. No manifest is made for it: that would only restate what
ingest never saw.

## 6. Failure modes

- **The check is red after the run.** A board the Land step
  missed, or a screen file moved since: map it, skip it with
  its reason, or fix the path; never delete the board.
- **Pending on a closed chunk.** The chunk landed without
  mapping its boards: map them in the next chunk that touches
  the UI, and log it in the close.
- **One agent ports everything.** The script runs one agent
  per canvas page; a hand-run port that skips the Workflow
  fills one context with boards. Run the script.
