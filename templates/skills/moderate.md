# Skill: moderate

> **Option A** of `customization/moderation-loop.md`: a
> dedicated skill that drains the four moderation queues one
> item per tick. Approve/hide is loop-drainable; delete/ban
> always escalates to `/oversight` — the loop never overrules
> a human on those two.
>
> Adopt only if the project has UGC (comments, submissions,
> votes, flags). See moderation-loop.md "When to adopt this
> customization". **No UGC → delete this skill file** and skip
> `/moderate` entirely; `/march` handles its absence the same
> way it handles a missing `ship-data.md`.

## 1. Purpose

Drain `mod:held`, `mod:flagged`, `mod:new-account`, and
`mod:appeal` (see `nexus/customization/moderation-loop.md`
"The four queues") without waiting for a human reviewer, while
keeping every irreversible decision (delete, ban) a human call.

Queue storage follows the project's data-layer variant
(`gh-as-db` → files under `data/mod/`; DB-backed → status
columns) per moderation-loop.md "Where queues live".

## 2. Invocation

```
/moderate                     # drain the highest-priority item
/moderate queue <name>        # force a specific queue (held | flagged | new-account | appeal)
/loop 15m /moderate           # autonomous drain
```

## 3. Autonomy contract

- **Approve / hide → decide and act.** These are reversible;
  the loop-drainable half of the hard rule.
- **Delete / ban → never auto-execute.** Escalate to
  `/oversight` with the item, score, and reason. Do not touch
  the queue status beyond marking it "escalated".
- **Pre-filter unavailable (rate-limited, billing disabled) →
  hold everything.** Never approve a comment the pre-filter
  hasn't scored — the fallback is "hold", not "approve".
- **`mod:appeal` → never auto-drained.** Every appeal item
  surfaces to `/oversight`'s next brief unchanged; this skill
  reads the queue but does not act on it beyond surfacing.

## 4. Delegation

- AI pre-filter model per `plan/bearings.md`'s "AI pre-filter
  model" standing decision (OpenAI moderation endpoint,
  Anthropic moderation API, or a local classifier).
- `<DOMAIN_SPECIALIST>` — optional, for domain-specific spam
  or abuse heuristics the generic pre-filter misses.

## 5. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Pick the work

Read the four queues. Pick the highest-priority item by
`(queue priority × age × score)` — see moderation-loop.md's
queue table for the per-queue default drain policy.
`mod:new-account` items past the 24h auto-release window drain
first (a stuck one signals config drift, not user risk).

If all four queues are empty, return cleanly — nothing to do
this tick.

### Step 2 — Pre-filter

If the item hasn't been scored yet, run it through the AI
pre-filter (§4). No score → hold, don't guess.

### Step 3 — Decide

Per the autonomy contract (§3): approve, hide, or escalate.
Never delete or ban directly.

### Step 4 — Update + audit

Update the queue's status (file row or DB column, per the
project's data-layer variant) and append one row to
`plan/MOD_AUDIT.md`:

```
| <ISO> | /moderate | <approve|hide|escalate> | <item-id> | <reason> | <queue> |
```

### Step 5 — Escalation check (every tick, drain or not)

Walk the five triggers in moderation-loop.md
"`/oversight` escalation triggers" (flagged-count spike,
new-account aging past 24h, repeat-offender pattern, non-empty
appeal queue, pre-filter false-positive drift). Any trigger
firing → leave a flagged row in `plan/MOD_AUDIT.md` (or open an
issue, `agents.md` rule 6) so the next `/oversight` brief
surfaces it. This step runs whether or not Step 1 found an item
— a spike can exist even if you can't safely act on it.

### Step 6 — Verify gate

```bash
pnpm deploy:check   # or the project's verify gate equivalent
```

Runs even for DB-only changes (no code touched) — confirms no
regression, per moderation-loop.md hard rule 4.

### Step 7 — Commit + push

```bash
git add plan/MOD_AUDIT.md <queue file, if file-backed>
git commit -m "mod: <action> <item-id> — <reason>"
git push origin <DEFAULT_BRANCH>
```

Commit body carries the audit row(s) added this tick.

### Step 8 — Done

Return cleanly.

## 6. Hard rules

1. **Approve / hide is loop-drainable. Delete / ban is not** —
   those two always escalate to `/oversight`.
2. **AI pre-filter is required before any approve.** No score,
   no auto-approve.
3. **Every action commits an audit row** to
   `plan/MOD_AUDIT.md` — actor, action, item, reason.
4. **No mod action without a gate run**, even when no code
   changed.
5. **No `Co-Authored-By:`. No emojis.**

## 7. Failure modes

1. **Pre-filter unreachable.** Hold everything; surface to
   `/oversight` rather than guessing.
2. **Queue exceeds disk / row budget** (`gh-as-db` variant). A
   bloated repo is a slow build — surface as `[needs-user-call]`
   rather than soldiering through.
3. **Audit log diverges from queue state** (row counts don't
   reconcile). Flag it; `/oversight`'s brief includes the
   reconciliation check.
4. **Gate red ≥3 times on the same root cause**, or **`git
   pull` divergence** — stop cleanly, same as any shipping
   skill.
5. **Any of the five escalation triggers fires** — this is not
   a failure of the skill, it's the skill working as designed;
   surface per Step 5 and continue draining other queues.

## 8. Quick reference

```bash
# Reads
data/mod/*.md | DB mod_status column   # the four queues
plan/bearings.md                       # pre-filter model, mod flow

# Writes
plan/MOD_AUDIT.md                      # append-only audit trail

# Commands
git pull --ff-only
pnpm deploy:check
git add <explicit files> && git commit && git push origin <DEFAULT_BRANCH>
```

## See also

- [`../../customization/moderation-loop.md`](../../customization/moderation-loop.md) —
  the full contract: queue shapes, escalation triggers, audit
  format, Option A vs Option B trade-off.
- [`./ship-data.md`](./ship-data.md) — the shape this skill
  mirrors.
- [`./oversight.md`](./oversight.md) — where delete/ban and the
  five escalation triggers actually get decided.
