# <PROJECT> roadmap

> What is still to build, one spec per initiative, each ending
> in chunks sized to one session. Read by every shipping skill
> (`/ship-a-chunk`, `/plan-a-spec`, `/march`, `/iterate`,
> `/oversight`) to pick the next chunk. The plan only shrinks:
> a finished chunk leaves as one line in
> [`ARCHIVE.md`](ARCHIVE.md).

---

## Lanes

**Asap** (built before the table, in this order, once their
needs are done):

- (none yet)

**Held** (waits on a person's word; never picked until the
line goes):

- (none yet)

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 1 | Bootstrap: project init, base layout, verify gate green, deploy gate green | [01-bootstrap.md](01-bootstrap.md) | planned | 3 left |
| 2 | <CANONICAL SIBLING>: the first feature surface, the template every later surface mirrors | [02-canonical-sibling.md](02-canonical-sibling.md) | planned | 3 left |

> **Replace these rows with your project's specs.** Aim for a
> handful of specs, each one initiative (a surface, a layer, a
> capability). Number them in the order you'd build them; the
> number is the spec's id for life. A spec that's written but
> not yet broken down says `Not chunked yet.` under its
> `## Chunks`, and the first build that picks it chunks it.

## How the loop reads this folder

1. **Pick.** An explicit argument wins (`/ship-a-chunk 02.3`).
   Otherwise the first ready chunk in the Asap lane, then in
   priority rows (a Status of `planned · priority N`,
   `priority 1` first), then in table order. Within a spec,
   the first chunk whose `needs` are done. A need is done when
   its line is gone from every spec. Held chunks are never
   picked.
2. **Spec.** Read the spec end to end: Design and Contracts
   are decided upfront, and Acceptance says what done means.
3. **Bearings.** `bearings.md` holds stack pins, contracts,
   visual defaults, the sub-agent registry and standing
   decisions. Read once per session.
4. **Arrive.** New work enters through `/plot` (one task,
   researched and chunked, with its place in line: `asap`
   appends to the Asap lane, `anytime` leaves the row in table
   order after every priority row), `/messy` (a dump of
   thoughts, clustered into themes, each refined into a spec),
   or `/oversight` promoting a
   [`PHASE_CANDIDATES.md`](PHASE_CANDIDATES.md) entry.

## Chunks, measure, archive

- **Chunks.** Each spec ends with `## Chunks`, listing only
  chunks still to build: `- [ ] **NN.k** <title> · S|M|L ·
  closes A1, A2 · needs —`. S is about an hour, M a few hours,
  L one full session at most; anything bigger is split into
  vertical slices that each ship something runnable and
  tested. A chunk's sub-bullets carry only real requirements.
- **Measure.** Acceptance bullets carry stable IDs (`A1`,
  `A2`, …). Every chunk says which IDs it `closes` (or
  `partial`s); splitting a chunk divides its IDs among the
  children. The line reads `Measure: 2 open · 5 closed · next
  A8`, and `open + closed = next − 1`: IDs are never
  renumbered or reused.
- **Closing shrinks the plan.** In the commit that ships a
  chunk: remove its line and the A-IDs it closed, fix the
  Measure line, drop it from other chunks' `needs` and from
  the lanes, update the row's `N left`, and append one line to
  `ARCHIVE.md` (date, chunk, ≤ 10 words, commits). No ticked
  or struck-through history stays in a spec.
- **Specs end.** When every ID is closed, the spec's lasting
  rules move to `identity/` (or to `bearings.md`'s standing
  decisions, if there is no `identity/` yet), the file is
  deleted, and the archive gets
  `· NN · spec complete: <title> · deleted in <sha>`.
- **The gate.** `node scripts/plan-check.mjs --since HEAD` (in
  your verify composition) checks all of the above.

The full model: `nexus/concepts/plan-shape.md`.

## Layout

```
plan/
├── README.md                # this file: lanes + spec table
├── NN-<slug>.md             # one spec per initiative
├── ARCHIVE.md               # one line per finished chunk (append-only)
├── nexus.lock               # the nexus kit version this plan follows
├── bearings.md              # standing context: stack, contracts, defaults, sub-agents, posture
├── AUDIT.md                 # latest /iterate audit (rewritten on each pass)
├── CRITIQUE.md              # external-observer findings (append-only via /critique)
├── PHASE_CANDIDATES.md      # candidates from /expand, gated by /oversight (each becomes a spec)
├── CURRENT-STATE.md         # adopt-by-need: brownfield retrofit only (see nexus/playbooks/existing-project.md §1)
├── reflexes.md              # adopt-by-need: ≤50-line always-read core (see nexus/customization/lessons-layer.md)
└── lessons.md               # adopt-by-need: domain-keyed corpus, read by offset
```

## Where design lands

The user emits design exports asynchronously into `design/` at
the project root. The loop does not wait for design: if the
export isn't there, the next chunk that touches that surface
integrates it when it lands.

## How the audit works

`/iterate` writes findings to `plan/AUDIT.md` with this format:

```markdown
# Site audit — <ISO date>

## Top 5 findings (scored)

### [8.1] <one-line description>
- category: <content-gaps | data-gaps | seo | links | a11y | tests | perf | external-critique | external-issue>
- impact: <0-10>
- ease: <0-10>
- next: <action — invocation, sub-agent, or follow-up>
```

Entries are flipped `[ ]` → `[x]` (with commit hash) as
addressed. A finding too big for one `/iterate` pass becomes a
chunk (or a spec) through `/oversight`.

A line `> Bias: <category> (set via oversight <date>)` at the
top of `AUDIT.md` weights that category 1.5x in `/iterate`'s
scoring. Set / cleared via `/oversight reset`.

## Reflexes and lessons (adopt-by-need)

`reflexes.md` + `lessons.md` are a two-tier lessons layer —
copy them in once the project has accumulated real recurring
lessons (not day-1 setup notes). See
`nexus/customization/lessons-layer.md` for the caps, the
promotion path (lesson → reflex), and the drain path (reflex
→ skill procedure edit).

## Closing a chunk by hand

If a chunk ships outside the loop, close it by hand exactly as
above (line out, A-IDs out, Measure fixed, archive line in) and
run `node scripts/plan-check.mjs --since HEAD` before the
commit. The loop relies on the plan being true.

## Related skills

- `skills/ship-a-chunk.md` — build one chunk end-to-end and
  close it.
- `skills/plan-a-spec.md` — write or chunk a spec without
  shipping code.
- `skills/ship-data.md` — ship one data record (if applicable).
- `skills/iterate.md` — audit + ship one improvement; closes
  GitHub issues when their fix lands.
- `skills/critique.md` — external-observer pass; writes to
  `CRITIQUE.md`.
- `skills/triage.md` — issue review; routes open issues into
  `AUDIT.md` / `BACKLOG.md` / the plan.
- `skills/expand.md` — plan-expansion pass; reads signals,
  proposes candidates to `PHASE_CANDIDATES.md`.
  Posture-controlled (bold default; strict opt-out).
- `skills/march.md` — outer dispatcher (used with `/loop`).
- `skills/oversight.md` — user-in-the-loop adjustment (the only
  skill that asks questions). Promotes candidates into specs.
