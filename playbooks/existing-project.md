# Playbook: existing project (brownfield retrofit)

> Adopt the autonomous-loop methodology in a repo that already
> has code, tests, conventions, history. Estimated time: **3–5
> hours** of setup. Harder than greenfield because you're
> overlaying without disrupting.
>
> The principle: **the methodology is non-destructive**. Skills,
> plan, agents, and gates layer on top. The existing code stays
> untouched until the loop is asked to modify it.

---

## Prerequisites

- An existing repo, in any state. Has code. Has commits. Has
  some kind of build / test setup.
- A working dev environment — you can run the existing code
  locally.
- A `spec.md` (write one if it doesn't exist — see
  [`new-project.md`](./new-project.md) "Lock the spec").
- The same hosting/CI providers you already use. Don't switch
  hosts during retrofit.

---

## The plan

1. Audit what's there [30 min]
2. Write a (possibly retrospective) spec [30 min, often more]
3. Add the methodology overlay (skills, plan, agents) [45 min]
4. Wire the verify gate against the existing test setup [30 min]
5. Wire the deploy gate against the existing CI [30 min]
6. Write a build plan from where you ARE, not where you started [45 min]
7. Smoke test with a small, low-risk phase [30 min]
8. Ratchet up [variable]

The expensive parts (versus greenfield):
- The build plan has to start from current state, not zero.
- The verify gate has to harmonize with whatever tests exist.
- The deploy gate has to slot into the existing CI without
  breaking it.

---

## 1. Audit what's there

Before adding anything, document the current state. This becomes
the baseline you write the build plan against.

```bash
# Code health
git log --oneline | wc -l                # commit count
git log --since="3 months ago" | grep -c '^Author:'    # recent activity
ls **/package.json **/Cargo.toml **/pyproject.toml 2>/dev/null    # multi-stack?

# Test coverage (whatever applies)
pnpm test --coverage 2>&1 | tail -5
pytest --cov 2>&1 | tail -5
go test ./... -cover 2>&1 | tail -5

# Build health
pnpm build 2>&1 | tail -10
pnpm typecheck 2>&1 | tail -10
pnpm lint 2>&1 | tail -10

# Deploy state
# (provider-specific — check the dashboard or CLI)
```

Write a one-page **current-state assessment** in `plan/CURRENT-STATE.md`:

```markdown
# Current state — <date>

## What's there
- Tech stack: <framework, language, etc.>
- LOC: ~<n>k
- Test coverage: <n>%, last green: <ci link or "unknown">
- Build: <green / red / not wired>
- Deploy: <provider, last green deploy>

## What works
- <feature 1>
- <feature 2>
- ...

## Known broken / decayed
- <bug list>

## What's missing for v1
- <feature gap 1>
- <feature gap 2>

## Conventions worth keeping
- <coding style, structure pattern, etc.>

## Conventions worth breaking
- <legacy patterns we can drop>
```

This is the baseline. The build plan in step 6 starts from here.

---

## 2. Spec — possibly retrospective

If a spec exists: re-read it. Update it to reflect reality.

If no spec: write one. It's harder than greenfield because the
codebase has informed-but-unwritten decisions. Capture them.

Sections to include (compress to 1–2 pages):

- **Product** — what is this thing?
- **Audience** — who uses it?
- **Scope (v1 + 6 months out)** — what's done, what's queued,
  what's never.
- **Stack** — what's actually running.
- **Contracts** — public URLs / API endpoints / CLI surface that
  must not break.
- **Non-goals** — explicit "we don't do this."

If the existing code has drifted from the spec you write — that
drift is a phase in your build plan (or a `triage:loop-queued`
finding for `/iterate`).

Commit `spec.md` and `plan/CURRENT-STATE.md`.

---

## 3. The overlay

Now add the methodology files. **None of these should touch
existing source code.**

```bash
# From your repo root, with nexus/ accessible at ../nexus or wherever
cp -r ../nexus/templates/skills/ ./skills/
cp -r ../nexus/templates/claude/ ./.claude/
mkdir -p ./scripts && cp ../nexus/templates/scripts/deploy-check.mjs ./scripts/
cp ../nexus/templates/agents.md ./agents.md
cp ../nexus/templates/env/env.example ./.env.example

mkdir -p ./plan/steps ./plan/phases
cp ../nexus/templates/plan/README.md ./plan/README.md
cp ../nexus/templates/plan/bearings.md ./plan/bearings.md
cp ../nexus/templates/plan/AUDIT.md ./plan/AUDIT.md
cp ../nexus/templates/plan/CRITIQUE.md ./plan/CRITIQUE.md
```

