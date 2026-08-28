# Phase 28 — Commit-verb vocabulary lint in the guard hook

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.2.
> One screen: deliverables, non-goals, decisions.

## Problem

The repo's whole history uses a stable commit-verb vocabulary
(`docs:`, `fix:`, `critique:`, `digest:`, `expand:`, `triage:`,
`oversight:`, `phases:` …) and the weighted ceiling (phase 17)
*counts by verb* — but nothing enforces the prefix. History
already has drift: `phase 21: prompts/ as canonical files`
(should be `phases:`) and two `playbooks:` commits alongside
three `playbook:` ones. A misspelled or inconsistent verb
silently miscounts the ceiling and pollutes the digest's
velocity read.

## Deliverables

- `plan/bearings.md`: new "Commit verb vocabulary (locked)"
  section — a table of the 15 verbs in active use (`critique`,
  `digest`, `expand`, `jot`, `oversight`, `triage`, `feat`,
  `fix`, `docs`, `templates`, `playbook`, `phases`, `plan`,
  `ci`, `cloud`) each with a one-line "fires from" gloss, plus
  the gate-teaching instruction (new verb → add the row here
  and to `guard.mjs` in the same commit).
- `.claude/hooks/guard.mjs`: a `commit-verb` `RULES` entry.
  Extracts the `-m`/`--message` string from a `git commit`
  invocation; takes the text before the first `:` on the first
  line as the verb, stripping a trailing `(scope)` (conventional
  -commit style — `fix(cloud):` matches as `fix`); blocks if no
  colon is present or the verb isn't in `VERBS`. Can't extract
  the message (heredoc-style `-m "$(cat <<EOF …)"`) → allow
  (fail open — backstop, not primary enforcement, matches this
  hook's existing posture).
- `self-test` cases: a bad verb, a missing colon, a scoped verb
  (allowed), the `phases:`/`phase N:` pair (the drift that
  motivated this), and the existing `Cloud-Run:` trailer case
  updated to carry a valid verb prefix (`cloud: tick`) so it
  keeps testing what it was testing (trailer allow-list) instead
  of tripping the new rule.
- `templates/claude/hooks/guard.mjs` twin: same `commit-verb`
  rule shape, generic starter `VERBS` (the skills every adopter
  gets regardless of surface — `digest`, `expand`, `jot`,
  `oversight`, `triage`, `plan`, `feat`, `fix`, `docs`, `chore`
  — plus a comment pointing at `templates/plan/bearings.md` for
  the project-specific extension point).
- `templates/plan/bearings.md`: matching fill-in "Commit verb
  vocabulary (locked)" section, same table shape as the kit's
  own, placeholder row for `/ship-<x>` skill verbs
  (`asset`/`data`/`migration`/`mod`/…), with the same
  gate-teaching instruction.

## Non-goals

- **Rewriting history.** The rule applies going forward only;
  the `phase 21:` and `playbooks:` outliers already shipped and
  stay as-is.
- **A `templates/` variant of the drift audit.** Whether the
  two guard.mjs files have *pre-existing* unrelated drift
  (character-class newline handling, a missing self-test case)
  is a separate finding — filed to `plan/AUDIT.md`, not fixed
  in this phase.
- **Enforcing body-line wrapping or subject length.** Verb
  vocabulary only; everything else about commit message shape
  stays a prose convention, not a mechanical gate.
- **A `verify.mjs` leg.** The guard hook already runs on every
  `git commit` Bash call (PreToolUse) — a redundant gate leg
  would only catch commits made outside the harness, which
  don't happen in this loop.

## Decisions

1. Fail open on unparseable messages (heredoc `-m`) — the
   hook's own header already states it's "a backstop, not the
   primary enforcement." A false block on a legitimate heredoc
   commit is worse than an occasional missed lint.
2. Strip `(scope)` before matching rather than requiring exact
   `verb:` — the repo already has four real `feat(cloud):` /
   `fix(cloud):` / `fix(triage,march):` commits; rejecting that
   established pattern would fight existing convention instead
   of formalizing it.
3. `phases` and `phase N` both existing verbs would defeat the
   point — pick `phases` (14 uses vs. 1) as canonical and let
   the gate reject the singular form. Same call for
   `playbook` (3 uses) over `playbooks` (2 uses).
4. Template `VERBS` starter list is the skills every adopter
   ships unconditionally (`digest`, `expand`, `jot`,
   `oversight`, `triage`, `plan`) plus generic conventional-
   commit verbs (`feat`, `fix`, `docs`, `chore`) — not the full
   nexus set, since `templates`/`playbook`/`ci`/`cloud`/
   `critique` are kit-specific or surface-conditional
   (`asset`/`data`/`migration`/`mod` only exist if that
   `/ship-<x>` skill was adopted).
