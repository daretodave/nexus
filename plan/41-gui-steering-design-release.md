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

- **A6** Hover, focus, popover and motion states match their
  boards in a live browser, in both themes, and the button
  ink the cascade repair chose is confirmed or reverted.
- **A7** The cockpit, heads-down and inbox draw the boards'
  durations, diffstats, message times, estimates, phase marks
  and countdowns from real data.
- **A8** The fleet's last board details are drawn: each
  star's own idle curve, the orphaned worktree's link, and
  one rule for terminal sessions in the switcher.
- **A9** The JS bundle loads per route under 500 kB and the
  package ships only the font subsets it uses.

## Open questions

(None. The owner chose interrupt on 2026-10-21: the steer
hook denies the next tool call with the owner's line; a
running tool call can't be killed, so the next tool boundary
is the interrupt point.)

## Chunks
Measure: 4 open · 5 closed · next A10

- [ ] **41.6** Live fidelity pass: hover, popovers, motion,
  both themes · S · closes A6 · needs —
  - The 41.3 reviews compared static renders; check live the
    tile hover and glow, the git-pop, the train dock, the
    tidy and request popovers, the cockpit's tug and tether
    lines (`--tray-y`), heads-down's 120 columns at narrow
    widths, Plot below ~800px of height, dawn contrast.
  - The boards draw `<button class="btn-primary">` with
    `--text` ink (the reset outranks it); the app draws
    on-accent ink (`repairCascade`). Default: keep the repair.
- [ ] **41.7** Boards' times, durations, diffstats and marks
  from real data · M · closes A7 · needs —
  - The stream and ledger carry tool durations and
    diffstats, message times, the workflow junction, chunk
    estimates and phase marks, the tug's default deadline;
    CloudLoop counts "PRs opened" from `/api/cloud`.
- [ ] **41.8** The fleet's last details: idle curves, orphan
  link, switcher rule · S · closes A8 · needs 40.6
- [ ] **41.9** A lighter package: routes split, fonts
  trimmed · S · closes A9 · needs —
  - `React.lazy` per route (the bundle is 556 kB); ship
    latin and latin-ext `@fontsource` subsets only; subset
    the mono symbol webfonts to their ranges.
