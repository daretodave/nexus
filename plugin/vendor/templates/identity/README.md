# identity/: what stays

`plan/` is where work goes to get done and then disappears.
`identity/` is what stays: the durable truth about <PROJECT>,
what it promises and will never do, the decisions nobody wants
to relitigate, the words it uses, and the traps building it
has taught. Every finished spec leaves its lasting parts here
before it is deleted, so over the years this folder becomes the
project. Write it to make sense in five years to someone who
wasn't here.

| File | Holds | Changes |
|---|---|---|
| [principles.md](principles.md) | The promises: *never / always* lines (`P#`). | Rarely; retiring one needs a decision |
| [decisions/](decisions/README.md) | Append-only decision log (`D#`), one file per year (`decisions/<year>.md`). | Every closed spec, every "decided: …" |
| [glossary.md](glossary.md) | The project's words, one line each. | Whenever a new term sticks |
| [footguns.md](footguns.md) | Traps hit while building, and the rule or automation that prevents each. | Every run that trips over something |

Add `product.md` (what it is today, a snapshot rewritten in
place) and `voice.md` (how it talks) when the project needs
them; keep each under ~150 lines and split into a same-named
folder past that.

## Rules for new lines

**Everywhere.** Nothing personal (no user's name, data or
employer). Plain, dated, sourced: every principle and decision
says where it came from (a `D#`, a spec number, or "owner,
YYYY-MM-DD"). Search before adding: tighten the line that
covers it, never add a near-duplicate.

**Principles.** `- **P# · Short title.** One or two sentences,
≤ 40 words.` IDs are global and never reused (a declined one
spends its number too). Budget: 40 active, ever; past it,
merge or retire one. Retiring needs a decision: strike the line
(`~~…~~`) and append `→ retired by D#`. Never delete.

**Decisions.** Append-only, in the current year's file, ≤ 3
lines each (format in [decisions/](decisions/README.md)). A
branch never numbers one: it writes `D?<slug>` in its pending
file and settle (`scripts/plan/settle.mjs`) gives it the next
number, rewriting every `D?<slug>` in the repo. The only edits
to an old entry are appended arrows: `→ superseded by D#`,
`→ amended by D#`, `→ confirmed YYYY-MM-DD`.

**Glossary.** One line per term; rewrite in place to stay
true.

## Footguns: the ladder

Built for thousands of sessions across many people, so the
file stays small, mergeable and self-pruning.

- **One line per footgun, never wrapped:** `- **slug** · trap
  → rule · seen N× · last YYYY-MM-DD · open | watch | guarded
  by <what>`, at most 500 bytes: the trap once, as one generic
  sentence with at most one example cited by chunk id, then the
  rule. A bump changes `seen` and `last` and may sharpen the
  rule; it never appends the incident (git keeps those).
- **Slug ids** (`worktree-discipline`), never numbers: two
  branches can't collide on a slug that names the trap. The
  file merges with git's `union` driver (`.gitattributes`:
  `identity/footguns.md merge=union`), so parallel branches
  append without conflicts.
- **Search before adding**, Watch included: a known trap gets
  its sighting (`footguns: <slug>` in the pending file), not a
  new line.
- **Seen once → an open rule. Seen twice → automate it:** a
  test, a hook, a guard pattern, a lint, or a check in a
  script; a sentence in a skill is not one. Settle files an
  `automate <slug>` chunk (in the ladder spec, with an Asap
  lane entry) the moment an open line reaches 2×. The
  automation first fails on a rebuilt copy of its incident;
  then the line moves to Guarded as `guarded by <file>`.
- **Budget: 30 open lines**, kept by settle with no judgment:
  past 30, the single sightings with the oldest `last` move to
  **Watch** (searched before adding, not read before building).
  Watch drops a line unseen for 120 days, then the oldest past
  60. Guarded lines stay while their automation exists.
- **Only real incidents**, never hypotheticals. A product bug
  is fixed or plotted (`/bug`); a footgun is a trap in *how
  the project is built*. One incident can be both.
- `footguns:` names only traps the run actually fell into; a
  rule it obeyed is no sighting.

## When a spec closes

1. Promote its lasting rules into principles, its choices into
   decisions (confirm or supersede its `(proposed)` ones).
2. New terms into the glossary.
3. Delete the spec (`git rm`); `plan/ARCHIVE.md` gets the line
   and git history keeps the text.

## Where it is read

Every session: principles are hard constraints on code, copy
and specs (a change that would break one stops and asks), and
the **Open** footguns are read before building. `/next`,
`/plot` and `/bug` read both at orient.
