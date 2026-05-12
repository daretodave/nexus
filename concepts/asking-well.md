# Concepts: asking well

> A reusable convention for the rare moments where a nexus
> skill is allowed to ask the user a question. Today that's
> `/oversight` and the pre-spec interview. Tomorrow it may be
> a third — same pattern.
>
> The methodology's #1 hard rule is "skills decide, only
> `/oversight` asks." But when a skill *does* ask, the
> shape of the ask is load-bearing. Bad questions cost minutes
> per click and trash the user's trust in the loop. Good
> questions feel like a competent colleague handing you a
> short ballot with the obvious choice pre-highlighted.

This doc names the pattern that worked across two real
sessions (a Pantheon pre-spec interview and dozens of
`/oversight` ticks) so future skills can adopt it verbatim.

---

## The four rules

### 1. One to four questions per batch.

Never five. Never one with eight sub-parts. The batch is the
unit of attention; if you can't fit the decision into 1–4
clean questions, you've conflated two batches.

If the user is going to make 12 decisions, that's three
batches of four — not one wall of 12. Surface a batch,
collect answers, write what you can, surface the next batch.

### 2. Recommended option first, labeled `(Recommended)`.

Every multiple-choice question has a recommended answer. Put
it first in the option list. Append the literal string
`(Recommended)` to its label. The user clicks faster, the
agent's bias is honest and visible, and "I disagree with the
recommendation" becomes a deliberate one-click override
rather than a re-read of every option.

If you genuinely don't have a recommendation, you don't have
a question yet. Either the agent should decide outright (no
question at all) or there's prior work (read more state)
before this is decision-ready.

### 3. Descriptions name the trade-off, not just the choice.

Bad option description:

> **Postgres** — A relational database.

Good option description:

> **Postgres (managed)** — Real-time writes, multi-user
> concurrent. Cost: an external service the loop needs
> credentials for; not hermetic.

Every option is a *trade* — by picking it you accept a cost
and forgo an alternative. Spell out the cost in 1–2
sentences. The user shouldn't have to re-derive what they're
giving up.

### 4. Lead with prose, ask with the question.

Before the question block, write 2–4 sentences of context
that names the 2–3 most important trade-offs across the
whole option space. Then ask. This lets the user see the
shape of the decision *before* drilling into a specific
choice.

The question itself stays terse:

> Which auth model do you want at v1?

The prose above carries the "here's why this matters now,
here's what you're committing to" weight. Trying to put the
context inside each option's description bloats the ballot;
trying to skip it leaves the user reading every option twice
to figure out what they're trading.

---

## A complete worked example

The first batch of the Pantheon pre-spec interview, from
session capture:

> **Foundation batch.** Before I can write `spec.md`, I need
> four decisions about scope and data. The biggest call is #4
> — picking the data architecture now saves a full migration
> later. If you're unsure between #4's options, pick the
> recommended (`hybrid-with-managed-postgres`) and move on;
> it accommodates almost every later choice without
> re-litigating.

Then four single-select questions, each shaped per rules 1–3:

> **1. Name.** What's the project's working name (lowercase
> token, ≤12 chars)?
>
> - (Recommended) Use the working name you mentioned in the
>   pitch — we can rename pre-launch.
> - Pick a new one now — fixes the name before we get
>   attached to the working one.
> - Defer — write `<PROJECT>` everywhere; rename later
>   (causes git churn).

> **2. Scope.** What's in v1 vs. punted?
>
> - (Recommended) v1 = core feature only; everything else
>   labeled `out of v1` in spec.md. Easier to ship; later
>   phases earn their slot.
> - Wide v1 = ship multi-feature substrate. Higher upfront
>   risk; faster to a "complete" product if it lands.
>
> [...]

That's it — short prose, four questions, recommended first,
trade-offs named. Twelve decisions land in three batches of
four. Total interactive time: ~10 minutes, no regret, no
back-and-forth.

---

## When the pattern doesn't fit

### Free-form questions

If the answer is genuinely free-form (a project name, a
voice description), the recommended-option rule doesn't
apply — there are no options. But rule 4 still holds: lead
with prose. And rule 1 still holds: don't stack 6 free-form
fields; ask 1–2 at a time.

`AskUserQuestion`'s "Other" affordance handles this — list
2–4 likely values as options, let the user type their own
via Other.

### Yes/no

Yes/no is a weak shape. If a question is "yes or no," reword
to "do X (recommended) or do Y" — the user's choice carries
more signal when both branches are named.

The rare genuine yes/no:

> **Roll back the last commit?** (irreversible — confirms
> the audit-trail edit you saw above)
>
> - Yes — roll back.
> - No — leave it; surface as `[needs-user-call]` in
>   AUDIT.md.

### Confirmations

If you're just confirming a decision you've already
described in prose, you don't need a question — the user
can hit accept on the response or interrupt. Save the
question budget for decisions that change behavior.

---

## Where this is used today

- **[`templates/skills/oversight.md`](../templates/skills/oversight.md)**
  — §5 The questionnaire is the canonical example. Computed
  from observed flags; recommended option first.
- **[`playbooks/pre-spec.md`](../playbooks/pre-spec.md)** —
  three batches of four questions, each shaped per the rules
  above.

Future skills that need the `AskUserQuestion` exception
should reference this doc rather than re-deriving the
pattern. New exceptions are rare; the pattern is portable.

---

## Anti-patterns

- **Pre-canned question sets.** `/oversight` famously
  generates questions from what it observed, not from a
  template. Pre-canned questionnaires age into noise. Compute
  the question batch from current state.
- **Asking what you can decide.** If the data is sitting in
  a state file, decide and write the call into the commit
  body. Don't pop a question for something the agent could
  read.
- **Asking to confirm an action you haven't described.**
  Describe first (prose), then ask. The user shouldn't be
  inferring what they're approving from the question alone.
- **More than 4 questions.** If you have 5, you have two
  batches. Split.
- **Recommended-option last.** Visually scanning a list, the
  user lands on the first option first. Putting the
  recommendation there respects that scan path; putting it
  at the bottom makes the user read every option twice.

---

## See also

- [`templates/skills/oversight.md`](../templates/skills/oversight.md)
  — the canonical user-in-the-loop skill.
- [`playbooks/pre-spec.md`](../playbooks/pre-spec.md) — the
  pitch→spec interview that applies this pattern.
- [`architecture.md`](./architecture.md) §6 — why
  AskUserQuestion is restricted in the first place.
