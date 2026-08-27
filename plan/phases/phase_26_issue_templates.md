# Phase 26 — Issue templates keyed to triage routes

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.0.
> One screen: deliverables, non-goals, decisions.

## Problem

`/triage` classifies every unlabeled issue into a fixed
vocabulary (`skills/triage.md`: docs | bug | enhancement |
lesson | question), but reporters get a blank textarea —
every route is re-derived from freeform prose. Structured
forms make the classification step cheaper and dedupe
obvious, and give reporters a nudge toward the categories the
loop already knows how to route.

## Deliverables

- `.github/ISSUE_TEMPLATE/` (nexus's own repo, four forms
  mapped to this repo's own routes):
  - `bug_report.yml` — labels `["bug"]`.
  - `friction.yml` — "the kit taught me something wrong, or
    adoption stumbled" — labels `["lesson"]` (bearings
    standing decision 3: lessons from real adopters outrank
    speculative features — the highest-value class).
  - `idea.yml` — labels `["enhancement"]`.
  - `needs_user.yml` — "this needs a strategic call, not a
    quick fix" — labels `["triage:needs-user"]` directly,
    short-circuiting classification entirely.
  - `config.yml` — `blank_issues_enabled: false` (soft: one
    `contact_links` entry points anything that doesn't fit
    toward the Friction form rather than hard-blocking).
- `templates/.github/ISSUE_TEMPLATE/` — adopter mirror, same
  four-form shape, labels swapped for the adopter vocabulary
  (`templates/skills/triage.md`'s `bug` | `enhancement` |
  `content` | `data` | `docs` | `seo` | `a11y` | `perf`):
  `friction.yml` labels `["docs"]` (adopter projects have no
  "lesson" concept — that's nexus-specific self-reference).
- `templates/README.md` tree: list the five new files under
  the existing `.github/` entry (already expanded there).
- `skills/triage.md` + `templates/skills/triage.md`: one note
  in the classify step — an issue opened via a form already
  carries its route label; skip re-deriving it from prose.
- `gh label create lesson` (idempotent, best-effort) — the one
  new label this repo's forms introduce that doesn't already
  exist (`bug`, `enhancement`, `triage:needs-user`, `docs` all
  do).

## Non-goals

- **Adopter-side auto label creation.** `templates/` ships the
  form text; whether an adopter's repo has a `lesson`-shaped
  label is out of scope (it doesn't — mirror uses `docs`).
- **Rewriting triage's classify vocabulary.** The forms feed
  the existing five-way split; they don't add or remove a
  category.
- **A `question` or `docs` form.** Not named in the candidate's
  four-route scope; those reports still land via `friction` or
  `bug` and get reclassified same as freeform issues.

## Decisions

1. Four forms, not five — matches the candidate's named scope
   (`bug/friction/idea/needs-user`) exactly rather than
   expanding to cover every classify category. `docs` and
   `question` reports still work; they just don't get a
   dedicated form.
2. `needs_user.yml` applies `triage:needs-user` directly
   instead of a classify-category label — the reporter is
   self-identifying "this needs a human," which is a routing
   decision, not a category; skip the middleman.
3. `blank_issues_enabled: false` paired with a `contact_links`
   escape hatch (not a hard wall) — "softly" per the candidate
   scope line.
