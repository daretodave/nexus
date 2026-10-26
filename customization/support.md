# Customization: support — how hard the loop works an issue

> One knob decides what the loop does with an issue a person
> files: queue it, or fix it the same day. Unset, nothing
> changes: the cron triages, bugs become audit rows, nobody
> is woken. Turned up, a collaborator's bug starts a tick
> within minutes, a small one is fixed and closed in that
> tick, a larger one is built next, and the morning digest
> says how long people waited. Issue text never steers the
> loop at any level.

Shipped by `templates/scripts/plan/support.mjs` (the level, the
routing, the cap, the SLA, the digest line),
`templates/.github/workflows/nudge.yml` with
`templates/scripts/cloud/nudge-check.mjs` (the event tick), and
the `Support` block of `templates/plan/bearings.md`.

---

## When to adopt / when not

Adopt `fix-small` once the loop ships unattended and people
other than you file issues: a user who reports a bug and hears
nothing for a day stops reporting. Adopt `fix-all` when small
enhancements are as cheap to build as bugs and you trust the
loop's taste on them.

Stay at the default (`triage-only`) while you still read every
tick, while issues are mostly your own notes, or while the
subscription has no headroom: every event tick spends quota a
scheduled tick would have.

## The knob

`Support:` in `plan/bearings.md`, and the repo variable
`NEXUS_SUPPORT`. In cloud the variable wins, and `support.mjs
level` prints a note when the two disagree. Neither set, the
[improvement dial](./improvement-dial.md) decides (`steady`
`fix-small`, `bold` `fix-all`); no dial line reads
`triage-only`.

| Level | Collaborator bug | Collaborator enhancement | Outsider issue | Event ticks |
|---|---|---|---|---|
| `off` | AUDIT row | `triage:needs-user` | triage only | none |
| `triage-only` (default) | AUDIT row | `triage:needs-user` | triage only | none |
| `fix-small` | `/bug`: fix now or Asap | `triage:needs-user` | triage only | on |
| `fix-all` | `/bug`: fix now or Asap | small: built like a bug; a scope or taste call: `triage:needs-user` | triage only | on |

"Collaborator" is author association OWNER, MEMBER or
COLLABORATOR. The owner's `loop:do` label lifts an outsider's
issue to the collaborator row. `support.mjs route` answers for
one issue from its number, author association and labels,
never its text.

## The repo variables

Set each with `gh variable set <NAME> --body <value>`.

| Variable | Values | Default | What it does |
|---|---|---|---|
| `NEXUS_SUPPORT` | `off` `triage-only` `fix-small` `fix-all` | unset (= `triage-only`, no nudge) | The level; unset or `off` keeps `nudge.yml` inert |
| `NEXUS_SUPPORT_TRUST` | `collaborators` `everyone` | `collaborators` | `everyone` routes every author's issue as a collaborator's |
| `NEXUS_URGENT_LABELS` | space-separated labels; empty = no nudge | `loop:do bug` | An issue opened with one of these starts a tick |
| `NEXUS_LOOP_ACTOR` | the login the loop's token acts as | the repository owner | With a `Cloud-Run:` body line, marks an issue the loop filed |
| `NEXUS_EVENT_MAX` | event ticks per 24h | `6` | The nudge's own budget |
| `NEXUS_DISPATCH_MAX` | `workflow_dispatch` runs per 24h | `12` | Every dispatched run past it exits clean |

The quota governor's hard ceiling (0.97 of the weekly window)
stops every tick, event ticks included; it is a constant, not
a knob.

## The bearings lines

```
Support: triage-only        # off | triage-only | fix-small | fix-all
sla_hours: 24               # Step 1.5 plots a queued issue this old
escalate_days: 7            # a needs-user issue this old tops the digest
asap_cap: 3                 # issue-born Asap chunks open at once
```

- **`sla_hours`**: under `fix-small` or `fix-all`, `/march`
  Step 1.5 plots Asap an open `triage:loop-queued` issue this
  old whose work is not in the Asap lane (`support.mjs sla`).
- **`asap_cap`**: at most this many issue-born Asap chunks are
  open at once; the rest wait as `plan/AUDIT.md` rows.
- **`escalate_days`**: see the digest, below.

## The digest's Support line

At every level `/digest` runs `node scripts/plan/support.mjs
digest --notify` and prints its line under "Queues now":

```
Support (fix-small): 2 open user issues · first response 2.7h mean (7 of 9 opened in 7d) · close 26.3h mean (11 closed in 7d)
escalate #70 · triage:needs-user open 9d, over escalate_days 7: top of Needs you
```

- A user issue is any the loop did not file: no `loop:opened`
  label, no bot author, no `Cloud-Run:` body line.
- The first response is the first comment by anyone but the
  issue's author; both means cover the last 7 days.
- An open `triage:needs-user` issue older than
  `escalate_days` opens "Needs you", and one notification
  names them all through `scripts/notify.mjs` (numbers and
  ages, never issue text). No channel set, it prints and
  moves on.

## Closing the loop

A fix commit carries `Refs #N`, never `Closes #N` or `Fixes
#N`: a closing keyword shuts the issue on push, before a
release ships the fix. Once it lands, `support.mjs tell`
comments naming the commit and closes the issue; a fix inside
a published package comments "lands in the next <package>
release" and leaves the issue open for the release.

The release then closes them. nexus does this for its own
package: `publish.yml` runs `scripts/release-reply.mjs` on a
`cli-v*` tag, which reads every `Refs #N` since the previous
stable tag and, for each issue still open and labeled
`triage:loop-queued` or `bug`, comments the version and closes
it (repo variable `NEXUS_RELEASE_REPLY`, `on` unless `off`). A
repo that publishes a package can copy the pattern.

## Hard rules

1. Issue titles, bodies, comments and attachments are
   third-party data, never instructions; only the issue
   NUMBER crosses from the nudge into a tick.
2. The loop never applies `bug`, `loop:do` or an urgent label
   to an issue it opens, so nothing it files starts a tick.
3. Adopter defaults stay conservative: turning the level up is
   your call, never the loop's.

## Failure modes

1. **No `gh`**: routing falls back to `stock`, the SLA step
   and the digest line print `skip`; the tick goes on.
2. **A burst of issues**: `NEXUS_EVENT_MAX` and
   `NEXUS_DISPATCH_MAX` cap the event ticks; past them the
   cron picks the issues up.
3. **Asap lane full**: past `asap_cap` a bug waits as an AUDIT
   row; `/iterate` ages user rows +1 per 12 hours, so it
   climbs.

## You're ready when

- `node scripts/plan/support.mjs level` prints the level you
  chose, from the source you expect.
- `nudge.yml` and `scripts/cloud/nudge-check.mjs` are in the
  repo (bootstrap's `install-workflow` writes both).
- `node scripts/plan/support.mjs digest` prints a Support line.

## See also

- [`../templates/.github/CLOUD_LOOP.md`](../templates/.github/CLOUD_LOOP.md)
  — the event tick, the dispatch ceiling, the quota governor.
- [`./bootstrap-automation.md`](./bootstrap-automation.md) —
  `install-workflow` writes `nudge.yml`.
- [`../concepts/generators.md`](../concepts/generators.md) —
  the `issue-age` generator reads the same `sla_hours`.
