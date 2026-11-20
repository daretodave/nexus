# Decisions

Append-only, one file per year: `<year>.md` (settle starts the
new year's file on its first decision). IDs keep counting
across years and are never reused. Rules:
[../README.md](../README.md#rules-for-new-lines).

One entry, at most 3 lines:

```
- **D<N>** · YYYY-MM-DD · <the decision>. *Why:* <reason>. *From:* <spec # | "owner" | D#>.
```

- A branch writes `D?<slug>` in its pending file's
  `## Decisions` (and anywhere it cites it); settle numbers it
  and rewrites every `D?<slug>` in the repo.
- `(proposed)` marks one a spec proposed; it is confirmed or
  superseded when the spec closes, or earlier when a chunk
  needs the owner's call.
- The only edits to an old entry are arrows appended to its
  last line: `→ superseded by D#`, `→ amended by D#`,
  `→ confirmed YYYY-MM-DD`.
