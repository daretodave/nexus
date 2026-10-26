# Customization: the improvement dial — how hard the loop pushes beyond the plan

> One line sets how much the loop does that you did not plan:
> nothing, a little, a steady amount, or as much as it can
> justify. Every expansion knob takes its default from that
> line, and any knob can still be set on its own. An owner who
> wants "a bit more" or "leave it alone" turns one dial
> instead of hunting for eight lines.

Shipped by `templates/scripts/plan/improve.mjs` (the resolver)
and the `Improve:` line of `templates/plan/bearings.md`, under
`## Plan expansion posture`.

---

## When to turn it / when not

Turn it up once the loop ships its planned work unattended and
you want it to find more: issues fixed the day they land,
candidates that promote themselves, generators that refill an
empty queue, a look at how the wider tooling moves. Turn it
down while you still read every tick, while the subscription
has no headroom, or while the plan is a commitment you want
kept exactly.

Leave it alone if one knob is all you want to change: set that
knob's own line and the dial keeps the rest.

## The line

```
- Improve: steady          # off | gentle | steady | bold
```

In `plan/bearings.md`, under `## Plan expansion posture`. No
line reads `gentle`, the loop as it ran before the dial.

| Position | What the loop does | Who runs it |
|---|---|---|
| `off` | Builds what you planned and nothing else. | A plan that must not grow. |
| `gentle` | Today's behaviour: issues are triaged, candidates wait for you, nothing refills itself. | A repo upgraded from v1 (`nexus upgrade` writes it), so the loop runs unchanged. |
| `steady` | Fixes small bugs, promotes aged candidates behind a veto window, runs the kit's generators, audits the loop, reads the field monthly. | A new adoption (`templates/plan/bearings.md` ships it). |
| `bold` | Everything at full stretch: small enhancements too, the project's own generators, every-iterate UI walks, weekly field research, an eager cadence. | The kit itself. |

## The table

What each position sets, knob by knob. A knob's own line (or a
set repo variable) wins over its column.

| Knob | `off` | `gentle` | `steady` | `bold` | Its own line |
|---|---|---|---|---|---|
| Support | `off` | `triage-only` | `fix-small` | `fix-all` | `Support:` (and `NEXUS_SUPPORT`; [support](./support.md)) |
| Promote | `owner` | `owner` | `aged` | `aged` | `Promote:` |
| Generators | none | none | generic | generic + project | a list under `## Generators` |
| stall_action | `off` | `alert` | `alert` | `promote` | `stall_action:` |
| loop (`/iterate` dimension I) | `off` | `off` | `on` | `on` | `loop:` |
| UI walk cadence | none | none | `critique` | `both` | `UI cadence:`, or `UI: none` |
| Research | `off` | `off` | `monthly` | `weekly` | `Research:` |
| Cadence | `calm` | `steady` | `steady` | `eager` | `NEXUS_CADENCE` |

- **Generators.** `generic` is the kit's three (`issue-age`,
  `stale-candidate`, `motion`, at the lines the bearings
  template shows in its comment); `project` adds every other
  `scripts/generators/<name>.mjs` the repo carries, at `weekly
  · target 2 · cap 2/wk`. The field-research generator is
  never among them: its own Research knob gates it
  ([generators](../concepts/generators.md)).
- **UI.** The dial sets when the walk runs, never where. With
  no `UI: url|dev` target there is nothing to open, whatever
  the cadence.
- **Research.** It also needs a `Research topics:` line; with
  none, no research runs at any position.
- **Cadence.** Lives in the repo variable. A cloud step takes
  the dial's value only when the variable is unset and the
  line says something other than `gentle`.

## Overrides

A knob line of its own overrides the dial for that knob only:
`Support:`, `Promote:`, `stall_action:`, `loop:`, `UI
cadence:` (or `UI: none`), `Research:`, and a `## Generators`
section holding a list line (`- (none)` included; prose or a
commented example defers to the dial).

A line that repeats the dial's value still pins the knob:
turn the dial later and that knob stays. Delete a line to hand
its knob back to the dial.

The bearings template ships `Improve: steady` with a few
conservative overrides kept (`Support: triage-only`,
`## Generators` at `- (none)`, `UI: none`, `stall_action:
alert`): a new adoption reads the field and audits its loop,
but fixes no issue on its own, refills nothing and browses
nothing until you delete those lines or set them higher.

## Repo variables

`NEXUS_SUPPORT` and `NEXUS_CADENCE` stay the cloud's source of
truth for the knobs that live there. A set variable is an
override (`from: var` in `--json`), and one that disagrees with
the dial or a bearings line is a warning, never a failure: the
variable wins in cloud.

## Reading the knobs

Skills and scripts read every knob through the resolver, never
by grepping bearings:

```bash
node scripts/plan/improve.mjs              # the dial, then each knob: value (dial|override)
node scripts/plan/improve.mjs --json       # { improve, knobs, warnings }
node scripts/plan/improve.mjs --knob Support
node scripts/plan/improve.mjs --line       # /digest's pulse line: the dial and any overrides
node scripts/plan/improve.mjs --gh         # read the repo variables too (gh, read only)
```

The `/digest` pulse prints the `--line` form every morning, so
the dial and every override sit in one line of the briefing.

## Where it lives

- `scripts/plan/improve.mjs` — the resolver and the table
  (`DIAL`); a knob the upgrade's registry adds has a value at
  every position or a test fails.
- `plan/bearings.md` `## Plan expansion posture` — the line
  and the overrides.
- The upgrade ([upgrade](../playbooks/upgrade.md)) writes
  `Improve: gentle` into a repo that has no line.
