# Footguns

Traps actually stepped in while building nexus (the kit and its own loop), and the
rule that keeps us out. Read the **Open** lines before
building. **Watch** holds single sightings settle moved out to
keep Open in budget: search it before adding a line, don't
read it before building. **Guarded** lines are automated.
`/next`, `/bug` and any run that trips over something add or
bump lines through a pending file (rules:
[README.md](README.md#footguns-the-ladder)).

One line each, at most 500 bytes, never wrapped (this file
merges with git's `union` driver):
`- **slug** · trap → rule · seen N× · last YYYY-MM-DD · open | watch | guarded by <test/hook/file>`

## Open (a rule, not yet automated)

- **fake-gh-path** · a Windows path (C:/...) put on PATH in Git Bash splits at its colon, so a fake gh never shadows the real one and a test files a real issue → prepend the POSIX form (/c/...) and run `command -v gh` before any test that stubs it · seen 1× · last 2026-10-21 · open
- **npm-install-lockfile-drift** · `npm install` in `packages/cli` rewrites `package-lock.json`'s optional-dep `libc` fields on an npm version mismatch → diff `package-lock.json` before committing; revert npm-version-only drift · seen 1× · last 2026-10-24 · open
## Watch (seen once: searched before adding a line, not read before building)

## Guarded (automated: the line says by what)
