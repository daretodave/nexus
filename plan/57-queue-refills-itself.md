# 57 — Anti-lull: the queue refills itself

> A loop whose owner stops promoting keeps building: aged
> candidates promote themselves behind a veto window, project
> lanes and generators turn time into work, the heartbeat
> alarms when nothing ships, and no lock or header grows
> without bound.

## Why

The lull tracks how often the owner promotes, not how healthy
the loop is. In the two longest-running adopters, owner
oversight commits fell from 18 a month to 0 and from 10 to 0,
their build lanes reached 0 open phases, and 32 to 51 scored
candidates waited. One adopter's build-verb commits per week
went 32, 25, 28, 13, 7, 9, 1, 0, 1, 1, 0, 0, 0 (Jul to Oct),
and about 64% of its October ticks were idle.

What exists today (verified 2026-10-25):

- `plan/CANDIDATES.md` holds 32 Pending, 20 of them scoring
  ≥ 6.2; the oldest is 115 days and 25 were proposed in July.
  Its header says `Last pass: 2026-10-15`, `Pass count: 23`.
- `skills/digest.md:55-61` writes "oversight needed: candidate
  queue silting" into `DIGEST.md`. No actor reads that line.
- `skills/expand.md:85-90` folds a signal that matches a
  Pending row into that row as "re-evidenced" and files
  nothing. 15 of nexus's 23 expand passes read "0 new, 1
  re-evidenced"; one adopter logged 42 empty passes in a row.
- The cloud may never promote: `.github/workflows/march.yml:153`
  says "Never promote candidates from cloud". The only
  self-promotion path is `/expand promote` from a local loop
  (`skills/expand.md:28-40`), and it builds the spec on the
  next tick, so nobody gets time to say no.
- The kit has no generator concept. An adopter running an
  editorial loop keeps moving only because its hand-edited
  march carries domain refill steps (a weekly snapshot, a
  content queue, an empty-queue survey refill). A re-sync of
  the kit's `march.md` would erase them.
