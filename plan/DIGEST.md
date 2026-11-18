# Digest — 2026-11-18

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A full day's burst — `#115` fully diagnosed, plotted as spec
68 and closed (support SLA Done; the fix itself waits on a
local session), critique passes 36 and 37 (6 findings, most
same-day fixed), a dualshell-lint gate widening, and a mobile
CLI scroll fix — split by two multi-hour quiet gaps and a
third still running; AUDIT's top row (`#96`, HIGH,
`[needs-user-call]`) stays open and unchanged, motion still
stalled entering W47.

## While you were out

`seven_day utilization: 0.41 (allowed, resets
2026-11-23T08:00:00Z)`.

Window: since the last digest commit (2026-11-17 19:22 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-17 22:52 → 22:56 | march → triage | `b740aaea` — `#115` queued as an AUDIT bug row (local-session fix, not folded into spec 65). |
| 11-17 22:56 → 23:07 | march → plan (self-correct) | `9b37516` chunked spec 66, then `9710d60` reverted it in full — 66 is Held behind its veto window, not pickable. |
| 11-17 23:07 → 23:18 | march → critique | `3f5fc6a` — pass 36: 3 findings (1 high, 2 med, 0 low). |
| 11-17 23:18 → 23:26 | march → expand | `3df44e0` — pass 27: 0 new, 1 re-evidenced. |
| 11-17 23:26 → 23:36 | march → docs | `128949d` — templates/README.md's "Reference implementations" repointed at anonymized projects. |
| 11-17 23:36 → 23:44 | march → docs | `b630b84` — templates/README.md's "eight" placeholders fixed to "nine". |
| 11-17 23:44 → 23:58 | march → fix | `1026062` — dualshell syntax lint widened to all of `skills/` + `templates/skills/`. |
| 11-17 23:58 → 00:07 | march (chain) | no-op. |
| 11-18 04:22 → 04:31 | march → docs | `6633b57` — `playbooks/new-project.md`'s GitLab prerequisite claim dropped. |
| 11-18 04:30 → 04:41 | march → docs | `ed55a29` — `prompts/pitch.md`'s ask-list count fixed to five, owner/contributor added. |
| 11-18 04:41 → 04:50 | march → docs | `27b32b0` — README.md's "fleet"/"cockpit" hero caption jargon glossed. |
| 11-18 04:50 → 05:02 | march → critique | `d196d6f` — pass 37: 3 findings (0 high, 3 med, 0 low). |
| 11-18 05:02 → 05:14 | march → iterate | `8859f5d` — motion-stall row closed as diagnosis, no lever change. |
| 11-18 05:14 → 05:22 | march → docs | `320fc21` — README.md's two `/critique` descriptions distinguished. |
| 11-18 05:22 → 05:30 | march (chain) | no-op. |
| 11-18 14:00 → 14:13 | march → plan | `669c6f1` plotted `#115` as spec 68 (Asap, local-session-only); `89801b0` settled it; `d2a5838` closed `#115`'s support SLA row Done. |
| 11-18 14:13 → 14:21 | march → docs | `307b784` — `new-project.md`'s visual-defaults step cross-references the Day-1 design-artifact checklist. |
| 11-18 14:21 → 14:34 | march → docs | `ad6cdab` — README's "Used v1? On v2?" moved past the first-time-adopter path. |
| 11-18 14:34 → 14:52 | march → fix | `00b0a69` — CLI: Oversight filter row scrolls instead of clipping on mobile. |
| 11-18 14:52 → 14:59 | march (chain) | no-op — nothing further ready after the burst. |

`heartbeat` ran clean throughout (5/5 sampled, no failures;
latest 07:25 UTC). No march tick observed since 14:59 UTC
(~4h as of this digest) — within the irregular-cadence pattern
`#96` already tracks, not a new alarm.

## Shipped

- `#115` (night.yml missing the `touch .owner` step
  `march.yml` has): diagnosed, plotted as spec 68 (one chunk,
  Asap), support SLA row closed Done. Not built this window —
  68.1 edits `.github/workflows/night.yml`, which no cloud
  tick's token can push, so it waits for a local session.
- `/critique` pass 36: 3 findings (1 HIGH — `templates/README.md`'s
  "Reference implementations" pointed at real projects whose
  own Provenance section fully anonymizes; 2 MED — a second
  "eight" vs. 9-row placeholder-count mismatch, and the mobile
  Oversight filter-row clip, confirmed the same root cause as
  the already-pending mobile-stepper-clip row). Pass 37: 3 more
  findings (all MED — `/critique`'s self-contradictory job
  description, "Used v1? On v2?" ordering ahead of first-time
  content, `/lessons-pr` referenced with no definition).
- docs: the "eight → nine" placeholder fix, the anonymized-
  Provenance repoint, the GitLab-prerequisite drop, the
  `prompts/pitch.md` ask-list count fix, the "fleet"/"cockpit"
  jargon gloss, the two-`/critique`-descriptions fix, the
  "Used v1?" reorder, and the Day-1 design-artifact checklist
  cross-reference — 8 of the above findings fixed same-day,
  leaving `/lessons-pr`'s missing definition the one still open.
- `fix`: dualshell syntax lint widened from a 5-file allowlist
  to all of `skills/` + `templates/skills/` (every bash-only
  fence now marked `<!-- dualshell:posix-only -->` instead);
  CLI's Oversight filter row scrolls instead of clipping on
  mobile (mirrored as `#121`).
- `/expand` pass 27: 0 new candidates, 1 re-evidenced (the
  mobile-viewport candidate, score 7.0 → 7.5, a third
  independent component hitting the same root cause).
- `/iterate`: closed the 2026-W46 motion-stall row as diagnosis
  only — its lever (`promote_per_week` 2→3) was already spent
  two days earlier; no new lever to pull.

## Queues now

- **Build plan:** 4 specs, 2 chunks left (65.1 and 68.1 — both
  local-session only, a cloud tick can't pick either), 0
  chunk-level holds. 66 and 67 stay in the Held lane, veto
  until 2026-11-19 (tomorrow). Spec 68 is new this window.
- **AUDIT:** 2 pending, last pass 2026-11-18 (today, fresh — no
  refresh needed this tick). Top row unchanged: `#96`.
- **CRITIQUE:** 5 pending, last pass ~14h ago (pass 37).
- **CANDIDATES:** 18 pending (12 >21d), oldest 139d (proposed
  2026-07-03) — net this window: expand pass 27 (0 new, 1
  re-evidenced); one `[score 5.8]` row built directly and moved
  to Rejected (`1026062`), accounting for the one-row drop
  since the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 8 since `cli-v0.6.5` —
  `00b0a69` fix(cli): Oversight filter row scrolls instead of
  clipping on mobile, `b348c6e` fix(cli): mobile Welcome loop
  diagram no longer overlaps itself, `a36935f` fix(cli): the
  onboarding Welcome headline wraps naturally on narrow phones,
  `49f54b5` fix(cli): bump stale Fable 5.1 model id/label to
  Fable 5.2, `23c4632` fix(test): feed.test.mjs's fixture
  commits stop drifting to the loop's own git identity,
  `7767c92` feat(upgrade): sync report cites CHANGELOG.md
  entries (61.3), `972fe48` fix(cli): the favicon's own 404
  stops showing up as a UI-walk finding, and `ca3c79f` feat:
  loop throughput (mirror-orphan generator, depth promotion,
  product-first pick, Research `<n>d`).

## Needs you

- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes. Unchanged.
- blocked: spec 68 (68.1, Asap) — the `night.yml`
  owner-mode-parity fix (`touch .owner`, mirroring `march.yml`)
  needs a local session to push `.github/workflows/night.yml`;
  same constraint as 65.1 and the checkout@v4→v5 bump above.
  New this window.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest, still open; the only remaining lever is a
  cadence-preset workflow-file edit no cloud tick can push
  (`agents.md` Operational secrets).
- auto-promoted 66 Key custody map + hermetic keys lint (veto
  until 2026-11-19, `#107`), 1 awaiting.
- auto-promoted 67 Package nexus as a Claude Code plugin (veto
  until 2026-11-19, `#109`), 1 awaiting.
- motion stalled: shipped 20 / baseline 159.5 · 2026-W46
  against 2026-W42..2026-W45 (8 so far in 2026-W47) — floor
  79.75, 20 is under 50% of baseline. Already closed as
  diagnosis-only this window (`8859f5d`, no lever left to
  pull); carried here because `pulse.mjs --motion` still reads
  `stalled` off the same last-full-week number, not a new
  alarm.
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (0 audit events logged this
  environment).

## Today's intent

No chunk a cloud tick can pick: spec 65's only chunk (65.1) and
spec 68's only chunk (68.1, `#115`'s fix) both need a local
session to push a `.github/workflows/` edit, and specs 66/67
sit Held until their 2026-11-19 veto lapses — so the next tick
most likely falls to `critique`/`expand`/`iterate` again, same
as this whole window did. Top audit finding: `#96` `[HIGH]`
`[needs-user-call]` — march's realized cadence under a
workflow-token push limitation only the owner can resolve with
a cadence-preset edit. Unresolved, unchanged since the last
digest.

## Tuning proposals

none — no new mistuned-gate evidence this pass. Both passes
fired on schedule, expand ran and correctly declined to
duplicate the re-evidenced mobile-viewport candidate, and the
motion-stall alarm closed as diagnosis rather than spending an
unevidenced lever. The two already-filed silt candidates stay
open and unchanged: `[score 4.8]` (heartbeat's quota-skip blind
spot) and `[score 3.5]` (`pulse.mjs`'s `[promoted]`-row
pending-count gap, originally scoped against 4 such rows —
now 14 across the file, though this pass adds no new count to
the candidate itself, just the observation for whoever next
touches it).
