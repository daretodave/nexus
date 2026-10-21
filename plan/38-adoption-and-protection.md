# 38 — Adoption asks the mode; the repo is actually locked

> Adopting nexus asks owner or contributor up front and arms
> the matching hooks; nexus's own `main` and `claims` carry the
> rulesets the owner-mode playbook describes; an overnight
> `/heads-down` runs without stopping on permission prompts.

## Why

Owner mode shipped as a script and a playbook, but nothing in
adoption asks the question, the push policy isn't armed in
nexus's own checkout (other agents share its `.git`), and the
rulesets that make it a lock (not a leg trip) were never
posted. Each of those last steps changes the owner's own
configuration, so they wait on the owner's word.

What exists today (2026-10-20): `playbooks/owner-mode.md`
(Step 3 has the ruleset JSON), `scripts/install-hooks.mjs`
(`--only pre-push`), `prompts/adopt.md` (no mode question),
`.claude/settings.json` (no allowlist for the session
scripts).

## Design

- **Adopt asks:** `prompts/adopt.md` asks owner vs PR mode
  before its first write; owner creates `.owner` and the
  `.gitignore` lines; both run `install-hooks`.
- **Fork-friendly policy (optional):** push-policy refuses
  `main` only on `origin`/`upstream`, so a contributor's own
  fork isn't blocked. Default: scope it; a fork's main is
  theirs.
- **Owner steps** (held; each is the owner's configuration):
  - post the `main` and `claims` rulesets on the nexus repo
    (`owner-mode.md` Step 3), and confirm the cloud loop's
    token still bypasses `main`'s;
  - arm the push policy in the primary checkout
    (`node scripts/install-hooks.mjs --only pre-push`);
  - extend `.claude/settings.json` so an overnight
    `/heads-down` doesn't stop on prompts: git worktree
    add/remove, rebase, `reset --keep`, `push origin
    HEAD:main`, `ls-tree`, `git -C`, the claims, settle,
    progress, ledger, announce and worktree scripts (and their
    `npm run` names), `gh pr create/list`.

## Acceptance

- **A3** The nexus repo carries the `main` and `claims`
  rulesets, the cloud token bypassing `main`'s.

## Open questions

(None.)

## Chunks
Measure: 1 open · 4 closed · next A6

- [ ] **38.3** Post the main and claims rulesets on nexus ·
  S · closes A3 · needs —
