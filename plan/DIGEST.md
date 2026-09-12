# Digest — 2026-09-12

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

An active night: critique pass 16 landed two low-stakes
findings and the next two ticks each shipped one (both closed
within a day), so `plan/CRITIQUE.md`'s Pending queue is empty
again — the candidate queue is still the thing silting
(21 of 24 pending rows >21 days old, oldest 73 days).

## While you were out

Window: since the last digest commit (2026-09-11 14:34 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-11 17:29 | march → (triage clear → critique not yet due → no pending phase → fallthrough) | **no-op** — clean, read-only briefing; no new signal |
| 09-11 22:14 | march → critique | shipped `bd340bf` — pass 16: 2 findings (0 high, 1 med, 1 low) |
| 09-12 06:50 | march → (critique-sourced fix) | shipped `22fe783` — README's three `<your-fork-or-mirror>` occurrences gained an inline swap instruction (closes pass 16's MED row) |
| 09-12 11:57 | march → (critique-sourced fix) | shipped `1a1e2e4` — `bearings.md` gained a defining parenthetical at its real first use (closes pass 16's LOW row) |

`heartbeat` ran green throughout (5/5 sampled). Three of four
ticks shipped a commit; the fourth was a genuine, self-verified
no-op.

## Shipped

- `bd340bf` — critique pass 16: 2 findings logged to
  `plan/CRITIQUE.md` (0 high, 1 med, 1 low).
- `22fe783` — README.md's three `<your-fork-or-mirror>`
  placeholders (clone step, adopt-prompt paste, pitch-prompt
  paste) each gain a one-line note telling the reader to swap
  the token before pasting. Closes pass 16's MED row.
- `1a1e2e4` — README.md:288's `bearings.md` stub mention gains
  a defining parenthetical ("the file that locks your stack,
  conventions, and standing decisions"), so the two later uses
  in the same file aren't the reader's introduction to the
  term. Closes pass 16's LOW row.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`) and
  phase 32 (`#49`), unchanged since 2026-08-23 and 2026-08-30.
- **AUDIT:** header 2026-09-12 (fresh, well under the 48h
  threshold), no re-sweep needed. Pending is the same four
  durable rows as before — `[user-issue #54]` LOW (self-healed
  transient), `#40`/`#35`/`#49` MED (all blocked on the
  identical cloud-push-token workflows-scope gap).
- **CRITIQUE:** 0 pending. Last pass 16 (2026-09-11, header
  date) — 38h since, well under the rate-limit gate's `>72h`
  leg.
- **PHASE_CANDIDATES:** 24 pending (21 >21d), oldest 73d
  (proposed 2026-07-02) — unchanged from the last several
  digests; no expand pass ran this window.
- **Issues:** 6 open, unchanged — `#54` (self-healed
  transient), `#49`/`#48` (phase 32 blocked + loop mirror),
  `#40` (phase 23 follow-up, blocked), `#35`/`#34` (phase 20
  blocking token issue + loop mirror). No `triage:needs-user`
  or `loop:do` labels open.
- **Sibling lessons:** not checked — no local sibling checkout
  in this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending
  >21d, oldest 73d).** Both trigger conditions remain met —
  no promotions since 2026-08-23 (20 days now). Worth an
  `/oversight` pass to triage the 24 pending rows.
- **Issues #35 / #40 / #49** — all blocked on the identical
  cloud-push-token `workflows`-scope gap. A structural-fix
  candidate (score 7.8, proposed 2026-08-31, top of the
  pending queue) already covers all three and would resolve
  them at once if promoted.
- **Issue #54** — root-caused as a transient third-party CDN
  504, self-healed; no action needed unless the class recurs.

## Today's intent

Build plan has 0 pending `[ ]` rows, so per `agents.md` the
next work is `/iterate`'s audit queue. All four AUDIT rows are
`external-issue` category, tied at score 0.8 (impact 4 x ease
2 / 10, or impact 2 x ease 2 for `#54`) — all blocked on the
same cloud-token gap, none shippable from inside a cloud tick.
The top of that cluster is `#40` (apply phase 23's crash-alarm
patch to this repo's own `march.yml`/`night.yml` by hand).
Beyond the loop's own dispatch, the candidate-queue-silting
line above is still the thing most worth a human's attention.

## Tuning proposals

None new this pass. The candidate-queue silting is already
captured structurally by phase 30's threshold (the Needs You
line above does the flagging), and the workflow-scope-blocked
lane candidate (score 7.8) already covers the recurring
`#35`/`#40`/`#49` cluster. Critique's rate-limit gate opened
and closed cleanly this window (pass 16 due, ran, queue now
empty) — no mistuning to report.
