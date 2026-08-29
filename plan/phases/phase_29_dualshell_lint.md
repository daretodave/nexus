# Phase 29 — Dual-shell parity lint leg for playbooks

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 7.4.
> One screen: deliverables, non-goals, decisions.

## Problem

`playbooks/windows-notes.md` promises every playbook code
block works on both bash/zsh and PowerShell — a POSIX-only
block gets a PowerShell twin next to it, or a cross-platform
`node -e` one-liner. Nothing checks the promise. Three real
gaps shipped and were only caught by hand, one critique pass
at a time (`sed -i` BSD-vs-GNU drift, an unguarded `./data`
grep, a PowerShell twin drifting from its bash sibling).

## Deliverables

- `scripts/verify.mjs`: a `dualshell` leg (default, not
  opt-in — pure text scan, no exec, cheap like the other
  five default legs). Walks `playbooks/*.md` fenced code
  blocks; for every ```bash fence whose content starts a line
  with a POSIX-only tool (`sed`, `awk`, `grep`, `wc`, `xargs`,
  `tail`, `head`, `cut`, `tr`, `mkdir`, `cp`, `rm`, `chmod`,
  `ln`, `find`, `mv`, `rsync`, `touch`), requires either the
  immediately adjacent fenced block (previous or next) to be
  ```powershell/```pwsh, or a `<!-- dualshell:posix-only -->`
  marker on the line right before the fence. Blocks that don't
  touch a POSIX-only tool (git/node one-liners, `.env` samples)
  need neither — no annotation burden on the common case.
- `agents.md` rule 3 and `plan/bearings.md`'s stack table:
  leg count/order updated (6 → 7 legs, `dualshell` appended).
  `README.md`'s tree comment for `verify.mjs` gets the same.
- Fix the two real gaps the leg's first run surfaced:
  `playbooks/new-project.md` §9 (`mkdir -p setup` + `cp` landing
  `bootstrap.local.json`, and the `sed -i` sweep of that same
  file) and `playbooks/cloud-loop.md` step 1 (`mkdir -p
  .github/workflows` + two `cp`s) — none had a PowerShell twin.
  Ship the fix in the same commit as the leg (gate-teaching
  rule: a new invariant lands with the fix for what it catches).

## Non-goals

- **Extending the tool list to cross-platform-safe binaries**
  (`git`, `node`, `npx`, `pnpm`, `gh`, `docker`, `curl`) — these
  run identically on every shell already; flagging them would
  make the leg noisy for no real gap.
- **Linting `playbooks/ci-providers.md`'s nine ```bash blocks**
  — they're `.env` KEY=VALUE samples, not shell commands (no
  POSIX-tool line starts a line), so the leg correctly leaves
  them alone without special-casing the file.
- **A mechanized adjacency distance check beyond "nearest other
  fenced block."** The repo's existing twin pattern always
  places the PowerShell block as the very next (or previous)
  fence with only prose between — matching that convention is
  enough; a looser or stricter distance rule isn't needed yet.

## Decisions

1. Detect "needs a twin" by scanning every line of the block
   for a POSIX-only tool as its first word, not just the first
   line — `new-project.md`'s placeholder-sweep block opens with
   `grep -rl ...| xargs sed -i.bak ...`, where the tool of
   interest is mid-pipeline.
2. Default leg, not opt-in like `adopt-dryrun` — no `execSync`,
   no child process, no scratch dir; it's a pure fenced-block
   scan over already-read markdown, as cheap as `emoji`.
3. The annotation marker (`<!-- dualshell:posix-only -->`) is
   unused by any current playbook — every flagged block in this
   repo got a real twin instead. Kept in the leg anyway: a
   future playbook may need a genuinely POSIX-only block (no
   sane Windows equivalent), and the escape hatch should exist
   before it's needed, not bolted on under pressure.
4. Adjacency checks both directions (previous fence or next
   fence) rather than assuming bash-then-powershell order —
   the convention in this repo is bash first, but nothing
   requires it and checking both costs nothing.
