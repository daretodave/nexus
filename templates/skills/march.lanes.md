# March lanes

> This project's own `/march` steps. The kit re-syncs
> `skills/march.md` and never touches this file, so a step
> that keeps your loop moving lives here, not there.

---

`skills/march.md` reads this file at two hooks, through
`node scripts/plan/lanes.mjs march <hook>`:

| Hook | Where in the tick | Yields to |
|---|---|---|
| `pre` | after Step 0 (sync, veto sweep), before triage | the Asap lane (and support rows): runs only when neither has a ready item |
| `queue` | after 3a (no ready chunk), before the next queue step | nothing: 3a already found no ready chunk |

One block per lane. `when` is prose (the agent judges it) or
`script <path>` (exit 0 runs the lane); absent, the lane
always runs. `return: end-tick` makes the lane the tick's
work; `continue` (the default) lets the tick go on.
`Lanes off: <name>, <name>` in `plan/bearings.md` turns a
lane off by name. No lane blocks here means stock dispatch.

The example below sits inside a comment, so it is no lane.
Copy it out of the comment to make it one.

<!--
## lane: weekly-snapshot
- hook: pre
- when: script scripts/lanes/snapshot-due.mjs
- run: node scripts/snapshot.mjs --write, then commit the snapshot
- return: end-tick
-->
