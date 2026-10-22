# Digest — 2026-10-22

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The owner's `/heads-down` marathon from last night ran clean
through to this morning and finished the entire backlog: 300
commits since the last digest, ten specs closed complete (35,
38, 40–47), `@usenexus/cli` 0.4.0 published, and the build plan
now holds exactly one spec (39, 9 chunks left) — down from five
specs/18 chunks yesterday. Three cloud `march` ticks and one
`heartbeat` cycle ran inside the same window, all green; no
gate needed fixing. One new AUDIT finding this pass: the
freshly-shipped secrets vault has no README prose entry point.

## While you were out

Window: since the last digest commit (2026-10-21 15:34 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-21 15:34 → 10-22 15:17 | *(owner, local)* | 292 commits by hand: specs 35, 38, 40, 41, 42, 43, 44, 45, 46, 47 closed complete in one continuous session; `@usenexus/cli` 0.4.0 published; plan down to spec 39 alone. |
| 10-22 01:00 | march → critique | Pass 28: 2 findings (0 high, 2 med, 0 low) — one routed into spec 39 as chunk 39.15, one (GitLab claim) still open below. |
| 10-22 07:21 | march → next | Shipped `39.5` — template script tests pass once copied into a fresh adopter. |
| 10-22 13:38 | march → next | Shipped `39.6` — `new-project.md` copies `pending/README`, writes `.gitattributes`/`.gitignore`. |

`heartbeat` ran 4/4 clean this window (10-21 17:10, 21:41;
10-22 04:42, 11:50) — fully recovered from yesterday's two
disabled-`march`-lookup failures, no action needed.

## Shipped

- **35** — the v1→v2 plan-shape move finished: docs speak
  chunks, `upgrade-plan` converts a v1 plan, `v2.0.0` tagged.
- **38** — adoption asks owner/contributor and arms the hooks;
  `push-policy` guards main on origin/upstream only.
- **40** — the GUI's fleet home, merged inbox, plan board,
  claims/git/Actions panels, recovery and headless run.
- **41** — linked terminal sessions, tugs on the stage, the
  Claude Design handoff ported at fidelity, a lighter package.
- **42** — secrets by name in `nexus.secrets.json`, a two-ring
  vault, pushed through stdin, guarded in hook and gate, drawn
  in the GUI's vault (see Needs you — undocumented in README).
- **43** — the Claude Design round trip: `/design`
  prompt/addendum/ingest, board renderer, port recipe, GUI
  hand-off gallery.
- **44** — `nexus --demo` fixture scenarios, a pure-JS GIF
  recorder, fleet-to-tug plays in the README under budget.
- **45** — `## Add` extends a spec without quoting it, numbered
  at settle; `/plot` extends before it adds.
- **46** — plots settle before same-date closes; `/triage`
  extends the spec an issue belongs to.
- **47** — the GUI reads a mature adopter truthfully: every
  onboarding button does what it says, GUI commits run the
  repo's hooks safely.
- `@usenexus/cli` 0.4.0 published (Trusted Publishing, OIDC).

## Queues now

- **Build plan:** 1 spec (39), 9 chunks left, 0 held, no live
  claims — fully pick-able for the next `march`/`next` tick.
- **AUDIT:** 4 pending (refreshed this pass, header was
  2026-10-19, 72h stale). Three durable `[user-issue
  #40/#35/#49]` rows unchanged (still blocked on the cloud
  push token's missing `workflows` scope). Dropped the carried
  `[D/A]` "12-17 vs 10-20 phase count" row — its premise no
  longer exists post-v2-rewrite (verified: `new-project.md` no
  longer states either number). Added one new `[B, 5.6]` row —
  see Needs you.
- **CRITIQUE:** 2 pending, last pass 15h ago (pass 28, today).
  One (owner/contributor heuristic errors with no GitHub
  remote) routed into spec 39 as chunk 39.15; one (the
  GitLab-support claim with no delivery behind it) still open,
  unscored.
- **CANDIDATES:** 32 pending (30 >21d, oldest 113d, proposed
  2026-07-02) — unchanged count; the `heartbeat` wedged-run
  candidate filed last pass (`[score 7.0]`, 2026-10-21) stays
  pending, still fresh (<21d).
- **Issues:** 0 open. The five `#49/#48/#40/#35/#34` issues
  yesterday's digest flagged as possibly stale were closed
  2026-10-21T21:02–23:33Z, each with a resolution comment: #34/
  #48 (the old phase 20/32 numbering) closed because that work
  shipped as specs 20/32 from a local session; #35/#40/#49
  closed the same way but each comment is explicit that the
  underlying constraint (cloud ticks can't push
  `.github/workflows/*` edits) "still holds" — confirming the
  three durable AUDIT rows below are still accurate, not stale.
  No open `triage:needs-user` or `loop:do` issues.

## Needs you

- **New AUDIT row `[B, 5.6]`:** README.md's customization-layer
  doc list (the prose rows for `data-layer.md`,
  `bootstrap-automation.md`, `branding.md`, `moderation-loop.md`,
  `hermetic-e2e.md`, `claude-code.md`) never names
  `customization/secrets.md`, even though spec 42 just shipped
  a full secrets vault. The only README mentions are generated
  file-tree comments — an adopter scanning for features would
  never find it. Next `/iterate` tick can ship this: add a
  bullet, or fold into the `/bootstrap` row.
- oversight needed: candidate queue silting (30 pending >21d,
  oldest 113d) — both silting thresholds (≥5 pending >21d,
  oldest >45d) stay cleared, same standing alarm as every
  digest for weeks; nothing promoted out of it even on the
  busiest shipping window on record.

## Today's intent

Spec 39 is the whole build plan now and fully pick-able (no
claims): the next `march`/`next` tick takes `39.7` (every
template placeholder documented, swept or flagged). Audit's
top finding (the secrets-vault README gap, `[B, 5.6]`) is the
next `/iterate` pick once no chunk is ready — which, at 9
chunks deep with no held rows, is still a few ticks off.

## Tuning proposals

None this pass — all three ticks in the window (one critique,
two chunk ships) ran clean; no mistuned gate, ceiling, or
starved queue surfaced. The one standing proposal
(`heartbeat`'s wedged-run canceller breaking on a disabled
watched workflow, `[score 7.0]`, filed 2026-10-21) remains
unpromoted in `plan/CANDIDATES.md`.
