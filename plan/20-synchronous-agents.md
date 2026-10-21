# 20 — Cloud ticks run synchronously

> A cloud tick never dispatches a background agent: every
> subagent call in an Actions job passes
> `run_in_background: false`, and the docs say why.

## Why

A GitHub Actions job is a single-shot process. A tick that
hands work to a background agent ends its turn, the job exits
clean, and the subagent's output never lands: no commit, no
trace. The platform default for agent dispatch became
background in mid-2026, so leaving the parameter out is itself
a background dispatch. The verify-gate rule (agents.md rule 3)
already forbids backgrounding the gate for the same reason;
agent dispatch has no rule yet.

What exists today (2026-10-20): `.github/workflows/march.yml`
and `templates/.github/workflows/march.yml` carry the
gate-foreground rule only; `.github/CLOUD_LOOP.md` has no entry
for the symptom; `skills/iterate.md`'s audit step says nothing
about dispatch. Promoted 2026-08-23 (oversight); it waited on a
local session because the cloud token can't push workflow
files.

## Design

- The new rule sits **right after** the gate-foreground rule in
  both workflow prompt blocks: same root cause, read as one
  idea. nexus's own block is numbered (later rules renumber by
  one); the template's block takes it inline.
- Wording: any `Agent` (or equivalent subagent-dispatch) call
  in a cloud tick passes `run_in_background: false`
  explicitly; omitting it is a background dispatch, not a
  neutral default.
- `.github/CLOUD_LOOP.md` "When something breaks" gains the
  symptom ("the log shows a background/async agent launch,
  then the tick exits clean with no commit") → root cause →
  fix (re-run; keep the call foreground).
- `skills/iterate.md` Step 2 gains one line: the audit sweep,
  and any agent dispatch inside a skill a cloud tick runs,
  stays foreground.

Decisions made upfront (do not ask):

- No gate leg: an agent's own tool-call parameters can't be
  linted from `verify.mjs`. Prompt and doc prose only.
- No rewrite of the cloud-mode block beyond the one rule.
- `playbooks/hands-off.md` and `playbooks/cloud-loop.md` stay
  untouched; a broader sweep is its own finding if one turns
  up.

## Contracts

- No new placeholder, no template path change.

## Acceptance

- **A1** Both march workflow prompt blocks state the
  synchronous-agent rule next to the gate-foreground rule.
- **A2** `.github/CLOUD_LOOP.md` maps the background-agent
  symptom to its cause and fix.
- **A3** `skills/iterate.md`'s audit step says agent dispatch
  in a cloud tick stays foreground.

## Open questions

(None.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **20.1** Synchronous-agent rule in both march prompts,
  CLOUD_LOOP and iterate · S · closes A1, A2, A3 · needs —
  - Touches `.github/workflows/march.yml`: ship it from a local
    session (the cloud token can't push workflow files).
