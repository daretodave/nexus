# Playbook: owner mode (how work lands)

> Every adopter runs the same verbs (`/ship-a-chunk`, `/next`,
> `/heads-down`, `/plot`); one switch on the checkout decides
> how their work lands. The owner's checkout pushes straight
> to the default branch and settles the plan. Every other
> checkout lands through pull requests. Learned from a mature
> adopter whose owner, loops and contributors shared one plan
> this way for months. About fifteen minutes to set up.

---

## The two modes

| | Owner mode | Contributor mode (the default) |
|---|---|---|
| Who | the owner's own checkout (and its worktrees, and the owner's cloud loop) | every other clone, and the owner's when switched off |
| Marker | an untracked `.owner` file at the checkout root | no `.owner` |
| Lands | commit, then `git push origin main` at once | a `next/<id>` branch (a package: `pkg/<slug>`), pushed, as a pull request |
| The plan | settles `plan/pending/` into the shared plan files | writes only `plan/pending/<id>.md` |
| Claims | many chunks in one call, as `privileged_agent_session` | one chunk per call (a `/heads-down` package: one batch) |

Owner mode is a property of the checkout, never of the repo.
`scripts/owner.mjs` decides it, and every script that cares
(settle, claims, the push policy) asks it:

- **Effective owner mode** is `.owner` present **and** not
  switched off in `.nexus/local.json` (`{ "ownerMode": false }`)
  **and** `NEXUS_CONTRIBUTOR` not set to `1`.
- **No `.owner`, no option.** Without the file the setting
  is ignored: owner mode is not something a contributor turns
  on.
- **A committed `.owner` counts for no one.** It would make
  every clone the owner's, so only an untracked one counts.
  Both `.owner` and `.nexus/` belong in `.gitignore`.

Check a checkout with `node scripts/claims.mjs whoami`: it
prints `owner` or `contributor`.

## Step 1 — choose at onboarding

Contributor mode needs nothing: it is what a fresh clone
gets. To make this checkout the owner's:

```bash
printf '.owner\n.nexus/\n' >> .gitignore   # once per repo, if missing
touch .owner
node scripts/claims.mjs whoami              # prints owner
```

