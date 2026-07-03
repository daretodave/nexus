# Playbook: polyrepo (plan/ as its own repo)

> The default layout puts `plan/` inside the product repo.
> Once a project outgrows one shippable unit, both of the
> kit's most mature real adoptions split `plan/` into its own
> repo — a private ledger — with each product a sibling. This
> is that variant, documented as first-class rather than
> improvised per-project.

---

## When the split earns its cost

Reach for polyrepo when **two or more** of these are true:

- Multiple shippable units share one build plan — a site and
  a CLI, or three services, tracked as one backlog instead of
  three unsynced ones.
- The plan should stay private while the product(s) are
  public. One `plan/` repo, visibility set once, instead of a
  private-mirror hack per product repo.
- Plan history and product history diverge in cadence. A
  `plan: phase 4 shipped` commit doesn't belong in the same
  history as the product's own commits, and squash-friendly
  product repos don't want the loop's bookkeeping noise.

When only one of these is true, or none, stay single-repo —
the default the rest of this kit assumes. The split adds a
sync step to every tick; only pay for it once it buys
something.

---

## The layout

```
workspace/
├── plan/                  # the ledger — its own git repo
│   ├── steps/01_build_plan.md
│   ├── AUDIT.md
│   ├── CRITIQUE.md
│   ├── PHASE_CANDIDATES.md
│   ├── bearings.md
│   └── phases/
├── product-a/              # sibling repo, its own git history
│   ├── skills/
│   ├── .claude/
│   └── ... (the product's own code + verify/deploy gates)
├── product-b/               # a second shippable unit, same shape
└── assets/                   # optional — shared design exports
```

`plan/` holds every state file this kit already defines — the
shapes are identical to the single-repo layout, only the
container moved. Each product repo keeps its own `skills/`,
`.claude/`, verify gate, and deploy gate; the loop's shipping
skills run *inside* whichever product repo is doing the
shipping, reading the plan from its sibling.

---

## The additionalDirectories bridge

A product repo's session needs read/write access to `../plan`
without `plan/` living inside it. Claude Code's
`additionalDirectories` setting is the bridge: each product
repo's `.claude/settings.local.json` adds the sibling path.

```json
{
  "permissions": {
    "additionalDirectories": ["../plan"]
  }
}
```

`settings.local.json` is personal/local config (not the
committed `settings.json` allowlist) — each clone points it at
wherever `plan/` actually sits on that machine. Non-Claude-Code
runners: grant the equivalent — a mounted path, a symlink, or
a second checkout — whatever makes `../plan` resolve from the
product repo's working directory.

---

## How the loop changes

The skills are unchanged; three things about the *tick* are
not:

**Step 0 syncs two repos.** Where a single-repo tick runs one
`git pull --ff-only`, a polyrepo tick runs it twice — once in
`plan/`, once in the product repo doing the work. Divergence in
either stops the tick per the standing rule; there is no
partial-sync state.

**The atomic act spans two repos, in order.** A phase tick
still ends in one atomic commit-and-push act, but it's now two
commits across two repos, pushed in a fixed order:

1. **Product repo first** — the actual shipped work (docs,
   code, templates).
2. **Plan repo last** — the tick (phase ticked `[x]`, AUDIT
   row moved to Done, whatever state changed).

This order is the whole rule: **the ledger never references
unpushed work.** If the plan repo's commit landed first and the
product push then failed, the ledger would claim a phase
shipped that the world can't see yet. Product-first means the
worst case is a ledger that's one tick *behind* reality —
recoverable — never one tick *ahead* of it.

**Verify and deploy gates stay per-product-repo.** Each product
keeps its own hermetic verify gate and its own deploy gate;
`plan/` has no gate of its own (it's prose, not shippable
code). A polyrepo tick is still exactly as safe as a
single-repo tick — the gate just runs in the sibling directory
instead of the current one.

**State files stay identical.** `plan/steps/01_build_plan.md`,
`plan/AUDIT.md`, `plan/CRITIQUE.md`, `plan/bearings.md`, and
the rest keep the exact shapes this kit documents everywhere
else. Nothing about a phase brief, an audit row, or a critique
finding format changes — only where the file's repo boundary
sits.

---

## Documented limitation: the cloud loop

The Actions cloud loop (`playbooks/cloud-loop.md`) must run
where the state lives — the `plan/` repo — since that's the
repo whose Actions cron fires the tick. To then push into
product repos, its checkout needs a `repo`-scoped PAT (or GitHub
App installation) covering every product repo, not just
`plan/`'s own `GITHUB_TOKEN`.

This is a real limitation, not a solved pattern: broader
token scope than the single-repo cloud loop needs, and a
cross-repo push that the current `march.yml` template doesn't
implement. Flag it in your own `bearings.md` if you adopt the
cloud loop under polyrepo; don't discover it mid-window. Local
`/loop /march`, run from inside each product repo with `plan/`
bridged per above, works today with no changes.

---

## You're ready when

- [ ] `plan/` is its own repo, cloned as a sibling of every
      product repo it tracks.
- [ ] Each product repo's `settings.local.json` bridges
      `../plan` via `additionalDirectories` (or the
      non-Claude-Code equivalent).
- [ ] You've confirmed the push order — product first, plan
      last — is written into that product's `agents.md` or
      `bearings.md`, not just remembered.
- [ ] Each product repo still verifies and deploys entirely on
      its own; `plan/` has no gate.
- [ ] If you're adding the cloud loop: the PAT/App scope
      question above is answered, not deferred.

---

## See also

- [`../concepts/architecture.md`](../concepts/architecture.md)
  — the "Topology" section places this variant against the
  single-repo default.
- [`new-project.md`](./new-project.md) /
  [`existing-project.md`](./existing-project.md) — the
  single-repo playbooks this variant sits on top of.
- [`cloud-loop.md`](./cloud-loop.md) — the Actions runtime;
  see the limitation above before arming it under polyrepo.
