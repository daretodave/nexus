# Skill: expand

> **Plan-expansion pass.** Read accumulated signals and propose
> new phase candidates to `plan/PHASE_CANDIDATES.md`. The build
> plan ships well; this skill is how it *grows* well.
>
> **Posture-controlled.** Default is **bold** — the skill runs
> on schedule and surfaces candidates. Set to **strict** in
> `bearings.md` to make `/expand` a no-op (build plan grows only
> via manual `/plan-a-phase` or `/oversight`).

## 1. Purpose

The autonomous loop is good at consuming the build plan. It is
bad at noticing when the project has *outgrown* its plan:

- An audit finding scores 9 but can't ship in one fix.
- 4 GitHub issues all gesture at the same missing surface.
- The data layer grew records the plan never anticipated.
- A new design export landed that has no phase to integrate.
- `spec.md` was edited and the change implies new phases.

`/expand` is the lens that catches these patterns. It does
**not** abandon the spec or pre-empt deliveries. It surfaces
**candidates**; `/oversight` decides which become real phases.

The point isn't "ship more." The point is "notice when reality
has overtaken the plan."

## 2. Invocation

```
/expand                       # full pass — read signals, file candidates
/expand audit                 # bias toward AUDIT.md findings
/expand spec                  # bias toward spec drift
/expand design                # bias toward new design exports
/expand dry-run               # report candidates; do not commit
```

`/march` invokes `/expand` periodically (rate-limited) when
posture is **bold**. `/iterate` falls through to `/expand` when
the audit produces no actionable findings (top score < 3.0) AND
posture is bold — that's the "make things brilliant when delivery
is not" path.

## 3. Posture (read from `bearings.md`)

`bearings.md` should contain a section:

```markdown
## Plan expansion posture

- Mode: **bold** (default)
```

Three settings:

- **bold** (default) — `/expand` runs at standard cadence
  (rate-limited per §9). Candidates land in
  `plan/PHASE_CANDIDATES.md`. `/oversight` promotes.
- **strict** — `/expand` is a **no-op**. Print
  `"expand: strict posture — skipping"` and exit 0. The
  `/march` dispatcher skips the expand gate entirely.
- **autonomous** — `/expand` writes candidates **directly to
  `plan/steps/01_build_plan.md`** as new pending phase rows.
  No `/oversight` review. Use only when the loop is deeply
  trusted and the spec is stable. **Document the choice in
  `bearings.md` Hard Rules** so the user knows.

If the bearings section is missing, default to **bold** and add
the section in the same commit (`bearings: add expand posture
(default bold)`).

## 4. Signal sources

Read in parallel where possible. Each finding type maps to
different "expansion shapes":

### A. Audit findings too big to be fixes

`plan/AUDIT.md` Pending rows. Shape:
- `impact ≥ 8` AND `ease ≤ 4` → too big for one tick.
- 3+ findings under the same category → suggests a refactor
  phase, not 3 fixes.

### B. Critique findings clustered

`plan/CRITIQUE.md` Pending rows. Shape:
- 3+ HIGH findings on the same URL/family → restructure phase.
- Repeated mobile-reflow findings across pages → "mobile audit"
  phase.

### C. Triage backlog patterns

GitHub issues labeled `triage:loop-queued` (or `triage:reviewed`)
sitting in queue. Shape:
- 4+ issues asking for the same feature → propose that feature
  as a phase.
- Issues consistently routed to `triage:needs-user` → propose a
  phase that removes the user gate.

### D. Spec drift

`git log -p --since="<last expand pass>" -- spec.md`. If the
spec has changed since the last expand pass:
- New feature paragraphs → propose phases for them.
- New non-goals removed → look for phases the loop avoided that
  may now be in scope.
- Audience or scope expansion → flag as a meta-candidate (may
  reshape multiple phases).

### E. Design landings

New / modified files in `design/`:
- `design/page-<family>.<ext>` for a family that doesn't have a
  phase → propose the phase.
