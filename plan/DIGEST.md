# Digest — 2026-11-11

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Spec 61 (versioned releases + upgrade story) shipped its final
three chunks and closed outright, issue `#103` went from triage
to a shipped spec (64) inside one tick, and spec 62's stale
Held veto released on schedule — but the loop's cadence gap
recurred too: nothing ran for 8h between 07:06 and 15:13 UTC,
the same root cause as the still-open `#96`, and motion's
already-final W45 reading stays stalled.

## While you were out

Window: since the last digest commit (2026-11-10 18:10 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-10 23:23→23:27 | march → triage | `95bd734` — 1 issue routed. |
| 11-10 23:27→23:32 | march → chunk | `85e3590` — spec 61 (versioned releases + upgrade story) chunked into 61.1–61.3. |
| 11-10 23:32→23:43 | march → next | `c7019dc`+`f806c5e`+`95d5b28` — built, closed, settled chunk 61.1: `CHANGELOG.md` now tracks why `templates/` changed; closing it also filed the `setLeft()` MEDIUM row below. |
| 11-11 06:22→06:41 | march → veto sweep → plot asap → next | `06160fe` released spec 62 from Held (its 2026-11-10 veto window lapsed, `#98` still open); `ff326b5`+`db9c98b` plotted `#103` as spec 64; `edf529d`+`449ba58`+`903ea61` built, closed, settled chunk 64.1 (an issue-born chunk's close now echoes its `#N`); `ee7a0e9` marked `#103` Done in the support SLA log. |
| 11-11 06:41→06:52 | march → critique | `a49c9cf` — pass 33: 2 findings (1 high, 1 med, 0 low). |
| 11-11 06:52→07:06 | march → next | `68e2c64`+`2b68b05`+`2389fee`+`7e28944` — built, closed, settled chunk 61.2: a `templates/**` commit with no CHANGELOG entry now fails the gate. |
| 11-11 15:13→15:34 | march → next | `7767c92` — built, closed and settled chunk 61.3 in one commit: the upgrade sync report now cites `CHANGELOG.md` entries; spec 61 complete. `23c4632` fixed a bystander test found while gating (feed.test.mjs's fixture commits drifting to the loop's own git identity); `1f35006` filed a new AUDIT row (next/build.md vs ship-a-chunk.md's close/land split). |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.72 (allowed_warning, resets
2026-11-16T08:00:00Z)`. The 07:06→15:13 gap (no march tick for
8h) is the same cadence throttling `#96` already tracks, not a
new finding.

## Shipped

- `/next`: built, closed and settled chunks 61.1–61.3 —
  CHANGELOG.md coverage end to end: a required `templates/**`
  changelog entry, the verify gate's new `changelog` leg, and
  the upgrade sync report citing it; spec 61 (versioned
  releases + upgrade story) complete.
- `/plot asap` + `/next`: `#103` (`support.mjs sla` re-flagging
  a closed issue forever) plotted as spec 64 and shipped
  same-tick as chunk 64.1 — an issue-born chunk's pending close
  now echoes its `#N` so `ARCHIVE.md` keeps naming the issue
  once the Asap line settle removes is gone.
- veto sweep: spec 62 (Handshake runbook profile for `setup/`)
  released from Held back into the Specs table — awaits
  chunking.
- `/triage`: 1 issue routed.
- `/critique` pass 33: 2 new findings (1 high — `prompts/
  adopt.md`'s placeholder list omits `<PACKAGE_MANAGER>`, the
  9th placeholder `templates/README.md` lists; 1 med — no new
  walk rows, the queue's existing 3 reproduced as-is).
- bystander fix found gating 61.3: `feed.test.mjs`'s fixture
  commits stop drifting to the loop's own git identity.

## Queues now

- **Build plan:** 1 spec, 0 chunks left, 0 held. Spec 62 just
  cleared Held but isn't chunked yet — the next ready tick
  likely chunks it, or falls through to `critique`/`iterate`
  if it doesn't.
- **AUDIT:** 8 pending, last pass 2026-11-10 (well under the
  48h staleness threshold — no refresh this pass). Two new
  MEDIUM rows filed this window: `settle.mjs`'s `setLeft()`
  never updates a spec row written in "N of M chunks" format
  (filed closing 61.1), and `next/build.md`'s brief scope vs
  `ship-a-chunk.md`'s Step 6/8 close/land split (filed after
  61.3).
- **CRITIQUE:** 13 pending, last pass 18h ago (pass 33 filed 2
  new findings this window, see above).
- **CANDIDATES:** 26 pending (22 >21d), oldest 133d (proposed
  2026-07-02) — no promotions or cuts since the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 4 since `cli-v0.6.5` (up from 2
  yesterday) — `23c4632` fix(test): feed.test.mjs git-identity
  drift, `7767c92` feat(upgrade): sync report cites
  CHANGELOG.md entries, `972fe48` fix(cli): favicon 404, and
  `ca3c79f` feat: loop throughput (mirror-orphan generator,
  depth promotion, product-first pick, Research `<n>d`).

## Needs you

- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, now behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes. Unchanged.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest — this window still shows an 8h gap (07:06→15:13 UTC)
  with no march tick at all; the only remaining lever is a
  cadence-preset workflow-file edit no cloud tick can push
  (`agents.md` Operational secrets).
- auto-promoted none, 0 awaiting — spec 62's Held line released
  this tick (veto window lapsed, `#98` still open); the sweep
  now reads "clean."
- motion stalled: shipped 12 / baseline 158.25 · 2026-W45
  against 2026-W41..2026-W44 (17 so far in 2026-W46) — the same
  already-final reading as yesterday's digest, not a new stall;
  W46 is still building up.
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (local-only check, skipped on
  this cloud run). No new Pending-cap cuts since the last
  digest.

## Today's intent

No chunk ready: spec 62 (Handshake runbook profile for
`setup/`) just cleared Held but still awaits chunking, so the
next tick likely lands on `chunk`, or falls through to
`critique`/`iterate` if chunking stalls. Top audit finding:
`[F, 3.6]` — `packages/cli/shared/models.mjs` and its test
fixtures (`model.test.mjs`, `model-ui.test.mjs`) still carry
`claude-fable-5-1` / "Fable 5.1" against the current "Fable
5.2" lineup — unresolved, unchanged since yesterday.

## Tuning proposals

none — the motion stall is fully explained by `#96` (cadence
throttling), already `[needs-user-call]` and blocked on an
owner cadence-preset push; no new mistuned gate surfaced this
pass. The candidates queue's silting is still the filed
`[score 3.5]` candidate (the `[promoted]`-row pulse-count gap)
rather than a fresh one.
