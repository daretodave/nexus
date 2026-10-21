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

## Open questions

(None.)

## Chunks
Measure: 1 open · 4 closed · next A6

- [ ] **39.4** One real PR-mode tick in a scratch adopter repo
  · M · closes A1 · needs —
