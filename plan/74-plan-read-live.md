# 74 — Every step reads the plan live

> The plan is what drives the loop, so a step that acts on a
> copy of it read earlier in the tick is acting on a guess.
> Find every place a skill or script reads plan state once
> and reuses it, and make each one read again at the moment
> it decides.

## Why

Field research (2026-11-06, re-evidenced 2026-11-13) shows
spec-driven tooling splitting in two: kits where the spec is
a planning document read at the start, and kits where the
spec state is an operational layer the agents keep reading
through the build. This kit claims the second. The claim
holds only if lanes, `needs`, Held lines, claims and pending
closes are read at each step that depends on them. A tick
that picks a chunk, builds for twenty minutes and then closes
it against the plan as it stood at pick time can land on a
chunk another session has since claimed, held or closed.

## Design

- An audit first, as a table in the spec's close: each skill
  step and script that reads `plan/README.md`, a spec file,
  `plan/pending/`, the claims ref or the Held lane, and
  whether it reads at the point of use or reuses an earlier
  read.
- Each stale read found is fixed where it lives: `/next`'s
  pick, claim, close and land steps, `/march`'s dispatch,
  `scripts/plan/order.mjs`, `settle.mjs`, `claims.mjs`.
- Where a re-read can disagree with the earlier one (the
  chunk was held or claimed mid-build), the step says what
  happens: stop and report, never overwrite.
- `concepts/plan-shape.md` gains a short "read live" rule so
  a new skill inherits it.
- A pattern is named, never a product (bearings, field
  research).

## Audit: plan-state reads

One row per place `/next`'s pick, claim, close and land steps,
`/march`'s dispatch, `order.mjs`, `settle.mjs` or `claims.mjs`
reads `plan/README.md`, a spec file, `plan/pending/`, the
claims ref or a Held/Asap lane line. `live`: re-reads from
disk, or runs a fresh script, at the point it acts. `stale`:
acts on a value read, or a chunk picked, earlier in the same
tick without saying to re-check it. A script run fresh each
time (a new `node` process reading files from disk) is `live`
by construction — each of the three scripts gets one row, not
one per internal read. The rows worth reading closely are the
skill prose ones.

### `/next`: pick, claim, close, land

| Where | Reads | When | Verdict | Reason |
|---|---|---|---|---|
| `skills/next.md` Step 0 §5 | `plan/nexus.lock`, `plan/README.md`, the picked spec, `plan/bearings.md`, `ARCHIVE.md`'s tail, `plan/pending/` | Step 0, orient | live | the tick's first read; nothing has run yet that could make it stale |
| `skills/next.md` Step 1, pick | the lanes, spec table and `needs` Step 0 §5 just read | Step 1, right after orient | live | reuses Step 0's read, but no step runs between them (no build, no wait); the claim call right after is the real conflict gate |
| `skills/next.md` Step 1, "Claim before anything else" | the claims ref, via `claims.mjs claim <id>` | Step 1, pick | live | a fresh fetch + CAS push against origin's `claims` branch (claims.mjs row below), retried on a lost race |
| `skills/next/build.md` §1, cut the worktree | `plan/README.md` and every spec, as `origin/<base>` holds them at the fetch | Step 3, build start | live | live at the moment it runs, but this frozen copy is what the gate and close (two rows down) act on for the rest of the chunk — it is never refreshed again |
| `skills/next/build.md` §2, the builder's brief | the chunk line, A-IDs and spec text as Step 1 read them | Step 3, hand-off | live | the builder is briefed once and told never to touch shared plan files, so it has no reason to re-read; closing against the live plan stays the lead's job, not this one |
| `skills/next.md` Step 4.1, the gate | the worktree's own `plan/README.md`/spec copy, frozen at the cut | Step 4, gate | live call, stale data | `node scripts/verify.mjs` always reads fresh from disk, but the disk it reads is the worktree's cut-time snapshot; a Held line, a rival claim or another session's close landed on `origin/<base>` meanwhile is invisible to it |
| `skills/next.md` Step 4 §2-3, write `plan/pending/<id>.md` and commit `plan: close <id>` | nothing new — writes the close against the chunk Step 1 picked | Step 4, close | **stale** | between pick (Step 1) and here, Step 3's build runs 20+ minutes (longer for an L chunk or Workflow); nothing re-reads `plan/README.md`'s Held lane, the spec's `needs`, or `claims.mjs list` for this id before the close is written. This is the gap A3/74.3 names |
| `skills/next.md` Step 5, "Re-read the board first" | `announce.mjs read` | Step 5, land | live | an explicit re-read named in the prose, right before acting on it |
| `skills/next/land.md` §1, settle at orient (owner) | `git ls-tree origin/main plan/pending/` | Step 0 §4 / land §1 | live | a direct git read, run fresh every time this step fires |
| `skills/next/land.md` §3, owner lands on main | `origin/<base>` (fetch + rebase), then `settle.mjs --no-commit` | Step 5, land | live call, same gap carried forward | settle folds the close in textually once the chunk is still listed in its spec; it never checks whether the chunk went Held or got claimed elsewhere since pick — the same gap as the row above, surfacing again at land |
| `skills/next/land.md` §4, contributor lands a PR | nothing shared — pushes `next/<id>`, opens the PR on the session's own branch | Step 5, land | live | no shared-state read to go stale here; a reviewer on the PR is where a stale close would be caught |

