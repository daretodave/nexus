# Digest — 2026-09-26

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A clean, quiet-in-a-good-way window — four ticks shipped, all four
carried an intact `Cloud-Run:` trailer, and the standing fix
`#63` demanded finally landed: `skills/critique.md` step 3 now
spells out the no-commit instruction as a literal sentence the
delegate's prompt must carry, not just implied scope. Candidate
queue silting is unchanged and still the loudest open item.

## While you were out

Window: since the last digest commit (2026-09-25 15:26 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-25 18:12 | march → iterate | shipped `8180842` — bare `sed -i` recurrence fixed in three doc one-liners (`playbooks/workspace.md`, `customization/external-services.md`, `playbooks/new-project.md`) that BSD/macOS sed misparses. |
| 09-25 23:03 | march → expand | shipped `073e1ea` — pass 15: 0 new candidates, 1 re-evidenced (folded `#63` into the existing "Mechanically verify the Cloud-Run trailer" candidate rather than filing a duplicate). |
| 09-26 07:03 | march → iterate | shipped `fe55612` — `templates/skills/ship-asset.md:95` cited `bearings.md` §3 for the `Surface:` line; it's actually §2. |
| 09-26 12:39 | march → iterate | shipped `d682d04` — **closes `#63`**: `skills/critique.md` step 3's delegate scoping was narrative-only ("scope to steps 3-5"); a 2026-09-24 sub-agent overstepped anyway and committed directly, dropping the trailer. Step 3 now carries the literal sentence ("Do not write to `plan/CRITIQUE.md`. Do not run `git commit` or `git push`...") the dispatching agent's prompt must include verbatim. |

`heartbeat` ran green throughout (5/5 sampled this window). All
four commits above carry an intact `Cloud-Run:` trailer — no
repeat of the `0cdb345` gap `#63` was filed against.

## Shipped

- `8180842` — iterate: bare `sed -i` fixed in three remaining
  one-liners (same bug class fixed once before elsewhere).
- `073e1ea` — expand pass 15: no new candidates cleared the 3.0
  floor; re-evidenced the Cloud-Run-trailer candidate instead.
- `fe55612` — iterate: `ship-asset.md`'s wrong `bearings.md`
  section citation (§3 → §2).
- `d682d04` — iterate: `skills/critique.md`'s delegate prompt now
  carries an explicit no-commit imperative. Closes `#63`.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 34 days
  blocked) and phase 32 (`#49`, 27 days blocked), both still on
  the same cloud-push-token workflows-scope gap, unchanged.
- **AUDIT:** 6 pending rows (unchanged count — `#63` closed, one
  new `[F, 2.4, PLAUSIBLE]` row landed the same sweep it closed: the
  "Anthropic moderation API" naming in `templates/skills/moderate.md`
  + `customization/moderation-loop.md` may be an invented product,
  unverified). Top score is 2.4, still under the 3.0 ship
  threshold; the rest are the low-priority `[F, ~2]` freshness row
  plus the four durable blocked user-issue rows (`#54`, `#40`,
  `#35`, `#49`). Header is 2026-09-25, still under the 48h refresh
  threshold — no refresh needed this pass.
- **CRITIQUE:** 1 pending (LOW — `prompts/adopt.md`'s reading-list
  glob undercount), last pass 3 days ago (pass 20, 2026-09-24).
- **PHASE_CANDIDATES:** 28 pending (22 >21d), oldest 87d (proposed
  2026-07-02, unchanged row) — flat vs. yesterday; nothing drained.
- **Issues:** 6 open (`#63` closed this window; `#54`, `#49`/`#48`,
  `#40`, `#35`/`#34` remain). No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (22 pending >21d,
  oldest 87d).** Both trigger conditions remain met; four ticks
  shipped this window and none touched the candidate queue —
  unchanged for at least two digest passes running.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 34 days) and phase 32 (`#49`, 27 days).
- The candidate queue's own top-scoring pending row (score 7.8,
  "Workflow-scope-blocked lane," proposed 2026-08-31, now 26 days
  old) targets the exact recurring blocker behind both stuck
  phases — it would close `#35`, `#40`, and `#49` together if
  promoted.

## Today's intent

No `[ ]` build-plan phase pending (only the two blocked rows).
AUDIT's top pending row now scores 2.4 (the moderation-API naming
row), still below the 3.0 floor; CRITIQUE holds one LOW row not
yet re-scored against it. Expect the next `/iterate` tick to ship
whichever of those two wins the tie-break, or fall through to
`/expand` again if neither clears 3.0 after a fresh sweep — same
pattern as pass 15 this window.

## Tuning proposals

None new. This window closes the loop on the last flagged gap
(`#63`, the critique delegate-prompt fix) cleanly — no new
mistuned-gate signal surfaced. The standing candidates already on
file (workflow-scope-blocked lane, candidate-queue silting) still
cover what this pass's pulse numbers would otherwise motivate; the
silting condition persists but is already the tracked, expected
state pending an `/oversight` pass, not a new finding.
