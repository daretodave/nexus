# Customization: the identity layer and the footgun ladder

> `plan/` only shrinks: chunks leave as archive lines and
> finished specs are deleted. What should outlive them (the
> promises, the decisions, the words, the traps) needs a home
> that grows slowly and is read on purpose. `identity/` is that
> home, and its footgun list is a ladder: a trap seen once
> becomes a rule, a trap seen twice becomes automation. Learned
> from a mature adopter that has run this layer across hundreds
> of chunks and many contributors. It is an alternative to the
> [lessons layer](./lessons-layer.md): adopt one or the other.

---

## When to adopt

- More than one person (or loop) builds the project, so
  "remember to…" stops working and rules have to become
  checks.
- Specs close often enough that their lasting parts need
  somewhere to go besides `plan/bearings.md`.
- You use pending files and settle (`plan/pending/`,
  `scripts/plan/settle.mjs`): settle numbers decisions and runs
  the ladder for you. Its defaults already point at
  `identity/footguns.md` and `identity/decisions/`.

Pick the [lessons layer](./lessons-layer.md) instead for a
single loop whose memory is mostly taste corrections read by
domain; the ladder is for traps that should become automation.

## What you copy

From `nexus/templates/identity/` to the repo's `identity/`:

| File | Holds |
|---|---|
| `README.md` | The rules for every file below. |
| `principles.md` | `P#` promises, ≤ 40 active, retired only by decision. |
| `decisions/README.md` | The `D#` format; settle writes `decisions/<year>.md`. |
| `glossary.md` | The project's words. |
| `footguns.md` | `## Open`, `## Watch`, `## Guarded`: one line per trap. |

Then, once per repo:

```bash
printf 'identity/footguns.md merge=union\n' >> .gitattributes
```

```powershell
Add-Content .gitattributes "identity/footguns.md merge=union"
```

and point the rule book at it: `agents.md`'s "Where to look"
gains `identity/` (principles are hard constraints; the Open
footguns are read before building).

## How it runs

- **A branch never edits `identity/` directly** for decisions
  and footguns: its pending file carries `## Decisions`
  (`D?<slug>`), `footguns: <slug>, …` (sightings) and
  `## Footguns` (new lines). Settle numbers the decisions,
  bumps `seen` and `last`, appends new lines to their section,
  and refuses a change the footgun lint would refuse
  (`scripts/plan/footguns.mjs`).
- **The ladder.** An open line reaching 2× makes settle open
  the ladder spec (`99-guard-the-traps.md` by default;
  `plan/settle.json` `ladder` to change it), add an `automate
  <slug>` chunk with an Asap lane entry, and remove the spec
  when its last chunk closes, so the plan still ends empty.
- **The budget.** Past 30 open lines settle moves the oldest
  single sightings to Watch; Watch drops lines unseen for 120
  days, then the oldest past 60. No judgment, no meeting.
- **A spec's close** promotes its lasting rules to principles
  and its choices to decisions before the file is deleted
  (`/next`'s absorb step).

## Adoption checklist

- [ ] `identity/` copied, `<PROJECT>` replaced.
- [ ] `.gitattributes` has `identity/footguns.md merge=union`.
- [ ] `agents.md` points at `identity/`; `/next`, `/plot` and
      `/bug` read principles and Open footguns at orient (the
      templates do).
- [ ] `node scripts/plan/settle.mjs` runs clean on a pending
      file carrying a footgun sighting.

## See also

- [`../concepts/plan-shape.md`](../concepts/plan-shape.md):
  pending files, settle, and where a finished spec goes.
- [`lessons-layer.md`](./lessons-layer.md): the alternative.
- [`sessions.md`](./sessions.md): the worktree trap this
  layer's first guarded line usually is.
