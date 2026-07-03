# Playbook: recovery

> The incident runbook. You got paged, or you came back and
> something is wrong. This doc is written to be read *during*
> the incident: safe-stop first, one triage tree, then a
> numbered procedure per scenario. Every procedure obeys the
> standing rules — recovery never force-pushes, never bypasses
> a gate, never destructively resets. The loop's history is
> the audit trail; recovery works *with* it.

The single most important fact: **a stopped loop is a success
state.** The methodology's failure modes are designed to stop
cleanly and write down why. Most "incidents" are the system
working — your job is to read what it wrote, fix the root
cause, and re-arm. Panic-driven git surgery converts a clean
stop into a real incident.

---

## The first five minutes (safe-stop)

Do these in order, regardless of scenario:

1. **Stop the writers.** Local: end the `/loop` session. Cloud:
   `gh workflow disable march`. Nothing else happens until
   exactly one writer (you) remains.
2. **Touch nothing yet.** No resets, no reverts, no cleanup.
3. **Snapshot.** Run and save:

   ```bash
   git status --short
   git log --oneline -30
   git rev-list --count @{u}..HEAD   # unpushed commits
   pnpm deploy:check                 # deploy state at HEAD
   gh run list --workflow march -L 5 # recent cloud ticks
   ```

4. **Read the loop's own account.** The last commit bodies,
   `plan/AUDIT.md` (new `[needs-user-call]` rows), the last
   Actions log's closing `/oversight audit` block, any
   `Cloud march` issues. The loop documents its stops; start
   from its story, not your guess.
5. **Then** pick your scenario below.

---

## Triage tree

```
Deploy red at HEAD?                        → A
Git says diverged / tree dirty + stuck?    → B
Many similar commits, no progress?         → C
Everything green but the product is wrong? → D
Provider/API down or rate-limited?         → E
Auth errors, token rejected (exit 3)?      → F
march stops on "state files corrupted"?    → G
Cloud tick crashed / run never ended?      → H
Loop stopped and none of the above?        → I
```

---

## A. Red deploy on `main`

**Symptoms.** `pnpm deploy:check` exits 1; the loop stopped
after ≤3 patch attempts (as designed) or you caught it
mid-iteration.

**Diagnose.** Read the provider's deploy log for HEAD — the
loop's commit body for its last patch attempt tells you what
it already tried. Classify: (a) code/config regression the
verify gate missed, (b) provider-side (env var, quota, build
image), (c) transient.

**Recover.**

1. Regression → fix forward: patch, `pnpm verify`, commit,
   push, `pnpm deploy:check`. If the fix isn't obvious in 30
   minutes, revert instead: `git revert <bad-sha>` (or
   `git revert <old>..<new>` for a span), verify, push. Revert
   commits are ordinary commits — the gates run, history
   stays intact, no force-push.
2. Provider-side → fix in the dashboard/CLI, then update the
   matching `setup/NN_<service>.md` runbook **in the same
   sitting** (status + the step that drifted), then re-run
   `pnpm deploy:check` against HEAD.
3. Transient → re-run `pnpm deploy:check`; if green, re-arm.

**Prevent.** Whatever the deploy gate caught that verify
didn't: add the check to verify per the growth recipe in
[`../customization/verify-gate.md`](../customization/verify-gate.md).
That class of red should be caught pre-commit next time.

---

## B. Diverged / wedged git state

**Symptoms.** `git pull --ff-only` refuses; or the tree is
dirty with a half-finished tick; or local and cloud both
committed (Step 7 of
[`hands-off.md`](./hands-off.md) was skipped).

**Diagnose.**

```bash
git fetch origin
git log --oneline HEAD..origin/<DEFAULT_BRANCH>   # theirs
git log --oneline origin/<DEFAULT_BRANCH>..HEAD   # yours
git status --short                                # dirty paths
```

**Recover.**

1. **Dirty tree, no divergence.** Finish the tick's intent by
   hand: if the work is coherent, `pnpm verify` → commit →
   push. If it's half-thought, stash it
   (`git stash push -m "wedged tick <date>"`), note a
   `plan/AUDIT.md` finding to redo it properly, push the note.
   Stash, don't discard — `checkout -- .` is a forbidden reset
   for the loop and a bad habit for you.
2. **Diverged, both sides have real commits.** Rebase *your*
   side (the smaller, usually local side):
   `git rebase origin/<DEFAULT_BRANCH>`. Resolve, `pnpm
   verify`, push normally. Never force-push the shared branch
   — rebase local-only commits is fine because they were never
   on origin.
