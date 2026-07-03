# Skill: plan-a-phase

> **Thinking pass.** Refines or generates one phase brief.
> Writes to `plan/phases/phase_<N>_<topic>.md`. Does NOT modify
> code. The output is what `/ship-a-phase` reads next.

## 1. Purpose

`/ship-a-phase` works best when the brief is concrete. If the
brief is missing or stale, the shipping loop has to think and
ship in the same tick. `/plan-a-phase` is the dedicated thinking
pass that keeps shipping cheap.

Use when:
- A phase brief doesn't exist yet, especially if design has
  landed for that surface.
- A sibling phase shipped that changes context.
- The user wants a refined brief before kicking off
  `/loop /ship-a-phase`.

## 2. Invocation

```
/plan-a-phase                # next [ ] phase
/plan-a-phase phase 5        # specific phase
```

## 3. Inputs (read in this order)

1. `plan/bearings.md` — stack, contracts, standing decisions.
2. `plan/steps/01_build_plan.md` — phase scope row.
3. `plan/phases/<canonical-sibling>.md` — template.
4. `design/INDEX.md` — file → family map (if design layer
   exists).
5. `design/decisions.<ext>` — design's own brief; **wins over
   bearings on conflict**.
6. `design/page-<family>.<ext>` — family-specific design (may
   be 0 bytes / absent; not blocking).
7. `<your-app-path>/<sibling-family>/` — closest already-shipped
   sibling for code patterns.
8. `spec.md` — only if brief touches a surface bearings doesn't
   describe.

## 4. The brief format (`plan/phases/phase_<N>_<topic>.md`)

Mirrors `skills/ship-a-phase.md` §6. Fixed structure:

- **Routes / API endpoints / CLI surface** — locked from
  bearings contract.
- **Content / data reads** — table of helper → call → use.
- **Components / handlers** — list of new + reused primitives.
- **Cross-links** — In (verify) and Out (ship) and Retro-fit.
- **SEO / metadata / output schema** — `generateMetadata`,
  JSON-LD type, OpenAPI shape, etc.
- **Hero / body / sub-section composition.**
- **Empty / loading / error states** — copy locked.
- **Decisions made upfront — DO NOT ASK** — every judgment
  call resolved.
- **Mobile reflow / responsive / paginate / output limits.**
- **Pages × tests matrix.**
- **Verify gate.**
- **Commit body template.**
- **DoD.**
- **Follow-ups (out of scope).**

A brief that leaves Open Qs is a brief that fails its job.
**Resolve every ambiguity.**

## 5. The procedure

### Step 0 — Sync + load

```bash
git pull --ff-only
```

Read all inputs in §3.

### Step 1 — Pick the phase

If no argument, the next `[ ]` row in `01_build_plan.md`. Else
the phase number passed.

### Step 2 — Audit existing brief (if any)

If `plan/phases/phase_<N>_<topic>.md` exists, check:

- Are design references current?
- Have sibling-phase commits introduced primitives this brief
  should reference?
- Are locked decisions still valid given new bearings entries?
- Are there Open Qs needing resolution?

If fully current: return cleanly with "brief still current — no
changes."

### Step 3 — Compose the new / refined brief

Walk the brief format (§4). For each section, derive content
from the inputs. Make decisions; document under "Decisions made
upfront — DO NOT ASK".

**Order of authority for Decisions:**

1. `design/decisions.<ext>` SETTLED list (highest authority).
2. `plan/bearings.md` standing decisions (project-wide).
3. Phase-specific calls.

If `decisions.<ext>` and `bearings.md` disagree, design wins.
Update `bearings.md` in a separate prior commit
(`bearings: align with design`).

### Step 4 — Reality-check against codebase

Open the canonical sibling. Confirm every primitive your brief
references actually exists. If missing:

- Add it to phase scope ("ship X plus the missing primitive Y"),
  OR
- Push to a follow-up phase and note under Follow-ups.

### Step 5 — Commit

```bash
git add plan/phases/phase_<N>_<topic>.md
git commit -m "$(cat <<'EOF'
phases: brief for phase <N> — <topic>

- Routes locked: <list>.
- N decisions resolved upfront (see brief).
- Design export: <yes / pending>.
EOF
)"
git push origin <DEFAULT_BRANCH>
```

### Step 5.5 — Mirror the phase to GitHub (best-effort)

Once the brief is committed, open (or reuse) the phase mirror
issue so the public timeline reflects "next up" before shipping
starts:

```bash
issue_body=$(mktemp)
cat > "$issue_body" <<EOF
**Goal:** <one-line outcome from the brief's "Outcome" section>

<2–4 line summary of what shipping this phase delivers>

**Brief:** [\`plan/phases/phase_<N>_<topic>.md\`](https://github.com/<REPO_SLUG>/blob/<DEFAULT_BRANCH>/plan/phases/phase_<N>_<topic>.md)

---
_Tracked by the autonomous loop. The phase commit will close this issue via a \`Closes #<this-issue>\` trailer; deploy URL is posted as a follow-up comment._
EOF

node scripts/loop-issue.mjs phase-open \
    --phase "<N>" \
    --title "Phase <N> — <topic>" \
    --body-file "$issue_body"
```

The helper is **idempotent** — if `/ship-a-phase` already opened
this phase's issue (or if a previous plan-a-phase tick did), the
same number is reused. Failures here are warnings, not blockers
(same contract as `/ship-a-phase` Step 2.5).

### Step 6 — Done

Return 2-line summary: "phase <N> brief committed — <one-line>.
ready for /ship-a-phase."

## 6. New phases (rare)

If during planning you discover the build plan is missing a
phase entirely:

- Append a new row to `01_build_plan.md` in the appropriate
  group; don't reorder existing numbers.
- Pick the next free phase number.
- Commit `01_build_plan.md` first
  (`plan: add phase <N> for <topic>`), then write its brief in
  a separate commit.
- Note rationale in the commit body — user reviews these more
  carefully.

## 7. Hard rules

1. **Never modify code in shipped paths.** Brief generation
   may add primitives to phase scope — but they ship via
   `/ship-a-phase`, not here.
2. **Never leave Open Qs in a generated brief.**
3. **No emojis, no `Co-Authored-By:`.**
4. **Contracts in `bearings.md` are law** — never propose
   shapes that contradict them.

## 8. Failure modes

1. **Phase scope row in `01_build_plan.md` is itself
   ambiguous.** Fix the row first via separate commit; retry.
   If can't clarify without user input, stop.
2. **Design contradicts contract.** Surface; do not silently
   re-decide contract shape.

## 9. Quick reference

```bash
# Reads (in this order)
plan/steps/01_build_plan.md          # the phase row being refined
spec.md                              # product truth
plan/bearings.md                     # contracts, standing decisions
design/                              # exports, if any landed
plan/AUDIT.md                        # open findings that touch the phase

# Writes
plan/phases/phase_<N>_<topic>.md     # the brief (the only deliverable)
plan/steps/01_build_plan.md          # only when adding a new phase row

# Commands
git pull --ff-only                   # Step 0
git commit && git push               # docs-only commit; verify gate not required
```
