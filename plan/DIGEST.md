# Digest — 2026-11-12

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Spec 62 (handshake runbook profile for `setup/`) shipped all
three chunks and closed outright, a motion-stall promotion
lifted spec 65 into Held on its own schedule, critique pass 34
filed one new finding — but the loop's cadence gap recurred
again, a fresh ~8h stretch (03:13→11:12 UTC) with no march tick
at all, the same root cause the still-open `#96` already
tracks.

## While you were out

Window: since the last digest commit (2026-11-11 18:03 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-11 21:58→22:03 | march → chunk | `5564dde` — spec 62 (handshake runbook profile for `setup/`) chunked into 62.1–62.3. |
| 11-12 03:00→03:13 | march → motion-stall promotion → next | `589f52b` auto-promoted spec 65 (workflow-push credential gap, `#104`, veto until 2026-11-15) off the W45 motion stall; `c42f2b0`+`6a5f49c`+`c6c797b` built, closed, settled chunk 62.1: `templates/setup/NN_service.handshake.md`, the lighter handshake runbook profile. |
| 11-12 11:12→11:25 | march → critique | `61add7d` — pass 34: 1 finding (0 high, 1 med, 0 low). |
| 11-12 11:25→11:35 | march → next | `7ec384d`+`3c0d1f6`+`f3e1c1f` — built, closed, settled chunk 62.2: `customization/external-services.md` states the full-vs-handshake choosing rule. |
| 11-12 11:35→11:43 | march → next | `41f0a3`+`6c3305c`+`40050d7` — built, closed, settled chunk 62.3: a `Profile` column (full\|handshake) lands in `templates/setup/00_files.md`'s Index table; spec 62 complete. |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.76 (allowed_warning, resets
2026-11-16T08:00:00Z)`. The 03:13→11:12 gap (no march tick for
~8h) is the same cadence throttling `#96` already tracks, not a
new finding — the third such gap digests have logged.

## Shipped

- `/next`: built, closed and settled chunks 62.1–62.3 — `setup/`
  now offers a second, lighter handshake runbook profile
  alongside the full A-H one, a choosing rule in
  `customization/external-services.md`, and a `Profile` column
  in `00_files.md`'s Index table; spec 62 complete.
- motion-stall promotion: spec 65 (workflow-push credential
  gap: test the fix, stop re-discovering it) auto-promoted off
  Held's `stall_action: promote` lever (`#104`), veto until
  2026-11-15.
- `/critique` pass 34: 1 new finding (0 high, 1 med, 0 low).

## Queues now

- **Build plan:** 1 spec, 0 chunks left, 0 held (per
  `pulse.mjs`). Spec 65 sits in the Held lane (veto until
  2026-11-15, `#104`) and isn't chunked yet — the next ready
  tick likely falls through to `critique`/`iterate` until the
  veto lapses.
- **AUDIT:** 8 pending, last pass refreshed this tick (was
  2026-11-10, now past the 48h threshold). All 8 Pending rows
  re-verified against current `main` and reproduced unchanged;
  `[user-issue #96]` confirmed still open; the `[loop, HIGH]`
  motion row's W46 count moved from 8 to 20 so far. No new rows
  found — see `plan/AUDIT.md`'s 2026-11-12 narrative for the
  per-row check.
- **CRITIQUE:** 14 pending, last pass 7h ago (pass 34 filed 1
  new finding this window).
- **CANDIDATES:** 25 pending (23 >21d), oldest 134d (proposed
  2026-07-02) — no promotions or cuts to the Pending list since
  the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 4 since `cli-v0.6.5` (unchanged) —
  `23c4632` fix(test): feed.test.mjs git-identity drift,
  `7767c92` feat(upgrade): sync report cites CHANGELOG.md
  entries, `972fe48` fix(cli): favicon 404, and `ca3c79f` feat:
  loop throughput (mirror-orphan generator, depth promotion,
  product-first pick, Research `<n>d`).

## Needs you

- blocked: `[A, 3.0]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, now behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes. Unchanged.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest — this window shows another ~8h gap (03:13→11:12 UTC)
  with no march tick at all; the only remaining lever is a
  cadence-preset workflow-file edit no cloud tick can push
  (`agents.md` Operational secrets).
- auto-promoted 65 Workflow-push credential gap: test the fix,
  stop re-discovering it (veto until 2026-11-15, `#104`), 0
  awaiting — released into the Held lane by the W45 motion
  stall this window; still inside its veto window, not chunked
  yet.
- motion stalled: shipped 12 / baseline 158.25 · 2026-W45
  against 2026-W41..2026-W44 (20 so far in 2026-W46) — the same
  already-final reading as the last two digests, not a new
  stall; W46 is still building up.
- No `triage:needs-user` issues, no `loop:do` issues, no new
  Pending-cap cuts since the last digest, no secrets overdue for
  rotation (0 audit events logged this environment).

## Today's intent

No chunk ready: spec 65 (workflow-push credential gap) sits
Held until its 2026-11-15 veto lapses, so the next tick likely
falls to `critique`/`iterate`. Top audit finding: `[loop, HIGH]`
motion stalled in 2026-W45 (12 shipped against a 4-week baseline
of 158.25) — unresolved; the reading itself is already final and
unchanged since the prior two digests.

## Tuning proposals

none — the motion stall is fully explained by `#96` (cadence
throttling), already `[needs-user-call]` and blocked on an
owner cadence-preset push; no new mistuned gate surfaced this
pass. The candidates queue's silting is still the filed
`[score 3.5]` candidate (the `[promoted]`-row pulse-count gap)
rather than a fresh one.
