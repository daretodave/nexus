# Digest — 2026-10-21

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The owner pulled `march` off the road at 2026-10-20T23:20:24Z
and ran a marathon local `/heads-down` session through the
night: 120 non-bookkeeping commits, five specs closed complete
(20, 32, 34, 36, 37), spec 41's GUI steering work four-fifths
done (41.2 landed minutes before this pass), and the plan
itself moved from phases to specs + chunks mid-stream. The
cost of the pause: `heartbeat`'s wedged-run canceller doesn't
know how to skip a disabled workflow and has hard-failed twice
today instead of just reporting it — filed as a candidate
below, not fixed here.

## While you were out

Window: since the last digest commit (2026-10-20 15:17 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-20 18:19 | march | No-op (2min run, no commit). |
| 10-20 22:55 | march → iterate | Shipped `3bc31a9` — adopt-dryrun never checked the prune step for stale agents.md rows. |
| 10-20 23:20 | *(owner)* | `march` set `disabled_manually` by hand; cloud loop goes quiet for the rest of the window. |
| 10-20 23:09 → 10-21 11:26 | *(owner, local)* | 118 more commits by hand: specs 20, 32, 34, 36, 37 closed complete; spec 41 to 1 chunk left; `@usenexus/cli` published; the v1→v2 plan-shape move (phases → specs/chunks, `ship-a-phase`→`ship-a-chunk`) landed inside the same window. |

`heartbeat` ran clean through 10-20 (4/4 success), then failed
its two most recent ticks today (10-21 04:43, 10-21 11:46) —
both `could not find any workflows named march`, both while
`march` sat disabled. See Tuning proposals.

## Shipped

- Specs closed complete: **20** (cloud ticks run `/next top`
  synchronously, agents foreground), **32** (heartbeat watches
  armed-ness and per-workflow cadence), **34** (README opens on
  three doors beside generated SVG diagrams), **36** (scripts
  behave the same from a spaced path, under concurrent
  sessions, on Windows — ledger/notice-board concurrency, the
  diagram and loop-issue suites gated), **37** (heads-down beats
  its ledger and wears its star; every committing skill lands
  per owner mode; plan-check reads the settled view).
- Spec 41 (GUI steering/tugs/design/release): 41.1 (linked
  terminal sessions take an owner line), 41.3 (the Claude
  Design handoff ported as the whole GUI, both themes), 41.4
  (`@usenexus/cli` 0.1.0 published from its tag with
  provenance), 41.5 (Trusted Publisher validated, stray
  hand-published npm versions deprecated), 41.2 (the stage
  draws each tug's path, state and age) — 4 chunks left
  (`41.6`-`41.9`: fidelity pass, board times/marks, fleet
  details, a lighter package).
- Foundational: pending files + `settle` + `claims` now
  dogfooded on nexus's own plan (the same machinery adopters
  get); the v1 phase-numbered plan converted to the v2
  specs/chunks shape, `/ship-a-phase` retired for
  `/ship-a-chunk`; the plan board (`npm run claims -- list`,
  `scripts/plan/order.mjs`, `progress.mjs --json`) now reads
  live claim/progress data instead of static files.

## Queues now

- **Build plan:** 5 specs, 18 chunks left, 4 held (unchanged:
  `35.8`, `35.9`, `38.3`, `39.4`, all waiting on the owner's
  word). All 18 remaining chunks are currently claimed `live`
  by one session (`SWAN`, claimed 2026-10-21T15:02:50Z, ~25min
  before this pass) — nothing is pick-able right now regardless
  of `march`'s state.
- **AUDIT:** 4 pending, unchanged — three durable
  `[user-issue #40/#35/#49]` rows (still blocked on the same
  cloud-push-token-lacks-workflows-scope class) and the carried
  `[D/A, 2.7, low confidence]` row (`new-project.md`'s "12-17"
  vs "10-20" phase-count band). Header dated 2026-10-19, ~46h
  old — under the 48h refresh bar, so no resweep this tick.
- **CRITIQUE:** 0 pending, last pass 40h ago (2026-10-20, pass
  27). The commit-count gate (`march.md` step 2: ≥12 commits
  since last pass) is now blown way past — 120+ commits since
  pass 27 — so the next `march` tick dispatches `/critique`
  before anything else, once `march` is re-armed.
- **CANDIDATES:** 32 pending (31 >21d, oldest 112d, proposed
  2026-07-02) — one filed this pass (below). The queue grew by
  one today despite the busiest shipping day on record; nothing
  promoted out of it.
- **Issues:** 5 open (`#49`/`#48`, `#40`, `#35`/`#34`),
  unchanged. All five predate the v1→v2 rename and still speak
  in "phase" numbers even though the specs they mirror (20, 32)
  closed complete today — worth a human glance at whether
  they're stale now. No open `triage:needs-user` or `loop:do`
  issues.

## Needs you

- **`march` is paused, not broken** — `disabled_manually` since
  2026-10-20T23:20:24Z, the owner's own call mid-`/heads-down`.
  Re-arm with `gh workflow enable march` when the session's
  done; the armed-ness check (shipped today, `b6acc842`) will
  keep filing one quiet "not armed" issue in the meantime rather
  than paging on every tick.
- **`heartbeat` is currently red** — its last two runs
  (2026-10-21T04:43, 11:46) hard-failed on the same disabled-`march`
  lookup; see the filed candidate below. The watchdog isn't
  watching right now.
- oversight needed: candidate queue silting (31 pending >21d,
  oldest 112d) — both silting thresholds (≥5 pending >21d,
  oldest >45d) stay cleared, same standing alarm as every digest
  for weeks now; still nothing promoted out of it even on a day
  that otherwise cleared five whole specs.

## Today's intent

No chunk is pick-able (all 18 remaining chunks sit claimed by
`SWAN`), and `march` itself is disabled, so there is no literal
"next tick" right now. If/when `march` is re-armed, its own gate
order means `/critique` fires first (commit-count gate blown
past 10x over), then — once `SWAN`'s claims release or go
stale — the `41.9`-class remainder of spec 41, then likely
`/expand` (posture `bold`, ≥20 commits comfortably cleared
since `CANDIDATES.md`'s 2026-10-15 last pass, with the AUDIT
and CANDIDATES queues both still carrying live signal).

## Tuning proposals

- Filed: `heartbeat`'s "Cancel wedged runs" step resolves
  watched workflows by display name (`gh run list --workflow
  "$wf"`) with no armed-state guard, so it hard-fails — rather
  than skipping, like its two sibling steps (shipped today in
  the same commit) already do — whenever a watched workflow
  isn't `active`. Confirmed twice today against the real,
  currently-disabled `march`. `plan/CANDIDATES.md`, `[score
  7.0]`, filed this pass.
