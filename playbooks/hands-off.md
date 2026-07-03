# Playbook: hands-off

> The operational runbook for genuinely unattended windows —
> Level 3 and 4 of the intervention spectrum, measured in days.
> [`../intervention-spectrum.md`](../intervention-spectrum.md)
> tells you *when* you're ready to walk away; this playbook is
> *how* you rig the ship so that walking away is boring.
> Assumes the base kit is adopted and the local loop has run
> cleanly at Level 2.

"Unattended" and "hands-off" are different claims. Unattended
means nobody is watching. Hands-off means nobody *needs* to
watch — because everything that used to need a human either
got pre-approved, got mechanically enforced, gets routed
around, or actively calls the human's phone. The gap between
the two is seven specific silent-death modes. This playbook
closes them one by one.

| # | Silent-death mode | Closed by |
|---|---|---|
| 1 | Permission prompt wall — the loop stalls on tick one waiting for a "yes" nobody will give | Step 1 |
| 2 | Blocked means silently blocked — the loop stops cleanly and nobody learns for two days | Step 2 |
| 3 | One bad phase freezes the beast — a single ambiguous brief halts all work | Step 3 |
| 4 | Drift accrues exactly where nobody is looking — the unattended path skips the drift-catchers | Step 4 |
| 5 | A secret expires mid-window — critique degrades, deploys stall, PATs lapse | Step 5 |
| 6 | Budget surprise — the ceiling hibernates the loop, or spend runs away | Step 6 |
| 7 | Two writers, one branch — local and cloud loops collide on `main` | Step 7 |

Time to rig everything below from a working Level 2 project:
~2 hours, plus a 24-hour dry run.

---

## Step 1 — pre-approve, pre-deny (30 min)

Adopt the Claude Code layer:
[`../customization/claude-code.md`](../customization/claude-code.md).
The short version:

1. Copy `templates/claude/settings.json` → `.claude/settings.json`.
   Replace `<DEFAULT_BRANCH>`. Read every `allow` line — it's
   your loop's standing power of attorney.
2. Copy `templates/claude/hooks/guard.mjs` →
   `.claude/hooks/guard.mjs`. Run
   `node .claude/hooks/guard.mjs self-test` — must print green.
3. Copy `templates/claude/CLAUDE.md` → repo root `CLAUDE.md`.
4. Commit all three: `chore: adopt harness enforcement layer`.

Then burn down the prompt list: run `/march` attended and note
every permission prompt that fires. Each one is either a
missing narrow `allow` rule (add it), a compound command whose
other half isn't allowed (`… || echo 0` — see the gotcha in
the customization doc), or the agent doing something the
skills don't call for (fix the skill or the brief). **Zero
prompts across three consecutive attended ticks is the bar.**
A prompt during an unattended window is a wall — and in the
cloud, where nobody can answer, the workflow template runs
`permissionMode: bypassPermissions` instead (disposable
runner + guard hooks; see the claude-code doc's cloud-posture
section). The burn-down is for local windows.

Non-Claude-Code runners: enforce the same rules at the git and
provider level instead — commit-msg hook, branch protection
(no force pushes), required CI check.

---

## Step 2 — make blocked loud (20 min)

The loop's failure modes all end in "stop cleanly and write it
down." For hands-off operation every one of those stops must
also *page you*.

1. Copy `templates/scripts/notify.mjs` → `scripts/notify.mjs`.
2. Pick a channel. Fastest: install the ntfy app, invent a
   long random topic name, put `NOTIFY_NTFY_TOPIC=<topic>` in
   `.env`, subscribe to `ntfy.sh/<topic>` on your phone.
   (Slack/Discord/webhook: `NOTIFY_WEBHOOK_URL` instead.)
3. Test: `node scripts/notify.mjs --title "test" --body "hi"`.
   Your phone buzzes or you're not done.
4. Add the standing rule to your `agents.md` (the template
   carries it — sync if you adopted earlier):

   > Before stopping on any failure-mode condition, run
   > `node scripts/notify.mjs --title "<skill>: stopped"
   > --body "<reason>" --priority high`. Best-effort — never
   > let a notification failure become its own stop.

5. Cloud: add `NOTIFY_NTFY_TOPIC` as a repo secret and pass it
   through in `march.yml`'s `env:` block (the template shows
   it commented), so cloud stops page you the same way. The
   crash-issue safety net stays — the notify is in addition,
   not instead.

What will actually page you, end to end: any skill hitting a
failure mode, a new `[needs-user-call]` row, an unclean turn
end (Stop hook), a crashed cloud tick.

---

## Step 3 — no phase freezes the beast (15 min)

A `/ship-a-phase` stop used to halt the whole tick — one
ambiguous brief could idle the loop for a weekend. The
current templates carry the fix; confirm your copies do
(re-sync from `templates/skills/` if you adopted earlier):

