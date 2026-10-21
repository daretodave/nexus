# /next reference: close and land (Steps 0.4, 4 and 5)

The core procedure is `skills/next.md`. Owner mode is a switch
on the checkout (`scripts/owner.mjs`): it decides how work
lands, never which verbs run. Budget: 120 lines.

## 1. Settle at orient (owner only)

```bash
git ls-tree --name-only origin/<DEFAULT_BRANCH> plan/pending/
```

More than `README.md` → in a fresh detached worktree of
`origin/<DEFAULT_BRANCH>`: `node scripts/plan/settle.mjs --no-commit`,
the gate, commit with the message it printed, `git push
origin HEAD:<DEFAULT_BRANCH>`.

- Exit 1 names a pending file it skipped (old text main has
  moved): fix that file against main in the same push.
- Exit 2 names lines it couldn't tidy: fix them, commit with
  the message it printed.
- A rejected push: `git fetch`, `git reset --keep
  origin/<DEFAULT_BRANCH>`, settle again.
- A spec that "lists no chunk now": absorb it before the gate
  (lasting rules into `identity/` or `plan/bearings.md`, the
  file and its roadmap row deleted, the archive's `· NN · spec
  complete: …` line): `git add` it, commit all that is staged
  with settle's message, minus its `-- <paths>`.

## 2. The pending file

`plan/pending/<chunk id>.md`, committed alone as
`plan: close <id>`:

```md
---
close: 07.3
date: <today, YYYY-MM-DD>
says: Empty query shows the empty state
footguns: guard-test-noop
---
```

- `says`: ≤ 10 words, what now works (the archive line).
- `footguns:` sightings of traps this run hit that have a line.
- `## Edit <path>` (old text found once) only for a need a
  later chunk carries or this chunk moots; `## Add` a follow-up.
- `## Decisions` (`D?<slug>`, numbered at settle) for a lasting
  choice; `## Footguns` for a new trap (≤ 500 bytes: one
  sentence of trap, one of rule).
- Defaults taken under a loop: one line each in the close's body.

The format: `plan/pending/README.md`. Every reader counts the
pending close as closed from the moment it is on main (or on
the PR's branch, for that branch's next chunk).

## 3. Owner: land on main

From the run's detached worktree:

```bash
git fetch origin
git rebase origin/<DEFAULT_BRANCH>
node scripts/plan/settle.mjs --no-commit   # folds this close (and any other) in, staged
pnpm verify                                # the gate, foreground
git commit -m "plan: settle <ids>"         # the message settle printed
git push origin HEAD:<DEFAULT_BRANCH>
```

- "Spec NN lists no chunk now": absorb it in the settle's
  commit (§1's last bullet); the gate is red until then.
- Rejected (another session landed first): `git fetch`,
  `git reset --keep HEAD~1` (drops only the settle commit),
  rebase, settle, gate, push. Three rejections → stop, report.
- Then the primary checkout, if on `<DEFAULT_BRANCH>` and
  clean: `git pull --ff-only`. Otherwise leave it and say so.
- `node scripts/claims.mjs release <id>`.

## 4. Contributor: land as a pull request

```bash
git push -u origin next/<id>
gh pr create --base <DEFAULT_BRANCH> --head next/<id> \
  --title "<type>: <what now works> (<id>)" --body-file <scratch>
node scripts/claims.mjs pr <id> <number>
```

- An open PR for `next/<id>` already (`gh pr list --head
  next/<id>`): push to it, never open a second.
- A need still in review: stack on its branch (`--base
  next/<need>`), at most two deep; GitHub retargets it later.
- Review fixes are new commits, never a rewrite. Never
  settle: the owner's settle folds the pending file in.
- **In a `/heads-down` package:** commit on `pkg/<slug>`, push
  it, no PR: `/heads-down` opens one PR for the package at the
  end (`skills/heads-down.md` Step 5).

## 5. A run that stops early

Worth resuming: keep the claim, push the branch, say where it
stands. Nothing worth keeping: release the claim, close the
worktree, say why. A crash holds its claim to the TTL (24 h).

## 6. Every other committing skill

`/iterate`, `/triage`, `/jot` and the rest land by this file.
Owner: `git push origin <DEFAULT_BRANCH>` right after the
commit (rejected: `git pull --rebase`, the gate, push again;
three times → stop). Contributor: its own branch as a pull
request (§4), plan changes only as pending files; never main.

## 7. A cloud tick with no token

Pull-request mode (`NEXUS_LOOP_MODE` not `owner`) runs `/next`
on `nexus/<run id>` with no token: commit there, then stop. No
push, no `gh` write, no claims, announce or settle call. The
workflow does the rest (`scripts/cloud/tick.mjs`): `pick` holds
the claim, `land` fences the diff, pushes and opens the PR,
`release` frees a claim with no commit behind it. Only commits
travel: an uncommitted edit dies with the runner.
