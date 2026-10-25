# Skill: plan-a-spec

> **Thinking pass.** Writes, refines or chunks one spec in
> `plan/NN-<slug>.md`. Does NOT modify code. The output is what
> `/ship-a-chunk` builds next.

## 1. Purpose

`/ship-a-chunk` works best when the spec is concrete and its
chunks are cut. If a spec is unchunked, stale, or its chunks
are too big, the shipping loop has to think and ship in the
same tick. `/plan-a-spec` is the dedicated thinking pass that
keeps shipping cheap.

Use when:
- A spec says `Not chunked yet.`.
- A spec's Design is stale: design landed for its surface, or
  a sibling spec shipped primitives it should reference.
- A chunk is plainly bigger than one session and needs a
  split.
- The user wants a refined spec before kicking off
  `/loop /ship-a-chunk`.

The model behind the shape: `nexus/concepts/plan-shape.md`.

## 2. Invocation

```
/plan-a-spec                 # the spec that holds the next ready chunk
/plan-a-spec 05              # that spec
/plan-a-spec 05.3            # split that chunk
```

## 3. Inputs (read in this order)

1. `plan/bearings.md` — stack, contracts, standing decisions.
2. `plan/README.md` — the lanes and the spec's row.
3. `plan/<NN>-<slug>.md` — the spec itself.
4. The canonical sibling spec's shipped code — the closest
   already-built surface, for primitives and patterns.
5. `design/INDEX.md` — file → family map (if a design layer
   exists).
6. `design/decisions.<ext>` — design's own brief; **wins over
   bearings on conflict**.
7. `design/page-<family>.<ext>` — family-specific design (may
   be absent; not blocking).
8. `spec.md` — only if the spec touches a surface bearings
   doesn't describe.

## 4. The spec format (`plan/<NN>-<slug>.md`)

Fixed sections, in order (`nexus/templates/plan/01-bootstrap.md`
and `02-canonical-sibling.md` are the starters):

- **`# NN — <title>`** and a `>` one-line outcome.
- **Why** — the problem; what exists today, verified in code
  and dated.
- **Design** — routes / endpoints / CLI surface (locked from
  bearings), data reads, components, cross-links, states,
  responsive behavior, and **Decisions made upfront (do not
  ask)**.
- **Contracts** — only what pins something.
- **Acceptance** — `- **A<n>** <observable outcome>`; IDs are
  stable, never renumbered or reused.
- **Open questions** — only what a person must answer.
- **Chunks** — `Measure: N open · M closed · next A#`, then
  `- [ ] **NN.k** <title> · S|M|L · closes A… · needs …`.

A spec that leaves open questions a build would trip on fails
its job. **Resolve every ambiguity you can.**

## 5. The procedure

### Step 0 — Sync + load

```bash
git pull --ff-only
```

Read all inputs in §3.

### Step 1 — Pick the spec

No argument: the spec holding the next ready chunk under the
pick order in `plan/README.md` (Asap lane, then table order),
or the first `Not chunked yet.` spec ahead of it. Else the spec
or chunk passed.

### Step 2 — Audit the spec

Check:

- Are design references current?
- Have shipped chunks introduced primitives this spec should
  reference?
- Are its decisions still valid given new bearings entries?
- Does every A-ID describe an observable outcome?
- Is every chunk S, M or L for real (L = one session at most)?

If fully current and chunked: return cleanly with "spec still
current — no changes."

### Step 3 — Compose or refine

Walk the format (§4). Derive each section from the inputs. Make
decisions; record them under "Decisions made upfront".

**Order of authority for decisions:**

1. `design/decisions.<ext>` SETTLED list (highest authority).
2. `plan/bearings.md` standing decisions (project-wide).
3. Spec-specific calls.

If `decisions.<ext>` and `bearings.md` disagree, design wins.
Update `bearings.md` in a separate prior commit
(`plan: align bearings with design`).

### Step 4 — Chunk

Cut the spec into vertical slices, each of which ships
something runnable and tested:

1. Size each S (about an hour), M (a few hours) or L (one
   session at most). Bigger → split again.
2. Give each `closes` (or `partial`) the A-IDs it finishes.
   Every A-ID is covered by some chunk.
3. `needs` names exact chunk ids that must land first, or `—`.
   Prefer a chain that lets the first chunk ship today.
4. Number chunks `NN.1`, `NN.2`, … in build order. A split of
   an existing chunk keeps its id as a prefix (`NN.3a`,
   `NN.3b`) and divides its A-IDs; ids are never reused.
5. Write the `Measure:` line: `open` = A-IDs listed, `closed`
   unchanged, `next` = one past the highest ID ever issued.
6. Update the spec's row in `plan/README.md` (`N left`).

### Step 5 — Reality-check against the codebase

Open the canonical sibling's code. Confirm every primitive the
spec references exists. If one is missing: add it to a chunk's
scope, or add a chunk for it (with a new A-ID if it is a new
outcome).

### Step 6 — Gate + commit

```bash
node scripts/plan-check.mjs --since HEAD
git add plan/<NN>-<slug>.md plan/README.md
git commit -m "$(cat <<'EOF'
plan: chunk spec <NN> — <title>

- <K> chunks (<S/M/L mix>), covering A<i>–A<j>.
- N decisions resolved upfront (see Design).
- Design export: <yes / pending>.
EOF
)"
# land per owner mode: skills/next/land.md §6
```

### Step 7 — Done

Return a 2-line summary: "spec <NN> chunked — <K> chunks, next
<NN.1>. ready for /ship-a-chunk."

## 6. New specs (rare)

If planning shows the plan is missing an initiative entirely:

- Write `plan/<NN>-<slug>.md` with the next free number (spec
  numbers are never reused either).
- Add its row to `plan/README.md` where it belongs in build
  order.
- Commit it alone (`plan: add spec <NN> for <topic>`), with
  the rationale in the body; the user reviews these more
  carefully. Promoted `/expand` candidates arrive this way via
  `/oversight`.

## 7. Hard rules

1. **Never modify code in shipped paths.** Chunking may add
   primitives to a chunk's scope, but they ship via
   `/ship-a-chunk`, not here.
2. **Never renumber or reuse an A-ID, a chunk id or a spec
   number.**
3. **No emojis, no `Co-Authored-By:`.**
4. **Contracts in `bearings.md` are law** — never propose
   shapes that contradict them.
5. **`plan-check` green before the commit.**

## 8. Failure modes

1. **The spec's row or outcome is itself ambiguous.** Fix the
   outcome first in its own commit; retry. If it can't be
   clarified without user input, put the spec in the **Held**
   lane with the question (`- **<NN>** · held: <question> ·
   since: <today> · until: the owner answers · max_age: 14d`),
   and stop.
2. **Design contradicts a contract.** Surface it; do not
   silently re-decide the contract.

## 9. Quick reference

```bash
# Reads (in this order)
plan/bearings.md                     # contracts, standing decisions
plan/README.md                       # lanes + the spec's row
plan/<NN>-<slug>.md                  # the spec being refined
design/                              # exports, if any landed
plan/AUDIT.md                        # open findings that touch the spec

# Writes
plan/<NN>-<slug>.md                  # design, acceptance, chunks (the deliverable)
plan/README.md                       # the row's N left; a new row for a new spec

# Commands
git pull --ff-only                   # Step 0
node scripts/plan-check.mjs --since HEAD
git commit                           # plan-only commit; land per owner mode
```
