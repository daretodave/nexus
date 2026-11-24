# 73 — Prompt audit joins the kit's prompt-maintenance story

> Claude Code ships a first-party audit of the four artifact
> types this kit is made of: instruction files, skills, agents
> and commands. The kit's own guidance on keeping those
> healthy never mentions it. Try it on this repo, then write
> down what it is good for.

## Why

`customization/claude-code.md` and
`concepts/skills-anatomy.md` own the kit's story for prompt
quality: voice, wrap, anatomy, the parts the verify gate
checks. Claude Code's `/doctor prompt-audit` (also `/checkup
prompt-audit`) audits `CLAUDE.md` files, skills, agents and
commands for stale paths, stale commands, instruction files
that contradict each other, and prompting written for older
models. Skill drift is the most audited defect class in
`plan/AUDIT.md`, and an adopter inherits a growing `skills/`
directory with no named tool for the same job. The kit should
say when to reach for it, after checking what it does.

## Design

- Run the audit against this repo first and read its real
  output. A changelog line is not the command's surface:
  confirm the invocation, the report's shape, and whether it
  flags anything here.
- Fix what it flags in this repo that is a true finding, in
  the same chunk when small, as AUDIT rows otherwise.
- A short subsection in `customization/claude-code.md`: what
  the audit checks, when to run it (before a `/critique`
  pass, after a batch of skill edits, after an upgrade), and
  what the kit's own gate already covers so the two are not
  confused.
- `concepts/skills-anatomy.md` links to it from the place it
  discusses keeping skills current.
- Name the capability, link the vendor's docs, pin no version.

## Acceptance

- **A1** The audit has been run on this repo and its findings
  are either fixed or filed as rows in `plan/AUDIT.md`.
- **A2** `customization/claude-code.md` has a subsection that
  says what the audit checks, when to run it, and how it
  differs from the verify gate.
- **A3** `concepts/skills-anatomy.md` links to that
  subsection.

## Open questions

- Whether the audit can run unattended in a cloud tick. If it
  needs an interactive session, A1 is a local-session chunk
  and the doc says so.

## Chunks
Measure: 3 open · 0 closed · next A4

- [ ] **73.1** Run the audit on this repo, fix or file what it
  flags · S · closes A1 · needs —
  - Local session only: the full checkup (`/doctor
    prompt-audit`, also `/checkup prompt-audit`) is a slash
    command a human types into an interactive session; a
    nested `claude -p` call from this cloud tick's shell has
    no login (confirmed this tick — `Not logged in · Please
    run /login`), and `claude doctor` the CLI subcommand is
    only an installation-health check, not the prompt audit.
    No cloud-tick credential closes that gap.
- [ ] **73.2** Document what the audit checks, when to run it,
  and how it differs from the gate; link it from the skills
  anatomy doc · S · closes A2, A3 · needs 73.1
  - The subsection's content (the invocation, the report's
    shape) comes from 73.1's real run, not a guess from the
    changelog line (spec Design, first bullet).
