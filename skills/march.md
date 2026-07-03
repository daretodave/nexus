# Skill: march (nexus)

> **Outer dispatcher for the kit's own loop.** Reads repo
> state, delegates to one skill, returns. Designed for
> `/loop` and the cloud tick. The kit that teaches the loop,
> run by the loop.

## 1. Purpose

Pick the right verb each tick:

```
unlabeled issues exist            →  /triage
ELSE critique due (rate-limited)  →  /critique
ELSE pending phase                →  /ship-a-phase
ELSE expand due + bold posture    →  /expand
ELSE                              →  /iterate
```

No data step (the kit has no data layer) and no deploy gate
(`agents.md` rule 4). Everything else is the standard march
contract.

## 2. Invocation

```
/march                       # one tick
/loop 45m /march             # local autonomous loop
```

Cloud: `.github/workflows/march.yml` runs one tick per cron
firing.

## 3. Procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

Divergence → stop per §5.

### Step 1 — Triage gate (cheapest)

```bash
unlabeled=$(gh issue list --repo daretodave/nexus --state open \
  --search "-label:triage:loop-queued -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number --jq 'length' 2>/dev/null || echo 0)
```

`> 0` → read `skills/triage.md`, execute, return. `gh`
missing/unauthed → warn and fall through (never fail the
march on the awareness layer).

### Step 2 — Critique gate (rate-limited)

Read the metadata header of `plan/CRITIQUE.md`
(`> Last pass:` / `> Pass count:`). Dispatch to `/critique`
iff **any** of these holds — ≥12 commits since last pass, OR
>72h since last pass, OR `Last pass` is **never** and at
least one phase has shipped (docs cadence is slower than
product cadence) — and no pending HIGH critique row is
already queued. Then read `skills/critique.md`, execute,
return.

### Step 3 — Dispatch (first match wins)

- **3a. Pending phase?** First `[ ]` row in
  `plan/steps/01_build_plan.md` — skipping `[skipped]` and
  `[blocked: …]` rows → `skills/ship-a-phase.md`.
- **3b. Expand due?** Posture `bold` (see
  `plan/bearings.md`) AND (≥20 commits or >7 days since
  `plan/PHASE_CANDIDATES.md` last pass) AND at least one
  signal (AUDIT/CRITIQUE pending rows, sibling lessons growth,
  Claude Code release drift) → `skills/expand.md`.
- **3c. Else** → `skills/iterate.md`.

### Step 4 — Done

Return cleanly; next tick re-dispatches.

## 4. Hand-off honesty

Fully adopt the child skill's contract — hard rules, failure
modes, commit conventions, the verify gate. March adds no
rules; it inherits. A march tick succeeds iff the child tick
succeeds.

## 5. Failure modes

1. **`git pull` divergence.** Stop and report.
2. **State files corrupted or missing** (`plan/steps/01_build_plan.md`,
   `plan/AUDIT.md`, `plan/CRITIQUE.md`). Stop — never
   reconstruct silently; recovery is
   `nexus/playbooks/recovery.md` §G, run by a human.

Everything else is inherited from the dispatched skill.

## 6. Quick reference

```bash
plan/steps/01_build_plan.md          # pending phases
plan/AUDIT.md                        # iterate queue
plan/CRITIQUE.md                     # critique queue + rate-limit metadata
plan/PHASE_CANDIDATES.md             # expand output + rate-limit metadata
gh issue list ...                    # triage gate
node scripts/verify.mjs              # the gate every child runs
```
