# Phase 31 — scripts/install-hooks.mjs, opt-in pre-commit gate

> Source: `plan/PHASE_CANDIDATES.md` → Promoted 2026-08-23
> (oversight, user-directed), score 6.7.
> One screen: deliverables, non-goals, decisions.

## Problem

The verify gate binds the *loop* — every skill runs
`node scripts/verify.mjs` foreground before commit — but a
human editing outside the loop (exactly the shape of an
`/oversight` fix commit) has to remember to run it by hand.
One opt-in command should arm the same gate for hand commits
without touching clone-and-read adopters who never run it.

## Deliverables

- `scripts/install-hooks.mjs` (nexus's own):
  - Writes `.git/hooks/pre-commit` running
    `node scripts/verify.mjs` — nothing else: no network, no
    formatting, no auto-fix.
  - Marks the hook body with a `# nexus:install-hooks` comment
    line so the script can recognize a hook it wrote.
  - Refuses to overwrite a pre-commit hook that exists but
    lacks the marker — prints the path and exits 1 rather than
    clobbering something else's hook (same refuse-on-collision
    shape as `scripts/new-skill.mjs`).
  - `--uninstall` flag: removes the hook if (and only if) it
    carries the marker; no-ops with a message if no hook is
    installed; refuses (same collision rule) if a foreign hook
    is present.
  - Errors with a one-line reason if run outside a git repo
    (no `.git/` at repo root).
- `templates/scripts/install-hooks.mjs` — adopter twin, same
  logic, hook body runs `pnpm verify` (the adopter's gate
  command per `customization/verify-gate.md`) instead of
  `node scripts/verify.mjs`; banner comment genericized (no
  phase citation, "nexus/..." pointer style), matching the
  existing `new-skill.mjs` / `pulse.mjs` twin pattern.
- `README.md`: one line in the `scripts/` tree listing.
- `templates/README.md`: `install-hooks.mjs` added to the
  `Adopt-by-need files` table (opt-in — not part of the base
  copy set) and, since the verify leg's `REVERSE_CHECK_DIRS`
  reverse-checks every file physically present under
  `templates/scripts/`, also added to the fenced `scripts/`
  tree diagram so both checks pass.
- `customization/verify-gate.md`: one short paragraph under
  "The contract" naming `scripts/install-hooks.mjs` (kit) /
  `templates/scripts/install-hooks.mjs` (adopter twin) as the
  opt-in way to arm "runs before every commit" locally instead
  of relying on memory — the doc currently states the rule
  without naming any mechanism to enforce it outside the loop.

## Non-goals

- **No wiring into `package.json` scripts.** `install-hooks.mjs`
  is a one-time setup command, same precedent as
  `new-skill.mjs` and `loop-issue.mjs` (positional-arg dev
  tools, no npm-script entry) — not a gate-shaped zero-arg
  command like `verify`/`pulse`.
- **No auto-install during adoption.** `playbooks/new-project.md`
  and `prompts/adopt.md` do not gain a step that runs this
  automatically — opt-in means a human (or agent) decides to
  run it, matching the promoted candidate's explicit
  "clone-and-read adopters unaffected" rationale.
- **No CI wiring.** The cloud loop already runs verify
  foreground inside each skill; a git hook only helps the local
  hand-commit case this phase targets.
- **No hook beyond pre-commit.** No `pre-push`, no
  `commit-msg` — the candidate's proposed scope names
  `pre-commit` only; a commit-verb lint hook already exists as
  a Claude Code hook (`.claude/hooks/guard.mjs`), a different
  mechanism for a different trigger point.

## Decisions

1. Marker-based collision detection over a config file or lock
   — a single recognizable comment line in the hook body is
   enough to tell "ours" from "foreign" and needs no extra
   state; mirrors `new-skill.mjs`'s refuse-on-collision safety
   property without inventing a new pattern.
2. `--uninstall` as a flag on the same script rather than a
   second script — same reasoning `new-skill.mjs` gave for
   `--template`: the two modes differ only in whether a file
   gets written or removed, so one script keeps the twin pair
   (`scripts/` + `templates/scripts/`) at two files instead of
   four.
3. The adopter twin hardcodes `pnpm verify`, not a
   stack-sniffing lookup — `customization/verify-gate.md`
   already locks `pnpm verify` (or stack-equivalent) as the
   standard command; a project on a different package manager
   edits the one line, same as every other templates/ file
   with kit-standard defaults.
4. Listed under `templates/README.md`'s Adopt-by-need table,
   not the base copy set — the script is opt-in by design, and
   the adopt-by-need table is exactly where the kit already
   marks "copy only if you want this capability."
