# Skill: expand

> **Plan-expansion pass.** Read accumulated signals and propose
> new candidates to `plan/CANDIDATES.md`; each promoted
> one becomes a spec. The plan ships well; this skill is how it
> *grows* well.
>
> **Posture-controlled.** Default is **bold** — the skill runs
> on schedule and surfaces candidates. Set to **strict** in
> `bearings.md` to make `/expand` a no-op (the plan grows only
> via manual `/plan-a-spec` or `/oversight`).

**Knobs.** Every expansion knob this skill reads (Support,
Promote, Generators, stall_action, loop, UI, Research,
Cadence) comes through the improvement dial's resolver,
`node scripts/plan/improve.mjs` (`--knob <name>` prints one
value): the `Improve:` line in `plan/bearings.md`, absent read
as `gentle`, and any line of its own that overrides it. Never
grep bearings for a knob by hand.

## 1. Purpose

The autonomous loop is good at consuming the plan. It is
bad at noticing when the project has *outgrown* its plan:

- An audit finding scores 9 but can't ship in one fix.
- 4 GitHub issues all gesture at the same missing surface.
- The data layer grew records the plan never anticipated.
- A new design export landed that has no spec to integrate it.
- `spec.md` was edited and the change implies new specs.

`/expand` is the lens that catches these patterns. It does
**not** abandon the spec or pre-empt deliveries. It surfaces
**candidates**; `/oversight` decides which become real specs.

The point isn't "ship more." The point is "notice when reality
has overtaken the plan."

## 2. Invocation

```
/expand                       # full pass — read signals, file candidates
/expand audit                 # bias toward AUDIT.md findings
/expand spec                  # bias toward spec drift
/expand design                # bias toward new design exports
/expand dry-run               # report candidates; do not commit
/expand careful               # one candidate at most, and only with 2+ independent signals
/expand bold                  # up to 3; one strong signal (score 5+) is enough
/expand promote               # owner: this pass writes its picks as unchunked specs
```

`/march` invokes `/expand` periodically (rate-limited) when
posture is **bold**. `/iterate` falls through to `/expand` when
the audit produces no actionable findings (top score < 3.0) AND
posture is bold — that's the "make things brilliant when delivery
is not" path.

