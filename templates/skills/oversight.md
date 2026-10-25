# Skill: oversight

> **The user-in-the-loop command.** Pause autonomy. Brief the
> user on current state. Ask targeted questions. Adjust the
> plan. Push the adjustments. Return.
>
> Every other skill is autonomous; this one is the exception.
> It exists because the user sometimes walks away from the loop,
> comes back, and needs to course-correct.

## 1. Purpose

When the user types `/oversight`, three things happen:

1. **Synthesis.** Read state files, recent commits, deploy
   state. Produce a tight briefing.
2. **Questionnaire.** Based on what surfaced, ask 1–4 targeted
   questions via `AskUserQuestion`. Computed from state, not
   pre-canned.
3. **Adjustment.** Apply answers as edits to plan files. One
   commit captures the whole adjustment set.

After this, user re-invokes `/march` (or `/loop /march`) to
resume.

## 2. Invocation

```
/oversight                  # full audit + general questionnaire
/oversight chunks           # bias toward chunk progress / scope
/oversight content          # bias toward /iterate findings + content
/oversight deploy           # bias toward Netlify / CI/CD signal
/oversight reset            # bias toward scope reduction
/oversight audit            # READ-ONLY: print the §4 briefing, ask
                            # nothing, change nothing, commit nothing
```

`audit` is the one mode that is safe in non-interactive
contexts (cloud ticks end with it so every Actions log closes
with a state-of-the-loop snapshot). It is an instrument panel,
not oversight — it never asks, never applies, never commits.
Every other mode requires a present user; under `/loop` they
are a misconfiguration (§9).

## 3. What `oversight` reads (the audit step)

In parallel where independent:

0. `node scripts/pulse.mjs` — the fast aggregate: specs and
   chunks left / held, AUDIT pending, CRITIQUE pending + last
   pass age, candidates pending + oldest-pending age. Items
   4–7 below still get read in full — the briefing needs row
   *content* (blocked reasons, durable rows, bias) that an
   aggregate count can't carry.
1. `git log --oneline -20` — recent shipping velocity.
2. `git status --short` — uncommitted changes.
3. `pnpm deploy:check` — current deploy state.
4. `plan/README.md` — the lanes (Asap, Held) and the spec
   table; each spec's `## Chunks` for what's left.
5. `plan/AUDIT.md` — open `/iterate` findings.
6. `data/BACKLOG.md` — pending data work.
7. `plan/CRITIQUE.md` — critique pending.
8. The specs holding the next 3 ready chunks — current vs.
   recent commits; the last 10 lines of `plan/ARCHIVE.md`.
9. `design/` — has a new export landed since the last sibling
   commit?
10. Secret requests: `[needs-user-call] secret request <id>`
    rows (`plan/pending/secrets-<id>.md`, then `plan/notes.md`)
    and `node scripts/secrets.mjs status`. The owner sets each
    with `node scripts/secrets.mjs set <NAME>` in their own
    terminal, never pasted here; then delete the row.
11. `node scripts/plan/promote.mjs sweep` — auto-promoted specs
    still in their veto window (`skills/expand.md` Step 4b; a
    dry run writes nothing).
12. `node scripts/plan/locks.mjs list` and the open
    `loop:lock` issues — every lock (Held line, lane lock,
    owner-blocked row) with its age; one past its time with no
    `fallback:` has its one `Lock past max_age` ask.

## 4. The briefing (~25 lines max)

```
oversight — <ISO date>

locks past their time (listed first: each waits on you)
- <slug> · <why> (#<issue>)   (or "none")

auto-promoted (veto window; listed before the rest)
- <NN> <title> · veto until <date> (#<issue>)   (or "none")

shipping
- last commit: <sha> "<subject>" (<relative time>)
- chunks closed since last oversight: <ids from ARCHIVE.md>
- velocity: ~<N> commits/hour over last 24h

state
- chunks left: <count> across <K> specs; next is <NN.k> (<title>)
- held: <count> (<ids + one-word reasons>)
- open audit findings: <count>; top score <X>: "<one-liner>"
- pending data backlog: <count>
- pending critique findings: <count>; pass count <N>; last pass <when>
- working tree: <clean | N modified | N untracked>
- last deploy: <state> (<sha>) — <admin URL or "ready">

flags
- <unusual patterns: stuck chunk, repeated fix commits,
  divergent local/Netlify state, design newer than sibling
  commit, etc.>
```

