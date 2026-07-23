# Digest — 2026-07-23

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Busy window: all 4 march ticks shipped, zero no-ops — an AUDIT
fix (empty `plan/phases/` overlay, closes #25), a critique pass
7 (3 new findings, 1 stale row closed), a same-night fix for
critique's own MED finding (`sed -i` backup-suffix bug), and
AUDIT's top row (triage.md's hardcoded `blob/main` link). Build
plan stays empty (18/18); candidate backlog unchanged at 20,
still zero promoted since the queue opened 2026-07-02.

## While you were out

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 07-22 14:41 | march → iterate | shipped AUDIT `[B, 4.5]` — `existing-project.md`'s overlay left `plan/phases/` empty with no brief pointer (closes #25); AUDIT refreshed in the same commit, header bumped to 07-22 and a new `[F/A, 3.6]` stale-model row added |
| 07-22 20:25 | march → critique (pass 7) | 3 new findings (0 high, 1 med, 2 low): MED `sed -i` backup-suffix bug, LOW `./data` grep-scope error, LOW `.claude/` bundle never offered for pruning; 1 stale row (`<PROJECT_PKG_PREFIX>` worked example) re-confirmed resolved and closed |
| 07-23 03:05 | march → iterate | shipped CRITIQUE's fresh MED row — `sed -i` without a backup suffix broke the placeholder one-liner on stock macOS; scored above AUDIT's top row once ease was weighed in |
| 07-23 08:55 | march → iterate | shipped AUDIT's top row — `triage.md`'s `AUDIT.md` link hardcoded `blob/main` instead of `<DEFAULT_BRANCH>` |

`heartbeat` ran 5/5 green over its last-5 sample — no wedged
runs, no flatline alarm.

## Shipped

- `5c755b8` — `existing-project.md`'s overlay now points at
  `new-project.md` §5's brief format right after the
  GitHub-as-DB note, closing #25; AUDIT.md refreshed alongside
  (header → 07-22, one row closed, `[F/A, 3.6]` stale-model row
  added).
- `22a357a` — `/critique` pass 7: filed the `sed -i` MED and two
  LOW findings above; closed the `<PROJECT_PKG_PREFIX>` LOW row
  after re-walking the dry-run and confirming it already
  resolved.
- `70c8b6c` — `playbooks/new-project.md`'s bash placeholder
  one-liner switched to `sed -i.bak -e ... && find … -delete`,
  the one spelling both BSD and GNU sed parse identically.
- `57dc874` — `templates/skills/triage.md`'s AUDIT.md link now
  uses `<DEFAULT_BRANCH>`, matching its sibling skill templates.

## Queues now

- **Build plan:** 0 pending (18/18 phases shipped, unchanged).
  Every tick still routes to `/critique`/`/expand`/`/iterate`.
- **AUDIT:** 6 pending, header 2026-07-22 (~20-24h old, under
  the 48h staleness threshold — no refresh due). Rows: standing
  `[user-issue #12]` (blocked, unchanged since 2026-07-12);
  `[A/E, 2.7]` README's "Files added" checklist undersells
  `scripts/`; `[C/F, 1.6]` fictional example deploy URL in
  `templates/skills/bootstrap.md:217`; `[F/A, 3.6]`
  `cloud-loop.md:62` cites stale model name "Sonnet 4.6"
  (highest-scoring open, non-blocked row); `[D, 1.8]` two
  unwrapped bullets at `README.md:309`; `[A, 1.35]`
  `cloud-loop.md`'s "three new files" header lists only two.
- **CRITIQUE:** 2 pending (both LOW: `./data` grep-scope error
  on non-GitHub-as-DB adopters, `.claude/` bundle never offered
  for pruning in the non-Claude-Code path), last pass 2026-07-22
  (pass 7).
- **PHASE_CANDIDATES:** 20 pending, last `/expand` pass still 4
  (2026-07-22) — only 5 commits landed since, well under the
  ≥20-commit rate limit, so `/expand` wasn't eligible this
  window. Posture bold. None promoted or rejected.
- **Issues:** 1 open (`#12`, `triage:loop-queued`) — same row as
  AUDIT's blocked entry. No `triage:needs-user` or `loop:do`
  labels open.
- **Sibling lessons:** `../kintilla/plan/lessons.md` not present
  in this environment — skipped (cloud).
- **Ceiling:** 3 `Cloud-Run:`-tagged commits in the trailing
  24h (`5c755b8`, `70c8b6c`, `57dc874`), well under the 8/24h
  ceiling; all carry the trailer correctly.

## Needs you

- **Issue #12** — nexus's own `.github/workflows/march.yml`
  still needs phase 17's weighted-ceiling step applied by hand;
  `ACTIONS_PAT` is deliberately scoped to Contents + Issues
  only, so the cloud loop can never push to
  `.github/workflows/*.yml` itself. Needs a human, or a
  locally-run `/iterate` with a personal workflow-scoped `gh`
  token. Tracked as AUDIT `[user-issue #12]`, still the only
  blocked row.
- **Candidate backlog** — 20 pending in `plan/PHASE_CANDIDATES.md`,
  zero promoted since the queue opened 2026-07-02 (three weeks
  running). The `[score 9.0]` `new-project.md` step-4/7 rewrite
  is now re-evidenced across four separate cycles (2026-07-06,
  -10, -13, -21) and is the clearest promote-first candidate;
  worth an `/oversight` pass. The two prior meta-loop candidates
  (`[score 7.5]` background-agent dispatch, `[score 6.5]`
  Cloud-Run trailer verification) remain unpromoted too.
- No `[needs-user-call]` rows, no blocked build-plan rows.

## Today's intent

Build plan still has no pending phase (18/18). With CRITIQUE
down to two LOW rows, AUDIT's `[F/A, 3.6]` (stale "Sonnet 4.6"
model name in `playbooks/cloud-loop.md:62`) is now the
highest-scoring open item excluding the blocked `#12`, and the
most likely next `/iterate` pick. `/expand`'s rate-limit window
stays closed until ≥15 more commits land (5 of 20 elapsed since
pass 4), so upcoming ticks should keep routing to
`/critique`/`/iterate` fixes.

## Tuning proposals

None this pass — the pulse showed no mistuned gate: all four
ticks found actionable work and shipped correctly (no
incorrect no-ops, no missed queue items), the MED critique
finding was picked up and fixed same-night, and heartbeat ran
5/5 green. The candidate backlog's zero-promotions streak is a
standing `/oversight` gap, not a gate mistuning, and is already
flagged above rather than re-filed as a new candidate.
