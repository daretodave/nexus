# Skill: march

> **Outer orchestrator.** This skill is a dispatcher: it reads
> project state and delegates to one shipping skill. Designed for
> `/loop`.

## 1. Purpose

```
pending phase              →  /ship-a-phase
ELSE content queue ≥ 3.0   →  /ship-content
ELSE                       →  /iterate
```

Deliveries first: a pending phase ships before the content queue
is ever read. The editorial posture is **bold**.

## 2. Invocation

```
/march                       # one tick: dispatch + execute
/loop /march                 # self-paced autonomous loop
```

## 3. Procedure

### Step 0 — Sync

Pull first; a diverged pull stops the tick.

### Step 0.5 — Weekly snapshot gate (Phase 31 amendment)

After sync and before triage, check whether this week's trend
snapshot exists under `data/trends/`. If it does not, write it
with `node scripts/trend-snapshot.mjs --write`, commit it, and end
the tick: the snapshot is the week's anchor.

### Step 2 — Critique gate (pre-dispatch check)

Dispatch to `/critique` instead of the normal flow when all three
hold: twelve commits since the last pass, a day since it, and a
green deploy.

### Step 3 — Dispatch

Read state in this order; first match wins.

#### 3a. Pending phase?

Open `plan/steps/01_build_plan.md`. If any `[ ]` row exists in the
Status block, run `/ship-a-phase` and return.

#### 3b.5. Content queue? (post-phase-24)

Open `content/QUEUE.md`. If a row scores 3.0 or more, run
`/ship-content` on the top row and return.

#### 3b.5a. Empty-queue refill (post-phase-30)

When the queue holds no row at 3.0, run the content-gap survey
(`node scripts/content-gap-survey.mjs --write`), commit the new
rows, and return: the next tick ships them.

### Step 4 — Done

Return cleanly. The loop's next tick re-dispatches.

## 5. Failure modes — when to stop

1. **`git pull` divergence.** Stop and report.
2. **The queue file is unreadable.** Stop and report; never guess
   a row.
