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


**Held** (waits on the owner's word; never picked until the
line goes):

- **35.8** `CLAUDE.md` is the owner's configuration
- **35.9** a release: the owner tags v2.0.0
- **38.3** rulesets on the owner's repo
- **39.4** creates a scratch repo on the owner's account

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 35 | Finish the v2 move, then tag it | [35-finish-v2.md](35-finish-v2.md) | planned · priority 4 | 2 left |
| 38 | Adoption asks the mode; the repo is actually locked | [38-adoption-and-protection.md](38-adoption-and-protection.md) | planned · priority 5 | 1 left |
| 39 | The pull-request cloud loop, proven end to end | [39-cloud-loop-proven.md](39-cloud-loop-proven.md) | planned · priority 6 | 1 left |
| 40 | GUI: the fleet, the plan board, git and Actions | [40-gui-fleet-and-board.md](40-gui-fleet-and-board.md) | planned · priority 2 | 6 left |
| 41 | GUI: steering, tugs, the design, the release | [41-gui-steering-design-release.md](41-gui-steering-design-release.md) | planned | 4 left |

Spec numbers continue from the v1 phase numbers (phases 1–33
are archived; 20 and 32 were the two left blocked when the
plan moved to chunks on 2026-10-20). The next new spec is 42.
New specs arrive through `/plot`, `/messy`, or `/oversight`
promoting a [`CANDIDATES.md`](CANDIDATES.md)
entry. A row whose Status reads `planned · priority N` is
picked after the Asap lane, `priority 1` first; the other
rows follow in table order.

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
- `CANDIDATES.md`'s Pending section holds candidates
  awaiting `/oversight` promotion into specs. Read the file
  for the live count.
- Workflow-file pushes: the cloud tick's token can't push
  `.github/workflows/*.yml` (see `agents.md` "Operational
  secrets"), so chunks that touch them ship from a local
  session (each says so in a sub-bullet).
