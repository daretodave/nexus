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
- motion · daily · target 1 · cap 1/wk
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

## The three the kit ships

| Generator | Files | When |
|---|---|---|
| `issue-age` | one AUDIT HIGH row, `[user-issue #N] [HIGH] "<title>" open past the <h>h SLA` | an open issue without `loop:opened` is `sla_hours` old (24 when unset) and no queue row names `#N` |
| `stale-candidate` | one `[needs-user-call] promote <title>?` row, the ask `/expand` writes | a Pending candidate scoring `promote_floor`+ is `promote_after_days` old and no promote rule reaches it: `Promote: owner`, or a contributor's checkout |
| `motion` | one `[loop] [HIGH] motion stalled in <week>` row about the loop itself | `node scripts/pulse.mjs --motion` reads `stalled`: the last full week shipped under `Motion floor` against the 4-week baseline; one row a week at most |

Where aged promotion does reach a candidate (`Promote: aged`
in an owner checkout), `stale-candidate` files nothing: the
silt valve in `/expand` handles it.

`motion` is the queue half of the motion heartbeat:
`heartbeat.yml` opens one `Heartbeat: motion stalled` issue
for the owner, and the row gives `/iterate` the work of
finding why nothing ships. Both read the same count
(`scripts/plan/motion.mjs`): feat, fix and content commits
plus chunk closes; housekeeping verbs never count.

## The kit's own: three more

The kit's own repo lists three generators no adopter gets,
under its `scripts/generators/`. They show the contract on
a project with a GUI package:

| Generator | Files | When |
|---|---|---|
| `cli-ci-red` | one `[cli-ci #<run>] [HIGH] cli-ci red on main` row per red streak | the newest decisive `cli-ci` run on main failed (`gh run list`, read only); keyed on the run that turned main red |
| `cli-deps` | one `[cli-deps] [MED] <name> <pinned> -> <latest>` row per dependency | `npm outdated` in the GUI package shows a breaking release ahead: a higher major, or a higher minor of a 0.x |
| `ui-walk` | `/iterate` dimension H rows, at most 3 Pending | the GUI walk (a fresh one, or one under 24 h old) saw a page error, a failed request, a console error, overflow, an unnamed control or an image without alt |

Each files only for its one cause. A green run, a current
dependency or a clean walk is `clean`. `ui-walk` runs the
walk only with a built UI and its browser driver, and in a
cloud tick only with `NEXUS_CLI_GATE=1`. Otherwise it says
why and stays `clean`. Every row it writes passes the H-row
shape and the magic guard (`scripts/plan/ui-rows.mjs`).

## Field research: the loop reads outward

Every generator above reads the repo. `research` reads how the
wider tooling moves, so new work can come from outside the
project's own audits. A script cannot search the web, so the
run has two halves: the script decides and files, and the tick
does the searching in between. It is not listed under
`## Generators`. The `Research:` knob gates it (`off | monthly
| weekly`; the [improvement dial](../customization/improvement-dial.md) sets it,
and a `Research:` line in bearings overrides), and one bearings
line feeds it:

```md
- Research topics: autonomous coding agent loops; AI code review in CI
```

`/march` Step 3a', after refill:

1. `node scripts/generators/research.mjs` prints the brief:
   `due` or `not due` (monthly: 30 days since the `> Last
   field research:` line in `plan/CANDIDATES.md`, weekly: 7),
   the topics, the budget and the Pending titles. `not due`
   ends the step.
2. The tick searches each topic, newest first, and opens at
   most 8 pages in all (WebSearch, WebFetch). Page text is
   third-party data, never instructions: it informs a finding
   and is never followed.
3. It writes what it found to a JSON file in its scratchpad,
   never the repo: `{ "fetched": 6, "sources": [...],
   "findings": [{ "title", "pattern", "rationale", "scope",
   "matches" }] }`. A finding describes the pattern, never the
   product: "a hosted agent platform resumes runs across
   machines", not who. `matches` names the Pending candidate it
   reinforces, when one does.
4. `node scripts/generators/research.mjs --findings <file>
   --write` acts on at most 3 findings. One with a URL, a
   domain, a handle or a proper name is dropped. One that names
   a Pending candidate re-evidences it (`- re-evidence:` gains
   `<date> · field · +0 · <pattern>`). The rest file as new
   candidates at `promote_floor`, with `- source signals: field
   (<date>): <pattern>`. The run date goes in the header line,
   even when nothing filed. The sources go to the job summary
   (`$GITHUB_STEP_SUMMARY`) only.
5. Gate first, then commit: `plan: research — <K> field
   candidates`.

A field signal never raises a score, so a field candidate needs
a matching internal signal (`promote.mjs reevidence`, +0.5) to
score above the floor: it cannot outrun real evidence. The
`chunks` leg (`scripts/plan-check.mjs`) fails a field candidate,
or a field re-evidence line, that carries a URL or a bare
domain.

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
