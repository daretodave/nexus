# Digest — 2026-09-20

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A quiet window — one clean doc ship and one honest expand
no-op — but the window's third tick crashed on an org-level
Claude-access toggle, and the crash-alarm's title-only dedupe
silently buried it behind a two-week-old, unrelated open issue
instead of surfacing it.

## While you were out

Window: since the last digest commit (2026-09-19 14:01 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 09-19 22:06 | march → iterate → expand | shipped `777f942` — expand pass 13: 0 new candidates; re-evidenced the standing "Auto mode" candidate (score 6.5) with a fresh CHANGELOG sweep (v2.1.270-278) rather than filing a duplicate |
| 09-20 07:25 | march → iterate | shipped `3a7b0da` — `cloud-loop.md` never gave a copy command for `night.yml`/`heartbeat.yml`/`nightly-smoke.yml`/`ISSUE_TEMPLATE/*.yml` despite README marketing them as core; added an "Optional: the other shapes" section with bash + PowerShell copy commands (closes #59). This tick's own fresh AUDIT sweep queued a smaller, related ISSUE_TEMPLATE-tree-omission row for later. |
| 09-20 12:50 | march | **crashed**, no commit — the Claude Code Action returned `api_error_status: 403`, `api_error_code: oauth_not_allowed_for_organization` ("Your organization has disabled Claude subscription access for Claude Code"). The workflow's crash-alarm step fired, searched for an open issue titled "Cloud march tick crashed," found `#54` (filed 2026-09-07 for an unrelated `setup-bun` 504) already open, and skipped filing a new one — so today's actual cause is recorded nowhere but the raw run log. See Tuning proposals. |

`heartbeat` ran green throughout (5/5 sampled). Two of three
march ticks shipped a commit; the third crashed before reaching
the agent turn — a first occurrence of this specific failure
mode.

## Shipped

- `777f942` — expand pass 13. Swept signals A-E since pass 12;
  found no new AUDIT/CRITIQUE clusters, no new triage patterns,
  no sibling-lessons material. A fresh CHANGELOG fetch (v2.1.270
  through v2.1.278) found auto-mode continuing to change across
  multiple releases — reinforced the existing "Auto mode"
  candidate's source signals rather than filing a duplicate.
- `3a7b0da` — `playbooks/new-project.md` deferred adopters to
  `playbooks/cloud-loop.md` for `night.yml`/`heartbeat.yml`
  ("ship separately"), but that playbook's Step 1 only ever
  copied `march.yml` + `CLOUD_LOOP.md`. No doc anywhere gave a
  copy command for those two files, `nightly-smoke.yml`, or
  `.github/ISSUE_TEMPLATE/*.yml`. Closes #59.

## Queues now

- **Build plan:** 0 pending, 2 blocked — phase 20 (`#35`, 28
  days blocked) and phase 32 (`#49`, 21 days blocked), both on
  the same cloud-push-token workflows-scope gap, unchanged since
  2026-08-23 and 2026-08-30.
- **AUDIT:** 6 pending rows, up from 5 (this window's fresh
  sweep during the 07:25 tick added `[C/A, 3.2]` — README's kit
  tree omits `templates/.github/ISSUE_TEMPLATE/` — same bug
  shape as the just-fixed `install-hooks.mjs` gap). Header reads
  2026-09-20 (<48h old, no refresh needed this tick). The five
  carried-over rows (`[F, ~2]`, `#54`, `#40`, `#35`, `#49`) are
  unchanged.
- **CRITIQUE:** 0 pending, last pass 18 (2026-09-18), unchanged.
- **PHASE_CANDIDATES:** 26 pending (21 >21d), oldest 81d
  (proposed 2026-07-02) — both counts grew by exactly the day's
  passage, nothing newly silted or drained. Last expand pass (13)
  was 2026-09-19; not due again until its own 20-commit/7-day
  threshold.
- **Issues:** 6 open, unchanged — `#54` (now the dedupe-masking
  issue described above, not just a self-healed transient),
  `#49`/`#48` (phase 32 blocked + loop mirror), `#40` (phase 23
  follow-up, blocked), `#35`/`#34` (phase 20 blocking token issue
  + loop mirror). No `triage:needs-user` or `loop:do` labels
  open.
- **Sibling lessons:** not checked — no local sibling checkout in
  this cloud environment; skipped per digest's own carve-out.

## Needs you

- **oversight needed: candidate queue silting (21 pending >21d,
  oldest 81d).** Both trigger conditions remain met. Worth an
  `/oversight` pass to drain or explicitly defer the backlog.
- Two blocked build-plan rows still waiting on a local/human
  session with normal (non-App-token) push credentials: phase 20
  (`#35`, 28 days) and phase 32 (`#49`, 21 days).
- New this tick: the 12:50 march crash's actual cause
  (`oauth_not_allowed_for_organization` — an org-level Claude
  access toggle, not a nexus code or workflow defect) is only
  visible in the raw Action run log, not in any GitHub issue,
  because the crash-alarm's title-only dedupe matched it against
  `#54` (a different, already-resolved failure class from
  2026-09-07). If this recurs, nothing currently guarantees the
  next occurrence gets its own issue either. Filed as a tuning
  proposal below rather than fixed directly.
- The standing `[score 4.2]` tuning proposal — "AUDIT.md's H1
  header date isn't mechanically bumped after a full sweep" —
  is still pending; no new evidence this tick.

## Today's intent

No `[ ]` build-plan phase pending. `plan/CRITIQUE.md` is empty,
so the next `/iterate` pick is AUDIT's own top row —
`[C/A, 3.2]` (README's kit tree omitting
`templates/.github/ISSUE_TEMPLATE/`) — unless a fresh CRITIQUE
row lands first. `/expand` isn't due until its own commit/day
threshold clears (pass 13 ran yesterday).

## Tuning proposals

Filed one candidate in `plan/PHASE_CANDIDATES.md`: the
crash-alarm step in `.github/workflows/march.yml` (and its
`templates/` mirror) dedupes by matching the literal issue title
"Cloud march tick crashed" against any open issue, regardless of
cause. `#54` has sat open for 13 days on a since-self-healed
`setup-bun` 504; today's tick crashed for a completely different
reason (`oauth_not_allowed_for_organization`) and got silently
folded into the same dedupe check, so no issue exists describing
it. Proposed scope: key the search (or the title) off something
cause-specific — the `api_error_code`/failed-step name — so
distinct failure classes each get their own visible issue, per
agents.md rule 6 ("blocked is loud"). Citing today's pulse: one
crashed tick (run `35511786013`), one masked cause, zero new
issues filed.