```powershell
Add-Content .gitignore ".owner`n.nexus/"     # once per repo, if missing
New-Item -ItemType File .owner -Force | Out-Null
node scripts/claims.mjs whoami              # prints owner
```

To work as a contributor for a session without deleting the
file (to rehearse the PR path, or to send a package as a pull
request), write `{ "ownerMode": false }` to `.nexus/local.json`
(the local GUI's settings toggle writes the same file), or
prefix one command with `NEXUS_CONTRIBUTOR=1`.

## Step 2 — arm the leg trip

```bash
node scripts/install-hooks.mjs
```

That writes two git hooks: `pre-commit` runs the verify gate,
and `pre-push` runs `scripts/git/push-policy.mjs`, which
refuses a push to the default branch from a checkout not in
owner mode. `--only pre-push` arms just the policy;
`--uninstall` removes both. The hook skips any step whose
script is missing, so pruning a script never breaks a push.

The push policy also drops the `claims` ref from what any
later pre-push step checks: claims are written by
compare-and-swap at any time (`customization/claims.md`), and
a secret scan or plan check has nothing to say about them. If
your default branch isn't `main`, set `NEXUS_MAIN_BRANCH`.

The `.owner` file is untracked, so a contributor could make
one. The hook is a leg trip for a loop on autopilot, never a
lock. The lock is Step 3.

## How the owner lands

Commit, then push the default branch, as one atomic act, the
same as every nexus repo always has. Before the push, fetch
and rebase onto `origin/main`, rerun the gate, and push again
if the push was rejected (several owner sessions at once each
do this; claims keep them off each other's chunks). Then
settle: `node scripts/plan/settle.mjs` folds `plan/pending/`
into the shared plan files on main, including the pending
files a merged contributor PR brought in, all at once.

## How a contributor lands

- **One branch per chunk**, `next/<id>`, cut from
  `origin/main` in its own worktree. A `/heads-down` package
  is one branch, `pkg/<slug>`, holding one commit series and
  one pending file per chunk.
- **The plan through pending files only.** The branch never
  edits `plan/README.md`, a spec, `ARCHIVE.md` or the
  `Measure:` lines: it adds `plan/pending/<id>.md`, and the
  owner's settle applies it after the merge. Every reader
  counts a pending close as closed, so nothing waits on it.
- **Push the branch, open the pull request**
  (`git push -u origin HEAD`, then `gh pr create`), and
  attach it to the claim: `node scripts/claims.mjs pr <id> <n>`.
  The claim lives until the PR merges or closes.
- **Stack at most two deep.** Work that needs an open PR's
  chunk branches from that PR's branch and opens its PR onto
  it; the host retargets it to main when the first merges.
  Nothing branches from the second: a third waits.
- **Review fixes are new commits** on the branch. Never amend
  a pushed commit, never force-push, never rebase a branch
  someone has reviewed. Bring main in with a merge.

## Step 3 — the lock: rulesets

The host's branch rules are what actually stop a push to
main. On GitHub, two rulesets (rulesets need a public repo,
or a paid plan for a private one; on GitHub Free a private
repo has only the leg trip):

- **The default branch:** a pull request required, no force
  push, no deletion, and the repository admin role (the owner)
  may bypass, so the owner's checkout and the owner's cloud
  loop still push straight to it.
- **`claims`:** no force push, no deletion, nothing else, so
  anyone who can push may claim (open claims, the default).
  To protect claims, add "restrict updates" with the same
  admin bypass: a contributor's claim then fails with "claims
  are protected: ask the owner", and claiming becomes the
  owner's (`assign` a chunk to a contributor's login).

Write the two rule sets, then post them (`<REPO_SLUG>` is
`owner/repo`):

```bash
cat > main-ruleset.json <<'EOF'
{
  "name": "default branch: pull requests only",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
      "required_approving_review_count": 0,
      "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_review_thread_resolution": false } }
  ]
}
EOF
cat > claims-ruleset.json <<'EOF'
{
  "name": "claims: compare-and-swap only",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/claims"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
EOF
gh api --method POST repos/<REPO_SLUG>/rulesets --input main-ruleset.json
gh api --method POST repos/<REPO_SLUG>/rulesets --input claims-ruleset.json
rm main-ruleset.json claims-ruleset.json
```

```powershell
@'
{
  "name": "default branch: pull requests only",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
      "required_approving_review_count": 0,
      "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_review_thread_resolution": false } }
  ]
}
'@ | Set-Content main-ruleset.json
@'
{
  "name": "claims: compare-and-swap only",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/claims"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
'@ | Set-Content claims-ruleset.json
gh api --method POST repos/<REPO_SLUG>/rulesets --input main-ruleset.json
gh api --method POST repos/<REPO_SLUG>/rulesets --input claims-ruleset.json
Remove-Item main-ruleset.json, claims-ruleset.json
```

For protected claims, add `{ "type": "update" }` to the
claims rules and the same `bypass_actors` line as main's
before posting. `gh api repos/<REPO_SLUG>/rulesets` lists
what is in force; the repository's Settings → Rules page
shows the same.

## The cloud loop

A cloud loop runs either way. In owner mode it pushes to main
like the owner (its token needs the ruleset bypass: a token
of the owner's, or an app added to `bypass_actors`), and its
safety is the gate. In contributor mode each tick claims one
chunk as a contributor, works on its own branch, writes only
pending files, and opens a pull request. Hooks aren't armed
on a hosted runner, so the ruleset is the only rule there.

## Checklist

- [ ] `.owner` and `.nexus/` are in `.gitignore`.
- [ ] The owner's checkout has `.owner`;
      `node scripts/claims.mjs whoami` prints `owner` there and
      `contributor` in any other clone.
- [ ] `node scripts/install-hooks.mjs` run in each checkout
      (the hooks aren't cloned).
- [ ] A test push to main from a contributor checkout is
      refused by the hook, and by the ruleset with the hook
      uninstalled.
- [ ] `agents.md` standing rule 1 reads "land per owner mode"
      (`templates/agents.md` has it).

## See also

- [`../customization/claims.md`](../customization/claims.md):
  who builds which chunk; the owner's claims and a
  contributor's.
- [`../concepts/plan-shape.md`](../concepts/plan-shape.md):
  pending files, and the owner's settle.
- [`cloud-loop.md`](./cloud-loop.md): the scheduled loop.