- `design/atoms.<ext>` adding new atoms → propose extracting
  them as a primitives phase if substantial.
- `design/decisions.<ext>` modifications → check against
  `bearings.md`; propose alignment work.

### F. Data growth

`/data/` (if Pattern A) — record counts vs. when the plan was
written:
- An entity went from 0 to 50+ records → may warrant its own
  index page / detail surface that wasn't planned.
- Cross-reference graphs that grew complex → may warrant a
  taxonomy / browse phase.

### G. Commit-pattern signals

`git log --since="<last expand pass>" --pretty=format:'%s'`:
- 5+ commits in a row touching the same surface with `fix:` →
  may be a refactor candidate.
- A phase that took 3+ retries to ship → may have been
  underspec'd; propose a brief-refresh phase.

### H. Existing plan gaps

`plan/steps/01_build_plan.md` review:
- Phases marked `[skipped]` — may now be ship-able if context
  changed.
- Cross-cutting phases (polish, perf) sitting at the end with
  many sub-tasks accumulated — may warrant a split.

## 5. Scoring candidates

Each candidate gets `expand_score` 0–10:

| Factor | Adjustment |
|---|---|
| Signal multiplicity (≥2 source types pointing same way) | +1 to +3 |
| Urgency (spec/design changed in last 7 days) | +2 |
| Cheap-and-impactful (estimated 1 phase, high-leverage surface) | +2 |
| Expensive-or-uncertain (estimated 3+ phases or unclear scope) | -2 |
| Conflicts with `bearings.md` URL contract or non-goals | -3 |
| Conflicts with `spec.md` non-goals (explicit "we don't do this") | -5 (drop unless score still > 3) |

Top **3 candidates per pass** ship. Others get a one-line note
under `## Considered (below threshold)` for the next pass to
re-evaluate.

## 6. The procedure

### Step 0 — Re-sync

```bash
git pull --ff-only
```

Read `bearings.md` for posture. If **strict** → exit 0
immediately with a one-line log. No commit.

### Step 1 — Read signals (in parallel)

Per §4. Each source is a separate read; main agent merges.

### Step 2 — Synthesize candidates

For each signal cluster, draft a candidate:

```markdown
### [ ] [score X.Y] <one-line description>
- proposed: <ISO date>, expand pass <N>
- source signals:
  - <signal 1>
  - <signal 2>
- rationale: <why this is real, not noise>
- proposed scope: <1-phase | N-phase mini-plan>
- estimated phases: <N>
- conflicts: <with spec / contract / existing plan; or "none">
```

Score per §5. Sort. Take top 3.

### Step 3 — Self-assess

For each top candidate, ask:

1. **Is this real demand or model imagination?** Multiple
   independent signals = real. One audit row = wait.
2. **Does it conflict with `spec.md` non-goals?** If yes, drop
   unless the user has explicitly broadened scope.
3. **Is the scope honest?** "Add comments" = N phases minimum;
   don't pretend it's one.
4. **Does the loop have the capacity to ship this?** A
   candidate that requires schema migration of 100 records
   deserves to be phase-promoted but only by `/oversight`.

After assessment, you should have **2–4 candidates**, not 3
mechanically.

### Step 4 — Write to `PHASE_CANDIDATES.md`

Append under `## Pending`. Update metadata header (last pass,
pass count).

If posture is **autonomous**, instead of writing to
`PHASE_CANDIDATES.md`, **append the new phase rows directly to
`plan/steps/01_build_plan.md` "Status (at-a-glance)" block**.
Pick the next free phase number. Document in commit body that
this was autonomous (not via oversight).

### Step 5 — Commit + push

```bash
git add plan/PHASE_CANDIDATES.md
git commit -m "$(cat <<'EOF'
expand: pass <N> — <K> candidates filed

Top candidates:
- [score X.Y] <one-line>
- [score X.Y] <one-line>

Source signals: <brief — audit / critique / triage / spec / design / data / commits>.
Posture: bold. Promotion gated by /oversight.
EOF
)"
git push origin <DEFAULT_BRANCH>
```

