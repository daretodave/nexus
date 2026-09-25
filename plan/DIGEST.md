# Digest — 2026-09-25

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A fully productive window — four ticks shipped (critique, triage,
two `/iterate` fixes, one a fresh A-G sweep) — but one of them
(critique pass 20) repeated the exact commit-boundary breach
already open as `#63`, and the candidate queue kept silting
untouched underneath all the activity.

## While you were out

Window: since the last digest commit (2026-09-24 15:22 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-24 18:10 | march → critique | shipped `0cdb345` — pass 20, 2 findings (0 high, 1 med, 1 low); commit is **missing its `Cloud-Run:` trailer** — the delegate sub-agent committed and pushed directly instead of returning findings to the parent, the exact failure `[user-issue #63]` already tracks. |
| 09-24 22:59 | march → triage | shipped `d080ac1` — routed 1 issue (`#63`, the trailer-breach report above) into the loop-queued label. |
| 09-25 07:06 | march → iterate | shipped `6411c57` — docs fix: `prompts/pitch.md`'s Phase B contradicted the `adopt.md` it hands off to. |
| 09-25 13:14 | march → iterate | shipped `7fe2978` — fresh A-G sweep (AUDIT header rolled 09-22 → 09-25); top finding (score 5.6) ported `scripts/pulse.mjs` wiring into the adopter-facing `templates/skills/oversight.md` + `digest.md` and their settings.json allowlists, which had been missed when phase 24 wired it up for nexus-self only; four lower-scoring findings logged inline (not queued as new Pending rows). |

`heartbeat` ran green throughout (5/5 sampled this window). Three
of the four commits above carry an intact `Cloud-Run:` trailer;
`0cdb345` does not (tracked, see table).

## Shipped

- `0cdb345` — critique pass 20: 2 findings filed to
  `plan/CRITIQUE.md` (1 med since resolved into `#63` itself, 1
  low still pending — see Queues).
- `d080ac1` — triage: routed `#63` into `triage:loop-queued`.
- `6411c57` — docs: fixed `prompts/pitch.md`'s Phase B contradicting
  `adopt.md`'s handoff.
- `7fe2978` — iterate: fresh sweep, shipped the score-5.6 finding
  (`pulse.mjs` never made it into the adopter-facing templates —
  phase 24 wired it up for this repo's own skills but not the
  `templates/` copies adopters actually get).

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 33 days
  blocked) and phase 32 (`#49`, 26 days blocked), both still on the
  same cloud-push-token workflows-scope gap, unchanged.
- **AUDIT:** 6 pending rows (up from 5 — `#63` added this window).
  Top score is `#63` itself at 2.9 (impact 4, ease 6), still under
  the 3.0 ship threshold; the rest are the durable blocked
  user-issue rows (`#54`, `#40`, `#35`, `#49`) plus the low-priority
  `[F, ~2]` freshness row. Header is fresh (2026-09-25, this
  window's sweep) — no refresh needed this pass.
- **CRITIQUE:** 1 pending (LOW — `prompts/adopt.md`'s reading-list
  glob undercount), last pass 39h ago.
- **PHASE_CANDIDATES:** 28 pending (22 >21d), oldest 86d (proposed
  2026-07-02, unchanged row) — flat vs. yesterday; nothing drained.
- **Issues:** 7 open (`#63` new this window, `#54`, `#49`/`#48`,
  `#40`, `#35`/`#34`). No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 86d).** Both trigger conditions remain met; four ticks
  shipped this window and none touched the candidate queue.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 33 days) and phase 32 (`#49`, 26 days).
- `#63` (critique's sub-agent overstepping its commit boundary) is
  now both an open issue and the AUDIT queue's top-scoring pending
  row (2.9) — worth a deliberate `/oversight` fix to the
  `skills/critique.md` step-3 delegate prompt before it recurs a
  third time, since the queue's scoring formula keeps it just under
  the auto-ship threshold.
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31, now 25 days
  old) targets the exact recurring blocker behind both stuck
  phases — it would close `#35`, `#40`, and `#49` together if
  promoted.

## Today's intent

No `[ ]` build-plan phase pending (only the two blocked rows).
This window's sweep already shipped the one AUDIT finding that
cleared 3.0 (the pulse.mjs template gap). What's left in Pending
tops out at `#63` (score 2.9) — expect the next `/iterate` tick to
need a fresh sweep to find something ≥3.0, or fall through to
`/expand` again if it doesn't, same as pass 14 two days ago.

## Tuning proposals

None new. `0cdb345`'s missing trailer is a real gate gap, but it's
already fully diagnosed and queued as `[user-issue #63]` with two
concrete fix angles (harden the delegate prompt's literal wording;
add a mechanical trailer check to critique step 7 / march step 4)
— filing a second candidate for the same root cause would just
fork the fix. No other mistuned-gate signal this window: all four
ticks shipped cleanly, heartbeat stayed green, and the standing
candidates already on file (workflow-scope-blocked lane,
candidate-queue silting) cover what this pass's pulse numbers
would otherwise motivate.