**Run words.** `careful` and `bold` tune only the cap and the
bar (§7 rule 2 is the cap; the bar is §6 Step 3's "one audit
row = wait" and §7 rule 4); no word keeps them as written.
`promote` makes this one pass act as posture `autonomous` (§3):
its picks become unchunked specs (`plan/<NN>-<slug>.md` + a
`plan/README.md` row, landed per owner mode), and each also goes
under `## Promoted` in `plan/CANDIDATES.md` as `promoted:
<date>, auto (expand pass <N>)` so `/oversight` still sees what
grew. Owner mode only (a contributor files candidates as usual
and says so); never under `strict`.

**When a `/next` loop runs dry** (`/loop /next then expand` or
`then build`, sent by the GUI's Infinite picker): the iteration
that finds nothing ready runs one `/expand` pass instead of
ending. The plan being done is the signal, so the rate limit is
skipped; the posture is not (`strict`: stop as a bare loop
would). `then expand` runs the pass as the posture says, then
the loop stops and says what it filed: candidates that wait in
`/oversight`, or under `autonomous` the specs it added (the
next run builds them). `then build` runs `/expand promote`:
the loop chunks and builds what it added, and the next dry
spell runs another pass. It stops when a pass adds nothing
(every candidate needs cited signals, so the loop ends when
the evidence does) or after its third promote pass, whichever
comes first, and says which. A contributor's `then build`
reads as `then expand`.

## 3. Posture (read from `bearings.md`)

`bearings.md` should contain a section:

```markdown
## Plan expansion posture

- Mode: **bold** (default)
```

Three settings:

- **bold** (default) — `/expand` runs at standard cadence
  (rate-limited per §9). Candidates land in
  `plan/CANDIDATES.md`. `/oversight` promotes.
- **strict** — `/expand` is a **no-op**. Print
  `"expand: strict posture — skipping"` and exit 0. The
  `/march` dispatcher skips the expand gate entirely.
- **autonomous** — `/expand` writes candidates **directly to
  the plan** as new unchunked specs (`plan/<NN>-<slug>.md` +
  a row in `plan/README.md`).
  No `/oversight` review. Use only when the loop is deeply
  trusted and the spec is stable. **Document the choice in
  `bearings.md` Hard Rules** so the user knows.

The same section holds the aged-promotion knobs (Step 4b), one
`Key: value` line each; a missing key takes the default:

| Key | Values | Default |
|---|---|---|
| `Promote` | `owner \| aged \| autonomous` | the `Improve:` dial's (steady and bold `aged`), else `owner` (a new adoption's bearings ships `aged`); `strict` forces `owner` |
| `promote_after_days` | days | 21 |
| `promote_floor` | score | 6.0 |
| `promote_per_week` | count | 1 |
| `veto_days` | days | 3 |
| `pending_cap` | count | 15 (Step 4c) |

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
  spec, not 3 fixes.

### B. Critique findings clustered

`plan/CRITIQUE.md` Pending rows. Shape:
- 3+ HIGH findings on the same URL/family → restructure spec.
- Repeated mobile-reflow findings across pages → "mobile audit"
  spec.

### C. Triage backlog patterns

GitHub issues labeled `triage:loop-queued` (or `triage:reviewed`)
sitting in queue. Shape:
- 4+ issues asking for the same feature → propose that feature
  as a spec.
- Issues consistently routed to `triage:needs-user` → propose a
  spec that removes the user gate.

### D. Spec drift

`git log -p --since="<last expand pass>" -- spec.md`. If the
spec has changed since the last expand pass:
- New feature paragraphs → propose specs for them.
- New non-goals removed → look for work the loop avoided that
  may now be in scope.
- Audience or scope expansion → flag as a meta-candidate (may
  reshape multiple specs).

### E. Design landings

New / modified files in `design/`:
- `design/page-<family>.<ext>` for a family that doesn't have a
  spec → propose the spec.
- `design/atoms.<ext>` adding new atoms → propose extracting
  them as a primitives spec if substantial.
- `design/decisions.<ext>` modifications → check against
  `bearings.md`; propose alignment work.

### F. Data growth

`/data/` (if Pattern A) — record counts vs. when the plan was
written:
- An entity went from 0 to 50+ records → may warrant its own
  index page / detail surface that wasn't planned.
- Cross-reference graphs that grew complex → may warrant a
  taxonomy / browse spec.

### G. Commit-pattern signals

`git log --since="<last expand pass>" --pretty=format:'%s'`:
- 5+ commits in a row touching the same surface with `fix:` →
  may be a refactor candidate.
- A chunk that took 3+ retries to ship → its spec may have
  been underspec'd; propose a spec refresh.

### H. Existing plan gaps

`plan/README.md` + specs review:
- Chunks in the **Held** lane — may now be ship-able if
  context changed.
- Cross-cutting specs (polish, perf) sitting at the end with
  many chunks accumulated — may warrant a split.

## 5. Scoring candidates

Each candidate gets `expand_score` 0–10:

| Factor | Adjustment |
|---|---|
| Signal multiplicity (≥2 source types pointing same way) | +1 to +3 |
| Urgency (spec/design changed in last 7 days) | +2 |
| Cheap-and-impactful (estimated 1 chunk, high-leverage surface) | +2 |
| Expensive-or-uncertain (estimated 3+ chunks or unclear scope) | -2 |
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
- proposed scope: <1-chunk | N-chunk spec>
- estimated chunks: <N>
- conflicts: <with spec / contract / existing plan; or "none">
```

Score per §5. Sort. Take top 3. If a signal reinforces a
candidate already sitting in `## Pending` rather than
describing something new, don't file a duplicate — re-evidence
that row instead:

```bash
node scripts/plan/promote.mjs reevidence "<title words>" <A-H> \
  [#<issue>|<sha>] --note "<the signal>" --write
```

It appends a dated line under the row's `- re-evidence:` (the
first one also writes `- filed score:`). A signal is
independent when its letter (§4) or its issue or commit is new
to the row; each independent one adds +0.5 to the score,
capped at +2 over the filed score, and counts toward Step 4b's
re-evidenced-twice trigger. A signal the row already cites is
logged at +0. Pending stays live: what keeps coming back rises.

