# The intervention spectrum

> From "I drive every commit" to "leave it for 80 hours and
> come back to a working product." The methodology scales across
> all five levels — but each requires more pre-investment in the
> awareness layers than the one below.

---

## The ladder

### Level 0 — Manual

**You do:** Run individual slash commands by hand. Review every
diff before approving the next.

**The loop does:** Exactly what you ask. One phase at a time. No
autonomous decisions.

**When to use:** First time through this methodology. The first
2–3 phases of any project (you're confirming the substrate works
before trusting the loop). Code areas where you want to learn
the agent's patterns before delegating.

**Required infrastructure:**
- Skills + plan/ in place.
- Verify gate working locally.
- Nothing else.

**Failure mode:** You burn out. Manual is slow.

### Level 1 — Supervised

**You do:** `/march` once. Review the diff. `/march` again. You
stay at the keyboard but stop running individual commands.

**The loop does:** One tick at a time, but it picks the right
verb (triage / critique / phase / data / iterate). You're
checking the dispatcher's choices.

**When to use:** Once the first 2–3 phases shipped via Level 0
and you trust the patterns. Useful for the middle of a build —
say, phases 5–10 of a 17-phase plan.

**Required infrastructure:**
- Level 0's stack.
- A working `/march` skill that can dispatch.
- Verify gate green on every phase.

**Failure mode:** Supervised is faster than manual but you're
still bottlenecked on diff review.

### Level 2 — Loop, attended

**You do:** `/loop 30m /march`. Stay around. Watch the deploys
land in Netlify (or wherever). Read the commit log every hour or
so.

**The loop does:** Ticks every 30m. Decides + ships. Pushes after
each verify gate. Polls the deploy gate. Iterates on red deploys.

**When to use:** A long working session where you want momentum
but can intervene if something goes off. Half-day sprints.

**Required infrastructure:**
- Level 1's stack.
- Deploy gate wired (`pnpm deploy:check`) with the auth token
  set.
- `/oversight` ready in case you need to intervene.

**Failure mode:** Without the deploy gate, the loop pushes red
commits forever.

### Level 3 — Loop, unattended

**You do:** `/loop 30m /march`. Walk away for 4–8 hours.

**The loop does:** Hours of autonomous work. Phases ship. Audit
findings get drained. Issues get triaged as they come in. Critique
runs every ~12 commits. Deploy gate watches every push.

**When to use:** Nights, while you're at lunch, weekend mornings.
Anywhere you want to come back to meaningful progress without
having watched every commit.

**Required infrastructure:**
- Level 2's stack.
- A build plan deep enough to last the unattended window (or
  `/iterate` carries the load if phases run out).
- Sub-agents (`scout`, `reader`, plus your domain specialists)
  configured and tested.
