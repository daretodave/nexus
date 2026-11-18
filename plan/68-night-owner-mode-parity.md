# 68 — night.yml owner-mode parity: add the touch .owner step march.yml has

> `night.yml` lands to `main` the same way `march.yml` does
> (`agents.md` Standing rule 1), but its checkout never marks
> itself as the owner, so `npm run claims -- whoami` there
> reports `contributor`, not `owner`. Mirror `march.yml`'s one
> step and close the gap before it bites.

## Why

`#115` caught the asymmetry: `.github/workflows/march.yml` has
an explicit "Owner mode for this checkout" step
(`run: touch .owner`) so `scripts/claims.mjs`, `scripts/plan/
settle.mjs` and the push policy all see an owner checkout
(`playbooks/owner-mode.md`). `.github/workflows/night.yml` runs
on the same `ACTIONS_PAT` checkout and is documented
(`skills/digest.md`) to land the same way — "One commit …
push, exit" — but has no matching step. The pre-push hook isn't
armed in CI, so the gap hasn't blocked a push yet, but it is
latent: an armed hook, or any script branching on `claims.mjs
whoami` the way `skills/next/land.md` already does, would get
`night.yml`'s push rejected.

## Design

- Add a step to `night.yml`'s `digest` job, placed right before
  "Run /digest (night shift)" and gated the same way that step
  already is (`steps.quota_gate.outputs.skip != 'true'`):
  `run: touch .owner`, with the same comment `march.yml` carries
  explaining why the untracked marker is there.
- No other file changes: `march.yml`'s own step, the gate, and
  every other workflow stay untouched.

## Acceptance

- **A1** `.github/workflows/night.yml`'s `digest` job has a
  step that runs `touch .owner`, gated on
  `steps.quota_gate.outputs.skip != 'true'`, placed before the
  "Run /digest (night shift)" step.
- **A2** The step's comment explains the marker the same way
  `march.yml`'s does (why an untracked `.owner` makes the
  checkout read as the owner).

## Open questions

(None.)

## Chunks
Measure: 2 open · 0 closed · next A3

- [ ] **68.1** Add the `touch .owner` step to `night.yml`,
  mirroring `march.yml` · S · closes A1, A2 · needs —
  - Local session only: a `.github/workflows/` edit no cloud
    tick's token can push (`agents.md` "Operational secrets").
