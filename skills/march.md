# Skill: march (nexus)

> **Outer dispatcher for the kit's own loop.** Reads repo
> state, delegates to one skill, returns. Designed for
> `/loop` and the cloud tick. The kit that teaches the loop,
> run by the loop.

## 1. Purpose

Pick the right verb each tick:

```
pre lanes (skills/march.lanes.md) →  each lane that is due
unlabeled issues exist            →  /triage (a fix or an Asap chunk: on to 3a)
queued issue past sla_hours       →  /plot asap (Step 1.5), then 3a
ELSE critique due, no Asap ready  →  /critique
ELSE ready chunk                  →  /next top
ELSE queue lanes                  →  each lane that is due
ELSE expand due + bold posture    →  /expand
ELSE                              →  /iterate
```

Project lanes (`skills/march.lanes.md`, never overwritten by
a kit re-sync) are where a project's own steps live; with no
lane blocks there, dispatch is the stock order above.

No data step (the kit has no data layer) and no deploy gate
(`agents.md` rule 4). Everything else is the standard march
contract.

## 2. Invocation

```
/march                       # one tick
/loop 45m /march             # local autonomous loop
/loop /march careful         # ideate passes hold back: fix what is there, invent nothing
/loop /march bold            # ideate passes push: propose new work whenever building is done
```

### How hard the ideate passes push

One optional word after `/march` sets it for the run (the GUI's
Infinite picker sends it); no word is `balanced`. It tunes only
the passes that invent work: `/expand`, and `/iterate`'s
hand-off to it. Triage, critique and ready chunks dispatch
exactly as below.

- `careful`: fix what is there, invent nothing. 3b (expand) is
  skipped and `/iterate` runs `careful` (a top score under 3.0
  stops the tick instead of handing to `/expand`).
- `balanced` (default): the bearings posture and cadence as
  written.
- `bold`: propose whenever building is done. 3b's window opens
  at **5+ commits** or **24+ hours** since the last pass
  (instead of 20 commits or 7 days), and `/expand` runs `bold`.

The word never loosens `plan/bearings.md`: posture `strict`
keeps `/expand` a no-op (`bold` then reads as `balanced`, and
the report says so), and only posture `autonomous` writes specs
without `/oversight` (and `Promote: aged`, one aged candidate a
pass, held behind its veto window).

Cloud: `.github/workflows/march.yml` runs one tick per cron
firing.

## 3. Procedure

### Step 0 — Sync

```bash
node scripts/plan/support.mjs start   # stamps the tick start (.git/nexus-tick-start); Step 1 measures the budget from it
git pull --ff-only
```

Divergence → stop per §5.

Then the veto sweep, over the Held lines `/expand`'s aged
promotion writes (`skills/expand.md` §6; none, and it prints
`clean`):

```bash
node scripts/plan/promote.mjs sweep      # veto | release | wait, one line each (gh read only)
```

| Issue state | Window | The tick does |
|---|---|---|
| closed | any | **Veto**: the spec file, its roadmap row and its Held line go; the candidate moves to `## Rejected` as `vetoed <date> (#N)`; `ARCHIVE.md` gets a `spec vetoed` line. |
| open | passed | **Release**: the Held line goes; `/next top` picks the spec as usual. |
| open | open | Nothing. |

Any veto or release: `node scripts/plan/promote.mjs sweep
--write`, the gate, one commit (`plan: veto sweep — vetoed
<NN>, released <NN>`), land. Only then close each released
issue: `gh issue close <N> --comment "veto window passed; this
spec is now built"`. Landing first matters: a closed issue
whose Held line still exists reads as a veto, whoever closed
it.

