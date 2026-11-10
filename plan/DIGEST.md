# Digest — 2026-11-10

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Spec 60 (README above-the-fold conversion) shipped its last
three chunks and closed outright, and issue `#102` went from
triage to a fixed, settled spec (63) inside one tick — but the
loop's own cadence kept throttling underneath: only 3 of
today's ~8 eager-preset `march` slots fired, and motion
stalled a second straight week (12 shipped against a 158
baseline, worse than last week's 25/153). Same root cause as
the still-open `#96`.

## While you were out

Window: since the last digest commit (2026-11-09 21:00 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-10 01:32→01:40 | march → next | `c43b02c`+`b6a84e7`+`f0d06ef` — built, closed, settled chunk 60.2: README gained a march-loop proof strip above the fold. |
| 11-10 01:40→01:48 | march → next | `777f055`+`91fbc67`+`445f031` — built, closed, settled chunk 60.3: "Pick a playbook" became a you-have/do-this/time table. |
| 11-10 01:48→02:23 | march → next | `63286fd`+`8ce7214`+`02d3094` — built, closed, settled chunk 60.4: README trimmed to its 350-500 line budget; spec 60 (README above-the-fold conversion) complete. |
| 11-10 09:51→10:05 | march → plot asap → next | `d170404`+`bf7a38c`+`5d468fc`+`e01b827` — plotted `#102` as spec 63 (past `sla_hours` with no Asap line naming it) and built, closed, settled it the same tick as chunk 63.1: `settle.mjs` now writes the ladder's own ARCHIVE "spec complete" line on a last-chunk close. |
| 11-10 17:51→18:03 | march → critique | `595ae50` — pass 32: 1 new finding (0 high, 1 med, 0 low) — `playbooks/new-project.md`'s Day-1 checklist design-artifact box doesn't map back to a completed step. |

`heartbeat` ran clean throughout (5/5 sampled, no
failures). `seven_day utilization: 0.6 (allowed_warning,
resets 2026-11-16T08:00:00Z)`.

## Shipped

- `/next`: built, closed and settled chunks 60.2–60.4 — a
  proof strip above the fold, the playbook picker as a table,
  and the README trimmed to budget; spec 60 complete.
- `/plot asap` + `/next`: `#102` (`settle.mjs`'s ladder-close
  gap, found closing spec 99 yesterday) plotted as spec 63 and
  shipped same-tick as chunk 63.1 — `settle.mjs` now writes
  its own ARCHIVE "spec complete" line when a ladder's last
  chunk closes.
- `/critique` pass 32: filed 1 new MED finding (the Day-1
  checklist's design-artifact box in `playbooks/new-project.md`);
  no fix shipped same-tick (critique files, iterate ships).

## Queues now

- **Build plan:** 2 specs, 0 chunks left. Specs 61, 62: both
  not chunked yet — no chunk ready, so `march` falls through
  to `critique`/`iterate` (`triage → critique → chunk → expand
  → iterate` order, working as designed). 1 held — `62`
  (veto until 2026-11-10, `#98`).
- **AUDIT:** 6 pending, refreshed this pass (`> Last pass:` was
  2026-11-08, >48h stale) — durable rows kept verbatim; filed
  one new `[F, 3.6]` freshness row (Fable 5.1→5.2 drift in
  `packages/cli`); refreshed the generator-filed `[loop]` row
  to this week's motion reading; corrected a mislabeled score
  bracket (`[A, 39.11]` → `[A, 3.0]`, the chunk id had been
  written where the score belonged).
- **CRITIQUE:** 11 pending, last pass 18h ago (pass 32 filed 1
  new finding this window, see above).
- **CANDIDATES:** 26 pending (22 >21d), oldest 132d (proposed
  2026-07-02) — no promotions or cuts since the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 2 since `cli-v0.6.5` (unchanged
  since yesterday) — `972fe48` fix(cli): favicon 404, and
  `ca3c79f` feat: loop throughput (mirror-orphan generator,
  depth promotion, product-first pick, Research `<n>d`).

## Needs you

- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest — today's own scheduled `march` runs landed at
  01:32, 09:51 and 17:51 UTC, 3 of roughly 8 slots the eager
  preset promises; the only remaining lever is a cadence-preset
  workflow-file edit no cloud tick can push (`agents.md`
  Operational secrets); needs an owner session or acceptance
  of the throttling.
- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, now behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes.
- auto-promoted 62 Handshake runbook profile for setup/ (veto
  until 2026-11-10, `#98`), 0 awaiting — unchanged; the sweep
  this tick still reads "0 of 1 auto-promoted Held lines due".
- motion stalled: shipped 12 / baseline 158.25 · 2026-W45
  against 2026-W41..2026-W44 (8 so far in 2026-W46) — a
  second consecutive stalled week (W44: 25/153.25), same root
  cause as `#96` above.
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (local-only check, skipped on
  this cloud run). No new Pending-cap cuts since the last
  digest.

## Today's intent

No chunk ready: specs 61 and 62 both still await shaping, so
the next tick lands on `critique` or `iterate` rather than
`next`. Top audit finding: `[F, 3.6]` — `packages/cli/shared/
models.mjs:8` and its test fixtures (`model.test.mjs`,
`model-ui.test.mjs`) still carry `claude-fable-5-1` / "Fable
5.1" against the current "Fable 5.2" lineup.

## Tuning proposals

none — the motion stall is already explained by `#96`
(cadence throttling), already `[needs-user-call]` and blocked
on an owner cadence-preset push; no new mistuned gate surfaced
this pass. The candidates queue's silting is still the filed
`[score 3.5]` candidate (the `[promoted]`-row pulse-count gap)
rather than a fresh one.
