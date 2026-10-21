# Skill: tidy

> **The catch-all sweep after the loops.** Clear claims nobody
> is working on, then offer to close idle worktrees and delete
> merged branches, in one question. Changes no tracked file,
> never touches what a live session or a parked loop holds,
> never deletes work git doesn't hold elsewhere without asking.

## 1. Purpose

Every `/next` run cuts a worktree and a branch, and every claim
lives 24 hours. A crashed loop, a closed PR or a chunk landed
another way leaves claims, worktrees and branches behind.
`/tidy` finds them, clears the claims that are provably dead on
its own, and asks once about the rest. It runs from the primary
checkout and needs no worktree: it edits nothing under git.

## 2. Invocation

```
/tidy          # clear dead claims, then ask about worktrees and branches
/tidy dry      # report only; change nothing
```

## 3. Procedure

### Step 1 — Gather (read-only, in parallel)

- `git fetch --prune origin`; `node scripts/claims.mjs whoami`
  and `node scripts/claims.mjs audit`: every claim with why it
  may go (`archived` on main, `gone` from every spec, `stale`
  past 24 h, `pr-closed`) or `keep`.
- `node scripts/worktree.mjs list`: every linked worktree as
  `safe`, `holds work` (uncommitted files or commits beyond
  `origin/<DEFAULT_BRANCH>`), `locked` or `orphan`. For a
  locked one, whether its pid is alive.
- `node scripts/ledger.mjs list`: the sessions. A worktree,
  branch or claim a `live` session names is **in use**; one a
  `parked`, `resuming` or `fallen` ledger names is a **parked
  loop's** (`/reboot-resume` picks it up): keep both, and
  report them as such.
- Local branches merged into `origin/<DEFAULT_BRANCH>` (`git
  branch --merged origin/<DEFAULT_BRANCH>`, never the default
  branch itself), and local branches with no worktree and
  nothing beyond it.
- Remote `next/*`, `pkg/*` and `plot/*` branches whose PR is
  merged or closed (`gh pr list --state closed --json
  headRefName`). No `gh`: skip, and say so.
- `refs/reboot/*` snapshot refs whose train is `resumed` and
  whose chunk landed.

### Step 2 — Clear claims (automatic, unless `dry`)

`node scripts/claims.mjs audit --release` drops claims that are
`archived`, `gone` or `pr-closed` (anyone's: the work is done or
can't be done) and `stale` ones that are this session's or this
machine's owner claims. A `stale` claim of another person is
only reported: it's free for anyone to claim already. A held
claim (`held:<login>`) never goes stale: the audit drops it only
once its work closes or leaves the plan. Then re-run `audit`
and keep its output for the report.

### Step 3 — Propose the rest (ask once)

Sort every worktree and branch into **safe to close** (not in
use, not parked, nothing uncommitted, nothing beyond the base),
**holds work** (show the commit subjects and file count, and
whether a claim or an open PR points at it; recommend keeping
it unless its chunk is archived) and **in use** (never offered).

One AskUserQuestion, multiSelect: "Close the N safe worktrees"
(Recommended), "Delete the N merged local branches"
(Recommended), "Delete the N remote branches of closed PRs",
"Delete the N finished reboot snapshot refs", and one option
per worktree that holds work, labeled by name and what it
holds. With `dry`, print the table and stop. Under a loop
(`/heads-down`, a cloud tick), take only the Recommended ones
and log that.

### Step 4 — Do what was picked

- A worktree: `node scripts/worktree.mjs close <path>`, never
  a bare `git worktree remove` (the guard refuses it). An orphan
  folder: delete it only after checking it holds no `.git`
  file and no link out.
- A local branch: `git branch -d` (`-D` only for one the owner
  picked under "holds work").
- A remote branch: `git push origin --delete <branch>` (the
  owner picked it: that is the ask a remote deletion needs).
- A snapshot ref: `git update-ref -d <ref>`.

End with a short table: claims released (and why), worktrees
closed, branches deleted, and what was kept and why.

## 4. Hard rules

1. Never touch what a live session holds or a parked ledger
   names.
2. Never delete unmerged work without the owner picking it.
3. Close worktrees only through `scripts/worktree.mjs`.
4. No tracked file changes; no commit.

## 5. Failure modes

- **No claims module:** skip Step 2, say so, tidy the rest.
- **`worktree.mjs close` refuses:** report its reason (dirty,
  locked, a shell inside it) and move on; never force.
- **A folder git let go of stays on disk** (a shell or an
  editor holds it): name it; the owner deletes it once nothing
  does.

## 6. Quick reference

```bash
node scripts/claims.mjs audit [--release]
node scripts/worktree.mjs list [--json]
node scripts/worktree.mjs close <path> [<path> …]
node scripts/ledger.mjs list
git branch --merged origin/<DEFAULT_BRANCH>
```
