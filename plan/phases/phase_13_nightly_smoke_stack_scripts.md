# Phase 13 — Nightly full-smoke workflow + stack:up/down scripts

> `customization/hermetic-e2e.md` makes two promises the kit
> doesn't ship: line ~350 says "CI can run a `SMOKE_SAMPLE=full`
> job nightly that walks every URL," and Pattern B's `up.ts`
> snippet talks through port-in-use checks, state files, and
> health polling as if they were reusable mechanics — but no
> template implements either. Bearings decision 2: a doc that
> promises a file the kit doesn't ship is a HIGH finding. Ship
> both, generically, since the concrete spawn commands stay
> project-specific.

## Why

Pattern B's whole pitch is "the discipline is constant; the
moving parts depend on your product." Today an adopter has to
reimplement the constant part (port probing, state-file
read/write, health polling) from scratch every time, from a
TypeScript snippet embedded in prose. And the nightly full-walk
promise — the antidote to the sampling tradeoff two sections
later — has no workflow an adopter can copy; `night.yml`
already runs the breadth leg for projects on loop shape 2 (the
night shift), but a project running only the dispatcher +
heartbeat has nowhere to land it.

## Deliverables

1. `templates/scripts/stack-lifecycle.mjs` — zero-dependency
   ESM helper module, the generic half of Pattern B:
   - `isPortInUse(host, port)` — `net.connect` probe, resolves
     `true`/`false`, never throws.
   - `waitForHealth(url, { timeoutMs, intervalMs })` — polls a
     health endpoint until it responds `< 500`; throws with a
     clear message on timeout (mirrors `deploy-check.mjs`'s
     "read the error, don't retry blindly" posture).
   - `readState(runtimeDir)` / `writeState(runtimeDir, state)`
     — the `.runtime/state.json` convention: JSON read/write,
     `readState` returns `null` on missing file (never throws
     on first run).
   - `isStackHealthy(state)` — `true` iff `state` exists, its
     `pid` is alive (`process.kill(pid, 0)`), and its tracked
     URL answers health.
   A project's own `up`/`down` scripts (spawn commands are
   inherently product-specific — different package managers,
   different service filters) import this module instead of
   reimplementing the mechanics inline.
2. `templates/.github/workflows/nightly-smoke.yml` — model-free
   (no Claude Code action; mirrors `heartbeat.yml`'s "watchers
   dumber than the thing they watch" posture), standalone:
   installs deps, runs the project's e2e suite with
   `SMOKE_SAMPLE=full`, opens (or leaves, deduped) a single
   issue on failure. Header comment states the exclusivity
   rule: adopt this **or** wire the breadth check into
   `night.yml`'s `/digest` step — never both, since both would
   race the same `SMOKE_SAMPLE=full` run on separate cadences.
3. Wire:
   - `customization/hermetic-e2e.md` Pattern B — a line after
     the `up.ts` snippet pointing at the shipped module for the
     generic mechanics.
   - `customization/hermetic-e2e.md` "Sampling parametric
     routes" section — the "CI can run a `SMOKE_SAMPLE=full`
     job nightly" sentence becomes a link to
     `templates/.github/workflows/nightly-smoke.yml`, with the
     one-or-the-other caveat against `night.yml`.
   - `templates/README.md` — tree entries for both files
     (adopt-by-need: hermetic e2e in place).
   - Root `README.md` — templates tree entries for both files.

## Non-goals

- No product-specific `up.mjs`/`down.mjs` template — the spawn
  command, port numbers, and DB seeding are inherently
  per-project; the doc's illustrative snippet stays, now
  wired to the shared helper instead of standing alone.
- No changes to `night.yml` — it already owns the breadth leg
  for night-shift adopters; `nightly-smoke.yml` is the
  alternative for projects without that loop shape, not a
  second copy of the same check.
- No test file — matches the `check-secrets-liveness.mjs` /
  `refresh-critique-session.mjs` precedent (phase 12): only
  `loop-issue.mjs`, the most stateful script, carries unit
  tests today.

## Decisions made upfront

- `isStackHealthy` checks pid liveness AND a URL probe, not
  either alone — a live process serving a 500 is not "healthy"
  for e2e purposes, and a dead pid with a lingering health
  response (another process squatting the port) is exactly the
  failure mode `hermetic-e2e.md` warns about.
- The workflow's exclusivity rule is a comment, not a lint —
  detecting "both workflows exist" mechanically would require
  parsing YAML for a cosmetic overlap; the doc + header comment
  carry the discipline instead.

## Definition of done

Gate green; both files shipped with inline usage docs; linked
from `customization/hermetic-e2e.md`, `templates/README.md`
(tree), and the root `README.md` (tree); build plan row `[x]`
with commit hash.