Then the lock sweep: no lock holds forever. Every other Held
line, lane lock and owner-blocked row carries `since:`,
`until:` and `max_age:` (`concepts/plan-shape.md`, "Locks
time out"):

```bash
node scripts/plan/locks.mjs sweep --write  # release | fallback | ask, one line each
```

`release` took the lock's line out: gate, one commit (`plan:
lock sweep — released <slug>`), land. `fallback` is the
lock's own `fallback:`: apply it now, then remove the lock or
give it a new `since:`. `ask` filed (or re-pinged weekly) the
one `Lock past max_age: <slug>` issue, a needs-user ask; an
ask whose lock is gone is closed. Both sweeps are
housekeeping; the tick goes on to the `pre` lanes.

### Step 0.5 — Pre lanes

```bash
node scripts/plan/lanes.mjs march pre    # run | judge | skip <lane>, then `stock` or `N lanes at pre`
```

`stock`: go on to Step 1. Otherwise, in file order, run each
`run` lane and each `judge` lane whose `when` prose holds now,
under the child skill's contract. A lane that returns
`end-tick` is the tick's work: land it and return. A `pre`
lane yields to the Asap lane (the script skips it while an
Asap chunk is ready); `Lanes off: <name>` in
`plan/bearings.md` turns one off.

Then the motion stall (the heartbeat opens `Heartbeat: motion
stalled` when a full week ships under `Motion floor`):

```bash
node scripts/plan/motion.mjs react      # promote #N | alert #N | off #N | none (gh read only)
```

`promote #N` (`stall_action: promote` under `Promote: aged`):
run only `skills/expand.md` §6's aged promotion now, the
expand rate limit skipped (`promote.mjs pick` → the spec →
the `loop:veto` issue → `promote.mjs hold`), never a bare
`/expand promote` pass: that one writes every pick straight
in, with no veto window. So `promote_per_week` bounds a long
stall and the owner keeps the window. Then Step 1. `alert`, `off` and `none`: go on; the
heartbeat closes the issue when a week recovers.

### Step 1 — Triage gate (cheapest; concierge first)

```bash
# The concierge lane: loop:do outranks everything.
urgent=$(gh issue list --repo daretodave/nexus --state open \
  --label loop:do --json number --jq 'length' 2>/dev/null || echo 0)

unlabeled=$(gh issue list --repo daretodave/nexus --state open \
  --search "-label:triage:loop-queued -label:triage:planned -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number --jq 'length' 2>/dev/null || echo 0)
```

`urgent > 0` OR `unlabeled > 0` → read `skills/triage.md`
and execute it (with the `/bug` runs its Support routing
starts). (`loop:do` issues are re-triaged even if already
labeled — the label is the user saying "this one, now";
triage §4 handles the bump.) `gh` missing/unauthed → warn and
fall through (never fail the march on the awareness layer).

Then keep going or return (spec 54): a triage that fixed a
bug now or plotted one Asap still has a tick to spend.

```bash
node scripts/plan/support.mjs continue --routed <fix|asap|none>   # --budget 60: march.yml's timeout
```

`continue` (a fix-now or an Asap chunk, under half the
budget used) → Step 1.5, then 3a in this tick, past the
critique gate. `return` → return. No issue to triage → Step
1.5.

### Step 1.5 — Support SLA

A queued user issue never waits behind the spec table past
its SLA (spec 54). Under `Support: fix-small` or `fix-all`:

```bash
node scripts/plan/support.mjs sla   # plot #N | lift <id> #N | wait #N, then due N | clean (gh read only)
```

It reads the open `triage:loop-queued` issues `sla_hours` old
(`plan/bearings.md`) whose work no Asap lane line, pending
close or `ARCHIVE.md` line names, oldest first, within
`asap_cap`:

- `plot #N`: `/plot asap "<the diagnosis in #N's AUDIT row>"`,
  the chunk title and its Asap lane line ending `(#N)`; the
  AUDIT row (if any) moves to Done as `plotted <id>`.
- `lift <id> #N`: an open chunk already names the issue; add
  `- <id> (#N)` to the Asap lane.
- `wait #N`: `asap_cap` is full; the aged AUDIT row carries it
  (`skills/iterate.md` §3).

Any `plot` or `lift`: the gate, one commit (`plan: support
SLA — #N`), land, then Step 3a (the Asap lane is built first,
before any critique pass or spec-table chunk). `clean`, `off`
or `skip`: go on to Step 2.

### Step 2 — Critique gate (rate-limited)

A ready Asap chunk is built before any critique pass: `node
scripts/plan/support.mjs asap` prints `ready` → skip to 3a.
On `none`, read the metadata header of `plan/CRITIQUE.md`
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
- **3a'. Queue lanes?** No ready chunk: `node
  scripts/plan/lanes.mjs march queue`, then as Step 0.5 (a
  lane returning `end-tick` ends the tick; `stock` or every
  lane `continue` falls through to 3b). The first is the
  stock **refill** lane (`## Generators` in
  `plan/bearings.md`; `concepts/generators.md`): `node
  scripts/plan/refill.mjs --write` runs each listed
  generator, which files AUDIT rows while its own are under
  target and weekly cap. A `broke` line goes in the tick's
  summary and never stops it; `filed N` is committed (`plan:
  refill — <generators>`, gate first) before 3b.
- **3b. Expand due?** Posture `bold` (see
  `plan/bearings.md`) AND (≥20 commits or >7 days since
  `plan/CANDIDATES.md` last pass) AND at least one
  signal (AUDIT/CRITIQUE pending rows, sibling lessons growth,
  Claude Code release drift) → `skills/expand.md` (`bold` run:
  the shorter window, `/expand bold`; `careful` run: skip).
- **3c. Else** → `skills/iterate.md` (`/iterate careful` on a
  `careful` run).

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
node scripts/plan/promote.mjs sweep  # Step 0: veto or release auto-promoted Held specs
node scripts/plan/locks.mjs sweep    # Step 0: locks past max_age relax or ask once
node scripts/plan/lanes.mjs march pre|queue  # project lanes (skills/march.lanes.md)
node scripts/plan/motion.mjs react    # Step 0.5: an open motion stall under stall_action promote
node scripts/plan/refill.mjs --write # 3a': the stock refill lane runs bearings' generators
gh issue list ...                    # triage gate
node scripts/plan/support.mjs continue|asap  # Step 1 keeps going; Step 2 waits behind Asap
node scripts/plan/support.mjs sla    # Step 1.5: a queued issue past sla_hours is plotted Asap
node scripts/verify.mjs              # the gate every child runs
```
