# Digest — 2026-09-21

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The crash-alarm dedupe gap flagged in yesterday's digest recurred
twice more the same day — two more distinct causes silently
buried behind the same two-week-old issue — while the loop
otherwise self-healed a rate-limit-driven heartbeat alarm and
shipped one clean critique pass.

## While you were out

Window: since the last digest commit (2026-09-20 14:21 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-20 17:16 | march | **crashed**, no commit — `api_error_status: 429` (`rate_limit`). Crash-alarm found `#54` still open and skipped filing, per its title-only dedupe. |
| 09-20 22:10 | march | **crashed**, no commit — `api_error_status: 429` (`rate_limit`) again. Same dedupe skip against `#54`. |
| 09-21 07:36 | march → triage | clean no-op on the git side — triaged and closed `#60` ("Heartbeat: march has flatlined"), root-caused to the two 429s above (transient session-limit pressure, self-healed by this tick's own success); ran the mandatory read-only oversight audit per cloud-mode rule 1, flagging the candidate backlog and a token-scope discrepancy (see Needs you). |
| 09-21 14:49 | march → critique | shipped `438657f` — critique pass 19: 1 MED finding (`prompts/adopt.md`'s step 4a forward-references a "topology check below" the numbered reading list can't resolve in order). |

`heartbeat` ran green throughout (5/5 sampled) — its own alarm on
`#60` was the one thing it caught, and it self-resolved by the
next successful march tick, as designed. Two of four march ticks
crashed before reaching the agent turn; both were rate-limit
transients, not code or workflow defects.

## Shipped

- `438657f` — critique pass 19. Filed one MED finding to
  `plan/CRITIQUE.md`: `prompts/adopt.md`'s step 4a points at "the
  topology check below," but that check lives in a `Then:` block
  textually after the entire 7-item numbered reading list the
  prompt tells the agent to follow strictly in order — unresolvable
  on a literal first read.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 29 days
  blocked) and phase 32 (`#49`, 22 days blocked), both still on
  the same cloud-push-token workflows-scope gap, unchanged.
- **AUDIT:** 6 pending rows, unchanged (`[C/A, 3.2]`, `[F, ~2]`,
  `#54`, `#40`, `#35`, `#49`). Header reads 2026-09-20, ~26-33h
  old — under the 48h refresh threshold, no re-sweep this tick.
- **CRITIQUE:** 1 pending (MED, this tick's own finding above),
  last pass 19 (2026-09-21, ~1.5h before this digest).
- **PHASE_CANDIDATES:** 27 pending (21 >21d), oldest 82d
  (proposed 2026-07-02) — count unchanged from yesterday; today's
  edit re-evidenced the standing crash-alarm-dedupe candidate
  in place rather than adding a new row.
- **Issues:** 6 open, unchanged (`#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`). `#60` opened and closed within the same tick
  (self-resolved heartbeat alarm). No `triage:needs-user` or
  `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 82d).** Both trigger conditions remain met, now for a
  second day running. Worth an `/oversight` pass to drain or
  explicitly defer the backlog.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 29 days) and phase 32 (`#49`, 22 days).
- The crash-alarm dedupe gap (score 4.5 candidate, filed
  yesterday) is no longer single-occurrence evidence: the same
  24h window produced two more crashes (both `429` rate-limit)
  masked behind `#54` the identical way as yesterday's `403`. Three
  distinct causes in one day, one visible issue. Re-evidenced in
  place in `plan/PHASE_CANDIDATES.md` rather than filed as new.
- New this tick: the 07:36 oversight audit flagged that
  `agents.md` records `ACTIONS_PAT` getting `workflows` scope
  added on 2026-08-23 — the exact same day phase 20 first blocked
  for lacking that scope. Worth a human check of the token's actual
  scope grants in GitHub's settings UI; AUDIT rows `#35`/`#49`
  already track the underlying discrepancy as pending.
- The standing `[score 4.2]` tuning proposal — "AUDIT.md's H1
  header date isn't mechanically bumped after a full sweep" — is
  still pending; no new evidence this tick (today's header happens
  to read the correct date because the last full sweep landed
  2026-09-20, not because the bump became mechanical).

## Today's intent

No `[ ]` build-plan phase pending. `plan/CRITIQUE.md` holds one
pending MED row (this tick's `prompts/adopt.md` finding), which
will compete against AUDIT's own top row (`[C/A, 3.2]`, README's
kit tree omitting `templates/.github/ISSUE_TEMPLATE/`) for the
next `/iterate` pick. `/expand` isn't due yet (pass 13 ran
2026-09-19; its commit/day threshold hasn't cleared).

## Tuning proposals

Re-evidenced the existing `plan/PHASE_CANDIDATES.md` candidate
(score 4.5, "Crash-alarm dedupe matches by generic title only")
rather than filing a new one: today's window produced two more
march crashes (runs `35525362773` and `35540854118`, both
`api_error_status: 429`) that hit the identical dedupe skip
against `#54` as yesterday's `403` crash. Three distinct causes
masked behind one two-week-old issue in a single 24h window is
materially stronger evidence than the single occurrence the
candidate was first filed against — still a proposal only, no
gate or workflow edited directly.
