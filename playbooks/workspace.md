# Playbook: workspace (un-versioned root, org-per-project)

> [`polyrepo.md`](./polyrepo.md) splits `plan/` out of one
> product repo into a sibling. Two of the kit's own real-world
> ancestors kept growing past that: a third repo, a fourth, all
> living under one local root that is itself never a git repo,
> each repo a peer under the same GitHub org. This playbook
> names that root as first-class instead of leaving every
> adopter to re-improvise it once they outgrow `polyrepo.md`'s
> two-repo shape.

---

## When it earns its cost

| Shape | Repos under one root | Reach for |
|---|---|---|
| Default | 1 (`plan/` inside the product) | nothing — stay single-repo |
| Split plan | 2 (`plan/` + one product) | [`polyrepo.md`](./polyrepo.md) |
| Workspace | 3+ (`plan/` + multiple products, or `plan/` + product + a design/assets repo) | this playbook |

The signal isn't repo count alone — it's whether the root
itself has started accumulating things that don't belong to
any one repo: a scratch note comparing two products, an editor
session that opens three repos at once, a local-only secrets
bridge. `polyrepo.md` never has to answer "where does *that*
live"; a workspace does, on day one.

If you're not sure yet, stay on `polyrepo.md` — this playbook
adds nothing polyrepo doesn't already give you until a third
repo actually shows up.

---

## The un-versioned-root rule

The workspace root is a plain directory. It is never
`git init`'d, never pushed anywhere, never has its own commit
history. One rule, one reason: `polyrepo.md`'s push-order
guarantee (product repos first, the `plan/` repo last, so the
ledger never references unpushed work) only holds because a
tick's atomic act spans a fixed, known number of repos. A
versioned root would be an unnamed third participant in every
sync — a repo the loop's Step-0 `git pull --ff-only` doesn't
know to run, and a fourth thing that can diverge silently.

```
workspace/                 # plain directory — never `git init`
├── plan/                  # its own git repo (see polyrepo.md)
├── product-a/              # sibling repo, its own git history
├── product-b/               # a second product, same shape
├── assets/                   # a third repo, if design owns one
├── .workspace.code-workspace   # editor multi-root file (local, gitignored per-repo — not tracked anywhere)
└── NOTES.md                     # personal scratch — same rule as .article/: never tracked, never referenced from tracked docs
```

Everything under the root keeps `polyrepo.md`'s layout and
rules unchanged per repo — same `plan/` shapes, same
`additionalDirectories` bridge, same product-first push order.
Workspace only answers the question polyrepo doesn't: what
happens to content that isn't any single repo's.

---

## What lives only at root

Root-level content is, by the rule above, never committed to
any repo. That's a feature — it means the root can hold exactly
the things that are personal, local, or genuinely cross-cutting
without ever needing a `.gitignore` entry per repo:

- **Local scratch** — comparison notes, a running list of
  cross-product questions. Same category as `.article/`
  (`agents.md`) inside a single repo: never tracked, never
  linked from a tracked doc.
- **An editor multi-root workspace file** (e.g. a `.code-
  workspace` for VS Code, or the equivalent session file for
  your editor) — opens every sibling repo as one workbench
  without merging their histories.
- **A personal secrets bridge** — an untracked `.env.workspace`
  or shell profile snippet holding tokens no single repo's gate
  needs but a cross-repo script might (a script that walks every
  sibling to run its own verify gate, for example).
- **Nothing that needs history.** The moment something at root
  needs a commit log, a diff, or a PR, it belongs in one of the
  sibling repos instead — usually `plan/`, since it's already
  the ledger.

---

## Org-per-project GitHub layout

Put `plan/` and every product repo under one GitHub org rather
than scattering them across personal accounts or nesting them
as folders in one mono-repo. One org gives you one place to set
visibility per repo (`plan/` private while products are public,
same as `polyrepo.md` already recommends) and one place to
manage collaborator access, without coupling any two repos'
history.

A minimal root pointer, so an agent that lands at the workspace
root — not inside any one repo — can orient itself before
`cd`-ing into the repo it needs:

```markdown
<!-- workspace root CLAUDE.md (and its AGENTS.md mirror) -->
# Workspace root — not a repo

This directory is a plain folder, never `git init`'d. Every
child directory is its own GitHub repo under the
<your-org> org:

- `plan/` — the ledger (private). See plan/bearings.md.
- `<product-a>/` — <one line: what it ships>
- `<product-b>/` — <one line: what it ships>

`cd` into the repo you need; each has its own agents.md/
CLAUDE.md, verify gate, and git history. Nothing at this level
is tracked or shipped.
```

This snippet now has a copyable counterpart:
[`templates/workspace/`](../templates/workspace/) ships
`CLAUDE.md` + `AGENTS.md` (the pair above, with placeholders),
a human-facing `README.md`, and `REPOS.md` — a clone manifest
for rebuilding the workspace on a new machine. Copy the
*content* into the root, not the files' git history — the root
itself still never becomes a repo. `prompts/adopt.md` also asks
a fresh adopter to confirm this topology before proceeding,
rather than guessing silently.

After copying, sweep `<WORKSPACE_ORG>` (and `<PROJECT>` per
sibling repo) across the four files:

```bash
sed -i -e 's/<WORKSPACE_ORG>/your-org/g' \
  CLAUDE.md AGENTS.md README.md REPOS.md
```

The PowerShell twin:

```powershell
Get-ChildItem CLAUDE.md,AGENTS.md,README.md,REPOS.md | ForEach-Object {
  (Get-Content $_ -Raw) -replace '<WORKSPACE_ORG>', 'your-org' |
    Set-Content $_ -NoNewline
}
```

---

## Ready when

- [ ] The root directory has no `.git/` of its own, and never
      will — confirmed by habit, not tooling (there's nothing
      to gate; a `git init` at root is a one-time human mistake
      to watch for, not a check the loop can run for you).
- [ ] Every repo under the root — `plan/` and each product —
      already follows `polyrepo.md`'s per-repo rules: own git
      history, own verify/deploy gates, `additionalDirectories`
      bridging `../plan` where needed.
- [ ] All repos sit under one GitHub org with visibility set
      per repo.
- [ ] Anything you were tempted to put at root either has a
      home in one repo (usually `plan/`) or is genuinely
      personal/local scratch — nothing sits at root "for now."
- [ ] A root pointer file (CLAUDE.md/AGENTS.md, copied from
      `templates/workspace/`) exists so a cold agent session at
      the root can orient without guessing, and `REPOS.md`
      lists every sibling repo's clone command.

---

## See also

- [`polyrepo.md`](./polyrepo.md) — the two-repo split this
  playbook generalizes; the layout, the `additionalDirectories`
  bridge, and the push-order rule are all defined there once.
- [`../concepts/architecture.md`](../concepts/architecture.md)
  — the "Topology" section places all three shapes (single-repo,
  polyrepo, workspace) on one ladder.
- [`cloud-loop.md`](./cloud-loop.md) — `polyrepo.md`'s
  cloud-loop limitation (broader PAT scope, cross-repo push)
  applies unchanged here; a workspace only adds more sibling
  repos the same token needs to reach.
