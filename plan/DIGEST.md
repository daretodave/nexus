# Digest — 2026-09-13

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet-ish night: one tick fell through to `/expand` (nothing
in the audit/critique queues scored >=3.0), two ticks shipped
small doc fixes, and one was a genuine no-op — the candidate
queue is still the thing silting (21 of 25 pending rows >21
days old, oldest 74 days, 21 days since the last `/oversight`
promotion pass).

## While you were out

Window: since the last digest commit (2026-09-12 13:42 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-12 16:43 | march → iterate → expand (posture-bold escape hatch: nothing scored >=3.0) | shipped `6aae3a8` — expand pass 11: 1 candidate |
| 09-12 21:55 | march → (audit-sourced fix) | shipped `f6ea559` — CONTRIBUTING.md's stale README-heading citation; same tick's fresh A-G sweep filed a new AUDIT row |
| 09-13 07:09 | march → (audit-sourced fix) | shipped `5f5de03` — intervention-spectrum.md's dispatcher-verb undercount |
| 09-13 13:05 | march → (triage clear → critique not due → no pending phase → audit queue thin) | **no-op** — clean, read-only briefing; no new signal |

`heartbeat` ran green throughout (5/5 sampled). Three of four
ticks shipped a commit; the fourth was a genuine, self-verified
no-op.

## Shipped

- `6aae3a8` — expand pass 11: filed one new candidate (score
  6.0) — Claude Code v2.1.269 fixes the attribution-reminder/
  CLAUDE.md conflict `agents.md` rule 2 depends on. No repo
  commit has ever actually carried a stray trailer; this
  formalizes a guarantee rather than closing an incident.
- `f6ea559` — CONTRIBUTING.md:71 pointed at README's "Two paths
  to start" heading, renamed to "Three paths to start" when the
  pre-spec.md path was added. Same tick's fresh A-G sweep also
  filed two lower-confidence findings to `plan/AUDIT.md`
  (one downgraded on discovery — see Queues now).
- `5f5de03` — intervention-spectrum.md:38 listed five
  dispatcher verbs, missing "expand" that README.md's canonical
  six-verb description carries.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`) and
  phase 32 (`#49`), unchanged since 2026-08-23 and 2026-08-30.
- **AUDIT:** header touched today (fresh, well under the 48h
  threshold), 5 pending rows. New this window: `[F, ~2]`
  (`customization/claude-code.md:315`'s model-id cell lacks an
  inline "ids age" hedge) — downgraded on discovery, since the
  same doc already carries a doc-wide hedge covering it; the
  row itself says it "may not be worth a tick at all." The
  other four are the same durable rows as before — `#54` LOW
  (self-healed transient), `#40`/`#35`/`#49` MED (all blocked
  on the identical cloud-push-token workflows-scope gap).
- **CRITIQUE:** 0 pending. Last pass 16 (2026-09-11, header
  date) — ~48h since, still under the rate-limit gate's `>72h`
  leg.
- **PHASE_CANDIDATES:** 25 pending (21 >21d), oldest 74d
  (proposed 2026-07-02) — grew by one this window (expand pass
  11's new candidate, proposed 2026-09-12, too fresh to count
  toward the >21d figure).
- **Issues:** 6 open, unchanged — `#54` (self-healed
  transient), `#49`/`#48` (phase 32 blocked + loop mirror),
  `#40` (phase 23 follow-up, blocked), `#35`/`#34` (phase 20
  blocking token issue + loop mirror). No `triage:needs-user`
  or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending
  >21d, oldest 74d).** Both trigger conditions remain met —
  21 days since the last promotion pass (2026-08-23). Worth an
  `/oversight` pass to triage the 25 pending rows.
- **Issues #35 / #40 / #49** — all blocked on the identical
  cloud-push-token `workflows`-scope gap. A structural-fix
  candidate (score 7.8, proposed 2026-08-31, top of the
  pending queue) already covers all three and would resolve
  them at once if promoted.
- **Issue #54** — root-caused as a transient third-party CDN
  504, self-healed; no action needed unless the class recurs.

## Today's intent

Build plan has 0 pending `[ ]` rows, so per `agents.md` the
next work is `/iterate`'s audit queue — but tonight's queue is
thin: the only non-blocked row (`[F, ~2]`, the model-id hedge
gap) scores below `/iterate`'s 3.0 bar and is itself flagged as
possibly not worth shipping, and the three blocked MED rows
(`#40`/`#35`/`#49`) can't ship from inside a cloud tick. Expect
`/march` to keep falling through to `/expand` (as it did this
window) until `/critique`'s rate-limit gate reopens (~24h more)
or a fresh signal arrives. Beyond the loop's own dispatch, the
candidate-queue-silting line above is still the thing most
worth a human's attention.

## Tuning proposals

None new this pass. The candidate-queue silting is already
captured structurally by phase 30's threshold (the Needs You
line above does the flagging), and the workflow-scope-blocked
lane candidate (score 7.8) already covers the recurring
`#35`/`#40`/`#49` cluster. No mistuned gate observed this
window — the one fallthrough to `/expand` was iterate's own
documented posture-bold escape hatch working as designed, not
drift.
