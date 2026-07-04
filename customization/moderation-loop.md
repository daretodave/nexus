# Customization: moderation loop

> For any project with user-generated content (UGC) —
> comments, votes, submissions, flags — the autonomous loop
> needs a way to drain moderation queues *or* gracefully
> escalate to `/oversight` when a queue ages or a
> coordinated-attack pattern emerges.
>
> The intervention spectrum's Level 3–4 prerequisites assume
> the loop can keep running without dashboard access. UGC
> breaks that assumption unless the queue is shaped to be
> loop-drainable from the start.

This doc covers the queue shape, the loop verb that drains
it, the `/oversight` escalation triggers, and the audit
trail format.

---

## When to adopt this customization

Adopt when **any** of these apply:

- Comments, replies, or discussion surfaces.
- User-submitted records (corrections, vendor submissions,
  bug reports beyond GitHub issues).
- Votes / ratings where vote-weighting math depends on
  account state.
- Any "hold for review" gate the user sees as a "pending"
  state.

Skip when the project has no UGC. Read-only editorial
sites, libraries, CLIs, internal tools, and content sites
that publish through `/ship-data` only — none need this.

---

## The four queues

Most UGC projects end up with the same four queues,
regardless of stack. Name them consistently:

| Queue | What lands here | Default drain |
|---|---|---|
| **`mod:held`** | New comments / submissions whose AI pre-filter scored `suspect`. | `/moderate` (or `/iterate`'s mod-pass) reviews, approves or hides. |
| **`mod:flagged`** | Items reported by other users. Scored by report count + reporter trust. | `/moderate` reviews; aged items escalate. |
| **`mod:new-account`** | Items from accounts < 24h old. Held by anti-abuse policy. | Time-based; auto-release after 24h if no reports. |
| **`mod:appeal`** | Items the system removed, that the author has appealed. | Human-only; never auto-drained. Surfaces to `/oversight`. |

The four are intentionally separate. A coordinated-flag
attack lights up `mod:flagged` without touching `mod:held`;
the loop should respond to the patterns differently.

---

## Where queues live

Two shapes, mirroring the
[`data-layer.md`](./data-layer.md) variants:

### `gh-as-db` — file-backed queue

For projects on the `gh-as-db` data variant. Queues live as
markdown files under `data/mod/`:

```
data/mod/
├── held.md           # mod:held queue (rows: comment_id, scored_at, score, body)
├── flagged.md
├── new-account.md
└── appeals.md
```

Each row is a markdown table entry; each item-id maps to a
content file (e.g. `data/comments/<comment-id>.json`). The
loop's `/moderate` skill reads + edits the queue file.

Trade-off: high-volume queues bloat the repo and slow the
build. Suitable for low-volume editorial (≤ ~200 comments
per day).

### `hybrid-with-managed-postgres` / `pure-db` — DB-backed queue

For projects using a managed Postgres. Queues are DB tables
or status columns on the content table:

```sql
-- one approach: status on the content row
ALTER TABLE comments ADD COLUMN mod_status TEXT
  CHECK (mod_status IN ('public', 'held', 'flagged', 'removed', 'pending-appeal'))
  DEFAULT 'public';
ALTER TABLE comments ADD COLUMN mod_score NUMERIC;
ALTER TABLE comments ADD COLUMN mod_held_at TIMESTAMPTZ;
```

The `/moderate` skill queries by status. The verify gate
exercises the queue through e2e fixtures, not against the
real DB.

Trade-off: less hermetic. The loop needs DB credentials in
its env to drain.

---

## The `/moderate` skill (or `/iterate` mod-pass)

The drainer can be its own skill or a pass inside
`/iterate`. The first option is cleaner; the second is
cheaper to adopt.

### Option A — dedicated `/moderate` skill

A new skill at `skills/moderate.md` — ship
[`templates/skills/moderate.md`](../templates/skills/moderate.md),
same shape as
[`templates/skills/ship-data.md`](../templates/skills/ship-data.md):
one tick = one queue item drained.

**Per tick:**
1. Read the four queues. Pick the highest-priority item by
   `(queue priority × age × score)`.
2. Apply the AI pre-filter if not yet applied (cheap models
   only; OpenAI moderation endpoint, Anthropic moderation
   API, or a local classifier).
3. **Decide** (the autonomy contract): approve, hide,
   delete, or escalate.
4. Update the queue status + write a row to
   `plan/MOD_AUDIT.md` (the audit trail).
5. Commit + push. The push triggers the deploy gate; on
   `pure-db`, the deploy is a no-op but the audit commit
   stays.

**Dispatch:** `/march` adds a new step between *triage* and
*critique*:

```
1. unlabeled GitHub issues  →  triage
2. mod queue items > age threshold  →  moderate    [NEW]
3. critique due  →  critique
4. pending phase  →  ship-a-phase
5. pending data  →  ship-data
6. else  →  iterate
```

### Option B — `/iterate` mod-pass

For projects that don't want to grow their skill set, add a
"moderation hygiene" pass to `/iterate`'s audit:

> **Moderation hygiene.** Read `mod:held` and `mod:flagged`.
> For each item aged > threshold (default 6h), score the
> finding. Drain through the same audit/score/ship loop.

The score formula is the same. The skill that ships the
fix is `/iterate`, not a new skill. Trade-off: mod work
competes with content / data findings for the iterate
budget; coordinated attacks can starve other categories.

### Hard rules (both options)

1. **Approve / hide is loop-drainable.** Delete and ban
   are not — they escalate to `/oversight`.
2. **AI pre-filter is required.** The loop should never
   approve a comment it hasn't scored. The pre-filter is
   the trust gate; without it, the loop drains randomly.
3. **Every action commits an audit row.** Every mod action
   (auto or human) writes to `plan/MOD_AUDIT.md` with
   actor, action, item, reason. The commit body carries the
   summary.
4. **No mod action without a verify gate run.** Even for
   DB-only changes (no code change), the deploy gate runs
   to confirm no regression.

---

## `/oversight` escalation triggers

`/oversight` is the only place mod policy decisions get
made interactively. The loop drains the queues; it does
*not* set the policy. Trigger an escalation when:

### 1. `mod:flagged` count spikes

If `mod:flagged` accumulates `> N` items in `< M` hours
(default: 20 items in 2 hours), surface to `/oversight`.
Likely indicators: coordinated brigade, a thread that went
viral, an editorial misstep. The loop should not
auto-respond; the response shape is a policy call.

### 2. `mod:new-account` ages > 24h

The default policy is "auto-release after 24h if no
reports." If items are sitting in `mod:new-account` longer
than that, the auto-release path is broken (a bug or a
config drift). `/oversight` brief flags it.

### 3. Same user appears in `mod:flagged` 3+ times in a week

A pattern, not a single incident. Surface to `/oversight`
with the user's recent activity. The decision (warn /
suspend / ban / nothing) is the user's.

