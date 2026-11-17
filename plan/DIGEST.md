# Digest — 2026-11-17

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean overnight burst — critique pass 35 (2 findings), two
CLI UI fixes, four doc fixes, expand pass 26 (0 new, 3 stale
cut), and a mirror-orphan loop that filed issue #114 and
closed it again in the same burst once it saw the prior
commit had already fixed it — then five quiet hours with no
further march tick; AUDIT's top row (`#96`, HIGH,
`[needs-user-call]`) stays open and unchanged, motion still
stalled.

## While you were out

`seven_day utilization: 0.2 (allowed, resets
2026-11-23T08:00:00Z)`.

Window: since the last digest commit (2026-11-16 20:42 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-16 22:24 | march → fix | `a36935f` — CLI: onboarding Welcome headline wraps naturally on narrow phones. |
| 11-16 22:36 | march → critique | `a06f849` — pass 35: 2 findings (1 high, 1 med, 0 low). |
| 11-16 23:05 | march → fix | `b348c6e` — CLI: mobile Welcome loop diagram no longer overlaps itself. |
| 11-16 23:15 | march → docs | `85f9e51` — prompts/adopt.md asks before copying templates and replacing placeholders. |
| 11-16 23:23 | march → docs | `407c15a` — README's "all 8 placeholders" now says 9, matching the table. |
| 11-16 23:32 | march → expand | `01ad739` — pass 26: 0 new candidates, 3 stale cut (60+ days old, over the 15-row cap). |
| 11-16 23:44 | march → docs | `6f3f18b` — /bootstrap's automated path defers the cloud-loop leg until the local loop proves itself. |
| 11-16 23:45 → 23:56 | march (chain) | no-op — nothing further ready after the burst. |
| 11-17 04:35 | march → refill (motion) | `0525c15` — motion generator filed 1 row (2026-W46 stall). |
| 11-17 04:40 | march → docs | `4500253` — prompts/pitch.md's Standing rules carries the attribution-trailer carve-out; mirrored as `#114`. |
| 11-17 04:41 → 04:47 | march (chain) | no-op. |
| 11-17 04:53 | march → refill (mirror-orphan) | `b3a42e0` — filed `#114`'s row, flagging it looked already fixed by `4500253`. |
| 11-17 04:54 | march → iterate | `e5613a5` — closed `#114`: already fixed, no new change. |
| 11-17 04:55 → 05:04 | march (chain) | no-op. |
| 11-17 14:25 → 14:34 | march | no-op. |

`heartbeat` ran clean throughout (5/5 sampled, no failures;
latest 07:52 UTC). No march tick observed since 14:34 UTC
(~4h45m as of this digest) — within the irregular-cadence
pattern `#96` already tracks, not a new alarm.

## Shipped

- CLI fixes: onboarding Welcome headline wraps on narrow
  phones; mobile Welcome loop diagram no longer overlaps
  itself.
- `/critique` pass 35: 2 findings filed (1 HIGH
  ui-comprehension — mobile Welcome loop-diagram caption
  overlap; 1 MED instruction-drift — `prompts/pitch.md`'s ask
  list undercounted); 2 more GUI candidates logged for a
  future pass once the walk-row cap has room.
- docs: `prompts/adopt.md`'s ask-list fix, README's "8 → 9"
  placeholder count fix, `/bootstrap`'s automated-path
  cloud-loop-defer fix, `prompts/pitch.md`'s Standing-rules
  attribution-trailer carve-out.
- `/expand` pass 26: 0 new candidates, 3 stale cut (`npx
  nexus-adopt`, package-manager pluggability, AUDIT's H1
  header-date gap — each 60+ days old, over the 15-row cap).
- refill: motion generator filed 1 row (2026-W46 stall,
  already tracked); mirror-orphan generator filed issue
  `#114`'s row, which `/iterate` closed the same tick —
  already fixed one minute earlier by `4500253`.

## Queues now

- **Build plan:** 3 specs, 1 chunk left (65.1 — local-session
  only, a cloud tick can't pick it), 0 chunk-level holds. 66
  and 67 stay in the Held lane, both inside their veto window
  until 2026-11-19. Unchanged.
- **AUDIT:** 4 pending, last pass 2026-11-16 (43h, fresh — no
  refresh needed this tick; last touched 04:54 UTC today
  closing `#114`). Top row unchanged: `#96`.
- **CRITIQUE:** 8 pending, last pass 43h ago (pass 35).
- **CANDIDATES:** 19 pending (13 >21d), oldest 138d (proposed
  2026-07-03) — net this window: expand pass 26 (0 new, 3
  stale cut), mirror-orphan row filed then closed same-day
  (`#114`, already fixed).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 7 since `cli-v0.6.5` —
  `b348c6e` fix(cli): mobile Welcome loop diagram no longer
  overlaps itself, `a36935f` fix(cli): the onboarding Welcome
  headline wraps naturally on narrow phones, `49f54b5`
  fix(cli): bump stale Fable 5.1 model id/label to Fable 5.2,
  `23c4632` fix(test): feed.test.mjs's fixture commits stop
  drifting to the loop's own git identity, `7767c92`
  feat(upgrade): sync report cites CHANGELOG.md entries
  (61.3), `972fe48` fix(cli): the favicon's own 404 stops
  showing up as a UI-walk finding, and `ca3c79f` feat: loop
  throughput (mirror-orphan generator, depth promotion,
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
  against 2026-W42..2026-W45 (6 so far in 2026-W47) — floor
  79.75, 20 is under 50% of baseline. Already answered last
  window by the dimension-I `promote_per_week` bump and the
  two aged promotions (66, 67); still waiting on W47's count
  and the 2026-11-19 veto lapse.
- cut 2026-11-16 [score 4.2] AUDIT.md's H1 header date isn't
  mechanically bumped after a full sweep, so every tick
  hand-parses the log for real staleness
- cut 2026-11-16 [score 7.1] npx nexus-adopt: the mechanical
  half as an initializer
- cut 2026-11-16 [score 7.2] Package-manager pluggability: the
  pnpm-only settings.json allowlist silently stalls
  npm/yarn/bun adopters
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (0 audit events logged this
  environment).

## Today's intent

Still no chunk a cloud tick can pick: spec 65's only chunk
(65.1) needs a local session, and specs 66/67 sit Held until
their 2026-11-19 veto lapses — so, as this window confirmed in
practice, the next tick falls to `critique`/`expand`/`iterate`.
Top audit finding: `#96` `[HIGH]` `[needs-user-call]` —
march's realized cadence under a workflow-token push
limitation only the owner can resolve with a cadence-preset
edit. Unresolved, unchanged since the last digest.

## Tuning proposals

none — no new mistuned-gate evidence this pass. The
critique-GUI walk-row cap (`MAX_PENDING=3`) did its job: it
filed only the most severe of 3 fresh candidates and deferred
the other two rather than overflowing the queue, which is the
designed behavior, not a stall. The two already-filed silt
candidates — `[score 4.8]` (heartbeat's quota-skip blind spot)
and `[score 3.5]` (pulse.mjs's `[promoted]`-row pending-count
gap) — remain open and unchanged; this pass adds no new
evidence against the cadence alarm itself (`#96` tracked the
~5h gap throughout, still open), so neither gets re-filed.