- All operational secrets in `.env` (Netlify token, GitHub PAT
  — see your project's `agents.md` Operational secrets section).
- **Harness enforcement + a pager, if you run on Claude Code.**
  A permission allowlist (`.claude/settings.json`) so no tick
  ever stalls on a prompt, guard hooks so the hard rules are
  walls rather than promises, and `scripts/notify.mjs` wired
  so a stopped loop pages your phone. This is the difference
  between "unattended" and "hands-off" — see
  [`playbooks/hands-off.md`](./playbooks/hands-off.md) and
  [`customization/claude-code.md`](./customization/claude-code.md).
- **All external service dashboards configured per their
  runbooks.** If your project depends on auth / DB / email /
  AI APIs, every `setup/NN_<service>.md` runbook must be `OK`
  or `PARTIAL` (with a clear note on what's deferred), and
  the dashboard configuration must match the runbook checklist.
  See [`customization/external-services.md`](./customization/external-services.md).
- **If your project has user-generated content, moderation
  must be loop-drainable or escalation-triggered.** A passive
  "review by eyeball" mod queue is not Level 3 compatible —
  the loop will pile up items and you'll come back to a
  crater. See [`customization/moderation-loop.md`](./customization/moderation-loop.md).
- A deliberate self-audit habit: run `/oversight` when you come
  back, **always**, even if nothing seems wrong. The brief is
  cheap; the surprise of finding something wrong without
  briefing yourself first is expensive.

**Failure mode:** The loop hits a same-root-cause failure 3
times, stops cleanly per the skill failure modes. You come back
to a clean stop, not a smoldering crater. **But it can also drift
silently** — produce 6 hours of "successful" commits that ship
the wrong thing because the brief was wrong. `/oversight` catches
that; verify gates don't.

### Level 4 — 80-hour beast

**You do:** Same as Level 3. Come back days later.

**The loop does:** Phases all shipped. `/march` transitions
automatically to `/iterate`. The site iterates itself — fills
content gaps, addresses critique findings, drains the data
backlog, processes incoming GitHub issues. Days of activity, all
of it commit-trail visible.

**When to use:** When the build plan is finite (e.g., 17 phases)
and you want to see what the iterate endgame produces. Weekend
runs. Vacation runs. "Ship the v1 while I'm gone" runs.

**Required infrastructure:**
- Level 3's stack.
- **`/iterate` actually works** — the audit categories cover
  enough surface that there's always meaningful next work. If
  `/iterate` runs out of findings within 4 ticks, the loop
  hibernates instead of producing churn.
- **`/critique` and `/triage` carry weight.** With phases done,
  most work comes from external signals (live-site critique +
  GitHub issues). These need to be wired and producing real
  findings, or the loop iterates on its own opinions only.
- **A clear bias mechanism.** `/oversight reset` to set
  `> Bias: <category>` in `AUDIT.md` before walking away — tells
  iterate what to focus on for the next N ticks.
- **High-quality first 2–3 phases.** If the substrate is wrong,
  80 hours of iterate produces 80 hours of building on sand.
  Get phase 1 right manually before stepping back.

**Failure mode:** Genuinely rare if Levels 1–3 worked. The
typical failure is **drift** — the loop converges on a local
optimum that's not what you'd have shipped. Mitigation: strong
`/critique` (external observer breaks local-optimum thinking)
+ scheduled `/oversight` (set a calendar reminder; check in
every 12–24 hours, even from a phone).

---

## What you need at each level

| Need | L0 | L1 | L2 | L3 | L4 |
|---|:-:|:-:|:-:|:-:|:-:|
| Skills + plan/ in place | ✓ | ✓ | ✓ | ✓ | ✓ |
| Verify gate working | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/march` dispatching cleanly | | ✓ | ✓ | ✓ | ✓ |
| Deploy gate wired (auth token) | | | ✓ | ✓ | ✓ |
| Sub-agents working | | | (✓) | ✓ | ✓ |
| `/oversight` ready for use | | | ✓ | ✓ | ✓ |
| Build plan deep enough | | | | ✓ | ✓ |
| `/iterate` audit pulls real findings | | | | (✓) | ✓ |
| `/critique` + `/triage` wired | | | | (✓) | ✓ |
| Bias mechanism | | | | | ✓ |

`(✓)` = recommended but not required. `✓` = required.

---

## Pre-flight checklist before "leave it for 80 hours"

Before invoking `/loop /march` and walking away for a full
weekend:

1. **Run `/march` manually 3 times.** Confirm each tick produces
   what you expected. If not, fix the brief, not the loop.
2. **Run `/oversight` once.** Read the briefing. Make sure the
   audit, backlog, and critique queue are coherent.
3. **Confirm the deploy gate works.** Push a deliberately-bad
   commit (e.g., a syntax error). Confirm `pnpm deploy:check`
   exits 1 cleanly. Revert.
4. **Confirm `/triage` works.** File a test issue on GitHub.
   Confirm `/march` picks it up next tick. Comment / label /
   route as expected.
5. **Confirm `/critique` can run.** If your project has a green
   deploy, run `/critique` once manually. Check that
   `plan/CRITIQUE.md` gets a real entry.
6. **Set `> Bias: <category>` in `plan/AUDIT.md`** if you want
   the iterate loop to favor a specific surface during the
   unattended window.
7. **Read `/oversight`'s output one more time.** If anything in
   the briefing surprises you, don't go.
8. **Run every service's runbook checklist.** Read
   `setup/00_files.md`. For each service touching the next 5
   pending phases, confirm the row is `OK` (not `PARTIAL` /
   `STUB`). Spot-check the runbook's verification checklist
   passes (terminal curls / dashboard URLs at the bottom of
   each runbook). Confirm every env var in every runbook's
   Section H is present in every deploy environment
   (Production, Preview, Development). This is the single
   highest-leverage item for genuine 80h autonomy: the loop
   cannot dashboard-click, so anything it will need across
   the whole unattended window must be configured *now*.
   See [`customization/external-services.md`](./customization/external-services.md).
9. **If your project has UGC, confirm `/moderate` (or
   `/iterate`'s mod-pass) drains the queue cleanly.** File a
   test comment that triggers the AI pre-filter (use a
   known-bad sample). Confirm `/march` picks it up next tick
   and either auto-hides or files an audit finding. See
   [`customization/moderation-loop.md`](./customization/moderation-loop.md).

10. **Run the hands-off pre-flight.** The checklist in
    [`playbooks/hands-off.md`](./playbooks/hands-off.md)
    supersets this one with the mechanical items: guard
    self-test green, zero permission prompts across three
    attended ticks, pager tested to your phone, no credential
    expiring inside the window, one writer armed. Then its
    24-hour dry run. Walking away is a promotion the loop
    earns, not a switch you flip.

If all pass: launch the loop. If any fails: fix it, then
re-check. If the loop stops anyway while you're gone,
[`playbooks/recovery.md`](./playbooks/recovery.md) is the
incident runbook — safe-stop first, then the triage tree.

---

## How to come back

Always run `/oversight` first. **Always.** Even if nothing seems
wrong.

`/oversight` will:
- Tell you how many phases shipped.
- Show the velocity (commits/hour).
- Surface the deploy state.
- Flag any pattern that looks unusual (5 fix-commits in a row,
  same audit finding addressed 3 times, design export landed
  during the run, etc.).
- Generate 1–4 targeted questions if it found anything weird.

Then look at:
- The Netlify (or your provider's) deploy log — were any of the
  deploys actually red? The loop should have stopped, but
  triple-check.
- `git log --oneline | head -50` — does the commit message
  cadence match what you expected?
- The site itself, briefly. If `/critique` ran during the
  window, the findings in `plan/CRITIQUE.md` are your reading
  list.

Decide:
- Resume? `/march` again, or `/loop /march` for another window.
- Course-correct? `/oversight reset` and pick new biases.
- Stop here? Fine. The loop was a tool, not a target.

---

## Anti-patterns

**"I'll just run `/loop /march` for the first time and see what
happens."** Don't. Run `/ship-a-phase` manually first. Confirm
the substrate. Step up gradually.

**"I don't need `/oversight`, the loop is doing fine."** This
is exactly when `/oversight` matters most. The brief catches
drift before it's expensive.

**"I'll skip the deploy gate, it's just docs commits."** No.
The gate is what protects you from regression you didn't notice.
Doc commits trigger Netlify rebuilds; if the build fails for an
unrelated reason, you want to know.

**"I'll let the loop run forever."** It can, but you should
check in periodically. Even 10 minutes every 12 hours is enough
to catch drift. The loop is a tool, not a replacement for
ownership.

**"I'll add `--no-verify` just this once."** No. The gate
exists for a reason. Fix the root cause; don't bypass.
