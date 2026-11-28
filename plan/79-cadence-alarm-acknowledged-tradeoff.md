# 79 — The realized-cadence alarm stops re-opening on an answer the owner already gave

> Fourteen identical issues (`#91`, `#96`, `#127`, `#129`-`#132`,
> `#137`, `#139`, `#143`-`#145`, `#149`), fourteen identical
> closes, zero changes. The alarm is loud in exactly the way
> `agents.md` rule 6 wants — until the loud thing is a question
> already answered.

## Why

`.github/workflows/heartbeat.yml`'s "Alarm if march's realized
cadence is below 40%" step (`templates/scripts/cloud/cadence.mjs
realized`) measures raw cron-schedule-event delivery and opens
"Heartbeat: march realized cadence below 40%" whenever that
reading drops under 40% in a 72h window. The owner's own cron
(`17 */3 * * *`, chosen 2026-11-21 closing `#96`) was picked
knowing "chained ticks, not the cron, carry the throughput" —
the design deliberately doesn't rely on raw schedule-event
delivery, so the alarm is measuring the one thing everyone
already agreed not to optimize. Dedupe only checks for an *open*
issue of the exact title, so the instant `/triage` closes one
citing the `#96` precedent, the next 72h window under the floor
— near-guaranteed at this cron's realized rate — opens a fresh
one. Ten-then-fourteen identical round-trips (`plan/CANDIDATES.md`
"Heartbeat's realized-cadence alarm re-fires", score 8.3) is the
strongest possible evidence the alarm checks the wrong thing,
not that the loop is unhealthy. `templates/.github/workflows/
heartbeat.yml` ships the identical check to every adopter's
cloud loop, so any adopter whose cron GitHub throttles past 40%
inherits the same permanent false-positive, not just nexus.

## Design

- Pick one of the two fixes `CANDIDATES.md` named, by whichever
  reads simpler against `templates/scripts/cloud/cadence.mjs`'s
  current shape:
  - **Measurement swap:** `cadence.mjs realized` counts actual
    tick throughput (chained dispatches included, matching the
    design's own stated invariant — "chained ticks carry the
    throughput") instead of raw cron-schedule-event delivery.
  - **Acknowledged-tradeoff lock:** a `since:` / `until:` /
    `max_age:` lock (the same locks-time-out shape
    `concepts/plan-shape.md` already defines for Held lines and
    `[needs-user-call]` rows) that the realized-cadence step
    reads before filing; present and unexpired, it skips the
    file instead of opening a fresh issue. The lock still times
    out on its own `max_age`, so a real future regression isn't
    silenced forever.
- Whichever fix lands, it closes in the one place the drift
  keeps recurring: `.github/workflows/heartbeat.yml`'s realized-
  cadence step **and** its `templates/.github/workflows/
  heartbeat.yml` mirror (`agents.md` rule 7 — adopters copy the
  same workflow and would inherit the same false-positive loop
  on their own throttled cron).
- `#91`, `#96`, `#127`, `#129`-`#132`, `#137`, `#139`, `#143`-
  `#145`, `#149` stay closed; no reopening. The fix only stops
  the next one.

## Acceptance

- **A1** The realized-cadence step no longer opens a new
  "Heartbeat: march realized cadence below 40%" issue for the
  same already-acknowledged cron tradeoff — either because it
  now measures chained-dispatch throughput instead of raw
  schedule-event delivery, or because an owner-set lock
  suppresses the re-file while unexpired.
- **A2** The fix lands in both `.github/workflows/heartbeat.yml`
  and `templates/.github/workflows/heartbeat.yml` in the same
  commit.
- **A3** A genuine future cadence regression (not the
  acknowledged tradeoff) still alarms — a measurement swap
  keeps a real-throughput floor; a lock carries its own
  `max_age` and times out.

## Open questions

- Measurement swap vs. acknowledged-tradeoff lock is an owner
  call: the former changes what "realized cadence" means for
  every adopter's cloud loop (templates/ public API, `agents.md`
  rule 7); the latter is narrower (one suppression, nexus's own
  cron) but needs a human to set the lock's `until:`/`max_age:`
  the first time. Whichever chunk builds this should check in
  with the Held-lane/lock convention before picking.

## Chunks
Measure: 3 open · 0 closed · next A4

Not chunked yet.