(If autonomous posture: subject is `expand: pass <N> — <K>
phases promoted (autonomous)` and the body lists which phase
numbers + their topics.)

If **zero** candidates score above threshold: still update the
metadata header, commit `expand: pass <N> — no candidates`. The
pass counter is what `/march` reads to rate-limit.

### Step 6 — Confirm deploy

```bash
pnpm deploy:check
```

Plan-only commits trigger rebuilds; verify no regression.

### Step 7 — Done

Print 3-line summary:

```
expand pass <N>: <K> candidates filed (<L> dropped below threshold).
plan/PHASE_CANDIDATES.md updated.
oversight will review and promote.
```

## 7. Hard rules

1. **Never modify code.** Plan adjustments only.
2. **Cap at 3 filed candidates per pass.** Boldness != flooding.
3. **Don't promote spec non-goals.** If spec.md says "no
   comments thread," don't propose a comments phase even if
   external signals demand it. Surface it as `[needs-user-call]`
   in the candidate's `conflicts` field; user resolves via
   `/oversight` or by editing spec.
4. **Cite the signals.** Every candidate must list ≥1 concrete
   signal source (audit row, critique finding, issue number,
   spec diff line, design file).
5. **Honest scope.** A 3-phase candidate is not a 1-phase
   candidate just because that fits more comfortably.
6. **One commit per pass.**
7. **No emojis. No `Co-Authored-By:`.**
8. **Strict posture is real.** If posture is `strict`, exit 0
   with no-op. Don't sneak candidates in.

## 8. Failure modes

1. **Posture not in `bearings.md`.** Default to bold; add the
   section in the commit. Not a failure.
2. **`git pull` divergence.** Stop and report.
3. **No signals to expand on** (very early in the project,
   nothing has moved). Update metadata, commit "no candidates,"
   exit 0.
4. **All candidates conflict with spec.** Surface as
   `[needs-user-call]` rows; oversight resolves.
5. **Autonomous posture but the phase number conflicts** with a
   recently-shipped phase (race condition with concurrent
   ship-a-phase). Stop and report.

## 9. When `/march` invokes `/expand`

Conditions in `/march` Step (between critique and dispatch):

1. Posture is **bold** or **autonomous** (not strict).
2. Last expand pass was **at least 20 commits ago**, OR more
   than **48 hours ago**, OR is "never" and at least 3 phases
   have shipped.
3. There's at least one signal worth examining
   (`pnpm` heuristic check: `wc -l plan/AUDIT.md` > some
   threshold, or `git log -p --since=...` shows spec/design
   changes).

If all three: dispatch to `/expand`. If any fails: fall through
to normal phase / data / iterate dispatch.

`/iterate` also dispatches to `/expand` when its own audit
produces no findings scoring ≥ 3.0 — instead of stopping per
§6 of iterate, it writes "no actionable iterate work — handing
to expand" and runs `/expand`.

## 10. Quick reference

```bash
# Read
plan/bearings.md                              # posture
plan/AUDIT.md                                 # audit signals
plan/CRITIQUE.md                              # critique signals
plan/PHASE_CANDIDATES.md                      # current state
plan/steps/01_build_plan.md                   # existing phases
data/BACKLOG.md                               # data signals (Pattern A)
spec.md                                       # spec drift

# Git diffs (signals)
git log -p --since="<last pass>" -- spec.md
git log -p --since="<last pass>" -- design/
git log --since="<last pass>" --pretty=format:'%s'

# Issues (signals — if gh available)
gh issue list --repo $GH_REPO --label "triage:loop-queued" --json number,title

# Write
plan/PHASE_CANDIDATES.md                      # bold posture
plan/steps/01_build_plan.md                   # autonomous posture only

# Commit + push + confirm
git add <files>
git commit -m "expand: pass <N> — ..."
git push origin <DEFAULT_BRANCH>
pnpm deploy:check
```
