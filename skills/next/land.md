# /next reference: close and land (Steps 0.4, 4 and 5)

The core procedure is `skills/next.md`. Owner mode is a switch
on the checkout (`scripts/owner.mjs`): it decides how work
lands, never which verbs run. Budget: 120 lines.

## 1. Settle at orient (owner only)

```bash
git ls-tree --name-only origin/main plan/pending/
```

More than `README.md` → in a fresh detached worktree of
`origin/main`: `node scripts/plan/settle.mjs`
(it commits), the gate, `git push origin HEAD:main`.

- Exit 1 names a pending file it skipped and why (an edit whose
  old text main has moved): fix that file against main in the
  same push.
- Exit 2 names lines it couldn't tidy: fix them, commit with
  the message it printed.
- A rejected push: `git fetch`, `git reset --keep
  origin/main`, settle again.
- A spec that "lists no chunk now": absorb it (its lasting
  rules into `identity/` or `plan/bearings.md`, the file
  deleted, the spec-complete archive line), as its own commit.

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
- `## Edit <path>` (exact old text, found once at settle) only
  for a requirement a later chunk now carries or a chunk this
  one moots.
- `## Decisions` (`D?<slug>`, numbered at settle) for a lasting
  choice; `## Footguns` for a new trap (≤ 500 bytes: one
  sentence of trap, one of rule).
- Defaults taken under a loop are listed in the commit body of
  the close, one line each.

The format: `plan/pending/README.md`. Every reader counts the
pending close as closed from the moment it is on main (or on
the PR's branch, for that branch's next chunk).

## 3. Owner: land on main

From the run's detached worktree:

```bash
git fetch origin
git rebase origin/main
node scripts/plan/settle.mjs          # folds this close (and any other) in, commits
node scripts/verify.mjs               # the gate, foreground
git push origin HEAD:main
```

- Rejected (another session landed first): `git fetch`,
  `git reset --keep HEAD~1` (drops only the settle commit),
  rebase, settle, gate, push. Three rejections → stop, report.
- Then the primary checkout, if on `main` and
  clean: `git pull --ff-only`. Otherwise leave it and say so.
- `node scripts/claims.mjs release <id>`.

## 4. Contributor: land as a pull request

```bash
git push -u origin next/<id>
gh pr create --base main --head next/<id> \
  --title "<type>: <what now works> (<id>)" --body-file <scratch>
node scripts/claims.mjs pr <id> <number>
```

- An open PR for `next/<id>` already (`gh pr list --head
  next/<id>`): push to it, never open a second.
- A need still in review: stack on its branch
  (`--base next/<need>`), at most two deep. GitHub retargets
  the PR when the one under it merges.
- Review fixes are new commits, never a rewrite.
- Never settle; the owner's settle folds the pending file in
  after the merge.
- **In a `/heads-down` package:** commit on `pkg/<slug>`, push
  it, no PR: `/heads-down` opens one PR for the package at the
  end (`skills/heads-down.md` §5).

## 5. A run that stops early

- Work worth resuming on its branch: keep the claim, push the
  branch, say where it stands.
- Nothing worth keeping: release the claim, close the
  worktree, say why.
- A crash never releases a claim: it stays held until its TTL
  (24 h), so another session never takes half-built work.
