# Skill: reboot-ready

> **Park this loop for the reboot train, now.** Stop the
> children, keep the work exactly where it is, keep every
> claim, write it all into this session's ledger, post the
> marker, stop. This preempts the chunk in flight.

## 1. Purpose

The owner ran `/rebooting <slug>` and is about to restart. A
fresh session will pick this loop up with `/reboot-resume
<slug> <star>`, trusting only the ledger
(`.nexus/sessions/<id>.json` at the primary root,
`scripts/ledger.mjs`). Speed matters, but nothing is thrown
away: leaving work where it is, on disk and recorded, always
beats tidying it up.

## 2. Invocation

```
/reboot-ready <slug>   # the train's slug, from the REBOOT line
/reboot-ready          # take the newest REBOOT line on the board
```

## 3. Procedure

### Step 1 — Stop the children (in parallel, in one message)

- **Subagents and Workflows:** for each one this session
  started, record first, then stop it (`TaskStop`): its id,
  label, what it was building, its worktree or branch. For a
  Workflow, also its `scriptPath` (copied from the Workflow
  tool's own result, never rebuilt), the phase reached, its
  transcript folder and which agents had finished (with their
  results). Their edits stay on disk; nothing is reverted.
- **Background commands:** one seconds from done (`git
  commit`, `git push`, a claims or announce call) finishes. A
  long one (a test run, the gate, a dev server) is stopped.
- **The loop itself:** a self-paced `/loop` stops scheduling
  (`ScheduleWakeup` with `stop: true`); a cron `/loop` is
  deleted (`CronList`, `CronDelete`); a `Monitor` is stopped.
  No iteration starts after this.
- **Mid-git:** never abort a merge, rebase or cherry-pick in
  progress. Record `git status` and leave it.

### Step 2 — Freeze the work (record, don't change)

For this session's worktree and each child's: path, branch,
HEAD, base, commits ahead of `origin/<base>` and whether they
are pushed, `git status --short`. Then a snapshot of the
uncommitted tracked changes that leaves the tree untouched:
`h=$(git stash create)`; if it printed a hash, `git update-ref
refs/reboot/<slug>/<star>-<worktree name> $h`. Never commit
work in progress, never push a half-built chunk, never `git
stash` (that changes the tree), never close a worktree.

### Step 3 — Keep every claim

`node scripts/claims.mjs list` for this session's claims, then
`node scripts/claims.mjs renew <ids…>`. Never release, not even
the chunk in flight.

### Step 4 — Park the ledger

One call, every field from Steps 1-3:

```bash
node scripts/ledger.mjs park <slug> \
  --set-file 'loop=<a file holding the exact command or prompt that started this loop>' \
  --set kind=<heads-down | /loop dynamic | /loop <interval> | single /next> \
  --set chunk=<id> --set step=<orient | building | review | gate | closing | landing> \
  --set 'next_step=<the very next thing a fresh session should do, concretely>' \
  --set 'notes=<what only this session knows: a decision, an owner answer, a half-applied step>' \
  --set 'work=[{"path":"…","branch":"…","head":"…","base":"main","ahead":2,"pushed":false,"uncommitted":["…"],"snapshot":"refs/reboot/…","midgit":""}]' \
  --set 'children=[{"id":"…","label":"…","state":"stopped","covered":"…"}]' \
  --set 'workflow={"runId":"…","scriptPath":"…","phase":"…","transcriptDir":"…"}' \
  --set 'claimed=["07.3","07.4"]' --set 'done=["07.1","07.2"]' --set 'left=["07.3","07.4"]'
```

Leave a field out rather than guess: the resume trusts the
ledger. A `/heads-down` loop recorded `loop` and `kind` when it
started: leave those two out.

### Step 5 — Marker and stop

`node scripts/announce.mjs "REBOOT-SAFE <slug> <star>: parked
<chunk in flight or 'between chunks'>; resume with
/reboot-resume <slug> <star>"`. Reply in at most 4 lines: the
marker, the chunk and its step, the claims kept, the resume
line. Then stop: no further tool calls, no new iteration.

## 4. Hard rules

1. Record before stopping; stop before writing the ledger.
2. Nothing is reverted, released, stashed or committed.
3. The ledger lives at the primary root, even from a worktree.

## 5. Failure modes

- **No slug and no REBOOT line on the board:** ask the owner
  for the slug (the one question this skill may ask).
- **A child won't stop:** record it as `left to finish` with
  where its output lands, and park anyway.
- **No ledger script:** write the same fields as JSON to
  `.nexus/sessions/<id>.json` by hand.

## 6. Quick reference

```bash
node scripts/claims.mjs list | renew <ids…>
git stash create && git update-ref refs/reboot/<slug>/<star>-<name> <hash>
node scripts/ledger.mjs park <slug> --set k=v …
node scripts/announce.mjs "REBOOT-SAFE <slug> <star>: …"
```
