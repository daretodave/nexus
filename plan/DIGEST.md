# Digest — 2026-10-23

> Written nightly by `/digest` (see `skills/digest.md`).
> Overwritten whole each pass; history lives in git.

## Headline

A ~23-hour owner marathon closed seven more specs (48–54, only
52's last two chunks still mid-flight under a live claim) and
shipped five `@usenexus/cli` point releases (0.4.7→0.5.1: the
change feed, the stack hand-off, plain-folder onboarding, an
alive home with put-away, a faster shell, a truthful vault),
while two clean cloud ticks ran alongside it — critique pass 29
(3 findings) and chunk 39.7. The candidate queue's silting alarm
(30 pending >21d, oldest 114d) is unchanged for another day.

## While you were out

Window: since the last digest commit (2026-10-22 15:31 UTC).

| Tick (UTC) | Verb | Outcome |
|---|---|---|
| 10-22 15:31 → 10-23 14:53 | *(owner, local)* | 157 commits by hand: specs 48–54 closed (52 left with 2 chunks, live-claimed); `@usenexus/cli` 0.4.7→0.5.1 published, all green. |
| 10-22 18:25 | march (ceiling) | Skip — old ceiling (8) already spent by the marathon's own churn commits; no work this tick. |
| 10-22 23:05, 23:06, 23:07 | march (ceiling) | Three more skips, same reason, back-to-back. |
| 10-22 23:49 | *(owner, local)* | Ceiling raised 8 → 20 weighted points/24h (`fadbde8`) — fixes the skip streak above, same window. |
| 10-23 07:14 | march → critique | Pass 29: 3 findings (0 high, 2 med, 1 low). |
| 10-23 13:14 | march → next | Shipped `39.7` — six undocumented template placeholders indexed, `<CANONICAL SIBLING>` swept. |

`heartbeat` ran clean throughout (5/5 sampled, no failures). Spec
52's remaining chunks (52.2, 52.3) are live-claimed by a local
session (`SWAN`, since 10-22 23:30, still inside the 24h window)
— the cloud loop correctly skipped them and picked spec 39's
next chunk instead.

## Shipped

- **48** — the CLI suite holds under full Windows runs (the
  server ends what it starts, tree kills on timeout); a resumed
  ledger names its runner as one Fleet tile.
- **49** — the GUI tells the truth on the owner's walk: Settings
  sets the permission mode, permission cards read like tool
  rows, the cloud step keeps a schedule it finds, the vault
  counts declared names and reads GitHub for its Actions sink,
  optional secrets read optional, closed chunks show their date
  and commit honestly.
- **50** — onboarding asks the permission mode right after
  Welcome, so every session after starts in the chosen mode.
- **51** — answers save as typed and send as given; images reach
  the session as images (attach, paste, drop).
- **52** (partial) — onboarding adopts before it plots; tool
  rows fit their names. 52.2/52.3 still open, claimed locally.
- **53** — plan answers are kept on the server, take the
  defaults their questions name, and go back to the session that
  asked with one Continue (issues #81, #82, #83).
- **54** — every session shows its model and effort; Settings
  chooses both for new sessions; the cockpit badge switches a
  running session.
- **39.7** — six undocumented template placeholders indexed in
  `templates/README.md`.
- `@usenexus/cli` 0.4.7 → 0.5.1 published (five point releases,
  Trusted Publishing, OIDC) — grill-me and the wand, needs-you on
  every top bar, an alive home and put-away, the change feed, the
  stack hand-off, plain folders, a faster shell, a truthful
  vault.
- Cloud loop ceiling raised 8 → 20 weighted points/24h.

## Queues now

- **Build plan:** 2 specs, 10 chunks left (39: 8, pick-able;
  52: 2, live-claimed by a local session), 0 held.
- **AUDIT:** 4 pending, header 2026-10-22 (<48h, not stale).
  Three durable `[user-issue #40/#35/#49]` rows unchanged (still
  blocked on the cloud push token's missing `workflows` scope).
  One real row, `[B, 5.6]` (README's secrets-vault entry-point
  gap) — see Needs you.
- **CRITIQUE:** 5 pending, last pass 15h ago (pass 29, today).
  Pass 29 added 3 new (2 MED, 1 LOW: a bootstrap/cloud-loop
  precondition gap in `new-project.md` step 9, a missed
  Co-Authored-By carve-out in `prompts/pitch.md`'s Standing
  rules, and README's "Files added" checklist missing
  `nexus.secrets.json`); carried from pass 28, one MED (the
  GitLab-support claim, still unscored) and one already
  `[x]`-routed into chunk 39.15 awaiting a `/critique` pass to
  formally close it.
- **CANDIDATES:** 32 pending (30 >21d, oldest 114d, proposed
  2026-07-02) — unchanged count and age profile from yesterday,
  one day older.
- **Issues:** 2 open (#86 bug: Oversight's notification count
  sometimes doesn't go down; #85 idea: breakout chats in
  Oversight), both filed today, neither triaged yet. 0 open
  `triage:needs-user` or `loop:do`.

## Needs you

- **AUDIT row `[B, 5.6]`** (carried, unchanged): README's
  customization-layer doc list still never names
  `customization/secrets.md`, even though spec 42 shipped a full
  secrets vault weeks ago. Next `/iterate` pick once no chunk is
  ready.
- **oversight needed: candidate queue silting (30 pending >21d,
  oldest 114d)** — both thresholds (≥5 pending >21d, oldest
  >45d) have been blown through for weeks; nothing has been
  promoted out of `plan/CANDIDATES.md` across this entire
  marathon window either.
- #86 and #85 are sitting unlabeled — not urgent, just flagging
  for the next `/triage` pass.

## Today's intent

Next ready chunk for the dispatcher: spec 39's `39.8` (a
no-deploy-host path in the templates, S) — spec 52's `52.2`/
`52.3` stay claimed by the local session. Audit's top finding
once no chunk is ready: `[B, 5.6]`.

## Tuning proposals

None this pass. The one mistuned-gate signal in the window — the
cloud ceiling (then 8) skipping four ticks back-to-back overnight
— was already caught and fixed by the owner directly in the same
window (`fadbde8`, 8 → 20); no candidate needed since the fix
already shipped before this digest ran. The standing candidate-
queue silting alarm (above) is a `/oversight` call, not a gate
tuning.
