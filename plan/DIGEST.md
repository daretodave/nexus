# Digest — 2026-11-19

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A brief early-evening burst — two CLI mobile-viewport fixes,
two docs fixes, and an expand pass that rejected its own
re-evidenced candidate as already built — gave way to a
motion-stall-triggered aged promotion (spec 69, veto `#125`)
and one more docs fix, bracketed by two multi-hour quiet gaps
and a third still running; AUDIT's top row (`#96`, HIGH,
`[needs-user-call]`) stays open and unchanged, motion still
stalled entering W47.

## While you were out

`seven_day utilization: 0.55 (allowed, resets
2026-11-23T08:00:00Z)`.

Window: since the last digest commit (2026-11-18 19:01 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-18 21:57 → 22:09 | march → fix | `9213170` — CLI: Fleet tile phase track titles disambiguate the two "Q" segments (closes `#122`). |
| 11-18 22:09 → 22:29 | march → fix | `da4d724` — CLI: onboarding stepper shows a step count instead of clipping on mobile (mirrored `#123`). |
| 11-18 22:29 → 22:39 | march → docs | `1a1f2a1` — README's files-added checklist names `nexus.secrets.json` (mirrored `#124`). |
| 11-18 22:39 → 22:49 | march → docs | `d6c71a7` — README's `/lessons-pr` mention explains itself inline. |
| 11-18 22:49 → 22:57 | march → expand | `19e579b` — pass 28: 0 new candidates, 1 rejected (built directly — the mobile-viewport candidate's three remaining components all shipped as cloud-tick fixes). |
| 11-18 22:57 → 23:06 | march (chain) | no-op. |
| 11-19 03:29 → 03:41 | march → plan (motion-stall) → iterate | `317d30b` auto-promoted spec 69 (plan/ carries the workspace: resurrection + a doctor; veto until 2026-11-22, `#125`) under heartbeat `#92`'s stalled-motion trigger; `af66cee` fixed the install-hooks forward-reference in the same tick. |
| 11-19 03:41 → 03:51 | march (chain) | no-op. |
| 11-19 13:09 → 13:17 | march | no-op. |

`heartbeat` ran clean throughout (5/5 sampled, no failures;
latest 07:22 UTC). Two multi-hour quiet gaps inside the window
(23:06 → 03:29, ~4h23m; 03:51 → 13:09, ~9h17m) and a third
still open — no march tick observed since 13:17 UTC (~5h47m as
of this digest) — within the irregular-cadence pattern `#96`
already tracks, not a new alarm.

## Shipped

- CLI: Fleet tile phase track titles disambiguate the two "Q"
  segments (`9213170`, closes `#122`); onboarding stepper shows
  a step count instead of clipping on mobile (`da4d724`,
  mirrored `#123`) — the last of the three components the
  re-evidenced "Onboarding's mobile viewport" candidate named.
- docs: README's files-added checklist now names
  `nexus.secrets.json` (`1a1f2a1`, mirrored `#124`); README's
  `/lessons-pr` mention explains itself inline (`d6c71a7`);
  `new-project.md`'s install-hooks instruction moved to §4,
  after `scripts/` is actually copied in (`af66cee`, ticks the
  one open CRITIQUE row).
- `/expand` pass 28: 0 new candidates, 1 rejected as built
  directly — the mobile-viewport candidate's three components
  (Welcome headline wrap, Stepper step-count, Oversight
  filter-row scroll) are all shipped, so the candidate closed
  without a spec.
- `plan`: spec 69 ("plan/ carries the workspace: resurrection +
  a doctor") auto-promoted under this week's stalled-motion
  trigger (heartbeat `#92`, `stall_action promote`, `Promote:
  aged`) — `promote.mjs pick` selected the highest-scoring aged
  Pending row (score 7.4, proposed 2026-07-03, 139 days aged);
  written unchunked, candidate moved to Promoted, veto issue
  `#125` opened, Held until 2026-11-22.

## Queues now

- **Build plan:** 5 specs, 2 chunks left (65.1 and 68.1 — both
  local-session only, a cloud tick can't pick either), 0
  chunk-level holds. Held lane: 66 and 67 veto until
  2026-11-19 (today — not yet lapsed as of this tick's sweep),
  69 new this window, veto until 2026-11-22.
- **AUDIT:** 2 pending, last pass 2026-11-18 (within 48h, fresh
  — no refresh needed this tick). Top row unchanged: `#96`.
- **CRITIQUE:** 0 pending, last pass ~43h ago (pass 37,
  unchanged — no new pass fired this window).
- **CANDIDATES:** 16 pending (11 >21d), oldest 140d (proposed
  2026-07-03) — net this window: expand pass 28 (0 new, 1
  rejected, built directly); one row promoted to spec 69 via
  the motion-stall aged trigger, moved to the Promoted section.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 10 since `cli-v0.6.5` — `da4d724`
  fix(cli): onboarding stepper shows a step count instead of
  clipping on mobile, `9213170` fix(cli): Fleet tile phase
  track titles disambiguate the two "Q" segments, `00b0a69`
  fix(cli): Oversight filter row scrolls instead of clipping on
  mobile, `b348c6e` fix(cli): mobile Welcome loop diagram no
  longer overlaps itself, `a36935f` fix(cli): the onboarding
  Welcome headline wraps naturally on narrow phones, `49f54b5`
  fix(cli): bump stale Fable 5.1 model id/label to Fable 5.2,
  `23c4632` fix(test): feed.test.mjs's fixture commits stop
  drifting to the loop's own git identity, `7767c92`
  feat(upgrade): sync report cites CHANGELOG.md entries (61.3),
  `972fe48` fix(cli): the favicon's own 404 stops showing up as
  a UI-walk finding, and `ca3c79f` feat: loop throughput
  (mirror-orphan generator, depth promotion, product-first
  pick, Research `<n>d`).

## Needs you

- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes. Unchanged.
- blocked: spec 65 (65.1) and spec 68 (68.1, `#115`) — both
  chunks edit `.github/workflows/*.yml` directly and need a
  local session; no cloud tick's token can push either.
  Unchanged.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest, still open; the only remaining lever is a
  cadence-preset workflow-file edit no cloud tick can push
  (`agents.md` Operational secrets).
- auto-promoted 66 Key custody map + hermetic keys lint (veto
  until 2026-11-19, `#107`), 2 awaiting.
- auto-promoted 67 Package nexus as a Claude Code plugin (veto
  until 2026-11-19, `#109`), 2 awaiting.
- auto-promoted 69 plan/ carries the workspace: resurrection +
  a doctor (veto until 2026-11-22, `#125`), 2 awaiting. New
  this window.
- motion stalled: shipped 20 / baseline 159.5 · 2026-W46
  against 2026-W42..2026-W45 (10 so far in 2026-W47) — floor
  79.75, 20 is under 50% of baseline. Already closed as
  diagnosis-only two digests ago (`8859f5d`); the stall itself
  also triggered this window's aged promotion (spec 69) per
  `stall_action promote` — carried here because
  `pulse.mjs --motion` still reads `stalled` off the same
  last-full-week number, not a new alarm.
- No `triage:needs-user` issues, no `loop:do` issues. Secrets
  rotation check skipped — that log is local, this is a cloud
  run.

## Today's intent

No chunk a cloud tick can pick: spec 65's only chunk (65.1) and
spec 68's only chunk (68.1, `#115`'s fix) both need a local
session to push a `.github/workflows/` edit, 66 and 67 sit
Held until today's veto lapses (not yet, as of this tick's
sweep), and 69 is Held until 2026-11-22 — so the next tick most
likely falls to `critique`/`expand`/`iterate` again. Top audit
finding: `#96` `[HIGH]` `[needs-user-call]` — march's realized
cadence under a workflow-token push limitation only the owner
can resolve with a cadence-preset edit. Unresolved, unchanged
since the last digest.

## Tuning proposals

none — no new mistuned-gate evidence this pass. The
motion-stall trigger fired exactly as tuned (`stall_action
promote`, aged pick), expand correctly declined to re-score
the now-fully-shipped mobile-viewport candidate, and the
cadence/workflow-push constraints are already tracked as
owner-call blockers, not gate mistunings. The two already-filed
silt candidates stay open and unchanged: `[score 4.8]`
(heartbeat's quota-skip blind spot) and `[score 3.5]`
(`pulse.mjs`'s `[promoted]`-row pending-count gap).
