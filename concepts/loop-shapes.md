# Concepts: loop shapes

> One dispatcher on a cron is a loop. A *system* of loops —
> each with its own cadence, temperament, and blast radius —
> is an organism. This doc is the taxonomy: seven shapes that
> compose, and three that look tempting and aren't. Every
> shape here either runs in production somewhere (nexus
> itself, kintilla) or is a bounded extension of one that
> does.

The base methodology ships one loop: `/march` on a cadence,
dispatching verbs over queues, fenced by gates. That's the
workhorse, and for most projects it's enough. But loops have
a genus. Once the workhorse is boring — gates green, stops
paged, drift watched — these are the shapes worth adding, in
roughly this order.

---

## 1. The dispatcher (the workhorse)

`/march` on a cadence. Reads state, picks one verb, ships one
slice, returns. Everything in the kit exists to make this
shape safe: verify gate, deploy gate, queues, blocked rows,
the pager.

**Cadence:** 30m local, 2h cloud. **Model:** mid-tier — the
work is bounded by briefs. **Earns its place:** immediately;
it IS the methodology.

## 2. The night shift (the digest)

One tick a day, off-peak, running a different verb: `/digest`.
It does the two things per-commit ticks must not:

- **Breadth.** Whatever is O(everything) — full-corpus
  audits, exhaustive smoke walks (`SMOKE_SAMPLE=full`), link
  sweeps — runs here, not on the per-commit path. A page
  template is not more correct for being rendered 2,700
  times per commit; prove archetypes per commit, prove the
  exhaustive set nightly.
- **The morning briefing.** It writes `plan/DIGEST.md` — what
  shipped while you slept (including no-op ticks, pulled from
  the runner's own history), queue levels, blocked rows, what
  the loop intends today, and what needs you. One file,
  overwritten daily, readable from a phone. The instrument
  panel, delivered instead of fetched.

A useful side effect: a daily digest commit keeps the repo
active, so the platform never auto-pauses the crons for
inactivity.

**Cadence:** 1/day. **Model:** worth a tier up — synthesis is
where stronger models earn it. **Earns its place:** the first
morning you *want* to know what happened and don't want to
read a commit log.

## 3. The heartbeat (the immune system)

A tiny scheduled workflow with **no model in it at all** —
pure shell + platform CLI. Every few hours it checks the
other loops' vital signs:

- A run wedged `in_progress` past its honest duration →
  cancel it (the concurrency group unblocks; the next cron
  firing resumes naturally — no re-trigger machinery needed).
- No completed tick inside 2× the expected cadence → open or
  refresh a single deduped issue, fire the pager.

The heartbeat never fixes anything and never writes to the
repo. It converts "the loop silently died Tuesday" into "you
were paged Tuesday at 14:00." Watchers must be dumber than
the thing they watch — a model-free watchdog cannot
hallucinate health.

**Cadence:** every 4–6h. **Model:** none, on purpose.
**Earns its place:** the first time a wedged run blocks the
concurrency group for five hours.

## 4. The concierge (issue-ops)

The Issues tab is already the loop's inbox; the concierge
makes it the *command lane*:

- **`loop:do` label** — any issue you label `loop:do` jumps
  the queue: the next tick triages it immediately and routes
  it to the top with a priority bump. Filing an issue from a
  phone is remote `/jot`; labeling it `loop:do` is remote
  "this one, now."
- **Verb dispatch** — the workflow's manual trigger takes an
  optional `verb` input, so `gh workflow run march -f
  verb=critique` runs exactly the pass you want, from
  anywhere, without waiting for the dispatch order to get
  there.

**Earns its place:** the first time you're away and need the
loop to do a *specific* thing next, not the statistically
right thing.

## 5. The pollinator (the fleet)

When more than one repo runs the methodology, lessons stop
being local. The pollinator is a slow loop (weekly is plenty)
that reads the fleet's lessons ledgers — `NEXUS_LESSONS.md`,
`lessons.md`, adopters' filed issues — and turns convergent
scars into kit phase candidates. `/lessons-pr` is its manual
ancestor; the `/expand` sibling-lessons signal is its
always-on trace. The full shape adds: scheduled harvesting,
and (the bold half) opening PRs *downstream* when the kit
fixes a bug an adopter's copied templates still carry.

**Cadence:** weekly. **Earns its place:** the second repo.
Until then it's a signal inside `/expand`, not a loop.

## 6. The lanes (attended fan-out)

Three sessions, one branch, a claims board, a landing ladder
— [`../customization/lanes.md`](../customization/lanes.md).
The only shape in this list that is **attended by
definition**: lanes multiply a present human's throughput;
they do not run while you sleep. Composes with everything
above — each lane spawns its own sub-agents; the dispatcher
runs in alpha only.

## 7. The meta-loop (self-tuning, within rails)

The loop that adjusts the loop. The digest already computes
the pulse — verb mix, no-op rate, gate-failure rate,
time-to-drain. The meta-loop closes the circuit: when the
pulse says a gate is mistuned (critique never fires; the
ceiling hibernates productive days; a rate limit starves a
queue), it **proposes** the tuning as a phase candidate with
the pulse data as evidence.

The rail is absolute: **proposals, never actions.** The loop
does not edit its own gates, cadences, ceilings, or hard
rules; `/oversight` promotes or rejects. A loop that tunes
itself directly will, given enough ticks, tune itself into
whatever makes its metrics green — the gates exist to bind
the optimizer, so the optimizer doesn't get write access to
the gates.

**Earns its place:** after weeks of pulse history, not days.
It's listed here because it's where this genus goes; adopt it
last.

---

## Shapes that don't earn their place

- **The swarm.** N unattended writers on one branch. Lanes
  work because a human referees; unattended, every collision
  is a divergence stop and every divergence stop is a dead
  loop. One unattended writer per branch, always.
- **The firehose.** Sub-hour cloud cadence. Ticks queue
  behind the concurrency group, the ceiling hibernates the
  surplus, and you pay for waiting. If the queues outrun the
  cadence, the answer is lanes (attended) or better briefs —
  not more ticks.
- **The oracle.** A loop given write access to its own gates
  and rules "to save oversight time." See shape 7's rail.
  The whole methodology is load-bearing *because* the loop
  cannot vote on its own constraints.

---

## Composition

The shapes are one organism, not a menu of rivals:

| Shape | Cadence | Model | Writes to repo | Watches |
|---|---|---|---|---|
| Dispatcher | 30m–2h | mid | yes | the queues |
| Night shift | daily | strong | yes (digest) | everything, in breadth |
| Heartbeat | 4–6h | none | no | the other loops |
| Concierge | on demand | (rides dispatcher) | via queues | your phone |
| Pollinator | weekly | mid | candidates only | the fleet |
| Lanes | attended bursts | session | yes | the claims board |
| Meta-loop | rides night shift | — | candidates only | the pulse |

Serialization rule: every cloud shape that writes shares one
concurrency group with the dispatcher. The heartbeat (which
never writes) is the only loop allowed to run beside them.

Start with the dispatcher. Add the heartbeat the first time
something wedges. Add the night shift when you stop reading
commit logs. Add the concierge when you leave. The rest, when
their moment names itself.

---

## See also

- [`architecture.md`](./architecture.md) — the layers inside
  a single tick.
- [`../playbooks/hands-off.md`](../playbooks/hands-off.md) —
  the rigging every unattended shape assumes.
- [`../playbooks/cloud-loop.md`](../playbooks/cloud-loop.md)
  — the runtime the cloud shapes share.
