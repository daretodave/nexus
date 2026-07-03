# Customization: lessons layer

> The kit's default lessons story is one scratch file,
> `NEXUS_LESSONS.md`, drained once by `/lessons-pr`. That's
> enough for feeding lessons back to nexus itself, but it's
> too thin for a project's *own* ongoing memory — one file
> means every skill either reads all of it (expensive, and it
> grows unbounded) or none of it (the lesson is dead weight).
> This doc adds a two-tier layer — **reflexes** (tiny, always
> read) + **lessons** (large, domain-keyed, read by offset) —
> that scales past kintilla's 333-lesson production corpus
> without either failure mode. Provenance: kintilla's
> `reflexes.md` / `lessons.md` split, the same credit pattern
> [`branding.md`](./branding.md) gives thock/tickpedia.

---

## When to adopt

You want this when a project has run its loop long enough to
accumulate real lessons (post-incident learnings, "the gate
should have caught this," recurring taste corrections) and
the single-scratch-file story is either unbounded growth or
lessons nobody re-reads.

You don't need it on day one. `NEXUS_LESSONS.md` is still the
right shape for the *inbound-to-nexus* channel
([`../skills/lessons-pr.md`](../skills/lessons-pr.md)) — this
layer is for a project's own accumulated memory, a separate
concern.

## The two tiers

| Tier | File | Size | Read by |
|---|---|---|---|
| Reflexes | `plan/reflexes.md` | ≤50 lines, hard | every skill's Step 0, in full |
| Lessons | `plan/lessons.md` | unbounded corpus | one domain, by offset |

**Reflexes** are the always-read core — behavior that changed
weekly, promoted out of the lessons corpus because reading it
once a week (buried in a domain section) isn't often enough.
Every skill's Step 0 loads this file whole. Keeping it ≤50
lines is what makes that affordable forever; the cap is a
hard invariant, not a suggestion.

**Lessons** are the domain-keyed corpus — everything else.
Each domain gets an `<!-- @domain:<name> -->` anchor and its
own `##` heading; a skill working in that domain greps for
its anchor and reads from that offset, not the whole file.
This is what lets the corpus grow to hundreds of entries
without every skill invocation paying for all of them.

Seeded templates:
[`../templates/plan/reflexes.md`](../templates/plan/reflexes.md),
[`../templates/plan/lessons.md`](../templates/plan/lessons.md).

## The caps

- **Reflexes: ≤50 lines, total.** Hard. When the file would
  cross 50 lines, something already in it has to drain out
  (see below) before a new reflex can join.
- **Lessons: ≤500 bytes per bullet.** Hard, per-entry. A
  lesson is one line plus a source reference — not a
  postmortem. If the real lesson needs more room, the ≤500
  bytes is the summary and the postmortem lives elsewhere
  (an issue, a commit body) with a link.

Both caps exist for the same reason the reflexes tier exists
at all: an unbounded "just add more context" file stops
getting read. The cap forces triage instead of accumulation.

## The promotion path — lesson → reflex

A lesson gets promoted from `lessons.md` to `reflexes.md`
when it's **changed behavior on a roughly weekly cadence** —
i.e., a skill would have gotten it wrong again this week
without the reminder. That's the bar: not "important," not
"true forever," but *frequently load-bearing right now*.

Promotion is a small edit: copy the bullet into
`reflexes.md`, add a "Promotion log" line pointing back at
the source domain + entry number, leave the original lesson
in place (the corpus is append-only history; the reflex is a
pointer forward, not a move).

## The drain path — reflex → skill procedure

A reflex that's been stable for a while (no new violations,
nobody would still get it wrong without the reminder) either:

- **Drains into a skill file.** If the reflex is really a
  missing procedure step, edit the skill directly
  ([`../concepts/skills-anatomy.md`](../concepts/skills-anatomy.md)
  "Maintaining skills over time") and remove the reflex — the
  procedure now enforces it structurally, the reminder is
  redundant.
- **Retires with a log line.** If the reflex was situational
  (a one-time gotcha, not a recurring class), it can just be
  removed with a note in the "Drain log," no skill edit
  needed.

Either way, a reflex that never drains and never gets
violated again is a smell — it's occupying scarce always-read
space for something that turned out to be a one-off.

## Staged hardening for adopter lint

This phase ships no lint leg for lessons files in nexus's own
gate — `scripts/verify.mjs` is hermetic and doesn't reach
into adopter repos. If your project wants the caps enforced
mechanically, write a small `scripts/check.mjs` in your own
repo (kintilla's pattern): one check per invariant (reflexes
line count, lessons bullet byte count, anchor uniqueness),
each gated by an env flag like `REFLEXES_CAP_IS_ERROR`. Start
every new check as a **warning** (prints, exits 0) so the
corpus isn't blocked mid-migration; flip the flag to make it
a hard error once the corpus is actually within cap. The flip
commit is the natural checkpoint — it's the moment the
project can say the invariant holds, not just that it's
aspirational.

This is the same staged-rollout shape
[`verify-gate.md`](./verify-gate.md) uses for adding
aggressive checks to an existing gate without a big-bang
cleanup.

## Adopting the capability — checklist

1. Copy [`../templates/plan/reflexes.md`](../templates/plan/reflexes.md)
   and [`../templates/plan/lessons.md`](../templates/plan/lessons.md)
   into `<repo>/plan/`.
2. Point every skill's Step 0 at `plan/reflexes.md` (read in
   full) — a one-line addition to each skill file's Step 0.
3. When `NEXUS_LESSONS.md` entries land via `/lessons-pr`'s
   sibling-repo flow, or when a lesson surfaces locally
   (a `/critique` or `/iterate` finding, a postmortem), file
   it under the right `@domain:` anchor in `lessons.md`
   instead of ad-hoc doc edits.
4. Promote / drain per the paths above as the corpus grows.
5. Optional: add `scripts/check.mjs` per "Staged hardening"
   once you want the caps enforced instead of trusted.

## Failure modes

- **`reflexes.md` would cross 50 lines.** Don't add the new
  reflex yet — drain an existing one first (see above), then
  add.
- **A lesson doesn't fit ≤500 bytes.** Summarize harder; link
  out to the full context instead of inlining it.
- **A domain anchor gets renamed.** Treat as breaking — every
  skill that greps for the old name silently stops finding
  its lessons. Update every referencing skill in the same
  commit.

## See also

- [`../templates/plan/reflexes.md`](../templates/plan/reflexes.md),
  [`../templates/plan/lessons.md`](../templates/plan/lessons.md)
  — the seeded templates.
- [`../skills/lessons-pr.md`](../skills/lessons-pr.md) — the
  inbound-to-nexus channel this layer is downstream of.
- [`../concepts/skills-anatomy.md`](../concepts/skills-anatomy.md)
  — "Maintaining skills over time," the drain path's target.
- [`../playbooks/new-project.md`](../playbooks/new-project.md)
  — Day-1 checklist pointer.
- [`./verify-gate.md`](./verify-gate.md) — the staged-hardening
  pattern this doc borrows for adopter lint.