(If using GitHub-as-DB:
`mkdir -p ./data && cp -r ../nexus/templates/data/* ./data/`.)

Then:

```bash
# .env should be gitignored
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
```

Search-and-replace placeholders (see
[`new-project.md`](./new-project.md) §4 for the mapping table).

Pay special attention in `bearings.md`:

- **Stack section** — fill in what's *actually* there, not what
  you wish was there. The loop assumes bearings is truth.
- **URL / API / CLI contract** — list every public surface
  the existing code already exposes. These are LOCKED. The
  build plan adds new surfaces; it does not change existing
  ones except via deliberate phases.
- **Standing decisions** — code-style conventions, naming, etc.
  Read 5–10 existing files; encode the patterns.

Commit the overlay as one commit: `chore: nexus methodology
overlay (no source changes)`.

---

## 4. Verify gate against existing tests

The verify gate is `pnpm verify` (or whatever your equivalent
is). For an existing project, it harmonizes with what's there:

```json
{
  "scripts": {
    "typecheck": "<your existing typecheck cmd>",
    "test:run": "<your existing test cmd>",
    "build": "<your existing build cmd>",
    "e2e": "<your existing e2e cmd, if any>",
    "lint": "<your existing lint, if any>",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm e2e"
  }
}
```

If a check is currently red and you don't have time to fix it:
**don't skip it from verify**. Instead, document in
`bearings.md` Hard Rules:

> The verify gate is currently red on test X. Until phase Y
> ships the fix, the loop CANNOT autonomously commit; manual
> phases only.

This prevents the loop from learning to ignore red gates.

If your project has no tests at all: that's a phase 1
deliverable. Add a smoke test (anything that runs and passes)
so the gate has a green baseline. The build plan's first phase
expands coverage.

See [`customization/verify-gate.md`](../customization/verify-gate.md)
for stack-specific compositions.

---

## 5. Deploy gate against existing CI

You already have CI/CD. The deploy gate is read-only against
that pipeline — it polls for the deploy state of the just-pushed
commit. It does **not** replace your CI.

Wire `pnpm deploy:check` per
[`ci-providers.md`](./ci-providers.md). Set the auth token in
`.env`.

Special case: **if your existing CI requires PR review before
merge**, the deploy gate runs on `main` after merge. The shipping
skills push to `main` directly (per the methodology); if your
team requires PRs, the loop cannot ship to main. Two options:

**A. Override the methodology to push to a branch.** Add to
`bearings.md`:

> Loop pushes to `loop/<phase-N>` not `main`. The user
> reviews and merges manually. Deploy gate polls preview
> deploys (Vercel/Netlify) instead of production.

**B. Use trunk-based development for loop work.** Allow the
loop direct push to `main`; reserve PRs for human-driven work.

Most teams pick (A) for the first month, (B) once they trust
the loop. The methodology supports both; pick one and document.

---

## 6. Build plan from current state

Open `plan/steps/01_build_plan.md` (the template).

The build plan describes what's *next*, not what's *done*.
Write it as a list of phases that take the project from here
to v1 (or v1.5).

Format the existing Status block to reflect current truth:

```markdown
## Status (at-a-glance)

**Already shipped (pre-loop, prior history):**
- [x] Phase 0a — initial scaffolding (commit history pre-2026-01)
- [x] Phase 0b — current production deployment (last green deploy)

**Next up (autonomous loop's queue):**
- [ ] Phase 1 — <first thing the loop should do>
- [ ] Phase 2 — <next>
- ...
```

The loop's queue should start with **a small, low-risk phase**:
- Adding a missing test.
- Cleaning up a known dead module.
- Bumping a dependency.
- Adding an `<aside>` to one page.

Resist the urge to make the first loop phase ambitious. The goal
is to **prove the loop works in this codebase** — including the
verify gate, the deploy gate, the rollback story. Once that's
proven, phase 2 can be bigger.

