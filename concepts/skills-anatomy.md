# Concepts: skill anatomy

> How to read a skill file. How to write your own. The methodology
> stands or falls on whether your skill files are decisive
> enough to drive autonomous shipping.

---

## The two-file pattern

Every verb has two files:

```
.claude/commands/<verb>.md       # terse pointer (~20 lines)
skills/<verb>.md                 # source of truth (~300–500 lines)
```

The slash command file is what Claude Code's user types as
`/<verb>`. It contains the bare minimum to invoke the skill:
description, argument handling, a one-line pointer to the skill
file, and the literal `Argument: $ARGUMENTS` line at the bottom
that Claude Code substitutes.

The skill file is what the agent reads to know what to do. The
skill file is the **contract**. The slash command is the
**doorway**.

Why split:

- Slash commands stay short — Claude Code reads them every
  invocation, and the user might glance at them.
- Skill files are heavy — opinionated procedure with hard
  rules and failure modes. The agent reads them once per
  invocation and follows.
- Tools that don't have slash-command infrastructure (Cursor,
  Aider, the Anthropic SDK directly) can read the skill file.

---

## Slash command template

```markdown
---
description: <one-line pitch — shows up in command-picker UIs>
---

You are invoked under the `<verb>` skill — <one-sentence what>.
Read `skills/<verb>.md` end to end before touching anything else;
that file is the single source of truth for this command. The
user's standing instruction is **"more get-it-done, less ask me
questions."** Decide instead of asking; document the call in the
commit body.

Argument handling:
- No argument → <default behavior>.
- `<arg pattern>` → <variant behavior>.
- `<arg pattern>` → <variant behavior>.

Procedure: §<N> of `skills/<verb>.md`. Hard rules: §<N>. Failure
modes: §<N>. Everything else — <decisions the skill autonomously
handles> — **resolve and ship**.

When invoked under `/loop` or `/march`, the user is not present
at this tick. After commit + push, return cleanly.

Argument: $ARGUMENTS
```

Every slash command follows this skeleton. The variations are:

- The description line.
- The argument-handling list.
- The list of "things the skill autonomously handles."
- For non-shipping skills (`oversight`, `plan-a-phase`,
  `critique`, `triage`): replace the autonomous-loop guidance
  with the skill's specific contract (e.g., "this is the only
  skill that asks the user anything").

---

## Skill file template

The canonical skill file has these sections, in this order. Skip
sections that don't apply (e.g., a planning-only skill skips
"Page-family shape") but don't reorder.

### Header / blockquote

