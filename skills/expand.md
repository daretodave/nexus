# Skill: expand (nexus)

> **Plan growth, posture-gated.** Read the accumulated signals
> and propose new kit specs as candidates. Candidates are
> filed, never self-promoted — `/oversight` promotes.

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
   duplicate — update that row's `last re-evidenced` date
   (today) and append the new signal to its `source signals`
   list.
4. File to `## Pending` (standard candidate schema: proposed /
   source signals / rationale / proposed scope / estimated
   chunks / conflicts / `last re-evidenced` — optional, absent
   until a later pass re-affirms the candidate). Update the
   metadata header.
5. `node scripts/verify.mjs` → commit + land:
   `expand: pass <N> — <K> candidates`.

## 6. Hard rules

1. Candidates only — never write a spec or the roadmap
   (promotion into a spec is `/oversight`'s). `promote` (§2) is
   the one run-time exception, and it obeys owner mode and
   never runs under `strict`; its commit is
   `expand: pass <N> — <K> specs added (autonomous)`, the body
   saying "promoted by a then-build /next loop".
2. Every candidate cites its signals; no vibes-only candidates.
3. Respect the cap; a 10-candidate dump is noise.
4. No candidate that breaks template API without a migration
   story in its scope.

## 7. Failure modes

1. **No signals clear the threshold** — exit cleanly with
   "expand: no candidates" (no commit).
2. **`git pull` divergence** — stop.

## 8. Quick reference

```bash
plan/CANDIDATES.md             # output + metadata header
plan/AUDIT.md  plan/CRITIQUE.md      # signal sources A/B
../<sibling>/plan/lessons.md         # signal source D (if present)
node scripts/verify.mjs
git commit -m "expand: pass <N> — <K> candidates"   # then land per owner mode (next/land.md §6)
```
