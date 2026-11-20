# Skill: next

> **March with no assumptions: one chunk, done fully.** Orient,
> pick, claim, delegate the build, gate, close with a pending
> file, land per owner mode, release, retro. The lead never
> builds; it decides, checks and lands. Detail lives in
> `skills/next/build.md` and `skills/next/land.md`.

## 1. Purpose

`/next` moves <PROJECT>'s plan by one chunk, leaving nothing
half-done: built, gated, closed, landed, claim released.
`/march` (the 30-40 minute run) calls `/next top`; `/heads-down`
loops it. The builder follows `skills/ship-a-chunk.md`'s build steps.

## 2. Invocation

```
/next                  # pick the next ready chunk (a contributor is asked which)
/next top              # the first ready, unclaimed chunk, no question (loops)
/next 07 | 07.3        # spec 07's next ready chunk | that chunk
/next chunk 07         # only chunk spec 07 (no build)
/next batch 07         # owner: spec 07's ready chunks, one Workflow each
/next peek             # say what is next and why; change nothing
/next status [07 …]    # print node scripts/plan/progress.mjs as it is
/next ... base <b>     # build on feature branch <b>, land as a PR onto it
/next ... --agents     # override the build mode: one builder (--workflow: a Workflow)
/next <free text>      # that text is the run's work (scope, build, retro)
/next ... then expand  # a loop's dry tail: nothing ready, /expand once (then build: promote)
```

## 3. Who's running, and asking

`node scripts/claims.mjs whoami` first. **Owner** (effective
owner mode: an untracked `.owner`, not switched off in
`.nexus/local.json`; `scripts/owner.mjs`): may claim many at
once, lands on main, settles `plan/pending/`. **Contributor**:
one chunk per run (a `/heads-down` package excepted), lands a
pull request, never pushes main, never settles. With no
argument a contributor sees the first four ready, unclaimed
chunks and picks one (AskUserQuestion, first Recommended).

Ask only before the first write, in one batch (`agents.md`).
Under `/loop`, `/march` or `/heads-down`, never ask: take
the recommended default and list each in the close and report.
An owner-only gate (a principle the work would break, a
legal read, a production action nobody okayed) has no default:
park it in the `/oversight` queue, skip the chunk, release it.

## 4. Procedure

### Step 0 — Orient (always, briefly)

1. `git fetch origin`. The primary checkout gets diligence
   only: on `<DEFAULT_BRANCH>` and clean, `git pull --ff-only`
   there; otherwise leave it and say so. All building happens
   in a worktree cut from `origin/<base>` (`next/build.md`).
2. `node scripts/claims.mjs prune`, `list`, and `renew` this
   session's claims. No claims module: skip, and say so.
3. `node scripts/announce.mjs read`: an owner line outranks
   this file; `REBOOT <slug>` means `/reboot-ready <slug>` now.
4. **Owner only: settle.** `plan/pending/` on origin/main lists
   more than its README → settle first (`next/land.md` §1).
5. Read `plan/nexus.lock` (`shape: chunks`, else stop: the repo
   is on v1), `plan/README.md`, the picked spec,
   `plan/bearings.md`, the last ~15 lines of `plan/ARCHIVE.md`
   and `plan/pending/`.

### Step 1 — Pick

A chunk is **done** when no spec lists it or
`plan/pending/<id>.md` is on origin/main. The next chunk is
the first listed whose `needs` are all done, taking specs in
this order: an explicit argument; the **Asap** lane in order;
**priority** rows (`priority 1` first) then the table order.
Skip the **Held** lane, `plan only` specs, a spec naming
another base, and every chunk someone else claims or holds.
A chunk with `secrets` is the owner's (a contributor skips it).
One whose secret is missing reads `needs secret` (`order.mjs`):
file the ask (`secrets.mjs request <id> [--to D,D] [--service
S]`, names only, never in chat), commit, land, pick again.

- `peek`: say the pick, its size, its A-IDs, why it beat the
  rest, and what blocks it, then run the retro and stop.
- `status`: print `node scripts/plan/progress.mjs <specs>
  --ref origin/<base>` as it is, and stop.
- **Claim before anything else**: `node scripts/claims.mjs
  claim <id>`. Refused: pick again.
- Free text: the work. Scope it in ≤ 5 lines, ask before
  anything destructive or outward; Steps 3-6 apply.

Say in ≤ 5 lines: chunk, size, A-IDs, build mode, any Open
question that blocks it (ask now; under a loop park it, pick
again). Print the spec's progress (`status`).

### Step 2 — Chunk (a spec with no chunks yet)

