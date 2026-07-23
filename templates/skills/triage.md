# Skill: triage

> **Issue review for the autonomous loop.** Read open GitHub
> issues, classify, label, comment, route to the right backlog.
> **If there are no unlabeled issues, exit fast** — that's
> "keep humming."

## 1. Purpose

GitHub issues are the user's primary inbox to the loop. Without
triage, they pile up. With triage:

- User files an issue.
- Next `/march` tick reviews it, labels it, comments, routes
  it.
- Subsequent `/iterate` or `/ship-data` ticks drain the
  backlog.
- Addressing commit closes the issue automatically.

Cheap when idle (zero issues → exits in <1s). Non-blocking
when busy.

## 2. Invocation

```
/triage                       # all unlabeled open issues
/triage <issue-number>        # focused pass
/triage all                   # re-evaluate every open issue
/triage dry-run               # classify + report, no labels/comments
```

`/march` invokes `/triage` as the first dispatch step (cheapest
gate). Manual invocation also fine.

## 3. Auth

Triage needs `gh` CLI authenticated. The PAT lives in `.env`:

```
GH_TOKEN=github_pat_...
GH_REPO=<REPO_SLUG>           # optional; defaults to <REPO_SLUG>
```

`gh` auto-reads `GH_TOKEN`. Before any `gh` call, ensure env is
loaded:

```bash
export GH_TOKEN=$(awk -F= '/^GH_TOKEN=/ {sub(/^GH_TOKEN=/, ""); print; exit}' .env)
export GH_REPO=$(awk -F= '/^GH_REPO=/ {sub(/^GH_REPO=/, ""); print; exit}' .env)
GH_REPO=${GH_REPO:-<REPO_SLUG>}
gh auth status >/dev/null || { echo "GH_TOKEN missing/invalid"; exit 3; }
```

If `gh auth status` fails, exit per §8.

## 4. Label scheme

Triage applies one `triage:*` label to every processed issue.
Labels are the state — already-labeled issues skipped on
default pass.

| Label | Meaning |
|---|---|
| `triage:loop-queued` | The loop will address. Routed into the right backlog. |
| `triage:needs-user` | Actionable but requires user judgment. Surfaces in `oversight`. |
| `triage:closed` | Won't fix / duplicate / spam. Issue is closed with a comment. |
| `triage:reviewed` | Seen but no action this pass. Re-eval on `/triage all`. |

Plus a category label paired with `triage:loop-queued`:

- `bug`, `enhancement`, `content`, `data`, `docs`, `seo`,
  `a11y`, `perf`

Auto-create labels on first encounter via `gh label create`
(idempotent).

## 5. The procedure

### Step 0 — Pre-flight

Load env, verify auth (§3). Exit 3 if missing.

### Step 1 — List candidates

```bash
gh issue list \
  --repo "$GH_REPO" \
  --state open \
  --search "-label:triage:loop-queued -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number,title,body,labels,author,createdAt,updatedAt,comments \
  --limit 50
```

The `-label:loop:opened` clause excludes issues the loop opened on
itself (per-finding mirror via `loop-issue.mjs open`, per-phase
mirror via `phase-open` — phase issues carry both `loop:opened`
and `loop:phase`, so this single exclusion catches both). Those
have a known provenance and don't need triage labeling.

If `[]`: print `"triage: 0 unlabeled open issues — humming
on."` and exit 0 **without committing anything**.

**The concierge lane:** additionally list open issues labeled
`loop:do` — the user's "this one, now" flag. They are
candidates even if already triaged. Route them per Step 2 at
[HIGH] with `- priority: user-flagged (loop:do)` on the
backlog row (worth +2 when `/iterate` scores it), comment that
the issue jumped the queue, then **remove the `loop:do`
label** — it is a signal, not a state.

### Step 2 — Classify each issue

For each issue, decide:

1. **Category**: `bug` | `enhancement` | `content` | `data` |
   `docs` | `seo` | `a11y` | `perf`.
2. **Routing**:
   - `triage:loop-queued` if the loop can address autonomously.
   - `triage:needs-user` if user judgment needed.
   - `triage:closed` if duplicate / spam / won't-fix.
   - `triage:reviewed` if waiting on something else.
3. **Backlog target** (only `loop-queued`):
   - bug / seo / a11y / perf / content / docs → `plan/AUDIT.md`
   - data → `data/BACKLOG.md`
   - small enhancement → `plan/steps/01_build_plan.md`
     carry-overs section
   - large / off-strategy enhancement → re-route to
     `triage:needs-user`

### Step 3 — Apply labels + comment + (close)

```bash
gh issue edit "$NUM" --repo "$GH_REPO" --add-label "triage:loop-queued,bug"

gh issue comment "$NUM" --repo "$GH_REPO" --body "$(cat <<'EOF'
Triaged → bug. The loop will address this; tracked in
[plan/AUDIT.md](https://github.com/<REPO_SLUG>/blob/<DEFAULT_BRANCH>/plan/AUDIT.md)
under external-issue category. A future /iterate tick will ship
the fix and reference this issue's number in the commit body.
EOF
)"

# Only for triage:closed:
gh issue close "$NUM" --repo "$GH_REPO" --reason "not planned"
```

