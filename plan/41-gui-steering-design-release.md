# 41 — GUI: steering, tugs, the design, the release

> The GUI links to a Claude Code session running in a
> terminal, so an oversight answer reaches it right away; the
> tugs read at a glance; Claude Design's export becomes the
> UI, ported rigidly; and 0.1.0 ships from a tag.

## Why

Today an answer in the GUI's oversight inbox reaches a
terminal `/heads-down` only when that loop next reads the
notice board, and a question parked by a terminal session
waits for the end gate. The owner wants steering to feel
immediate ("magical"): ask, answer, and the session moves.
The design is coming from Claude Design and must be adopted
as the source of truth, not reinterpreted. 0.1.0 shipped to
npm from the `cli-v0.1.0` tag on 2026-10-21 (OIDC, with
provenance, `latest`).

What exists today (2026-10-20): the cockpit's tug pulse and
dashed question line on the canvas stage; `announce.mjs`
(owner lines outrank the command file); the session ledger
(SDK session id, parked questions); `ui/tokens.css` as a
placeholder; `publish.yml` publishing on `cli-v*` tags
(0.0.2 published through OIDC with provenance).

## Design

- **Magical steering:** the GUI lists live local sessions
  (ledgers, plus Claude Code's own session files for the
  repo) and links to one by its session id. An answer or tug
  aimed at a linked session lands at once: an owner line on
  the notice board plus a project hook (`UserPromptSubmit` /
  `PostToolUse`) that injects unread owner lines into that
  session's next turn; for a GUI-owned session, the SDK's
  input stream. A parked question answered this way leaves
  the ledger's parked list. Built as a Workflow (L): build,
  then an adversarial check that an answer never reaches the
  wrong session.
- **Tug polish:** the stage shows each tug's path from the
  inbox to the session that took it (sent, seen, applied),
  the age of an open question, and which session a merged
  inbox item belongs to. Everything through `tokens.css`
  variables, so the design port keeps it.
- **The design** (held until the owner hands over the
  export): port its tokens (color, type, space, radii,
  elevation), motion (named curves and durations,
  reduced-motion fallbacks) and night/day themes verbatim
  into `packages/cli`; adopt every pattern unless clearly
  superfluous, each skip logged with its reason in the close.
  A Workflow: tokens and motion, then screens, then a
  fidelity review against the export.
- **The release** (held: the owner's word): push the
  annotated tag `cli-v0.1.0` on main; `publish.yml` publishes
  through OIDC; confirm with `npm view @usenexus/cli
  dist-tags`.
- **npm hygiene** (held: the owner's npm account): confirm the
  Trusted Publisher reads validated; deprecate the manual
  0.0.1 and `0.0.0-stage`, which carry no provenance.

## Acceptance

- **A1** The GUI links to a terminal Claude Code session; an
  answer or tug reaches its next turn, and only that session.
- **A2** The stage shows each tug's path and state and each
  question's age and session.
- **A3** `packages/cli` carries the export's tokens, motion
  and both themes verbatim; every skipped pattern is logged.
- **A5** The Trusted Publisher reads validated; 0.0.1 and
  `0.0.0-stage` are deprecated.

## Open questions

- Which surface the steering hook uses when a terminal
  session is mid-tool for a long time (an L build): wait for
  the next turn (default), or interrupt? Default: wait.

## Chunks
Measure: 4 open · 1 closed · next A6

- [ ] **41.1** Magical steering: link to a local Claude Code
  session · L · closes A1 · needs —
- [ ] **41.2** Oversight tugs, visualized: path, state, age ·
  M · closes A2 · needs —
- [ ] **41.3** Apply the Claude Design handoff to packages/cli
  · L · closes A3 · needs —
  - Waits on the owner's export (Held lane).
- [ ] **41.5** Trusted Publisher validated; old versions
  deprecated · S · closes A5 · needs —
