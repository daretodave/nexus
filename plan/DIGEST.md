# Digest — 2026-08-01

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Four clean march ticks — the two AUDIT rows this digest called
as tomorrow's picks both shipped exactly as predicted (the
CLAUDE.md pointer wording, the CURRENT-STATE.md tree gap), a
fresh critique pass filed three low-severity findings, and one
new issue (#33) got triaged straight into the queue; zero
no-ops, zero crashes, and the trailer-gap candidate picked up
its first counter-evidence in three samples.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-31 09:02 | night → digest | previous digest (`c2a9733`) |
| 07-31 14:49 | march → iterate | shipped AUDIT `[A, 2.7]` — `templates/claude/CLAUDE.md` grew to 8 lines but README.md, templates/README.md and customization/claude-code.md still called/quoted it as the old 2-3 line pointer; reworded tree labels to "short pointer" and refreshed the quoted block (`aca30e5`) |
| 07-31 20:29 | march → iterate | shipped AUDIT `[A, 2.4]` — `templates/plan/README.md`'s layout tree omitted `CURRENT-STATE.md`, a real adopt-by-need file both `templates/README.md` and `existing-project.md` already treat as such (`2226240`) |
| 08-01 03:04 | march → critique | pass 10 — 3 findings (0 high, 1 med, 2 low): README's 30-90min agent-paced estimate still disagrees with new-project.md's "well under an hour" (a regression of a prior fix); "How to use this kit" step 5 names only 2 of 8 placeholders; "Posture-gated" used once with no link. No HIGH blockers; the copy+replace+prune walk itself ran clean (`d12b8f7`) |
| 08-01 08:47 | march → triage | routed #33 (`guard.mjs`'s no-verify regex matches across newlines, a cross-line false-positive affecting all four forbidden-command rules, not just no-verify) into AUDIT as `[user-issue #33]` (`808c398`) |
| 08-01 11:01 | night → digest | this tick |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `aca30e5` — closed AUDIT `[A, 2.7]`: CLAUDE.md pointer
  description reconciled across three docs to match the real
  8-line template.
- `2226240` — closed AUDIT `[A, 2.4]`: `templates/plan/README.md`'s
  layout tree now lists `CURRENT-STATE.md`.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** header `2026-07-30` (~44h old this tick, still under
  the 48h refresh threshold — no re-sweep needed). 3 scored
  Pending rows plus the durable blocked one: `[user-issue #33]`
  (impact 5, ease 7, score 3.5 — now the top open row, freshly
  filed this window), `[C, 2.4]` (two docs cite
  `skills/digest.md §4` for content actually in §3 item 4),
  `[A, 1.35]` (`cloud-loop.md`'s "three new files" header lists
  only two). `[user-issue #12]` unchanged since 2026-07-12
  (20 days), still the durable blocked top row.
- **CRITIQUE:** 3 pending (pass 10, 2026-08-01 — see pulse table
  above for the findings). Fresh; not due again this window.
- **PHASE_CANDIDATES:** 21 pending, flat — no `/expand` tick ran
  this window. Posture still bold. Zero promotions since the
  queue opened 2026-07-02, now 30 days running.
- **Issues:** 2 open — `#12` (`triage:loop-queued`, durable
  blocked) and `#33` (`triage:loop-queued`, freshly routed this
  window). No `triage:needs-user` or `loop:do` labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 5 `Cloud-Run:`-tagged commits in the trailing 24h
  (4 march ticks + 1 digest), all five carrying the trailer
  correctly — well under the 8/24h ceiling. Notably `d12b8f7`
  (a `/critique` commit) carried it correctly too: the standing
  "critique commits sometimes drop the trailer" candidate has
  now seen its trailer present on the most recent sample after
  two prior misses (`a74f7b6` 07-19, `427eb91` 07-25) — first
  counter-evidence, not yet enough to retire the candidate.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml` still
  needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues only,
  so the cloud loop can never push to `.github/workflows/*.yml`
  itself. Needs a human, or a locally-run `/iterate` with a
  personal workflow-scoped `gh` token. Tracked as AUDIT
  `[user-issue #12]`, still the only blocked row.
- **Candidate backlog** — 21 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted in 30 days. The `[score 9.0]` `new-project.md`
  step-4/7 rewrite remains the clearest promote-first candidate
  (six re-evidencing cycles to date); worth an `/oversight` pass.
  Unchanged in substance from prior digests, no new evidence this
  window.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). CRITIQUE just
refreshed and isn't due again. AUDIT's own top-scoring open row
is now `[user-issue #33]` (score 3.5, impact 5/ease 7) — the
`guard.mjs` regex fix has a concrete next step (add `\n` to the
four negated character classes, plus a multi-line `selfTest()`
case) and clearly outranks the remaining `2.4`/`1.35` cosmetic
rows.

## Tuning proposals

None new this tick. Four march ticks, four green runs, zero
no-ops, zero crashes — a repeat of last window's clean pattern,
which argues against a gate retune. The one piece of fresh
signal — `d12b8f7` carrying its `Cloud-Run:` trailer correctly —
is counter-evidence against the existing trailer-gap candidate
in `plan/PHASE_CANDIDATES.md`, not grounds for a new one; noted
above under Ceiling for whoever next reviews that candidate. The
30-day candidate-promotion drought remains a standing
observation (see "Needs you"), not a gate defect: `/oversight` is
the only skill that promotes, and its cadence isn't this loop's
tuning to propose. Per `skills/digest.md` §4, gate tunings remain
proposals only.
