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
- **The design** (ported 2026-10-21 in 41.3; the patterns
  not adopted are listed with their reasons in
  `packages/cli/design/handoff/README.md`): port its tokens
  (color, type, space, radii,
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

- **A10** The boards the second handoff (2026-10-21) changed
  outside the vault match the app again: sheet clipping,
  the owner cockpit's composer, value styling, and the
  changed Fleet, Cockpit, Inbox, CloudLoop, GitPanel,
  Recover, Settings and onboarding boards.

## Open questions

(None. The owner chose interrupt on 2026-10-21: the steer
hook denies the next tool call with the owner's line; a
running tool call can't be killed, so the next tool boundary
is the interrupt point.)

## Chunks
Measure: 1 open · 9 closed · next A11

- [ ] **41.10** Re-port what the second handoff changed
  outside the vault · M · closes A10 · needs —
  - `packages/cli/design/handoff/` was refreshed on
    2026-10-21 (its README lists every changed board).
    Diff each changed board against its screen and port the
    change; `nexus.css` is copied verbatim again. Vault,
    Secrets, BoardOwnerAll's "Waiting on a secret" section,
    the Inbox key card and the board's key badge belong to
    42.8; leave them.