### Step 3 — Self-assess

For each top candidate, ask:

1. **Is this real demand or model imagination?** Multiple
   independent signals = real. One audit row = wait.
2. **Does it conflict with `spec.md` non-goals?** If yes, drop
   unless the user has explicitly broadened scope.
3. **Is the scope honest?** "Add comments" = N chunks minimum;
   don't pretend it's one.
4. **Does the loop have the capacity to ship this?** A
   candidate that requires schema migration of 100 records
   deserves to be promoted to a spec, but only by `/oversight`.

After assessment, you should have **2–4 candidates**, not 3
mechanically.

### Step 4 — Write to `CANDIDATES.md`

Append under `## Pending`. Update metadata header (last pass,
pass count, posture, and nothing else: the pass narrative goes
in the commit body, and the header stays at 20 lines or
fewer).

If posture is **autonomous**, instead of writing to
`CANDIDATES.md`, **write each as a new spec**:
`plan/<NN>-<slug>.md` with the next free spec number, its
outcome, Why, Design, Acceptance (A-IDs) and `Not chunked
yet.`, plus a row in `plan/README.md`. Run `node
scripts/plan-check.mjs --since HEAD`. Document in the commit
body that this was autonomous (not via oversight).

### Step 4b — Aged promotion (the silt valve)

A queue nobody promotes silts up. Under `Promote: aged` (or
`autonomous`), as the resolver reads it (a `Promote:` line in
`bearings.md`, §3, else the `Improve:` dial; no line at all
reads `owner`, and this step does nothing), the pass ends by promoting at most
one aged candidate, behind a window in which the owner can say
no:

1. `node scripts/plan/promote.mjs pick`. It prints `pick …`
   for the best Pending row scoring ≥ `promote_floor` that is
   `promote_after_days` old or re-evidenced twice (ties: the
   oldest), while fewer than `promote_per_week`
   auto-promotions are dated in the last 7 days (vetoed ones
   count). `none: <why>` ends the step.
2. Write it as an unchunked spec (as autonomous posture does,
   above) and move its row to `## Promoted` as `### [promoted
   <date> → spec <NN>] [score X] <title>` with `- promoted:
   <date>, auto (expand pass <N>), veto #<issue>` (the line the
   weekly cap counts; it stays when a veto moves the row).
3. Open the veto issue:

   ```bash
   gh label create loop:veto --repo "$GH_REPO" --force   # idempotent
   gh issue create --repo "$GH_REPO" \
     --title "Auto-promoted: <title> — close to veto" \
     --label loop:opened --label loop:veto --body "<body>"
   ```

   The body: the row's rationale cut at 600 characters, the
   spec's link, and "close this issue by <date> to veto; left
   open, the loop builds it". `loop:opened` keeps `/triage`
   off it.
4. `node scripts/plan/promote.mjs hold <NN> <issue>` writes the
   Held line, `veto_days` out:
   `- NN · auto-promoted, veto until <date> (#<issue>) · max_age: 3d · fallback: release`.
   Nothing picks a Held spec, so nothing chunks or builds it in
   the window; `/march` Step 0 vetoes or releases it.
5. `node scripts/plan-check.mjs --since HEAD` green.

