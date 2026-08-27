# Phase 25 — scripts/adopt-dryrun.mjs, the mechanized dry-run

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.7.
> One screen: deliverables, non-goals, decisions.

## Problem

The step-4 copy + placeholder-sweep block in
`playbooks/new-project.md` re-broke across eight re-evidencing
dates (per the candidate's source signals) because only a
fresh-eyes `/critique` pass ever actually executes it — the
gate never does. A stranger has to hit the break before the
kit learns about it.

## Deliverables

- `scripts/adopt-dryrun.mjs` (nexus's own only — this checks
  the kit's own docs, it isn't something an adopter runs after
  adoption, so no `templates/scripts/` twin):
  - Reads `playbooks/new-project.md` and extracts the two
    fenced ` ```bash ` blocks verbatim — the step-4 `### Copy`
    one-liner and the `### Replace placeholders` grep+sed
    one-liner — instead of hardcoding a second copy of either
    command. The doc stays the single source of truth; the
    script can't drift from it because it never re-states it.
  - Stages a scratch dir shaped like the sibling-clone layout
    the playbook assumes: `<tmp>/nexus` (symlink to this repo
    root) next to `<tmp>/adopter` (the scratch project), so the
    copy command's literal `../nexus/...` source paths resolve
    unmodified.
  - Runs the extracted copy command with cwd `<tmp>/adopter`;
    parses the command's own `[src, dest]` pairs and asserts
    every `dest` exists afterward (the file-manifest check).
  - Runs the extracted placeholder-sweep command against the
    same tree (it already carries its own dummy values —
    `thock`, `https://thock.xyz`, etc. — the script doesn't
    supply a second set).
  - Asserts zero remaining instances of the eight tokens the
    sweep targets (`<PROJECT>`, `<PROJECT_LOWER>`,
    `<PROJECT_TAGLINE>`, `<HOSTING_URL>`, `<HOSTING_PROVIDER>`,
    `<REPO_SLUG>`, `<DEFAULT_BRANCH>`, `<PROJECT_PKG_PREFIX>`)
    across the scratch tree. Other placeholder families
    (`<N>`, `<DOMAIN_SPECIALIST>`, `<PROVIDER_AUTH_TOKEN>`, …)
    are out of step 4's scope by design (confirmed: they
    appear throughout the copied files today) and are left
    alone — asserting a fully placeholder-free tree would be a
    false positive on day one.
  - Cleans up the scratch dir in a `finally`, pass or fail.
  - Unix-only (the extraction targets the ` ```bash ` fence,
    and the sweep needs `xargs`/`sed`): when `/bin/bash` isn't
    on `PATH`, prints a skip note and exits 0 rather than
    failing a platform the mechanized check was never written
    for — the PowerShell twin stays a human-followed path, not
    a mechanized one, matching that block's existing "twin,
    not mirrored automation" shape.
- `scripts/verify.mjs`: new `adopt-dryrun` leg, added to the
  `LEGS` table (so `node scripts/verify.mjs adopt-dryrun` runs
  it by name and the leg listing stays honest) but skipped
  during the default no-argument run unless
  `NEXUS_VERIFY_ADOPT_DRYRUN=1` is set — the candidate's
  explicit env-gate, keeping `node scripts/verify.mjs` fast.
  The leg shells out to `node scripts/adopt-dryrun.mjs` and
  folds its exit code/output into the standard failures list.
- `skills/critique.md` step 3: one sentence pointing the
  mechanical half of the walk at the new script — the dry-run
  pass trusts `node scripts/adopt-dryrun.mjs` for the copy +
  placeholder-sweep mechanics and spends its own budget on
  comprehension/ordering/voice findings instead of re-deriving
  the mechanical parts by hand each pass.
- `playbooks/new-project.md`: one line at the end of the step-4
  block noting the walkthrough above it is exercised
  mechanically by `scripts/adopt-dryrun.mjs`.
- `package.json`: `"verify:adopt-dryrun": "node scripts/adopt-dryrun.mjs"`,
  matching the `verify`/`pulse`/`deploy:check` symmetry.
- `README.md`: kit's own tree gains `scripts/adopt-dryrun.mjs`
  next to `verify.mjs` and `pulse.mjs`.

## Non-goals

- **`templates/scripts/adopt-dryrun.mjs`.** This mechanizes a
  check against *this repo's* `playbooks/new-project.md` — an
  adopter has already run step 4 by the time they'd own a copy
  of the script; there's nothing for it to dry-run against
  their finished project. Not core, not adopt-by-need — just
  not applicable past adoption.
- **`playbooks/existing-project.md`.** Its own copy block has
  a different shape (brownfield merge, not a fresh copy array)
  and isn't part of the candidate's named scope.
- **A general "extract and run any fenced bash block" utility.**
  The extraction logic targets the two specific step-4 blocks
  by their preceding heading text; generalizing it to an
  arbitrary doc-testing framework is speculative until a second
  caller exists.
- **Windows/PowerShell mechanization.** Named above; the skip
  path is the intended behavior, not a gap to close later
  without a second signal asking for it.

## Decisions

1. Extract-and-run beats hardcode-and-duplicate: the candidate's
   whole rationale is "the gate never exercises the documented
   command," which a hand-copied second command would only
   half-fix (it would silently stop matching the doc the moment
   either one changed without the other). Reading the fence
   straight out of `playbooks/new-project.md` closes that gap
   structurally.
2. Assert only the eight swept tokens, not "zero `<...>` tokens
   anywhere" — verified against the current tree (see brief
   research) that legitimate other-family placeholders
   (`<N>`, `<DOMAIN_SPECIALIST>`, `<PROVIDER_AUTH_TOKEN>`, the
   generic example fill-ins) remain throughout the copied files
   by design; a blanket assertion would fail on a clean tree.
3. Env-gated, not part of the default `LEGS` iteration — matches
   the candidate's explicit "opt-in verify leg (env-gated so
   the default gate stays fast)" scope line. `pulse.mjs`-style
   full inclusion doesn't apply here since this leg forks a
   process and touches the filesystem/symlinks, materially
   slower than the six pure-JS legs.
