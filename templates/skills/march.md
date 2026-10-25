# Skill: march

> **Outer dispatcher.** Reads project state and delegates to one
> of the shipping skills. Designed for `/loop`. The
> autonomous-beast entry point.

## 1. Purpose

`/loop /march` is the autonomous-beast mode. It picks the
right-thing-to-do every tick:

```
pre lanes (march.lanes.md)      →  each lane that is due
unlabeled issues exist          →  /triage
ELSE critique due (rate-lim)    →  /critique
ELSE ready chunk               →  /next top
ELSE queue lanes                →  each lane that is due
ELSE pending data               →  /ship-data
ELSE expand due + bold posture  →  /expand
ELSE                            →  /iterate
```

Deliveries first: ready chunks / data ship before `/expand`
ever fires. `/expand` only runs when there's no immediate
delivery, OR when its rate-limit window opens (every ~20
commits or ~48h) AND the bearings posture is **bold** or
**autonomous**.

Your project's own steps (a weekly snapshot, a content queue,
an empty-queue refill) go in `skills/march.lanes.md`, not
here: a re-sync of the kit's skills replaces this file and
never touches that one. With no lane blocks there, dispatch is
the stock order above.

This means: an overnight run can take <PROJECT> from
"scaffolded" to "shipped, populated, iteratively polished,
critiqued, addressed, inbox-zero on issues, and growing its
own plan when reality outpaces the original spec" without a
mode switch from the user.

The triage check is **cheap when idle** (one API call to count
unlabeled issues). The critique check is **rate-limited**
(≥12 commits + ≥24h spacing, green-deploy required). The
expand check is **rate-limited + posture-gated** (≥20 commits
+ ≥48h, posture ≠ strict).

## 2. Invocation

```
/march                       # one tick: dispatch + execute
/loop 30m /march             # autonomous loop, every 30 min
/loop /march                 # self-paced autonomous loop
/loop /march careful         # ideate passes hold back: fix what is there, invent nothing
/loop /march bold            # ideate passes push: propose new work whenever building is done
```

### How hard the ideate passes push

One optional word after `/march` sets it for the run (the GUI's
Infinite picker sends it); no word is `balanced`. It tunes only
the passes that invent work: `/expand`, and `/iterate`'s
hand-off to it. Triage, critique, ready chunks and data
dispatch exactly as below.

- `careful`: fix what is there, invent nothing. Step 3c
  (expand) is skipped and `/iterate` runs `careful` (a top
  score under 3.0 stops the tick instead of handing to
  `/expand`).
- `balanced` (default): the bearings posture and cadence as
  written.
- `bold`: propose whenever building is done. Step 3c's window
  opens at **5+ commits** or **12+ hours** since the last pass
  (instead of 20 / 48 h), and `/expand` runs `bold`.

The word never loosens `plan/bearings.md`: posture `strict`
keeps `/expand` a no-op (`bold` then reads as `balanced`, and
the report says so), and only posture `autonomous` writes specs
without `/oversight` (and `Promote: aged`, one aged candidate a
pass, held behind its veto window).

## 3. Procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

If divergence, stop per §5.

Then the veto sweep, over the Held lines `/expand`'s aged
promotion writes (`- NN · auto-promoted, veto until <date>
(#<issue>) · …`; none, and it prints `clean`):

```bash
node scripts/plan/promote.mjs sweep      # veto | release | wait, one line each (gh read only)
```

| Issue state | Window | The tick does |
|---|---|---|
| closed | any | **Veto**: the spec file, its roadmap row and its Held line go; the candidate moves to `## Rejected` as `vetoed <date> (#N)`; `ARCHIVE.md` gets a `spec vetoed` line. |
| open | passed | **Release**: the Held line goes; `/next top` picks the spec as usual. |
| open | open | Nothing. |

