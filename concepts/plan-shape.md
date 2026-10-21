# The plan shape: specs, chunks, acceptance IDs

> The plan is a list of what is still to build, and nothing
> else. Each initiative is a spec; each spec ends in chunks
> sized to one session; each chunk closes acceptance IDs that
> never change. A finished chunk leaves the plan as one archive
> line. The plan only shrinks: progress is what's left.

---

This is the plan shape from nexus v2 onward. v1 planned in
phases (a build-plan status block plus one brief per phase);
that shape is frozen at the `v1.0.0` tag, and
[`playbooks/upgrade.md`](../playbooks/upgrade.md) moves a v1
plan to this one. The shape was learned from a mature adopter
that ran it for months with several people and loops building
from one plan at once.

## Why not phases

Phases worked for one loop on one branch. They broke down in
three places once the loop ran longer and wider:

| Phase-shape problem | What the chunk shape does instead |
|---|---|
| A phase is as big as the brief says. Some took one tick, some took five, and the loop couldn't tell which it was in. | A chunk is S, M or L, and L is at most one session. Anything bigger is split into vertical slices before it is built. |
| The build plan only grows: `[x]` rows, a phase log, carry-overs. Every reader pays to skip the history. | A finished chunk's line is removed. Its one record is a line in `ARCHIVE.md`; git keeps the rest. |
| "Done" is a tick someone remembered to flip. Scope dropped silently when a brief was rewritten. | Acceptance bullets carry stable IDs. Every chunk says which IDs it closes, and the `Measure:` line counts them, so nothing falls out of scope unnoticed. |

## The files

```
plan/
├── README.md            # the roadmap: lanes + one row per spec (what /next reads)
├── NN-<slug>.md         # one spec per initiative, written before the code
├── ARCHIVE.md           # one line per finished chunk; append-only
├── nexus.lock           # the kit version this plan's shape follows
├── bearings.md          # standing context (unchanged from v1)
├── AUDIT.md · CRITIQUE.md · PHASE_CANDIDATES.md   # the queues (unchanged)
```

Lasting rules and decisions do not live in specs. When a spec
finishes, what should outlive it moves to `identity/` (or to
`bearings.md`'s standing decisions, until an `identity/` layer
is adopted), and the spec file is deleted.

## A spec

A spec is written before the code, contract first. Its
sections, in order:

| Section | Holds |
|---|---|
| `# NN — <title>` + a `>` one-line outcome | What is true when the spec is done. |
| `## Why` | The problem, and what exists today (verified in code, dated). |
| `## Design` | How it works. Decisions made upfront: a spec that leaves open questions fails its job. |
| `## Contracts` | Only what pins something: routes, schemas, file formats, flags. |
| `## Acceptance` | Bullets with stable IDs: `- **A1** <observable outcome>`. |
| `## Open questions` | Only questions a person must answer; each is removed once its answer sits where it acts. |
| `## Chunks` | The `Measure:` line, then one line per chunk still to build. |

## Acceptance IDs and the Measure line

Acceptance IDs (A-IDs) are numbered once and never renumbered
or reused. Closing one removes its bullet; the next new
acceptance bullet takes the next free number. The `## Chunks`
section opens with:

```
Measure: 2 open · 5 closed · next A8
```

`open` is the number of A-IDs still listed; `closed` counts
the ones removed (closed, or dropped with an archive line);
`next` is the next free ID. So `open + closed = next − 1`
always holds, and the gate checks it.

## A chunk

```
- [ ] **07.3** Empty state for a query with no results · S · closes A4 · needs 07.2
  - Copy is locked in the spec's Design section.
```

| Field | Rule |
|---|---|
| id | `NN.k`: the spec's number, a dot, a sequence. Never reused. A split child takes a suffix (`07.3a`). |
| title | What now works, in a few words. |
| size | `S` (about an hour), `M` (a few hours), `L` (one full session at most). Bigger → split into vertical slices that each ship something runnable and tested. |
| `closes` / `partial` | The A-IDs it finishes or advances. Splitting a chunk divides its IDs among the children. Once a spec is chunked, every A-ID is covered by some chunk. |
| `needs` | Exact chunk ids (or a whole spec's number) that must be done first, or `—`. A need is done when its line is gone from every spec. |
| sub-bullets | Only real requirements carried from work already done. Not history, not a diary. |

A spec that is written but not yet chunked says `Not chunked
yet.` under `## Chunks`; the first build that picks it chunks
it first.

## The roadmap and the pick order

`plan/README.md` holds the lanes and one row per spec (with
its `N left`). Whatever builds the next chunk (`/next`, or
`/march` in a loop) picks in this order:

1. an explicit argument (`/next 07.3`);
2. the **Asap** lane, in its written order;
3. the spec table, in table order;

and within a spec, the first chunk whose `needs` are done.
Chunks in the **Held** lane wait on a person's word and are
never picked.

## Closing a chunk

Closing is one atomic act with the code:

1. remove the chunk's line and its sub-bullets;
2. remove the A-IDs it `closes`, and update the `Measure:`
   line (`open` down, `closed` up);
3. remove the chunk from other chunks' `needs` and from the
   lanes;
4. append one line to `ARCHIVE.md`:
   `- 2026-10-20 · 07.3 · Empty query shows the empty state · a1b2c3d`
   (date, chunk, what now works in ten words or fewer, commit
   or commit range);
5. when the spec has nothing left, absorb its lasting rules
   into `identity/`, delete the file, and archive
   `- <date> · 07 · spec complete: Search · absorbed into identity · deleted in <sha>`.

No ticked boxes, no "learned" notes, no struck-through lines
stay in a spec. The plan grows only by a justified increase in
scope, stated in the commit body.

## The gate

`scripts/plan-check.mjs` (a template; adopters add it to their
verify composition) makes the shape mechanical:

- every spec has `## Acceptance`, `## Chunks` and a true
  `Measure:` line;
- every chunk line parses, belongs to its spec, and names only
  A-IDs the spec lists; every A-ID is covered;
- every `needs` resolves; the roadmap links every spec;
  `ARCHIVE.md` lines parse;
- with `--since <ref>`: a chunk that left the plan has its
  archive line, a deleted spec has its spec-complete line, and
  no `next` or `closed` count went backwards.

nexus runs the same script on its own plan as the `chunks` leg
of `node scripts/verify.mjs`.

## Pinning the shape: `plan/nexus.lock`

The plan shape is a breaking change between kit versions, so
each adopter records which one it follows:

```
# plan/nexus.lock: the nexus kit version this repo follows.
kit: nexus
version: 2.0.0-pre
ref: main
shape: chunks
adopted: 2026-10-20
```

(`ref:` becomes the `v2.0.0` tag once v2 is released; until
then v2 adopters follow `main`.)

A repo with no lock file is on v1 (phases). Skills read the
lock's `shape:` before they read the plan; to stay on v1, pin
`ref: v1.0.0` and read the kit at that tag. The move is in
[`playbooks/upgrade.md`](../playbooks/upgrade.md).

## See also

- [`concepts/architecture.md`](architecture.md): where the
  plan sits among the three layers.
- [`playbooks/upgrade.md`](../playbooks/upgrade.md): v1 → v2.
- `nexus/templates/plan/`: the roadmap, archive, lock and two
  starter specs.
