# Skill: expand (nexus)

> **Plan growth, posture-gated.** Read the accumulated signals
> and propose new kit specs as candidates. `/oversight`
> promotes; under `Promote: aged` the strongest aged candidate
> also promotes itself, held behind a veto window (§6).

## 1. Purpose

The kit's roadmap should grow from evidence: clustered audit
findings, repeated adopter friction, sibling-project lessons,
and the ground shifting under the kit (Claude Code releases).
This skill turns those signals into scored candidates in
`plan/CANDIDATES.md`.

## 2. Invocation

```
/expand                      # full signal read + candidates
/expand dry-run              # print candidates, file nothing
/expand careful              # one candidate at most, and only with 2+ independent signals
/expand bold                 # up to 3; one strong signal (score 5+) is enough
/expand promote              # owner: this pass writes its picks as unchunked specs
```

Rate-limited by `/march` (≥20 commits or >7 days); posture
`bold` required (see `plan/bearings.md`).

**Run words.** `careful` and `bold` tune only the cap and the
bar (§4 scoring and its cap); no word keeps them as written.
`promote` makes this one pass act as posture `autonomous`:
its picks become unchunked specs (`plan/<NN>-<slug>.md` + a
`plan/README.md` row in the template's format: outcome, Why,
Design, Acceptance with A-IDs, `Not chunked yet.`, then `node
scripts/plan-check.mjs --since HEAD` green before the commit,
landed per owner mode), and each also goes
under `## Promoted` in `plan/CANDIDATES.md` as `promoted:
<date>, auto (expand pass <N>)` so `/oversight` still sees what
grew. Owner mode only (a contributor files candidates as usual
and says so); never under `strict`. The kit runs posture `bold`, so this is the
only way the kit's own loop writes a spec without `/oversight`.

**When a `/next` loop runs dry** (`/loop /next then expand` or
`then build`, sent by the GUI's Infinite picker): the iteration
that finds nothing ready runs one `/expand` pass instead of
ending. The plan being done is the signal, so the rate limit is
skipped; the posture is not (`strict`: stop as a bare loop
would). `then expand` runs the pass as the posture says, then
the loop stops and says what it filed: candidates that wait in
`/oversight`, or under `autonomous` the specs it added (the
next run builds them). `then build` runs `/expand promote`:
the loop chunks and builds what it added, and the next dry
spell runs another pass. It stops when a pass adds nothing
(every candidate needs cited signals, so the loop ends when
the evidence does) or after its third promote pass, whichever
comes first, and says which. A contributor's `then build`
reads as `then expand`.

## 3. Signal sources

- **A.** `plan/AUDIT.md` clusters — 3+ pending rows sharing a
  root cause = one spec, not three ticks.
- **B.** `plan/CRITIQUE.md` clusters — repeated dry-run
  friction in one playbook area.
- **C.** Triage patterns — multiple adopters asking for the
  same missing layer.
- **D.** Sibling lessons — new material in a sibling
  adopter's `plan/lessons.md` / any `NEXUS_LESSONS.md` since
  last pass.
- **E.** Platform drift — Claude Code features the kit
  doesn't cover or contradicts.

## 4. Scoring

`expand_score` 0–10, additive: multiple signals +1..+3;
adopter-facing +2; cheap-and-impactful +2; speculative /
no-evidence −3; conflicts a bearings contract −5 (drop unless
still >3). **Cap 3 candidates per pass.**

## 5. The procedure

1. `git pull --ff-only`; read posture (`strict` → print
   "expand: strict posture — skipping", exit 0).
2. Read signals A–E since the `Last pass` header of
   `plan/CANDIDATES.md`.
3. Synthesize + score; self-assess down to ≤3. If a signal
   reinforces a candidate already sitting in `## Pending`
   rather than describing something new, don't file a
   duplicate — re-evidence the row (§6a).
4. File to `## Pending` (standard candidate schema: proposed /
   source signals / rationale / proposed scope / estimated
   chunks / conflicts; `filed score` and `re-evidence` arrive
   with the first re-evidence). Update the metadata header
   (`Last pass`, `Pass count`, `Posture`, and nothing else:
   the pass narrative goes in the commit body).
5. Aged promotion (§6), when the knob allows it.
6. The Pending cap (§6a).
7. `node scripts/verify.mjs` → commit + land:
   `expand: pass <N> — <K> candidates` (with an aged
   promotion: `…, auto-promoted <NN> (veto until <date>)`;
   with a cap cut: `…, cut <K> stale`, each cut title in the
   body).

## 6. Aged promotion: the silt valve

A queue nobody promotes silts up. Under `Promote: aged` (or
`autonomous`) in `plan/bearings.md`'s `## Plan expansion
posture` (no key reads `owner`: nothing here runs), each pass
ends by promoting at most one aged candidate, behind a window
in which the owner can say no.

1. `node scripts/plan/promote.mjs pick`. It prints `pick …`
   for the best Pending row scoring ≥ `promote_floor` that is
   `promote_after_days` old or re-evidenced twice (ties: the
   oldest), while fewer than `promote_per_week`
   auto-promotions are dated in the last 7 days (vetoed ones
   count). `none: <why>` ends the step.
2. Write the spec as `promote` does (§2: unchunked, roadmap
   row). Move the row to `## Promoted` as `### [promoted
   <date> → spec <NN>] [score X] <title>` with `- promoted:
   <date>, auto (expand pass <N>), veto #<issue>` (the line the
   weekly cap counts; it stays when a veto moves the row).
