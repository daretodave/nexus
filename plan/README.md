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

- (none)

**Held** (waits on the owner's word; never picked until the
line goes):

- (none)

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 20 | Cloud ticks run synchronously: no background agent dispatch in a tick | [20-synchronous-agents.md](20-synchronous-agents.md) | planned (local session: workflow files) | 1 left |
| 32 | Heartbeat watches armed-ness of every scheduled workflow, and night's cadence | [32-workflow-disable-watch.md](32-workflow-disable-watch.md) | planned (local session: workflow files) | 2 left |

Spec numbers continue from the v1 phase numbers (phases 1–33
are archived; 20 and 32 were the two left blocked when the
plan moved to chunks on 2026-10-20). The next new spec is 34.
New specs arrive through `/oversight` promoting a
[`PHASE_CANDIDATES.md`](PHASE_CANDIDATES.md) entry.

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
  session. Specs 20 and 32 are both of that kind.
