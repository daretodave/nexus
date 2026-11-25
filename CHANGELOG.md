# CHANGELOG

> `templates/` is the product — the files an adopter copies in,
> then upgrades later through `packages/cli/server/sync.mjs`'s
> three-way merge. That merge tells an adopter *that* a file
> changed and *whether* their copy conflicts; it can't say
> *why* the kit changed it. This file does. Newest first, one
> entry per commit that touched `templates/`, keyed by the path
> it touched. Surfaced at upgrade time — see
> `playbooks/upgrade.md`.

- templates/claude/hooks/guard.mjs: a new `mirror-not-closed` rule
  blocks a `git commit` whose message says "Mirrored as #N" for an
  issue it never closes — only `Closes #N` (`Fixes #N` / `Resolves
  #N`) for that same number is a phrase GitHub auto-closes on
  (`templates/skills/iterate.md` Step 5's `- Closes #<N>` trailer
  convention). Mechanizes the gap named in `concepts/loop-honesty.md`
  (2026-11-25, 75.2).
- templates/.github/workflows/night.yml: the `claude-code-action@v1`
  step's `env:` gains `CLAUDE_CODE_RETRY_WATCHDOG: '1'` and
  `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS: '1800000'`, so an
  unattended digest tick waits out a transient 429/529 instead
  of failing the run, bounded well under the job's 60-minute
  `timeout-minutes` so a stuck wait still yields (2026-11-23,
  71.2).
- templates/.github/workflows/march.yml: the `claude-code-action@v1`
  step's `env:` gains `CLAUDE_CODE_RETRY_WATCHDOG: '1'` and
  `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS: '1800000'`, so an
  unattended march tick waits out a transient 429/529 instead
  of failing the run, bounded well under the job's 300-minute
  `timeout-minutes` so a stuck wait still yields (2026-11-23,
  71.2).
- templates/.github/workflows/heartbeat.yml: the "Cancel wedged
  runs" step reads `gh workflow list --all` once and skips a
  watched workflow that isn't `active` (one log line, no
  failure), matching the guard the "Alarm if a scheduled
  workflow is not armed" step already used — previously any
  disabled watched workflow failed this step under `bash -e`
  and silently stopped the whole job, so the later alarm steps
  never ran (2026-11-23, 71.1).
- templates/workspace/KEYS.md: new — a names-only manifest of
  the workspace ring's secrets (`.env.workspace`): which key,
  which sibling repos read it, and where it's minted. No value
  ever appears in it, same rule as `nexus.secrets.json`; it's
  the workspace's own cross-repo twin of `identity/
  key-custody.md`, which stays the kit's own credentials, not
  this (2026-11-21, 69.1).
- templates/scripts/generators/mirror-orphan.mjs: a second pass,
  `settled()`, closes a mirror whose every plan row is already
  closed (`### [x]`, or under `## Done`), so a fix commit that
  says "Mirrored as #N" instead of `Closes #N` no longer leaves
  the issue open for good — four such mirrors sat open up to
  five days in November. Under `--write` it closes with a
  comment citing the row's title and any commit hash it names;
  a dry run prints `would close #N` and closes nothing
  (`templates/scripts/__tests__/refill.test.mjs`'s `settled (the
  close pass)` block) (2026-11-21, this commit).
- templates/scripts/plan/motion.mjs: the motion baseline is the
  median of the 4 weeks before the judged one, no longer their
  mean. One burst week (a person's build sprint beside the
  loop: 598 shipped units against the loop's usual 12 to 25)
  held a mean at 159.5 and read every ordinary week after it as
  a stall for a month, which under `stall_action: promote` also
  forced promotions. A week that shipped nothing still never
  reads ok. The trade: a loop already near dead (1 unit a week)
  reads ok for a week that matches its last ones
  (`templates/scripts/__tests__/motion.test.mjs` pins both)
  (2026-11-21, this commit).
- templates/.github/workflows/nudge.yml: `actions/checkout@v4`
  moves to `@v5`, the last template workflow still on the major
  that ran on the retired Node 20 runtime; it waited on a local
  session because its root twin has to move in the same commit
  (2026-11-21, 68.1).
- templates/skills/*.md: every bash-only fence outside the
  original five git-procedure skills now carries `<!--
  dualshell:posix-only -->` (none had a PowerShell equivalent
  worth building), closing the gap the `dualshell` syntax leg
  left since 52.3 (2026-11-17, this commit).
- templates/README.md: "replace all eight" fixed to "nine" in
  two spots — the placeholder table above it lists nine rows
  (2026-11-17, this commit).
- templates/README.md: dropped the "Reference implementations"
  section — it pointed adopters at "the real projects" in the
  root README's Provenance section, which deliberately
  anonymizes every one of them, so the instruction was a dead
  end (2026-11-17, this commit).
- templates/scripts/plan/settle.mjs: `setLeft()` now also
  rewrites a roadmap row written in "N of M chunks" shape (not
  just "N left") after a close, so a spec chunked in that format
  keeps a true progress cell (2026-11-16, this commit).
- templates/scripts/__tests__/cadence.test.mjs: the bootstrap
  cross-check assertion now self-skips when `bootstrap.mjs` is
  pruned, instead of a static import crashing the whole suite
  (2026-11-16, this commit).
- templates/.github/workflows/pr-flow.yml: pr-flow now deletes
  a merged loop PR's branch after merge (2026-11-05, 2da8d42).
- templates/.github/actions/setup/action.yml: actions/checkout
  and actions/setup-node bumped to v5 across every workflow
  (2026-11-05, 050f6b6).
- templates/plan/bearings.md: documents the
  `DEPLOY_PROVIDER=none` path in the deploy gate section
  (2026-11-05, ddc0663).
- templates/agents.md: documents the no-deploy-host path in
  rules 1 and 4 (2026-11-05, b5c7f1b).
- templates/.github/workflows/march.yml: bumped
  actions/create-github-app-token to v3 and
  actions/download-artifact to v8 (2026-10-26, 89b75dc).
- templates/scripts/ui-walk.mjs: new adopter UI walk — checks
  the UI knobs the reader's Path A2 expects (2026-10-25,
  15f8a2a).
- templates/scripts/workflow-lint.mjs: now scans prompt
  inputs too, since issue and page text is treated as data
  (2026-10-25, c8a02e9).
- templates/setup/00_files.md: renamed the PHASE_N/PHASE_M
  placeholders to SPEC_N/SPEC_M (2026-10-21, 76b9f00).
- templates/claude/commands/march.md: committing skills now
  land per owner mode, never a bare push (2026-10-21,
  609b9b8).
- templates/skills/moderate.md: shipped — the Option A
  moderation-queue promise (2026-07-04, e318b64).