3. **Diverged and your local side is junk** (an experiment the
   cloud outran): branch it off for the record
   (`git branch salvage/<date>`), then
   `git reset --keep origin/<DEFAULT_BRANCH>`. `--keep`, not
   `--hard`: it refuses to lose uncommitted changes instead of
   eating them. The salvage branch preserves the history; no
   commits are destroyed.

**Prevent.** One writer at a time — the two commands in
hands-off Step 7.

---

## C. Churn loop (runaway)

**Symptoms.** The commit log shows the same file or finding
touched every tick; fix-commits ping-pong (A undoes B undoes
A); or `/iterate` ships cosmetic nothings while real queues
sit. The ceiling may have hibernated the cloud loop mid-churn.

**Diagnose.** `git log --oneline -30` — cluster by prefix and
path. Then read `plan/AUDIT.md`: churn almost always means the
audit is re-finding the same thing because the "fix" never
addressed the finding's evidence, or two standing rules
contradict each other (bearings says X, design says Y) so
alternate ticks "correct" in opposite directions.

**Recover.**

1. Stop the loop (you did, in the first five minutes).
2. Find the contradiction and settle it in writing — one
   commit to `plan/bearings.md` (or the design decisions file)
   stating the winner. Contradictory law is the root cause;
   everything else is symptom.
3. Collapse the ping-pong: pick the correct end-state, ship it
   once, verify, push.
4. Prune the audit: delete the re-found rows;
   `/oversight reset` if a bias was steering into the churn.
5. Re-arm at Level 1 (single `/march` ticks, attended) for 3
   ticks before re-looping.

**Prevent.** Churn is the loop faithfully executing ambiguous
law. The fix is always upstream, in bearings/briefs — never a
"don't do that" patch to a skill.

---

## D. Drift (green commits, wrong product)

**Symptoms.** Gates green, deploys green, velocity fine — and
the product veered from what you'd have shipped. Usually found
via the return `/oversight` or a `/critique` pass, at hour 40.

**Diagnose.** This is the expensive one, and it's a *substrate*
failure, not a loop failure. Find the earliest commit where
the direction bent — `git log --oneline --stat` and skim
commit bodies' `Decisions:` sections; the loop documents every
judgment call precisely so this archaeology is possible.

**Recover.**

1. Run `/oversight` fully. Answer its questions honestly; use
   it to mark what stays and what goes.
2. Fix the law first: the bearings line / brief paragraph /
   spec section whose vagueness permitted the drift. Commit
   that *before* touching product code — otherwise the loop
   re-drifts.
3. Unwind the divergent work: `git revert` the span (fine even
   for dozens of commits — revert in reverse order or as one
   `git revert <first>^..<last>`), or where reverting fights
   later good work, re-ship corrected via ordinary phases.
   Both paths keep history and gates intact.
4. Re-queue what was lost: `[ ]` rows / audit findings for the
   legitimate work entangled in the revert.

**Prevent.** Drift-catchers running *during* the window
(hands-off Step 4), `/oversight` cadence, and briefs whose
"Decisions made upfront" section actually decides.

---

## E. Provider outage / rate limit

**Symptoms.** Deploy gate exits 2 (timeout) repeatedly; `gh`
returns 429/5xx; the failure is upstream, not in the repo.

**Recover.**

1. Confirm it's them: provider status page, a manual API curl
   from the runbook's verification checklist.
2. Do nothing to the repo. An outage is not a finding; do not
   "fix" code to route around a dead API.
3. If the outage will outlast a few ticks: pause the loop
   (remote pause is `gh workflow disable march`) or accept
   no-op ticks — exit-2 is retry-next-tick by design and
   costs almost nothing on a no-op.
4. When the provider recovers: one manual `pnpm deploy:check`
   at HEAD, then re-arm.

**Prevent.** Not preventable — survivable. The gate treating
timeout (2) differently from failure (1) is what makes waiting
safe.

---

## F. Expired or rejected secret

**Symptoms.** Exit 3 from the deploy gate or `gh auth status`;
`reader` files `auth-failed`; cloud tick crashed with an auth
error in the log.

**Recover.**

1. Identify which credential from the error and the
   `setup/00_files.md` inventory.
2. Rotate at the provider; propagate:
   `/bootstrap rotate <service>` for bootstrap-managed ones,
   or by hand into `.env` **and** every deploy environment the
   runbook's Section H lists (Production, Preview,
   Development) **and** the matching GitHub Actions secret.
   Partial propagation is the classic re-incident.
