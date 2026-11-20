# 01 — Bootstrap

> <PROJECT> boots locally, its verify gate is green, and every
> push to `<DEFAULT_BRANCH>` deploys to <HOSTING_URL> with a
> deploy gate that reports the result.

Agent-facing spec. Concise, opinionated, decisive. Every
judgment call is made below; a build that meets a new one
decides it and records it in the commit body. This is the
first spec, so there is no shipped sibling to copy from.

## Why

There is no code yet. Every later spec assumes a project that
builds, tests, deploys and reports, so this one makes that true
before anything else ships.

## Design

- **Stack pins.** <Specific package versions. Bump if a stable
  major has shipped at build time; record it in the commit
  body.>
- **Outputs.** <Every file this spec produces. Stack-specific.
  For a typical web stack: project init, base layout, design
  tokens, the verify gate, the deploy gate.>
- **Verify gate.** <your stack's composition>, run as
  `pnpm verify`, plus `node scripts/plan-check.mjs --since
  HEAD` so the plan stays true.
- **Deploy gate.** The first `pnpm deploy:check` after the
  first push will probably fail (auto-deploy hits the new
  bootstrap before plugin install completes; common). Iterate
  within 01.3 until green: read the deploy log, fix the
  infrastructure file (`netlify.toml` / `vercel.json` /
  equivalent), push again. Three same-root-cause misses is a
  stop.
- **Responsive.** <For web projects: how the base layout
  reflows at 375px.>
- **Git.** If the repo is freshly init'd: `git init -b
  <DEFAULT_BRANCH>`, add origin, first commit. Otherwise each
  chunk lands as a commit on `<DEFAULT_BRANCH>`.

Decisions made upfront (do not ask):

- <Decision 1>
- <Decision 2>

## Contracts

- <Only what pins something: the verify composition's script
  names, the deploy-check exit codes, the base route.>

## Acceptance

- **A1** `pnpm dev` serves the base layout locally; unit tests
  for every helper pass.
- **A2** `pnpm verify` runs <typecheck → test → build → e2e>
  and is green.
- **A3** A push to `<DEFAULT_BRANCH>` deploys, and `pnpm
  deploy:check` exits 0 against <HOSTING_URL>.

## Open questions

(None. A spec that leaves open questions fails its job; move
an answer into Design the moment it exists.)

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **01.1** Project init and base layout, with unit tests ·
  M · closes A1 · needs —
- [ ] **01.2** The verify gate, green end to end · S · closes
  A2 · needs 01.1
- [ ] **01.3** Deploy wiring and a green deploy gate · M ·
  closes A3 · needs 01.2
  - Iterate within this chunk until `pnpm deploy:check` is
    green; that's expected on a first deploy.
