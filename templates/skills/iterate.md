# Skill: iterate

> **Full autonomy.** Audit <PROJECT>, pick the highest-impact
> weakness, ship one improvement end-to-end. The post-build
> loop. Drains queues from `/critique` and `/triage` alongside
> its own audit.

## 1. Purpose

Phases ship the structure. After they ship, the project is
**alive but thin**. `/iterate` is the loop that fills it in.

Useful **during** build phases too as a separate quality pass
on already-shipped surfaces.

## 2. Invocation

```
/iterate                    # full audit, ship the top finding
/iterate audit              # audit-only; emit plan/AUDIT.md
/iterate <focus>            # bias toward content / data / seo / a11y / tests / perf
/loop 1h /iterate           # autonomous improvement loop
```

## 3. Autonomy contract

- **Many findings → one shipped fix per tick.** Multi-fix
  commits are unreviewable.
- **Content gap → spawn `<content-curator>` (or equivalent).**
  Don't write prose from main agent.
- **Data gap → call `/ship-data` flow inline.**
- **Trivial fix → still ships through verify.**

## 4. The audit

Score every finding `0–10` for `impact × ease`. Bias toward
shipping cheap wins.

### User-source bump (from `/jot`)

Findings with `source: user` (filed via `/jot`) get a flat
**`+0.5`** on their final score, capped at `10`. Apply this
**after** `impact × ease / 10` and **before** the user-set
bias multiplier below.

Rationale: when the user has spotted something with their own
eyes, it's almost always more valid than what the audit
auto-detected. The flat add (rather than a multiplier) means
high-severity user jots don't blow past everything; they just
edge ahead of comparable auto-detected findings at the same
severity.

### User-set bias (from `/oversight`)

Before scoring, check the top of `plan/AUDIT.md` for:

```
> Bias: <category> (set via oversight <date>)
```

If present, **multiply scores in that category by 1.5**. Sticky
until cleared via `/oversight reset`. Apply this **after** the
user-source bump above (so the multiplier sees the bumped
score, but the cap at `10` still holds).

### Audit categories

#### Z. External critique (highest priority when present)

`plan/CRITIQUE.md` `## Pending` is a finding source. Each row
maps to category `external-critique`. Severity → impact:
HIGH 8–10, MED 5–7, LOW 2–4. Ease scored from suggested-fix
complexity. When you ship a fix, **move row Pending → Done**
in CRITIQUE.md with `[x]` + commit hash.

#### A. Content gaps

- Surfaces with insufficient content (e.g., pillars under
  threshold).
- Tags / categories with low representation.
- Pages with thin word counts.

#### B. Data gaps

Run `skills/ship-data.md` §6 audit inline. Stale time-bound
entries. Coverage gaps from cross-grep.

#### C. SEO / discoverability

- Missing OG images, JSON-LD, sitemap entries.
- Robots / canonical issues.

#### D. Link integrity

- Internal links to non-existent routes.
- Tag/category refs not in taxonomy.
- External links 404'ing.

#### E. Accessibility

- Missing `alt`, contrast failures, heading order, focus rings.

#### F. Tests

- Components without colocated tests.
- E2E spec gaps. Untested helpers.

#### G. Performance

- Heavy images, unused CSS, bundle size regressions.

### Scoring

- Impact 0–10: how many readers / pages / queries affected?
- Ease 0–10: cheap fix = 9. New article = 4. Schema migration = 1.
- Score = `impact × ease / 10`, clamped 0–10.

Top 1 finding wins. Tie-break: cascading findings, older
findings, cheapest-to-ship.

## 5. Procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Audit (or read latest)

Run §4. Write to `plan/AUDIT.md`:

```markdown
# Site audit — <ISO date>

## Top 5 findings (scored)

### [8.1] <one-line description>
- category: <content-gaps | data-gaps | seo | links | a11y | tests | perf | external-critique>
- impact: <0-10>
- ease: <0-10>
- next: <action — invocation, sub-agent, or follow-up>
```

### Step 2 — Pick the work

Top scored. If `/iterate audit`, stop here.

### Step 2.5 — Mirror to GitHub

