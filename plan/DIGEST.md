# Digest — 2026-09-16

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet window — three of four ticks stood down clean because
every queue was either empty or not yet due, and the one that
shipped closed a real completeness gap in `templates/agents.md`'s
own skills table; this tick also caught itself about to burn a
sub-agent re-running that same morning's audit sweep because
`plan/AUDIT.md`'s header date never gets bumped, so that's now a
filed tuning proposal instead of a repeat of the mistake.

## While you were out

Window: since the last digest commit (2026-09-15 15:10 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-15 17:55 | march → (critique not due, no pending phase, CRITIQUE/AUDIT sub-threshold) | **no-op** — clean, read-only pass |
| 09-15 22:42 | march → (same: nothing due) | **no-op** — clean, read-only pass |
| 09-16 07:12 | march → iterate (AUDIT >24h stale by the log's own last-sweep date, so ran a fresh A-G sweep) | shipped `b45b807` — templates/agents.md's Skills table + Invocation list widened to cover all 15 shipped skills |
| 09-16 13:06 | march → (AUDIT fresh again post-sweep, CRITIQUE/build-plan empty) | **no-op** — clean, read-only pass |

`heartbeat` ran green throughout (5/5 sampled). One of four
ticks shipped a commit; the other three were self-verified
no-ops, not stalls.

## Shipped

- `b45b807` — fix: a fresh A-G sweep found `templates/agents.md`
  — the file this repo's own `agents.md` calls "the entry point
  for any AI agent landing in this repo cold" — omitted 6 of the
  15 skills `templates/skills/` ships from its Skills table and
  Invocation list, including `jot` (unconditional, no
  "omit unless..." annotation, yet absent from its own
  rulebook). Added all six rows to both the table and the
  Invocation block, each annotated with its adoption condition
  to match the existing `ship-data` style. `node scripts/verify.mjs`
  green (all seven legs).

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`) and
  phase 32 (`#49`), unchanged since 2026-08-23 and 2026-08-30.
- **AUDIT:** 5 pending rows, unchanged (`[F, ~2]` model-id-hedge
  gap already downgraded on discovery; `#54` LOW self-healed
  transient CDN 504; `#40`/`#35`/`#49` MED, all blocked on the
  same cloud-push-token workflows-scope gap). The H1 header
  still stamps "2026-09-12" even though a full sweep shipped
  this morning (07:12 UTC tick, `b45b807`) — the same cosmetic
  lag the 2026-09-15 digest flagged and still unfixed; this tick
  nearly re-ran the sweep from scratch before the log narrative
  caught it. Filed as a tuning proposal below rather than a
  third silent repeat.
- **CRITIQUE:** 0 pending. Last pass 17 (2026-09-14 23:01 UTC),
  3 commits since — gate reopens at 12 commits or ~72h
  (~2026-09-17 23:01 UTC), neither reached yet.
- **PHASE_CANDIDATES:** 25 pending (21 >21d), oldest 77d
  (proposed 2026-07-02) — plus the one filed by this tick (see
  Tuning proposals), so 26 pending as of this commit. No expand
  pass ran this window (last pass 12 was 2026-09-14, well under
  the 20-commit/7-day threshold).
- **Issues:** 6 open, unchanged — `#54` (self-healed transient),
  `#49`/`#48` (phase 32 blocked + loop mirror), `#40` (phase 23
  follow-up, blocked), `#35`/`#34` (phase 20 blocking token
  issue + loop mirror). No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 77d).** Both trigger conditions remain met — 24 days
  since the last promotion pass (2026-08-23). Worth an
  `/oversight` pass to drain or explicitly defer the backlog
  rather than let it keep aging untouched.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`) and phase 32 (`#49`) — both need `.github/workflows/`
  writes the cloud tick's token can't make. The standing
  `[score 7.8]` candidate proposing a permanent fix for this
  class of block is itself one of the >21d-old rows above.

## Today's intent

No `[ ]` build-plan phase pending. `plan/AUDIT.md`'s five
standing rows all score under 1.0 (durable blocked issues at
impact 4 x ease 2 / 10 = 0.8; `#54` at 0.4; `[F, ~2]` already
downgraded); `plan/CRITIQUE.md` is empty; the critique gate
isn't due until ~2026-09-17 23:01 UTC or 12 commits; `/expand`
isn't due until 20 commits or 2026-09-21. Absent a new signal,
the next few march ticks will most likely keep standing down
clean — which is itself the correct behavior, not a stall.

## Tuning proposals

- Filed `plan/PHASE_CANDIDATES.md` `[score 4.2]` "AUDIT.md's H1
  header date isn't mechanically bumped after a full sweep, so
  every tick hand-parses the log for real staleness" — this
  tick nearly re-ran a full A-G sweep that had already shipped
  8 hours earlier because the header still read the older date;
  proposes either mechanically bumping the H1 in the same commit
  as every full sweep, or teaching `scripts/pulse.mjs` to derive
  staleness from the log's own dated sweep entries instead.
  Proposal only, filed to Pending — `/oversight` decides.