1. **`[blocked]` is part of the build-plan vocabulary.** When
   `ship-a-phase` hits a stop condition that is *phase-shaped*
   (ambiguous scope, missing paid dependency, infra failure
   outside local code), it marks the row
   `[blocked: <short reason> <ISO-date>]`, commits that state
   change, notifies (Step 2), and returns cleanly.
2. **`/march` skips blocked rows.** The dispatcher's "pending
   phase" check matches `[ ]` rows only, so the next tick
   flows past the blocked phase into data / expand / iterate
   work. The loop keeps shipping what's shippable.
3. **`/oversight` owns unblocking.** Blocked rows surface in
   its briefing; the questionnaire offers re-brief / skip /
   provide-the-missing-thing. A blocked row is a conversation
   waiting for you, not a dead loop.

Repo-wide stops (red verify on `main`, git divergence, deploy
provider hard-down) still stop the whole loop — correctly.
Those are what Step 2 pages you for, and
[`recovery.md`](./recovery.md) is the answer.

---

## Step 4 — keep the drift-catchers running (30 min)

The methodology's own risk model says the #1 unattended
failure is drift — and the two drift-catchers (`/critique`,
`/oversight`) are exactly what the cloud path historically
skipped. Close the gap to the extent your project allows:

1. **Headless critique.** The `reader` sub-agent has two
   engines: the Chrome MCP (Path A, local) and plain WebFetch
   (Path B — works on any runner). The current `march.yml`
   template lets `/critique` run in the cloud on Path B when
   the deploy is green; findings land with `source: web-fetch`
   so you can weigh them accordingly. Path B sees markup, not
   pixels — it catches dead nav, empty pages, broken metadata,
   and incomprehensible copy; it won't catch visual reflow.
   Treat local Path A passes as the gold standard and cloud
   Path B as the tripwire between them.
   If your site needs auth for meaningful critique, wire the
   `CRITIQUE_*` secrets per
   [`../customization/auth-aware-critique.md`](../customization/auth-aware-critique.md)
   into the workflow env — or accept anonymous-only passes and
   say so in `bearings.md`.
2. **The read-only briefing.** `/oversight audit` is the
   non-interactive variant: it prints the §4 briefing —
   velocity, queues, deploy state, flags — and asks nothing,
   changes nothing. The cloud brief ends each tick with it, so
   every Actions run's log closes with a state-of-the-loop
   snapshot you can skim from your phone. It is not oversight;
   it's the instrument panel that tells you whether to come
   back early.
3. **The return ritual is unchanged.** Real `/oversight`, the
   interactive kind, on the day you return. Always. The
   briefing will already be familiar because you skimmed the
   audit variants while away.

**Remote input while away:** you don't need a terminal to
steer. File a GitHub issue from your phone — that *is* remote
`/jot`: the next `/march` tick triages it, labels it, routes
it into the queues with the user-source bump. Issues are the
loop's inbox, and the inbox works from anywhere.

---

## Step 5 — secrets outlive the window (15 min)

A hands-off window is only as long as its shortest-lived
credential. Before every long window:

1. **Inventory with expiry.** `setup/00_files.md`'s index
   carries a "Token expiry" note per service (the template
   shows the column). Fine-grained PATs default to 90 days;
   session cookies last days-to-weeks; OAuth tokens rotate.
   Write the actual dates down — "probably fine" is not a
   date.
2. **Probe liveness in pre-flight.** Every runbook's
   verification checklist ends with terminal curls; run the
   auth-touching ones the day you leave, not the week before.
   `gh auth status`, `pnpm deploy:check`, one `reader` pass if
   critique-auth matters.
3. **Rotate anything that expires inside the window before
   you go** — `/bootstrap rotate <service>` does the
   propagation for bootstrap-managed services.
