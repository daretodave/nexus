# nexus roadmap (nexus on nexus)

> What is still to build for the kit, one spec per initiative,
> each ending in chunks sized to one session. `/march` and
> `/ship-a-chunk` pick from here; a finished chunk leaves as
> one line in [`ARCHIVE.md`](ARCHIVE.md). The plan only
> shrinks. The shape is the one the kit teaches:
> [`concepts/plan-shape.md`](../concepts/plan-shape.md).

---

Style guardrails for every chunk: match the voice exemplars
in [`bearings.md`](bearings.md); every new doc discoverable
(linked + in the README tree) in the same commit; every new
invariant teaches the gate in the same commit; hard-wrap
~62–64 cols.

## Lanes

**Asap** (built before the table, in this order, once their
needs are done):

- **34.1** the README's front door, now that the GUI ships
- **34.2** the three doors themselves
- **41.1** magical steering: answers reach a terminal session at once
- **41.2** the tugs, readable at a glance
- **37.1** a crashed overnight loop resumes from its ledger

**Held** (waits on the owner's word; never picked until the
line goes):

- **41.3** waits on the Claude Design export from the owner
- **41.4** a release: the owner pushes the tag (or says go)
- **41.5** the owner's npm account
- **35.8** `CLAUDE.md` is the owner's configuration
- **35.9** a release: the owner tags v2.0.0
- **38.3** rulesets on the owner's repo
- **38.4** the owner's checkout hooks and permission config
- **39.4** creates a scratch repo on the owner's account

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 32 | Heartbeat watches armed-ness of every scheduled workflow, and night's cadence | [32-workflow-disable-watch.md](32-workflow-disable-watch.md) | planned (local session: workflow files) | 2 left |
| 34 | README terraform: three doors, one art style | [34-readme-three-doors.md](34-readme-three-doors.md) | planned | 2 left |
| 35 | Finish the v2 move, then tag it | [35-finish-v2.md](35-finish-v2.md) | planned · priority 4 | 9 left |
| 36 | Script hardening: paths, races, tests | [36-script-hardening.md](36-script-hardening.md) | planned · priority 1 | 9 left |
| 37 | Sessions carry their names; every skill lands per owner mode | [37-sessions-and-landing.md](37-sessions-and-landing.md) | planned · priority 3 | 5 left |
| 38 | Adoption asks the mode; the repo is actually locked | [38-adoption-and-protection.md](38-adoption-and-protection.md) | planned · priority 5 | 4 left |
| 39 | The pull-request cloud loop, proven end to end | [39-cloud-loop-proven.md](39-cloud-loop-proven.md) | planned · priority 6 | 4 left |
| 40 | GUI: the fleet, the plan board, git and Actions | [40-gui-fleet-and-board.md](40-gui-fleet-and-board.md) | planned · priority 2 | 10 left |
| 41 | GUI: steering, tugs, the design, the release | [41-gui-steering-design-release.md](41-gui-steering-design-release.md) | planned | 5 left |

Spec numbers continue from the v1 phase numbers (phases 1–33
are archived; 20 and 32 were the two left blocked when the
plan moved to chunks on 2026-10-20). The next new spec is 42.
New specs arrive through `/plot`, `/messy`, or `/oversight`
promoting a [`PHASE_CANDIDATES.md`](PHASE_CANDIDATES.md)
entry.

> **When no chunk is ready,** `/march` transitions to
> `/iterate`: the audit dimensions (drift, completeness, voice,
> friction, freshness, lessons) always have food, and
> `/expand` grows the candidates from evidence.

## Chunks, measure, archive

- A chunk line: `- [ ] **NN.k** <title> · S|M|L · closes A1 ·
  needs —`. S ≈ an hour, M a few hours, L one session at most.
- Closing a chunk, in its shipping commit: line out, its A-IDs
  out, the `Measure:` line fixed, `needs` and lanes cleaned,
  the row's `N left` updated, one line in `ARCHIVE.md`.
- A spec with nothing left: its lasting rules move into
  `bearings.md` or the doc it shipped, the file is deleted,
  and the archive gets `· NN · spec complete: …`.
- The gate's `chunks` leg (`node scripts/verify.mjs`) checks
  all of it against HEAD.

## Carry-overs

- `AUDIT.md`'s Pending section holds iterate-sized findings;
  they wait until no chunk is ready. Read the file for the
  live count.
- `PHASE_CANDIDATES.md`'s Pending section holds candidates
  awaiting `/oversight` promotion into specs. Read the file
  for the live count.
- Workflow-file pushes: the cloud tick's token can't push
  `.github/workflows/*.yml` (see `agents.md` "Operational
  secrets"), so chunks that touch them ship from a local
  session. Spec 32 is of that kind.
