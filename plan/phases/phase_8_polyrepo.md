# Phase 8 — Polyrepo variant playbook

> Both real ancestors of this kit (semilayer, kintilla) run a
> topology the kit never documents: `plan/` as its own git
> repo — the brain — with each shippable unit a sibling repo.
> Document it as a first-class variant. DO NOT ASK.

## Why

The kit's playbooks assume plan/ lives inside the product
repo. The two most mature real adoptions both split it out:
`plan/` is a private ledger repo; product repos stay clean;
Claude Code bridges the split with
`settings.local.json → additionalDirectories`. Adopters who
outgrow one repo currently improvise this without guidance.

## Deliverables

1. `playbooks/polyrepo.md`. Cover: when the split earns its
   cost (multiple shippable units, private-plan/public-product,
   plan history ≠ product history); the layout (`plan/` repo +
   sibling product repos + optional `assets/`); the
   `additionalDirectories` bridge (each product repo's
   settings adds `../plan`); how the loop changes (Step 0
   syncs TWO repos; the tick's atomic act spans them — plan
   tick commits to the plan repo, product work to the product
   repo, push order product-first so the ledger never
   references unpushed work — kintilla reflex 3 generalized);
   verify/deploy gates stay per-product-repo; the state files
   stay identical.
2. A "Topology" subsection in `concepts/architecture.md`
   (3 paragraphs: single-repo default, polyrepo variant,
   pointer to the playbook).
3. Wire: README tree + three-paths section mention.

## Non-goals

- No tooling/scripts this phase; prose + conventions only.
- No submodule variant (rejected: the sibling layout won in
  both real cases).

## Decisions made upfront

- Push order rule: product repos first, plan repo last,
  always.
- The plan repo may be private while products are public;
  note the cloud-loop consequence (the Actions loop must live
  where the state lives — the plan repo — with
  `repo`-scoped access to products via PAT; flag as a
  documented limitation, don't solve it this phase).

## Definition of done

Gate green; playbook discoverable; architecture section
landed; this row `[x]` with hash.
