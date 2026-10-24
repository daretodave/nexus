# 39 — The pull-request cloud loop, proven end to end

> One real pull-request-mode tick has run in a scratch adopter
> repo, from pick to release; bootstrap installs either mode
> from the manifest; and nexus handles contributor PRs' claims.

## Why

The PR-mode loop (pick, build with no token, land, release;
`pr-flow`, `pr-resolve`) is tested only as scripts against
scratch git repos. No workflow run of it has happened on
GitHub. Bootstrap only logs how to set `NEXUS_LOOP_MODE`, and
`pr-resolve.yml` hard-codes `main`.

What exists today (2026-10-20): `templates/.github/workflows/
{march,night,pr-flow,pr-resolve}.yml`,
`templates/scripts/cloud/tick.mjs`,
`templates/scripts/pr/resolve.mjs`, `bootstrap.mjs`
(`install-workflow`), `playbooks/cloud-loop-existing-actions.md`.

A fresh adoption for the 39.4 tick (a zero-dependency Node
library in pull-request mode, 2026-10-21) hit thirteen
problems in the templates and playbooks; every new adopter
would. The chunks below fix them.

## Design

- **A real tick:** a scratch repo on GitHub, adopted from the
  templates, runs `march` by `workflow_dispatch` with a chunk
  id. Check: the bundle passed between jobs, land's push and
  `gh pr create`, the claim recording the PR, `pr-flow`
  pruning it on close, `pr-resolve` pushing with per-call
  auth. Held: it creates a repo on the owner's account.
- **Bootstrap:** a manifest field `cloud_loop.mode`
  (`owner|pr`) sets `NEXUS_LOOP_MODE`
  (`bootstrap.example.json` too); `pr-resolve.yml` uses
  `<DEFAULT_BRANCH>`, which bootstrap and `cloud-loop.md`
  substitute.
- **nexus's own repo:** gains `pr-flow.yml` (a contributor
  PR's claims released on close). Default: no `pr-resolve`
  for nexus; it runs in owner mode and contributor PRs are
  rare.
- **Claims board (optional):** a workflow behind
  `NEXUS_CLAIMS_BOARD` that keeps one issue showing the live
  claims.

## Acceptance

- **A9** A library with no deploy host adopts cleanly: agents.md rules 1 and 4 and bearings.md have a "no deploy gate" path.
- **A11** Day one in an agent session works: the settings allowlist covers claims, plan-check and the plan scripts; `claims whoami` explains `NEXUS_NO_HOOK_CHECK`; the placeholder sweep doesn't need to read `.env.example`; existing-actions Step 9 dispatches after enabling.
- **A12** templates/README says which kit script tests belong in an adopter's gate and what they cost, and the workflows use the Node 24 action majors.
- **A13** When a close empties a spec, settle absorbs it (spec deleted, its roadmap row gone, a "spec complete" archive line) or stops with the exact steps; it never dies with a stack trace because the commit hook refused.
- **A14** The gate's placeholder check reads pending files as settled, as the chunks check does, so a pending Add with an unknown placeholder fails before it settles.
- **A15** A merged loop PR's `nexus/<run>` branch is deleted (pr-flow, or the adoption sets the repository's delete-on-merge).
- **A16** Adopting a repo with no GitHub remote yet works literally: new-project.md creates or confirms the remote before adopt.md asks owner or contributor, and adopt.md's recommendation falls back to owner when `gh repo view` finds no remote.

## Open questions

(None.)

## Chunks
Measure: 7 open · 9 closed · next A17

- [ ] **39.8** A no-deploy-host path in the templates · S · closes A9 · needs —
- [ ] **39.10** Day one in an agent session needs no workaround · S · closes A11 · needs —
- [ ] **39.11** The adopter gate's cost, and actions on Node 24 majors · S · closes A12 · needs —
  - checkout and setup-node v4 warn that they target the deprecated Node 20.
- [ ] **39.12** Settle absorbs an emptied spec, or says how · S · closes A13 · needs —
  - Seen in the scratch adopter: the pre-commit gate refused "spec 01 lists no chunk now" and settle threw from `git commit`. The roadmap row there read `| 1 |`, not `| 01 |`.
- [ ] **39.13** The placeholder check reads the settled view · S · closes A14 · needs —
- [ ] **39.14** Merged loop branches are deleted · S · closes A15 · needs —
- [ ] **39.15** Adoption works before a GitHub remote exists · S · closes A16 · needs —
  - From critique pass 28 (2026-10-22): `gh repo view --json viewerPermission` exits 1 with "no git remotes found" in a `git init`-only repo, so adopt.md's ask-list item (e) has no recommendation.