Chunking is the run's whole work: map the spec read-only, give
every acceptance bullet a stable `A<n>`, write `## Chunks` with
a true `Measure:` line and S/M/L chunks covering every A-ID
(`skills/plan-a-spec.md` §5, `nexus/concepts/plan-shape.md`).
Gate, commit `plan: chunk spec <NN>`, land per owner mode
(Step 5), release the spec's claim, stop.

### Step 3 — Build (always delegated)

The lead cuts the worktree (`next/build.md` §1), then:

| Size | Default | Override |
|---|---|---|
| S, M | one builder subagent (Agent tool; background, but foreground when headless) | `--workflow` |
| L | a Workflow: build, then adversarial verify, then fix | `--agents` |
| `batch` | one Workflow per chunk, disjoint paths | owner only |

The brief (`next/build.md` §2) carries the worktree path, the
base sha, the chunk line, its A-IDs, the spec and the builder's
rules: commit slices in the worktree, run only the tests it
touched, never edit shared plan files, never push. While it
runs, the lead acts on a `REBOOT` board line and waits for the
harness's notice, never polling it (build §2). No Agent or
Workflow tool in this harness: build inline, say so in the close.

The lead reads the returned diff against every A-ID; a miss
goes back once, then the lead finishes it.

### Step 4 — Gate and close

1. The verify gate (`pnpm verify`, or what `agents.md` names)
   in the worktree, **foreground**, by the lead. Red → the
   builder's brief gets the log; ≤ 3 rounds on one root cause.
2. Write `plan/pending/<id>.md` (`next/land.md` §2): `close`,
   `date`, `says` (≤ 10 words, what now works), `footguns:`,
   and only when needed `## Edit`, `## Decisions`,
   `## Footguns`. Never edit a shared plan file yourself.
3. Gate again; commit `plan: close <id>` alone.

### Step 5 — Land per owner mode

Re-read the board first (`announce.mjs read`). Then (`next/land.md` §3-4):

- **Owner:** rebase onto `origin/<base>` just fetched, settle,
  gate, `git push origin HEAD:<DEFAULT_BRANCH>`. Rejected:
  fetch, drop the settle commit, rebase, settle, gate, retry.
- **Contributor:** push `next/<id>` and open a pull request
  (`gh pr create`), then `node scripts/claims.mjs pr <id> <n>`.
  In a `/heads-down` package: push the package branch, no PR
  (the package opens one at the end).
- A run is not done until main (or the PR) holds every commit.

### Step 6 — Release, retro, report

1. Owner: `claims.mjs release <id>` once main holds it (a
   PR'd claim ends at merge); close the worktree (build §4).
2. **Retro** (always, even for `peek`): failed commands, edits
   that didn't apply, wrong assumptions, what review caught. A
   trap goes into the pending file's `footguns:` or
   `## Footguns`. A lesson becomes a test, hook or lint where
   one can catch it; this file grows only by removing as much.
   Nothing to learn: "retro: clean".
3. Report: what works now (1-3 lines), the defaults, what the
   retro changed, the next pick, and the progress as it is.

## 5. Loops

`/heads-down` starts them. Each iteration is a full `/next`
from Step 0 in a fresh worktree of `origin/<base>` (a
contributor package: its one `pkg/<slug>` worktree), prints
the progress at its start and end, and never asks.

## 6. Hard rules

1. The lead runs the gate, foreground. Builders never do.
2. Shared plan files change only through settle (owner, main).
3. Never build in the primary checkout; never force-push; no
   `--no-verify`; no destructive resets.
4. A claim before any write; release only once main holds the
   work (or it carries a PR).
5. The plan only shrinks; A-IDs and chunk ids never reused.
   This file stays ≤ 200 lines, `next/*.md` ≤ 120 (the gate).

## 7. Failure modes

- **Gate red 3x on one root cause:** stop; keep the claim if the
  branch holds work worth resuming, else release; say so loud
  (`agents.md`, "Blocked is loud").
- **Push rejected 3x:** stop and report; never force.
- **Nothing ready:** say why per chunk (needs, held, claimed);
  under `/march` fall through to its next verb; `then expand`
  or `then build` runs `/expand` (`skills/expand.md` §2).
- **Builder or Workflow died:** harvest its commits, then
  finish inline or re-delegate once.

## 8. Quick reference

```bash
node scripts/claims.mjs whoami | list | claim <id> | renew | pr <id> <n> | release <id>
node scripts/plan/progress.mjs <NN…> --ref origin/main
node scripts/plan/settle.mjs            # owner, on main / detached origin/main
pnpm verify                              # the gate (lead only)
```
