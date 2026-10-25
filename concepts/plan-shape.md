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
├── pending/             # plan changes waiting for the owner's settle (one file each)
├── nexus.lock           # the kit version this plan's shape follows
├── bearings.md          # standing context (unchanged from v1)
├── AUDIT.md · CRITIQUE.md · CANDIDATES.md   # the queues (unchanged)
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
| `secrets` | Optional, after `needs`: the secrets the chunk needs, by name only (`· secrets VERCEL_TOKEN, CF_API_TOKEN`, comma or space separated). Each must be declared in `nexus.secrets.json` ([`customization/secrets.md`](../customization/secrets.md)). |
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
3. rows marked `priority N` (1 first), then the spec table, in
   table order;

and within a spec, the first chunk whose `needs` are done.
Chunks in the **Held** lane wait on a person's word and are
never picked, though never forever: each Held line is a lock
that times out (below). A candidate `/expand` promoted on its own
(`Promote: aged`) waits there for its veto window, on a line
`scripts/plan/promote.mjs` writes and `plan-check` parses:

```
- 59 · auto-promoted, veto until 2026-10-28 (#123) · max_age: 3d · fallback: release
```

`/march` sweeps those lines at Step 0. A closed issue is a
veto: the spec, its row and the line go, and `ARCHIVE.md` gets
`- <date> · 59 · spec vetoed: <title> (#123) · plan only`. An
open issue past its date is a release: the line goes and the
spec is picked as usual. `scripts/plan/order.mjs` plays this order
forward (each pick counted done for what needs it), so
`/plot` can show where a new task lands before and after it
slots it in: `/plot asap` appends to the Asap lane, `/plot
anytime` leaves the row in table order.

## Locks time out

A lock is anything that stops the loop until a person or a
condition says go: a Held line, a lane lock in a lanes file
(`skills/march.lanes.md`), an owner-blocked row in
`AUDIT.md` or `CRITIQUE.md`. A lock with no end holds
forever: a lane "locked until the gap table reads zero" that
nothing ever zeroes stops its loop for good. So every lock
carries its own timeout, as fields joined by ` · `:

```
- **07.3** · blocked: the token lacks scope · since: 2026-10-20 · until: the owner rotates it · max_age: 14d
- lock: gap-table · since: 2026-10-01 · until: the gap table reads zero · max_age: 21d · fallback: release
```

| Field | Means |
|---|---|
| `since:` | the day the lock was set (`YYYY-MM-DD`); its age counts from here |
| `until:` | a date, or a condition in words; a date gone by ends the lock too |
| `max_age:` | how long it may hold, `<n>d`; `Lock max age` in `bearings.md` (14d) is the default outside the Held lane |
| `fallback:` | optional: what the loop does once it is past its time |
| `lock:` | the lock's name outside the Held lane (a Held line is named by its id) |

An auto-promoted Held line already has all of it: its `veto
until` date is its until, and its since is that date less its
`max_age`. `/march` sweeps the locks at Step 0, after the veto
sweep (`node scripts/plan/locks.mjs sweep --write`). Past its
time a lock relaxes to its fallback: `release` takes the line
out, any other fallback is applied by the tick. With none
declared, the loop files exactly one needs-user ask, a `Lock
past max_age: <slug>` issue (plus `notify.mjs` in a repo that
has it), re-pinged weekly by comment and listed first in
`/oversight`; the ask closes once the lock is gone. Answer it
by removing the lock, setting a new `since:`, or adding a
`fallback:`.

## State diet

`AUDIT.md`, `CANDIDATES.md` and `CRITIQUE.md` are read by
nearly every tick, so whatever they carry, every tick pays to
read. A header that logs every pass grows without bound: one
such audit file reached 2,237 header lines before its first
finding. Three rules keep the queues cheap:

