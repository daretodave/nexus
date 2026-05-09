# agents.md

> The entry point for any AI agent landing in this repo cold
> (Claude Code, Cursor, Aider, anything else). Read this top to
> bottom; it's short, and the rules at the top are non-negotiable.

## Standing rules

These apply to every command, every skill, every session. They
are not optional. The skill files repeat them; this is the
canonical source.

### 1. Commit and push. Always. As a single atomic act.

Shipped work that isn't committed is rolled-back work waiting to
happen. Shipped work that's committed but not pushed is invisible
to <HOSTING_PROVIDER> and to future loop ticks. The autonomous
loop assumes `origin/<DEFAULT_BRANCH>` is the source of truth.

Every shipping skill ends with `git commit` **immediately followed
by** `git push origin <DEFAULT_BRANCH>`. Don't leave commits
unpushed between ticks. Don't leave the working tree dirty.

### 2. No `Co-Authored-By:` trailers. No emojis.

Plain commit message bodies. **Never** add a `Co-Authored-By:`
line, a "🤖 Generated with…" footer, or any emoji — in commits,
in code, in content, in design notes.

### 3. The verify gate is non-negotiable.

`pnpm verify` runs **before** every commit:

```
typecheck → test:run → data:validate → build → e2e
```

Every check is a hard gate. **Hermetic e2e is part of the gate.**
A red e2e is a blocked push. Never `--no-verify`. Fix the root
cause.

### 4. The deploy gate runs **after** every push.

`pnpm deploy:check` polls <HOSTING_PROVIDER> for the deploy
matching the just-pushed commit. Prints state transitions. Exits
non-zero on `error` / `failed` / timeout.

Every shipping skill calls it as Step 12 (or equivalent). A red
deploy is treated identically to a red verify gate: read the log,
patch, push again. Repeated failures escalate per failure modes.

### 5. No `--no-verify`. No force-push. No destructive resets.

If a hook fails, fix the underlying issue. If `git pull`
diverges, stop and report. Tests alongside code, never "add tests
later".

### 6. <PROJECT-SPECIFIC RULE — e.g. site name lowercase>

<Customize per the project. For thock: site name is lowercase
"thock" always. For tickpedia: image alt text required on every
image. Etc.>

### 7. Content stays in <CONTENT_LOCATION>. Data stays in
       <DATA_LOCATION>.

No hardcoded copy in components. No hardcoded data records.

---

## Project

**<PROJECT>** — <one-line description>. Lives at <HOSTING_URL>.

The product spec is `spec.md` at the repo root. Read it once.

## Repo shape

```
<your app paths>     <one-line per top-level group>
plan/                Build plan, phase briefs, audit findings.
skills/              Source-of-truth skill files invoked by slash commands.
.claude/             Claude Code config — slash commands and sub-agent definitions.
design/              Design exports.
data/                Structured data, if applicable.
```

## How work happens

This project is **driven autonomously** by a small set of skills.
You don't normally write code by manually editing files; you
invoke a skill that does the right thing end-to-end.

### Skills (the verbs)

| Skill | Source of truth | What it does |
|---|---|---|
| `ship-a-phase` | `skills/ship-a-phase.md` | Ship one phase from the build plan. |
| `ship-data` | `skills/ship-data.md` | Ship one data record (if data layer exists). |
| `plan-a-phase` | `skills/plan-a-phase.md` | Refine the next phase brief, no code. |
| `iterate` | `skills/iterate.md` | Audit + ship one improvement. |
| `critique` | `skills/critique.md` | External-observer pass; writes to `CRITIQUE.md`. |
| `triage` | `skills/triage.md` | Issue review; routes to backlogs. |
| `expand` | `skills/expand.md` | Plan-expansion pass; proposes phase candidates from accumulated signals. Posture-controlled (bold/strict/autonomous). |
| `march` | `skills/march.md` | Outer dispatcher: triage → critique → phase → data → expand → iterate. |
| `oversight` | `skills/oversight.md` | **User-in-the-loop.** The only skill that asks anything. Promotes phase candidates. |

### Invocation

```
/ship-a-phase                # ship next pending phase
/ship-data                   # ship next data backlog row
/plan-a-phase                # refine next phase brief
/iterate                     # audit + ship one improvement
/critique                    # external-observer pass
/triage                      # review unlabeled issues
/expand                      # propose new phase candidates
/march                       # do the right thing
/oversight                   # course-correct
/loop 30m /march             # autonomous loop
```

### Sub-agents

| Agent | Use for |
|---|---|
| `scout` | Open-web research with citations. |
| `reader` | Fresh-eyes site observer. |
| <DOMAIN_SPECIALIST> | <when> |

The main agent writes wiring, code, decisions. Spawn sub-agents
aggressively for everything else.

---

## Operational secrets

The autonomous loop is hermetic for shipping; the awareness layer
needs tokens. Both live in `.env` (gitignored). Configure once
per machine.

### `<PROVIDER_AUTH_TOKEN>` — deploy gate

Used by `pnpm deploy:check` to read deploy state.

```
<PROVIDER_AUTH_TOKEN>=<token-format-prefix>...
```

Get one: <provider's token URL>

If missing, `pnpm deploy:check` exits 3 with a clear error.

### `GH_TOKEN` — issue triage

Used by `/triage` to review and label open GitHub issues. The
`gh` CLI auto-reads `GH_TOKEN`.

```
GH_TOKEN=github_pat_...
GH_REPO=<REPO_SLUG>
```

Get one: https://github.com/settings/tokens

### No other secrets

If a feature ever requires more, the relevant skill stops at its
failure-mode condition rather than inventing a placeholder.

---

## Where to look

| If you need… | Read |
|---|---|
| What <PROJECT> is | `spec.md` |
| Stack, conventions, defaults | `plan/bearings.md` |
| What ships next | `plan/steps/01_build_plan.md` |
| How a phase is built | `plan/phases/phase_<N>_<topic>.md` |
| How a skill works | `skills/<skill>.md` |
| What a sub-agent does | `.claude/agents/<name>.md` |
| Latest weaknesses | `plan/AUDIT.md`, `data/AUDIT.md` |
| Backlog of pending data work | `data/BACKLOG.md` |
| Critique queue | `plan/CRITIQUE.md` |
