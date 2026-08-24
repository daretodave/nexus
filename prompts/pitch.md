# Pitch-to-adopted — agent prompt

> Clone nexus next to your repo, then paste the short version
> from README.md's
> [TL;DR — I have a pitch, no spec yet](../README.md#tldr--i-have-a-pitch-no-spec-yet)
> into your agent — it points here, with your pitch inline.
> This file is the full instruction set the agent then
> follows; read it yourself first if you want to know exactly
> what you're authorizing.
>
> Use this if you have a working name and a one-paragraph
> pitch, but no `spec.md` yet. If you already have a `spec.md`,
> use [`adopt.md`](./adopt.md) instead.

---

## The prompt

```
Run nexus's pitch-to-adopted flow.

nexus is at ../nexus (or ./.nexus if submoduled). The plan
is: pre-spec interview → write spec.md → adopt nexus.

Phase A — pre-spec interview (30-45 minutes)

Read ../nexus/playbooks/pre-spec.md end-to-end. Read
../nexus/concepts/asking-well.md for question shape. Then
run the three question batches (foundation, spine, surface)
per the playbook. AskUserQuestion is allowed during this
phase — it's pre-spec, not in-skill. Once spec.md is
committed at the end of Phase A, that rule reverts.

Here's my pitch in my own words:

  <ONE-PARAGRAPH PITCH — what the product is, who it's for,
  what makes it interesting. Don't polish.>

Phase A deliverables (committed before Phase B starts):
  - spec.md (at least one page, persona named, v1 scope)
  - plan/bearings.md stub (Surface, Auth, Stack, hosting,
    voice, hard rules)
  - (optional) claude-design.prompt.md if Batch 3 Q2 landed
    on "commission a visual system" (see
    ../nexus/customization/visual-system.md)
  - (optional) NEXUS_LESSONS.md scratch — capture nexus gaps
    you hit during the interview, for a later /lessons-pr
    pass back to the nexus repo

Phase B — adoption

Once Phase A's commits land, switch to the standard adoption
prompt: read and follow ../nexus/prompts/adopt.md exactly.
AskUserQuestion is no longer allowed (per nexus's standing
rules — only /oversight may ask). Decide and document; don't
ask.

End-state:
  - chore: adopt nexus methodology commit landed and pushed
  - Day 1 checklist in new-project.md passes
  - Ready for /ship-a-phase as the first conscious step.
  - Do NOT invoke /ship-a-phase yourself; let the user do
    that.

Standing rules:
  - Commit and push as a single atomic act per logical chunk.
  - No Co-Authored-By trailers, no emojis.
  - No --no-verify, no force-push.

Estimated time: 60-90 minutes total, agent-paced for Phase B
(Phase A is genuinely interactive, per pre-spec.md's own
30-45 minute estimate; Phase B's 2-3 hour playbook estimate
is the human-paced figure — see new-project.md's note).
Begin with Phase A.
```

Pitch quality matters. If you can't describe the product in
one paragraph in plain language, come back when you can. The
agent will not invent product direction for you.

---

## See also

- [`README.md`](../README.md) — the short paste that points
  here.
- [`adopt.md`](./adopt.md) — the Phase B prompt this one
  hands off to.
- [`playbooks/pre-spec.md`](../playbooks/pre-spec.md) — what
  Phase A tells the agent to follow.
