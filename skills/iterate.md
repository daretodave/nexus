# Skill: iterate (nexus)

> **Full autonomy.** Audit the kit, pick the top-scoring
> finding, ship the fix, drain the queues. The post-phase
> endgame — and between phases, the polish engine.

## 1. Purpose

The kit rots in specific ways: docs drift from templates,
promises outrun files, links die, voice wobbles, Claude Code
moves on, adopters hit friction the authors never felt. This
skill audits those dimensions, scores findings, ships exactly
one fix per tick.

## 2. Invocation

```
/iterate                     # audit + ship top finding
/iterate audit               # audit only; write findings, ship nothing
/iterate <focus>             # bias one dimension (drift|links|voice|
                             # completeness|friction|freshness|lessons)
```

## 3. The audit

Dimensions (score each finding `impact × ease / 10`, 0–10):

- **A. doc-drift** — a doc describes behavior/files that don't
  match the templates (or vice versa). Highest-value class.
- **B. completeness** — a doc promises a file/skill/script the
  kit doesn't ship (bearings standing decision 2: HIGH).
- **C. link + tree hygiene** — beyond the gate: external-link
  rot, anchor accuracy, stale cross-refs.
- **D. voice** — wrap, tense, stems, emoji, heading case
  inconsistencies.
- **E. adopter friction** — the README TL;DR path, placeholder
  table accuracy, copy-command correctness (both OSes).
- **F. freshness** — model ids, Claude Code feature drift,
  provider API changes.
- **G. lessons** — new bullets in sibling adopters'
  lessons files (`../kintilla/plan/lessons.md`,
  `NEXUS_LESSONS.md` anywhere) that the kit hasn't absorbed.

Queue sources compete with audit findings, same scale:
`plan/CRITIQUE.md` Pending (HIGH→8–10, MED→5–7, LOW→2–4
impact), `source: user` rows get **+0.5** after scoring;
a `> Bias: <dim>` line in `plan/AUDIT.md` multiplies that
dimension **×1.5** (cap 10).

**Durable rows survive rewrites:** `> Bias:`,
`[needs-user-call]`, and `[user-issue #N]` rows are preserved
verbatim when regenerating the audit block.

## 4. The procedure

1. **Sync:** `git pull --ff-only`.
2. **Audit:** run §3 (or read the latest block if <24h old).
   Write Top 5 to `plan/AUDIT.md` (schema: `### [score]
   <desc>` + category/impact/ease/evidence/next).
3. **Pick:** top score. `/iterate audit` stops here (commit
   the audit block only).
4. **Mirror (best-effort):** `node
   templates/scripts/loop-issue.mjs open --severity <…>
   --category docs --source audit --title "<…>" --body-file
   "$(mktemp)"` — reuse `- issue: #N` if the row has one.
5. **Ship:** the fix, per the finding's `next`.
6. **Gate:** `node scripts/verify.mjs` foreground.
7. **Commit + push:** `fix|docs|templates: <subject>`, body
   cites the finding, `Closes #N` when mirrored.
8. **Tick:** finding `[ ]` → `[x] (commit <hash>)`; CRITIQUE
   rows move Pending → Done.

## 5. Hard rules

1. One finding per tick — resist the batch.
2. Verify gate before every commit; atomic commit+push.
3. Durable AUDIT rows are never lost to a rewrite.
4. Never edit `plan/CRITIQUE.md` findings' content — address
   or leave; only `/jot` and `/critique` author rows.
5. No emojis, no trailers (standard carve-out excepted).

## 6. Failure modes

1. **No finding scores ≥3.0** — posture `bold` → dispatch
   `skills/expand.md` instead of manufacturing churn; posture
   `strict` → stop cleanly ("nothing worth a tick").
2. **Gate red ≥3× same root cause** — stop loud (rule 6).
3. **`git pull` divergence** — stop.
4. **A fix requires breaking template API** — don't; file it
   as a phase candidate with the migration story and pick the
   next finding.

## 7. Quick reference

```bash
plan/AUDIT.md                        # queue + bias + durable rows
plan/CRITIQUE.md                     # external queue
../kintilla/plan/lessons.md          # lessons source (if present)
node scripts/verify.mjs
node templates/scripts/loop-issue.mjs open|close-comment ...
git add <explicit> && git commit && git push origin main
```