### 4. Appeal queue is non-empty

`mod:appeal` is never auto-drained. Every appeal surfaces
to `/oversight` in the next brief. The loop does not get
to overrule a removal it made.

### 5. Pre-filter false-positive rate > threshold

If `/oversight`'s spot-check on `mod:held` finds the
pre-filter is rejecting > N% of clearly-benign items, the
threshold is too aggressive. Surface with a recommendation
to retune.

---

## The audit trail — `plan/MOD_AUDIT.md`

Every moderation action lives here. Same shape as
`plan/AUDIT.md` but scoped to mod-only:

```markdown
# Moderation audit

> Every moderation action committed by the loop or by
> `/oversight`. Append-only. Read by `/oversight` for the
> brief; readable by humans as the public record.

## Format

One row per action:

| Date | Actor | Action | Item | Reason | Source |
|---|---|---|---|---|---|

## Log

| 2026-05-12T14:02Z | /moderate | hide | comment:7f3a | AI score 0.94 (spam) | mod:held |
| 2026-05-12T14:15Z | /oversight | suspend | user:alice | 3 flags in 48h | mod:flagged spike |
| 2026-05-12T14:22Z | /moderate | approve | comment:8c10 | AI score 0.08 (clean) | mod:held |
```

Every commit body that touches the mod queue should
include the audit row(s) it added. The `/oversight` brief
surfaces row counts by actor + action, so drift becomes
visible quickly.

---

## Integration with the intervention spectrum

Level 3+ prerequisite (see
[`../intervention-spectrum.md`](../intervention-spectrum.md)):

> **If your project has UGC, moderation must be
> loop-drainable or escalation-triggered.** A project with
> a passive mod queue (review-by-eyeball) is not Level 3
> compatible; the loop will pile up items and the user
> will come back to a crater.

Level 4 pre-flight (item 8 in the checklist):

> **Confirm `/moderate` (or `/iterate`'s mod-pass) drains
> the queue cleanly.** File a test comment that triggers
> the pre-filter (use a known-bad sample). Confirm
> `/march` picks it up next tick and either auto-hides
> (Option A) or files an audit finding (Option B).

---

## Bearings entries

The project's `plan/bearings.md` should pin the moderation
shape (one block, not scattered). Add this block to the
"Standing decisions" section:

```markdown
- **Mod flow:** `<ai-pre-filter | post-mod | pre-mod>`
- **Mod queue location:** `<data/mod/*.md | DB column on
  comments table | etc.>`
- **`/oversight` escalation thresholds:** flagged spike
  (N in M hrs), new-account age (24h default), repeat
  flag pattern (3 in 7d).
- **AI pre-filter model:** `<openai:omni-moderation-latest
  | anthropic:moderation | local-classifier>`
- **Mod audit log:** `plan/MOD_AUDIT.md` (append-only).
```

---

## Failure modes

- **Pre-filter unavailable (rate-limited, billing
  disabled).** Loop should not auto-approve in this state;
  it should queue and surface to `/oversight`. The fallback
  is "hold everything" not "approve everything."
- **Queue exceeds disk / row budget** (for `gh-as-db`
  variant). Surface as `[needs-user-call]`. A bloated repo
  is a slow build; the loop should not soldier through.
- **Audit log diverges from queue state.** Every
  `/oversight` brief includes a row-count reconciliation.
  If counts don't match, surface as a flag.
- **A `/moderate` tick can't push** (gate red, conflict).
  Same as any other shipping skill — read log, patch,
  retry up to 3 times same-root-cause, then stop cleanly.

---

## See also

- [`../templates/skills/moderate.md`](../templates/skills/moderate.md) —
  the shipped Option A skill.
- [`./data-layer.md`](./data-layer.md) — queue storage
  follows the data-layer variant.
- [`../intervention-spectrum.md`](../intervention-spectrum.md)
  — Level 3+ UGC prerequisite + Level 4 pre-flight item 8.
- [`../templates/skills/oversight.md`](../templates/skills/oversight.md)
  — adds the four escalation triggers as question templates
  in §5 if your project adopts this customization.
- [`../templates/plan/bearings.md`](../templates/plan/bearings.md)
  — Moderation flow section in Standing decisions.
