# Adopt nexus — agent prompt

> Clone nexus next to your repo, then paste the short version
> from README.md's
> [TL;DR — clone + delegate the adoption](../README.md#tldr--clone--delegate-the-adoption)
> into your agent — it points here. This file is the full
> instruction set the agent then follows; read it yourself
> first if you want to know exactly what you're authorizing.
>
> Use this if you already have a `spec.md`. If you only have a
> verbal pitch, use [`pitch.md`](./pitch.md) instead.

---

## The prompt

```
Adopt nexus.

nexus is at ../nexus (or ./.nexus if submoduled). It is a
methodology + template kit for turning this repo into an
autonomous-loop project. Read the following, in order, before
making a single change:

  1. ../nexus/README.md            — entry point
  2. ../nexus/concepts/architecture.md  — the whole system
  3. ../nexus/concepts/skills-anatomy.md — how skills work
  4. ../nexus/playbooks/new-project.md   AND
     ../nexus/playbooks/existing-project.md
                                   — pick the one that applies
  4a. ../nexus/playbooks/polyrepo.md AND/OR
      ../nexus/playbooks/workspace.md
                                   — only if the topology check
                                     under "Then:" below (in
                                     this same prompt) lands on
                                     either
  5. ../nexus/playbooks/ci-providers.md  — for the deploy gate
  6. ../nexus/intervention-spectrum.md   — how the loop scales
  7. ../nexus/customization/*.md   — e.g. verify gate, hermetic
                                     e2e, data layer, sub-agents;
                                     skim the rest as needed

Then:

  - Decide whether this is greenfield or brownfield by reading
    `git log --oneline | wc -l`, looking at the file tree, and
    checking for an existing spec.md.
  - Check the topology: is there already a sibling `plan/`
    directory next to this repo, or multiple sibling repos
    under one un-versioned root? Infer a default from that
    (single-repo if neither), but always confirm it with the
    user before proceeding — see the ask list below. Getting
    this wrong reshapes file locations from phase 1 onward.
  - Follow the matching playbook end-to-end. Do not skip steps.
  - Copy templates from ../nexus/templates/ into this repo.
  - Replace placeholders (<PROJECT>, <PROJECT_LOWER>,
    <PROJECT_TAGLINE>, <HOSTING_URL>, <HOSTING_PROVIDER>,
    <REPO_SLUG>, <DEFAULT_BRANCH>, <PROJECT_PKG_PREFIX>) with
    values you derive from the existing repo state. If a value
    is genuinely unknowable, surface it in plan/AUDIT.md as a
    [needs-user-call] row and continue with a defensible
    default.
  - Ask the user ONLY for: (a) the hosting provider name and
    auth token if not visibly configured, (b) the project's
    canonical name + tagline if no spec exists, (c) the
    URL/API/CLI contract if it cannot be inferred, (d)
    confirmation of the topology guess above — single-repo,
    polyrepo (`plan/` split into a sibling repo), or workspace
    (3+ sibling repos under one un-versioned root), (e) the
    mode: owner (this checkout pushes main and settles the
    plan) or contributor (every change lands as a pull
    request); owner (Recommended) when the person owns the
    repo (`gh repo view --json viewerPermission` says ADMIN,
    or the remote's owner is theirs), contributor otherwise.
    Ask them all before your first write, in one batch
    shaped per ../nexus/concepts/asking-well.md (two batches
    if more than four apply, both before the first write).
    For everything else, decide.
  - Set up the mode (../nexus/playbooks/owner-mode.md):
    either way, add `.owner` and `.nexus/` to `.gitignore` if
    missing; for owner, also create an empty, untracked
    `.owner` at the repo root (never commit it). Then, either
    way, run `node scripts/install-hooks.mjs` after the
    adoption commit, before the push: it arms the verify
    gate as pre-commit and the push policy as pre-push (a
    push to main on origin or upstream is refused outside
    owner mode). Rerun it where hooks exist already: it
    rewrites a hook it wrote before with the current body.
    Check with
    `node scripts/claims.mjs whoami` (it prints owner or
    contributor). Hooks aren't cloned: every other checkout
    runs install-hooks itself.
  - Adapt bearings.md to reflect the actual stack present in
    this repo. Do not assume Next.js, Tailwind, or any
    specific framework — read package.json / Cargo.toml /
    pyproject.toml / go.mod and adapt.
  - Write the plan as specs and chunks (nexus/concepts/
    plan-shape.md): a plan/README.md roadmap with one row per
    spec drawn from the spec (or from CURRENT-STATE.md for
    brownfield), the first spec or two chunked (S/M/L, every
    acceptance ID covered), the rest `Not chunked yet.`.
    Copy templates/plan/nexus.lock and run
    scripts/plan-check.mjs until it is green.
  - Wire the verify gate against this repo's actual test
    setup. Wire the deploy gate against the chosen provider.
  - At the end: produce a single commit titled
    "chore: adopt nexus methodology" with a body listing every
    file added/modified, every placeholder you resolved, and
    every [needs-user-call] you logged, and the mode chosen.
    Push it: owner pushes main; contributor pushes a branch
    and opens the pull request (the pre-push hook refuses
    main).
  - Then stop. Do not invoke /next yourself; let the
    user do that as the first conscious step.

Standing rules carried from agents.md:
  - Commit and push as a single atomic act.
  - No Co-Authored-By trailers, no emojis. If your harness
    auto-appends one of these by default, strip it before every
    commit — this rule overrides that convention here.
  - No --no-verify, no force-push, no destructive resets.
  - Tests alongside code.
  - When in doubt: decide, document the call in the commit body,
    proceed.

Estimated time: well under an hour, agent-paced (no
read-and-decide pauses) — new-project.md's own header quotes
2–3 hours for a human working the same playbook manually and
notes the delegated-agent case finishes faster; see its note
on the difference. Begin.
```

---

## See also

- [`README.md`](../README.md) — the short paste that points
  here, plus what to expect when the agent returns and when
  this path is the wrong one.
- [`playbooks/new-project.md`](../playbooks/new-project.md) /
  [`playbooks/existing-project.md`](../playbooks/existing-project.md)
  — the playbooks this prompt tells the agent to follow.
- [`pitch.md`](./pitch.md) — the pre-spec variant, for when
  there's no `spec.md` yet.
