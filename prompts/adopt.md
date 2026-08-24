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
  5. ../nexus/playbooks/ci-providers.md  — for the deploy gate
  6. ../nexus/intervention-spectrum.md   — how the loop scales
  7. ../nexus/customization/*.md   — verify gate + hermetic
                                     e2e + data layer + sub-agents

Then:

  - Decide whether this is greenfield or brownfield by reading
    `git log --oneline | wc -l`, looking at the file tree, and
    checking for an existing spec.md.
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
    URL/API/CLI contract if it cannot be inferred. For
    everything else, decide.
  - Adapt bearings.md to reflect the actual stack present in
    this repo. Do not assume Next.js, Tailwind, or any
    specific framework — read package.json / Cargo.toml /
    pyproject.toml / go.mod and adapt.
  - Write a build plan with 10–20 phases drawn from the spec
    (or from CURRENT-STATE.md for brownfield). Phase 1 ships
    the nexus overlay itself; phase 2+ are real product work.
  - Wire the verify gate against this repo's actual test
    setup. Wire the deploy gate against the chosen provider.
  - At the end: produce a single commit titled
    "chore: adopt nexus methodology" with a body listing every
    file added/modified, every placeholder you resolved, and
    every [needs-user-call] you logged. Push.
  - Then stop. Do not invoke /ship-a-phase yourself; let the
    user do that as the first conscious step.

Standing rules carried from agents.md:
  - Commit and push as a single atomic act.
  - No Co-Authored-By trailers, no emojis.
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
