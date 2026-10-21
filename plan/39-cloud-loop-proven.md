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

- **A1** One PR-mode tick ran on GitHub end to end; what broke
  is fixed in the templates.
- **A6** Every template script test passes in a fresh adopter: hook imports use `.claude/hooks/`, and the steer settings check reads `<repo>/.claude/settings.json`.
- **A7** new-project.md copies `plan/pending/README.md`, writes `.gitattributes` (`eol=lf`, `plan/ARCHIVE.md merge=union`) and a `.gitignore`, and its prune text agrees with its example.
- **A8** Every angle-bracket placeholder in the templates is documented and swept, or the gate flags an unswept one in an adopter.
- **A9** A library with no deploy host adopts cleanly: agents.md rules 1 and 4 and bearings.md have a "no deploy gate" path.
- **A10** The package manager is a placeholder end to end (install-hooks, the setup action, the march prompts, settings.json), and the setup action works without a lockfile.
- **A11** Day one in an agent session works: the settings allowlist covers claims, plan-check and the plan scripts; `claims whoami` explains `NEXUS_NO_HOOK_CHECK`; the placeholder sweep doesn't need to read `.env.example`; existing-actions Step 9 dispatches after enabling.
- **A12** templates/README says which kit script tests belong in an adopter's gate and what they cost, and the workflows use the Node 24 action majors.

## Open questions

(None.)

## Chunks
Measure: 8 open · 4 closed · next A13

- [ ] **39.4** One real PR-mode tick in a scratch adopter repo
  · M · closes A1 · needs —
- [ ] **39.5** Template script tests pass in a fresh adopter · S · closes A6 · needs —
  - steer.test.mjs:12,14,162 and claims.test.mjs:263 assume the kit's `claude/` layout.
- [ ] **39.6** new-project.md copies everything a v2 plan needs · S · closes A7 · needs —
- [ ] **39.7** Every template placeholder documented, swept or flagged · M · closes A8 · needs —
  - Undocumented today: `<CONTENT_LOCATION>`, `<DATA_LOCATION>`, `<PROVIDER_AUTH_TOKEN>`, `<DEPLOY_URL>`, `<DOMAIN_SPECIALIST>`, `<SPECIALIST_NAME>`, `<CANONICAL SIBLING>`, `<PROJECT-SPECIFIC RULES…>`.
- [ ] **39.8** A no-deploy-host path in the templates · S · closes A9 · needs —
- [ ] **39.9** The package manager is a placeholder end to end · M · closes A10 · needs —
- [ ] **39.10** Day one in an agent session needs no workaround · S · closes A11 · needs —
- [ ] **39.11** The adopter gate's cost, and actions on Node 24 majors · S · closes A12 · needs —
  - checkout and setup-node v4 warn that they target the deprecated Node 20.