- `heartbeat.yml` alarms on liveness ("no successful run in N
  h"), never on motion: runs that succeed and ship nothing
  look healthy.
- Self-locking lanes can lock forever: one adopter's lane
  reads "locked until the gap table reads zero" and its last
  sweep reconfirmed 35 rows and resolved none.
- Headers that log every pass make every tick pay to read
  history. nexus's `plan/AUDIT.md` is 216 KB and 3756 lines,
  of which lines 1-2237 are header before `## Pending`; one
  adopter's candidates header alone is 1.1 MB.

## Design

### The silt valve: aged promotion behind a Held veto

A new step in `/expand` after filing, in nexus and the
template. Under `Promote: aged`, the pass promotes the
highest-scoring Pending candidate (ties: the oldest) when all
three hold:

- its score is ≥ `promote_floor`;
- its age is ≥ `promote_after_days`, or it has been
  re-evidenced by two independent signals;
- fewer than `promote_per_week` auto-promotions are dated in
  the last 7 days (vetoed ones count, so a veto never frees a
  slot for an immediate retry).

Promotion uses the existing `/expand promote` path (unchunked
spec plus roadmap row, `plan-check --since HEAD` green), with
two additions:

1. The spec's roadmap row also gets a line in the **Held**
   lane: `- NN · auto-promoted, veto until <date> (#<issue>)`,
   where the date is today plus `veto_days`. `/next` and
   `/march` never pick a Held spec, so nothing is chunked or
   built inside the window.
2. A veto issue opens: title `Auto-promoted: <title> — close
   to veto`, labels `loop:opened` and `loop:veto`. The body
   quotes the candidate's rationale capped at 600 characters
   and links the spec. `loop:opened` keeps spec 54's nudge
   from treating it as a support issue.

`/march` Step 0 (after sync) gains a veto sweep over Held
lines that read `auto-promoted`:

| Issue state | Window | The tick does |
|---|---|---|
| closed | open | Veto: delete the spec file, its roadmap row and its Held line; move the candidate to `## Rejected` as `vetoed <date> (#N)`. |
| open | passed | Release: remove the Held line; close the issue with "veto window passed; this spec is now built"; the spec is picked by `/next top` as usual. |
| open | open | Nothing. |

The loop removes the Held line in the same tick it closes the
issue, so any closed issue whose Held line still exists is a
veto, whoever closed it. `/oversight` may release early by
removing the Held line itself.

Auto-promotion runs in owner mode only. In pull-request mode,
or for a contributor, an eligible candidate becomes one
needs-user ask instead (the stale-candidate generator below).
`strict` forces `Promote: owner`.

The march prompt's rule 3 becomes "Never promote from cloud
unless `plan/bearings.md` says `Promote: aged` or
`autonomous`", in nexus's `march.yml`, the template and the
CLI's bundled twin. `/oversight`'s brief lists auto-promotions
in their veto window first. The digest's silt line becomes
"auto-promoted X (veto until D), Y awaiting".

### Pending stays live

- Each independent re-evidence adds +0.5 to the row's score,
  capped at +2 over its filed score. Independent means a
  different signal letter (A-E) or a different issue or commit
  than any already in the row's `source signals`. Each one
  also counts toward the two-re-evidence aging trigger.
  (Decided in 57.6: `promote.mjs reevidence` writes it on the
  row, a `- filed score:` line on the first one and a dated
  line under `- re-evidence:` each time, logged at +0 when not
  independent; the template's signal letters run A-H. A row's
  letters are those lines' plus any `signal <X>` in its text.)
- When Pending exceeds `pending_cap`, the pass promotes per
  `Promote`; if Pending is still over the cap, it moves the
  lowest-scoring rows older than 60 days to `## Rejected` with
  the reason `stale: below cap cut <date>`, at most 5 a pass,
  and lists them in the digest. Five a pass lets nexus's 32
  drain to 15 over four passes with each cut visible.

### Project lanes

A stable extension point in v2 `march.md` and `iterate.md`,
shared with spec 58 (which writes an adopter's custom march
steps into it on upgrade).

- `skills/march.lanes.md` and `skills/iterate.lanes.md` are
  never overwritten by the kit. The template ships both empty
  apart from a commented example lane.
- `march.md` reads `march.lanes.md` at two hooks: `pre` (after
  Step 0 sync and the veto sweep, before triage) and `queue`
  (after 3a ready chunk, before 3b `data/BACKLOG.md`).
- `iterate.md` reads `iterate.lanes.md` at one hook:
  `dimensions`, appended after the stock dimensions; each
  lane there is an extra audit dimension with its own letter
  range.
- A lane yields to the Asap lane and, once spec 54 routes
  support rows, to support rows: a lane at `pre` runs only
  when neither has a ready item.
- `plan/bearings.md` disables a lane by name with
  `Lanes off: <name>, <name>`.
- No lanes file, or one with no lane blocks, means stock
  dispatch.

### Generators

A generator is a script that turns time or repo state into
queue rows.

- The stock `refill` lane sits at the `queue` hook. When no
  chunk is ready, it runs every generator listed under
  `## Generators` in `plan/bearings.md`, before `/expand`.
- Each listed generator has a cadence, a target (the queue
  keeps filling until the target holds, not only above a
  floor) and a weekly cap on rows filed.
- A generator that exits non-zero is logged in the tick's
  summary and the run continues with the next one.
- Two generic generators ship in 57.3 under
  `templates/scripts/generators/`:
  - `issue-age`: an open issue without `loop:opened`, past
    the SLA, becomes one AUDIT HIGH row.
  - `stale-candidate`: a Pending row past
    `promote_after_days` that no promote rule can reach
    (`Promote: owner`, pull-request mode, or a contributor)
    becomes one needs-user ask.
- `motion` ships with the motion pulse in 57.4, because it
  reads `pulse --motion`.
- nexus-only generators ship in 57.9 under
  `scripts/generators/`: `cli-ci-red`, `cli-deps` (dependency
  freshness for `packages/cli`) and `ui-walk` (wraps spec 56's
  walk and files H rows).
- `concepts/generators.md` explains domain generators as
  patterns only: a pillar window, a weekly snapshot, a
  newsletter clock. It names no adopter.

### Motion heartbeat

- `pulse.mjs --motion` counts shipped units per ISO week:
  commits whose verb is `feat`, `fix` or `content`, plus
  chunk closes from `ARCHIVE.md`. It excludes `audit`,
  `digest`, `expand`, `critique`, `triage`, `plan` and
  `jot`. It compares this week with the trailing 4-week
  baseline. "This week" is the last full ISO week (decided in
  57.4: a partial week would alarm every quiet Monday); the
  week in progress clears a stall once it reaches the floor,
  and five empty full weeks after earlier shipping read
  `stalled` even though the baseline is then 0.
- pulse stays offline: the idle-tick ratio (successful march
  runs with no `Cloud-Run:` commit) is computed only when the
  caller passes `--runs <file>`, the JSON of `gh run list`.
- `heartbeat.yml` runs it (as `scripts/plan/motion.mjs
  alarm`, which prints the same lines and owns the issue
  writes, so pulse itself stays offline). Below the motion
  floor it opens one deduped issue, `Heartbeat: motion
  stalled`, labelled `loop:opened` and `loop:stall`, and
  closes it when a week recovers.
- `stall_action` decides what follows:
  - `alert` (default): `notify.mjs` plus a digest line.
  - `promote`: the next march tick sees the open `loop:stall`
    issue at the `pre` hook and runs only expand's aged
    promotion (pick, spec, veto issue, Held line; the expand
    rate limit skipped, `promote_per_week` still binding),
    never a bare `/expand promote` pass. With
    `Promote: owner` it falls back to `alert`.
  - `off`: nothing, not even the issue.

### Iterate dimension I: loop

- Dimension I reads `pulse --motion` and the no-op,
  ceiling-skip and support-latency lines that specs 54 and 55
  add to the tick summary. It files `category: loop-config`
  rows whose `next` names one concrete lever: a repo variable
  from spec 55 or a bearings line.
- A tuning that needs a YAML edit is filed as
  `[needs-user-call]`, never made.
- At most one loop-config row ships per 7 days, with ease
  capped at 6, so tuning never crowds out real work.
- It waits on 55.5 (presets, after the quota governor,
  chaining and idle skip) and 54.8 (the support line) so
  that its levers and inputs exist.

### Lock timeouts

A methodology rule in `concepts/plan-shape.md` and
`iterate.md`, nexus and template:

- Every lane lock, Held line and owner-blocked row carries
  `until:` (a date or a condition) and `max_age:` (default
  `14d`). An optional `fallback:` names what happens when
  `max_age` passes. (Decided in 57.5: a lock also carries
  `since: <date>`, the day it was set, because age needs a
  start; an auto-promoted line's is its veto date less its
  `max_age`. Outside the Held lane a lock names itself with
  `lock: <slug>`; a Held line is named by its id. A date
  `until:` gone by ends the lock too.)
- Past `max_age`, the loop applies the fallback. With none
  declared, it files exactly one needs-user ask: `notify.mjs`
  in adopters, a `needs-user` issue in nexus. The ask is
  deduped by the lock's slug, re-pinged weekly by comment and
  listed first in `/oversight`. (Decided in 57.5: the issue,
  `Lock past max_age: <slug>`, is the ask's dedup record in
  both, since a fresh cloud checkout has no other state; an
  adopter's `notify.mjs` fires beside it on the open and each
  re-ping. `scripts/plan/locks.mjs sweep` runs at `/march`
  Step 0, after the veto sweep.)
- `plan-check` parses `until:` and `max_age:` on Held lines.
- v1 adopters get the rule through spec 58's upgrade; no v1
  patch path carries it.

### State diet

- The headers of `CANDIDATES.md`, `CRITIQUE.md` and `AUDIT.md`
  keep only the `Last pass`, `Pass count` and `Posture`
  lines. The pass narrative goes in the commit body.
- A new verify leg, `state-size`, fails a header longer than
  20 lines or a queue file larger than `NEXUS_STATE_MAX_KB`
  (default 256).
- Done rows older than 30 days are deleted from the queue
  file. Git keeps them, and the commit body gives the count.
  They do not move to `ARCHIVE.md`, whose lines are
  chunk-shaped and parsed by the gate.
- A one-time compaction does this for nexus's `AUDIT.md`
  (2237 header lines, 89 Done rows).

## Contracts

`plan/bearings.md` keys, under `## Plan expansion posture`
unless noted:

| Key | Values | Adopter default | nexus |
|---|---|---|---|
| `Promote` | `owner \| aged \| autonomous` | `owner` on upgrade; `aged` on a new v2 adoption; `strict` forces `owner` | `aged` |
| `promote_after_days` | days | 21 | 14 |
| `promote_floor` | score | 6.0 | 6.0 |
| `promote_per_week` | count | 1 | 2 |
| `veto_days` | days | 3 | 3 |
| `pending_cap` | count | 15 | 15 |
| `## Generators` (own section) | `- <name> · <cadence> · target <n> · cap <n>/wk` | empty (refill is a no-op) | issue-age, stale-candidate, motion, cli-ci-red, cli-deps, ui-walk |
| `Motion floor` | % of 4-week baseline | 50% | 50% |
| `stall_action` | `alert \| promote \| off` | `alert` | `promote` |
| `Lock max age` | days | 14d (overridable inline) | 14d |
| `loop` (dimension I) | `on \| off` | `on` for a new v2 adoption, `off` for `strict` and on upgrade | `on` |
| `Lanes off` | lane names | none | none |

A lanes file holds one block per lane:

```md
## lane: <name>
- hook: pre | queue | dimensions
- when: <prose> | script <path>   # exit 0 = run
- run: <skill or command>
- return: continue | end-tick
```

The generator contract:

- `node scripts/generators/<name>.mjs [--write] [--limit <n>]
  [--today <date>]`. Without `--write` it writes nothing.
  `scripts/plan/refill.mjs` passes `--limit` (the room left
  under target and cap) and `--today`.
- Every row it files carries `- generator: <name> · filed
  <date>`. Refill counts those stamps for target, cap and
  cadence, so its state is the queue files (a fresh cloud
  checkout reads it as a local loop does); cadence is days
  since the last filing (`tick`, `daily`, `weekly`, `<n>d`).
- It is idempotent: it dedups against `AUDIT.md` and
  `CANDIDATES.md`, so a second run files nothing new.
- It prints `filed N` or `clean` on its last line and exits
  0. A non-zero exit means it broke, never that it found work.

`pulse.mjs --motion [--runs <file>]` prints three lines:
`shipped <this week> / baseline <4-week mean>`,
`floor <n> · <ok|stalled>` and, with `--runs`,
`idle ticks <pct>`.

The Held line for an auto-promotion:

```
- NN · auto-promoted, veto until 2026-10-28 (#123) · max_age: 3d · fallback: release
```

## Acceptance

- **A6** `/iterate` dimension I files `category: loop-config` rows whose `next` names a concrete repo variable or bearings line, ships at most one per 7 days, and files a YAML tuning as `[needs-user-call]`.
- **A9** nexus's refill lane runs `cli-ci-red`, `cli-deps` and `ui-walk` under the generator contract, each with a test, and files AUDIT rows only for a red cli-ci run, a stale dependency or a walk finding.

## Open questions

(None.)

## Chunks

Measure: 2 open · 7 closed · next A10

- [ ] **57.8** Iterate dimension I files loop-config rows · S · closes A6 · needs 55.5, 54.8
- [ ] **57.9** nexus generators: cli-ci-red, cli-deps, ui-walk · M · closes A9 · needs —