3. Open the veto issue (`gh label create loop:veto --force`
   first; it is idempotent):
   `gh issue create --title "Auto-promoted: <title> — close to
   veto" --label loop:opened --label loop:veto`, the body the
   row's rationale cut at 600 characters, the spec's link, and
   "close this issue by <date> to veto; left open, the loop
   builds it". `loop:opened` keeps triage and the support
   nudge off it.
4. `node scripts/plan/promote.mjs hold <NN> <issue>` writes the
   Held line, `veto_days` out:
   `- NN · auto-promoted, veto until <date> (#<issue>) · max_age: 3d · fallback: release`.
   Nothing picks a Held spec, so nothing chunks or builds it in
   the window; `/march` Step 0 vetoes or releases it.
5. `node scripts/plan-check.mjs --since HEAD` green.

No issue, no promotion: when `gh` cannot open it, undo the
spec and the row move, and say so in the commit body. `ask …`
(a contributor's checkout, or pull-request mode) files no spec:
one `[needs-user-call] promote <title>?` row in
`plan/AUDIT.md`, deduped by title.

## 6a. Pending stays live

A row a pass re-evidences gains score; a queue past its cap
sheds its stalest. Both write through
`scripts/plan/promote.mjs`, so the arithmetic is the same
every pass:

- **Re-evidence:** `node scripts/plan/promote.mjs reevidence
  "<title words>" <A-E> [#<issue>|<sha>] --note "<the
  signal>" --write`. It appends a dated line under the row's
  `- re-evidence:` (the first one also writes `- filed
  score:`). A signal is independent when its letter or its
  issue or commit is new to the row; each independent one
  adds +0.5, capped at +2 over the filed score, and counts
  toward §6's re-evidenced-twice trigger. One the row already
  cites is logged at +0.
- **The cap:** after §6, `node scripts/plan/promote.mjs cap
  --write`. While Pending holds more than `pending_cap` rows
  (bearings; 15), it moves the lowest-scoring ones proposed 60
  or more days ago to `## Rejected` with `- reason: stale:
  below cap cut <date>`, at most 5 a pass; `promote.mjs cuts`
  lists them for the digest. A row younger than 60 days is
  never cut.

## 7. Hard rules

1. Candidates only — never write a spec or the roadmap
   (promotion into a spec is `/oversight`'s). `promote` (§2)
   and the aged promotion (§6) are the run-time exceptions;
   both obey owner mode and never run under `strict`.
   `promote`'s commit is
   `expand: pass <N> — <K> specs added (autonomous)`, the body
   saying "promoted by a then-build /next loop".
2. Every candidate cites its signals; no vibes-only candidates.
3. Respect the cap; a 10-candidate dump is noise.
4. No candidate that breaks template API without a migration
   story in its scope.

## 8. Failure modes

1. **No signals clear the threshold** — exit cleanly with
   "expand: no candidates" (no commit, unless §6 or the cap
   in §6a changed the queue).
2. **`git pull` divergence** — stop.

## 9. Quick reference

```bash
plan/CANDIDATES.md             # output + metadata header
plan/AUDIT.md  plan/CRITIQUE.md      # signal sources A/B
../<sibling>/plan/lessons.md         # signal source D (if present)
node scripts/plan/promote.mjs reevidence "<title>" B '#12' --write   # §6a: +0.5 if independent
node scripts/plan/promote.mjs cap --write                         # §6a: the stale cut over pending_cap
node scripts/verify.mjs
git commit -m "expand: pass <N> — <K> candidates"   # then land per owner mode (next/land.md §6)
```
