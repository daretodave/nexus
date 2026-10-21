# Skill: oversight (nexus)

> **User-in-the-loop. The general-purpose skill that asks**
> (`lessons-pr` carries the one narrow planning-step
> carve-out). Audit the kit's state, brief the user in ~20
> lines, ask 1–4 computed questions, apply the answers to the
> plan files, commit. The emergency brake and the calibration
> touch.

## 1. Purpose

The loop decides everything else; this is where the human
steers. Promote candidates, unblock chunks, set bias, prune
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

0. `node scripts/pulse.mjs` — the fast aggregate: chunks
   left/held, AUDIT pending, CRITIQUE pending + last
   pass age, candidates pending + oldest-pending age. Items
   3–6 below still get read in full — the briefing needs row
   *content* (blocked reasons, durable rows, bias) that an
   aggregate count can't carry.
1. `git log --oneline -20` — velocity + verb mix.
2. `git status --short` — uncommitted anything.
3. `plan/README.md` — the Held lane (with reasons) and the
   spec table (`N left`).
4. `plan/AUDIT.md` — pending count, durable rows, bias.
5. `plan/CRITIQUE.md` — pending count + last pass age.
6. `plan/CANDIDATES.md` — pending candidates.
7. Open `triage:needs-user` issues.
8. Secret requests: `[needs-user-call] secret request <id>`
   rows (`plan/pending/secrets-<id>.md`, then `plan/notes.md`)
   and `node scripts/secrets.mjs status`. The owner sets each
   with `node scripts/secrets.mjs set <NAME>` in their own
   terminal, never pasted here; then delete the row.

## 4. The briefing (~20 lines)

Shipping (chunks archived since last oversight, verbs mix) · Queues
(AUDIT n / CRITIQUE n / candidates n / needs-user n) · Blocked
rows with reasons · Flags (anything unusual: fix-streaks,
stale critique, gate additions). Plain text, no questions yet.

## 5. The procedure

1. Sync (`git pull --ff-only`) → read §3 → print §4.
2. `audit` mode stops here.
3. Build 1–4 questions **computed from the flags** (multiple
   choice, recommended option first, last question free-form).
   Ask via the client's question mechanism.
4. Apply answers: promote candidate (move to Promoted, write
   `plan/<NN>-<slug>.md` with the next free number, A-IDs and
   `Not chunked yet.`, add its roadmap row) · unhold (remove
   the Held line, spec amended per the answer) · drop (chunk
   and its A-IDs out, Measure fixed, archive line `dropped:
   <reason>`) · bias (`> Bias: <dim>` in AUDIT) · prune
   (delete named rows) · answer `[needs-user-call]` rows
   inline.
5. `node scripts/verify.mjs` → single commit
   `oversight: <summary>` with the literal Q&A in the body →
   push.

## 6. Hard rules

1. The skill that asks anything, any time (any other skill asks
   only before its first write: `agents.md` rule 8). And
   `audit` mode doesn't.
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
node scripts/pulse.mjs               # the fast aggregate
plan/README.md + plan/<NN>-*.md      # promote (new spec), unhold, split, drop targets
plan/AUDIT.md                        # bias line + durable rows
plan/CANDIDATES.md             # promotion source
gh issue list --label triage:needs-user
git commit -m "oversight: <summary>"   # then land per owner mode (next/land.md §6)
```
