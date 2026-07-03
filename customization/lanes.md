# Customization: lanes — the alpha / beta / gamma fan-out

> Three agents, one branch, zero PRs. Lanes are parallel Claude
> Code sessions in git worktrees that all land on
> `<DEFAULT_BRANCH>`, coordinated by a claims board and a
> strict landing ladder instead of merge machinery. Extracted
> from kintilla, where the pattern runs hot in production
> (alpha "bulldozer", beta "ninja", gamma "fly"). Adopt when
> one human can supervise more throughput than one session
> delivers; skip while you're still climbing the intervention
> spectrum with a single loop.

The single-loop methodology serializes everything: one tick,
one verb, one commit. That's the right default — but an
attended afternoon often has three streams of work that don't
touch the same files: a heavy phase, a queue of audit fixes,
and a pile of small drains (jots, data rows, doc nits). Lanes
run those concurrently without giving up the kit's spine:
every lane still runs the full verify gate, still commits and
pushes atomically, still lands on the one true branch.

---

## When to adopt

- You're at Level 1–2 (attended) and the queues outrun a
  single session.
- The pending work is **path-partitionable** — you can say
  which directories each stream owns before starting.
- Trunk-based culture: everything lands on
  `<DEFAULT_BRANCH>`; no PR review step in the loop.

When not:

- Unattended windows. Lanes are an *attended* pattern — the
  hands-off playbook's "one writer at a time" rule stands for
  any window you walk away from. Three unattended writers is
  three-body drift.
- Work that concentrates in one hot path (a schema everything
  imports). Partition first or don't parallelize.
- You haven't run the single loop cleanly for a week. Lanes
  multiply whatever discipline you have — including none.

---

## The three lanes

| Lane | Where | Temperament | Typical work |
|---|---|---|---|
| **alpha** | the primary checkout | bulldozer — big, stateful, owns conflicts | `/ship-a-phase`, anything touching contracts or shared substrate |
| **beta** | `.beta/` worktree | ninja — focused, medium-sized | `/iterate` fixes, a bounded feature slice, test debt |
| **gamma** | `.gamma/` worktree | fly — small, fast, frequent | `/ship-data` rows, doc nits, jot drains, one-file fixes |

Three is the shipped shape because one human can genuinely
supervise three terminals; kintilla's experience is that a
fourth lane adds coordination cost faster than throughput.
Two lanes (alpha + gamma) is a fine starter.

---

## Mechanics

### 1. Create the worktrees (once)

```bash
# from the primary checkout, on <DEFAULT_BRANCH>
git worktree add .beta  -b lane/beta  origin/<DEFAULT_BRANCH>
git worktree add .gamma -b lane/gamma origin/<DEFAULT_BRANCH>
```

Add `.beta/` and `.gamma/` to `.gitignore`. Each worktree gets
its own Claude Code session (`cd .beta && claude`). Lane
branches exist because git refuses the same branch in two
worktrees — they are *local scaffolding only* and are never
pushed as branches.

### 2. Work in the lane

Normal skill invocations, with the lane's temperament: alpha
runs phases; beta and gamma run **single-verb sessions**
(`/iterate`, `/ship-data`, `/jot` drains) — never `/march`.
The dispatcher runs in **alpha only**; two dispatchers reading
the same state files double-claim work.

### 3. Land on the one branch

Landing is a fresh-sync + full-gate + refspec push:

```bash
git fetch origin
git rebase origin/<DEFAULT_BRANCH>   # lane commits were never on origin — rebase is safe
<verify gate>                        # FULL gate, after the rebase, every time
git push origin HEAD:<DEFAULT_BRANCH>
```

A rejected push (someone landed first) is normal traffic, not
an incident: fetch, rebase, **re-run the gate**, push again.
The gate re-run after rebase is non-negotiable — the whole
point of lanes-with-a-gate is that `<DEFAULT_BRANCH>` never
holds a commit that didn't pass verify *against the tree it
landed on*.

### 4. Tear down (when the burst ends)

```bash
git worktree remove .beta
git worktree remove .gamma
git branch -D lane/beta lane/gamma   # local scaffolding only
```

Lanes are a session pattern, not permanent infrastructure.
Standing worktrees rot (stale deps, drifted state files).

---

## The lane board

`.scratch/lane-board.md` — gitignored, because it's live
coordination state, not history. Every lane **claims before
touching and releases on landing**:

```markdown
# Lane board — <date>

| Lane | Claim (paths) | Work item | Status |
|---|---|---|---|
| alpha | apps/web/src/features/search/** | phase 12 | building |
| beta  | apps/web/src/components/nav/**  | AUDIT [7.2] | verifying |
| gamma | data/venues/**                  | BACKLOG rows 3-5 | landing |
```

