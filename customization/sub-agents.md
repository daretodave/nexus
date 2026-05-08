# Customization: sub-agents

> Two sub-agents come with nexus (`scout`, `reader`). Most
> projects need 1–2 more — domain specialists tuned for the
> work the project does most. This is how you design them.

---

## What sub-agents are for

The main agent's context is precious. Every paragraph it
reads costs latency and quality. Sub-agents protect that
context by:

1. **Absorbing verbose I/O.** Scout reads 20 web pages and
   returns 10 lines of structured findings. Reader visits 6
   URLs and returns a JSON array. The main agent never sees
   the raw fetch output.
2. **Carrying a different persona.** A fresh-eyes reader
   genuinely visits the site as a stranger; the main agent,
   full of build context, can't pretend.
3. **Parallelizing.** Spawn three scouts to research three
   switches simultaneously. The main agent waits for all
   three returns and proceeds.
4. **Limiting tool surface.** Scout has WebSearch + WebFetch.
   It can't accidentally edit code. The main agent has
   everything; sub-agents have less.

---

## When to write a new sub-agent

Two signs:

1. **The main agent keeps doing the same kind of subtask** in
   skill after skill (drafting prose, validating data,
   researching specs).
2. **That subtask has a clear input/output shape** (input: a
   topic; output: a written file, a structured JSON).

Don't write a sub-agent for:

- Small ad-hoc tasks that vary too much.
- Tasks that don't repeat (one-shot research).
- Tasks where the agent needs full context.

---

## Domain specialists worth writing

Patterns from real projects:

### `content-curator` (writes prose)

For projects that publish written content: articles, summaries,
descriptions, marketing copy.

- **Input:** topic + pillar + target word count + voice cue.
- **Output:** a complete content file (MDX / Markdown / HTML).
- **Tools:** Read, Write, Edit, Grep, Glob, WebSearch,
  WebFetch.
- **Persona:** the editorial voice of the publication. Read
  bearings.md voice section verbatim.

Used by `/iterate` content-gap fixes; could be used by
`/ship-a-phase` if a phase requires drafting copy.

### `data-steward` (schema-heavy data work)

For projects with non-trivial data layers: schema migrations,
mass cross-reference repairs, normalization passes.

- **Input:** description of the structural change + migration
  constraints.
- **Output:** modified schemas + loaders + records that
  validate.
- **Tools:** Read, Write, Edit, Grep, Glob, Bash.
- **Persona:** schema gardener. Cares about migrations,
  referential integrity, types.

Used by `/ship-data` for cross-cutting work.

### `copy-editor` (voice polish)

For published-content projects where consistency matters.

- **Input:** draft content + voice guide.
- **Output:** edited content, with diff annotations.
- **Tools:** Read, Edit, Grep.
- **Persona:** the publication's editor. Anti-jargon, anti-padding,
  pro-clarity.

Used by `/iterate` for "polish low-quality articles" findings.

### `api-checker` (OpenAPI / contract compliance)

For API projects where breaking the contract is expensive.

- **Input:** the new endpoint or change.
- **Output:** a compliance report (passes / fails specific
  rules).
- **Tools:** Read, Bash (for spec validation tools).
- **Persona:** API governance reviewer.

Used by `/ship-a-phase` for endpoint phases.

### `migration-specialist` (DB migrations)

For projects on Pattern B (external DB).

- **Input:** schema change requested.
- **Output:** a forward migration + a tested rollback.
- **Tools:** Read, Write, Bash.
- **Persona:** safe-migrations expert.

Used by `/ship-data` and `data-steward`.

### `release-notes-writer`

For projects that publish changelogs / release notes.

- **Input:** range of commits.
- **Output:** human-readable release notes.
- **Tools:** Bash (for git log), Read, Write.
- **Persona:** technical writer who reads commit messages and
  groups them by user-facing impact.

Used by a hypothetical `/ship-release` skill or by `/iterate`
for stale-changelog findings.

---

## Anti-patterns

### Sub-agent that writes anywhere it wants

If your `data-steward` has full filesystem write access AND
deep autonomy AND broad tools — you've just made another main
agent. Restrict the tools. Restrict the output paths.

### Sub-agent that has to ask the main agent for context

If the sub-agent's prompt-to-output cycle requires multiple
back-and-forth with the main agent, you've broken the
abstraction. The whole point is one-shot.

### Sub-agent for everything

You don't need 8 sub-agents. Most projects ship well with 3:
`scout` + 1–2 domain specialists. More than 4 starts to feel
like a bureaucracy.

### Sub-agent that doesn't have a clear failure mode

Every sub-agent needs to know when to give up. "Topic is
unknowable from public sources" → return finding with
`Confidence: low`. "Schema change too large" → return
recommendation to escalate. Sub-agents that try infinitely or
return wishy-washy answers cost more than they save.

---

## Designing a new sub-agent — checklist

Before writing the file:

- [ ] **Trigger:** which skill spawns this? When?
- [ ] **Input shape:** what does the main agent pass in?
- [ ] **Output shape:** what does the main agent get back?
- [ ] **Tools:** the minimum set needed.
- [ ] **Persona:** what mindset should the sub-agent carry?
- [ ] **Failure modes:** what cases should it gracefully fail?

Then write the file at `.claude/agents/<name>.md` using
`templates/claude/agents/generic-specialist.md` as a starting
point.

After writing:

- [ ] **Test in isolation:** spawn it with a representative
      task, verify the output matches expectation.
- [ ] **Wire it into the skill:** the skill that spawns this
      sub-agent should explicitly delegate, not optionally.
- [ ] **Update bearings:** add a row to the sub-agents table.
- [ ] **Update agents.md:** add a row to the sub-agents table.

---

## Iteration on sub-agents

Sub-agent prompts evolve. When you find:

- The sub-agent's output is consistently misshapen → tighten
  the output spec.
- The sub-agent makes the same mistake repeatedly → add to its
  hard rules.
- The sub-agent is too cautious / too aggressive → tune the
  persona.

Edit in place. Commit with subject `agents: <name> — <change>`.
There's no versioning beyond git history.

---

## When to retire a sub-agent

If a sub-agent hasn't been spawned in N weeks: it's dead
weight. Either:

- The skill that used to delegate stopped → update the skill.
- The work disappeared → delete the sub-agent file.
- The sub-agent was always wrong for this project → delete.

A retired sub-agent is fine. Better than an unused one
cluttering `.claude/agents/`.

---

## See also

- `templates/claude/agents/scout.md` — open-web research.
- `templates/claude/agents/reader.md` — fresh-eyes site
  observer.
- `templates/claude/agents/generic-specialist.md` — starting
  point for your specialists.
- `concepts/architecture.md` § sub-agents — high-level
  rationale.
