# Playbook: Windows notes

> The kit's commands default to bash/zsh. This page is the
> PowerShell twin for the one-liners adopters actually run,
> plus four scars from sibling repos that cost someone a
> build before they were written down. Read it once before
> your first adoption if you're on Windows native; skip it on
> WSL — you're POSIX already.

---

## Which shell

nexus assumes one of:

- **bash/zsh** — macOS, Linux, WSL. Every playbook code block
  works as written.
- **PowerShell** — Windows native. Where a block relies on
  POSIX text tools (`sed`, `grep -c`, `wc`, `xargs`), the
  playbook gives a PowerShell twin next to it, or a `node -e`
  one-liner that runs identically in both (no shell-specific
  syntax to twin).

`cmd.exe` isn't a supported shell — the surface is small
enough that PowerShell is the only Windows path worth
maintaining.

## The placeholder one-liner

[`new-project.md`](./new-project.md) §4 has the canonical
bash + PowerShell pair that replaces all six placeholders
(`<PROJECT>`, `<PROJECT_LOWER>`, `<HOSTING_URL>`,
`<HOSTING_PROVIDER>`, `<REPO_SLUG>`, `<DEFAULT_BRANCH>`)
across the copied templates in one pass. Don't hand-edit files
one at a time — the one-liner is exhaustive; a placeholder
left behind is a bug the verify gate's `placeholders` leg
would have caught if it were tracked (it isn't, until you
commit).

## Hazards (real scars, from sibling adopters)

### 1. `nul` device files committed by accident

`nul` is a reserved device name on Windows (like `con`,
`prn`). A stray `> nul` redirect (copied from a bash
`> /dev/null` habit) creates a literal file named `nul` that
`git add -A` happily stages — and that most POSIX tooling
can't even delete cleanly later. Seen twice in `../semilayer`.

Add to `.gitignore` on every Windows-adopted repo:

```
nul
```

### 2. `EBUSY` when a shell's CWD sits in a build-output dir

If a PowerShell session's working directory is inside a
build-output folder (`dist/`, `.next/`, etc.) when the next
build tries to clear it, Windows refuses to remove a directory
something has open — `rmdir`/`EBUSY`, and the verify gate goes
red for a reason that has nothing to do with the code. This is
the same failure the lanes worktree rule already teaches; see
[`../customization/lanes.md`](../customization/lanes.md) rule
7 for the fix (grep build output by absolute path instead of
`cd`-ing into it) — not repeated here.

### 3. Files silently truncated to 0 bytes by tool races

Two processes (an editor's autosave, a watch-mode build, an
antivirus scanner) touching the same file at once can leave it
at 0 bytes on Windows in a way POSIX filesystems rarely
reproduce. The tell is a test runner reporting **"No test
suite found"** for a file you know has content — check the
byte count (`(Get-Item <file>).Length`) before debugging the
test framework.

### 4. `psql` never on `PATH`

The Postgres CLI tools ship with most installers but the
installer rarely adds them to `PATH` on Windows. Rather than
fighting `PATH` edits, run `psql` through the same container
your database already uses:

```powershell
docker exec -it <db-container> psql -U postgres
```

Cross-platform, works identically once you know the container
name — no local `psql` install needed at all.

## See also

- [`new-project.md`](./new-project.md) §4 — the
  placeholder one-liner this page's PowerShell twin lives in.
- [`existing-project.md`](./existing-project.md) §3 — the
  overlay copy step, also dual-shell.
- [`../customization/lanes.md`](../customization/lanes.md) —
  the EBUSY rule in its full lane context.
