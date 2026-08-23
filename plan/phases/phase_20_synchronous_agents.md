# Phase 20 — Cloud ticks run synchronously

> One screen: deliverables, non-goals, decisions.

## Deliverables

1. **Cloud-mode prompt block gains an explicit synchronous-
   agent rule.** `.github/workflows/march.yml` and its generic
   mirror `templates/.github/workflows/march.yml` both get a
   numbered rule (sitting next to the existing verify-gate
   foreground rule, since it's the same root cause: a GitHub
   Actions job is a single-shot process) stating: any `Agent`
   (or equivalent subagent-dispatch) call in a cloud tick must
   pass `run_in_background: false` explicitly — the platform
   default is background as of mid-2026, so omitting the param
   is itself a background dispatch, not a neutral default.
2. **`.github/CLOUD_LOOP.md` gets a matching failure-mode
   entry** under "When something breaks": the symptom ("a run's
   log shows launching a background/async audit or research
   agent, then the tick exits clean with no commit and no trace
   of the subagent's output") maps to this root cause, with a
   one-line fix pointer (re-run with `/march`; the next tick's
   agent should keep the call foreground).
3. **`skills/iterate.md`'s audit step gets a one-line note.**
   Step 2 ("Audit: run §3 …") is the place a tick previously
   chose to delegate the A-G sweep to a background subagent
   instead of running it inline — add a note that the sweep
   (and any other agent dispatch inside a skill a cloud tick
   might run) must stay foreground for the same single-shot-
   process reason.

## Non-goals

- **A mechanical gate leg.** There's no way to lint an agent's
  own tool-call parameters from `scripts/verify.mjs` — this is
  a prompt/doc fix, not a template API change. (Candidate's own
  `estimated phases: 1 (doc/prompt-only, no template API
  change)` already scopes this out.)
- **Rewriting the whole cloud-mode adjustments block.** Only
  the one new rule + the two doc notes land; the existing
  numbered rules keep their numbers and wording except where
  the new rule inserts.
- **`playbooks/hands-off.md` / `playbooks/cloud-loop.md`.**
  Neither currently documents agent-dispatch behavior; the
  candidate's proposed scope names only the three files above.
  A broader sweep is a separate finding if one turns up.

## Decisions

- The new rule lands as **rule 4** in both workflow prompt
  blocks, immediately after the existing verify-gate-foreground
  rule (nexus's cloud block: `4. The verify gate ... never
  run_in_background.`) — same root cause (single-shot job,
  nothing left running to receive a background completion),
  so the two rules read as one idea instead of two scattered
  ones. Later rules renumber by one in nexus's block (which
  numbers 1-7); the generic template's block is prose-list, not
  numbered, so it takes an inline addition instead.
- No new placeholder, no new gate leg — this phase is prompt +
  doc prose only, matching the candidate's own scope estimate.
