# Phase candidates

> Last pass: never
> Pass count: 0
> Posture: bold

`/expand` files candidates here; `/oversight` promotes them
into `plan/steps/01_build_plan.md`. Seeded 2026-07-02 from the
kit + sibling surveys.

## Pending

### [ ] [score 7.5] Package nexus as a Claude Code plugin
- proposed: 2026-07-02
- source signals: adoption friction (clone + copy + replace is
  the whole TL;DR); Claude Code plugin/marketplace support.
- rationale: `/plugin install nexus` collapses adoption Step 1;
  the client-agnostic skills/ layout stays canonical.
- proposed scope: plugin manifest + packaging doc + publish
  flow; keep templates/ as the source of truth.
- estimated phases: 1
- conflicts: none — additive doorway, same files.

### [ ] [score 6.8] closeloop: thank the humans who file issues
- proposed: 2026-07-02
- source signals: kintilla's `.claude/tools/closeloop.mjs`
  (Postmark batch thank-you emails to issue reporters,
  dry-run default, tested).
- rationale: the address loop closes with the fix; closing
  with the *reporter* compounds trust. Generalize as an
  opt-in template next to loop-issue.mjs.
- proposed scope: `templates/scripts/closeloop.mjs` +
  customization section in the triage/moderation story.
- estimated phases: 1
- conflicts: email provider becomes an optional external
  service (runbook required).

### [ ] [score 6.1] Critique-household pattern for auth-aware critique
- proposed: 2026-07-02
- source signals: kintilla's planned `/visit` seals an
  anonymous "critique household" so the observer never
  consents to analytics (no GA4 pollution) — a pattern
  auth-aware-critique.md doesn't cover.
- rationale: adds the "observer must not pollute product
  analytics/data" dimension to the five auth patterns.
- proposed scope: new section in
  `customization/auth-aware-critique.md` + env conventions.
- estimated phases: 1
- conflicts: none.

### [ ] [score 5.9] Staged hardening for verify legs
- proposed: 2026-07-02
- source signals: kintilla's `check.mjs` `*_IS_ERROR` flags —
  new invariants start as warnings, flip to errors once the
  corpus drains.
- rationale: lets adopters (and this repo) add aggressive lint
  legs without a big-bang cleanup; the flip commit is the
  celebration.
- proposed scope: warn-tier support in `scripts/verify.mjs` +
  a paragraph in verify-gate.md.
- estimated phases: 1
- conflicts: none.

## Promoted

(moves to the build plan via /oversight)

## Rejected

(kept for the record, with reasons)
