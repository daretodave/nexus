# Digest — 2026-11-06

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

An 8-tick chained run closed out spec 39 entirely (five chunks,
21:06→22:36 UTC) and triaged two issues along the way; two
quiet ticks since (09:25, 17:30, both ~16s no-ops) found nothing
new to ship, leaving both build-plan rows (60, 61) unchunked and
motion still reading `stalled`. `/expand`'s pass 24 cut a
same-tick-re-evidenced candidate to Rejected purely on its
original proposed-date — a real cap-cut edge case, filed below
as a tuning proposal.

## While you were out

Window: since the last digest commit (2026-11-05 18:21 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-05 21:12, 21:19 | march (motion stall promotion) | `1eccf79`/`1fead21` — specs 60, 61 auto-promoted into Held (veto until 2026-11-08, issues `#94`/`#95`). |
| 11-05 21:24 | march → triage | `54bdcdb` — 2 issues routed. |
| 11-05 21:32→21:37 | march → next | `c6640c0`→`4d75bed` — support SLA close (`#91`, not plotted) and chunk `39.8` (no-deploy-host path in `agents.md`/`bearings.md`/`ci-providers.md`). |
| 11-05 21:39 | march → audit | `c443afb` — filed `[B, 5.6]` (builder briefs skip the Cloud-Run trailer instruction). |
| 11-05 21:55→22:15 | march → next | `c2f4967`→`e83a44a` — chunks `39.13` (placeholders leg reads the settled view) and `39.11` (templates/README gate-cost notes; `actions/checkout`+`setup-node` bumped to v5 in templates, `nudge.yml`'s twin kept at v4 for parity). |
| 11-05 22:16 | march → audit | `2a741a3` — filed `[A, 39.11]` (root workflows trail templates at v4) and `[B, 39.11]` (one test runs in no gate). |
| 11-05 22:24→22:36 | march → next | `2da8d42`→`4941f45` — chunks `39.14` (pr-flow deletes a merged loop PR's branch) and `39.15` (adopt falls back to owner with no remote); spec 39 closed complete. |
| 11-06 01:34→01:44 | march → refill/research/expand | `0d4a3b1`/`2421f20`/`98f529a` — refilled 2 AUDIT rows (motion stall, a ui-walk console-error finding), filed 1 field-research candidate, expand pass 24 filed 1 candidate and cut 5 stale (see Tuning proposals). |
| 11-06 09:25 | march | No-op, ~17s — no new work found. |
| 11-06 17:30 | march | No-op, ~16s — no new work found. |

`heartbeat` ran clean throughout (5/5 sampled, no failures).
`seven_day utilization: 0.06 (allowed)` — comfortably clear.

## Shipped

- **39** — spec complete: a no-deploy-host path is documented
  (`agents.md`, `bearings.md`, `ci-providers.md`); the
  placeholders gate reads the settled view; `templates/README`
  names each test's gate cost and templates' own
  `actions/checkout`/`setup-node` move to v5; a merged loop PR's
  branch is deleted; adoption into a remote-less repo now
  defaults to owner mode.
- `triage`: 2 issues routed. `support.mjs`: `#91` closed, not
  plotted (SLA).
- `/refill`: two new AUDIT rows — `[loop] HIGH` motion stalled
  (25 shipped vs. baseline 153.25) and `[H, 5.6]` a GUI favicon
  404 console error (fleet-to-tug, desktop).
- `/expand` pass 24: one new candidate (score 7.5 — reconcile
  four clustered `playbooks/new-project.md` CRITIQUE findings in
  one pass); cut 5 stale Pending rows to Rejected over the
  15-row cap (see Tuning proposals for the one worth a second
  look).
- `research`: one field candidate (score 6.0 — spec-driven-dev
  toolkits debating static vs. live spec state).
- Two AUDIT findings filed mid-chain: the builder-brief
  Cloud-Run-trailer gap (`[B, 5.6]`) and nexus's own root
  workflows trailing `templates/` at `@v4` plus one ungated test
  (`[A, 39.11]`, `[B, 39.11]`).

## Queues now

- **Build plan:** 2 specs, 0 chunks (both `60`, `61` still
  "not chunked yet"), 2 held — both in veto window (see Needs
  you).
- **AUDIT:** 10 pending, header 2026-11-05 (<48h, not stale).
  Three-way tie at the top score (5.6): the builder-brief
  trailer gap, README's secrets-vault entry-point gap, and the
  GUI favicon 404.
- **CRITIQUE:** 6 pending, last pass 14d ago — unchanged; top
  row is the `[HIGH]` `prompts/adopt.md` vs.
  `playbooks/new-project.md` commit-instruction contradiction
  (already the subject of `/expand`'s new candidate above).
- **CANDIDATES:** 27 pending (24 >21d), oldest 128d (proposed
  2026-07-02) — one filed, one cut net this pass (expand added
  1, cut 5, refill/research added 2 AUDIT rows not candidates).
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.
- **Unreleased CLI fixes:** 1 since `cli-v0.6.5` — `ca3c79f`
  feat: loop throughput (mirror-orphan generator, depth
  promotion, product-first pick, Research `<n>d`); unchanged
  from yesterday.

## Needs you

- auto-promoted 60 README above-the-fold conversion pass (veto
  until 2026-11-08, `#94`), 1 awaiting.
- auto-promoted 61 Versioned releases + plan/nexus.lock +
  upgrade story (veto until 2026-11-08, `#95`), 1 awaiting.
- cut 2026-11-06 [score 5.5] playbooks/outgrow.md — the split
  ceremony.
- cut 2026-11-06 [score 5.9] Staged hardening for verify legs.
- cut 2026-11-06 [score 6.1] Critique-household pattern for
  auth-aware critique.
- cut 2026-11-06 [score 6.3] AUDIT's unwritten "favor the queue"
  tie-break is starving a cheap, real AUDIT-native row.
- cut 2026-11-06 [score 6.5] Mechanically verify the Cloud-Run
  trailer on cloud ticks.
- motion stalled: shipped 25 / baseline 153.25 · 2026-W44
  against 2026-W40..2026-W43 (8 so far in 2026-W45).
- No `triage:needs-user` issues, no `loop:do` issues, no
  `[needs-user-call]` rows, no secrets overdue for rotation
  (`secrets.mjs audit`: 0 events). Issue `#93` (heartbeat:
  march flatlined) is `triage:loop-queued`, not a needs-user
  escalation — already the AUDIT row above. Issue `#92`
  (heartbeat: motion stalled, opened 2026-11-02) remains open,
  same stall this digest's own refill re-filed today.

## Today's intent

No ready chunk — both `60` and `61` are "planned," not yet
chunked. Audit's top finding (three-way tie, score 5.6): the
builder-brief Cloud-Run-trailer gap, README's secrets-vault
entry-point gap, or the GUI favicon 404 — whichever `/iterate`
picks first.

## Tuning proposals

One: **`promote.mjs`'s cap cut reads a candidate's original
`- proposed:` date and score only, so a row re-evidenced the
same tick it gets cut still gets cut** (`scripts/plan/
promote.mjs`'s `capCut`, lines 385-391: it filters on
`daysBetween(c.proposed, date) >= STALE_DAYS` and sorts by
`score`/`proposed`, never reading `reEvidence`). Expand pass 24
(`98f529a`) hit this directly: "Mechanically verify the
Cloud-Run trailer on cloud ticks" (score 6.5) gained a fourth
`re-evidenced` date line earlier in the very same tick, then was
cut to Rejected by the same tick's `cap --write` pass minutes
later, because the cut logic only ever looks at the row's first
`proposed` date (2026-07-20) and its score — the fresh
re-evidence never registers as a reason to spare it. Real per
the script's documented contract (`pending_cap`: lowest-scoring
rows 60+ days old, 5 a pass), not a bug, but a mistuned edge:
the one signal (`/expand`'s own re-evidence bump) meant to keep
a row alive is invisible to the one gate (`cap`) that kills it.
Proposal (not applied): have `capCut` exclude rows with a
`reEvidence` bump recorded on the same `date` as the cut, or
simply sort re-evidenced-today rows last regardless of score.
`/oversight` decides; needs a human call on whether "re-evidenced
today" should grant a full pass or just a tie-break nudge. Never
edited directly — proposal only.
