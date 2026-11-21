# Digest — 2026-11-21

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

The owner's own `/oversight` session this morning cleared
the whole backlog in one pass — re-armed `ACTIONS_PAT` with
Contents write so a cloud tick can push main and workflow
files itself, closed `#96`, promoted seven candidates into
specs 70-76, released spec 69 from Held, and raised the
daily ceiling 30 → 60 — and one unbroken ~2h41m chain then
spent it: spec 67 (plugin packaging + eval suite), spec 77
(mirror-orphan auto-close) and spec 78 (the eval-sandbox
dead end, now a guarded footgun) all shipped start to
finish, and spec 69 picked up three of its four chunks
(workspace resurrection). Nothing is blocked and nothing
needs you right now; quota sits at 0.79, just under its
0.80 cap, resetting 2026-11-23.

## While you were out

`seven_day utilization: 0.79 (allowed_warning, resets
2026-11-23T08:00:00Z)`.

Window: since the last digest commit (2026-11-20 18:46 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 11-20 21:05 → 21:06 | march | no-op. |
| 11-21 02:16 → 02:16 | march | no-op. |
| 11-21 09:56 → 10:04 | march → build | `298b522`/`15034a7`/`df8c1d2` — 67.3 (plugin verify leg, CRLF-safe byte-diff), closed + settled. |
| 11-21 13:11 → 13:29 | owner (local session) | re-armed `ACTIONS_PAT` with Contents write; `a17f5af` wires it as `github_token` on march/night; `adb8835`/`97d13b2` closed + settled 68.1 and 65.1; `216a448` fixed the motion baseline (4-week median); `6abae41` fixed iterate's close-phrase; `6b1a5da` bumped hono (7 advisories); `43567fa` made the plugin leg CRLF-safe. |
| 11-21 13:29 → 13:42 | march → critique | `d6ea25d` — pass 38: 5 findings (1 high, 3 med, 1 low). |
| 11-21 13:42 → 13:55 | march (chain) → oversight + build | `1f8bb4c`/`9f060f2`/`4b746a2` — `/oversight`: 7 candidates promoted (specs 70-76), 69 released from Held, 77 plotted asap, cron → every 3h, ceiling 30→60; `00ef542`/`3c286ff`/`3d92e75`/`b5615a4`/`7d24eb2` — 67.5 (`plugin.md` playbook), closed + settled. |
| 11-21 13:46 → 14:12 | march → build | `e714508`/`c53137c`/`838248c`/`1dd1974`/`3336e72`/`7972573` — 77.1 (mirror-orphan auto-close), closed + settled; spec 77 complete. |
| 11-21 14:12 → 15:05 | march (chain) → build | `ffc34d0`/`90d48b3`/`d0017b8`/`662f31c`/`375466e`/`aa80788`/`12e2ff4`/`a0db978` — 67.4 (plugin eval suite), closed + settled; spec 67 complete. Then four sandbox-arming attempts on `plugin-ci.yml` (`d150efa`/`c57c34c`/`506299d`/`e61010e`/`f3195d3`), none landed. |
| 11-21 15:05 → 15:37 | march (chain) → plot + build | `df6ad23` plots spec 78 (eval sandbox can't start on `ubuntu-latest`); two more attempts then the dead end documented (`0328df0`/`5eb10e6`/`3d18c4e`/`1a485c3`/`79d3aec`/`10e68aa`/`48a0296`) — 78.1 closed + settled; spec 78 complete. |
| 11-21 15:37 → 15:42 | march (chain) → chunk | `e9d9c5b` — chunk spec 69 (69.4 next). |
| 11-21 15:42 → 15:52 | march (chain) → build | `5d01f00`/`6982f70`/`fbdcdb1`/`7275c46`/`d6020e8` — 69.1 (`workspace/KEYS.md`), closed + settled. |
| 11-21 15:52 → 16:03 | march (chain) → build | `f251ae1` — 69.2 (`workspace-doctor.mjs`'s dead-ring check), closed + settled. |
| 11-21 16:03 → 16:10 | march (chain) → build | `b7e5b45`/`e3f3424`/`b3cae97` — 69.3 (`workspace.md`'s Resurrection section), closed + settled. |

`heartbeat` ran clean throughout (5/5 sampled). One unbroken
chain ran 13:29 → 16:10 (~2h41m, 8 chunks across 3 specs,
plus a critique pass and the oversight session); a quiet gap
follows, 16:10 to now (~1h31m), still open as of this digest.

## Shipped

- `/oversight` (owner session, `1f8bb4c`): 7 candidates
  promoted into specs 70-76 (not chunked yet); spec 69
  released early from Held; spec 77 plotted Asap;
  march's cron moves to every 3h; `promote_per_week` 3→5,
  `veto_days` 3→2, `Research` weekly→3d; `NEXUS_DAILY_CEILING`
  30→60; `#96` and both `ACTIONS_PAT` asks ticked closed in
  `plan/AUDIT.md`; two stray uncommitted files (a Cloudflare
  stack pointer, never committed) discarded.
- The workflow-push credential gap closed (specs 65 and 68
  complete): the owner re-minted `ACTIONS_PAT` with Contents
  write; `march.yml`/`night.yml` now pass it as `github_token`,
  so a cloud tick pushes main and lands workflow files on its
  own — the local-session-only rule for them is retired.
- Spec 67 complete (5 of 5 chunks): nexus ships itself as a
  Claude Code plugin — generated `plugin/` +
  `.claude-plugin/marketplace.json`, the `adopt`/`upgrade`/
  `doctor` commands, the gate's CRLF-safe `plugin` verify leg,
  a `claude plugin eval` suite, and `playbooks/plugin.md`.
- Spec 77 complete: `mirror-orphan` auto-closes a mirrored
  issue once every plan row naming it is closed.
- Spec 78 complete: `plugin-ci.yml`'s eval sandbox can't arm
  its per-case Bash tool on `ubuntu-latest` — six real fixes
  tried across chunks 67.4 and 78.1, none landed; the dead end
  is now a guarded footgun (`ci-eval-sandbox-userns`,
  `identity/footguns.md`) instead of a seventh retry.
- Spec 69 chunked; 3 of 4 chunks shipped: `workspace/KEYS.md`
  (names-only secrets manifest), `workspace-doctor.mjs`'s
  dead-ring check, and `workspace.md`'s Resurrection section.
  Next ready chunk: 69.4 (S, `playbooks/recovery.md`'s
  lettered section), cloud-pickable.
- `/critique` pass 38: 5 findings (1 high, 3 med, 1 low).

## Queues now

- **Build plan:** 8 specs, 1 chunk left (69.4, S,
  cloud-pickable — no workflow-file edit), 0 held. Held lane:
  empty (69 released this window).
- **AUDIT:** 0 pending, last pass 2026-11-20 (pass 133, ~23h
  old, fresh — no refresh needed). This window's owner session
  and local fixes closed out the four rows that were open
  (`#96`, both `ACTIONS_PAT` asks, the root-workflow-pin row).
- **CRITIQUE:** 5 pending, last pass 18h ago (pass 38, this
  window's findings: 1 high, 3 med, 1 low).
- **CANDIDATES:** 7 pending (7 >21d), oldest 142d (proposed
  2026-07-03) — net this window: 7 promoted into specs 70-76,
  1 rejected (built directly), down from 16 pending. Cuts
  since the last digest: none.
- **Support (fix-all):** 0 open user issues · first response
  none (0 opened in 7d) · close none in 7d.

## Unreleased CLI fixes

11 since `cli-v0.6.5` — `6b1a5da` fix(cli): hono 4.13.19 and
`@hono/node-server` 2.1.11 in the lockfile, clearing seven
advisories (new this window), `da4d724` fix(cli): onboarding
stepper shows a step count instead of clipping on mobile,
`9213170` fix(cli): Fleet tile phase track titles disambiguate
the two "Q" segments, `00b0a69` fix(cli): Oversight filter row
scrolls instead of clipping on mobile, `b348c6e` fix(cli):
mobile Welcome loop diagram no longer overlaps itself,
`a36935f` fix(cli): the onboarding Welcome headline wraps
naturally on narrow phones, `49f54b5` fix(cli): bump stale
Fable 5.1 model id/label to Fable 5.2, `23c4632` fix(test):
feed.test.mjs's fixture commits stop drifting to the loop's
own git identity, `7767c92` feat(upgrade): sync report cites
CHANGELOG.md entries (61.3), `972fe48` fix(cli): the favicon's
own 404 stops showing up as a UI-walk finding, and `ca3c79f`
feat: loop throughput (mirror-orphan generator, depth
promotion, product-first pick, Research `<n>d`).

## Needs you

- No `triage:needs-user` issues, no `loop:do` issues, no open
  `[needs-user-call]` rows, and no blocked chunks — this
  window's owner `/oversight` session and the `ACTIONS_PAT`
  remint closed out everything that was waiting on you (`#96`,
  both `ACTIONS_PAT` asks, the root-workflow-pin row, and
  chunks 65.1/68.1).
- auto-promoted none — the Held lane is empty (69 released
  this window).
- Secrets rotation check skipped — that log is local, this is
  a cloud run.

## Today's intent

Spec 69's only remaining chunk, 69.4 (S) — `playbooks/
recovery.md` gains a lettered section pointing at the
Resurrection section for "lost the machine, still have
GitHub" — is ready and cloud-pickable. AUDIT is empty this
pass; nothing to surface as a top finding.

## Tuning proposals

none — today's unbroken ~2h41m chain (8 chunks across 3
specs, one spec plotted and shipped in the same tick) is
itself evidence the gate isn't starved now that
`ACTIONS_PAT` and the cadence/ceiling knobs are fixed; no new
mistuned gate surfaced this pass. The candidates queue's
silting is down sharply this window (16 → 7 pending) and
what's left stays tracked by three already-filed candidates
(`[score 4.8]` heartbeat's quota-skip blind spot, `[score
4.5]` crash-alarm dedupe matching by title only, `[score 3.5]`
`pulse.mjs`'s `[promoted]`-row pending-count gap) rather than
a fresh one.
