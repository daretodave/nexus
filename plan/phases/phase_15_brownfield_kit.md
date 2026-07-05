# Phase 15 — Brownfield kit: CURRENT-STATE.md template +
preview-branch deploy-gate pattern

> `playbooks/existing-project.md` and the root README both
> already talk about `plan/CURRENT-STATE.md` as if it's a real
> file adopters get — it isn't; it's an inline markdown block
> the brownfield playbook asks you to hand-copy. And
> `ci-providers.md`'s "Multiple environments" section documents
> `VERCEL_TARGET=preview` as a working knob — `deploy-check.mjs`
> never reads that variable. Both are bearings.md decision #2
> violations (a doc promising behavior the kit doesn't ship).

## Why

Brownfield is the harder onboarding path (`existing-project.md`
says so up front: "3–5 hours... harder than greenfield"), and
these two gaps sit right at its two most load-bearing steps:
writing the current-state baseline (step 1) and wiring the
deploy gate when the team requires PR review before merge
(step 5, Option A). Neither gap is cosmetic — an adopter
following the playbook literally today either hand-writes
`CURRENT-STATE.md` from scratch (the inline block is guidance,
not a `cp`-able file) or sets `VERCEL_TARGET=preview` per the
docs and gets silently ignored production-target polling.

## Deliverables

1. **`templates/plan/CURRENT-STATE.md`** — the current-state
   assessment as a real copyable template (fields as bracketed
   instructions, same shape as the inline block it replaces).
   Wired into:
   - `templates/README.md` layout tree (marked brownfield-only)
     and the optional-adds table.
   - `playbooks/existing-project.md` §1 — replace the inline
     block with "copy the template, fill it in", and add the
     file to the §3 overlay one-liner's copy list.
2. **`VERCEL_TARGET` actually implemented.** The Vercel block
   in `templates/scripts/deploy-check.mjs` filters candidate
   deployments by `d.target === TARGET` when
   `process.env.VERCEL_TARGET` is set, in addition to the
   existing SHA match — closing the doc/code gap
   `ci-providers.md` "Multiple environments" describes.
3. **Preview-branch deploy-gate pattern, written concretely.**
   `existing-project.md` §5 Option A currently says "the loop
   pushes to `loop/<phase-N>`... deploy gate polls preview
   deploys instead of production" with no mechanics. Expand it
   with the two things that make it actually runnable:
   - How the gate targets the preview build: SHA-match already
     works branch-agnostically (Netlify/Vercel both return
     deploys across all branches, matched by commit SHA) — set
     `VERCEL_TARGET=preview` (now real) or nothing extra for
     Netlify — document this instead of leaving it implied.
   - How the loop avoids re-shipping the same phase next tick
     while the PR sits unmerged: `ship-a-phase` step 8 marks
     the build-plan row `[blocked: awaiting PR #<n> merge
     <date>]` (existing status vocabulary, no new state) in the
     same commit that ships the phase to the branch. `march`'s
     existing "skip `[blocked: …]` rows" behavior means it
     won't re-attempt; a human merging the PR (or the next
     `/oversight` pass, once merged) flips the row to
     `[x] (commit <hash>)`.
   - Mirror the same concrete mechanics into `ci-providers.md`
     "Multiple environments", replacing its closing "rarely
     needed" paragraph (written when the loop was assumed
     direct-to-main only).

## Non-goals

- No new script/executable for PR-merge polling. The mechanic
  is: block the row, let a human or `/oversight` unblock it.
  Building an automated "is my PR merged yet" poller is a
  bigger, separable piece of work — a phase candidate if a real
  adopter asks for it, not invented here.
- No change to Netlify's block — its deploys endpoint already
  returns branch/preview deploys and the existing commit-SHA
  match already disambiguates them; there's no dead env var to
  fix there the way there is for Vercel.
- No change to `existing-project.md` Option B (trunk-based) —
  it already works as documented; only Option A had the gap.

## Decisions made upfront

- `CURRENT-STATE.md`'s template uses free-text bracketed
  instructions (`<framework, language, etc.>`), not the
  canonical single-token placeholder vocabulary — it mirrors
  the existing inline block's style, which the placeholder gate
  already tolerates (multi-word brackets don't match
  `<[A-Z][A-Z0-9_]*>`).
- The blocked-row mechanic reuses `[blocked: <reason> <date>]`
  verbatim rather than inventing a fifth plan-status state —
  cheapest fix, and march/ship-a-phase already know how to skip
  and (via `/oversight`) unblock it.

## Definition of done

Gate green; `templates/plan/CURRENT-STATE.md` exists and is
wired into `templates/README.md` + `existing-project.md`;
`VERCEL_TARGET` filters deployments in `deploy-check.mjs`;
`existing-project.md` §5 and `ci-providers.md` "Multiple
environments" both describe the preview-branch pattern
concretely (targeting + blocked-row mechanics); build plan row
`[x]` with commit hash.
