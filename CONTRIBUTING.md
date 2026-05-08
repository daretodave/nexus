# Contributing to nexus

Thanks for the interest. nexus is methodology + templates
extracted from real projects; contributions that come from
**actually applying it to a project of your own** are the most
valuable.

---

## What's in scope

Improvements that fit the kit's character:

- **Templates that work better.** A skill template that's clearer,
  a sub-agent that's more useful, a deploy-check provider block
  for a host nexus doesn't cover yet.
- **Playbooks for new contexts.** Did you adopt nexus on a
  Django project? A Rust CLI? A monorepo at scale? Write up the
  playbook.
- **CI/CD providers.** The `playbooks/ci-providers.md` matrix is
  alive — adding a new provider is welcome.
- **Concept clarifications.** If you read a concept doc and it
  was confusing, fix it. PRs that improve clarity are gold.
- **Sub-agent designs.** If you've written a domain specialist
  (`copy-editor`, `migration-specialist`, `release-notes-writer`,
  etc.) and it earned its place, contribute a generic version
  to `templates/claude/agents/`.

What's **not** in scope (will be politely declined):

- **Generated content.** PRs that are obviously LLM-drafted with
  no real-world testing. Use it on a project; tell us what
  worked.
- **Frameworks of frameworks.** Adding more layers, more
  abstractions, more meta. The methodology is small on purpose.
- **Tool-specific lock-in beyond Claude Code.** Claude Code is
  the primary client because that's where slash commands live;
  the methodology should still be readable from any agent.
- **Religious style debates.** Tabs vs spaces, semicolons,
  conventional commits — the templates pick a style; edit
  yours, don't relitigate.

---

## How to propose a change

### Small fix (typo, broken link, wording)

Just open a PR. No issue needed.

### New CI/CD provider

1. File an issue first describing the provider and the auth
   shape.
2. Add a new block to `templates/scripts/deploy-check.mjs`
   following the existing pattern (Netlify / Vercel / GitHub
   Actions are good references).
3. Add a row to the matrix in
   `playbooks/ci-providers.md` and a section under "Wiring per
   provider."
4. Document the env vars in `templates/env/env.example`.
5. PR with the diff. If you've actually used it on a real
   project, mention that in the PR body.

### New playbook (e.g., adopting nexus on Rails)

1. File an issue describing the context (stack, project size,
   what was different from the existing playbooks).
2. Write the playbook at `playbooks/<context>.md`. Mirror the
   structure of `new-project.md` or `existing-project.md`.
3. Add a section to the README under "Two paths to start" (or
   wherever fits).
4. PR.

### New skill

This is a bigger ask. Skills earn their place by being **used
3+ times** in a real project before being templated. Don't
write a skill template for a verb you've thought about; write
one for a verb you've manually performed and felt the friction.

1. File an issue describing the verb, the procedure you
   followed manually, and the failure modes you hit.
2. Discuss in the issue whether it's general enough for the
   kit or domain-specific (most are domain-specific and don't
   belong in the kit).
3. If green-lit: write the skill at `templates/skills/<verb>.md`
   following `concepts/skills-anatomy.md` § skill template.
   Write the matching slash command at
   `templates/claude/commands/<verb>.md`.
4. Update `templates/agents.md` skills table.
5. Update README skills table.
6. PR.

### New sub-agent

Same bar as skills: real-world use first.

1. File an issue.
2. Write the sub-agent at
   `templates/claude/agents/<name>.md` following the
   `generic-specialist.md` template.
3. Update `customization/sub-agents.md` if the new agent
   represents a pattern worth describing.
4. PR.

---

## Style guidelines

Templates and concept docs should be:

- **Decisive.** Skills say "do X" not "you might consider
  doing X." Briefs say "DO NOT ASK" and resolve every
  ambiguity. See `concepts/skills-anatomy.md`.
- **Concrete.** File paths, bash commands, exact output
  examples. Not "the relevant file" but
  `plan/phases/phase_<N>_<topic>.md`.
- **Terse.** Prefer 1 sentence over 3. Bullets over prose
  where possible. The agent reads cold; padding is tax.
- **No emojis.** Anywhere.
- **No `Co-Authored-By:` trailers** in commits.
- **Numbered sections** in skills and concepts so cross-refs
  work (`see §7 of skills/X.md`).

---

## How to test changes

Templates are tested by **applying them**:

- Spin up a small repo (any stack, any provider).
- Apply your changed template per the playbook.
- Confirm the loop ships at least one phase end-to-end.
- Document the test in your PR body.

Concept docs are tested by **reading them cold**:

- Find someone who hasn't seen nexus.
- Have them read the changed doc.
- Ask them to summarize back. If they get it, ship the PR.

If you can't run either test (low-stakes typo, link fix), say
so in the PR body. Reviewers will be lenient on cosmetic
changes, strict on substantive ones.

---

## What gets merged fast

- Bug fixes, broken-link fixes, typo fixes.
- New CI/CD provider blocks.
- Concept doc clarifications.
- Provider-specific notes in the matrix.

## What gets merged slowly

- New skills (need real-world evidence).
- New sub-agents (same).
- New playbooks (need explicit issue discussion).
- Anything that changes the standing rules.

## What gets declined

- Adding a `Co-Authored-By:` trailer convention.
- Adding emojis to templates.
- Replacing precise prose with "AI-generated polish."
- Methodology overhauls without real-world evidence.

---

## Code of conduct

Be honest about what you've tested. Be precise about what you
mean. Don't waste reviewers' time. That's the whole code.

---

## License

By contributing, you agree your contributions are licensed
under the same terms as the kit (MIT). See [`LICENSE`](./LICENSE).
