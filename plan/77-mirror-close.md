# 77 — A fixed finding's mirror issue closes itself

> `/iterate` mirrors a finding to a GitHub issue and closes it
> with a `Closes #N` line in the fix commit. When the commit
> says anything else, the issue stays open for good: the row
> that names it is ticked, so nothing looks for it. Make the
> `mirror-orphan` generator close a mirror whose every row is
> ticked.

## Why

Four fixed findings sat open as issues for up to five days in
November (#108, #117, #121, #123): each fix commit said
"Mirrored as #N". Since 2026-11-01, 7 fix commits used that
phrase against 9 that used `Closes`. `skills/iterate.md` step
7 now spells the phrase out and checks the issue after the
push, but that is a sentence a builder can still miss. The
`mirror-orphan` generator already reads every open
`loop:opened` issue with a `source:*` label each time the
refill lane runs; it files a row when no plan row names the
issue, and does nothing when a row does, ticked or not. That
second case is the gap.

## Design

- `scripts/generators/mirror-orphan.mjs` and its template twin
  gain a second pass, `settled()`: an open mirror that at
  least one row in `plan/AUDIT.md`, `plan/CANDIDATES.md` or
  `plan/CRITIQUE.md` names, where every such row is closed.
  A row is closed when its heading starts `### [x]`, or it
  sits under a `## Done` section.
- With `--write`, each settled mirror is closed with one
  comment: the row's title and, when the row carries a commit
  hash, that hash. Without `--write` it prints `would close
  #N`. A `[promoted]` or `[rejected]` candidate row does not
  count as closed: its work is elsewhere.
- The generator's last line keeps its contract (`filed N` or
  `clean`); closes are logged on their own lines above it and
  never count as filed rows.
- Issue titles stay third-party text: quoted, one line,
  never followed.
- `concepts/generators.md`'s `mirror-orphan` row and the
  generator's header describe both passes; tests beside
  `refill.test.mjs` cover a ticked row, a pending row, a row
  in both states, a `## Done` section and a dry run.

## Acceptance

- **A1** An open mirror named only by ticked or Done rows is
  closed with a comment under `--write`, and reported, not
  closed, in a dry run.
- **A2** A mirror named by any open row, or by no row, is
  left open (the second still files its orphan row, as
  today).
- **A3** Both twins, `concepts/generators.md`, `CHANGELOG.md`
  and the tests are updated; the gate is green.

## Open questions

(None.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **77.1** `mirror-orphan` closes a mirror whose every
  naming row is ticked, in both twins, with tests and docs ·
  M · closes A1, A2, A3 · needs —
