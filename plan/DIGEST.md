# Digest — 2026-10-04

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

Three `/iterate` fixes shipped overnight (closing `#71`, `#72`,
`#73`), one gate failure — `#71`'s closing commit used prose
("closed by this commit") instead of the documented `Closes #N`
trailer, so the issue never auto-closed; closed by hand this
pass. AUDIT's own `## Pending` block had the same
never-relocated-after-shipping problem at 3x the scale (3 `[x]`
rows inflating the count); refreshed per the 48h-stale trigger,
true pending dropped from 9 to 5. No new drift found in a
focused sweep. Candidate queue silting continues unrelieved.

## While you were out

Window: since the last digest commit (2026-10-03 14:50 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-03 17:44 | march → iterate | Shipped `templates/claude/hooks/guard.mjs`'s `VERBS` array fix — `data`/`migration`/`asset`/`mod`/`bootstrap` were missing, so a fresh adopter's first `ship-data` commit tripped the commit-verb guard. Mirrored as `#71`; commit `8b587f2` did *not* actually close it (see Headline). |
| 10-03 22:39 | march → iterate | Shipped the next-top Pending row — `templates/setup/bootstrap.example.json`'s `anthropic.model` id had no "ids age" hedge. Added a `_note` key. Closes `#72`. Commit `eafdb62`. |
| 10-04 07:44 | march → iterate | No-op: no pending build-plan phase; critique gate not due; AUDIT header <24h old at the time, reused; nothing scored above the ship floor. |
| 10-04 13:39 | march → iterate | Shipped `playbooks/new-project.md` §4's prune-step fix — pruning a skill never told the adopter to also strip its row from the just-copied root `agents.md`. Closes `#73`. Commit `03f12e0`. |

`heartbeat` ran green across the window (5/5 success, no
flatline alarms). No `node scripts/verify.mjs` failures — all
four ticks (3 shipping, 1 no-op) completed clean.

## Shipped

By `/march` this window: the three `/iterate` fixes in the table
above (`#71`, `#72`, `#73`). By this digest: closed `#71` by
hand (the commit that should have closed it used non-keyword
prose); refreshed `plan/AUDIT.md` per the 48h-stale trigger
(header was reading 2026-10-01, 3 days old) — relocated the
three already-`[x]`'d-but-never-moved rows (`#70`'s jot.md fix,
the bootstrap-automation.md quotes fix, `#72`'s bootstrap.json
fix) from `## Pending` to `## Done`, and dropped `[F, ~2]`
(`customization/claude-code.md`'s model-id cell) per its own
drop criterion after re-confirming the doc-wide hedge still
covers it unchanged. Ran a focused (not full A-G) drift sweep —
doc-drift, link+tree hygiene, freshness, adopter-friction spot
checks — clean, nothing new. This digest ships nothing else —
no doc fixes, no template edits, per its own rails.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 42
  days blocked) and phase 32 (`#49`, 35 days blocked), both
  still on the same cloud-push-token workflows-scope gap;
  unchanged this window.
- **AUDIT:** 5 pending (corrected from the raw 9 `pulse.mjs` was
  reporting before this pass's cleanup — see Shipped). All five
  are durable `[user-issue #N]` rows (`#67`, `#54`, `#40`, `#35`,
  `#49`), confirmed still open, all scoring 0.4–0.8 — below any
  ship floor a cloud tick has cleared recently, and all need a
  local/human session (workflows-scope token gap, or no fix
  available for a non-reproducible transient). No cloud-actionable
  row remains in AUDIT right now.
- **CRITIQUE:** 0 pending, last pass 40h ago (pass 23,
  2026-10-03 13:09 UTC) — under the 72h / 12-commit gate, not due
  again yet.
- **PHASE_CANDIDATES:** 30 pending per `pulse.mjs` (25 >21d,
  oldest 95d, proposed 2026-07-02) — but 4 of those 30 are
  `[promoted → phase N]`-tagged rows still sitting under
  `## Pending`, never relocated, the exact same bug this digest
  just fixed in `plan/AUDIT.md`. True pending: 26 (21 >21d). This
  is already a filed candidate (score 3.5, proposed 2026-09-29,
  "pulse.mjs's candidate-pending count still includes the four
  `[promoted]`-tagged rows") — not this digest's to fix directly,
  since it touches script logic / queue structure, not audit
  content.
- **Issues:** 7 open (`#67`, `#54`, `#49`/`#48`, `#40`, `#35`/
  `#34`) — `#70`, `#71`, `#72`, `#73` all closed now (`#71` by
  this digest, by hand). No open `triage:needs-user` or `loop:do`
  issues.

## Needs you

- Phase 20 (`#35`) and phase 32 (`#49`) both need a local
  `/ship-a-phase` or `/oversight` session to push the
  workflow-file changes a cloud tick's App token can't — now
  42/35 days blocked respectively.
- Commit-message hygiene: when mirroring and immediately closing
  a `/critique`/`/iterate` finding, use a standalone `Closes #N`
  line (per `skills/iterate.md` §4) — prose like "closed by this
  commit" doesn't trigger GitHub's auto-close keyword matching.
  `#71` sat open for ~20h after its fix actually shipped before
  this digest caught it by hand; no systemic fix proposed since
  two of the last three ticks already used the correct form.
- No open `triage:needs-user` or `loop:do` issues.
- oversight needed: candidate queue silting (25 pending >21d,
  oldest 95d) — both silting thresholds (≥5 pending >21d, oldest
  >45d) are cleared, same as every digest since the alarm shipped
  (phase 30); the queue's own aging-silt fix (score 3.5) is
  itself one of the 25, and is specifically about this same
  queue's stale-relocation bug (see Queues now).

## Today's intent

No `[ ]` build-plan rows remain. Critique gate not due. Expand
gate not due (12 commits / 3 days since candidates pass 17,
both under the 20-commit/7-day threshold). Per `skills/march.md`
§3 the next tick dispatches to `/iterate`, but AUDIT's queue (now
freshly refreshed) has no cloud-actionable row left — all five
pending findings are durable, blocked-on-human-session rows.
Likely outcome: either a genuine no-op tick, or a fresh full A-G
sweep turning up something new since this pass's sweep was
focused, not exhaustive.

## Tuning proposals

None this pass. The two live mistune signals — candidate-queue
silting, and the AUDIT/CANDIDATES stale-relocation bug this
digest hand-fixed in AUDIT.md but left as-is in
PHASE_CANDIDATES.md — already have pending candidates (score 3.5
each) citing exactly these pulse numbers; filing a third would
just be a duplicate. Three clean ticks dispatching correctly
through the chain, one caught-and-fixed issue-close miss, zero
`verify.mjs` failures — nothing here points at a gate, cadence,
or ceiling that needs re-tuning.
