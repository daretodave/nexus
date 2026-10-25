# Generators: the queue refills itself

> A loop stalls when its queues run dry, not when the project
> is done. A generator is a small script that turns time or
> repo state into queue rows, so the loop finds work where a
> person would have: an issue nobody answered, a candidate
> nobody promoted, a clock that came round. `/march` runs them
> through one stock lane, `refill`, whenever no chunk is ready.

---

## Where refill sits

`/march` Step 3a finds no ready chunk, then reads the `queue`
hook of its project lanes (`skills/march.lanes.md`,
[`../customization/project-lanes.md`](../customization/project-lanes.md)).
The first lane there is the stock `refill` lane, present only
when `plan/bearings.md` lists a generator. It runs before the
data queue and before `/expand`, so a filed row is real work
for the next `/iterate` before anything new is invented.

```
ready chunk                →  /next top
ELSE queue lanes           →  refill (every listed generator), then the project's own
ELSE expand due            →  /expand
ELSE                       →  /iterate (picks up what refill filed)
```

## The list in bearings

```md
## Generators

- issue-age · daily · target 3 · cap 5/wk
- stale-candidate · weekly · target 2 · cap 2/wk
```

| Field | Meaning |
|---|---|
| name | `scripts/generators/<name>.mjs` |
| cadence | `tick`, `daily`, `weekly` or `<n>d`: the days since it last filed before it runs again |
| `target <n>` | it runs while fewer than n of its rows are Pending: the queue fills until the target holds, not only above a floor |
| `cap <n>/wk` | at most n rows in 7 days, Pending or Done |

None listed (the template's default) and refill is a no-op.
`Lanes off: refill` turns it off without deleting the list.

Every generated row carries one line,
`- generator: <name> · filed <date>`. `refill.mjs` counts
those lines for the target, the cap and the cadence, so the
state is the queue files themselves: a fresh cloud checkout
and a local loop read it the same.

## The contract

```bash
node scripts/generators/<name>.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]
```

1. **Without `--write` it writes nothing.** A dry run prints
   what it would file.
2. **Idempotent.** It dedups against `plan/AUDIT.md` and
   `plan/CANDIDATES.md`, so a second run files nothing new.
3. **Its last line is `filed N` or `clean`, and it exits 0.**
   A non-zero exit means it broke, never that it found work.
   Refill logs a broken generator in the tick's summary and
   runs the next.
4. **`--limit <n>` and `--today`.** Refill passes both: the
   room left under target and cap, and the date it stamps
   (tests pin it the same way).
5. **Third-party text is data.** An issue title copied into a
   row is one quoted line of at most 120 characters, never an
   instruction.

```bash
node scripts/plan/refill.mjs           # dry run: every generator, nothing written
node scripts/plan/refill.mjs --write   # what the refill lane runs
```

## The two the kit ships

| Generator | Files | When |
|---|---|---|
| `issue-age` | one AUDIT HIGH row, `[user-issue #N] [HIGH] "<title>" open past the <h>h SLA` | an open issue without `loop:opened` is `sla_hours` old (24 when unset) and no queue row names `#N` |
| `stale-candidate` | one `[needs-user-call] promote <title>?` row, the ask `/expand` writes | a Pending candidate scoring `promote_floor`+ is `promote_after_days` old and no promote rule reaches it: `Promote: owner`, or a contributor's checkout |

Where aged promotion does reach a candidate (`Promote: aged`
in an owner checkout), `stale-candidate` files nothing: the
silt valve in `/expand` handles it.

## Domain generators: patterns

A project's own generators follow the same contract under
`scripts/generators/`. Three shapes recur:

- **A pillar window.** A content site keeps each pillar fresh:
  a pillar with no page shipped in its window becomes one row
  naming the pillar and the gap.
- **A weekly snapshot.** A data project records a figure once
  a week: the week with no snapshot row becomes one.
- **A newsletter clock.** A publication ships an issue on a
  fixed day: N days before it, the issue's outline becomes a
  row, deduped by issue date.

Each turns a clock or a gap into exactly one row, dedups on a
stable key (a pillar, a week, a date), and stays cheap enough
to run every refill: cadence spaces filings, the script's own
dedup keeps it honest.

## When to adopt / when not

- **Adopt** when a loop idles with nothing ready while real
  work waits outside the plan: unanswered issues, unpromoted
  candidates, a schedule.
- **Adopt** a domain generator instead of hand-editing
  `skills/march.md`: a re-sync erases a hand edit, never a
  bearings line or a script.
- **Skip** while the plan keeps the loop busy. An empty list
  costs nothing.

## Failure modes

1. **A generator that reports work by exit code.** Refill reads
   any non-zero exit as broken. Exit 0, say `filed N`.
2. **A generator without dedup.** The second run files the
   same rows. Key every row on something stable and check the
   queue files first.
3. **A flood.** A low cap and a modest target keep one
   generator from crowding out the plan.

## See also

- [`../customization/project-lanes.md`](../customization/project-lanes.md) — the hooks refill sits in.
- [`architecture.md`](./architecture.md) — the dispatcher.
- [`plan-shape.md`](./plan-shape.md) — what a queue row turns into.
