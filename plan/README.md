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
line goes; each line is a lock that times out, so it carries
`since:`, `until:` and `max_age:`):

- (none)

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 69 | plan/ carries the workspace: resurrection + a doctor | [69-workspace-resurrection.md](69-workspace-resurrection.md) | planned | not chunked yet |
| 70 | Workspace-aware /bootstrap and /oversight | [70-workspace-aware-bootstrap.md](70-workspace-aware-bootstrap.md) | planned | not chunked yet |
| 71 | Cloud workflow hardening: the canceller skips a paused workflow, ticks wait out a transient limit | [71-cloud-workflow-hardening.md](71-cloud-workflow-hardening.md) | planned | not chunked yet |
| 72 | The gate's tree check reads its directories from the tree diagrams | [72-tree-check-from-diagrams.md](72-tree-check-from-diagrams.md) | planned | not chunked yet |
| 73 | Prompt audit joins the kit's prompt-maintenance story | [73-prompt-audit-story.md](73-prompt-audit-story.md) | planned | not chunked yet |
| 74 | Every step reads the plan live | [74-plan-read-live.md](74-plan-read-live.md) | planned | not chunked yet |
| 75 | Which loop failure modes the gate catches, and which it takes on trust | [75-loop-failure-modes.md](75-loop-failure-modes.md) | planned | not chunked yet |
| 76 | The reboot train against the runtime's own session calls | [76-native-session-primitives.md](76-native-session-primitives.md) | planned | not chunked yet |

Spec numbers continue from the v1 phase numbers (phases 1–33
are archived; 20 and 32 were the two left blocked when the
plan moved to chunks on 2026-10-20). The next new spec is 79.
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
- Workflow-file pushes: since 2026-11-21 a cloud tick lands
  `.github/workflows/*.yml` changes itself (`agents.md`
  "Operational secrets"); no chunk waits for a local session
  on that account.
