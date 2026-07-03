# Skill: triage (nexus)

> **Full autonomy.** Read unlabeled GitHub issues on the kit
> repo, classify, label, comment, route into the queues. Exits
> in under a second when the inbox is clean.

## 1. Purpose

Issues are the kit's inbox: adopters reporting friction,
lessons from real projects, the loop's own crash reports.
Triage classifies and routes them so `/iterate` and
`/ship-a-phase` drain them as ordinary queue rows.

## 2. Invocation

```
/triage                      # all unlabeled open issues
/triage <number>             # one issue
/triage dry-run              # classify + print, change nothing
```

## 3. The procedure

1. **Pre-flight:** `gh auth status || exit 3` (loop continues;
   awareness layers never hard-fail the march).
2. **List candidates:** open issues without `triage:*` labels,
   excluding `loop:opened` (the loop's own mirrors).
3. **Classify** each: `docs | bug | enhancement | lesson |
   question`. `lesson` = an adopter reporting something the
   kit taught wrong or missed — the highest-value class
   (bearings standing decision 3).
4. **Route:**
   - docs/bug → `plan/AUDIT.md` row
     `### [user-issue #<N>] [SEV] <title>` + `category:
     external-issue`; label `triage:loop-queued`.
   - lesson → same, biased HIGH; if it implies kit structure
     work, also a `plan/PHASE_CANDIDATES.md` candidate.
   - enhancement (large / strategy-shaped) →
     `triage:needs-user`; `/oversight` decides.
   - question → answer in a comment, label
     `triage:reviewed`; close politely if fully answered
     (`triage:closed`).
5. **Comment honestly** on every routed issue: what label,
   what queue, what happens next. Never close without a
   comment.
6. **Commit + push** the queue changes:
   `triage: <K> issues routed`.

## 4. Hard rules

1. Never delete or edit a reporter's words; quote them.
2. `loop:opened` issues are never triaged (self-echo).
3. Ambiguous → `triage:needs-user`, never a guess-close.
4. Labels created idempotently (`gh label create`, swallow
   "already exists").
5. No empty commits — zero routed = zero commit.

## 5. Failure modes

1. **`gh` missing / unauthenticated** — exit 3 with a
   one-liner; the march falls through.
2. **Rate-limited** — exit 2; next tick retries.
3. **Label creation fails hard** — route without the label,
   note it in the comment.

## 6. Quick reference

```bash
gh issue list --repo daretodave/nexus --state open \
  --search "-label:triage:loop-queued -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number,title
plan/AUDIT.md                        # routing target
plan/PHASE_CANDIDATES.md             # lesson-shaped routing target
git commit -m "triage: <K> issues routed" && git push origin main
```
