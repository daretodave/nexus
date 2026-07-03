# Skill: oversight

> **The user-in-the-loop command.** Pause autonomy. Brief the
> user on current state. Ask targeted questions. Adjust the
> plan. Push the adjustments. Return.
>
> Every other skill is autonomous; this one is the exception.
> It exists because the user sometimes walks away from the loop,
> comes back, and needs to course-correct.

## 1. Purpose

When the user types `/oversight`, three things happen:

1. **Synthesis.** Read state files, recent commits, deploy
   state. Produce a tight briefing.
2. **Questionnaire.** Based on what surfaced, ask 1–4 targeted
   questions via `AskUserQuestion`. Computed from state, not
   pre-canned.
3. **Adjustment.** Apply answers as edits to plan files. One
   commit captures the whole adjustment set.

After this, user re-invokes `/march` (or `/loop /march`) to
resume.

## 2. Invocation

```
/oversight                  # full audit + general questionnaire
/oversight phase            # bias toward phase progress / scope
/oversight content          # bias toward /iterate findings + content
/oversight deploy           # bias toward Netlify / CI/CD signal
/oversight reset            # bias toward scope reduction
/oversight audit            # READ-ONLY: print the §4 briefing, ask
                            # nothing, change nothing, commit nothing
```

`audit` is the one mode that is safe in non-interactive
contexts (cloud ticks end with it so every Actions log closes
with a state-of-the-loop snapshot). It is an instrument panel,
not oversight — it never asks, never applies, never commits.
Every other mode requires a present user; under `/loop` they
are a misconfiguration (§9).

## 3. What `oversight` reads (audit phase)

In parallel where independent:

1. `git log --oneline -20` — recent shipping velocity.
2. `git status --short` — uncommitted changes.
3. `pnpm deploy:check` — current deploy state.
4. `plan/steps/01_build_plan.md` "Status" block — pending
   phases.
5. `plan/AUDIT.md` — open `/iterate` findings.
6. `data/BACKLOG.md` — pending data work.
7. `plan/CRITIQUE.md` — critique pending.
8. Last 3 phase briefs — current vs. recent commits.
9. `design/` — has a new export landed since the last sibling
   commit?

## 4. The briefing (~25 lines max)

```
oversight — <ISO date>

shipping
- last commit: <sha> "<subject>" (<relative time>)
- phases shipped since last oversight: <list with hashes>
- velocity: ~<N> commits/hour over last 24h

state
- pending phases: <count>; next is phase <N> (<topic>)
- open audit findings: <count>; top score <X>: "<one-liner>"
- pending data backlog: <count>
- pending critique findings: <count>; pass count <N>; last pass <when>
- working tree: <clean | N modified | N untracked>
- last deploy: <state> (<sha>) — <admin URL or "ready">

flags
- <unusual patterns: stuck phase, repeated fix commits,
  divergent local/Netlify state, design newer than sibling
  commit, etc.>
```

Tight. Factual. The flags section drives the questionnaire.

## 5. The questionnaire

Generate 1–4 questions via `AskUserQuestion`. Rules:

- **Computed from observed flags**, not pre-canned.
- **Each question targets a specific observable.**
- **Multiple choice with recommended option marked first.**
- **Last question is free-form** if there's room.

### Question templates

**Stuck phase**

> Phase <N> has been pending across <K> ticks; last <L> commits
> were "fix:" against it. What now?
>
> - (recommended) Refresh the brief — design or scope drifted.
> - Abandon — mark `[skipped]`, move on.
> - Continue — the brief is right, just hard.

**Audit overload**

> `plan/AUDIT.md` has <N> findings; top 3 are <category>. Bias?
>
> - (recommended) Yes — set focus to <category>.
> - No — keep balanced.
> - Prune — drop bottom <M> findings.

**Brief out of date**

> `design/<family>/` was updated <K> commits ago, after phase
> <N> shipped. Refresh phase <N>'s brief and ship a follow-up?
>
> - (recommended) Yes — `/plan-a-phase phase <N>` then add
>   follow-up phase.
> - No — note in `AUDIT.md`; let `/iterate` catch.
> - Defer.

**Deploy stuck red**

> Last <K> deploys failed with same error: "<msg>". What now?
>
> - (recommended) Investigate — open log; I'll diagnose, no
>   commit yet.
> - Roll back — revert to <last-green-sha>.
> - Continue — next ship-a-phase will reach the right code.

**Uncommitted changes**

> Working tree has <N> modified, <M> untracked from a tick
> that didn't finish (last verb: <X>).
>
> - (recommended) Inspect — show diff; I'll decide.
> - Roll forward — finish the tick.
> - Roll back — `git checkout` and `git clean`; restart cleanly.