3. Update the runbook's expiry note with the new date.
4. Probe before re-arming: the runbook's verification curls.

**Prevent.** The expiry register + pre-flight probes
(hands-off Step 5). Expiries you can see coming aren't
incidents.

---

## G. Corrupted state files

**Symptoms.** `/march` stops with "state files corrupted or
missing" — a build plan whose status block is gone, an
`AUDIT.md` half-overwritten, a merge gone sideways.

**Recover.**

1. Never let the loop "reconstruct" state from vibes — that's
   why march stops rather than guessing.
2. Recover the file from history:

   ```bash
   git log --oneline -10 -- plan/steps/01_build_plan.md
   git show <last-good-sha>:plan/steps/01_build_plan.md > plan/steps/01_build_plan.md
   ```

3. Replay reality since `<last-good-sha>`: `git log --oneline
   <last-good-sha>..HEAD` — tick `[x]` any phase that actually
   shipped in that span, re-add queue rows that survived.
   Commit `plan: reconstruct state after corruption` with the
   reasoning in the body.
4. One attended `/march` tick to confirm the dispatcher reads
   it cleanly.

**Prevent.** The durable-row rules (queues append, audits
preserve marked rows) are in the current skill templates —
re-sync if your copies predate them.

---

## H. Cloud tick crashed / never ended

**Symptoms.** The `Cloud march tick crashed` issue; or a run
sitting `in_progress` for hours blocking the concurrency
group.

**Recover.**

1. Open the run URL from the issue. Auth error → scenario F.
   Runner OOM / infra flake → re-run once via
   `gh run rerun <id>`.
2. A run wedged `in_progress` with the log stalled after "all
   checks green": that's the **post-result exit hang** — the
   gate got backgrounded. Cancel the run
   (`gh run cancel <id>`). The fix and the full story live in
   [`cloud-loop.md`](./cloud-loop.md) — foreground the gate;
   do not add a watchdog.
3. Repeated crashes with different causes: disable the
   workflow, run the same tick locally (`/march`) to get an
   interactive view, fix, re-enable.

---

## I. Stopped, and none of the above

The forensic path, for when the pager said "stopped" and the
story isn't obvious:

1. The last thing the loop wrote is the answer 90% of the
   time: last commit body → `plan/AUDIT.md` tail →
   the skill's §Failure modes list (match the stop message to
   its numbered condition) → the Actions log tail.
2. Reproduce the tick attended: `/march` and watch where it
   stops. The skills are deterministic about their stop
   conditions; the same state produces the same stop.
3. If the stop is legitimate but *new* — a condition no skill
   anticipated — you've found methodology, not just a bug:
   patch the skill's failure modes, note it in
   `NEXUS_LESSONS.md`, and send it upstream with
   `/lessons-pr` so the next project inherits the lesson.

---

## After any incident: rebuilding trust

1. **Drop two levels for a day.** Post-incident, run attended
   (`/march`, read diffs) until three consecutive clean ticks.
2. **Feed the gate.** If the incident was catchable
   pre-commit, verify gains the check — same recipe as A's
   prevent step. Incidents that don't strengthen a gate repeat.
3. **Write the lesson down** in `NEXUS_LESSONS.md` while it's
   fresh; `/lessons-pr` upstreams it when you have a batch.
4. **Then re-run the hands-off pre-flight** — all of it, not
   just the part that failed — before the next long window.

---

## Hard rules (recovery edition)

1. **No force-push, ever — including now.** Every unwind above
   is revert / rebase-of-unpushed / `reset --keep` of junk
   that's preserved on a branch. If you believe you've found
   the case that truly needs a force-push, sleep on it.
2. **No gate bypass to "fix fast".** A recovery commit that
   skips verify is the next incident with a timestamp.
3. **One writer during recovery.** Loops stay disabled until
   the re-arm step, always.
4. **The loop's history is evidence — don't rewrite it.**
   Reverts tell the true story; squashes and resets erase it.
5. **Fix the law before the symptom.** C and D both root in
   ambiguous or contradictory substrate; patching output while
   the law still contradicts itself re-runs the incident.

---

## See also

- [`hands-off.md`](./hands-off.md) — the rigging that makes
  most of this doc unnecessary.
- [`cloud-loop.md`](./cloud-loop.md) — cloud-specific failure
  detail, including the exit hang's root cause.
- [`../customization/verify-gate.md`](../customization/verify-gate.md)
  — the add-a-check growth recipe recovery keeps invoking.
- [`../intervention-spectrum.md`](../intervention-spectrum.md)
  — the ladder you climb back up after an incident.
