# Digest — 2026-09-18

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean four-for-four night — no no-op ticks — closing both
halves of the health-check placeholder bug (`env.example` +
`ci-providers.md`), running critique pass 18, and shipping its
top finding, while the candidate queue keeps silting past both
oversight thresholds.

## While you were out

Window: since the last digest commit (2026-09-17 15:16 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-17 17:54 | march → iterate | shipped `b2c2fec` — `templates/env/env.example`'s `HEALTH_CHECK_EXPECT` example implied an HTTP status, not a body substring |
| 09-17 22:38 | march → iterate | shipped `8ce8af1` — `playbooks/ci-providers.md`'s self-hosted section never said to set `DEPLOY_PROVIDER=health-check` |
| 09-18 07:01 | march → critique | ran pass 18, filed 2 findings (0 high, 1 med, 1 low) — commit `a6b5782` |
| 09-18 12:41 | march → iterate | shipped `c6cd266` — pass 18's MED finding: `new-project.md` step 7 never said how to create `package.json` |

`heartbeat` ran green throughout (5/5 sampled). All four ticks
shipped a commit — the first fully no-op-free window in recent
digests.

## Shipped

- `b2c2fec` — `templates/env/env.example:58`'s
  `HEALTH_CHECK_EXPECT` example read like an HTTP status code
  when the field is actually a response-body substring match.
  Corrected the example and comment.
- `8ce8af1` — `playbooks/ci-providers.md`'s self-hosted deploy
  section walked through the health-check provider without ever
  telling the reader to set `DEPLOY_PROVIDER=health-check`,
  leaving the section's own instructions inert. Added the
  missing line.
- `c6cd266` — `playbooks/new-project.md` step 7 told adopters to
  fill in `package.json` values but never said how to create the
  file in the first place (critique pass 18's MED finding).
  Added the create step ahead of the fill-in instructions.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 26
  days blocked) and phase 32 (`#49`, 19 days blocked), both on
  the same cloud-push-token workflows-scope gap, unchanged since
  2026-08-23 and 2026-08-30.
- **AUDIT:** 5 pending rows, down from 6 — this window's two
  `iterate` ticks closed the `ci-providers.md` and `env.example`
  health-check rows. Header still reads 2026-09-17 (<48h old, no
  refresh needed this tick). Remaining: `[F, ~2]`
  (`customization/claude-code.md` model-id hedge, already
  flagged as possibly droppable) plus the four durable rows
  (`#54` self-healed transient; `#40`/`#35`/`#49` all blocked on
  the same workflows-scope gap as the build-plan rows above).
- **CRITIQUE:** 1 pending (LOW). Pass 18 ran this window
  (2026-09-18), filed 2 findings, and the MED one shipped in the
  same window (`c6cd266` above). Remaining: the LOW row —
  README.md's "Three paths to start" and "How to use this kit"
  are two onboarding checklists ~250 lines apart with no
  cross-link.
- **PHASE_CANDIDATES:** 26 pending (21 >21d), oldest 79d
  (proposed 2026-07-02) — both counts unchanged from yesterday.
  Last expand pass (12) was 2026-09-14; not due again until its
  own 20-commit/7-day threshold (~2026-09-21).
- **Issues:** 6 open, unchanged — `#54` (self-healed transient),
  `#49`/`#48` (phase 32 blocked + loop mirror), `#40` (phase 23
  follow-up, blocked), `#35`/`#34` (phase 20 blocking token issue
  + loop mirror). No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 79d).** Both trigger conditions remain met, unchanged
  from yesterday's call. Worth an `/oversight` pass to drain or
  explicitly defer the backlog rather than let it keep aging.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 26 days) and phase 32 (`#49`, 19 days) — both need
  `.github/workflows/` writes the cloud tick's token can't make.
  The standing `[score 7.8]` candidate proposing a permanent fix
  for this class of block is itself one of the >21d-old rows
  above.
- The standing `[score 4.2]` tuning proposal — "AUDIT.md's H1
  header date isn't mechanically bumped after a full sweep"
  (proposed 2026-09-16) — is still pending in
  `plan/PHASE_CANDIDATES.md`; no new evidence to add this tick
  since no full A-G sweep ran (only targeted row ships).

## Today's intent

No `[ ]` build-plan phase pending. `plan/CRITIQUE.md`'s one
remaining LOW row (README's two disconnected onboarding
checklists) is the likely next `/iterate` pick — it outscores
AUDIT's top actionable row (`[F, ~2]`, already flagged as
possibly droppable). The critique gate just reopened this window
(pass 18, 2026-09-18); `/expand` isn't due until ~2026-09-21.

## Tuning proposals

None filed this tick. The pulse was healthy — four ticks, four
ships, no starved gates or hibernating ceilings — so the standing
proposals above (header-bump mechanization, candidate-queue
silting) already cover the only live mistuning signals.
