# Digest — 2026-09-17

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A two-fix window — the dispatcher closed a stale Sub-agents
table row and a drifted `/march` command mirror, then stood down
clean twice — and this tick's own AUDIT refresh (5 days stale)
turned up one fresh row (`templates/env/env.example`'s
misleading health-check example, the file adopters actually
fill in) plus reconfirmed the two standing ones untouched.

## While you were out

Window: since the last digest commit (2026-09-16 15:10 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-16 17:56 | march → (critique not due, no pending phase, CRITIQUE/AUDIT sub-threshold) | **no-op** — clean, read-only pass |
| 09-16 22:38 | march → (same: nothing due) | **no-op** — clean, read-only pass |
| 09-17 07:08 | march → iterate | shipped `19ecc52` — `templates/claude/commands/march.md`'s dispatch list drifted, missing `/expand` |
| 09-17 13:01 | march → iterate | shipped `35794c7` — `templates/agents.md`'s Sub-agents table omits the shipped `brander` agent |

`heartbeat` ran green throughout (5/5 sampled). Two of four
ticks shipped a commit; the other two were self-verified no-ops,
not stalls.

## Shipped

- `19ecc52` — `templates/claude/commands/march.md` had
  duplicated `skills/march.md`'s dispatch chain inline instead of
  pointing at it, and the inline copy had drifted, omitting
  `/expand` from the list adopters actually read. Fixed to match
  the canonical 6-step chain.
- `35794c7` — `templates/agents.md`'s Sub-agents table (the entry
  point adopters read cold) omitted the shipped `brander` agent,
  even though all 4 files exist under `templates/claude/agents/`.
  Added the missing row.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`) and
  phase 32 (`#49`), unchanged since 2026-08-23 and 2026-08-30.
- **AUDIT:** 6 pending rows. Header was 5 days stale (last full
  sweep 2026-09-12), past the 48h threshold, so this tick ran a
  fresh A-G sweep (delegated to an agent to protect context) and
  bumped the H1 to today. `node scripts/verify.mjs` green
  throughout. New top row: `[A, 4.0]`
  (`templates/env/env.example:58`'s `HEALTH_CHECK_EXPECT=200`
  comment is misleading — same bug as the row below, but in the
  file adopters actually copy). `[A/E, 3.0]` (ci-providers.md
  health-check gap) and `[F, ~2]` (claude-code.md hedge gap,
  already downgraded) both reproduced unchanged. The four durable
  rows (`#54` self-healed transient, `#40`/`#35`/`#49` blocked on
  the same cloud-push-token workflows-scope gap) all confirmed
  still open via `gh issue view`.
- **CRITIQUE:** 0 pending. Last pass 17 (2026-09-14 23:01 UTC),
  8 commits since — gate reopens at 12 commits or ~72h
  (~2026-09-17 23:01 UTC), neither reached yet.
- **PHASE_CANDIDATES:** 26 pending (21 >21d), oldest 78d
  (proposed 2026-07-02). No expand pass ran this window (last
  pass 12 was 2026-09-14, well under the 20-commit/7-day
  threshold; 99 commits have landed since the last promotion
  pass on 2026-08-23, but that's the candidate-queue backlog
  itself, not a fresh expand trigger).
- **Issues:** 6 open, unchanged — `#54` (self-healed transient),
  `#49`/`#48` (phase 32 blocked + loop mirror), `#40` (phase 23
  follow-up, blocked), `#35`/`#34` (phase 20 blocking token issue
  + loop mirror). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 78d).** Both trigger conditions remain met — 25 days
  since the last promotion pass (2026-08-23). Worth an
  `/oversight` pass to drain or explicitly defer the backlog
  rather than let it keep aging untouched.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`) and phase 32 (`#49`) — both need `.github/workflows/`
  writes the cloud tick's token can't make. The standing
  `[score 7.8]` candidate proposing a permanent fix for this
  class of block is itself one of the >21d-old rows above.
- The 2026-09-16 digest's own tuning proposal — `[score 4.2]`
  "AUDIT.md's H1 header date isn't mechanically bumped after a
  full sweep" — is still pending in `plan/PHASE_CANDIDATES.md`
  and this tick's own manual header bump is a live re-confirmation
  of the exact premise it names.

## Today's intent

No `[ ]` build-plan phase pending. `plan/AUDIT.md`'s top row now
scores 4.0 (`env.example`'s misleading health-check example) —
the next `/iterate` tick's most likely pick, unless
`plan/CRITIQUE.md` grows a competing row first (empty as of this
commit). The critique gate isn't due until ~2026-09-17 23:01 UTC
or 12 commits; `/expand` isn't due until 20 commits or
~2026-09-21.

## Tuning proposals

None filed this tick — the standing `[score 4.2]` header-bump
proposal (2026-09-16) and the candidate-queue-silting note above
already cover today's only mistuning signals.