Any veto or release: `node scripts/plan/promote.mjs sweep
--write`, the gate, one commit (`plan: veto sweep — vetoed
<NN>, released <NN>`), land. Only then close each released
issue: `gh issue close <N> --comment "veto window passed; this
spec is now built"`. Landing first matters: a closed issue
whose Held line still exists reads as a veto, whoever closed
it. The sweep is housekeeping; the tick goes on to the `pre`
lanes.

### Step 0.5 — Pre lanes

```bash
node scripts/plan/lanes.mjs march pre    # run | judge | skip <lane>, then `stock` or `N lanes at pre`
```

`stock`: fall through to Step 1. Otherwise, in file order:

- `run <lane>`: run its `run` (a skill: read and execute it
  end-to-end, adopting its contract).
- `judge <lane>`: its `when` is prose; run it only when the
  prose holds now.
- `skip <lane>`: nothing (off in `plan/bearings.md`'s `Lanes
  off`, its `when` script exited non-zero, or it yields to a
  ready Asap chunk).

A lane that returns `end-tick` is the tick's work: commit,
land and return. `continue` goes on to the next lane, then
Step 1.

### Step 1 — Triage gate (cheapest check)

Load `GH_TOKEN` from `.env` and count unlabeled open issues:

```bash
export GH_TOKEN=$(awk -F= '/^GH_TOKEN=/ {sub(/^GH_TOKEN=/, ""); print; exit}' .env)
export GH_REPO=$(awk -F= '/^GH_REPO=/ {sub(/^GH_REPO=/, ""); print; exit}' .env)
GH_REPO=${GH_REPO:-<REPO_SLUG>}

unlabeled=$(gh issue list --repo "$GH_REPO" --state open \
  --search "-label:triage:loop-queued -label:triage:planned -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number --jq 'length' 2>/dev/null || echo 0)

# Concierge lane — loop:do outranks everything, even labeled
# issues; the user said "this one, now".
urgent=$(gh issue list --repo "$GH_REPO" --state open \
  --label loop:do --json number --jq 'length' 2>/dev/null || echo 0)
```

If `urgent > 0` or `unlabeled > 0`:

- Read `skills/triage.md`.
- Execute its procedure end-to-end.
- Return.

If `unlabeled == 0`, fall through to Step 2.

If `gh` isn't installed or `GH_TOKEN` missing, **don't fail
the march** — log warning and fall through.

### Step 2 — Critique gate (rate-limited)

Read metadata header at top of `plan/CRITIQUE.md`:

```
> Last pass: <ISO-date> at commit <sha>
> Pass count: <N>
```

Dispatch to `/critique` if **all three** hold:

1. Current commit is at least **12 commits after** `Last pass`,
   OR `Last pass` > **24 hours ago**, OR `Last pass` is "never"
   and at least one substantive spec (e.g., the canonical
   sibling) has archive lines in `plan/ARCHIVE.md`.
2. `<PACKAGE_MANAGER> deploy:check` shows a green deploy.
3. No pending HIGH critique already queued for iterate.

If all three hold:

- Read `skills/critique.md`.
- Execute its procedure end-to-end.
- Return.

Otherwise fall through to Step 3.

### Step 3 — Dispatch (first match wins)

#### 3a. Ready chunk?

Open `plan/README.md` (check `plan/nexus.lock` says
`shape: chunks`). If any spec has a ready chunk under the pick
order (Asap lane, then table order; every `needs` done; nothing
in the **Held** lane, since a held or blocked chunk is a
conversation waiting for `/oversight`, not work for this tick),
or a spec ahead of it says `Not chunked yet.`:

- Run `/next top`: read `skills/next.md` and execute it
  end-to-end with the argument `top` (one chunk, claimed,
  built by a delegated builder, gated, closed, landed; it
  chunks an unchunked spec first). March stays the 30-40
  minute run; `/next` is the one-chunk unit inside it.
- No `skills/next.md` in this repo (an older adoption):
  `skills/ship-a-chunk.md` end-to-end instead.
- Return.

#### 3a'. Queue lanes?

No chunk is ready. Run the `queue` lanes the way Step 0.5
runs the `pre` ones:

```bash
node scripts/plan/lanes.mjs march queue
```

A lane returning `end-tick` ends the tick; `stock`, or every
lane returning `continue`, falls through to 3b.

#### 3b. Pending data?

Open `data/BACKLOG.md`. If any `[ ]` row exists (and project
has a data layer):

- Read `skills/ship-data.md`.
- Execute its procedure end-to-end.
- Return.

#### 3c. Expand due (rate-limited, posture-gated)?

Read `plan/bearings.md` "Plan expansion posture" section. If
posture is **strict**, skip to 3d. A `careful` run (§2) skips to
3d too; a `bold` run uses its shorter window in condition 2.

Read metadata header at top of `plan/CANDIDATES.md`:

```
> Last pass: <ISO-date> at commit <sha>
> Pass count: <N>
```

Dispatch to `/expand` if **all four** hold:

1. Posture is **bold** or **autonomous** (not strict).
2. Current commit is at least **20 commits after** `Last pass`,
   OR `Last pass` is more than **48 hours ago**, OR `Last pass`
   is "never" and at least **3 chunks have archive lines**.
3. There's at least one signal worth examining: `plan/AUDIT.md`
   has Pending rows, OR `plan/CRITIQUE.md` has Pending rows,
   OR `git log -p --since="<last pass>" -- spec.md design/`
   shows changes, OR `data/` has substantial growth since the
   plan was authored.
4. No chunk or data work is ready (Steps 3a/3b would have
   matched first if there were).

If all four hold:

- Read `skills/expand.md`.
- Execute its procedure end-to-end (as `/expand bold` on a
  `bold` run).
- Return.

If any condition fails, fall through to 3d.

#### 3d. Else — iterate.

- Read `skills/iterate.md`.
- Execute its procedure end-to-end (as `/iterate careful` on a
  `careful` run).
- Return.

(Note: when `/iterate`'s audit finds no actionable findings
scoring ≥ 3.0 AND posture is bold, iterate dispatches to
`/expand` itself rather than stopping. See `skills/iterate.md`
§6 failure mode 6.)

### Step 4 — Done

Return cleanly. Loop's next tick re-dispatches.

## 4. Hand-off honesty

When you dispatch into a child skill, **fully adopt its
contract**. Hard rules, failure modes, commit conventions,
verify gate. `/march` itself doesn't add rules; it inherits.

A march tick succeeds iff the child tick succeeds.

## 5. Failure modes

`/march` itself only fails on:

1. **`git pull` divergence.**
2. **State files corrupted or missing** (plan/README.md,
   AUDIT, BACKLOG, CRITIQUE), or `node scripts/plan-check.mjs`
   red on a clean checkout. Stop and report — don't reconstruct
   silently.

Otherwise inherited from the dispatched skill.

## 6. Quick reference

```bash
# State files
plan/README.md                       # lanes + specs: the chunk queue
plan/<NN>-<slug>.md                  # each spec's chunks
data/BACKLOG.md                      # pending data work
plan/CRITIQUE.md                     # critique queue + last-pass metadata

# External signals
gh issue list ...                    # unlabeled count
<PACKAGE_MANAGER> deploy:check                    # green-deploy condition

# Skills it dispatches into
skills/triage.md                     # Step 1 (cheapest)
skills/critique.md                   # Step 2 (rate-limited)
skills/next.md                       # Step 3a (/next top)
skills/ship-data.md                  # Step 3b
skills/expand.md                     # Step 3c (posture-gated)
scripts/plan/promote.mjs             # Step 0 veto sweep (Promote: aged)
skills/march.lanes.md                # Step 0.5 + 3a': this project's own lanes (scripts/plan/lanes.mjs)
skills/iterate.md                    # Step 3d
```
