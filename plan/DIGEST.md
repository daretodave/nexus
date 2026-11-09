# Digest — 2026-11-09

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Spec 60 got shaped and shipped its first chunk, and spec 99
(the `md-anchor-rename` ladder) closed outright — whose own
closing exposed a fresh `settle.mjs` gap (`#102`), filed by
the same window's triage. One late tick failed on what looks
like a GitHub Actions dispatch blip, not a code regression.
Candidates queue keeps silting (22 of 26 pending now >21d)
and `#96` (cadence) is still parked needs-user-call.

## While you were out

Window: since the last digest commit (2026-11-08 16:50 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-08 19:42→19:52 | march → critique | `fd18d57` — pass 31: 5 findings filed (2 high, 2 med, 1 low) from a dry-run "halcyon" adoption walk plus a 72-screen GUI pass. |
| 11-08 23:44→23:50 | march → iterate | `1c17626` — closed `[A, 3.6]`: `plan/bearings.md`'s locked Stack table still said "Node ≥18"; fixed to ≥20. |
| 11-09 06:31→06:37 | march → shape | `38d245d` + `c4a8b5c` — veto sweep released specs 60 and 61 from Held (0 vetoed, 2 released); chunked spec 60 into 4 chunks. |
| 11-09 17:30→17:47 | march → next | `fa6db2f` + `6e48284` + `a9e4d98` — built, closed, settled chunk 60.1: README's three qualification sections merged into one gate, the two TL;DR walkthroughs into one three-door section. |
| 11-09 17:47→18:05 | march → next | `a19c7b6` + `6175db2` + `4d7173d` — built, closed, settled chunk 99.1: `verify.mjs`'s `links` leg now checks anchor fragments; spec 99 (the `md-anchor-rename` ladder) complete. |
| 11-09 18:05→18:09 | march → triage | `0ed7a91` — routed 1 issue (`#102`, filed while closing 99.1 above: `settle.mjs`'s ladder-removal branch never writes its own ARCHIVE "spec complete" line — had to be added by hand this same window). |
| 11-09 18:09→18:10 | march (chain) | **failed**, no commit — GitHub reports "this run likely failed because of a workflow file issue," 0 jobs ever started. Same `head_sha` as the clean state above; reads as a one-off Actions-dispatch blip, not a workflow-file or code regression. Not re-filed — one occurrence, self-resolving class (same precedent as the closed `#93` heartbeat flatline). |

`heartbeat` ran clean throughout (5/5 sampled, no
failures). `seven_day utilization: 0.43 (allowed_warning,
resets 2026-11-16T08:00:00Z)`.

## Shipped

- `/critique` pass 31: filed 5 new findings (2 high, 2 med,
  1 low); no fix shipped same-tick (critique files, iterate
  ships).
- `/iterate`: closed `[A, 3.6]` — the Node floor's last stale
  "≥18" mention, in `bearings.md`'s own locked table.
- `/march` shaping: veto sweep released specs 60 and 61 from
  Held; spec 60 chunked into 60.1–60.4.
- `/next`: built, closed and settled chunk 60.1 — spec 60's
  one qualification gate and one three-door section.
- `/next`: built, closed and settled chunk 99.1 — `verify.mjs`
  gained an anchor-fragment check on the `links` leg, and
  spec 99 (a ladder spec for a repeat footgun) closed
  complete.
- `/triage`: routed 1 new issue (`#102`, the `settle.mjs` gap
  found closing spec 99 above).

## Queues now

- **Build plan:** 3 specs, 3 chunks left. Spec 60: 3 left
  (60.2–60.4, next ready is 60.2). Specs 61, 62: not chunked
  yet. 1 held — `62` (veto until 2026-11-10, `#98`).
- **AUDIT:** 6 pending, header 2026-11-08 (<48h, no refresh
  needed this pass).
- **CRITIQUE:** 10 pending, last pass 45h ago (pass 31 filed
  5 new findings this window, see above).
- **CANDIDATES:** 26 pending (22 >21d), oldest 131d (proposed
  2026-07-02) — no promotions or cuts since the last digest.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 2 since `cli-v0.6.5` (unchanged
  since yesterday) — `972fe48` fix(cli): favicon 404, and
  `ca3c79f` feat: loop throughput (mirror-orphan generator,
  depth promotion, product-first pick, Research `<n>d`).

## Needs you

- auto-promoted 62 Handshake runbook profile for setup/ (veto
  until 2026-11-10, `#98`), 0 awaiting — the only line left in
  Held now that 60 and 61 graduated.
- `[needs-user-call]` — `#96` (heartbeat: march realized
  cadence below 40%, recurring): unchanged since the last
  digest — the only remaining lever is a cadence-preset
  workflow-file edit no cloud tick can push (`agents.md`
  Operational secrets); needs an owner session or acceptance
  of the throttling.
- blocked: `[A, 39.11]` — nexus's own root
  `.github/workflows/*.yml` still pin `checkout@v4` /
  `setup-node@v4`, now behind the `templates/` copies already
  bumped to `@v5`; needs a local session to push
  workflow-file changes.
- motion stalled: shipped 12 / baseline 158.25 · 2026-W45
  against 2026-W41..2026-W44 (3 so far in 2026-W46).
- No `triage:needs-user` issues, no `loop:do` issues, no
  secrets overdue for rotation (local-only check, skipped on
  this cloud run). No new Pending-cap cuts since the last
  digest.

## Today's intent

Next ready chunk: **60.2** — proof strip above the fold (S,
closes A5): the `march.yml` cron badge and a one-line
ouroboros claim move near `Three doors in`. Top audit finding:
`[C, 2.4]` — `identity/footguns.md:10` links to a
`README.md#footguns-the-ladder` anchor that doesn't exist in
its target; the self-hosted `identity/README.md` condensed
that content into a table row instead.

## Tuning proposals

none — `stall_action: promote` is already doing its job (it's
what put specs 60/61/62 in front of the loop this week); the
candidates queue's silting is already a filed candidate
(score 3.5, the `[promoted]`-row pulse-count gap) rather than
a new mistuned gate.
