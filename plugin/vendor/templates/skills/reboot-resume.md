# Skill: reboot-resume

> **Pick a parked or fallen loop up from its ledger and keep
> going.** A fresh session takes the old one's claims,
> worktree, children and loop, and carries on from where it
> stopped: no re-planning, no rebuilding what is on disk.

## 1. Purpose

After the reboot train (`/rebooting`, `/reboot-ready`), or
after a crash (a `live` ledger whose beat went stale reads
`fallen`), the work of a loop sits on disk and in its ledger
(`.nexus/sessions/<id>.json`, `scripts/ledger.mjs`). This skill
resumes it. The GUI's "Resume" button on a fallen session runs
the same steps.

## 2. Invocation

```
/reboot-resume <slug> <star>   # a parked loop of train <slug>
/reboot-resume <star | id>     # a fallen (crashed) session, no train
/reboot-resume <slug>          # the train's only unresumed ledger, or list them
```

## 3. Procedure

### Step 1 — Take the ledger

`node scripts/ledger.mjs take <star | id>` marks it `resuming`
by this session and prints it; it records this session as
its `runner` (the claims id), so this session's beats keep
that ledger: one star, one Fleet tile. Refused (`already
resuming` or `resumed`): stop, another session has it (say
which). Refused as `live`: the session is still running;
don't take it.

**Already its session (the GUI picked it up):** when the GUI's
Pick up re-hosted this very ledger (this session's
`NEXUS_SESSION` equals the ledger's `id`, or the ledger's
`claude` is this conversation), there is nothing to take:
the GUI already set it `live` under this session, in its own
worktree. Skip the take and Step 2's claims and worktree
checks that are already true, and go to Step 3.

### Step 2 — Take the work back

1. **The Claude session:** where the harness can resume one by
   id (the GUI's SDK `resume`), try it first; it carries the
   whole context. Otherwise this fresh session works from the
   ledger alone (this skill's path).
2. **Claims:** `node scripts/claims.mjs list`. The ledger's
   claims sit under the old session: the owner takes them over
   with `node scripts/claims.mjs claim <ids…> --force` (plus
   `--base <b>` if they carry one). A contributor claims the
   chunk in flight, and the rest as the loop reaches them. One
   held by someone else now: drop that chunk and name it.
   Never release anything.
3. **Worktrees:** for each in the ledger's `work` (a crash
   ledger, or one the GUI wrote, has none: use its `worktree`
   and `branch`), check it exists and that HEAD and `git
   status --short` match. Uncommitted files missing and a
   snapshot ref named: `git stash apply <ref>` there. The
   folder gone but its branch there: `git worktree prune`
   (it drops only registrations whose folder is gone; without
   it git refuses with "already used by worktree"), then `git
   worktree add <path> <branch>` again. Locked `initializing`
   (`git worktree list` shows it): a `git worktree add` cut
   short, which the GUI finishes in place when it starts; from
   a terminal, `git worktree unlock`, `git reset -q` there (the
   index only), and `git checkout --` the files `git ls-files
   --deleted` names (only when the session never ran: a file it
   deleted on purpose stays deleted). A stale lock (dead pid): `git worktree
   unlock`. A mid-git state: finish it the way `next_step`
   says. Then work there.
4. **Children:** a stopped builder's partial edits are in its
   worktree: read its `children` entry and the diff, and treat
   that as done. A stopped Workflow: within the same Claude
   session, resume it with `resumeFromRunId` and its
   `scriptPath` (finished agents replay from cache); from a new
   session, re-run only the agents marked partial or not
   started, scoped to what is missing. A `scriptPath` that is
   gone was written under another project folder: find it by
   file name under `~/.claude/projects`.
5. `git fetch origin`; `node scripts/announce.mjs read` (owner
   lines posted since the park apply).

### Step 3 — Re-run the loop

Rebuild the ledger's `loop` command verbatim, without the
chunks in `done`, with one resume note in front: "Resuming
<star> (<slug>): chunk <id> is at <step> in <worktree> on
<branch>. Next: <next_step>. Children: <state>. <notes>. Pick
up there; don't re-plan, rebuild, re-claim or release."

- `kind` heads-down: `loop` is the `/next` prompt its Step 4
  filled (its questions are asked, its claims taken): invoke
  the `loop` skill (no interval) with it; when it stops, run
  `/heads-down`'s Step 5 end gate (parked questions from the
  old ledger's `parked`).
- A `/loop /next …` prompt: invoke the `loop` skill with the
  same interval (none for dynamic) and prompt.
- A single `/next`: finish the chunk in flight, then stop.

Before invoking it, beat once (`ledger.mjs beat`): the ledger
this session took and now runs already holds its `kind`,
`loop`, `done`, `defaults` and `parked`, so a second crash
resumes it too.

### Step 4 — Close out

`node scripts/ledger.mjs done <star>` (it sets `resumed_at`;
the runner's beats read `live` again); once every ledger of the
train has a `resumed_at`, set `.nexus/reboot/<slug>.md` to
`state: resumed`. Post `node scripts/announce.mjs "REBOOT
<slug>: <star> resumed by <claims id> on <chunk>"`. The `refs/reboot/…`
refs stay until the chunk in flight lands; that iteration
deletes them (`git update-ref -d`), `/tidy` sweeps leftovers.
Reply in at most 4 lines: the train, the chunk and its step,
the claims taken over, the loop running.

## 4. Hard rules

1. `take` first: two resumes of one ledger never both run.
2. Never release a claim; never rebuild what is on disk.
3. The loop restarts exactly as it was, minus what is done.

## 5. Failure modes

- **The worktree and its branch are both gone:** the
  snapshot ref (if any) still holds the uncommitted work: cut
  a fresh worktree from `origin/<base>`, `git stash apply` the
  ref, say so.
- **The claims were taken by someone else meanwhile:** drop
  those chunks, report who holds them, resume the rest.

## 6. Quick reference

```bash
node scripts/ledger.mjs take <star | id>
node scripts/claims.mjs claim <ids…> --force
git stash apply refs/reboot/<slug>/<star>-<name>
node scripts/ledger.mjs done <star>
```