### `/march`'s dispatch

| Where | Reads | When | Verdict | Reason |
|---|---|---|---|---|
| `skills/march.md` Step 0, sync | `origin/<base>`, via `git pull --ff-only` | Step 0 | live | fresh git read |
| `skills/march.md` Step 0, veto + lock + depth sweeps | Held lines and lock lines, via `promote.mjs sweep`, `locks.mjs sweep --write`, `promote.mjs due` | Step 0 | live | three fresh script calls, each reading `plan/README.md`/specs at the moment it runs |
| `skills/march.md` Step 0.5, pre lanes + motion stall | project lanes and the motion heartbeat, via `lanes.mjs march pre`, `motion.mjs react` | Step 0.5 | live | fresh script calls |
| `skills/march.md` Step 1, triage gate | open issues, via `gh issue list` | Step 1 | live | direct `gh` calls, no plan-file read |
| `skills/march.md` Step 1 / 1.5, continue/return + Support SLA | the tick budget and queued issues, via `support.mjs continue`, `support.mjs sla` | Step 1-1.5 | live | fresh script calls |
| `skills/march.md` Step 2, critique gate | the Asap lane (`support.mjs asap`) and `plan/CRITIQUE.md`'s header | Step 2 | live | both read fresh this tick, right before the gate decides |
| `skills/march.md` Step 3a, ready-chunk dispatch | describes `plan/README.md`'s pick order, then hands off to `/next top` | Step 3 | live | march names the condition but computes no chunk itself; `/next top` re-derives the pick fresh (its own Step 1), so no stale value crosses the hand-off |
| `skills/march.md` Step 3a', queue lanes | `lanes.mjs march queue`, `refill.mjs --write`, `generators/research.mjs` | Step 3 | live | fresh script calls |
| `skills/march.md` Step 3b, expand due | `plan/CANDIDATES.md`'s header | Step 3 | live | read fresh this tick |

### Scripts

| Where | Reads | When | Verdict | Reason |
|---|---|---|---|---|
| `scripts/plan/order.mjs`, `load()`/`simulate()` | `plan/README.md`, every spec, `plan/pending/`, the claims ref, the secret vault | every invocation (`/next peek`, `/plot`, the GUI's "next up") | live by construction | a fresh `node` process; `load()` reads from disk or `settledView` at call time; `simulate()` computes once per call from that single snapshot — self-consistent within one run, never a reused earlier read |
| `scripts/plan/settle.mjs`, `main()` | `plan/pending/`, every spec, `plan/README.md`, `plan/ARCHIVE.md`, the footguns/decisions files, plus git log/show for commit ranges | every invocation (owner settle, `/next` land §1/§3) | live by construction | a fresh `node` process; its `read()`/`cache` threads only this run's own writes between its own pending files (`settleOrder`'s order), never an earlier run's |
| `scripts/claims.mjs`, `claim`/`release`/`renew`/`prune`/`assign`/`audit` | the `claims` ref's `claims.json` | every invocation | live by construction | `update()` calls `fetchClaims()` fresh inside its retry loop, so a lost race re-fetches and retries (up to 8 times) instead of acting on a stale read |

### What the audit found

One stale read: `/next` Step 4 closes the chunk it picked in
Step 1 with no re-check of the live plan (row above, "write
`plan/pending/<id>.md`"), and `/next/land.md` §3 carries the
same gap into the owner's land step. Everything else — every
script, and every other skill-prose site — re-reads at the
point it acts. 74.2 fixes the stale row; 74.3 adds the re-read
and stop-on-mismatch at Step 4 itself (A3).

## Acceptance

- **A1** The audit table exists, one row per plan read, with
  its verdict.
- **A2** Every read the audit marks stale is re-read at the
  point of use, with a test where the code is a script.
- **A3** A mid-build change to the picked chunk (held,
  claimed elsewhere, closed) is detected before the close
  and stops the run with a named reason.
- **A4** `concepts/plan-shape.md` states the rule.

## Open questions

- Whether the audit finds anything. If every read is already
  live, the spec closes on A1 and A4 alone, and says so.

## Chunks
Measure: 4 open · 0 closed · next A5

- [ ] **74.1** Audit every plan-state read across `/next`'s
  pick, claim, close and land steps, `/march`'s dispatch,
  `order.mjs`, `settle.mjs` and `claims.mjs`: one table row per
  read site (what it reads, when, live or stale), landed in
  this spec's close · S · closes A1 · needs —
- [ ] **74.2** Fix every read 74.1 marks stale so it re-reads
  at the point of use instead of reusing an earlier read, a
  test where the fix is a script · L · closes A2 · needs 74.1
- [ ] **74.3** Before `/next`'s close, re-read the picked
  chunk's live status (held, claimed elsewhere, already
  closed) and stop the run with a named reason on a mismatch,
  never overwrite · S · closes A3 · needs 74.1
- [ ] **74.4** `concepts/plan-shape.md` gains a short "read
  live" rule naming the pattern · S · closes A4 · needs 74.2,
  74.3