### Step 4 — Append to the backlog

`plan/AUDIT.md` Pending row:

```markdown
### [user-issue #<N>] [HIGH|MED|LOW] <title>
- category: external-issue
- impact: <0-10>
- ease: <0-10>
- next: /iterate will pick up; reference #<N> in commit body.
```

`data/BACKLOG.md` row:

```markdown
- [ ] <action> (issue #<N> — <one-line context>)
```

### Step 5 — Commit + push (if any backlog changes)

```bash
git add plan/AUDIT.md data/BACKLOG.md plan/steps/01_build_plan.md
git commit -m "$(cat <<'EOF'
triage: <K> issues processed (<L> queued, <M> user-call, <N> closed)

- #<num> → loop-queued (bug, plan/AUDIT.md)
- #<num> → needs-user (enhancement)
- #<num> → closed (duplicate of #X)

Labels applied. Comments posted on each.
EOF
)"
git push origin <DEFAULT_BRANCH>
```

If no file changes (all `triage:closed` or `triage:reviewed`),
**no empty commit** — exit with a one-line summary.

### Step 6 — Confirm deploy

```bash
pnpm deploy:check
```

### Step 7 — Done

```
triage processed: <K>. queued: <L>. needs-user: <M>. closed: <N>.
plan/AUDIT.md +<X> rows. data/BACKLOG.md +<Y> rows.
loop next: <iterate | ship-data | ship-a-phase | march>.
```

## 6. Closing the loop (when iterate / ship-data ships a fix)

When a downstream skill addresses a triaged issue, it should
update the issue:

In commit body:

```
- Closes #<N>: <fix description>
```

After push, post follow-up comment:

```bash
gh issue comment <N> --repo "$GH_REPO" --body "Shipped in <commit>. Live after deploy ready."
gh issue close <N> --repo "$GH_REPO"   # if not already auto-closed by Closes #N trailer
```

This is documented in `skills/iterate.md` §5 and
`skills/ship-data.md` §6.

## 7. Hard rules

1. **Labels are the state.** Never re-process labeled issues
   on default pass.
2. **One commit per triage pass.** No empty commits.
3. **Idempotency.** Re-running with no new issues = no-op.
4. **Honest comments.** Don't promise specific fix dates.
5. **Never close without a comment** explaining why.
6. **Don't over-classify.** When in doubt, `triage:needs-user`
   beats inventing a category.
7. **No emojis. No `Co-Authored-By:`.**
8. **`gh` calls only.** No raw curl unless `gh` is unavailable.

## 8. Failure modes

1. **`gh` not installed.** Exit 3. Loop continues
   (non-blocking).
2. **`GH_TOKEN` missing or rejected.** Exit 3. Loop continues.
3. **Rate limit hit.** Exit 2. Retry next tick.
4. **Ambiguous classification after reading title + body +
   comments.** Default to `triage:needs-user`.
5. **`gh issue edit` fails** (label doesn't exist). Auto-create
   label via `gh label create`, retry once.
6. **Network failure mid-pass.** Persist what's done; next
   tick resumes.

Otherwise: classify, label, comment, ship.

## 9. When `/march` invokes `/triage`

`/march` runs triage as Step 1 of every dispatch tick. Cheap
check:

```bash
gh issue list --repo "$GH_REPO" --state open \
  --search "-label:triage:loop-queued -label:triage:needs-user -label:triage:closed -label:triage:reviewed -label:loop:opened" \
  --json number --jq 'length'
```

If `> 0`, dispatch to `/triage`. If `== 0`, fall through to
the next gate.

If `gh` / token unavailable, **don't fail the march** — log
warning and fall through. Triage is non-blocking by design.

## 10. Quick reference

```bash
# Auth
export GH_TOKEN=$(awk -F= '/^GH_TOKEN=/ {sub(/^GH_TOKEN=/, ""); print; exit}' .env)
export GH_REPO=$(awk -F= '/^GH_REPO=/ {sub(/^GH_REPO=/, ""); print; exit}' .env)
GH_REPO=${GH_REPO:-<REPO_SLUG>}

# Operations
gh issue list --repo "$GH_REPO" --state open --search "..."
gh issue edit <N> --repo "$GH_REPO" --add-label "..."
gh issue comment <N> --repo "$GH_REPO" --body "..."
gh issue close <N> --repo "$GH_REPO" --reason "not planned"
gh label create "triage:..." --repo "$GH_REPO" --color "..." 2>/dev/null || true

# Commit
git add <files>
git commit -m "triage: ..."
git push origin <DEFAULT_BRANCH>
pnpm deploy:check
```
