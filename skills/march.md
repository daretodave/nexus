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
ELSE ready chunk                  →  /next top
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

### Step 1 — Triage gate (cheapest; concierge first)

```bash
# The concierge lane: loop:do outranks everything.
urgent=$(gh issue list --repo daretodave/nexus --state open \
  --label loop:do --json number --jq 'length' 2>/dev/null || echo 0)

unlabeled=$(gh issue list --repo daretodave/nexus --state open \
  --search "-label:triage:loop-queued -label:triage:planned -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number --jq 'length' 2>/dev/null || echo 0)
```

`urgent > 0` OR `unlabeled > 0` → read `skills/triage.md`,
execute, return. (`loop:do` issues are re-triaged even if
already labeled — the label is the user saying "this one,
now"; triage §4 handles the bump.) `gh` missing/unauthed →
warn and fall through (never fail the march on the awareness
layer).

### Step 2 — Critique gate (rate-limited)

Read the metadata header of `plan/CRITIQUE.md`
(`> Last pass:` / `> Pass count:`). Dispatch to `/critique`
iff **any** of these holds — ≥12 commits since last pass, OR
>72h since last pass, OR `Last pass` is **never** and at
least one chunk has an archive line (docs cadence is slower than
product cadence) — and no pending HIGH critique row is
already queued. Then read `skills/critique.md`, execute,
return.

### Step 3 — Dispatch (first match wins)

- **3a. Ready chunk?** The first ready chunk in
  `plan/README.md`'s pick order (Asap lane, then the spec
  table; every `needs` done; nothing in the Held lane), or an
  unchunked spec ahead of it → `/next top`: read
  `skills/next.md` and run it with the argument `top` (one
  chunk, claimed, built by a delegated builder, gated, closed,
  landed). March stays the 30-40 minute run; `/next` is the
  one-chunk unit inside it. A cloud tick dispatches the
  builder foreground (`run_in_background: false`).
- **3b. Expand due?** Posture `bold` (see
  `plan/bearings.md`) AND (≥20 commits or >7 days since
  `plan/CANDIDATES.md` last pass) AND at least one
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
2. **State files corrupted or missing** (`plan/README.md`,
   `plan/AUDIT.md`, `plan/CRITIQUE.md`), or the gate's
   `chunks` leg red on a clean checkout. Stop — never
   reconstruct silently; recovery is
   `nexus/playbooks/recovery.md` §G, run by a human.

Everything else is inherited from the dispatched skill.

## 6. Quick reference

```bash
plan/README.md                       # lanes + spec table: the chunk queue
plan/<NN>-<slug>.md                  # each spec's chunks
plan/AUDIT.md                        # iterate queue
plan/CRITIQUE.md                     # critique queue + rate-limit metadata
plan/CANDIDATES.md             # expand output + rate-limit metadata
gh issue list ...                    # triage gate
node scripts/verify.mjs              # the gate every child runs
```
