# Digest — 2026-11-16

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A ~3.5-day quota-driven dry spell (both `march` and `night`
pinned at `seven_day` utilization 0.82, at or above the
scheduled-run cap of 0.80, from 2026-11-13 00:32 to
2026-11-16 08:00 UTC) cleared itself automatically once the
cached reading's reset time passed — `cc63b38`'s fail-open
fix doing exactly the job it was built for — and the loop
then worked through a backlog in one burst: two more
motion-stall aged promotions (specs 66, 67), spec 65 chunked,
three small fixes, two doc chunks; AUDIT's top row (`#96`,
HIGH, `[needs-user-call]`) stays open and unchanged.

## While you were out

Window: since the last digest commit (2026-11-12 18:34 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-12 19:03 | march → expand | `0d931ac` — pass 25: 2 new candidates, 5 stale cut. |
| 11-13 00:32 | march → research | `5f9a8d7` — research: 2 field candidates. |
| 11-13 00:25 → 11-16 08:00 | march (~18 ticks) + night (11-13, 11-14, 11-15) | no-op, all — quota gate skip: `seven_day` utilization 0.82 ≥ the 0.80 scheduled cap, cached reading not due to reset until 2026-11-16T08:00:00Z. |
| 11-16 11:20 | march → quota gate resumes | `5576a88` — fail-open once the cached window's reset time passed (confirmed in this tick's own log); veto sweep: vetoed 0, released 1. |
| 11-16 11:24 | march → motion-stall promotion | `b3fb3b5` — spec 66 (Key custody map + hermetic keys lint) auto-promoted, `#107`, veto until 2026-11-19. |
| 11-16 11:27 | march → chunk | `8417b78` — spec 65 chunked (65.1, local-session only). |
| 11-16 11:42 | march → fix | `78649fa` — `cadence.test.mjs`'s bootstrap cross-check self-skips when `bootstrap.mjs` is pruned. |
| 11-16 11:56 | march → fix | `49f54b5` — CLI's stale Fable 5.1 model id/label bumped to Fable 5.2. |
| 11-16 12:07 | march → iterate fix | `7709737` — loop dimension I: `promote_per_week` 2 → 3 (motion stalled). |
| 11-16 12:13 | march → motion-stall promotion | `37802d9` — spec 67 (Package nexus as a Claude Code plugin) auto-promoted, `#109`, veto until 2026-11-19. |
| 11-16 12:31 | march → fix | `29281e3` — `settle.mjs`'s `setLeft()` now updates "N of M chunks" roadmap rows too. |
| 11-16 12:47 | march → docs | `ca5895d` — `next/build.md` names the exact `ship-a-chunk.md` step range a builder runs. |
| 11-16 13:32 | march → docs | `1f94b22` — `prompts/adopt.md`'s placeholder list gains `<PACKAGE_MANAGER>`. |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.17 (allowed, resets
2026-11-23T08:00:00Z)` — the window has reset cleanly since
the dry spell.

## Shipped

- `/expand` pass 25: 2 new candidates, 5 stale cut.
- `/march` research pass: 2 field candidates.
- veto sweep: vetoed 0, released 1.
- motion-stall aged promotions: spec 66 (Key custody map +
  hermetic keys lint, `#107`) and spec 67 (Package nexus as a
  Claude Code plugin, `#109`), both veto until 2026-11-19.
- spec 65 chunked: 65.1 (test both credential hypotheses,
  land the fix or record the negative result — local-session
  only).
- fixes: `cadence.test.mjs`'s bootstrap cross-check
  self-skip; CLI's Fable 5.1 → 5.2 bump; loop dimension I
  (`promote_per_week` 2 → 3, motion stalled); `settle.mjs`'s
  `setLeft()` roadmap "N of M chunks" fix.
- docs: `next/build.md`'s exact `ship-a-chunk.md` step range;
  `prompts/adopt.md`'s `<PACKAGE_MANAGER>` placeholder.

## Queues now

- **Build plan:** 3 specs, 1 chunk left (65.1 — local-session
  only, a cloud tick can't pick it), 0 chunk-level holds. 66
  and 67 now sit in the Held lane itself, both inside their
  veto window until 2026-11-19.
- **AUDIT:** 4 pending, last pass 2026-11-16 (fresh, no
  refresh needed this tick). Top row unchanged: `#96`.
- **CRITIQUE:** 12 pending, last pass 5d ago.
- **CANDIDATES:** 22 pending (15 >21d), oldest 137d (proposed
  2026-07-03) — net this window: expand pass 25 (+2, -5
  stale), research (+2 field), 2 aged-promoted out into the
  Held lane (66 `#107`, 67 `#109`).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 5 since `cli-v0.6.5` —
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
  against 2026-W42..2026-W45 (4 so far in 2026-W47) — floor
  79.75, 20 is under 50% of baseline. Already answered this
  window by the dimension-I `promote_per_week` bump and the
  two fresh aged promotions; watch whether W47 recovers.
- cut 2026-11-12 [score 5.8] `/skill-doctor` isn't in the
  kit's skill-maintenance story
- cut 2026-11-12 [score 6] Claude Code v2.1.269 fixes the
  attribution-reminder/CLAUDE.md conflict agents.md rule 2
  depends on
- cut 2026-11-12 [score 6.5] Auto mode: Claude Code's new
  default permission model isn't in the kit's playbooks
- cut 2026-11-12 [score 6.8] closeloop: thank the humans who
  file issues
- cut 2026-11-12 [score 7] ADOPTERS.md wall + badge + opt-in
  hatch beacon
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (0 audit events logged this
  environment).

## Today's intent

No chunk a cloud tick can pick: spec 65's only chunk (65.1)
needs a local session (testing a real workflow-file push),
and specs 66/67 sit Held until their 2026-11-19 veto lapses —
so the next tick likely falls to `critique`/`iterate`. Top
audit finding: `#96` `[HIGH]` `[needs-user-call]` — march's
realized cadence under a workflow-token push limitation only
the owner can resolve with a cadence-preset edit. Unresolved,
unchanged since the last digest.

## Tuning proposals

none — the quota gate behaved as designed this pass (pinned
at `seven_day` 0.82 against the 0.80 scheduled-run cap for
~3.5 real days) and resumed cleanly via the existing
`cc63b38` fail-open fix once its cached window's reset time
passed, confirmed in this tick's own run log; no new mistuned
gate surfaced. The queue's two already-filed silt candidates
— `[score 4.8]` (heartbeat's quota-skip blind spot) and
`[score 3.5]` (pulse.mjs's `[promoted]`-row pending-count gap)
— remain open and unchanged; this pass adds no new evidence
that the cadence alarm itself stayed cold (`#96` tracked the
window throughout, still open), so neither gets re-filed.