Aim for 5–10 phases in the initial plan. Add more as the loop
chews through them and you observe what works.

Commit the build plan and the first phase brief.

---

## 7. Smoke test

Run `/ship-a-phase` (or follow `skills/ship-a-phase.md`
manually).

What you're watching for:

- Does it pick the right phase from the build plan?
- Does it respect the existing code conventions (bearings says
  "we use X" — does it use X)?
- Does verify run cleanly against the existing test suite?
- Does the commit subject match your team's commit style? (If
  not, add a Hard Rule to `agents.md`.)
- Does the push trigger the deploy gate cleanly?

If any step is wrong, **fix the methodology files, not the
code**. The first phase is a calibration run for the
methodology, not a real feature.

If the smoke test ships cleanly: you're calibrated. Move to
real phases.

---

## 8. Ratchet up

Same progression as
[`new-project.md`](./new-project.md) §10:

- 2–3 phases manually.
- Then `/loop /march` for a working session.
- Then unattended afternoon.
- Then unattended overnight.
- Then 80-hour beast.

Brownfield starts the ratchet ~1 phase ahead of greenfield (the
substrate already exists), but takes ~2 phases longer to trust
the loop (the existing code introduces conventions the
methodology has to learn).

---

## Common brownfield gotchas

### Existing tests fail intermittently

The loop treats verify-gate failures as blockers. Flaky tests
will block phases. Either:

- Mark the flaky tests `skip` and add a phase to fix them, OR
- Document in bearings: "Test X is known-flaky; the loop may
  retry the verify gate up to 3 times before treating as red."

The latter is a cop-out; do the former whenever possible.

### CI requires manual approval before deploy

See §5 above. Pick option A (loop pushes to branches) or B
(loop has trunk access). Either works; mixing them confuses the
loop.

### The team has commit-message conventions

Add to `agents.md` Standing Rules:

> Commit subjects follow `<type>(<scope>): <subject>` per the
> team's existing convention. Types: feat, fix, chore, docs,
> refactor, test. Examples: `feat(api): add /v2/users endpoint`.

The skill templates use `feat:`, `data:`, `fix:` prefixes; align
or override.

### The codebase has dead code / debt

The loop won't clean up dead code unless you queue an `/iterate`
finding for it (or add a dedicated cleanup phase). It's not
intrinsically motivated to refactor.

If you want the loop to address debt, write findings:

```markdown
# plan/AUDIT.md — Pending

### [HIGH] Dead module apps/web/src/components/legacy/OldHeader.tsx
- category: refactor
- impact: 6 (~200 lines, blocks header rewrite)
- ease: 8 (one-shot delete + grep callers)
- next: /iterate will pick up
```

`/iterate` ships the cleanup as a normal tick.

### Existing branding / naming differs

Brownfield projects have a name. Don't lowercase it just because
nexus templates do. Update the Hard Rules section of `agents.md`
to reflect your project's actual conventions.

---

## When brownfield retrofit is the wrong move

Some signals that suggest you should **not** apply the autonomous
loop to this project:

- The codebase is in active flux from multiple humans, daily.
  The loop's autonomous commits will conflict.
- The product is in deep discovery — you're rewriting the spec
  weekly. The loop assumes the spec is stable.
- The codebase has security/compliance review on every commit.
  The loop bypasses human review by design.
- The codebase has no tests and no time to add them. Without a
  verify gate, the loop is dangerous.

In those cases: use the agent conversationally instead. The
methodology is for projects where the structure is known and
the work is known but the time isn't there.

---

## You're ready when

- [ ] `spec.md` reflects the current product (retrospective if
      needed).
- [ ] `plan/CURRENT-STATE.md` documents the baseline.
- [ ] `plan/bearings.md` matches what's actually there, not what
      you wish.
- [ ] `plan/steps/01_build_plan.md` starts with a small,
      low-risk phase.
- [ ] `pnpm verify` runs against your existing tests and is
      green (or known-red with a Hard Rule).
- [ ] `pnpm deploy:check` reads your existing provider's deploy
      state.
- [ ] You've decided on PR-or-trunk strategy and documented it.
- [ ] Sub-agents are tuned for your domain.
- [ ] You've smoke-tested with one phase.

When all 9 pass: ratchet up.
