# 61 — Versioned releases + plan/nexus.lock + upgrade story

> The kit's own history of what changed, keyed to the paths
> an adopter's upgrade touches — the piece the version pin and
> the three-way sync don't cover on their own.

## Why

This candidate was filed 2026-07-03 against a kit with no
version pin and no upgrade tooling: "adopters copy from a
moving main and can never diff what changed." Since then,
most of that gap closed by other work: `plan/nexus.lock` pins
`version`, `ref` and `shape` (adopted by every v2 repo),
`v1.0.0` and `v2.0.0` are real git tags, and
`packages/cli/server/sync.mjs` already runs the three-way
merge (`git merge-file`) that separates a cleanly-bumped file
from one an adopter customized, flagging the latter for a
human look. `prompts/adopt.md` already writes the lock on
first adopt.

What's still missing, today (2026-11-05): no `CHANGELOG.md`.
A three-way merge tells an adopter *that* a template changed
and *whether* their copy conflicts; it doesn't say *why* the
kit changed it. Keyed-by-path release notes are the one piece
of the original proposal with no shipped equivalent.

The candidate's other sub-item, `scripts/kit-manifest.mjs` (a
hermetic sha256 walk to tell stale-but-clean apart from
customized), is dropped from scope: `sync.mjs` already makes
that call per file via `git merge-file` against the kit's own
history, and nexus distributes templates through git (a clone,
or the CLI's bundled kit, itself built from git) — no non-git
vendor-drop case exists here for a sha256 walk to cover.

## Design

- **`CHANGELOG.md` at the kit root**, entries keyed by
  template path, newest first: `- templates/skills/next.md:
  <what changed, one line> (<date>, <commit or spec #>)`. One
  entry per commit that touches `templates/`, written in the
  same commit (the gate-teaching rule, `agents.md` rule 3).
- **A verify leg** (`scripts/verify.mjs`) that fails a commit
  touching `templates/**` with no matching dated
  `CHANGELOG.md` entry for at least one touched path.
- **Surfaced at upgrade time**: `packages/cli`'s sync/upgrade
  report (`packages/cli/server/sync.mjs`,
  `playbooks/upgrade.md`) cites the `CHANGELOG.md` entries for
  files it reports as `merged` or `conflicted`, so an adopter
  sees *why* without leaving the CLI.
- No `KIT_VERSION` file: `plan/nexus.lock`'s `version:` and the
  git tag already are that source of truth; a second version
  file would drift against it.

## Open questions

(None.)

## Acceptance

- **A2** Every commit in this spec's own history that touches
  `templates/**` carries a matching `CHANGELOG.md` entry.
- **A3** `scripts/verify.mjs` gains a leg that fails a commit
  touching `templates/**` with no matching `CHANGELOG.md`
  entry.
- **A4** `packages/cli/server/sync.mjs`'s upgrade report cites
  the `CHANGELOG.md` entries for files it reports as `merged`
  or `conflicted`; `playbooks/upgrade.md` documents it.

## Chunks
Measure: 3 open · 1 closed · next A5

- [ ] **61.2** verify gate leg for `CHANGELOG.md` coverage · M
  · closes A2, A3 · needs —
  - A commit touching `templates/**` with no matching dated
    `CHANGELOG.md` entry for at least one touched path fails
    the gate (the gate-teaching rule, `agents.md` rule 3).
- [ ] **61.3** Upgrade report cites `CHANGELOG.md` · S · closes
  A4 · needs —
  - `sync.mjs`'s report cites the `CHANGELOG.md` entries for
    each `merged`/`conflicted` file; `playbooks/upgrade.md`
    shows the citation in its worked example.
