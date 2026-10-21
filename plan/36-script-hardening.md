# 36 — Script hardening: paths, races, tests

> The kit's scripts behave the same from a path with a space,
> under two sessions writing at once, and on Windows; every
> suite the scripts carry runs somewhere on every change.

## Why

The v2 reviews found one bug class three times (a
`URL.pathname` path that keeps `%20`, so a script quietly
does nothing) and fixed it only where they looked. The
session scripts (ledger, notice board) assume one writer, but
the owner runs two or three `/heads-down` sessions at once.
Some suites never run (loop-issue, progress's `main()`).

What exists today (2026-10-20): `fileURLToPath` in
`plan-check.mjs` and `progress.mjs` only; `ledger.mjs` and
`announce.mjs` read-modify-write without a lock;
`scripts-ci.yml` added, never yet run on GitHub.

## Design

- **Paths:** `fileURLToPath` for ROOT in
  `scripts/{verify,pulse,new-skill,install-hooks,adopt-dryrun}.mjs`
  and the template twins; a gate check refuses
  `URL(...).pathname` as a filesystem path in `scripts/`.
- **Suites:** the gate runs `loop-issue.test.mjs`; the
  `scripts-git` leg gains a progress `main()` test with a
  claims module beside it, from a folder with a space.
- **Small CLIs:** `order.mjs --limit abc` prints usage, not an
  empty list; `progress.mjs --json` for the GUI.
- **Concurrency:** `ledger.mjs` takes star names and `take`
  under an exclusive-create lock in `.nexus/sessions/`, and
  retries its rename on EPERM/EBUSY with a short backoff;
  `announce.mjs` posts by tmp-file-and-rename under the same
  kind of lock.
- **Guard and worktrees:** the guard sees `git --git-dir <x>
  worktree remove` (any git option taking a separate value);
  `worktree.mjs list` says whether a locked worktree's pid
  lives (`kill -0`; `Get-Process` on Windows).
- **Claims:** `claims whoami` warns when the session falls
  back to `pid<ppid>` (a terminal user can't renew it later);
  `customization/claims.md` puts `NEXUS_SESSION` up front.
- **Settle:** removing a spec's last A-ID leaves no empty
  `## Acceptance` heading; the settle test fixtures move to
  neutral spec numbers and dates.
- **Workflow lint:** job-level `env:` at any indentation, and
  composite actions under `.github/actions/` are linted.
- **CI:** watch the first `scripts-ci.yml` runs (ubuntu and
  windows); add `timeout-minutes` sized from them.

## Acceptance

- **A4** Two concurrent ledger beats never share a star name;
  two concurrent `take` calls never both win; a busy rename
  retries.
- **A5** Two concurrent `announce` posts both land.
- **A10** `scripts-ci.yml` has run green on both runners with
  a sized `timeout-minutes`.

## Open questions

(None.)

## Chunks
Measure: 3 open · 7 closed · next A11

- [ ] **36.4** Ledger and notice board survive concurrent
  writers · M · closes A4, A5 · needs —
- [ ] **36.9** First scripts-ci runs watched; timeout sized ·
  S · closes A10 · needs —
  - Touches `.github/workflows/`: ship it from a local session.
