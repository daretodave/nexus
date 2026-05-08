# Phase 1 — Bootstrap

> Agent-facing brief. Concise, opinionated, decisive. Ship
> without asking; document any judgment calls in the commit
> body. This is the first phase — there is no shipped sibling
> to copy from.

## Scope

<What phase 1 produces. Stack-specific. For a typical web
stack: project init, base layout, design tokens, verify gate
green, deploy gate functional, dev server runs.>

## Outputs

```
<Enumerate every file phase 1 should produce. Stack-specific.>
```

## Stack pins (versions)

<Specific package versions. Bump if a stable major has shipped
at runtime; document in commit-body Decisions.>

## Verify gate

```bash
<your stack's verify composition>
pnpm verify
```

Must pass before commit.

## Deploy gate

After `git push`, `pnpm deploy:check` will probably fail the
first time (auto-deploy hits the new bootstrap before plugin
install completes; common). Iterate within phase 1 until green.

If you can't get green within 3 same-root-cause iterations:
read the deploy log, identify the infrastructure issue, fix in
`netlify.toml` / `vercel.json` / equivalent, push again.

## Tests

### Unit
- <list>

### E2E
- <list>

## Decisions made upfront — DO NOT ASK

- <Decision 1>
- <Decision 2>
- ...

A brief that leaves Open Qs is a brief that fails its job.
Resolve every ambiguity. The user can override later via a
separate edit commit.

## Mobile reflow / responsive considerations

<For web projects: how the bootstrap-level layout reflows.>

## Git

If the repo is freshly init'd: `git init -b <DEFAULT_BRANCH>`,
add origin, first commit. Otherwise phase 1 ships its work as
a new commit on `<DEFAULT_BRANCH>`:

```bash
git add <explicit files>
git commit -m "$(cat <<'EOF'
feat: bootstrap <PROJECT> — phase 1

- <bullet list of what shipped>

Decisions:
- <design / scope calls>
EOF
)"
git push origin <DEFAULT_BRANCH>
```

## DoD

Flip Phase 1's `[ ]` → `[x]` in
`plan/steps/01_build_plan.md`, append commit hash, add to
"Phase log". Commit:

```bash
git add plan/steps/01_build_plan.md
git commit -m "plan: phase 1 shipped — bootstrap"
git push origin <DEFAULT_BRANCH>
```

## Confirm deploy

```bash
pnpm deploy:check
```

Iterate to green per the skill failure-mode rules.

## Follow-ups (out of scope this phase)

- <list of things deferred to later phases>
