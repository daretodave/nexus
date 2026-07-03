# Phase 9 — Windows-first pass

> The kit's author runs Windows; the kit's commands assume
> POSIX. Close the gap with dual-shell commands and a hazards
> section built from real sibling-repo scars. DO NOT ASK.

## Why

Survey findings: every playbook code block is bash-only
(`cp -r`, `sed -i`, `make`); the adoption one-liner replaces
only one placeholder and punts Windows users to "edit by
hand"; `bootstrap.mjs` mixes `findstr` with `awk` docs.
Sibling scars worth teaching: `nul` device files committed by
accident (semilayer, twice); `EBUSY` when a shell's CWD sits
in a build-output dir; files silently truncated to 0 bytes by
tool races (the vitest "No test suite found" tell); psql via
`docker exec` because it's never on PATH.

## Deliverables

1. Dual commands in `playbooks/new-project.md` and
   `existing-project.md`: each bash block gets a PowerShell
   twin (or a single cross-platform `node -e` where cleaner —
   prefer node one-liners over maintaining two shells when
   the block is >3 lines).
2. A complete placeholder-replacement one-liner covering all
   six canonical placeholders, both shells.
3. `playbooks/windows-notes.md` — the hazards page: the four
   scars above + `.gitignore` guidance (`nul`), and the
   lane-specific EBUSY rule already in
   `customization/lanes.md` (link, don't duplicate).
4. Fix the `findstr`/`awk` seam in
   `templates/scripts/bootstrap.mjs` (node-internal string
   checks; kills AUDIT row [5.4] — tick it too).
5. Wire: README tree + link windows-notes from both adoption
   playbooks.

## Non-goals

- No CI matrix for Windows; the kit's own gate is
  cross-platform node already.
- No cmd.exe support; PowerShell only.

## Decisions made upfront

- Node one-liners beat shell twins wherever the logic exceeds
  three lines.
- windows-notes.md is a playbook (operational), not a
  customization (it isn't opt-in if you're on Windows).

## Definition of done

Gate green; both adoption playbooks dual-shell; hazards page
discoverable; AUDIT [5.4] ticked; this row `[x]` with hash.