Tight. Factual. The flags section drives the questionnaire.

## 5. The questionnaire

Generate 1–4 questions via `AskUserQuestion`. Rules:

- **Computed from observed flags**, not pre-canned.
- **Each question targets a specific observable.**
- **Multiple choice with recommended option marked first.**
- **Last question is free-form** if there's room.

### Question templates

**Stuck chunk**

> Chunk <NN.k> has been next across <K> ticks; last <L> commits
> were "fix:" against it. What now?
>
> - (recommended) Split it — it's bigger than its size says.
> - Hold — move it to the Held lane with a reason.
> - Drop — remove it and its A-IDs with an archive line.
> - Continue — the spec is right, just hard.

**Audit overload**

> `plan/AUDIT.md` has <N> findings; top 3 are <category>. Bias?
>
> - (recommended) Yes — set focus to <category>.
> - No — keep balanced.
> - Prune — drop bottom <M> findings.

**Spec out of date**

> `design/<family>/` was updated <K> commits ago, after chunk
> <NN.k> closed. Refresh spec <NN> and add a follow-up chunk?
>
> - (recommended) Yes — `/plan-a-spec <NN>`, with a new A-ID
>   and chunk for the follow-up.
> - No — note in `AUDIT.md`; let `/iterate` catch.
> - Defer.

**Deploy stuck red**

> Last <K> deploys failed with same error: "<msg>". What now?
>
> - (recommended) Investigate — open log; I'll diagnose, no
>   commit yet.
> - Roll back — revert to <last-green-sha>.
> - Continue — next ship-a-chunk will reach the right code.

**Uncommitted changes**

> Working tree has <N> modified, <M> untracked from a tick
> that didn't finish (last verb: <X>).
>
> - (recommended) Inspect — show diff; I'll decide.
> - Roll forward — finish the tick.
> - Roll back — `git checkout` and `git clean`; restart cleanly.

**Candidates pending promotion**

> `plan/CANDIDATES.md` has <N> pending candidates. Top
> score [<X.Y>]: "<one-line>". Promote any?
>
> - (recommended) Review one — show me the candidate's
>   rationale + signals; I'll decide.
> - Promote top — write it as a new spec (`plan/<NN>-<slug>.md`,
>   unchunked) with a row in `plan/README.md`, move the
>   candidate to `## Promoted`.
> - Reject top — move to `## Rejected` with a one-line reason.
> - Defer — leave them; next expand pass re-evaluates.

**Auto-promotion in its veto window**

