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
- **A plot** (its roadmap row and lane entry):
  `plan/pending/plot-<slug>.md`. The new spec file itself is
  written directly: a new file conflicts with nothing.
- **A lone decision or footgun:** `plan/pending/<slug>.md`.
- **A note:** `plan/pending/note-<slug>.md` with a `## Notes`
  section; settle puts it first under the notes file's inbox.

Until it settles, a pending close counts as closed: the next
build treats the chunk as done, and so do the plan gate
(`scripts/plan-check.mjs`), progress and the claims audit.

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

## Footguns
- **new-slug** · the trap → the rule · seen 1× · last 2026-10-14 · open
```

- `close`, `date`, `says` (ten words or fewer, what now works):
  the close's archive line. `commits` is optional: settle
  reads the range from git (the pull request's merge, or the
  commits pushed before the pending file).
- Settle itself takes the chunk line, its sub-bullets and the
  A-IDs it closes out of the spec, keeps the Measure line and
  the roadmap's `N left` true, and takes the chunk out of the
  Asap lane and the roadmap rows. Write `## Edit` sections
  only for anything else: a sub-bullet a later chunk now
  needs, an open question's answer. Each old text must be
  found exactly once on main when it settles; an empty new
  text takes whole lines out with their newline.
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
