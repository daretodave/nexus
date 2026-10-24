# /next reference: the delegated build (Step 3's detail)

The core procedure is `skills/next.md`. This file holds what
the lead needs to cut the worktree, brief a builder, run a
Workflow and harvest it. Budget: 120 lines.

## 1. The worktree

Every run that changes files works in its own worktree cut
from the base just fetched, never in the primary checkout:

```bash
git fetch origin
# owner: detached, so settle may run there and HEAD pushes to main
node scripts/worktree.mjs cut ../<PROJECT_LOWER>-wt/<id> --ref origin/<DEFAULT_BRANCH>
# contributor: a branch the pull request comes from
node scripts/worktree.mjs cut ../<PROJECT_LOWER>-wt/<id> --ref origin/<DEFAULT_BRANCH> --branch next/<id>
# a /heads-down package: one branch for the whole package
node scripts/worktree.mjs cut ../<PROJECT_LOWER>-wt/pkg-<slug> --ref origin/<DEFAULT_BRANCH> --branch pkg/<slug>
```

- Install dependencies in the worktree if the gate needs them.
- `base <b>`: cut from `origin/<b>` instead; land onto `<b>`.
- A worktree already named for the pick: a live process or
  commits beyond the base mean ask (or, under a loop, skip the
  chunk); otherwise close it (§4) and start fresh.
- Uncommitted plan edits set aside before a rebase go to a
  patch in the scratchpad, never a bare `git stash` (other
  sessions share the stash).
- Beat the session's ledger at each step (claim, build, gate,
  close, land): `node scripts/ledger.mjs beat --chunk <id>
  --step <step> --set worktree=<path>` (a crash then resumes
  like a reboot: `customization/sessions.md`).

## 2. The builder's brief

One prompt, self-contained (the builder has none of the lead's
context). It names only values checked in the code:

1. **Where:** the worktree's absolute path and the base sha.
   Every command runs there (`git -C <path>`, or `cd` first).
2. **What:** the chunk line verbatim, the A-IDs it closes with
   their acceptance text, the spec path, and the sections of
   the spec that decide it (Design, Contracts).
3. **How:** `skills/ship-a-chunk.md` steps read-spec through
   tests (read, build, wire, test). Contract first, tests first
   for anything stateful.
4. **Limits:** commit each slice when its tests pass (plain
   messages, no attribution trailers); run only the tests it
   touched, never the full gate; never edit `plan/README.md`,
   a spec's chunk list, `ARCHIVE.md` or `plan/pending/`; never
   push; never `--no-verify`; never leave finished work only
   in the scratchpad.
5. **Return:** the commits (sha + subject), each A-ID with the
   file and test that meets it, the defaults it took, and any
   defect or idea it saw outside its scope.

Dispatch it with the Agent tool, and beat the ledger with
its id (`--set builder=<agent id>`):

- **Interactive** (`/next`, `/heads-down`, `/plot ... and do`):
  in the background (`run_in_background: true`), so the lead
  stays free while it builds. The harness notifies the lead
  when the builder returns; the lead never polls its output.
  Meanwhile, on each notice and between checks, the lead reads
  the board (`node scripts/announce.mjs read`): `REBOOT <slug>`
  means `/reboot-ready <slug>` now, which stops the builder,
  keeps its worktree and the claims, and parks the ledger so
  `/reboot-resume` harvests the builder by its id.
- **Headless** (a cloud tick, any CI job, or `claude -p`;
  `CI` or `GITHUB_ACTIONS` set, or no one at the prompt):
  foreground (`run_in_background: false`), and never pace
  the loop with a wakeup. A background agent dies when the
  job or the print run ends.

## 3. Workflows (L chunks, `--workflow`, `batch`)

Load the `workflow-authoring` skill before writing the script.
The shape, one agent per phase, all in the run's worktree:

| Phase | Agent | Returns |
|---|---|---|
| build | the builder, with §2's brief | commits + A-ID map |
| verify | an adversarial reviewer: reads the diff against each A-ID, runs the touched tests, tries to break the chunk with realistic input; reports only findings it reproduced | findings, each with a repro |
| fix | the builder again, given only the reproduced findings | fix commits, a red-first test per finding |

At most two verify rounds. `batch`: one Workflow per chunk,
each in its own worktree, only for chunks whose paths are
disjoint; landing stays serial, one chunk at a time. A design
handoff's port chunk runs the kit's own script instead,
`scripts/design/port.workflow.js` (`design/port.md`).

While a Workflow runs, the lead sends it nothing (a message
can start a second copy in the same worktree); a requirement
learned meanwhile goes to the next round or the lead's own
commit.

## 4. Harvest and close the worktree

- After any builder or Workflow: list every finding no fixer
  took, every defect named in passing, every A-ID not mapped
  to a test. Each is fixed before landing, or filed (an AUDIT
  row, a candidate) and named in the close.
- A stopped Workflow: keep its committed slices, lay its
  worktree's uncommitted files over them, finish inline.
- Once main (or the PR) holds every commit: `node
  scripts/worktree.mjs close <path>`, never a bare `git
  worktree remove` (the guard refuses it): it unlinks links
  first and deletes the branch once main holds it. A dirty or
  locked worktree is reported, never forced.
