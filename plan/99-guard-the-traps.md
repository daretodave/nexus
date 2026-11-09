# 99 · Guard the traps: automate every footgun seen twice

**Why:** a trap seen twice gets automated, never logged again. Settle opens this spec when an open footgun
reaches 2×, adds one chunk per footgun with its entry in the Asap lane, and removes the spec and its rows when
its last chunk closes. Write nothing else here.

## Acceptance

- **A1** `md-anchor-rename` is guarded: a test, hook or lint fails on the trap, and its footgun line says `guarded by` it.

## Chunks
Measure: 1 open · 0 closed · next A2

- [ ] **99.1** Automate footgun `md-anchor-rename` (seen 2×): a test, hook or lint, then mark it guarded · S · closes A1 · needs —
