# Customization: project lanes — your own loop steps, safe from a re-sync

> A loop that only runs the kit's stock steps stalls when the
> stock queues run dry. The steps that keep a real project
> moving (a weekly snapshot, a content queue, an extra audit
> dimension) are the project's own, so they live in two files
> the kit never overwrites: `skills/march.lanes.md` and
> `skills/iterate.lanes.md`. `/march` and `/iterate` read them
> at fixed hooks; with no lane in them, dispatch is stock.

Not the attended fan-out of [`lanes.md`](./lanes.md) (three
sessions, one branch), and not the roadmap's Asap and Held
lanes ([`../concepts/plan-shape.md`](../concepts/plan-shape.md)):
a project lane is one step of one loop.

---

## When to adopt / when not

- **Adopt** when your loop needs a step the kit doesn't ship:
  a clock (a weekly snapshot, a newsletter), a domain queue (a
  content backlog), an extra dimension `/iterate` should audit
  (cross-links, a pillar's coverage).
- **Adopt** when you have edited `skills/march.md` or
  `skills/iterate.md` by hand: move each edit into a lane, so
  the next re-sync of the kit's skills keeps it.
- **Skip** while the stock queues keep the loop busy. An empty
  lanes file costs nothing.

## The files

| File | What it is |
|---|---|
| `skills/march.lanes.md` | `/march`'s lanes, at the `pre` and `queue` hooks. |
| `skills/iterate.lanes.md` | `/iterate`'s lanes, at the `dimensions` hook. |
| `scripts/plan/lanes.mjs` | Which lanes run at a hook this tick; `check` lints both files; `sync` re-syncs the kit's skills and keeps both files. |
| `scripts/plan/refill.mjs` | The stock `refill` lane: runs the generators `plan/bearings.md` lists (`scripts/generators/`). |

Copy all three from `nexus/templates/`. The kit ships each
lanes file with one example lane, inside an HTML comment so it
is no lane.

## The lane block

```md
## lane: <name>
- hook: pre | queue | dimensions
- when: <prose> | script <path>   # exit 0 = run
- run: <skill or command>
- return: continue | end-tick
```

- `name`: lowercase words joined by hyphens, unique in the file.
- `when`: prose the agent judges each tick, or `script <path>`
  run from the repo root (exit 0 runs the lane). Absent: always.
- `run`: a skill (read and executed end-to-end, its contract
  adopted) or a command.
- `return`: `end-tick` makes the lane the tick's work (commit,
  land, return); `continue` (the default) goes on.

## The hooks

| Hook | File | Where | Yields to |
|---|---|---|---|
| `pre` | `march.lanes.md` | after Step 0 (sync, veto sweep), before triage | the Asap lane: skipped while an Asap chunk is ready |
| `queue` | `march.lanes.md` | after 3a finds no ready chunk, before the data queue | nothing: no chunk is ready |
| `dimensions` | `iterate.lanes.md` | after the stock audit dimensions | nothing: its findings compete on score |

A `dimensions` lane is lettered back from Y in file order (Y,
X, W, …), so its findings never share a letter with a stock
dimension. `node scripts/plan/lanes.mjs <march|iterate>
<hook>` prints `run`, `judge` or `skip` per lane, then `stock`
when nothing runs.

## The stock refill lane

One `queue` lane ships with the kit: `refill`, ahead of your
own. It is there only when `## Generators` in
`plan/bearings.md` lists a generator, and it runs `node
scripts/plan/refill.mjs --write`, which runs each one and
files rows while each is under its target and weekly cap
([`../concepts/generators.md`](../concepts/generators.md)). A
lane of your own named `refill` replaces it; `Lanes off:
refill` turns it off.

## Turning a lane off

`Lanes off: <name>, <name>` in `plan/bearings.md`, under
`## Plan expansion posture`, skips those lanes without
deleting them (`Lanes off: none` by default). `/oversight` is
where an owner flips it.

## A re-sync keeps your lanes

```bash
node scripts/plan/lanes.mjs sync ../nexus/templates/skills           # dry run: what would change
node scripts/plan/lanes.mjs sync ../nexus/templates/skills --write   # replace the stock skills, keep the lanes files
```

Every kit skill you already have is replaced; a lanes file you
have is kept byte for byte (a missing one is created from the
kit's); a kit skill you never adopted is listed, and copied
only with `--add`.

## Failure modes

1. **A lane edits `march.md` instead of living in the lanes
   file.** The next re-sync erases it. Move it into a lane.
2. **A bad block** (a hook the file does not have, no `run`, a
   `return` that is neither value). The script prints it as a
   `problem` and leaves that lane out; `lanes.mjs check` exits
   1 on it, so put `check` in your verify command.
3. **A `pre` lane that never yields.** It can't: the script
   skips every `pre` lane while an Asap chunk is ready.

## See also

- [`../concepts/architecture.md`](../concepts/architecture.md) — the dispatcher the hooks sit in.
- [`../playbooks/upgrade.md`](../playbooks/upgrade.md) — the re-sync step.
- [`../concepts/generators.md`](../concepts/generators.md) — the generator contract the refill lane runs.
