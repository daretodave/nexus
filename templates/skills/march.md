# Skill: march

> **Outer dispatcher.** Reads project state and delegates to one
> of the shipping skills. Designed for `/loop`. The
> autonomous-beast entry point.

## 1. Purpose

`/loop /march` is the autonomous-beast mode. It picks the
right-thing-to-do every tick:

```
unlabeled issues exist       →  /triage
ELSE critique due (rate-lim) →  /critique
ELSE pending phase           →  /ship-a-phase
ELSE pending data            →  /ship-data
ELSE                         →  /iterate
```

This means: an overnight run can take <PROJECT> from
"scaffolded" to "shipped, populated, iteratively polished,
critiqued, addressed, and inbox-zero on issues" without a mode
switch from the user.

The triage check is **cheap when idle** (one API call to count
unlabeled issues). The critique check is **rate-limited**
(≥12 commits + ≥24h spacing, green-deploy required).

## 2. Invocation

```
/march                       # one tick: dispatch + execute
/loop 30m /march             # autonomous loop, every 30 min
/loop /march                 # self-paced autonomous loop
```

## 3. Procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

If divergence, stop per §5.

### Step 1 — Triage gate (cheapest check)

Load `GH_TOKEN` from `.env` and count unlabeled open issues:

```bash
export GH_TOKEN=$(awk -F= '/^GH_TOKEN=/ {sub(/^GH_TOKEN=/, ""); print; exit}' .env)
export GH_REPO=$(awk -F= '/^GH_REPO=/ {sub(/^GH_REPO=/, ""); print; exit}' .env)
GH_REPO=${GH_REPO:-<REPO_SLUG>}

unlabeled=$(gh issue list --repo "$GH_REPO" --state open \
  --search "-label:triage:loop-queued -label:triage:needs-user -label:triage:closed -label:triage:reviewed" \
  --json number --jq 'length' 2>/dev/null || echo 0)
```

If `unlabeled > 0`:

- Read `skills/triage.md`.
- Execute its procedure end-to-end.
- Return.

If `unlabeled == 0`, fall through to Step 2.

If `gh` isn't installed or `GH_TOKEN` missing, **don't fail
the march** — log warning and fall through.

### Step 2 — Critique gate (rate-limited)

Read metadata header at top of `plan/CRITIQUE.md`:

```
> Last pass: <ISO-date> at commit <sha>
> Pass count: <N>
```

Dispatch to `/critique` if **all three** hold:

1. Current commit is at least **12 commits after** `Last pass`,
   OR `Last pass` > **24 hours ago**, OR `Last pass` is "never"
   and at least one substantive phase (e.g., the canonical
   sibling) has shipped.
2. `pnpm deploy:check` shows a green deploy.
3. No pending HIGH critique already queued for iterate.

If all three hold:

- Read `skills/critique.md`.
- Execute its procedure end-to-end.
- Return.

Otherwise fall through to Step 3.

### Step 3 — Dispatch (first match wins)

#### 3a. Pending phase?

Open `plan/steps/01_build_plan.md`. If any `[ ]` row in the
"Status (at-a-glance)" block:

- Read `skills/ship-a-phase.md`.
- Execute its procedure end-to-end.
- Return.

#### 3b. Pending data?

Open `data/BACKLOG.md`. If any `[ ]` row exists (and project
has a data layer):

- Read `skills/ship-data.md`.
- Execute its procedure end-to-end.
- Return.

#### 3c. Else — iterate.

- Read `skills/iterate.md`.
- Execute its procedure end-to-end.
- Return.

### Step 4 — Done

Return cleanly. Loop's next tick re-dispatches.

## 4. Hand-off honesty

When you dispatch into a child skill, **fully adopt its
contract**. Hard rules, failure modes, commit conventions,
verify gate. `/march` itself doesn't add rules; it inherits.

A march tick succeeds iff the child tick succeeds.

## 5. Failure modes

`/march` itself only fails on:

1. **`git pull` divergence.**
2. **State files corrupted or missing** (build plan, AUDIT,
   BACKLOG, CRITIQUE). Stop and report — don't reconstruct
   silently.

Otherwise inherited from the dispatched skill.

## 6. Quick reference

```bash
# State files
plan/steps/01_build_plan.md          # pending phases
data/BACKLOG.md                      # pending data work
plan/CRITIQUE.md                     # critique queue + last-pass metadata

# External signals
gh issue list ...                    # unlabeled count
pnpm deploy:check                    # green-deploy condition

# Skills it dispatches into
skills/triage.md                     # Step 1 (cheapest)
skills/critique.md                   # Step 2 (rate-limited)
skills/ship-a-phase.md               # Step 3a
skills/ship-data.md                  # Step 3b
skills/iterate.md                    # Step 3c
```