> Spec <NN> "<title>" was auto-promoted from an aged candidate
> (score <X.Y>, <N> days old); the loop builds it after
> <date> unless you veto (#<issue>).
>
> - (recommended) Let it run — the window closes on its own.
> - Release now — the loop may build it this tick.
> - Veto — the spec goes, the candidate is rejected.

**Free-form**

> Anything else to adjust before I hand back to `/march`?

## 6. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Audit

Run §3.

### Step 2 — Brief

Print synthesis per §4. **No questions yet.**

### Step 3 — Build questionnaire

Compute 1–4 questions per §5. If zero warranted (project
healthy, no flags), say so and exit at Step 7 with no commit.

### Step 4 — Ask

Invoke `AskUserQuestion`.

### Step 5 — Apply

For each answer:

- **"Refresh spec" / "Split it"** → run the `/plan-a-spec
  <NN>` flow inline.
- **"Hold"** → add `- **<NN.k>** · held: <reason> · since:
  <today> · until: <date or condition> · max_age: <Lock max
  age>` to the Held lane in `plan/README.md` (a lock that
  times out; `plan-check` rejects one without them). Unholding
  is removing the line.
- **"Answer a lock's ask"** → remove the lock, set a new
  `since:` (keep waiting) or add a `fallback:`. The next
  `/march` lock sweep closes its `Lock past max_age` issue.
- **"Drop"** → remove the chunk and the A-IDs only it closed,
  fix the Measure line (dropped IDs count as closed), and
  archive `- <date> · <NN.k> · dropped via oversight: <reason>
  · (this commit)`. Run `node scripts/plan-check.mjs --since
  HEAD`.
- **"Bias toward category X"** → write at top of
  `plan/AUDIT.md`: `> Bias: <category> (set via oversight
  <date>)`. `/iterate` reads this and weights 1.5x.
- **"Prune findings"** → delete bottom-N rows from `AUDIT.md`.
- **"Roll back"** → DO NOT run destructive git ops without
  explicit confirmation. Print proposed plan as a follow-up
  question; only execute on explicit go.
- **"Investigate deploy"** → fetch latest deploy log; summarize;
  no patch yet.
- **"Promote candidate"** → move row from
  `plan/CANDIDATES.md` `## Pending` to `## Promoted` (with
  promotion date + assigned spec number, the next free one).
  Write `plan/<NN>-<slug>.md` from the candidate (outcome, Why,
  scope as Design, Acceptance with A-IDs, `Not chunked yet.`)
  and add its row to `plan/README.md`. Optionally run the
  `/plan-a-spec <NN>` flow inline to chunk it.
- **"Reject candidate"** → move row from `## Pending` to
  `## Rejected` with one-line reason.
- **"Release auto-promotion early"** → remove its Held line;
  once landed, close its veto issue with "released early by
  the owner". `/next` picks the spec as usual.
- **"Veto auto-promotion"** → close its veto issue, then `node
  scripts/plan/promote.mjs sweep --write` (or leave it to the
  next tick's sweep): the spec goes and the candidate is
  rejected as vetoed.
- **"Other" (free-form)** → interpret conservatively. If clear
  plan edit, apply. If ambiguous, write to `plan/AUDIT.md` as
  `[needs-user-call]` and tell the user.

### Step 6 — Commit + land

```bash
git add <modified files>
git commit -m "$(cat <<'EOF'
oversight: <one-line summary>

- <bullet per adjustment>

User answers:
- Q: <question> → <answer>
EOF
)"
# land per owner mode: skills/next/land.md §6
```

If only adjustment was "everything looks good" with no edits,
**no empty commit**. Print "no adjustments — handing back to
the loop" and exit.

### Step 7 — Confirm deploy

```bash
pnpm deploy:check
```

Skip if no commit was made.

### Step 8 — Done

```
oversight complete. <N> adjustments applied.
- ready to resume: /march (or /loop /march)
- next ready chunk: <NN.k> (<title>)
```

## 7. Hard rules

1. **Never edit code.** Plan adjustments only.
2. **Don't run destructive git ops without explicit user
   confirmation.**
3. **Single commit captures the adjustment set.**
4. **Don't loop the questionnaire.** Ask once.
5. **No emojis. No `Co-Authored-By:`.**
6. **`AskUserQuestion` is allowed here and in `/bootstrap`**
   among shipping skills — nowhere else.

## 8. When `oversight` is NOT the right tool

- **Mid-tick of `/ship-a-chunk`** etc. Don't pre-empt.
- **For trivia.** Read state files directly.
- **As a way to ask permission mid-loop.** Decide instead.

## 9. Failure modes

1. **Invoked under `/loop`.** Misconfiguration. Stop.
2. **`git pull` divergence.**
3. **State files corrupted.**
4. **"Other" with text the skill can't interpret.** Write
   `[needs-user-call]` to AUDIT.md, no other adjustment, exit.

## 10. Quick reference

```bash
# Read (parallel where possible)
node scripts/pulse.mjs             # the fast aggregate
git log --oneline -20
git status --short
plan/README.md                     # lanes + spec table
plan/<NN>-<slug>.md                # specs holding the next ready chunks
plan/ARCHIVE.md                    # last 10 lines
plan/AUDIT.md
data/BACKLOG.md
plan/CRITIQUE.md
design/                            # for newer-than-sibling check

# Tools
AskUserQuestion                    # allowed here and in /bootstrap only

# Adjustment files
plan/README.md                     # lanes, rows
plan/<NN>-<slug>.md                # new specs, splits, drops
plan/AUDIT.md
data/BACKLOG.md
plan/<NN>-<slug>.md                # new specs, via /plan-a-spec

# Commit
git commit -m "oversight: <one-line>"
# land per owner mode: skills/next/land.md §6
pnpm deploy:check
```