No issue, no promotion: when `gh` cannot open it, undo the
spec and the row move, and say so in the commit body. `ask …`
(a contributor's checkout, or pull-request mode) files no spec:
one `[needs-user-call] promote <title>?` row in
`plan/AUDIT.md`, deduped by title.

### Step 4c — The Pending cap

A queue past its cap sheds its stalest, so what waits stays
worth reading. After Step 4b, whatever `Promote` reads:

```bash
node scripts/plan/promote.mjs cap --write
```

While `## Pending` holds more than `pending_cap` rows (§3;
15), it moves the lowest-scoring rows proposed 60 or more days
ago (ties: the oldest) to `## Rejected` with `- reason: stale:
below cap cut <date>`, at most 5 a pass, and prints one `cut …`
line each. A row younger than 60 days is never cut. `node
scripts/plan/promote.mjs cuts` lists them for `/digest`.

### Step 5 — Commit + land

```bash
git add plan/CANDIDATES.md   # + plan/README.md and plan/<NN>-*.md after an aged promotion
git commit -m "$(cat <<'EOF'
expand: pass <N> — <K> candidates filed

Top candidates:
- [score X.Y] <one-line>
- [score X.Y] <one-line>

Source signals: <brief — audit / critique / triage / spec / design / data / commits>.
Posture: bold. Promotion gated by /oversight.
EOF
)"
# land per owner mode: skills/next/land.md §6
```

(If autonomous posture: subject is `expand: pass <N> — <K>
specs added (autonomous)` and the body lists which spec
numbers + their topics. A `promote` pass uses the same subject,
and its body says "promoted by a then-build /next loop". An
aged promotion (Step 4b) appends `, auto-promoted <NN> (veto
until <date>)` to the subject and names the veto issue in the
body. A cap cut (Step 4c) appends `, cut <K> stale` and lists
each cut title in the body.)

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
plan/CANDIDATES.md updated.
oversight will review and promote.
```

## 7. Hard rules

1. **Never modify code.** Plan adjustments only.
2. **Cap at 3 filed candidates per pass.** Boldness != flooding.
3. **Don't promote spec non-goals.** If spec.md says "no
   comments thread," don't propose a comments spec even if
   external signals demand it. Surface it as `[needs-user-call]`
   in the candidate's `conflicts` field; user resolves via
   `/oversight` or by editing spec.
4. **Cite the signals.** Every candidate must list ≥1 concrete
   signal source (audit row, critique finding, issue number,
   spec diff line, design file).
5. **Honest scope.** A 3-chunk candidate is not a 1-chunk
   candidate just because that fits more comfortably.
6. **One commit per pass.**
7. **No emojis. No `Co-Authored-By:`.**
8. **Strict posture is real.** If posture is `strict`, exit 0
   with no-op. Don't sneak candidates in. `promote` (§2) and
   the aged promotion (Step 4b) are the run-time exceptions to
   candidates-only, and both obey this rule and owner mode.
9. **No auto-promotion without its veto.** An aged promotion
   always lands with its Held line and its open veto issue, or
   not at all.

## 8. Failure modes

1. **Posture not in `bearings.md`.** Default to bold; add the
   section in the commit. Not a failure.
2. **`git pull` divergence.** Stop and report.
3. **No signals to expand on** (very early in the project,
   nothing has moved). Update metadata, commit "no candidates,"
   exit 0.
4. **All candidates conflict with spec.** Surface as
   `[needs-user-call]` rows; oversight resolves.
5. **Autonomous posture but the spec number conflicts** with a
   spec written or archived meanwhile (race with a concurrent
   writer). Stop and report; spec numbers are never reused.

## 9. When `/march` invokes `/expand`

Conditions in `/march` Step (between critique and dispatch):

1. Posture is **bold** or **autonomous** (not strict).
2. Last expand pass was **at least 20 commits ago**, OR more
   than **48 hours ago**, OR is "never" and at least 3 chunks
   have archive lines.
3. There's at least one signal worth examining
   (`pnpm` heuristic check: `wc -l plan/AUDIT.md` > some
   threshold, or `git log -p --since=...` shows spec/design
   changes).

If all three: dispatch to `/expand`. If any fails: fall through
to normal chunk / data / iterate dispatch.

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
plan/CANDIDATES.md                      # current state
plan/README.md                                # existing specs + lanes
data/BACKLOG.md                               # data signals (Pattern A)
spec.md                                       # spec drift

# Git diffs (signals)
git log -p --since="<last pass>" -- spec.md
git log -p --since="<last pass>" -- design/
git log --since="<last pass>" --pretty=format:'%s'

# Issues (signals — if gh available)
gh issue list --repo $GH_REPO --label "triage:loop-queued" --json number,title

# Write
plan/CANDIDATES.md                      # bold posture
plan/<NN>-<slug>.md + plan/README.md          # autonomous posture only

# Commit + land + confirm
git add <files>
git commit -m "expand: pass <N> — ..."
# land per owner mode: skills/next/land.md §6
pnpm deploy:check
```
