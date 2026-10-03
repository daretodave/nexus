# Digest — 2026-10-03

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three ticks, two `/iterate` fixes shipped and one `/critique`
pass crossing its 72h gate to file two fresh dry-run findings
(1 HIGH, 1 MED) — the first non-empty CRITIQUE queue in a few
days. No gate failures. The candidate queue keeps silting past
its own alarm threshold with no new relief this window.

## While you were out

Window: since the last digest commit (2026-10-02 16:22 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-02 23:32 | march → iterate | critique gate not yet due (8 commits / ~31h since pass 22, both under threshold); AUDIT header <24h old, reused. Shipped the top Pending row — `templates/skills/jot.md` cited the wrong `iterate.md` section (`§Scoring` instead of `§User-source bump`) for the `/jot` +0.5 bump. Mirrored and closed `#70`. Commit `a0692f1`. |
| 10-03 07:33 | march → iterate | critique gate still not due (9 commits / ~71.5h since pass 22 — just under the 72h line); AUDIT header still <24h old, reused. Shipped the next-top Pending row (tied at 2.4, picked for category A's priority) — `customization/bootstrap-automation.md` invented specific "playbook-ending" quotes for three playbooks; none actually end that way (`pre-spec.md` never mentions bootstrap at all; `existing-project.md` never names the `/bootstrap` command). Rewrote the bullet list to describe each playbook's real relationship instead. Commit `03695a5`. |
| 10-03 13:01 | march → critique | 72h since pass 22 (2026-09-30 08:01) crossed — gate opened. Ran pass 23: a scoped dry-run adoption walk (gh-as-db + ship-data default, Claude Code hardening layer) via `prompts/adopt.md` + `playbooks/new-project.md`. Mechanized copy+sweep held clean; two findings surfaced past that point — 1 HIGH (adopting `/ship-data` never prompts the bearings.md commit-verb row, so the first `ship-data` commit trips `guard.mjs`), 1 MED (`playbooks/new-project.md`'s prune step never strips dead rows from the just-copied `agents.md`). Filed, not shipped (critique only files). Commit `c5d2643`. |

`heartbeat` ran green across the window (5/5 success, no
alarms). No gate failures — all three ticks committed clean on
the first pass. One scheduling note: the cron is nominally 4
ticks/day (`0 2,8,14,20 * * *`), but as in most prior windows
only 3 fired this time (no ~02:00 UTC run) — a long-standing
GH Actions schedule-drop pattern, not a kit-side gate; not
proposed as a tuning candidate since it isn't something the
kit's own rails control.

## Shipped

By `/march` this window (see table above): `/iterate`'s two
fixes — the `jot.md` section citation (commit `a0692f1`, closes
`#70`) and the `bootstrap-automation.md` invented-quotes rewrite
(commit `03695a5`) — plus `/critique` pass 23's two new findings
filed to `plan/CRITIQUE.md` (not shipped; critique's job is
filing, not fixing). This digest ships nothing beyond itself —
no doc fixes, no template edits, per its own rails.
`plan/AUDIT.md`'s content is same-day-ish fresh (last full sweep
2026-10-02 14:38 UTC, ~24h ago, under the 48h refresh threshold)
even though its literal H1 still reads "2026-10-01" — the
known gap already tracked by the pending score-4.2 candidate —
so no refresh action needed this pass.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 41
  days blocked) and phase 32 (`#49`, 34 days blocked), both
  still on the same cloud-push-token workflows-scope gap;
  unchanged this window, still needs a local `/ship-a-phase` or
  `/oversight` session with normal repo-write push.
- **AUDIT:** 9 rows under `## Pending` (2 already ticked `[x]`
  this window — the two shipped fixes above, not yet relocated
  to `## Done`; real open rows: 7). Top open score is `[F, 2.4]`
  (`templates/setup/bootstrap.example.json` ships a model id
  with no "ids age" hedge nearby) — still below the 3.0-plus
  ship floor most ticks clear at. The rest: the durable
  blocked/external-issue rows (`#67`, `#54`, `#40`, `#35`, `#49`,
  all ≤0.8) and the pre-existing `[F, ~2]` model-id hedge gap in
  `customization/claude-code.md`.
- **CRITIQUE:** 2 pending (new this window, pass 23) — 1 HIGH
  (ship-data adoption gap), 1 MED (stale `agents.md` rows after
  pruning). First non-empty CRITIQUE queue in a few passes; both
  rows score in iterate's HIGH/MED bands (8–10 / 5–7), well
  above AUDIT's current top, so the next tick likely ships the
  HIGH row. Last critique pass now today (pass 23, 2026-10-03
  13:09 UTC).
- **PHASE_CANDIDATES:** 30 pending (24 >21d), oldest 94d
  (proposed 2026-07-02, unchanged row) — flat vs. yesterday, no
  new candidate filed this window (the window's one queue-growth
  event was CRITIQUE's two new rows, not a candidate).
- **Issues:** 7 open (`#67`, `#54`, `#49`/`#48`, `#40`,
  `#35`/`#34`) — unchanged from yesterday; `#70` closed by this
  window's first tick, no new issue opened.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't —
  unresolved, now 41/34 days blocked respectively.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (24 pending >21d,
  oldest 94d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) are cleared, same as every digest since the alarm shipped
  (phase 30); the queue's own aging-silt fix (score 3.5) is
  itself one of the 24.

## Today's intent

No `[ ]` build-plan rows remain — per `skills/march.md` §3 the
next tick dispatches to `/iterate`'s combined AUDIT/CRITIQUE
queue. The fresh CRITIQUE HIGH row — `playbooks/new-project.md`
§2/§4 never prompting the bearings.md commit-verb addition when
adopting `/ship-data`, so the first `ship-data` commit trips
`guard.mjs` — scores in iterate's 8–10 HIGH band, well clear of
AUDIT's current top (`[F, 2.4]`), so it's the likely next ship
once a tick picks it up.

## Tuning proposals

None this pass. The one live mistune signal (candidate-queue
silting) already has its own pending candidate (score 3.5,
2026-09-29); nothing else in this window's pulse — three clean
ticks dispatching correctly through the chain (two iterate
ships, one critique gate opening exactly on schedule), zero gate
failures — suggests a gate, cadence, or ceiling needs re-tuning.
The observed 3-of-4 cron fire rate (see pulse table) is a GH
Actions scheduling characteristic, not a rail this kit owns, so
it isn't filed as a candidate either.
