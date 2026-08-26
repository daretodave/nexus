# Phase 24 — scripts/pulse.mjs, the offline instrument panel

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.5.
> One screen: deliverables, non-goals, decisions.

## Problem

Three places hand-derive the same numbers from the same plan
files: an `/oversight` session counting queue rows across six
files plus two `gh` calls, `/digest` re-deriving the identical
pulse nightly in prose, and `/oversight audit` re-deriving it
again for the cloud-tick briefing. Three hand-rolled counters
of the same state drift independently — exactly the failure
mode `plan/bearings.md` decision 2 warns about for docs, now
showing up in the loop's own read path instead.

## Deliverables

- `scripts/pulse.mjs` (nexus's own): zero-dependency,
  ESM, `node >=18`, no network. Reads locally:
  - `git log -1 --format=%cI` → last-commit age.
  - `plan/steps/01_build_plan.md` → pending (`[ ]`) and
    `[blocked: …]` row counts.
  - `plan/AUDIT.md` → `## Pending` section `###` row count.
  - `plan/CRITIQUE.md` → `## Pending` row count + the header's
    `> Last pass:` age in days.
  - `plan/PHASE_CANDIDATES.md` → `## Pending` row count + the
    oldest `- proposed: <date>` age among pending rows.
  Prints one compact text panel to stdout; exits 0 always (an
  instrument panel that fails a gate isn't a gate, it's a
  landmine — `/digest` and `/oversight audit` treat non-zero
  exit as a script bug, not a signal).
- `templates/scripts/pulse.mjs`: same contract, generic —
  parses the same section shapes (`## Pending`, `[ ]` /
  `[blocked: …]` rows, `> Last pass:` header) against the
  adopter's own `plan/` files. No nexus-specific phase numbers
  or paths.
- `skills/digest.md` step 2 ("Gather the pulse"): the
  hand-described "Plus queue states: build-plan …" bullet
  becomes `node scripts/pulse.mjs` for the five local numbers;
  the `gh` calls (workflow runs, `triage:needs-user` /
  `loop:do` issues, sibling lessons) stay separate — pulse.mjs
  never touches the network.
- `skills/oversight.md` §3: item 0 added —
  `node scripts/pulse.mjs` — the fast aggregate; items 1–7
  (now 2–8) stay as full reads, since oversight needs row
  *content* (blocked reasons, durable AUDIT rows, bias) that
  an aggregate count can't carry.
- `README.md`: kit's own tree gains
  `scripts/pulse.mjs` next to `verify.mjs`; templates section
  tree gains `templates/scripts/pulse.mjs`.
- `templates/README.md`: layout tree gains
  `scripts/pulse.mjs` (core, unconditional — `oversight.md` is
  a core skill and cites it).
- `package.json`: `"pulse": "node scripts/pulse.mjs"` script,
  matching the existing `verify` / `deploy:check` symmetry.

## Non-goals

- **Replacing the `gh`-backed parts of the pulse.** Workflow
  run history and issue labels need the network; pulse.mjs
  stays hermetic by design (the candidate's proposed scope:
  "reads git locally, never the network"). `/digest` keeps its
  own `gh run list` / `gh issue list` calls.
- **A new verify-gate leg.** No new placeholder, no new
  skill-anatomy invariant — pulse.mjs is a read-only reporting
  script, not a contract adopters implement against.
- **Machine-readable output (JSON/flags).** Every current
  consumer is an agent reading stdout inline; a `--json` mode
  is speculative until a second output shape is actually
  needed.
- **Touching `plan/AUDIT.md` / `CRITIQUE.md` / candidate
  parsing regexes elsewhere in the kit.** `scripts/verify.mjs`
  parses different section shapes for different reasons (link
  targets, tree diagrams) — no shared parser to extract, and
  forcing one now is speculative generalization.

## Decisions

1. Exit 0 always, even when a queue is empty or a file is
   momentarily unreadable (print `"plan/AUDIT.md: unreadable"`
   inline for that line, skip it, keep going) — an instrument
   panel is diagnostic, not a gate; failing the calling skill's
   tick because the panel itself hiccupped would be worse than
   the drift this phase fixes.
2. Text panel, not JSON: every current and named consumer
   (`/digest`, `/oversight`, `/oversight audit`, a human at a
   terminal) reads it directly; matches `check-secrets-
   liveness.mjs`'s and `deploy-check.mjs`'s existing "print,
   don't structure" precedent in this same directory.
3. `templates/scripts/pulse.mjs` ships core (not adopt-by-need)
   because `skills/oversight.md` is itself core and cites it —
   an adopter who skips it breaks a core skill's documented
   read path, the same reasoning that keeps `loop-issue.mjs`
   and `notify.mjs` core.