Open a public GitHub issue mirroring the picked finding **before**
the work starts. The repo's Issues tab becomes a live timeline of
"what the loop is shipping right now"; the issue opens when work
starts and auto-closes on the fix commit's `Closes #N` trailer.

Skip this step in two cases:

1. The picked row already has an `- issue: #N` field (a previous
   tick mirrored it but didn't ship the fix; reuse the same number).
2. The picked row came from `/triage` routing (an `[user-issue
   #N]`-prefixed AUDIT.md row, or a `(issue #N)` reference); the
   issue already exists publicly. Reuse `#N`.

Otherwise:

```bash
# 1. Build the body file from the finding row.
cat > /tmp/loop-issue-body.md <<EOF
**Source:** <pass description, e.g. "/critique pass 2 (reader sub-agent)" or "/jot <date>" or "/iterate audit <date>">
**Severity:** <HIGH|MED|LOW> · **Category:** <category from row> · **URL:** <url-or-"general">

## Observation
<verbatim from row's "observation" field>

## Evidence
<verbatim from row's "evidence" field>

## Suggested fix
<verbatim from row's "suggested fix" field>

---
_Tracked by the autonomous loop. The fix lands as a commit with \`Closes #<this-issue>\` in the body; this issue auto-closes when the commit pushes to <DEFAULT_BRANCH>._
EOF

# 2. Map row severity → helper flag.
#    [HIGH] → high · [MED] → med · [LOW] → low
# 3. Map row "source" field → helper flag.
#    user → user · browser/reader → reader · audit/iterate → audit · external → external
# 4. Map row category → helper category.
#    visual / voice / navigation / mobile / external-critique → enhancement
#    content (article/data/copy gap) → content
#    a11y → a11y · seo → seo · perf → perf
#    bug-shaped (broken link, regression) → bug
#    Otherwise → enhancement.

# 5. Open the issue.
N=$(node scripts/loop-issue.mjs open \
    --severity <high|med|low> \
    --category <see mapping above> \
    --source <user|reader|audit|external> \
    --title "<one-line summary, ≤ 70 chars>" \
    --body-file /tmp/loop-issue-body.md)
echo "loop-issue: opened #$N"
```

Capture `$N` (the helper echoes only the number on stdout). On
**any failure** of `loop-issue.mjs open` (auth, rate limit,
network):

- Print stderr to the iterate run log.
- Note the failure inline in the row as
  `- issue: [mirror-failed: <ISO timestamp>]` so the next tick
  retries.
- Continue with the fix. **The mirror is best-effort, not gating**
  (Hard rule §7.7).

If the open succeeded, record the number on the row before
shipping. The CRITIQUE.md/AUDIT.md row gains a new line:

```markdown
- issue: #<N>
```

This row update is committed in Step 6 (Tick the audit), not
separately — keep tick churn low.

### Step 3 — Delegate or implement

Default delegation:
- Content gaps → `<content-curator>` sub-agent.
- Data gaps → follow `skills/ship-data.md` §5 inline.
- SEO / links / a11y / tests → main agent.
- Performance → main agent; may delegate to `scout` for
  external benchmarking.

For research-heavy fixes, spawn `scout` in parallel.

### Step 4 — Verify

```bash
pnpm verify
```

Iterate up to 3 times on same root cause.

### Step 5 — Commit

Commit subject prefixes:
- `content:` — articles, copy, MDX edits.
- `data:` — anything under `/data`.
- `seo:` — metadata, JSON-LD, sitemap, robots, RSS.
- `fix:` — bug fixes, broken links, regressions.
- `a11y:` — accessibility.
- `test:` — test additions or fixes only.
- `perf:` — performance work.
- `refactor:` — structural cleanup, no behavior change.

Body lists audit finding ID/score, the fix, verify result.

**If the addressed finding has an `- issue: #N` field on its row**
(populated either by Step 2.5 above, or carried in from `/triage`
routing), close the loop on GitHub in the same flow:

```
# Trailer in commit body — auto-links + auto-closes when merged
- Closes #42
```

The `- Closes #<N>` trailer is **mandatory** in the commit body
when the row carries an issue number; it is the closing mechanism.
Multiple issues can be closed in a single commit by listing one
trailer line per issue.

Load `GH_TOKEN` and `GH_REPO` from `.env` first if they aren't
already in the env (see `skills/triage.md` §3). The
`loop-issue.mjs` helper does this internally; manual `gh` calls
outside the helper need to do it themselves.

```bash
git add <explicit files>
git commit -m "<category>: <subject>"
git push origin <DEFAULT_BRANCH>
```

### Step 6 — Tick the audit

Flip the addressed finding `[ ]` → `[x]` in `plan/AUDIT.md`.
For external-critique findings, also move row Pending → Done in
`plan/CRITIQUE.md`. Commit:

```bash
git add plan/AUDIT.md plan/CRITIQUE.md
git commit -m "audit: finding [<id>] addressed"
git push origin <DEFAULT_BRANCH>
```

### Step 7 — Confirm deploy

```bash
pnpm deploy:check
```

**Once deploy:check is green and the row carried an `- issue: #N`,
post the close-comment** (the `Closes #N` commit trailer already
auto-closed the issue; the comment confirms the deploy URL):

```bash
node scripts/loop-issue.mjs close-comment \
  --number <N> \
  --commit <commit-sha> \
  --deploy-url <DEPLOY_URL>
```

Failures of `close-comment` are warnings, not blockers — the fix
shipped, the issue is closed, the comment is just polish. Continue
to Step 8.

### Step 8 — Done

Return cleanly. Loop's next tick re-audits.

## 6. Failure modes

1. **`pnpm verify` fails ≥3 times on same root cause.**
2. **`pnpm deploy:check` fails ≥3 times on same root cause.**
3. **`<PROVIDER_AUTH_TOKEN>` missing.**
4. **Finding requires schema migration > 20 records.** Push to
   `/plan-a-phase`.
5. **Finding requires user judgment.** Surface to AUDIT.md as
   `[needs-user-call]`, skip, ship next.
6. **No actionable iterate work** (top score < 3.0). Read
   `plan/bearings.md` "Plan expansion posture":
   - **bold** or **autonomous** posture → dispatch to
     `/expand` instead of stopping. "Make things brilliant
     when delivery is not." Log "no actionable iterate work
     — handing to expand" and execute `skills/expand.md`
     procedure end-to-end.
   - **strict** posture → stop and report. Site is
     well-iterated.
7. **`git pull` divergence.**

## 7. Hard rules

1. **One fix per tick.**
2. **Verify gate must pass.** No `--no-verify`.
3. **No emojis. No `Co-Authored-By:`.**
4. **Don't write content yourself if a curator sub-agent
   exists** — delegate.
5. **Don't audit blindly when work is queued.** If
   `data/BACKLOG.md` has rows, prefer ship-data over fresh
   audit.
6. **Never delete shipped content silently.** Archive +
   update routing.
7. **Issue mirror is best-effort, not gating.** If
   `loop-issue.mjs open` fails (auth, rate limit, network), note
   `- issue: [mirror-failed: <ISO timestamp>]` on the row and ship
   the fix anyway. Likewise, `close-comment` failures after a
   green deploy are warnings, not blockers. The mirror is a
   public timeline, not a verification step.

## 8. Quick reference

```bash
# Read
plan/AUDIT.md                            # latest findings
plan/CRITIQUE.md                         # external-critique queue
plan/bearings.md                         # voice + standing decisions
data/                                    # GitHub-as-DB

# Sub-agents
Agent({ subagent_type: "<content-curator>", prompt: "..." })
Agent({ subagent_type: "scout", prompt: "..." })

# Verify + commit + push + deploy
pnpm verify
git add <explicit files>
git commit -m "<category>: <subject>"
git push origin <DEFAULT_BRANCH>
pnpm deploy:check

# Issue mirror
node scripts/loop-issue.mjs open --severity ... --category ... \
  --source ... --title "..." --body-file /tmp/loop-issue-body.md
node scripts/loop-issue.mjs close-comment --number N --commit SHA \
  --deploy-url <DEPLOY_URL>
```
