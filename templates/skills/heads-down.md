# Skill: heads-down

> **Ask up front, then build for hours without blocking.**
> Resolve a list of chunks from origin, ask every question they
> will need in one batch, claim them, and loop `/next` through
> them assuming defaults. Progress prints at the start and the
> end of every iteration. Every iteration is a full `/next`,
> and every step beats the session's ledger.

## 1. Purpose

The owner (or a contributor) supervises from afar: answer
questions, then hours of autonomous work, then answer the
questions that came up, then (contributor) one pull request.
This skill only resolves, asks, claims and starts the loop;
the building is `/next`'s (`skills/next.md`), under all its
rules. The `.owner` check sits at land time: the same verbs
run for everyone, and owner mode decides how work lands.

## 2. Invocation

```
/heads-down                    # owner: every ready chunk, in pick order
                               # contributor: a package (one spec's ready chunks, ~4 h)
/heads-down 07                 # spec 07's chunks, listed order
/heads-down 07.2 07.4          # those chunks, in that order (07.2-07.5, 07 from 07.3)
/heads-down <pasted /loop /next prompt>   # its ids and standing instructions
/heads-down 07 base <branch>   # build on a feature branch
/heads-down 07 <extra words>   # standing instructions for every iteration
```

## 3. Procedure

### Step 1 — Who and what

1. `node scripts/claims.mjs whoami`: owner or contributor, and
   this session's id (the loop runs in this session, so its
   claims are this session's). `node scripts/ledger.mjs beat
   --set kind=heads-down --set step=orient` names the session:
   its star (`ledger: vega (…) live`) heads every banner.
2. `git fetch origin`, then resolve the list from the plan **on
   origin/<base>** (`git show origin/<base>:plan/README.md`, the
   specs likewise), never the primary checkout's copy, which
   may be behind. A spec with no chunks yet: the list is the
   spec's number; the first iteration chunks it.
3. Drop and name what can't be taken: the Held lane, chunks
   someone else claims or holds (`claims.mjs list`), chunks a
   pending file already closes. A chunk whose needs aren't done
   stays: the loop takes it once they are.
4. Contributor package cap: S 1 h, M 2.5 h, L 5 h, adding up
   to about 4 h; the rest waits for the next package.

### Step 2 — The question gate (before any write)

Collect every question the list will need: the `/oversight`
queue's open items, the specs' `## Open questions` that touch
these chunks, and ambiguities a quick read of each chunk finds.
Ask them all in one AskUserQuestion batch (the first option of
each Recommended); none → say so. Answers that settle a spec
question go into that chunk's pending file as an `## Edit`.
After this gate the loop never blocks.

### Step 3 — Claim

- **Owner:** the whole list in one call: `node
  scripts/claims.mjs claim <ids…>` (`--base <b>` off main). A
  refusal names who holds what: drop those, claim the rest.
- **Contributor:** the package in one call, all or nothing:
  `node scripts/claims.mjs claim <ids…> --package`. Its branch
  is `pkg/<slug>` (a follow-up package stacks on the previous
  one's branch, at most two deep).

### Step 4 — Start the loop

Say in ≤ 5 lines, the first `<star> heads down`: the chunks
claimed, those dropped and why, the stop conditions. Print
`node scripts/plan/progress.mjs <specs> --ref origin/<base>`
as it is. Write the prompt below, filled, to a scratchpad file
and record it with the claims: `node scripts/ledger.mjs beat
--step loop --set-file loop=<file> --add claimed=<id>` (one
`--add` per id; `/reboot-resume` rebuilds the loop from it).
Then invoke the `loop` skill (no interval) with it:

> /next Build this session's chunks in order, one per
> iteration: <ids> (skip one whose needs aren't done; take the
> next ready one). Heads down: never ask; take the recommended
> default for every question and list each one in the close and
> the report; park any new question in the `/oversight` queue
> and go on. An owner-only gate (a principle the work would
> break, a legal read, a production action nobody okayed) or a
> missing secret (`/next` files its request) parks the chunk
> and moves on. <Owner: "Renew these claims each
> iteration, settle at each orient, land each chunk on main as
> it closes, release each once main holds it." | Contributor:
> "Build on pkg/<slug> in one worktree, one commit series and
> one pending file per chunk; push the branch; never push main,
> never settle, no PR until the package ends."> Delegate each
> build by size (S/M one background builder, L a Workflow); act
> on a board `REBOOT` line meanwhile, never polling. The lead
> runs the gate. Beat the ledger (`node scripts/ledger.mjs beat`) at every step: `--chunk
> <id> --step <step>` and the worktree as `/next` says, `--set builder=<agent id>` or `--set
> workflow.runId=<id> --set workflow.scriptPath=<path>` at dispatch, `--add defaults=<…>`
> per default taken, `--add parked=<{q, alts: [], why, default}>` per question parked (one
> each; `q` a whole question someone who knows the project but not the chunk can answer:
> what it decides, in words, never sub-item letters), `--add done=<id>` per close.
> Print `node scripts/plan/progress.mjs <specs> --ref
> origin/<base>` at the start and the end of every iteration.
> Stop when every chunk is closed or every one left is blocked.
> <Standing instructions from Step 1.>

### Step 5 — The end gate

1. Ask the parked questions (one batch; the ledger's `parked`,
   `ledger.mjs show`). An answer that contradicts a default
   taken becomes a fix commit.
2. **Owner:** each chunk already landed; report.
3. **Contributor:** one PR for the package (`gh pr create
   --head pkg/<slug>`), its body generated: the chunks closed
   with their A-IDs, the defaults taken, the questions answered,
   and the progress output. `claims.mjs pr <id> <n>` for each.
4. Release every claim the session holds without a PR.
5. Final report: what landed, the defaults, what is blocked on
   whom, and the progress output as it is. Then `node
   scripts/ledger.mjs end` (an ended loop is never resumed).

## 4. Hard rules

1. Questions only at the two gates; never mid-loop.
2. The plan is read from origin, never the primary checkout.
3. Every iteration obeys all of `skills/next.md`.
4. A crash never releases claims (24 h TTL keeps the work).
5. Every step beats the ledger; `loop` is the prompt verbatim.

## 5. Failure modes

- **Nothing resolvable:** the only case to ask mid-skill:
  say what was found and ask what to take.
- **Every chunk blocked:** stop the loop, report each blocker
  and whose word it waits on.
- **Claims refused wholesale:** someone holds the list; report
  who, claim nothing, stop.

## 6. Quick reference

```bash
node scripts/claims.mjs whoami | list | claim <ids…> [--package] | renew | release <ids…>
git fetch origin && git show origin/main:plan/README.md
node scripts/plan/progress.mjs <NN…> --ref origin/main
node scripts/ledger.mjs beat --chunk <id> --step <s> | --set-file loop=<f> | --add parked=<…>
```
