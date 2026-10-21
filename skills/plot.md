# Skill: plot (nexus)

> **Plan, then (optionally) do.** A task leaves `/plot` as spec
> text, acceptance IDs and chunks with a place in `/next`'s
> order, so a later `/next` builds it without anyone
> remembering. `and do` builds it in the same run, so even a
> quick fix is planned, built and archived. Raw ideas go to
> `/messy`; bugs to `/bug`.

## 1. Purpose

Saying "we should also…" costs nothing; making it happen means
research (is it built? planned?), a shape (spec, A-IDs,
chunks), and a slot in line. `/plot` does all three and shows
where the work landed: an ASCII picture of the build order
before and after. The same verb runs for everyone; owner mode
decides only how it lands (owner: straight to main, settled;
contributor: a pull request that contributes the plot, so a
contributor's plan additions are reviewed like code).

## 2. Invocation

```
/plot "<task>"                 # work out the slot, and say why
/plot asap "<task>"            # onto the Asap lane: built before anything else
/plot anytime "<task>"         # no priority: table order, after every priority row
/plot peek "<task>"            # research and slot only; change nothing
/plot ... and do               # also build it now (or --do): plot, build, close, land as one unit
```

## 3. Procedure

### Step 0 — Orient

`git fetch origin`; the primary checkout gets diligence only
(on `main` and clean: `git pull --ff-only`). Read
`plan/README.md` (table, lanes), the last ~15 lines of
`plan/ARCHIVE.md`, `plan/bearings.md`'s standing decisions (or
`identity/principles.md` and the open lines of
`identity/footguns.md`, where the repo has that layer), and the
specs the task touches. `node scripts/announce.mjs read`. Save
the **before** picture: `node scripts/plan/order.mjs --ref
origin/main`.

### Step 1 — Research (the heavy lift is yours)

- Restate the task in 1-3 lines, in the asker's terms.
- Find what exists: grep the code, the specs, `plan/pending/`
  and the decisions. Mark each part *already built*, *already
  planned* (spec, A-ID) or *new*. Don't plan what is done; link
  what is planned.
- **Existing features first.** Before designing anything new,
  name the smallest version built from what exists: an entry
  point, a link, a button that reaches a feature already built.
  Say what it covers and what it can't.
- Work out what it changes: the decisions it touches, the data
  and contracts it adds, the specs it crosses, the order it
  forces.
- **A principle or standing decision it would break stops the
  run:** ask (AskUserQuestion, before the first write); under a
  loop, park it in the `/oversight` queue and stop. Changing a
  principle is a recorded decision, never a side effect.

### Step 2 — Shape it

- **The small version first:** Step 1's version on existing
  features is the first chunk(s); a new flow follows only for
  what it can't do. When the small version does the whole task,
  plot only it.
- **Extend the spec that owns it** (new A-IDs after its last,
  new chunks after its last), or write a new
  `plan/<NN>-<slug>.md` in the spec format
  (`concepts/plan-shape.md`: why, Design, Acceptance with
  A-IDs, Open questions, Chunks). Several specs: each gets its
  part; a cross-spec A-ID closes at this spec's boundary,
  naming the other's.
- Chunking rules (`concepts/plan-shape.md`): stable
  A-IDs, never renumbered; sizes S/M/L (split anything bigger
  into vertical slices); every A-ID closed by a chunk;
  contract-first chunks first; a true `Measure:` line; `needs`
  names exact chunk ids (timing goes in `needs`, never prose).
- A lasting choice gets a `(proposed)` decision (`D?<slug>`).
  Questions only the owner can answer go in the spec's Open
  questions.

`peek` stops here: say where it would go and what it would take.

### Step 3 — Slot it

- `asap`: append the chunk ids to the Asap lane, contract-first
  first. `/next` builds lane chunks before anything else once
  their needs are done; it never interrupts a chunk in flight.
