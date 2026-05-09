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

### User-set bias (from `/oversight`)

Before scoring, check the top of `plan/AUDIT.md` for:

```
> Bias: <category> (set via oversight <date>)
```

If present, **multiply scores in that category by 1.5**. Sticky
until cleared via `/oversight reset`.

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

**If the fix addresses a triaged issue** (`[user-issue #N]`
prefix or `(issue #N)` reference), close the loop on GitHub:

```
# Trailer in commit body — auto-links + auto-closes when merged
- Closes #42
```

After push + green deploy, post follow-up comment via `gh issue
comment N --body "Shipped in <sha>. Live after deploy."` Load
`GH_TOKEN` from `.env` first.

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
```
