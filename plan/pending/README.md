# plan/pending: plan changes waiting to settle

A branch never edits a shared plan file (a spec's chunk list,
`plan/README.md`, `ARCHIVE.md`, the decisions, the footgun
list). It adds one file here instead, and settle
(`node scripts/plan/settle.mjs`) turns it into those edits on
main, one run at a time. Two branches never write the same
file, so pull requests never conflict on the plan.

Only the owner settles: a checkout with an untracked `.owner`
file at its root and owner mode on (`scripts/owner.mjs`). A
contributor's pull request carries its pending files; the
owner's settle folds them in after the merge, all at once.

- **A chunk's close:** `plan/pending/<chunk id>.md`.
- **A plot** (its roadmap row and lane entry, its new work for
  an open spec): `plan/pending/plot-<slug>.md`. A new spec file
  itself is written directly: a new file conflicts with
  nothing.
- **A lone decision or footgun:** `plan/pending/<slug>.md`.
- **A note:** `plan/pending/note-<slug>.md` with a `## Notes`
  section; settle puts it first under the notes file's inbox.

Until it settles, a pending close counts as closed: the next
build treats the chunk as done, and so do the plan gate
(`scripts/plan-check.mjs`), progress and the claims audit;
the gate and `order.mjs` read the whole plan as settled.

```md
---
close: 07.3
date: 2026-10-14
says: Empty query shows the empty state
footguns: guard-test-noop
---
## Edit plan/07-search.md
~~~ old
the empty copy
~~~
~~~ new
the empty copy (locked in Design)
~~~

## Decisions
- **D?empty-copy** · 2026-10-14 · The copy is locked in the spec. *Why:* one voice.

## Add plan/07-search.md
~~~ acceptance
- **A?zip** A zip alone finds the offices in it.
~~~
~~~ chunks
- [ ] **07.?zip** Search by zip · S · closes A?zip · needs —
  - The resolver takes a bare zip.
~~~

## Footguns
- **new-slug** · the trap → the rule · seen 1× · last 2026-10-14 · open
```

- `close`, `date`, `says` (ten words or fewer, what now works):
  the close's archive line. `commits` is optional: settle
  reads the range from git (the pull request's merge, split
  per close in a package; or the commits pushed before the
  pending file, back to the last settle, close or archive
  write, and the pending file's own commit when it carries
  work too).
- Settle itself takes the chunk line, its sub-bullets and the
  A-IDs it closes out of the spec, keeps the Measure line and
  the roadmap's `N left` true, and takes the chunk out of the
  Asap lane and the roadmap rows. Write `## Edit` sections
  only for anything else: a sub-bullet a later chunk now
  needs, an open question's answer. Each old text must be
  found exactly once on main when it settles; an empty new
  text takes whole lines out with their newline.
- `## Add plan/NN-<topic>.md` extends an existing spec without
  quoting a line of it, so any number of branches add to one
  spec and none collide (learned from a mature adopter, where
  a dozen branches extending one spec all quoted its last
  chunk, Measure line and `N left`, and only the first
  settled). Its parts are fenced: `~~~ acceptance`
  (`- **A?<slug>** …`), `~~~ chunks` (`- [ ] **NN.?<slug>** …`,
  sub-bullets at any depth), `~~~ questions` (`- …`, numbered
  when the spec's list is) and `~~~ section <Heading>` (text for
  the end of that `## ` section; a new one before
  `## Acceptance` when it's absent). At settle, in merge order
  (date, then name), `A?<slug>` takes the Measure line's next
  A-ID and `NN.?<slug>` the next chunk number past the spec and
  `ARCHIVE.md`, in this file and in its `## Edit` texts (an
  Asap lane entry); each part goes at the end of its section,
  and the Measure line and the roadmap's `N left` count again.
  A placeholder no Add defines is refused. `## Edit` of a spec
  is for rewriting its existing text only.
- Two limits: a rewrite still quotes its old text, so two
  branches rewriting one paragraph still collide; and a new
  chunk can't `needs` a chunk still in another open pull
  request (it has no number until that settles).
- `D?<slug>` is a decision's number before it has one. Write
  it anywhere (a spec, a code comment); settle replaces every
  one in the repo.
- `footguns:` lists sightings: settle bumps `seen` and `last`.
  One that reaches 2× while open gets an `automate <slug>`
  chunk in the ladder spec with an Asap lane entry, and so does
  a new `## Footguns` line that arrives open at 2× or more. The
  ladder spec is settle's own: it opens it with its row when
  it's gone and removes it when it empties.
- What differs between repos (a build-queue file, the ladder's
  spec number, the footgun budgets, the editable paths) lives
  in `plan/settle.json`; see `scripts/plan/config.mjs`.