A 2–4 line blockquote at the top stating the persona:
"Full autonomy, no review checkpoint" for shipping skills, or
the specific contract for non-shipping ones (e.g., "Thinking
pass" for plan-a-phase, "User-in-the-loop" for oversight).

### §1. Purpose

Why this verb exists. Two paragraphs max. Distinguish it from
adjacent verbs.

### §2. Invocation

The argument modes. The most common invocation patterns
(including under `/loop` or `/march`).

### §3. Autonomy contract (for shipping skills)

The "decide vs. ask" line. For each common ambiguity class:
"X happens → decide Y. Document the call." This is the section
that protects the skill from drifting into "ask the user" mode.

### §4. Delegation (where applicable)

When and how to spawn sub-agents. Aggressive delegation is
cheaper than re-implementing.

### §5. The procedure

Step-by-step. Each step is a numbered subsection (Step 0 — Sync,
Step 1 — Pick the work, etc.). Steps include literal bash
commands the agent runs.

For shipping skills, the canonical 12 steps:
- Step 0: Re-sync (`git pull --ff-only`)
- Step 1: Pick the work
- Step 2: Read the brief / target
- Step 3: Read the design + canonical sibling (where applicable)
- Step 4: Build (the actual work)
- Step 5: Wire (routes, exports, etc.)
- Step 6: SEO / metadata (where applicable)
- Step 7: Tests
- Step 8: Cross-link retrofit (where applicable)
- Step 9: Verify gate (`pnpm verify`)
- Step 10: Commit + push (atomic)
- Step 11: Tick the DoD (state file update)
- Step 12: Confirm deploy (`pnpm deploy:check`)
- Step 13: Done

Non-shipping skills have shorter procedures (5–8 steps) that
end at "commit + push + done" without all the build/SEO/test
steps.

### §6. Hard rules

The non-negotiables. 6–10 bullets. These mirror `agents.md`
Standing Rules but may add skill-specific rules. Sample:

```
1. No `Co-Authored-By:` in commits. No emojis.
2. No `--no-verify`, no force-push.
3. Tests alongside code — never "add tests later".
4. Small focused components in folders.
5. Commit + push atomic.
6. The verify gate is non-negotiable.
```

Skill-specific hard rules go after the universals. E.g., for
ship-data: "Schema is law — never write JSON that doesn't
validate."

### §7. Cross-cutting concerns (where applicable)

Cross-link retrofits, schema migration policy, brief generation
when missing. Anything that's procedure-adjacent.

### §8. Failure modes

The **only** conditions that warrant stopping. 5–8 bullets.
Sample shape:

```
1. `pnpm verify` fails ≥3 times on the same root cause.
2. `pnpm deploy:check` fails ≥3 times on same root cause.
3. `NETLIFY_AUTH_TOKEN` missing or rejected.
4. A required dependency requires a paid service.
5. `git pull` produces divergence.
6. Phase scope is genuinely ambiguous after reading every input.
```

Everything not in this list: **decide, ship, document.**

This section is what gives the loop its discipline. If "the user
might want it different" appears as a failure mode, the loop is
useless. Stick to objective failures (gate failures, missing
secrets, divergence, ambiguity that's actually in the source).

### §9. Quick reference

A bash-style block listing every file the skill reads, every
file it writes, every command it runs. The agent uses this as
a copy-paste cheat sheet.

---

## What good skill writing looks like

### Be decisive in language.

> ❌ "If the design is missing, you can either ship without it
> or generate one yourself."

> ✓ "Missing design → generate the brief from sibling +
> bearings. Commit separately. Proceed."

The first form requires the agent to deliberate. The second
prescribes. Skills are recipes, not menus.

### Use concrete file paths.

> ❌ "Read the relevant phase brief."

> ✓ "Read `plan/phases/phase_<N>_<topic>.md`. If absent,
> generate per `skills/plan-a-phase.md` §5."

The first form requires inference. The second is unambiguous.

### Use bash where it helps.

> ❌ "Push the branch."

> ✓ "`git push origin main`"

Unambiguous; the agent copies the command.

### Document the *why* of decisions, briefly.

> ✓ "Top-N count: 8 (matches phase 4 — keeps cards visually
> balanced)."

The why protects against future re-litigation.

### Number everything that has order.

Steps are numbered. Sub-steps are numbered. Failure modes are
numbered. Cross-references say "see §7 of this skill" or "see
`skills/X.md` §3." This makes the skills navigable when a
section needs updating.

---

## What bad skill writing looks like

### Politeness padding.

> ❌ "It might be worth considering whether the design export
> matches the URL contract; if not, you may want to think
> about which to follow."

> ✓ "If the design contradicts the URL contract, the URL
> contract wins. Note the conflict in commit Decisions."

### Imprecise verbs.

> ❌ "Handle the audit findings."

> ✓ "Walk every finding in `plan/AUDIT.md` Pending. For each:
> score by impact × ease. Pick the top one. Ship a fix."

### Multi-purpose paragraphs.

A skill section that talks about three different concerns is a
section that the agent will skim. One concern per section. If
you have three, write three sections.

### Hidden dependencies.

> ❌ (not mentioning a sub-agent that the procedure assumes)

> ✓ "Step 3: spawn `scout` for any external research."

If a step requires a sub-agent, name it. If a step requires an
env var, name it. Hidden dependencies cause the loop to fail
in non-obvious ways.

---

## Common skill anti-patterns

### Asking the user during a shipping skill.

The autonomy contract says decide. If you find yourself writing
"if X, ask the user," the right move is:

- Decide X yourself per a `bearings.md` standing decision.
- If the decision is genuinely uncertain, write to
  `plan/AUDIT.md` as `[needs-user-call]` and **continue with the
  most-defensible choice**. The user picks up `[needs-user-call]`
  rows in `/oversight`.

### Soft failure modes.

> ❌ "If verify fails several times, consider stopping."

> ✓ "If `pnpm verify` fails ≥3 times on the same root cause,
> stop per §10. Cite the check that failed and what you'd try
> next."

Concrete numbers, concrete actions.

### Procedure that grows over time.

A skill file that's 800 lines is hard to follow. If a procedure
grows past ~12 steps, look for a refactor:

- Move common steps to a shared section.
- Extract sub-agents.
- Split the skill into two if it's doing two things.

The thock + tickpedia skill files all converge on ~300–500
lines. Beyond that, the skill is doing too much.

### Embedded code that drifts.

> ❌ A skill file containing 50 lines of TypeScript that the
> code base also has, possibly diverged.

> ✓ A skill file pointing at `apps/web/src/components/article/`
> as the canonical sibling, with the actual code in the repo.

Skills describe procedure; they don't carry production code.

---

## Maintaining skills over time

Skills evolve as the project does. When you find a class of
problem the skill didn't anticipate:

1. Patch the skill file.
2. Note the patch in the next commit body.
3. If the patch is project-specific, commit to that project's
   `skills/`. If it's general, propagate to nexus templates.

Versioning is by commit history. There's no `skills-v2.md`; the
file gets edited in place. Old behavior is captured in commits.

For lessons that don't belong in a skill file yet — a
recurring correction, a taste call, a "the loop should
remember this" note that hasn't earned a procedure step —
see [`../customization/lessons-layer.md`](../customization/lessons-layer.md).
Its promotion path (lesson → reflex) and drain path (reflex →
skill procedure edit) is the on-ramp that ends here.

When a skill becomes stable (no patches in N weeks), consider
it locked and resist the urge to "improve" it. Stable skills
are the loop's foundation; churn there is more expensive than
adding new skills.

---

## When to write a new skill

A new skill is justified when:

- There's a verb the existing skills don't cover.
- The verb is invoked at least once a week (otherwise just
  follow procedure manually).
- The verb has clear inputs, outputs, and failure modes.
- Following the verb takes ≥15 minutes (otherwise it's not
  worth the meta-overhead).

Examples of skills that earn their place:

- `ship-a-phase` — single biggest verb in any project.
- `iterate` — non-trivial because the audit dimensions are
  numerous.
- `triage` — the issue-routing classification is genuinely
  recurring.

Examples of "skills" that probably don't earn their place:

- `format-code` — just run `pnpm format`. No procedure.
- `commit-staged-changes` — too small.
- `update-dependency` — varies too much per dep.

When in doubt: don't add a skill. The seven (or eight) in the
nexus templates cover most projects. Add a new one only when
you've manually performed the verb 3+ times and felt the friction.

---

## See also

- [`architecture.md`](./architecture.md) — how skills compose
  with the dispatcher, gates, and external signals.
- [`../templates/skills/`](../templates/skills/) — every
  skill in template form.
