# Skill: reboot-resume (nexus)

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
by this session and prints it. Refused (`already resuming` or
`resumed`): stop, another session has it (say which). Refused
as `live`: the session is still running; don't take it.

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
3. **Worktrees:** for each in the ledger's `work`, check it
   exists and that HEAD and `git status --short` match.
   Uncommitted files missing and a snapshot ref named: `git
   stash apply <ref>` there. The folder gone but its branch
   there: `git worktree add` it again. A stale lock (dead pid):
   `git worktree unlock`. A mid-git state: finish it the way
   `next_step` says. Then work there.
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

- `/heads-down …`: invoke it with the same argument. Its claim
  step finds the claims already this session's and keeps them.
- A `/loop /next …` prompt: invoke the `loop` skill with the
  same interval (none for dynamic) and prompt.
- A single `/next`: finish the chunk in flight, then stop.

### Step 4 — Close out

`node scripts/ledger.mjs done <star>`; once every ledger of the
train is `resumed`, set `.nexus/reboot/<slug>.md` to `state:
resumed`. Post `node scripts/announce.mjs "REBOOT <slug>: <old
star> resumed as <new star> on <chunk>"`. The `refs/reboot/…`
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
