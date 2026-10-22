# 50 — Permissions are the first question

> Onboarding asks how much the agent may do without asking
> before anything starts one, so the person isn't asked about
> every command once a session runs.

## Why

The owner's request (2026-10-22): "Permission question should
be step 1 so users do not have to be bombarded during
onboarding." The first agent onboarding starts is the Plot
step's `/plot` session (step 5); in Ask mode it stops on every
Bash command it doesn't recognise, while the person has moved
on. Settings gained "Permissions for new sessions" (49.10),
but nobody finds it before onboarding's own session asks.

## Design

- A new onboarding step, **Permissions**, right after Welcome
  (Welcome stays the hero that says what nexus is): Welcome →
  Permissions → Detect → Shape → Secrets → Plot → Cloud loop →
  Launch. It reuses 49.10's control (Ask, Accept edits, Auto,
  Allow everything), Ask preselected, the same plain warning
  on Allow everything, saved per checkout through
  `POST /api/prefs` the moment it changes.
- Every session onboarding or the person starts afterwards
  (the Plot step's `/plot`, Launch's session) starts in that
  mode.
- Every step's counter, kicker, Back and Continue read
  `src/ui/steps.js`, so the new step slots in there.

## Acceptance

- **A1** Onboarding's second step is Permissions: the 49.10 control with Ask preselected and the Allow-everything warning, saved through `POST /api/prefs` when changed; the Plot step's session and Launch's session start in the chosen mode; every step's counter reads "N of 8". Checked live against a scratch repo: choose Allow everything, explode and keep an idea, Continue; the plot session runs without a permission strip.

## Open questions

(None.)

## Chunks
Measure: 1 open · 0 closed · next A2

- [ ] **50.1** Onboarding asks the permission mode first · S · closes A1 · needs —