4. **Expiry inside the window you can't avoid?** Decide the
   degradation now and write it into `bearings.md`
   (e.g. "critique falls back to anonymous passes after
   cookie expiry — do not file auth-failed noise"). The loop
   degrading per a written decision is fine; the loop
   discovering a surprise is not.

---

## Step 6 — budget, cadence, ceiling (10 min)

1. **Know your billing mode.** OAuth + Claude subscription =
   quota, not dollars: the loop shares your plan's weekly
   capacity. API key = dollars: real spend, no natural
   ceiling. The cost table in
   [`cloud-loop.md`](./cloud-loop.md) has current numbers.
2. **The commit ceiling is your volume brake** — default 12
   cloud commits/24h in `march.yml`. It bounds runaway
   shipping, not spend. On API-key billing, set a hard spend
   cap at the provider console too — the loop cannot check
   your invoice.
3. **Measure one week before raising anything.** Run the
   default cadence (~7 ticks/day) for a week, read your usage
   page, then decide. Raising the model and the cadence in the
   same week teaches you nothing about which one hurt.
4. **Cadence guidance:** local `/loop 30m /march` while you're
   in the building; cloud every 2h while you're not. Below 2h
   cloud cadence, ticks start queuing behind the concurrency
   group and you're paying for waiting.

---

## Step 7 — one writer at a time (5 min)

The cloud loop and a local `/loop /march` both push to
`<DEFAULT_BRANCH>`. Git will not lose work, but a collision
trips the divergence failure mode and stops a loop — the
opposite of hands-off. The discipline is operational, not
technical:

- **Leaving:** local loops off, cloud loop on. (It ticks while
  the laptop sleeps; that's its job.)
- **Returning to drive locally:** `gh workflow disable march`
  first, re-enable when you leave again —
  `gh workflow enable march`. Two commands, zero collisions.
- One-off local commits while the cloud loop is armed are
  fine — push them and the next cloud tick pulls fresh. The
  rule is about *loops*, not commits.
- **Attended parallelism is a different animal.** When you're
  present, multiple sessions on one branch are legitimate —
  see [`../customization/lanes.md`](../customization/lanes.md)
  for the alpha/beta/gamma fan-out. The moment you stand up,
  collapse back to one writer.

---

## The pre-flight checklist

Run the spectrum's Level 3/4 pre-flight first (deploy gate
proven red-capable, triage round-trip, service runbooks `OK`,
bias set). Then this playbook's additions:

- [ ] `node .claude/hooks/guard.mjs self-test` green; three
      attended ticks with **zero** permission prompts.
- [ ] Phone notification received from
      `node scripts/notify.mjs --title preflight`.
- [ ] `NOTIFY_NTFY_TOPIC` (or webhook) present in `.env` AND
      as a repo secret for cloud.
- [ ] Build plan has no stale `[blocked]` rows you could
      unblock now; every remaining `[ ]` phase has a brief
      that would survive your absence (read the next 3).
- [ ] Secrets inventory: no credential expires inside the
      window (Step 5), or its degradation is written down.
- [ ] Cloud dry run: `gh workflow run march` once,
      watch it end-to-end green, read the closing
      `/oversight audit` block in the log.
- [ ] Local loops are off if the cloud loop is on (Step 7).
- [ ] You know the two phone moves: file an issue (remote
      jot), `gh workflow disable march` (remote pause).

Then the 24-hour dry run: arm everything and stay reachable
but idle for a day. The loop should tick, ship, and page you
zero times. Every page during the dry run is a pre-flight item
you missed — fix it and re-run the day. **Walking away is a
promotion the loop earns, not a switch you flip.**

---

## While you're away

What arrives, and what it means:

| Signal | Meaning | Phone-sized response |
|---|---|---|
| Nothing | Ticks are shipping or cleanly no-op'ing | Skim the latest Actions log's audit block when curious |
| ntfy: `<skill>: stopped` | A failure mode fired; the loop wrote it down | Read the body. If it can wait, it waits — that's the design |
| ntfy: `loop: unclean stop` | A turn ended dirty; next tick may trip on it | Usually self-heals next tick; two in a row = disable + recover on return |
| Issue: `Cloud march tick crashed` | The harness itself died mid-tick | Read the run log link. One-off = ignore; repeated = `gh workflow disable march` |
| A `[needs-user-call]` notification | The loop chose a defensible default and wants review | Queue it for the return `/oversight`; answer via issue comment if urgent |

And the return ritual, unchanged from the spectrum doc: run
`/oversight` before you read anything else. Then the deploy
log, then `git log --oneline`, then the site.

---

## Failure modes

1. **You get paged twice for the same root cause.** The loop
   is stopping, notifying, and the next tick re-hits the wall.
   Disable the loop remotely; recover on return per
   [`recovery.md`](./recovery.md). Don't debug from a phone.
2. **The dry run pages you and you're tempted to ship anyway.**
   Don't. The dry run *is* the gate. A page during rehearsal
   is a guaranteed page during the window.
3. **Notification channel dies mid-window** (topic typo, ntfy
   outage). The GitHub crash-issue path is the independent
   backup; subscribe to repo notifications as belt-and-braces.
4. **You drove locally with the cloud loop armed** and hit
   divergence stops. Recovery is cheap
   ([`recovery.md`](./recovery.md) §B); prevention is Step 7's
   two commands.

---

## See also

- [`../intervention-spectrum.md`](../intervention-spectrum.md)
  — the readiness ladder this playbook operationalizes.
- [`../customization/claude-code.md`](../customization/claude-code.md)
  — the enforcement layer in detail.
- [`recovery.md`](./recovery.md) — when the window went wrong
  anyway.
- [`cloud-loop.md`](./cloud-loop.md) — the Actions runtime
  this playbook arms.
- [`../customization/external-services.md`](../customization/external-services.md)
  — the runbook discipline that pre-flights every dashboard.
