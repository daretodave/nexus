# Digest — 2026-11-20

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A productive overnight burst — two quiet gaps on either side
of a long chain that released both Held specs from veto,
shipped spec 66 end to end (4 chunks: key custody index, the
orphan/ghost/ambiguous lint, the hands-off `--until` guard,
and the filled custody rows plus the owner ask for
`ACTIONS_PAT`'s real expiry), chunked spec 67, and shipped two
more of its chunks (`build-plugin.mjs` + the generated
`plugin/`, then the `adopt`/`upgrade`/`doctor` commands) —
left AUDIT's refresh overdue (fixed this tick) and motion
still reading stalled off last week's number.

## While you were out

`seven_day utilization: 0.72 (allowed, resets
2026-11-23T08:00:00Z)`.

Window: since the last digest commit (2026-11-19 19:09 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-19 21:35 → 21:41 | march | no-op. |
| 11-19 21:41 → 21:46 | march (retry) | no-op. |
| 11-20 03:17 → 03:24 | march → plan | `1a182c1` veto sweep — vetoed 0, released 2 (66, 67 out of Held). |
| 11-20 03:24 → 03:35 | march (chain) → chunk + build | `5fe05d3` chunk spec 66; `4df8fbb`/`76a1339`/`0021123` — 66.1 (key custody index), closed + settled. |
| 11-20 03:35 → 03:49 | march (chain) → build | `77d5dd1`/`09d71ea`/`c356d2b`/`a0eca76` — 66.2 (keys-audit lint), closed + settled. |
| 11-20 03:49 → 04:00 | march (chain) → build | `5d8e5f8`/`2c9a0c3`/`c543d03`/`7835b3d` — 66.3 (hands-off `--until` guard), closed + settled. |
| 11-20 04:00 → 04:09 | march (chain) → build | `7f9acfd`/`ea6e4cf`/`5f5fdd1` — 66.4 (custody rows filled, `ACTIONS_PAT` expiry ask filed), closed + settled; spec 66 complete. |
| 11-20 04:09 → 04:14 | march (chain) → chunk | `41a9b0a` chunk spec 67. |
| 11-20 04:14 → 04:29 | march (chain) → build | `3372b15`/`8028031`/`67331da`/`8a0cc98` — 67.1 (`build-plugin.mjs` + generated `plugin/`), closed + settled. |
| 11-20 12:54 → 13:11 | march → build | `2df46dd`/`d492cd1`/`f5319a8`/`4bc376c`/`095b187` — 67.2 (plugin ships `adopt`/`upgrade`/`doctor`), closed + settled. |

`heartbeat` ran clean throughout (5/5 sampled). Two quiet gaps
inside the window (21:46 → 03:17, ~5h31m; 04:29 → 12:54,
~8h25m) and a third still open — no march tick observed since
13:11 UTC (~5h31m as of this digest).

## Shipped

- `plan`: veto sweep released both Held specs (66, 67; 0
  vetoed) at the top of the window's long chain.
- spec 66 complete (4 of 4 chunks): `identity/key-custody.md`
  + `templates/setup/00_keys.md` carry real custody rows for
  every credential; `scripts/keys-audit.mjs` lints orphan,
  ghost and ambiguous rows (folded into the gate's `secrets`
  leg); `playbooks/hands-off.md`'s pre-flight now refuses an
  unattended window past a custody `Expires` date;
  `ACTIONS_PAT`'s own `Expires` stays `unconfirmed` behind a
  new `[needs-user-call]` row (owner-only, GitHub's token UI).
- spec 67 chunked (5 chunks, next A7) and 2 of 5 shipped:
  `scripts/build-plugin.mjs` generates `plugin/` and the
  repo-root marketplace entry; the plugin's three generated
  commands vendor `prompts/doctor.md` (new) alongside the
  existing `adopt`/`upgrade` prompts. Next ready chunk: 67.3
  (the `plugin` verify leg, byte-diffs `plugin/` against a
  fresh `build-plugin.mjs` render) — S, no workflow-file edit,
  a cloud tick can pick it.
- `plan/AUDIT.md` refreshed this tick (see Queues now — it had
  gone past the 48h staleness window).

## Queues now

- **Build plan:** 4 specs, 5 chunks left (65.1 and 68.1 — both
  local-session only), 0 chunk-level holds. Held lane: only 69
  remains, veto until 2026-11-22 (66 and 67 released this
  window).
- **AUDIT:** 3 pending, refreshed this tick (was last-pass
  2026-11-18, ~67h stale; now 2026-11-20, pass 133). Top rows
  unchanged in substance: `#96`, the `ACTIONS_PAT` expiry ask,
  and `[A, 3.0]` (root workflow pins behind `templates/`).
- **CRITIQUE:** 0 pending, last pass 2026-11-18 (pass 37,
  unchanged — no new pass fired this window).
- **CANDIDATES:** 16 pending (11 >21d), oldest 141d (proposed
  2026-07-03) — net this window: none (no `/expand` pass
  fired; cuts since the last digest: none).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 10 since `cli-v0.6.5` — `da4d724`
  fix(cli): onboarding stepper shows a step count instead of
  clipping on mobile, `9213170` fix(cli): Fleet tile phase
  track titles disambiguate the two "Q" segments, `00b0a69`
  fix(cli): Oversight filter row scrolls instead of clipping on
  mobile, `b348c6e` fix(cli): mobile Welcome loop diagram no
  longer overlaps itself, `a36935f` fix(cli): the onboarding
  Welcome headline wraps naturally on narrow phones, `49f54b5`
  fix(cli): bump stale Fable 5.1 model id/label to Fable 5.2,
  `23c4632` fix(test): feed.test.mjs's fixture commits stop
  drifting to the loop's own git identity, `7767c92`
  feat(upgrade): sync report cites CHANGELOG.md entries (61.3),
  `972fe48` fix(cli): the favicon's own 404 stops showing up as
  a UI-walk finding, and `ca3c79f` feat: loop throughput
  (mirror-orphan generator, depth promotion, product-first
  pick, Research `<n>d`). Unchanged this window — no
  `packages/cli` commits landed.

## Needs you

- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes. Unchanged.
- blocked: spec 65 (65.1) and spec 68 (68.1, `#115`) — both
  chunks edit `.github/workflows/*.yml` directly and need a
  local session; no cloud tick's token can push either.
  Unchanged.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest, still open; the only remaining lever is a
  cadence-preset workflow-file edit no cloud tick can push
  (`agents.md` Operational secrets).
- `[needs-user-call]` — `ACTIONS_PAT`'s real expiry is
  unconfirmed in `identity/key-custody.md` (new this window,
  filed by 66.4): an owner session reads the real date from
  GitHub's token settings UI and fills the `Expires` column.
  Lock `actions-pat-expiry`, since 2026-11-20, max_age 30d.
- auto-promoted 69 plan/ carries the workspace: resurrection +
  a doctor (veto until 2026-11-22, `#125`), 0 awaiting — the
  only Held line left; 66 and 67 released this window's veto
  sweep.
- motion stalled: shipped 20 / baseline 159.5 · 2026-W46
  against 2026-W42..2026-W45 (22 so far in 2026-W47) — floor
  79.75, 20 is under 50% of baseline. Reads off last week's
  full-week number, not this window's burst; not a new alarm.
- No `triage:needs-user` issues, no `loop:do` issues. Secrets
  rotation check skipped — that log is local, this is a cloud
  run.

## Today's intent

Spec 67's 67.3 (the `plugin` verify leg, byte-diffing
`plugin/` against a fresh `build-plugin.mjs` render) is ready
and cloud-pickable — no workflow-file edit. Spec 65's only
chunk (65.1) and spec 68's only chunk (68.1, `#115`) both still
need a local session. Top audit finding: `#96` `[HIGH]`
`[needs-user-call]` — march's realized cadence under a
workflow-token push limitation only the owner can resolve with
a cadence-preset edit. Unresolved, unchanged since the last
digest.

## Tuning proposals

none — no new mistuned-gate evidence this pass. The veto sweep
and chunk/build chain ran exactly as tuned, and today's burst
(6 chunks across two specs) is itself evidence the gate isn't
starved right now, just irregular in when it fires (`#96`,
already tracked). The two already-filed silt candidates stay
open and unchanged: `[score 4.8]` (heartbeat's quota-skip blind
spot) and `[score 3.5]` (`pulse.mjs`'s `[promoted]`-row
pending-count gap).
