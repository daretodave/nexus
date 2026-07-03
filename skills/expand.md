# Skill: expand (nexus)

> **Plan growth, posture-gated.** Read the accumulated signals
> and propose new kit phases as candidates. Candidates are
> filed, never self-promoted — `/oversight` promotes.

## 1. Purpose

The kit's roadmap should grow from evidence: clustered audit
findings, repeated adopter friction, sibling-project lessons,
and the ground shifting under the kit (Claude Code releases).
This skill turns those signals into scored phase candidates in
`plan/PHASE_CANDIDATES.md`.

## 2. Invocation

```
/expand                      # full signal read + candidates
/expand dry-run              # print candidates, file nothing
```

Rate-limited by `/march` (≥20 commits or >7 days); posture
`bold` required (see `plan/bearings.md`).

## 3. Signal sources

- **A.** `plan/AUDIT.md` clusters — 3+ pending rows sharing a
  root cause = one phase, not three ticks.
- **B.** `plan/CRITIQUE.md` clusters — repeated dry-run
  friction in one playbook area.
- **C.** Triage patterns — multiple adopters asking for the
  same missing layer.
- **D.** Sibling lessons — new material in
  `../kintilla/plan/lessons.md` / any `NEXUS_LESSONS.md`
  since last pass.
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
   `plan/PHASE_CANDIDATES.md`.
3. Synthesize + score; self-assess down to ≤3.
4. File to `## Pending` (standard candidate schema: proposed /
   source signals / rationale / proposed scope / estimated
   phases / conflicts). Update the metadata header.
5. `node scripts/verify.mjs` → commit + push:
   `expand: pass <N> — <K> candidates`.

## 6. Hard rules

1. Candidates only — never write to the build plan (promotion
   is `/oversight`'s).
2. Every candidate cites its signals; no vibes-only phases.
3. Respect the cap; a 10-candidate dump is noise.
4. No candidate that breaks template API without a migration
   story in its scope.

## 7. Failure modes

1. **No signals clear the threshold** — exit cleanly with
   "expand: no candidates" (no commit).
2. **`git pull` divergence** — stop.

## 8. Quick reference

```bash
plan/PHASE_CANDIDATES.md             # output + metadata header
plan/AUDIT.md  plan/CRITIQUE.md      # signal sources A/B
../kintilla/plan/lessons.md          # signal source D (if present)
node scripts/verify.mjs
git commit -m "expand: pass <N> — <K> candidates" && git push origin main
```