Rules of the board:

1. **Claims are path prefixes, and they must not overlap.** An
   overlapping claim is resolved *before* either lane edits —
   the junior lane (see ladder) re-scopes.
2. **Shared state files belong to alpha.** `plan/*` and
   `data/BACKLOG.md` edits (ticking rows, moving findings)
   ride the landing commit of the lane that did the work, but
   when two lanes need the *same* state file in the same
   window, alpha sequences it.
3. **A claim without a live session is stale after the
   session ends** — clear it on teardown.

---

## The landing ladder

Contention resolves by rank, junior yields to senior:

```
gamma  →  beta  →  alpha
(lands anytime, yields always) ... (lands last, owns conflicts)
```

- **gamma** lands whenever green — its diffs are small enough
  that rebasing over anyone is cheap.
- **beta** lands at natural checkpoints; if alpha is mid-land,
  beta waits.
- **alpha** lands biggest and last, and is the only lane that
  resolves a *real* conflict (two lanes edited the same hunk —
  which, if the board was honest, means the board was wrong;
  fix the board rule that let it happen).

The ladder plus non-overlapping claims means merge conflicts
are rare and rebases are mechanical. When a real conflict
appears anyway, it's alpha's to resolve — junior lanes never
guess about senior code.

---

## Hard rules

1. **Every lane runs the full verify gate before every
   landing, after every rebase.** No "gamma's change is tiny"
   exemptions — tiny changes on stale trees are how green
   branches go red.
2. **Commit by explicit path. Never `git add -A`.** Concurrent
   sessions mean stray artifacts; explicit staging is the only
   staging. (This is kintilla reflex 4, learned the hard way.)
3. **One dispatcher.** `/march` and `/loop` run in alpha only.
   Beta/gamma are single-verb sessions.
4. **One `/oversight`, run from alpha,** after all lanes land
   or park. Oversight reads global state; running it mid-land
   from a lane reads a fiction.
5. **Absolute or repo-root-relative paths inside lane
   sessions.** Worktrees break lazy relative paths in scripts
   and tool configs — a `../` that resolved in the primary
   checkout points somewhere else in `.beta/`. (Kintilla
   lesson: the failure masquerades as `cmd.exe ENOENT`.)
6. **Lanes never push lane branches.** The only thing that
   ever reaches origin is `HEAD:<DEFAULT_BRANCH>` after a
   green gate.
7. **Windows:** never leave a lane shell's CWD inside a build
   output dir — the next build's `rmdir` hits `EBUSY` and
   fails the gate for a fake reason. Grep build output by
   absolute path instead of `cd`-ing in.

---

## Failure modes

1. **Push rejected repeatedly (3+).** You're racing another
   lane's burst — check the board, respect the ladder, land
   after them. If the board says nobody's landing, someone
   bypassed it; stop the burst and re-sync all lanes.
2. **Real merge conflict.** The board was violated or a claim
   was too optimistic. Alpha resolves; the retro question is
   "which claim rule failed", not "who typed faster".
3. **A lane's gate is red only in the worktree** (passes in
   primary). Almost always a relative-path or stale-dep
   issue — see hard rules 5, and reinstall the worktree's deps
   before deeper debugging.
4. **Orphaned worktree wedging git** (`worktree add` refuses,
   phantom checkouts). `git worktree prune` then re-add.
5. **Two lanes edited the same state-file row** (both ticked
   the same backlog item). The second land's rebase surfaces
   it as a conflict — alpha keeps the true row, and the board
   gains a claim for that file next time.

---

## Adoption checklist

- [ ] Single-loop discipline is boring (a clean attended week).
- [ ] `.beta/` + `.gamma/` in `.gitignore`; worktrees created.
- [ ] `.scratch/lane-board.md` exists with today's claims;
      `.scratch/` is gitignored.
- [ ] Each lane's terminal is visibly labeled (alpha/beta/gamma
      in the tab title — mis-typed lanes are real).
- [ ] The landing ritual is muscle memory: fetch → rebase →
      full gate → `push origin HEAD:<DEFAULT_BRANCH>`.
- [ ] Teardown ritual on the calendar for the end of the burst.

---

## See also

- [`../playbooks/hands-off.md`](../playbooks/hands-off.md) —
  the *unattended* counterpart; its "one writer" rule is why
  lanes are attended-only.
- [`sub-agents.md`](./sub-agents.md) — parallelism *inside* a
  session; lanes are parallelism *across* sessions. They
  compose: each lane spawns its own sub-agents.
- [`../playbooks/recovery.md`](../playbooks/recovery.md) §B —
  if a landing went sideways anyway.
