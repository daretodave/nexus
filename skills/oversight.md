# Skill: oversight (nexus)

> **User-in-the-loop. The only skill that asks.** Audit the
> kit's state, brief the user in ~20 lines, ask 1–4 computed
> questions, apply the answers to the plan files, commit. The
> emergency brake and the calibration touch.

## 1. Purpose

The loop decides everything else; this is where the human
steers. Promote candidates, unblock phases, set bias, prune
queues, answer `[needs-user-call]` rows.

## 2. Invocation

```
/oversight                   # full audit + questionnaire
/oversight reset             # clear/set the > Bias: line
/oversight audit             # READ-ONLY briefing: ask nothing,
                             # change nothing, commit nothing
```

`audit` is the cloud-safe instrument panel — every cloud tick
ends by printing it into the Actions log. All other modes
require a present user; under `/loop` they are a
misconfiguration (§6).

## 3. What it reads (parallel where independent)

1. `git log --oneline -20` — velocity + verb mix.
2. `git status --short` — uncommitted anything.
3. Build plan status block — pending / `[blocked:]` rows.
4. `plan/AUDIT.md` — pending count, durable rows, bias.
5. `plan/CRITIQUE.md` — pending count + last pass age.
6. `plan/PHASE_CANDIDATES.md` — pending candidates.
7. Open `triage:needs-user` issues.

## 4. The briefing (~20 lines)

Shipping (phases since last oversight, verbs mix) · Queues
(AUDIT n / CRITIQUE n / candidates n / needs-user n) · Blocked
rows with reasons · Flags (anything unusual: fix-streaks,
stale critique, gate additions). Plain text, no questions yet.

## 5. The procedure

1. Sync (`git pull --ff-only`) → read §3 → print §4.
2. `audit` mode stops here.
3. Build 1–4 questions **computed from the flags** (multiple
   choice, recommended option first, last question free-form).
   Ask via the client's question mechanism.
4. Apply answers: promote candidate (move to Promoted + append
   build-plan row) · unblock (`[blocked: …]` → `[ ]`, brief
   amended per the answer) · skip (`[skipped]` + reason) ·
   bias (`> Bias: <dim>` in AUDIT) · prune (delete named
   rows) · answer `[needs-user-call]` rows inline.
5. `node scripts/verify.mjs` → single commit
   `oversight: <summary>` with the literal Q&A in the body →
   push.

## 6. Hard rules

1. The ONLY skill that asks. And `audit` mode doesn't.
2. Never edits kit docs/templates — plan files only.
3. The Q&A transcript goes in the commit body verbatim —
   that's the audit trail.
4. No empty commits (nothing applied → no commit).

## 7. Failure modes

1. **Invoked under `/loop` in an interactive mode** —
   misconfiguration; print the briefing, ask nothing, exit.
2. **User abandons the questionnaire** — apply nothing, exit
   cleanly.
3. **`git pull` divergence** — stop.

## 8. Quick reference

```bash
plan/steps/01_build_plan.md          # promote/unblock/skip targets
plan/AUDIT.md                        # bias line + durable rows
plan/PHASE_CANDIDATES.md             # promotion source
gh issue list --label triage:needs-user
git commit -m "oversight: <summary>" && git push origin main
```