- `anytime`: no marker; the row sits in table order.
- *(no word)*: choose, and say why in one line: the Asap lane,
  a `priority N` on the row (never demote a priority the owner
  set without asking), chunks inside an existing priority spec
  gated by `needs`, or table order. Weigh what it needs and
  what needs it, the priorities set, risk (contracts before
  builders), cost.

### Step 4 — Write, in a worktree

1. **Worktree** (never the primary checkout), cut from
   `origin/main`: owner, detached at
   `../nexus-wt/plot-<slug>`; contributor, on branch
   `plot/<slug>`.
2. **A new spec's number** is above every spec on origin, in
   `ARCHIVE.md` and in every open PR (`gh pr list --json files
   --jq '.[].files[].path' | grep '^plan/[0-9]'`). Reserve it:
   `node scripts/claims.mjs claim <NN>` (refused: take the next).
   The new spec file is written directly: a new file conflicts
   with nothing.
3. **Everything shared goes in one pending file**,
   `plan/pending/plot-<slug>.md` (`plan/pending/README.md`;
   `date:` front matter first): `## Edit plan/README.md` for the
   row (status, progress, priority) and the lane entry, `## Edit`
   for an existing spec it extends, the root `README.md`'s
   roadmap if it lists specs, and `## Decisions` for a
   `(proposed)` decision. Each old text quotes enough to be
   found exactly once.
4. The gate (`node scripts/verify.mjs`),
   foreground. Commit `plan: plot <what>`, the body saying why
   this slot.
5. The **after** picture: `node scripts/plan/order.mjs --mark
   <new chunk ids>` (it reads the pending edits as settled).

### Step 5 — `and do` (only when asked)

Build the plotted chunks in order in the same worktree, each
as `/next` Steps 3-4 (`skills/next.md`): claim the chunk
(release the spec number's reservation first), delegate the
build by size, gate, write its pending close. Contributor: on
`plot/<slug>`, so plot and build are one pull request. A chunk
that turns out bigger than the run: stop doing, keep the plot,
say what's left.

### Step 6 — Land per owner mode

- **Owner:** `git rebase origin/main`, `node
  scripts/plan/settle.mjs --no-commit` (folds the plot, and any
  close, in), the gate, commit with settle's message, `git push
  origin HEAD:main` (`skills/next/land.md` §3; a
  spec `and do` emptied is absorbed in that commit). Rejected:
  fetch, rebase, settle, gate, retry.
- **Contributor:** `git push -u origin plot/<slug>`; `gh pr
  create --title "plan: plot <what>"`, the body holding the
  before/after pictures. Never settle.
- Release the spec-number claim once main (or the PR) holds the
  spec; close the worktree with `node scripts/worktree.mjs
  close <path>`.

### Step 7 — Report and retro

The before and after pictures (in flight, then next, the new
chunks marked), then: the small version or a new flow and why;
the chunks (id, size, closes, needs); when `/next` builds them
and what could move that; the open questions; one line to move
it (`/plot asap …`, or `/next <id>` to build it now). Retro as
`/next` Step 6, briefly.

## 4. Hard rules

1. Never plan what is built; link what is planned.
2. Shared plan files change only through the pending file.
3. A principle the task would break is asked, never decided.
4. `and do` is off unless asked; the plot always lands, even
   when the doing stops early.

## 5. Failure modes

- **The task is already built:** say where, plot nothing.
- **It needs an owner's call before it can be shaped:** ask
  before the first write; under a loop, park it in the
  `/oversight` queue and stop.
- **The pending edit won't apply** (main moved under it):
  re-quote the old text against origin and retry once.

## 6. Quick reference

```bash
node scripts/plan/order.mjs --ref origin/main   # before
node scripts/plan/order.mjs --mark 07.4,07.5               # after (reads pending edits as settled)
node scripts/claims.mjs claim <NN>                          # reserve a new spec number
node scripts/plan/settle.mjs --no-commit                    # owner: land it settled
```