| Rule | Holds |
|---|---|
| The header is metadata | The lines above the first `##` heading keep the title, `> Last pass:`, `> Pass count:` and `> Posture:` (`AUDIT.md`'s durable `> Bias:` too): 20 lines at most. What a pass did goes in its commit body. |
| A queue file has a ceiling | At most `NEXUS_STATE_MAX_KB` kilobytes (256 by default). |
| Old Done rows go | A Done row (`### [x]`, or any row under `## Done`) closed more than 30 days ago is deleted; git keeps it, the commit body gives the count. Never moved to `ARCHIVE.md`, whose lines are chunk-shaped and parsed by the gate. |

`node scripts/plan/state.mjs check` reports a breach (exit 1;
add it to your gate). `/iterate` runs `node
scripts/plan/state.mjs compact --write` when it ticks a
finding: a row's close date is its `closed <date>`, else the
day its heading last changed (`git blame`), else the latest
date it carries; a row with no date stays.

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

## Closing from a branch: pending files and settle

The steps above edit shared files (the spec, the roadmap, the
archive), and two branches closing chunks at once conflict on
every one of them. So a branch never edits them. It closes its
chunk with one new file, `plan/pending/<chunk id>.md`:

```md
---
close: 07.3
date: 2026-10-20
says: Empty query shows the empty state
---
```

plus optional `## Edit <path>` sections (exact old text, found
exactly once at settle), `## Add plan/NN-<topic>.md` (new work
for an open spec, below), `## Decisions` (`D?<slug>`, numbered at
settle) and `## Footguns`. Two branches never write the same
file, so the plan never conflicts. Only the owner settles: on
main, `node scripts/plan/settle.mjs` folds every pending file
into steps 1-4 above, in date order, and commits once; a file
that won't apply is skipped with its reason and the rest
settle. Until then every reader counts a pending close as
closed: the next build skips the chunk, and the gate's history
check accepts its pending file in place of the archive line.

The owner's own work may skip the pending file and close
in place, since nothing races it on main; a contributor's pull
request always carries pending files. The format, the settle
rules and the per-repo config (`plan/settle.json`) are in
`templates/plan/pending/README.md` and
`templates/scripts/plan/`. The mechanism was learned from a
mature adopter whose loops and people closed chunks in
parallel for months.

### Extending a spec from a branch

New work for an open spec (an A-ID, a chunk, a question, a
paragraph of Design) never quotes the spec's moving lines: its
last A-ID or chunk, its Measure line, the roadmap's `N left`.
Every branch extending that spec would quote the same ones,
and only the first would settle. The pending file carries an
`## Add plan/NN-<topic>.md` instead, its ids written
`A?<slug>` and `NN.?<slug>`; settle numbers them past the spec
and `ARCHIVE.md` in merge order, places each part at the end
of its section and keeps the counts, so a dozen branches can
add to one spec at once. `## Edit` stays for rewriting text
that is already there (two rewrites of one paragraph still
collide), and a new chunk can't `needs` one still in another
open pull request. This too was learned from a mature adopter.

## The gate

`scripts/plan-check.mjs` (a template; adopters add it to their
verify composition) makes the shape mechanical:

- every spec has `## Acceptance`, `## Chunks` and a true
  `Measure:` line;
- every chunk line parses, belongs to its spec, and names only
  A-IDs the spec lists; every A-ID is covered;
- every `needs` resolves; every `secrets` name is declared in
  `nexus.secrets.json` (beside `plan/`), which keeps its shape;
  the roadmap links every spec and no
  spec that is gone, each row's `N left` is true, and the
  Asap/Held lanes name only chunks (or specs) still in the
  plan; an auto-promoted Held line keeps its shape and holds
  a spec still in the plan, and every other Held line carries
  `since:`, `until:` and `max_age:`; `ARCHIVE.md` lines parse;
- with `--since <ref>`: a chunk that left the plan has its
  archive line (or was split into suffixed children), a
  deleted spec has its spec-complete line (a vetoed
  auto-promotion its spec-vetoed line), and no `next` or
  `closed` count went backwards. A ref that does not resolve
  is a failure, never a skipped check.

It reads `plan/` as it will read once settled: each pending
file's `## Edit` and `## Add` sections applied in memory
(`scripts/plan/settled.mjs`), so a contributor's plot passes
before the owner settles it, and a pending file settle would
skip is a failure.

nexus runs the same script on its own plan as the `chunks` leg
of `node scripts/verify.mjs`.

## Pinning the shape: `plan/nexus.lock`

The plan shape is a breaking change between kit versions, so
each adopter records which one it follows:

```
# plan/nexus.lock: the nexus kit version this repo follows.
kit: nexus
version: 2.0.0
ref: v2.0.0
shape: chunks
adopted: 2026-10-20
```

(`ref:` names the kit tag the repo reads: `v2.0.0` for
chunks. Following `main` instead is allowed, and means taking
unreleased changes.)

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