**Phase candidates pending promotion**

> `plan/PHASE_CANDIDATES.md` has <N> pending candidates. Top
> score [<X.Y>]: "<one-line>". Promote any?
>
> - (recommended) Review one — show me the candidate's
>   rationale + signals; I'll decide.
> - Promote top — append as a new phase row in the build plan,
>   move the candidate to `## Promoted`.
> - Reject top — move to `## Rejected` with a one-line reason.
> - Defer — leave them; next expand pass re-evaluates.

**Free-form**

> Anything else to adjust before I hand back to `/march`?

## 6. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Audit

Run §3.

### Step 2 — Brief

Print synthesis per §4. **No questions yet.**

### Step 3 — Build questionnaire

Compute 1–4 questions per §5. If zero warranted (project
healthy, no flags), say so and exit at Step 7 with no commit.

### Step 4 — Ask

Invoke `AskUserQuestion`.

### Step 5 — Apply

For each answer:

- **"Refresh brief"** → spawn `/plan-a-phase phase <N>` flow
  inline.
- **"Abandon phase"** → flip `[ ]` to `[skipped]` in
  `01_build_plan.md` with comment `(skipped via oversight
  <date> — <reason>)`.
- **"Bias toward category X"** → write at top of
  `plan/AUDIT.md`: `> Bias: <category> (set via oversight
  <date>)`. `/iterate` reads this and weights 1.5x.
- **"Prune findings"** → delete bottom-N rows from `AUDIT.md`.
- **"Roll back"** → DO NOT run destructive git ops without
  explicit confirmation. Print proposed plan as a follow-up
  question; only execute on explicit go.
- **"Investigate deploy"** → fetch latest deploy log; summarize;
  no patch yet.
- **"Promote candidate"** → move row from
  `plan/PHASE_CANDIDATES.md` `## Pending` to `## Promoted` (with
  promotion date + assigned phase number). Append a new phase
  row in `plan/steps/01_build_plan.md` Status block. Optionally
  invoke `/plan-a-phase phase <N>` flow inline to draft the
  brief.
- **"Reject candidate"** → move row from `## Pending` to
  `## Rejected` with one-line reason.
- **"Other" (free-form)** → interpret conservatively. If clear
  plan edit, apply. If ambiguous, write to `plan/AUDIT.md` as
  `[needs-user-call]` and tell the user.

### Step 6 — Commit + push

```bash
git add <modified files>
git commit -m "$(cat <<'EOF'
oversight: <one-line summary>

- <bullet per adjustment>

User answers:
- Q: <question> → <answer>
EOF
)"
git push origin <DEFAULT_BRANCH>
```

If only adjustment was "everything looks good" with no edits,
**no empty commit**. Print "no adjustments — handing back to
the loop" and exit.

### Step 7 — Confirm deploy

```bash
pnpm deploy:check
```

Skip if no commit was made.

### Step 8 — Done

```
oversight complete. <N> adjustments applied.
- ready to resume: /march (or /loop /march)
- next pending phase: <N> (<topic>)
```

## 7. Hard rules

1. **Never edit code.** Plan adjustments only.
2. **Don't run destructive git ops without explicit user
   confirmation.**
3. **Single commit captures the adjustment set.**
4. **Don't loop the questionnaire.** Ask once.
5. **No emojis. No `Co-Authored-By:`.**
6. **`AskUserQuestion` is allowed here and only here** among
   shipping skills.

## 8. When `oversight` is NOT the right tool

- **Mid-tick of `/ship-a-phase`** etc. Don't pre-empt.
- **For trivia.** Read state files directly.
- **As a way to ask permission mid-loop.** Decide instead.

## 9. Failure modes

1. **Invoked under `/loop`.** Misconfiguration. Stop.
2. **`git pull` divergence.**
3. **State files corrupted.**
4. **"Other" with text the skill can't interpret.** Write
   `[needs-user-call]` to AUDIT.md, no other adjustment, exit.

## 10. Quick reference

```bash
# Read (parallel where possible)
git log --oneline -20
git status --short
plan/steps/01_build_plan.md
plan/AUDIT.md
data/BACKLOG.md
plan/CRITIQUE.md
plan/phases/                       # last 3 modified
design/                            # for newer-than-sibling check

# Tools
AskUserQuestion                    # only place this is allowed

# Adjustment files
plan/steps/01_build_plan.md
plan/AUDIT.md
data/BACKLOG.md
plan/phases/phase_<N>_<topic>.md   # via /plan-a-phase

# Commit
git commit -m "oversight: <one-line>"
git push origin <DEFAULT_BRANCH>
pnpm deploy:check
```
