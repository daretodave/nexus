# 78 — plugin-ci.yml's eval sandbox can't start on ubuntu-latest

> Three real-run fixes landed on main (bubblewrap+socat install,
> the AppArmor sysctl, the userns_clone sysctl) and the sandbox
> still refuses to start, so every real eval run scores 0/9 on
> cost alone. Diagnose the actual blocker for free, then try
> exactly one of the documented levers this chain never reached.

## Why

Issue #126: chunk 67.4 wired `claude plugin eval` into
`plugin-ci.yml`, gated alongside the byte-diff leg. Every real
run on `ubuntu-latest` fails the same way — `apply-seccomp:
write /proc/self/setgroups ... Permission denied` — meaning the
Claude CLI's own sandbox (bubblewrap) can't start, so every case
falls back to reasoning by hand instead of running Bash and
fails its grader. Three fixes, each confirmed via a real paid
run and each landed:

1. `apt-get install bubblewrap socat` (neither preinstalled).
2. `sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
   (Ubuntu 24.04's AppArmor restriction on unprivileged userns,
   default since 23.10) — the error's wording changed (from the
   AppArmor-specific message to a plain "Permission denied" on
   the same syscall) but the sandbox still refused to start.
3. `sysctl -w kernel.unprivileged_userns_clone=1` (the older,
   independent gate) — no change.

Runs: 44914999753, 44915350054, 44915648905, 44915855413 (the
three above), 44916279206, 44916729772 (no further change).

Each of those three attempts cost a real `claude plugin eval`
invocation (model turns, judge turns) to confirm, because the
failure only shows up inside the CLI's own sandbox startup path
— nothing in the workflow isolates the *exact* denied syscall
outside of it. Reading `code.claude.com/docs/en/sandboxing`
directly (2026-11-21) names three levers this chain never tried,
and a cheap way to tell which one applies without spending eval
budget on a fourth guess:

- **Add an AppArmor profile for `/usr/bin/bwrap`, then `sudo
  systemctl reload apparmor`** — the docs' own preferred fix for
  the AppArmor case (narrower than the sysctl, which lifts the
  restriction for every program on the machine).
- **`allowNestedUserNamespaces: true`** (a `sandbox` setting) —
  the doc's own limitations section: "by default, sandboxed
  commands can't create user namespaces... If you set
  `allowNestedUserNamespaces` to `true`, you turn off a security
  boundary." Pass via `--settings` on the `claude plugin eval`
  invocation itself (CI-job-scoped), never committed to a
  project settings file — the docs ask for `~/.claude/settings.json`
  specifically because of what the setting removes.
- **`enableWeakerNestedSandbox: true`** — for the sibling
  symptom (`Can't mount proc on /newroot/proc`) when bubblewrap
  runs inside an already-unprivileged outer container; worth
  ruling in or out once the diagnostic step names the real
  failing syscall, since `ubuntu-latest`'s own outer confinement
  (not just Ubuntu's AppArmor sysctl surface) is the chain's own
  live hypothesis for why step 2 only changed the error text.

None of the three fixes already landed tried any of these, and
none of them needed a real eval run to rule in or out — a bare
`bwrap --unshare-user --uid 0 --gid 0 true` (or `unshare --user
--map-root-user id`) reproduces the same syscall path for free,
with no model turn and no judge cost.

## Design

- `plugin-ci.yml`'s "install the eval sandbox backend" step
  gains one more line after the two sysctls: a bare bubblewrap
  (or `unshare`) invocation that exercises the same
  unprivileged-userns path the CLI's sandbox needs, logged
  plainly (exit code and stderr), costing nothing beyond the
  job's own minutes.
- Based on that line's output: either it now succeeds (the two
  sysctls were enough and something else was wrong earlier —
  rerun the real eval to confirm) or it still fails, in which
  case its exact errno and message pick exactly one of the three
  levers above to try next, scoped to the job (an AppArmor
  profile file committed under `.github/`, or `--settings` on
  the `claude plugin eval` line — never a project-level
  `sandbox` key, per the docs' own warning).
- One real eval run confirms whichever lever was tried. If it
  still scores 0/9 for the same sandbox reason, the chunk closes
  by documenting the dead end instead of guessing a fifth time:
  `playbooks/plugin.md` gets a short "the eval's sandbox doesn't
  start on GitHub-hosted `ubuntu-latest`; self-hosted or a
  different runner image is untested" line, and
  `identity/footguns.md` gets the trap (hosted Actions runners
  may not support the sandbox's unprivileged-userns path at all,
  no sysctl can lift it from inside the job).
- Either outcome updates issue #126 with the diagnostic's
  finding and closes the loop (`skills/bug.md` §4).

## Acceptance

- **A1** A diagnostic line in `plugin-ci.yml`, after the sysctls
  and before the real eval step, reproduces the sandbox's
  unprivileged-userns path for free (no model or judge cost) and
  logs the exact syscall and errno plainly.
- **A2** Exactly one of the three documented levers (an AppArmor
  profile for `bwrap`, `allowNestedUserNamespaces`, or
  `enableWeakerNestedSandbox`) is tried, chosen by A1's finding,
  scoped to the CI job only — never a committed project-level
  `sandbox` setting.
- **A3** A real run on main after the lever either scores
  without a sandbox-caused 0/9 (the eval suite's actual grading
  decides pass/fail from there, not the sandbox), or
  `playbooks/plugin.md` and `identity/footguns.md` carry the
  dead-end finding and issue #126 is told which.
- **A4** Issue #126 gets the diagnostic's finding and is closed
  per `skills/bug.md` §4 once the fix (or the documented dead
  end) lands on main.

## Open questions

- Whether GitHub's larger or self-hosted runner images behave
  differently; A3's dead-end path says so explicitly rather than
  leaving it implied, so a later chunk (or a human) can pick it
  up without re-deriving today's research.

## Chunks
Measure: 4 open · 0 closed · next A5

- [ ] **78.1** Free-diagnose the eval sandbox's real blocker, try
  the matching documented lever (#126) · M · closes A1, A2, A3,
  A4 · needs —
