# Candidates

> Last pass: 2026-11-28
> Pass count: 32
> Posture: bold
> Last field research: 2026-11-27

## Pending

### [promoted 2026-08-23 → phase 22] [score 8.8] Workspace-of-repos as a first-class adoption path
- proposed: 2026-07-03
- source signals: two sibling adopters independently converged
  on the same topology — un-versioned workspace root,
  org-per-project GitHub layout, `plan/` its own repo, sibling
  product repos — which the kit only half-documents
  (`playbooks/polyrepo.md` covers the plan split alone).
- rationale: two real adoptions converging unprompted is the
  strongest possible signal; every workspace adopter currently
  re-improvises the root conventions.
- proposed scope: `playbooks/workspace.md` (un-versioned-root
  rule, org-per-project, what lives only at root, decision
  matrix, ready-when checklist); `templates/workspace/` root
  family (workspace CLAUDE.md + AGENTS.md mirror, scratch
  README, repo-claude propagation template); a
  topology-detection step in the adopt prompt with a
  confirm-with-user stop; edits to `playbooks/polyrepo.md` +
  `concepts/architecture.md` so single-repo -> polyrepo ->
  workspace reads as one ladder.
- estimated phases: 1-2
- conflicts: extends polyrepo.md, never replaces it.

### [promoted 2026-08-23 → phase 21] [score 8.6] prompts/ as canonical files + a five-line paste
- proposed: 2026-07-03
- source signals: the two ~60-line README paste-prompts are the
  funnel's biggest wall; prompt fixes today mean "re-paste the
  new blob".
- rationale: `prompts/adopt.md` + `prompts/pitch.md` as
  versioned, gate-linted files turn the paste into five lines
  that self-clone (or one raw.githubusercontent fetch line),
  client-agnostic by construction; every other doorway (npx,
  plugin) later references the same canonical text.
- proposed scope: `prompts/adopt.md`, `prompts/pitch.md`,
  `prompts/README.md`; README TL;DR sections shrink ~120
  lines; a verify leg keeping any README excerpt byte-synced
  with prompts/; `skills/critique.md` dry-runs the new short
  paste; agents.md notes prompts/ paths are public API.
- estimated phases: 1
- conflicts: pairs with the README conversion pass below —
  promote together or sequence prompts/ first.

### [promoted 2026-08-23 → phase 19] [score 9.0] Rewrite playbooks/new-project.md's step-4 copy-and-placeholder walkthrough as one verified sequence
- proposed: 2026-07-06; re-evidenced 2026-07-10, 2026-07-13,
  2026-07-21, 2026-07-23 (x2), 2026-07-24, 2026-07-26
- source signals: this is the second critique cycle in a row to
  land findings in the same step-4/7 block of
  playbooks/new-project.md. The four findings that originally
  motivated this candidate (sibling-clone copy paths,
  `PHASE_CANDIDATES.md` never copied, CLAUDE.md never landed at
  root, and their combined ordering) are now all fixed
  individually (see `plan/CRITIQUE.md` Done log) — and critique
  pass 3 (2026-07-10) immediately found six more in the identical
  region: `templates/plan/phases/` also never lands in step 4's
  copy array despite step 5 depending on it (HIGH — literal
  placeholder tokens ship in phase 1's brief); the placeholder
  grep scope still misses `./scripts` and `./.env.example` (MED,
  confirmed unresolved `<PROJECT_LOWER>`/`<REPO_SLUG>` tokens);
  the blanket `skills/` copy still contradicts the adopt-by-need
  contract (MED); step 7 redundantly re-copies
  `deploy-check.mjs` already placed by step 4's bulk copy (LOW);
  step 6 edits a `package.json` that doesn't exist at that point
  in the walk (LOW); the pnpm sed caveat has no worked example
  (MED, see the sibling candidate below). Critique pass 4
  (2026-07-13) sharpened the adopt-by-need prune finding still
  further: the "Prune adopt-by-need files" fix only gives worked
  removal steps for 4 of `templates/README.md`'s ~12 adopt-by-need
  rows, leaving `skills/digest.md`, `skills/bootstrap.md`,
  `scripts/refresh-critique-session.mjs`,
  `scripts/check-secrets-liveness.mjs`, and
  `scripts/stack-lifecycle.mjs` unconditionally landed with no
  prompt to remove them for adopters who don't need them —
  confirmed in a scratch repro. Third cycle in a row landing in
  this same block. A fresh A-G AUDIT sweep (2026-07-21, not a
  critique pass) found a fourth instance of the identical
  grep-scope bug: the same one-liners also omit `./data`, so
  `templates/data/README.md`'s `<PROJECT>`/`<PROJECT_PKG_PREFIX>`
  tokens survive the sweep unresolved for GitHub-as-DB adopters —
  fixed same-commit (`ced0304`), the third distinct scope gap
  found this way after `./scripts` and `./.env.example`. The bug
  class now reproduces from both signal A (audit) and signal B
  (critique), always in the same one-liners. Since pass 4
  (2026-07-22), four more instances landed in the identical
  block, two per sub-mechanism the proposed scope already names:
  the placeholder one-liner broke again twice more — bare
  `sed -i` misparsed by stock macOS/BSD sed (2026-07-23, commit
  `70c8b6c`) and an unguarded `./data` grep erroring loudly when
  the directory is absent (2026-07-23, commit `fe46a28`) — and
  the "Prune adopt-by-need files" sub-step missed two more of the
  ~12 adopt-by-need rows exactly as this candidate's proposed
  scope predicted: the `.claude/` Claude-Code-only bundle
  (2026-07-24, commit `9d404ce`) and `scripts/bootstrap.mjs`, the
  1009-line executor behind `/bootstrap` (2026-07-26, commit
  `0f19039`). Both prune misses are the identical failure this
  candidate already called out by name ("only gives worked
  removal steps for 4 of ~12 adopt-by-need rows") — the fix
  pattern is not finding new bug classes, it is re-confirming the
  one this candidate proposes to close structurally.
- rationale: tick-by-tick `/iterate` fixes keep patching this
  block and it keeps re-breaking on the next fresh-eyes pass —
  the strongest possible evidence that the block's *structure*
  (copy array + placeholder sweep + prune, spread loosely across
  steps 4-7) is the defect, not any single line in it. Signal B's
  cluster pattern, now sextupled across six re-evidencing dates,
  and no longer critique-only. Six ticks have each shipped a
  correct, narrow fix for one row/directory/mechanism at a time
  — none has shipped the structural rewrite that would stop the
  next instance before it's found by hand.
- proposed scope: rewrite playbooks/new-project.md's step 4 (copy)
  and its placeholder-replace step so paths match the README's
  recommended sibling-clone layout; add the missing
  `templates/plan/phases/` copy line (and re-sweep placeholders
  over it); widen the grep scope to every directory step 4
  populates (`./scripts`, `./.env.example`, `./data`) once,
  structurally, instead of patching one omitted directory per
  sweep; add an explicit
  adopt-by-need prune sub-step right after the bulk copy that
  covers all ~12 of `templates/README.md`'s adopt-by-need rows,
  not just the 6 already worked one at a time (Surface/
  Structured-data/UGC-gated/`.claude/`/`scripts/bootstrap.mjs`);
  fold step 7's now-redundant deploy-check.mjs copy
  into step 4's bulk copy and reword step 7 to "wire the file
  already present"; clarify step 6 describes the target shape for
  phase 1's brief to produce, not something to run against an
  empty repo. Carries all current CRITIQUE rows in this cluster to
  Done in the same commit (leaves the pnpm/settings.json row to
  the sibling candidate below, and the two single-instance LOW
  rows — step 2's bearings.md placeholder mismatch,
  `<PROJECT_PKG_PREFIX>`'s worked example — as plain `/iterate`
  ticks; they don't share this cluster's root cause).
- estimated phases: 1
- conflicts: none — tightens an existing playbook, no template
  API change.

### [promoted 2026-08-23 → phase 20] [score 8.5] Cloud march ticks must not dispatch background/async agents
- proposed: 2026-07-17 (digest); re-evidenced 2026-08-02
  (expand pass 6)
- source signals: the 2026-07-17 03:04 UTC cloud tick (run
  `29551508864`) reached `/iterate`'s audit-refresh step, found
  `plan/AUDIT.md` >24h stale, and launched an async background
  subagent to run the A-G sweep instead of running it inline.
  The log shows it explicitly deciding to "wait for the audit
  agent to finish," then the GitHub Actions job's own
  `terminal_reason` flips to `completed` ~4 seconds later — no
  commit, no verify run, no trace of the subagent's output ever
  landing. The very next tick (07-17 08:45, run `29567537795`)
  hit the identical stale-audit branch but ran the sweep inline
  and shipped cleanly in ~6 minutes (commit `4ca0c36`), proving
  the sweep itself isn't the bottleneck — the async dispatch
  pattern is. 1 of 4 ticks in that 26h window was silently lost
  this way (full pulse in `plan/DIGEST.md` 2026-07-17). Signal E
  (platform drift), 2026-08-02: Claude Code's own Agent tool
  description, current as of this pass (confirmed both via the
  in-session tool schema and `code.claude.com/docs/en/whats-new`
  Week 27, June 29 - July 3 2026: "subagents run in the
  background by default so Claude keeps working while they
  run"), now states "Agents run in the background by default...
  Pass run_in_background: false to run an agent in the
  foreground." That changed the failure mode this candidate was
  written against: the original evidence was one tick explicitly
  requesting background mode, but the platform default has since
  flipped, so *any* `Agent(...)` call in a cloud tick that omits
  `run_in_background` now backgrounds itself — not just calls
  that opt in.
- rationale: a GitHub Actions job is a single-shot process —
  once the step (and the job) exits there is nothing left
  running to deliver a background agent's completion
  notification, so dispatching `Agent(..., run_in_background:
  true)`-style work inside a cloud march tick is a guaranteed
  no-op, not a performance win. `templates/.github/workflows/march.yml`
  runs the identical one-shot pattern, so every adopter's cloud
  loop carries the same latent trap. With backgrounding now the
  platform default rather than an opt-in, the omission case (no
  `run_in_background` param at all) is at least as likely to
  bite an unattended cloud tick as the explicit-`true` case this
  candidate was originally scored against — raising both
  likelihood and adopter-facing severity.
- proposed scope: add an explicit "cloud ticks run
  synchronously — every Agent call must pass
  `run_in_background: false` explicitly; the platform default is
  background as of mid-2026, so omitting the param is itself a
  background dispatch" line to the cloud-mode prompt block in
  `.github/workflows/march.yml` and its `templates/` mirror,
  plus a matching failure-mode entry in `.github/CLOUD_LOOP.md`
  ("a tick logs launching a background/async audit agent then
  exits clean with no commit" -> this root cause) and a note on
  `skills/iterate.md`'s audit-delegation step.
- estimated phases: 1 (doc/prompt-only, no template API change)
- conflicts: none.

### [ ] [score 4.5] Crash-alarm dedupe matches by generic title only, masking distinct failure causes behind one long-open issue
- proposed: 2026-09-20 (digest); re-evidenced 2026-09-21 (digest)
- source signals: today's march tick (run `35511786013`,
  2026-09-20T12:50 UTC) crashed with a genuinely new cause — the
  Claude Code Action returned `api_error_status: 403`,
  `api_error_code: oauth_not_allowed_for_organization`
  ("Your organization has disabled Claude subscription access
  for Claude Code"). `.github/workflows/march.yml`'s crash-alarm
  step (lines 182-189) searches only
  `in:title "Cloud march tick crashed" state:open`, found `#54`
  (filed 2026-09-07 for an unrelated cause — `oven-sh/setup-bun`
  hitting a transient 504 downloading its release asset) still
  open, and skipped filing: "An open 'Cloud march tick crashed'
  issue already exists — skipping dedupe." No issue anywhere
  names today's actual failure; it exists only in the raw Action
  run log. `templates/.github/workflows/march.yml` and
  `night.yml` carry the identical step and would repeat the same
  gap for any adopter. Re-evidenced 2026-09-21 (digest): the same
  window's remaining two march ticks that day (runs
  `35525362773`, 17:16 UTC, and `35540854118`, 22:10 UTC) also
  crashed — both `api_error_status: 429` (`error: rate_limit`,
  `terminal_reason: api_error`), a third distinct cause from the
  same day — and both hit the identical dedupe skip against `#54`
  (confirmed via each run's own log: "An open 'Cloud march tick
  crashed' issue already exists — skipping dedupe"). So in one
  24h window the alarm masked three separate causes (one 403
  org-access, two 429 rate-limits) behind a single 2-week-old
  issue about an unrelated Bun-download 504 — the failure mode
  this candidate describes isn't hypothetical or a one-off, it
  recurred twice more the same day it was first filed. Separately,
  the next morning's tick (07:36 UTC, run `35573760398`) triaged
  and closed an unrelated heartbeat alarm (`#60`, "march has
  flatlined") that it root-caused to these same transient 429s,
  confirming the rate-limit crashes were real and self-healing —
  but that triage pass closed the flatline symptom, not the
  crash-alarm's dedupe gap this candidate targets, which remains
  open and would mask the next distinct cause the same way.
- rationale: agents.md rule 6 ("blocked is loud") assumes a
  filed issue accurately describes what's blocking the loop.
  Title-only dedupe conflates any two crashes as long as one is
  already open, so the alarm degrades to "at most one open crash
  issue, ever" instead of one per distinct cause. `#54` has sat
  open 13 days — not itself a bug (its own `next` field says
  close if it doesn't recur, and nobody's watching to close it) —
  and is now inadvertently suppressing visibility into a new,
  still-unexplained org-level access failure that could recur and
  block every future march/night tick with no alarm firing. The
  next day's re-evidencing raises this from "could recur" to
  "recurred twice within hours, plus a third distinct cause the
  same day" — three masked causes in 24h is a materially stronger
  case for fixing this than the single-occurrence evidence this
  candidate was first filed against.
- proposed scope: key the dedupe off something cause-specific
  instead of the shared generic title — e.g. fold the
  `api_error_code` or failed-step name into the issue title
  (`Cloud march tick crashed: <code> <date>`) and search on that
  substring, or append a comment to the existing issue (rather
  than silently no-op) when the new run's cause differs from what
  the open issue records. Same fix needed in
  `templates/.github/workflows/march.yml` + `night.yml` (agents.md
  rule 7's `templates/` discipline).
- estimated phases: 1
- conflicts: none; complements phase 23's crash-alarm (score 7.8,
  already shipped to `templates/` but still blocked applying to
  nexus's own workflows per `[user-issue #40]`) rather than
  overlapping it.

### [ ] [score 3.5] pulse.mjs's candidate-pending count still includes the four `[promoted]`-tagged rows never relocated out of `## Pending`
- proposed: 2026-09-29 (digest)
- source signals: today's pulse read "29 pending, oldest 90d,"
  and this digest's own hand-count (per `skills/digest.md` §3
  step 2/4) put 22 of those over the 21-day silting threshold.
  But this file's `## Pending` section (lines 12-1025) actually
  contains only 25 genuine `### [ ]` rows — four of the 29
  `### ` headers `pulse.mjs` walks are `[promoted 2026-08-23 →
  phase N]` rows (phases 19/20/21/22) that the 2026-08-23
  `/oversight` note explicitly says stay "under Pending above
  with relabeled `[promoted …]` headers, so their evidence
  trails survive intact" — a deliberate choice, but
  `scripts/pulse.mjs`'s `countRows()` (`/^### /` — any header)
  and its `proposedDates` extraction (any `- proposed:` line in
  the section) don't distinguish `[ ]` from `[promoted …]`, so
  both the pending-count and the >21d/oldest aging numbers
  double-count already-shipped work as still-pending. This exact
  gap was already named as a known loose end in phase 30's own
  brief (`plan/phases/phase_30_candidate_aging_silt_guard.md`
  Non-goals: "Not fixing the pre-existing `[promoted]`-tag
  filing drift... inflating `pulse.mjs`'s mechanical count by
  4. Out of scope for this phase; already on record as a loose
  end, not a duplicate candidate") but has sat unfiled as an
  actual candidate for 37 days since — surfaced in past
  `plan/DIGEST.md` snapshots (overwritten nightly, so never
  durable) but never promoted into this queue until now.
- rationale: phase 30 built the "oversight needed: candidate
  queue silting" alarm specifically so a human doesn't have to
  notice queue rot by hand — but the alarm's own inputs are
  currently off by a consistent +4 on both the count and the
  >21d tally (25 real pending vs. 29 reported; 18 real >21d vs.
  22 reported), which could either cry wolf on a queue that's
  milder than reported, or — if the drift grows past four rows —
  mask real staleness the same way title-only crash-alarm
  dedupe does (see the score-4.5 candidate above). The true
  oldest-pending figure (2026-07-02, ~90d) happens to be
  unaffected since a genuine `[ ]` row shares that date, but the
  count itself is provably wrong today, not hypothetically.
  Cheap to fix, already root-caused, already scoped by phase
  30's own brief as a fair follow-up.
- proposed scope: teach `scripts/pulse.mjs`'s `pendingSection`
  consumers (`countRows()` and the `proposedDates` map/filter in
  the candidates block) to skip any header matching
  `/^### \[promoted/` — or, simpler, physically relocate the
  four `[promoted 2026-08-23 → phase 19/20/21/22]` rows from
  `## Pending` to `## Promoted` now (their evidence trails
  already live in the `## Promoted` section's 2026-08-23 summary
  note, so moving the full rows loses nothing) and add a one-line
  note to `skills/expand.md` or `skills/oversight.md` that
  promoted rows must relocate, not just relabel, going forward.
  Either half closes the gap; doing both is more robust.
- estimated phases: 1
- conflicts: none.

### [ ] [score 4.8] heartbeat's cadence check counts a quota-gate-skipped tick as a successful run, so a stuck gate stays invisible
- proposed: 2026-11-05 (digest)
- kind: guard
- source signals: `plan/DIGEST.md` had not been rewritten since
  2026-10-25, 11 days of silence, yet `gh run list --workflow
  night` shows every intervening run (2026-10-26 through
  2026-11-04, 10 ticks) concluding `success`. `gh run view
  41883701561 --json jobs` (2026-11-04's tick) shows why: "Run
  /digest (night shift)" itself reports `skipped`, but every
  other step (including the final "Complete job") reports
  `success`, so the workflow's own overall conclusion is
  `success` with zero real work done underneath it. Root cause,
  fixed today in `cc63b38` (this window, see `While you were
  out`): the quota gate (`templates/scripts/cloud/quota.mjs
  decide()`) held a cached `allowed_warning` reading whose
  `resetsAt` had long passed, and a skipped tick never reaches
  the model to refresh that cache — a self-sustaining skip loop
  only today's fix broke. `.github/workflows/heartbeat.yml`'s
  `check_cadence()` (lines 159-194) is the gate built
  specifically to alarm on exactly this shape of failure ("No
  successful $wf tick in Nh"), but it measures `gh run list
  --workflow "$wf" --status success -L 1 --json updatedAt` — the
  *workflow's* overall conclusion, which a quota-gate skip never
  flips to failure. The timer reset every single day for 11
  days straight while the alarm it feeds stayed cold. The same
  `--status success` filter backs march's own `check_cadence`
  call and the realized-cadence check two steps down, so march
  carries the identical blind spot if its own quota gate ever
  gets stuck the same way (observed only on night this time —
  march's ticks kept running through the window per `gh run
  list --workflow march`).
- rationale: this is the loop's own watchdog failing silently
  at the one job it exists to do — a false "success" signal is
  worse than no signal, because it actively suppresses the
  alarm that would otherwise have caught an 11-day production
  gap in under 2 days (night's own 48h threshold). Today's
  `cc63b38` fixes the specific staleness bug that caused this
  one incident, but the detection gap itself is untouched: the
  next distinct way a scheduled tick's model step gets skipped
  (a different gate, a future knob) will be just as invisible.
- proposed scope: `check_cadence()` in
  `.github/workflows/heartbeat.yml` (+ its
  `templates/.github/workflows/heartbeat.yml` twin, agents.md
  rule 7) stops trusting the bare workflow conclusion and
  instead resolves the newest run's own named model step (`Run
  /digest (night shift)` for night, the dispatcher step for
  march) via `gh run view --json jobs`, counting a tick as
  "successful" only when that step's own conclusion is
  `success`, not `skipped`. Needs a human call on exactly how to
  key the step name per workflow without hardcoding something
  that breaks on a future step rename, and whether to special-
  case "no cached quota reading yet" so a brand-new adopter
  repo doesn't alarm on day one. Touches `.github/workflows/*.yml`,
  so per `agents.md` "Operational secrets" it lands from a
  local/human session, not a cloud tick.
- estimated chunks: 1
- conflicts: none — complements, doesn't overlap, `cc63b38`
  (the staleness fix already shipped) and the pending "[score
  7.0] heartbeat's wedged-run canceller" row above (different
  step, different failure shape).

### [ ] [score 6.0] early reasoning drift hides until recovery is no longer possible
- proposed: 2026-11-24 (research)
- source signals: field (2026-11-24): a large study of coding-agent runs found failures are mostly early reasoning mistakes, not final syntax errors, and they stay invisible until it is too late to recover; the paper argues for checkpoin…
- rationale: a loop that only validates once, at the very end of a build, cannot tell where in the run a builder's reasoning first went wrong; an earlier checkpoint would catch a drifting build while undoing it is still cheap.
- proposed scope: whether the chunk-build loop should check a builder's intermediate state partway through a chunk, not only run one gate after the diff is already written
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-24

### [ ] [score 6.0] capping retries against a failing check before escalating
- proposed: 2026-11-24 (research)
- source signals: field (2026-11-24): guidance for agents with write access and no guardrails recommends a small retry cap, around three attempts, against a failing check before stopping and handing the failure to a person instead of loo…
- rationale: a builder that keeps retrying the same gate with no cap can burn a tick's whole budget on one failing chunk, or worse, loop toward a desperate edit; a stated cap with a clear escalation path (a blocked note, a needs-user row) bounds that.
- proposed scope: whether the chunk-build skill's builder dispatch states a retry limit against the gate before it escalates, rather than leaving the number open-ended
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-24

### [ ] [score 6.0] Pick's stated order and skip rules go unverified against what order.mjs would compute
- proposed: 2026-11-25 (spec 75.3, loop-honesty audit)
- source signals: concepts/loop-honesty.md's Pick row names
  two trust cells of the same shape. Self-approval: "the
  next chunk is the first listed whose `needs` are all
  done," picked in Asap → priority → table order; nothing
  outside confirms the order was actually followed. Spec
  gaming: the lead applies its own skip rules (Held lane,
  `plan only`, claimed-by-another) to itself; "nothing
  catches a lead that quietly favors the easy chunk." Both
  read as hard to mechanize only because nothing calls the
  mechanism that already computes the answer:
  `scripts/plan/order.mjs`'s `simulate()`/`render()` plays
  the identical Asap → priority → table walk forward,
  skipping Held/`plan only`/claimed, to produce a next-up
  list — skills/next.md Step 1 already shells out to it, but
  only for the `needs secret` case, never to check the pick
  itself. `/next peek` even states "why it beat the rest" in
  prose with nothing checking that prose against the order
  order.mjs would print.
- rationale: the check this needs already exists in the repo
  and already runs in this exact step for an unrelated
  reason; wiring it to the pick closes two trust cells at
  once for the cost of one script call — the same shape as
  75.2's mirror-not-closed fix, an existing mechanism not yet
  pointed at where it mattered.
- proposed scope: a `check` mode on
  `scripts/plan/order.mjs` (or a flag on `render`) that
  recomputes the next-up list and, given a no-argument pick,
  exits non-zero when the claimed id isn't first on it,
  naming what was; skills/next.md Step 1 runs it right
  before `claims.mjs claim` when the pick came from free
  text, not an explicit argument (an explicit argument is
  already its own override per Step 1's own ordering rule).
- estimated chunks: 1
- conflicts: none.

### [ ] [score 7.0] claims.mjs claim() accepts a chunk whose needs aren't done, caught only at gate time
- proposed: 2026-11-25 (spec 75.3, loop-honesty audit)
- source signals: concepts/loop-honesty.md names two trust
  cells pointing at one fact. Pick/Misreported outcomes:
  "the stated id / A-IDs aren't cross-checked against the
  spec until gate time." Claim/Spec gaming: "`claims.mjs
  claim()` checks ownership conflicts only, never whether
  `needs` are actually satisfied." Both are true because
  `scripts/plan/order.mjs`'s `statusOf()` already classifies
  a chunk `ready` / `held` / `needs <id>` / `claimed <who>`,
  and skills/next.md Step 4.1.2 already calls `node
  scripts/plan/order.mjs status <id>` — but only after the
  chunk is fully built and gated once. A lead that claims a
  chunk on a stale or wrong read of `needs` burns a whole
  build before that check ever fires.
- rationale: no new logic is needed, only an earlier call to
  logic that already exists and is already trusted
  (`next/land.md` cites it as the live-status source of
  truth). Moving the check to claim time turns a wasted
  build into a refused claim, the cheapest possible place to
  catch it.
- proposed scope: `scripts/claims.mjs`'s `claim()` (or
  `claims-codec.mjs`'s `idsProblem()`) calls
  `scripts/plan/order.mjs`'s `statusOf()` for each id and
  refuses any id that doesn't read back `ready`, down the
  same "Refused: pick again" path skills/next.md Step 1
  already documents for ownership conflicts; the Step 1 line
  notes the refusal now also covers unmet `needs`, not
  ownership alone.
- estimated chunks: 1
- conflicts: sequence after the order.mjs-check candidate
  above if both land close together — same file, adjacent
  call sites.

### [ ] [score 5.5] A close's claimed file-and-test per A-ID is never written anywhere the gate can check it
- proposed: 2026-11-25 (spec 75.3, loop-honesty audit)
- source signals: concepts/loop-honesty.md's Build row: the
  builder's "Return" summary — "each A-ID with the file and
  test that meets it" — is taken at its word, checked only
  by the same lead's own diff re-read; that summary is prose
  in a chat reply, never committed anywhere a script could
  later check it. The Close row's `says:` cell is the one
  piece of the same claim that is committed, and it is
  checked for presence only: `scripts/plan/pending.mjs:76`,
  `if (meta.close && !meta.says) throw ...` — non-empty is
  the whole rule. Neither cell can be checked today because
  there is nothing durable to check.
- rationale: a full truth check needs a second reader (the
  doc's own stated limit), but a narrower, mechanical check
  is real once the claim is written down: whether a named
  file actually exists and was touched by the close's own
  commit range. 75.2's mirror-not-closed rule is the same
  shape — matching a textual claim against the diff, not
  judging intent.
- proposed scope: an optional `tests:` field on
  `plan/pending/<id>.md` (`A<n>: <file>#<test name>`, one
  per closed A-ID), parsed by `scripts/plan/pending.mjs`
  alongside `says:`; the `chunks` leg
  (`scripts/plan-check.mjs`) fails loud when a listed file
  doesn't exist, doesn't contain the named test, or wasn't
  touched in the close's `commits:` range. `next/land.md` §2
  gains the one-line instruction to fill it from the
  builder's own Return summary, so the claim finally has
  somewhere to live.
- estimated chunks: 1
- conflicts: none.

### [ ] [score 6.5] Onboarding Welcome's mobile screen keeps shedding one ui-comprehension finding per patch instead of closing the class
- proposed: 2026-11-25 (expand)
- filed score: 6.0
- kind: product
- source signals: signal F (product telemetry, via
  `plan/CRITIQUE.md` pass 38's walk rows, `walk-44909096461`) —
  three pending findings against the same mobile Welcome
  screen at once: a [HIGH] row where `.ob { overflow: hidden }`
  (`packages/cli/src/styles/nexus.css:779,1304`) clips the
  footer's local-only trust line off-screen with no scroll; a
  [MED] row where the mobile stepper collapses to a bare "1 of
  8" with every step name hidden
  (`nexus.css:901-917`); and a [MED] row where the desktop
  stepper's step names (`packages/cli/src/ui/steps.js:9-16`)
  carry no `title`/hover hint. This is the same screen a
  rejected 2026-11-18 candidate already named once (Welcome
  headline + Stepper + Oversight filter row, all "fixed ad
  hoc, no spec needed") — and the mobile stepper's own fix from
  that round (`da4d724`'s `.stp-count` collapse) is what
  directly produced this pass's "every step name hidden"
  finding, the second time a patch on this screen has traded
  one visibility gap for another instead of closing it.
- rationale: three independent comprehension gaps on one
  screen, discovered in one walk pass, after two prior rounds
  of one-off CSS patches on the identical screen (one build
  cycle already closed, one new regression it caused) — the
  pattern read as the same shape agents.md calls out for
  playbooks/new-project.md's step-4 block: ad hoc fixes keep
  the symptom count flat while moving which symptom shows.
  Adopter-facing (the first screen a stranger meets on a
  phone), cheap to scope (CSS/JSX only, no template API
  surface).
- proposed scope: one structural pass over
  `packages/cli/src/screens/onboarding/Welcome.jsx` and the
  `.ob`/`.stepper` rules in `packages/cli/src/styles/nexus.css`
  (mirrored into `packages/cli/design/handoff/nexus.css` per
  its own contract): let the footer's trust line stay reachable
  on mobile (a bounded scroll region instead of `overflow:
  hidden`, or a shorter `.ob-grid`) and give the mobile stepper
  a step name alongside its position instead of a bare count;
  add a `title`/hint per step (`packages/cli/src/ui/steps.js`)
  for both viewports so the desktop jargon finding closes in
  the same commit. Closes all three current CRITIQUE rows
  together.
- estimated chunks: 1
- conflicts: none known — CSS/JSX only; distinct from the
  2026-11-18 rejected row (that row's own fixes produced two of
  these three new findings, not a re-evidence of it).
- re-evidence:
  - 2026-11-26 · F a01871a · independent, +0.5 · three more ad-hoc single-screen patches landed since filing (a01871a stepper next-step label, ec03e70 desktop hover hint, 3962535 footer scroll fix that itself red-ran cli-ci on 45687001768) — each closed one of the row's three cited findings separately rather than the one structural pass proposed, the exact churn pattern repeating

### [ ] [score 5.5] `spec-close` fired at the chunk commit, not the spec's last chunk — issue #133 stuck open though spec 76 shipped hours ago
- proposed: 2026-11-25 (digest)
- kind: guard
- source signals: `gh issue view 133` shows the spec-76 mirror
  still `OPEN`, carrying one comment ("Spec 76 shipped in
  f7c64b3. … _The autonomous loop closes this issue via the
  commit's `Closes #N` trailer; no manual close is
  required._") posted 2026-11-25T08:49:10Z — 10 seconds after
  `f7c64b3` landed. But `f7c64b3` is `plan: chunk spec 76`
  (08:49:00Z; body: "No build this tick: chunking is the whole
  unit of work"), not a build commit, and its body carries
  `Mirror: #133`, never a `Closes` trailer. Spec 76's real
  chunks landed after: 76.1 at 09:00-09:02, 76.2 at 09:13
  (`git log f7c64b3..8262de2`); neither commit range carries a
  `Closes #133`/`Fixes #133`/`Resolves #133` trailer (only
  `Closes A1`/`Closes A3`, the plan Acceptance IDs). The
  comment body matches `buildMirrorShippedCommentBody()`
  (`templates/scripts/loop-issue.mjs`), i.e. `spec-close` was
  invoked with `--commit f7c64b3` right after chunking, not
  after 76.2 (`skills/ship-a-chunk.md` Step 8: `spec-close` +
  the `Closes #<mirror>` trailer belong on "the spec's last
  chunk"). Nothing enforces that ordering — `spec-close` posts
  unconditionally on whatever commit it's handed.
- rationale: the comment already told the public timeline the
  spec shipped, and promised the issue would self-close, hours
  before the work existed; the trailer that was supposed to
  make that true never got written because the chunking
  commit, not 76.2, was the one in hand. The issue is now
  wrong forever (reopening and re-closing it right would need
  the `spec-close` re-run with 76.2's sha, which nothing
  prompts). Same trust-cell shape as the already-fixed
  `mirror-not-closed` guard (chunk 75.2), but that guard only
  matches the "Mirrored as #N" commit-message pattern — it
  never sees a `loop-issue.mjs spec-close` call made out of
  band, with the wrong sha, days before the real close.
- proposed scope: `cmdMirrorClose()` in
  `templates/scripts/loop-issue.mjs` (+ its `plugin/vendor`
  twin, `agents.md` rule 7) reads the spec's own `plan/<NN>-
  *.md` Measure line before posting and refuses (best-effort:
  warn, skip the comment, exit 0) when it still reads open
  chunks for that spec id — the same "check against data
  that's already written down" shape as the `claimed
  file-and-test` and `Pick order` rows above. `skills/ship-a-
  chunk.md` Step 8 gains one line naming the failure this
  guards against, citing #133 as the precedent. A human call
  on whether to also auto-reopen-and-recomment a mirror caught
  mid-build this way, or just block the premature close and
  let the last chunk's own `spec-close` call carry it;
  #133 itself needs a manual `gh issue close` either way — this
  candidate only stops the next one.
- estimated chunks: 1
- conflicts: none.

### [ ] [score 6.0] Short loops with an explicit stop condition and a trustworthy check outperform long autonomous ones
- proposed: 2026-11-27 (research)
- source signals: field (2026-11-27): Practitioner guides on running coding agents in a loop converge on the same shape: bound the loop to a small, reversible unit of work with a clear definition of done and a check the loop itself trust…
- rationale: A second, independent line of field guidance for the same shape this kit already uses (one chunk per tick, a hard gate before every commit) — worth a candidate so the tick-length and single-chunk bound are stated as a deliberate design choice, not just the current default, and checked against drift over very long ticks.
- proposed scope: whether march's own per-tick scope (one chunk, budget-bounded, gate before commit) should be named explicitly as the drift-bound, and whether a stall or runaway tick needs its own named stop condition beyond the existing budget check
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-27

## Promoted

(moves to the build plan via /oversight)

### [promoted 2026-11-28 → spec 79] [score 8.3] Heartbeat's realized-cadence alarm re-fires for a cron tradeoff the owner already explicitly accepted, now 10 times
- proposed: 2026-11-27 (expand)
- filed score: 6.8
- kind: guard
- source signals: signal C (triage pattern), ten-deep: `plan/AUDIT.md`'s
  Done log carries `[user-issue #91]` (2026-11-05), `#96`
  (2026-11-21), `#127` (2026-11-23), `#129`/`#130`/`#131`
  (2026-11-24), `#132` (2026-11-25), `#137`/`#139` (2026-11-26) and
  `#143` (2026-11-27) — all titled "heartbeat: march realized
  cadence below 40%", all closed with the identical diagnosis:
  realized delivery genuinely sits under 40% (29-38% each time),
  but no new lever exists because the owner's own cron
  (`17 */3 * * *`, chosen 2026-11-21 with #96's close) was picked
  with full knowledge "chained ticks, not the cron, carry the
  throughput" — the alarm just measures raw cron-schedule-event
  delivery, which the design deliberately doesn't rely on. Every
  closure since #96 has re-stated the same precedent rather than
  changing anything, because `.github/workflows/heartbeat.yml`'s
  "Alarm if march's realized cadence is below 40%" step
  (`templates/scripts/cloud/cadence.mjs realized`) dedupes only on
  an *open* issue of that exact title — once triage closes one,
  the next 72h window under the floor (near-guaranteed at this
  cron's own delivery rate) opens a fresh one. `templates/.github/
  workflows/heartbeat.yml` ships the identical check to every
  adopter's cloud loop, so any adopter who picks a cron GitHub
  throttles past 40% inherits the same permanent false-positive
  loop, not just nexus.
- rationale: ten identical round-trips (file, triage, cite the
  same precedent, close) is the strongest possible evidence the
  alarm is checking the wrong thing, not that the loop is
  unhealthy — agents.md rule 6 ("blocked is loud") only earns its
  keep when a loud alarm is still informative; this one has
  degraded to a scheduled no-op that costs one triage dispatch and
  commit every time it fires. Adopter-facing (the identical
  template ships to every cloud-loop adopter) and cheap to scope
  (one measurement swap or one suppression marker, not a redesign).
- proposed scope: either change what `check_cadence`/`cadence.mjs
  realized` measures — actual tick throughput (chained dispatches
  included, matching the design's own stated invariant) instead of
  raw cron-schedule-event delivery — or add a standing
  "acknowledged tradeoff" suppression (a `since:`/`until:`/
  `max_age:` lock, the same locks-time-out shape `concepts/
  plan-shape.md` already defines) that `.github/workflows/
  heartbeat.yml`'s realized-cadence step reads before filing, so
  closing #96's successor once more doesn't just restart the same
  72h countdown. Touches `.github/workflows/heartbeat.yml` +
  `templates/.github/workflows/heartbeat.yml` (agents.md rule 7)
  and possibly `templates/scripts/cloud/cadence.mjs`.
- estimated chunks: 1
- conflicts: none — complements, doesn't overlap, the pending
  "[score 4.8] heartbeat's cadence check counts a quota-gate-
  skipped tick as a successful run" candidate (that one targets a
  false *success* reading; this one targets a true-but-already-
  answered alarm that keeps re-opening) and the pending "[score
  4.5] Crash-alarm dedupe matches by generic title only" candidate
  (that one is about masking *distinct* causes; this is one cause,
  correctly matched, re-firing on an unchanged answer).
- re-evidence:
  - 2026-11-28 · C #144 · independent, +0.5 · 12th identical closure (#144, 2026-11-27T12:15), same owner precedent restated, no lever changed
  - 2026-11-28 · C #145 · independent, +0.5 · 13th identical closure (#145, 2026-11-27T21:19), same owner precedent restated, no lever changed
  - 2026-11-28 · C #149 · independent, +0.5 · 14th identical closure (#149, 2026-11-28T07:53), same owner precedent restated, no lever changed
- promoted: 2026-11-28, auto (expand pass 32), veto #151

### [promoted 2026-11-12 → spec 65] [score 7.8] Workflow-scope-blocked lane: stop re-discovering the App-token-overrides-PAT gap per phase
- proposed: 2026-08-31
- source signals: three independent AUDIT rows share one root
  cause — phase 20 (`[user-issue #35]`, 2026-08-23), the
  phase-23 patch nexus's own march.yml/night.yml still needs
  applied by hand (`[user-issue #40]`), and phase 32
  (`[user-issue #49]`, 2026-08-30) all built and verified clean
  in a cloud tick, then had `git push` rejected on
  `.github/workflows/*.yml` with "refusing to allow a GitHub
  App to create or update workflow ... without `workflows`
  permission" — even though the checkout step and the `Run
  /march` step both pass `secrets.ACTIONS_PAT`. Each occurrence
  discovered the same fact fresh: the push that actually
  authenticates is the Claude Code Action's own GitHub App
  installation token (`gh auth status` mid-tick shows
  `claude[bot]` via a `ghs_...` token, not the PAT), not
  `ACTIONS_PAT` — isolated because non-workflow-file pushes in
  the very same runs succeed. `[user-issue #35]`'s own `next`
  field already names the two live hypotheses (Action overwrites
  the checkout-configured git credential before the agent's turn
  starts, or `ACTIONS_PAT` doesn't actually carry `workflows`
  scope despite the re-mint) but no tick has been able to test
  either, since every cloud tick reproduces the identical
  credential wiring.
- rationale: this has cost three built-and-discarded cloud
  ticks (each ran the phase to completion, verified green, then
  threw the diff away per agents.md rule 1) and will keep
  costing one per future phase that touches
  `.github/workflows/*.yml` — for nexus and for any adopter who
  copies the cloud-loop template and later edits their own
  `march.yml`/`heartbeat.yml`. A one-time fix (or a formalized
  routing convention) is cheaper than the recurring waste.
- proposed scope: a local/human session (normal repo-write
  creds, not the Action's App token) tests whether an explicit
  `git remote set-url origin
  https://x-access-token:${ACTIONS_PAT}@github.com/<org>/<repo>.git`
  (or `http.extraheader`) immediately before the push step
  forces the PAT's credential over the Action's, resolving
  hypothesis (a); separately confirms `ACTIONS_PAT`'s actual
  scope grants in GitHub's token settings UI (hypothesis (b)).
  If (a) fixes it: land the explicit remote-credential step in
  `.github/workflows/march.yml` + `templates/.github/workflows/march.yml`
  (and `heartbeat.yml` if it ever pushes). If neither
  hypothesis yields a fix: formalize the fallback that's
  already happening ad hoc — `.github/CLOUD_LOOP.md` gets a
  "workflow-touching phases" note (build + verify still run in
  the cloud tick, but the push is skipped in favor of a single
  dedicated issue for `/oversight` to apply), and
  `skills/ship-a-phase.md` checks the diff for
  `.github/workflows/*.yml` before attempting the push so a
  future tick fails fast instead of discovering the rejection
  after a full build.
  Narrowed at promotion: the fallback half of this scope has
  already shipped since this candidate was filed —
  `skills/ship-a-chunk.md` §6 item 5 holds a workflow-touching
  chunk for a local session before building, and
  `.github/CLOUD_LOOP.md`'s troubleshooting section documents
  the symptom. Spec 65 scopes to the half that's still open:
  actually testing hypotheses (a) and (b), landing the fix (and
  retiring the now-redundant hold) if one works, or recording
  the negative result if neither does.
- estimated phases: 1
- conflicts: none — orthogonal to other pending candidates;
  closes `[user-issue #35]`, `[user-issue #40]`, and
  `[user-issue #49]` together if the fix lands, or gives all
  three a documented standing resolution path if it doesn't.
- promoted: 2026-11-12, auto (motion-stall react, #92), veto #104

### [promoted 2026-11-07 → spec 62] [score 7.9] Handshake runbook profile for setup/
- proposed: 2026-07-03
- source signals: a sibling adopter's runbooks follow a proven handshake
  the kit's setup/ paradigm doesn't capture: "human dashboard
  steps (~N min) -> drop these exact keys into the env file ->
  say 'X is in' -> what the agent wires after the drop".
- rationale: turns every external service into a
  fill-in-the-blanks credential handoff; keys arrive in files,
  not chat. The "THE STEP THAT CAN BREAK <X>" destructive-step
  callout convention rides along.
- proposed scope: `templates/setup/NN_service.handshake.md`
  (four fixed sections; fenced env-block naming exact keys +
  exact target file + resume signal); "two runbook profiles"
  chooser in external-services.md (agent can do >80% via CLI
  once it has a token -> handshake); profile column in
  00_files.md legend.
- estimated phases: 1
- conflicts: none — second layer of the two-ring secrets story.
- promoted: 2026-11-07, auto (motion-stall react, #92), veto #98

### [promoted 2026-11-05 → spec 60] [score 8.3] README above-the-fold conversion pass
- proposed: 2026-07-03
- source signals: conversion happens in the first screenful;
  today the pitch is stated twice, the paste is 60 lines, and
  the workspace shape has no front door. Full restructure
  outline captured 2026-07-03 (ideation session).
- rationale: hook -> proof -> qualify -> convert -> deepen ->
  trust -> rules; target ~350 lines from ~690. The march.yml
  badge whose green is produced by the loop it sells is proof
  no competitor can hand-copy.
- proposed scope: README-only editing session: kill the
  blockquote echo, merge the three qualification sections into
  one gate above the doors, collapse the two TL;DRs + mermaid
  into a three-door section, replace eight playbook blurbs with
  a router table (you have -> do this -> time), ouroboros proof
  strip up top, date-stamped adoption-receipt diffstat in a
  details block. Repoint the verify tree leg in the same commit.
- estimated phases: 1
- conflicts: depends on prompts/ landing first (the doors paste
  five lines, not sixty) — shipped, phase 21 (`ad8ae3c`).
- promoted: 2026-11-05, auto (pass 23), veto #94

### [promoted 2026-11-05 → spec 61] [score 8.2] Versioned releases + plan/nexus.lock + upgrade story
- proposed: 2026-07-03
- source signals: adopters copy from a moving main and can never
  diff what changed; every packaging doorway needs something
  stable to pin against.
- rationale: "copy once, drift forever" becomes "pin, then
  upgrade deliberately" — dependency semantics with nothing but
  git tags and one JSON lock (kitVersion, kitCommit, per-file
  hashAtCopy). Three-way merge separates "stale, cleanly
  bumped" from "customized, needs eyes".
- proposed scope: KIT_VERSION + CHANGELOG.md keyed by template
  path; `scripts/kit-manifest.mjs` (hermetic sha256 walk);
  lock-writing step in prompts/adopt.md; `playbooks/upgrade.md`
  (git merge-file three-way; [needs-user-call] AUDIT rows for
  conflicted files; pre-lock fallback via re-hash against
  historical tags); verify legs for version/CHANGELOG sync.
  Narrowed at promotion: `plan/nexus.lock`, the `v1.0.0`/
  `v2.0.0` tags and `packages/cli/server/sync.mjs`'s three-way
  merge already shipped most of this; spec 61 scopes to the one
  gap with no shipped equivalent, a `CHANGELOG.md` keyed by
  template path.
- estimated phases: 2
- conflicts: prompts/ should land first (the lock step lives
  there); permanent CHANGELOG discipline cost — worth it.
- promoted: 2026-11-05, auto (pass 23), veto #95

> 2026-08-23 (/oversight): four standing candidates promoted —
> step-4 rewrite (9.0 → phase 19), cloud sync-agents rule
> (8.5 → phase 20), prompts/ (8.6 → phase 21), workspace path
> (8.8 → phase 22). Their full briefs stay in place under
> Pending above with relabeled `[promoted …]` headers, so their
> evidence trails survive intact. The ten candidates below were
> authored in the same session at the user's direction
> ("come up with 10 more lightweight candidates that will add
> some awesome DX and/or automation, and promote these for
> draining") and promoted on arrival as phases 23–32.

### [promoted 2026-08-23 → phase 23] [score 7.8] Cloud tick failure auto-alarm
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: the 2026-08-02 → 2026-08-23 outage — every
  scheduled march/night tick for 21 days (~84 runs) failed at
  checkout on an expired `ACTIONS_PAT` (401), and nothing filed
  an issue. The heartbeat's flatline alarm was blind to it
  (`--status completed` counts failed runs — fixed this same
  session) and no other watcher exists for failure streaks.
- rationale: agents.md rule 6 (blocked is loud) must apply to
  the loop's own infrastructure. The default `GITHUB_TOKEN`
  survives PAT death and can still file issues.
- proposed scope: an `if: failure()` step in `march.yml` and
  `night.yml` (nexus + `templates/` mirrors) that files a
  deduped "cloud tick failing" issue via `GITHUB_TOKEN`, naming
  the failed step and linking the run. (Both halves shippable
  by the loop since the 2026-08-23 PAT re-scope added
  Workflows read/write.)
- estimated phases: 1
- conflicts: complements the heartbeat fix and the Cloud-Run
  trailer candidate (6.5); overlaps neither.

### [promoted 2026-08-23 → phase 24] [score 7.5] scripts/pulse.mjs — the offline instrument panel
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: this oversight session hand-assembled the
  same panel (queue counts, last-tick age, blocked rows,
  candidate silt) from six files and two `gh` calls; `/digest`
  re-derives it nightly in prose; `/oversight audit` re-derives
  it again.
- rationale: one hermetic script, three consumers — digest,
  oversight, and a human at a terminal — and the numbers stop
  drifting between hand-counts.
- proposed scope: `scripts/pulse.mjs` (zero-dependency: queue
  Pending counts, last-commit age, build-plan pending/blocked
  rows, candidate count + oldest-pending age; reads git
  locally, never the network); `/digest` and `/oversight` cite
  it; `templates/scripts/` twin with the same contract.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 25] [score 7.7] scripts/adopt-dryrun.mjs — mechanize the dry-run adoption walk
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: the step-4 cluster (the 9.0 candidate, now
  phase 19) re-broke across eight re-evidencing dates because
  only fresh-eyes critique passes ever exercise the documented
  copy + placeholder-sweep path — the gate never does.
- rationale: turn the recurring critique cluster into a
  mechanical check: if the documented adoption commands break,
  a script fails before a stranger ever hits it.
- proposed scope: `scripts/adopt-dryrun.mjs` — executes the
  playbook's step-4 copy array + placeholder sweep into a temp
  dir, asserts zero unresolved `<...>` tokens and the expected
  file manifest, cleans up; opt-in verify leg (env-gated so the
  default gate stays fast); `skills/critique.md` points its
  mechanical half at the script and spends its passes on
  comprehension findings instead.
- estimated phases: 1
- conflicts: lands best after phase 19 settles the block it
  verifies; sequence 19 first.

### [promoted 2026-08-23 → phase 26] [score 7.0] Issue templates keyed to triage routes
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: `/triage` classifies unlabeled issues into a
  fixed routing vocabulary, but reporters get a blank textarea
  — every route is re-derived from freeform prose.
- rationale: structured forms make triage's classification
  step cheaper and dedupe obvious (a form names its route);
  reporters get DX, the loop gets cleaner input.
- proposed scope: `.github/ISSUE_TEMPLATE/*.yml` forms mapped
  to triage's routes (bug/friction/idea/needs-user), a
  config.yml disabling blank issues softly, `templates/`
  mirror, and a note in `skills/triage.md` + its template twin
  that pre-labeled forms short-circuit classification.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 27] [score 6.8] scripts/new-skill.mjs — skill scaffolder
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: `concepts/skills-anatomy.md` documents the
  canonical skill shape, but every new skill file (15 shipped
  in `templates/skills/` so far) is hand-copied from a sibling
  and hand-renamed — the anatomy drift the gate's anatomy leg
  keeps catching starts here.
- rationale: scaffold from the anatomy, and new skills are
  born gate-green instead of converging on it.
- proposed scope: `scripts/new-skill.mjs <name> "<purpose>"` —
  emits `skills/<name>.md` (or `templates/skills/` with a
  flag) pre-filled with the canonical sections + a matching
  `.claude/commands/<name>.md` pointer stub; refuses names
  that collide; `templates/scripts/` twin.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 28] [score 7.2] Commit-verb vocabulary lint in the guard hook
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: the repo's whole history uses a stable verb
  vocabulary (`docs:`, `fix:`, `critique:`, `digest:`,
  `expand:`, `triage:`, `oversight:`, `phase N:` …) and the
  weighted ceiling (phase 17) *counts* by verb — but nothing
  enforces the prefix, so one misspelled verb silently
  miscounts the ceiling and pollutes the velocity read.
- rationale: the vocabulary is load-bearing (ceiling weights,
  digest pulse, oversight verb-mix) — make it mechanical.
- proposed scope: a `RULES` entry in `.claude/hooks/guard.mjs`
  (which already inspects `git commit` commands) rejecting
  commit messages whose first token isn't in the documented
  verb set; the set itself documented in `plan/bearings.md`;
  self-test cases; `templates/claude/hooks/` twin.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 29] [score 7.4] Dual-shell parity lint leg for playbooks
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: `playbooks/windows-notes.md` promises every
  playbook code block works as written on both shells, yet
  three separate bash-only scope/portability bugs shipped
  (`sed -i` on BSD, unguarded `./data` grep, PowerShell twin
  drifting from its bash sibling) and were each caught by
  hand, one critique pass at a time.
- rationale: the promise is checkable: every bash fence in a
  playbook either has an adjacent PowerShell twin or carries
  an explicit posix-only marker.
- proposed scope: a `dualshell` leg in `scripts/verify.mjs`
  walking `playbooks/*.md` code fences, pairing bash blocks
  with their PowerShell siblings, failing on unpaired blocks
  unless annotated; annotate the legitimate posix-only blocks
  in the same commit (the gate-teaching rule).
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 30] [score 6.9] Candidate-aging silt guard in digest/expand
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: 20 candidates accumulated over 7 weeks with
  zero promotions; the top scorer (9.0) was re-evidenced eight
  times while waiting. Nothing surfaces "the queue is silting"
  until a human happens to run `/oversight`.
- rationale: `skills/digest.md` already names "starved queue"
  as a tuning trigger — give it the number that trips it.
- proposed scope: `/digest`'s pulse gains a standing line
  (count of candidates pending >21 days + the oldest's age)
  and flags "oversight needed: candidate queue silting" past a
  threshold; `/expand` stamps a `last re-evidenced` date it
  already tracks informally; doc-only edits to
  `skills/digest.md`, `skills/expand.md`, and their template
  twins.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 31] [score 6.7] scripts/install-hooks.mjs — opt-in pre-commit gate
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: the verify gate binds the *loop* (skills run
  it foreground before commit), but a human editing outside
  the loop — exactly this oversight session's fix commits —
  relies on remembering to run it.
- rationale: one command arms the same gate for hand commits;
  opt-in keeps clone-and-read adopters unaffected.
- proposed scope: `scripts/install-hooks.mjs` writing a
  `.git/hooks/pre-commit` that runs `node scripts/verify.mjs`
  (and nothing else — no network, no formatting); an
  uninstall flag; a one-line mention in README's "Files
  added" + `templates/scripts/` twin wired to the adopter's
  gate command.
- estimated phases: 1
- conflicts: none.

### [promoted 2026-08-23 → phase 32] [score 7.1] Scheduled-workflow auto-disable watch in heartbeat
- proposed: 2026-08-23 (oversight, user-directed)
- source signals: GitHub silently disables cron workflows
  after 60 days without repo activity — a hazard the Aug 2–23
  outage walked toward (21 days of zero commits) and the kit
  never mentions. The heartbeat also only measures `march`:
  `night.yml` failed for the same 21 days with no watcher at
  all, and a schedule that GitHub has *disabled* produces no
  runs for the flatline check to even measure.
- rationale: the watchdog should watch armed-ness, not just
  run recency, and should cover every scheduled workflow.
- proposed scope: heartbeat gains a leg that checks
  `gh workflow list` for `disabled_inactivity`/manually
  disabled march/night/heartbeat and widens the flatline
  check to `night`; alarm via the existing deduped-issue
  pattern; document the 60-day rule in
  `playbooks/cloud-loop.md` + `templates/.github/CLOUD_LOOP.md`.
  (Both halves shippable by the loop since the 2026-08-23 PAT
  re-scope added Workflows read/write.)
- estimated phases: 1
- conflicts: rides the heartbeat fix landed this session.

### [promoted 2026-11-16 → spec 66] [score 7.6] Key custody map + hermetic keys lint
- proposed: 2026-07-03
- source signals: unattended windows die on "which file holds
  this token, where is it mirrored, when does it expire" —
  questions no kit file answers today.
- rationale: one greppable names-only registry row per
  credential (Key | Holder file | Minted by | Scopes | Mirrored
  to | Expires | Rotate via), updated in the same commit as the
  mint; a pure-string lint makes orphan/ghost/ambiguous keys a
  gate failure while staying offline.
- proposed scope: `templates/setup/00_keys.md`;
  `templates/scripts/keys-audit.mjs` (opt-in leg); hands-off.md
  pre-flight refuses a window that outlives any Expires cell;
  /bootstrap rotate consumes Mirrored-to as its propagation
  list.
- estimated phases: 1
- conflicts: builds on the two-ring topology + handshake rows.
- promoted: 2026-11-16, auto (motion-stall react, #92), veto #107

### [promoted 2026-11-16 → spec 67] [score 7.5] Package nexus as a Claude Code plugin
- proposed: 2026-07-02 (design deepened 2026-07-03); re-evidenced
  2026-09-14 (expand pass 12)
- source signals: adoption friction (clone + copy + replace is
  the whole TL;DR); Claude Code plugin/marketplace support.
  Signal E (platform drift), 2026-09-14: Claude Code v2.1.269
  (2026-09-11, confirmed via a fresh changelog fetch this pass)
  shipped `claude plugin eval` — a first-party command that runs
  a plugin's eval suite and returns scored, reproducible results.
  This is the exact validation this candidate's proposed scope
  was missing: the byte-diff verify leg only proves the plugin
  build is reproducible, not that its three shipped commands
  (adopt/upgrade/doctor) behave correctly.
- rationale: `/plugin install nexus` collapses adoption Step 1;
  the client-agnostic skills/ layout stays canonical. Deepened:
  the plugin ships adopt/upgrade/doctor commands ONLY — never
  the skill family, protecting the adopted-skills doctrine; the
  nexus repo is its own marketplace so push = publish survives.
- proposed scope: `.claude-plugin/marketplace.json` at root;
  plugin/ generated by `scripts/build-plugin.mjs` (version ==
  KIT_VERSION, commands wrap the canonical prompts/, vendored
  templates snapshot for offline determinism); one verify leg
  regenerating in-memory and byte-diffing; a `claude plugin eval`
  suite exercising the three shipped commands; `playbooks/plugin.md`.
- estimated phases: 1
- conflicts: ship after prompts/ + releases/lock — the plugin
  commands consume both.
- promoted: 2026-11-16, auto (motion-stall react, #92), veto #109

### [promoted 2026-11-19 → spec 69] [score 7.4] plan/ carries the workspace: resurrection files + doctor
- proposed: 2026-07-03
- source signals: the un-versioned root's obvious objection —
  lose the machine, lose the topology. a sibling adopter's plan repo
  already half-plays this role.
- rationale: make plan/ the versioned carrier: canonical copies
  of the root files, a names-only keys manifest, a clone map,
  and a zero-dependency offline doctor. New-machine flow: clone
  org/plan, copy root files up, clone per repos.md, re-run each
  runbook's human beat, doctor until green.
- proposed scope: `templates/workspace/plan-workspace/`
  (keys.md names-only manifest, repos.md clone map, root/
  canonical copies); `templates/workspace/workspace-doctor.mjs`
  (root-not-a-repo, repos exist, keys present by name, no
  secret path inside any repo tree); Resurrection section in
  playbooks/workspace.md; pointer in recovery.md.
- estimated phases: 1
- conflicts: rides the workspace playbook candidate.
- promoted: 2026-11-19, auto (motion-stall react, #92), veto #125

### [promoted 2026-11-21 → spec 70] [score 7.3] Workspace-aware /bootstrap + /oversight
- proposed: 2026-07-03
- source signals: a sibling adopter's cloudflare runbook fans one
  workspace token out to repo Actions secrets by hand.
- rationale: teach the executor the two rings — env resolution
  walks up (process env -> repo .env -> parent .env.workspace,
  with stop conditions), secret fan-out walks down (gh secret
  set per Mirrored-to target); a missing key's failure message
  points at the runbook that mints it.
- proposed scope: edits only — bootstrap-automation.md (env
  resolution order + fan-out), external-services.md (/oversight
  checks each key in its Holder file, names only), polyrepo.md
  (custody map rides the plan repo).
- estimated phases: 1
- conflicts: depends on two-ring topology + custody map.
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 71] [score 7.0] heartbeat's wedged-run canceller breaks outright when the workflow it watches is disabled, instead of skipping like its two sibling steps
- proposed: 2026-10-21 (digest)
- source signals: two consecutive heartbeat runs failed today —
  2026-10-21T04:43:57Z (run 39545645949) and 2026-10-21T11:46:50Z
  (run 39594489838) — both on `could not find any workflows named
  march`. `gh run list --workflow <name>` can't resolve a workflow
  by its display name once it leaves the `active` state: `gh
  workflow list --all` shows `march` as `disabled_manually` since
  2026-10-20T23:20:24Z, the owner's deliberate pause during
  today's marathon local `/heads-down` session (`a1f5f127`). The
  "Cancel wedged runs" step (`.github/workflows/heartbeat.yml`'s
  first step) loops `$WATCH` ("march night") and calls `gh run
  list --workflow "$wf" --status in_progress` with no armed-state
  guard, so it hard-fails under `bash -e` for as long as any
  watched workflow stays non-`active`. Today's own spec-32 chunks
  (`b6acc842`, committed 2026-10-21T14:51:43Z) taught the other
  two steps ("Alarm if not armed", "Alarm if march or night has
  not succeeded a tick in time") to read `gh workflow list --all`
  first and skip a non-`active` workflow instead of erroring —
  step 1 still lacks that exact guard, and its failure aborts the
  whole job (so the two newer steps never even ran on either of
  today's two failing ticks). The template twin
  (`templates/.github/workflows/heartbeat.yml`) is byte-identical,
  so every adopter who pauses a watched workflow hits the same
  failure.
- rationale: cheap (reuse the armed-state read the other two steps
  already do) and adopter-facing (ships via the template); the
  watchdog going dark exactly when the thing it watches is paused
  is the worst time for it to fail silently-loud instead of
  reporting cleanly.
- proposed scope: `.github/workflows/heartbeat.yml` +
  `templates/.github/workflows/heartbeat.yml`, step 1 only — read
  `gh workflow list --all` once (ahead of all three steps, not
  just the latter two) and skip `$wf` in the cancel loop when its
  state isn't `active`. Touches `.github/workflows/*.yml`, so per
  `agents.md` "Operational secrets" it lands from a local/human
  session, not a cloud tick.
- estimated chunks: 1
- conflicts: none
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 71] [score 6.5] Arm `CLAUDE_CODE_RETRY_WATCHDOG` in the cloud workflows so transient 429/529s are waited out instead of crash-alarming
- proposed: 2026-10-09 (expand pass 20)
- source signals: Signal E (platform drift) — Claude Code's
  changelog, fetched fresh this pass
  (`raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`,
  grepped directly): v2.1.295 (today's latest, three versions past
  pass 19's v2.1.292 check) adds
  `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` to cap how long
  `CLAUDE_CODE_RETRY_WATCHDOG` — described elsewhere in the same
  changelog's history ("Changed `CLAUDE_CODE_MAX_RETRIES` to cap at
  15; for unattended sessions, use `CLAUDE_CODE_RETRY_WATCHDOG`
  instead") as the mechanism built specifically for unattended
  sessions — waits out 429 and 529 errors before giving up. Neither
  env var appears anywhere in this repo (`git log --all -i --grep`,
  zero hits; grepped across `.github/workflows/`, zero hits)
  despite `march.yml`, `night.yml`, and `heartbeat.yml` all running
  unattended, with no human present to retry a failed tick by hand.
  Signal A (`plan/AUDIT.md`) — this isn't hypothetical: the
  already-pending "[score 4.5] Crash-alarm dedupe matches by
  generic title only" candidate's own evidence shows two
  independent 429 `rate_limit` crashes in a single 24h window
  (2026-09-21, runs `35525362773` and `35540854118`), both of which
  exited the tick entirely rather than waiting out the transient
  limit.
- rationale: today the only response to a transient 429/529 is the
  whole GitHub Actions job failing — the crash-alarm then fires
  (or, per the 4.5 candidate, gets masked by title-only dedupe).
  `CLAUDE_CODE_RETRY_WATCHDOG` is Claude Code's own first-party
  answer to exactly this shape of problem, and the new
  `_MAX_WAIT_MS` cap removes the previous objection to arming it in
  a job with a hard `timeout-minutes` ceiling — the wait is now
  bounded and tunable against that ceiling instead of open-ended.
  Distinct from, and complementary to, the 4.5 candidate: that one
  makes a crash visible when it happens; this one prevents a whole
  class of crashes (transient rate/overload errors) from happening
  at all.
- proposed scope: add `CLAUDE_CODE_RETRY_WATCHDOG` (exact value per
  the real flag semantics — investigate, don't assume, the
  changelog blurb doesn't confirm whether it's a boolean truthy or
  a specific token) and a `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`
  set comfortably under each workflow's own `timeout-minutes` to
  the `env:` block of `.github/workflows/march.yml`, `night.yml`,
  and `heartbeat.yml`, plus their `templates/.github/workflows/`
  mirrors (agents.md rule 7); a short note in
  `.github/CLOUD_LOOP.md` and `playbooks/cloud-loop.md` naming the
  two env vars and why the wait is capped below the job timeout,
  not uncapped.
- estimated phases: 1 (workflow + doc only, no template API change
  beyond the env block)
- conflicts: none — complements rather than overlaps the pending
  "[score 4.5] Crash-alarm dedupe" candidate above.
- re-evidence:
  - 2026-11-06 · field · +0 · write-ups on running an ai reviewer or ai-assisted fixer inside ci keep repeating one point: spend is driven by how many times a failed check gets retried or re-run, not by the first pass, so the ret…
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 72] [score 6.6] Derive verify.mjs's tree reverse-check from the tree diagrams themselves, not a hand-maintained dir list
- proposed: 2026-09-23 (iterate, dispatched to expand — no
  finding scored ≥3.0 this tick)
- source signals: the exact same bug class — README.md's and/or
  templates/README.md's "What's in this kit" tree diagram
  drifting out of sync with what's actually on disk — has been
  found and fixed at least eight separate times since
  2026-07-19: `PHASE_CANDIDATES.md`/`CURRENT-STATE.md` under
  `templates/plan/` (2026-07-19, `plan/AUDIT.md:192-209`), root
  `CLAUDE.md` (2026-07-29, `plan/AUDIT.md:537-544`),
  `skills/digest.md` in the collapsed `skills/` enumeration
  (2026-07-25, `plan/AUDIT.md:398,420`), a second
  `templates/plan/` pair (2026-08-27ish, `plan/AUDIT.md:599,640`),
  `templates/workspace/` (2026-09-01→02,
  `plan/AUDIT.md:760-767,2119`), `templates/scripts/install-hooks.mjs`
  (this week, `plan/AUDIT.md:1904`), `templates/.github/ISSUE_TEMPLATE/`
  (this week, `plan/AUDIT.md:1825`), and root `CONTRIBUTING.md`
  (today, `plan/AUDIT.md:1737`). A ninth, structural instance
  shipped this week too (commit `e7b4172`): `scripts/verify.mjs`'s
  own `REVERSE_CHECK_DIRS` array — the gate's reverse-check
  allowlist — had itself silently missed four directories
  (`templates/.github`, `templates/data`, `templates/setup`,
  `templates/env`) that are expanded per-file in
  `templates/README.md`'s tree, so the gate couldn't catch drift
  inside them either. Root cause, confirmed by reading
  `scripts/verify.mjs:176-219`: `REVERSE_CHECK_DIRS` is a second,
  independently hand-maintained list of directories, separate from
  the tree diagrams it's meant to police — every time a new
  top-level dir gets expanded in a tree, a human or tick has to
  remember to also add it here, which is precisely the same
  maintenance-drift failure mode as the tree diagrams themselves.
  Root-level files (like `CONTRIBUTING.md`, `CLAUDE.md`) aren't
  covered by the reverse-check at all — only files under a listed
  directory are walked, so a root-level omission is invisible to
  the gate by construction, not just by a missing list entry.
- rationale: this is the single most-repeated bug class in the
  kit's entire audit history (nine confirmed occurrences, roughly
  one every 1-2 weeks), always low-severity individually (a docs
  cosmetic gap, never a broken command) but collectively the
  single biggest recurring tax on `/iterate` ticks — each
  occurrence costs a full finding-and-fix cycle for something a
  slightly smarter gate leg would catch for free, permanently.
  Adopter-facing (both `README.md` and `templates/README.md`,
  the two docs every adopter reads first) and cheap: the fix is
  confined to `scripts/verify.mjs`'s existing `legTree()`
  function, no template API change.
- proposed scope: replace the hardcoded `REVERSE_CHECK_DIRS`
  array with a derived list — every top-level directory (and the
  repo root itself, for direct files only, non-recursive) that
  actually appears as an entry in either parsed tree diagram
  becomes reverse-checked automatically, with a small, explicit
  exclusion list (kit-internal-only dirs like `plan/`, `.git/`,
  `node_modules/`, that intentionally never appear in an
  adopter-facing product tree) instead of an opt-in allowlist.
  Root-level files get the same non-recursive walk-and-compare
  treatment `legTree()` already does for subdirectories. This
  closes both the "new subdir needs a list entry" gap and the
  root-level-file blind spot in one pass.
- estimated phases: 1 (verify.mjs only, no template API change —
  agents.md rule 7 doesn't apply since REVERSE_CHECK_DIRS isn't
  documented public API)
- conflicts: none.
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 73] [score 6.2] `/doctor prompt-audit` isn't in the kit's prompt-maintenance story
- proposed: 2026-09-28 (expand pass 16)
- source signals: Claude Code v2.1.283's changelog — "Added
  `/doctor prompt-audit` (also `/checkup prompt-audit`) to
  audit your CLAUDE.md files, skills, agents and commands for
  prompting patterns written for older models." Confirmed via
  a fresh raw-text fetch of
  `raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`
  this pass (grepped directly, not a summarized read): the
  immediately preceding entry (v2.1.282) shows the command
  already existed and was actively developed that same window —
  "Improved `prompt-audit` on Claude Code configuration: stale
  paths, stale commands and contradicting instruction files now
  lead the report, and thinking keywords that Claude Code
  documents are kept" — so this is a maturing, not
  brand-new-and-unstable, surface. Zero hits for "prompt-audit"
  or "prompt audit" anywhere in this repo's history
  (`git log --all -i --grep`) or docs. This is the direct
  sibling of the already-pending `/skill-doctor` candidate
  (score 5.8, expand pass 10) — same class of first-party
  auditing command, but this one names its targets as exactly
  the four artifact types nexus ships and calls public API:
  CLAUDE.md files (`templates/claude/CLAUDE.md`), skills
  (`skills/*.md` / `templates/skills/*.md`), agents
  (`.claude/agents/`), and commands (`.claude/commands/` /
  `templates/claude/commands/`).
- rationale: nexus's product IS this exact artifact family —
  `customization/claude-code.md` and `concepts/skills-anatomy.md`
  already own the kit's prompting-quality story (voice, wrap,
  anatomy conventions the verify gate partially checks). A
  first-party command that flags "prompting patterns written
  for older models" and "contradicting instruction files" is
  on-mission for both this repo's own maintenance (skills/*.md
  drift is the single most-audited defect class in
  `plan/AUDIT.md`) and for adopters who inherit a growing
  `skills/` directory. Cheap: doc-only, no template API change.
- proposed scope: a short subsection in
  `customization/claude-code.md` (near the existing
  `/skill-doctor` candidate's proposed home) naming
  `/doctor prompt-audit` / `/checkup prompt-audit`, what it
  checks (stale paths, stale commands, contradicting
  instructions, older-model prompting patterns), and when to
  run it (after `/skill-doctor` pruning, or before a `/critique`
  pass). Investigate, don't assume: confirm the command's actual
  output format and whether it flags anything in this repo's own
  `skills/*.md`/`CLAUDE.md` before writing the mapping — a first
  read of a changelog blurb may not match the real CLI surface,
  same caveat as the `/skill-doctor` candidate.
- estimated phases: 1
- conflicts: none — pairs naturally with the pending
  `/skill-doctor` candidate (score 5.8); sequence together if
  both promote, since they'd likely land in the same
  `customization/claude-code.md` section.
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 74] [score 6.0] spec-driven development toolkits are splitting over whether a spec is a static doc or live infrastr…
- proposed: 2026-11-06 (research)
- source signals: field (2026-11-06): competing spec-driven development toolkits now differ mainly on whether the spec stays a one-time planning document or becomes an operational layer the agents keep reading and updating through the bu…
- rationale: a kit whose plan files only get read once at the start, then ignored mid-build, now reads as the older generation of this category; the newer toolkits treat the spec state itself as what drives the loop end to end.
- proposed scope: check that every plan file this kit relies on (lanes, needs, held lines) is read live by the loop at each step, not just consulted once when a chunk is picked, and tighten any step found reading it stale.
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-06
- re-evidence:
  - 2026-11-13 · field · +0 · one popular open toolkit in this category runs spec, plan, tasks, then implement as sequential phases, each producing its own file that feeds the next, and plugs into dozens of different coding agent…
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 75] [score 6.0] autonomous build loops are now named for failure modes: self-approval, spec gaming, misrepresented…
- proposed: 2026-11-13 (research)
- source signals: field (2026-11-13): a survey of many autonomous coding loops names recurring anti-patterns: a loop approving its own work with no outside check, gaming the stated goal instead of the intended one, and a loop's own repor…
- rationale: the kit's own loop both builds and gates its own work every tick; naming which of these failure modes its gate already blocks mechanically, versus which ones it only trusts the builder's self-report for, is worth a deliberate check rather than an assumption
- proposed scope: audit the claim-build-gate-close cycle against each named failure mode and record, in a doc or the gate itself, which ones the verify gate catches mechanically versus which still rely on the builder's own honesty
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-13
- promoted: 2026-11-21, /oversight (the owner's pick)

### [promoted 2026-11-21 → spec 76] [score 6.0] agent runtimes now expose native session fork, delete and resume calls where tooling used to hand-r…
- proposed: 2026-11-13 (research)
- source signals: field (2026-11-13): a widely used agent runtime added first-class calls to fork a running session, delete one, list or resume past sessions, and read current context-window usage by category - capabilities a loop that p…
- rationale: the kit's own reboot train parks a running loop to a ledger file and resumes it later by reading that file back; if the underlying runtime now offers session fork and resume as a native call, the hand-rolled ledger contract could shrink, or the kit should at least note why it still prefers the file-based approach
- proposed scope: compare the reboot-ready/reboot-resume ledger contract against whatever native session fork, resume or list primitives the loop's own runtime now exposes, and note whether moving part of the parking contract onto a native call is worth a candidate
- estimated chunks: unknown until specced
- conflicts: none known.
- generator: research · filed 2026-11-13
- promoted: 2026-11-21, /oversight (the owner's pick)

## Rejected

(kept for the record, with reasons)

### [rejected 2026-11-21] [score 7.5] playbooks/new-project.md has drifted into internally-contradictory and overclaiming copy across 4 pending dry-run findings
- reason: built directly, one `/iterate` tick per finding, no
  spec needed. All seven dry-run findings this row and its
  re-evidence cite are ticked in `plan/CRITIQUE.md`, whose
  Pending section read 0 when `/oversight` checked on
  2026-11-21: the GitLab claim (`6633b57`), the Day-1
  design-artifact box (`307b784`), the early cloud-loop leg
  (`6f3f18b`), the prune-list test break (`78649fa`), the
  files-added checklist (`1a1f2a1`), the install-hooks order
  (`af66cee`) and the commit-points contradiction (`080cdb3`).

### [rejected 2026-11-18] [score 7.5] Onboarding's mobile viewport needs its own narrow-width layout pass, not desktop CSS stretched thin
- reason: built directly, ad hoc, no spec needed — all three
  named components now carry a narrow-viewport fix: the Welcome
  headline (`a36935f`, `.ob-br { display: none; }` plus `.ob
  .t-display-l` under `@media (max-width: 760px)`), the onboarding
  Stepper (`da4d724`, `.stp-count`), and the Oversight filter row
  this row's own 2026-11-17 re-evidence cited (`00b0a69`,
  `.choice` `overflow-x: auto`). `nexus.css`'s `@media
  (max-width: 760px)` block now covers every one of them.
- proposed: 2026-11-12 (expand)
- kind: product
- source signals: signal F (product telemetry — the GUI as its
  users meet it, surfaced via `plan/CRITIQUE.md`'s walk rows,
  `walk-42516406663`) — two independent findings against the
  same onboarding Welcome screen on a phone viewport: a [HIGH]
  row where the hero headline's hard-coded `<br/>` breaks
  (`packages/cli/src/screens/onboarding/Welcome.jsx`) consume the
  entire first screen at full desktop font size, pushing the
  primary "Set up this repo" CTA and loop diagram below the fold
  with only "Skip setup" visible; and a [MED] row where the
  8-star stepper (`packages/cli/src/ui/feedback.jsx`'s `Stepper`,
  each `.stp` a fixed 92px in `nexus.css`) clips to its first 4
  stars with no wrap, scroll cue, or "n of N" counter, unlike its
  desktop rendering (which keeps the full row plus a footer "1 of
  8"). Both trace to the same root: `nexus.css`'s onboarding rules
  (`.ob .t-display-l`, `.stepper`) carry a `(max-height: 820px)`
  breakpoint but no narrow-*width* one, so the component only
  ever assumes the "1280 x 800 without scrolling" viewport the
  file's own section comment names.
- rationale: this is a stranger's literal first screen — burying
  the CTA or hiding half the setup steps on the one viewport
  (phone-width) the README's own GIFs never show is adopter-facing
  in the sharpest way, and both fixes are confined to CSS/JSX the
  rows already name a line for, not new plumbing.
- proposed scope: add a narrow-viewport breakpoint to
  `packages/cli/src/styles/nexus.css` for `.ob .t-display-l` (let
  the headline wrap naturally, or drop/condition `Welcome.jsx`'s
  hard-coded `<br/>`s) and for `.stepper` (an `overflow-x: auto`
  scroll strip with a fade/arrow, or collapse to the footer's
  existing "n of N" text) so both screens stay legible under
  ~390px without widening every star.
- estimated chunks: 1
- conflicts: none known — CSS/JSX only, no template API surface.
- re-evidence:
  - 2026-11-17 · F 3f5fc6a · independent, +0.5 · pass 36's /inbox mobile walk finding (Oversight filter row clips with no scroll affordance, controls.jsx's ChoiceButtons) is a third instance of the same no-narrow-viewport-handling root cause this row already names (Welcome headline, Stepper), confirming the pattern recurs outside the two components already scoped

### [rejected 2026-11-17] [score 5.8] Widen (or exempt) the dualshell syntax lint past its five git-procedure skills
- reason: built directly via `/iterate` (`plan/AUDIT.md`'s
  `[E, 2.1]` row), this tick — every bash-only fence outside the
  original five skills now carries `<!-- dualshell:posix-only
  -->`, and `scripts/verify.mjs`'s `SYNTAX_SCOPED_SKILLS` widened
  to all of `skills/` + `templates/skills/`; no spec needed.
- proposed: 2026-11-12 (expand)
- kind: guard
- source signals: signal A (`plan/AUDIT.md`'s `[E, 2.1]` row) —
  chunk 52.3 scoped the new `dualshell` verify leg
  (`scripts/verify.mjs`'s `SYNTAX_SCOPED_SKILLS`) to the five
  git-procedure skills its own spec named (`skills/next/build.md`,
  `skills/next/land.md`, `skills/next.md`, `skills/plot.md`,
  `skills/tidy.md`, and their `templates/skills/` twins),
  deliberately leaving the rest of `skills/` and
  `templates/skills/` unchecked. A repo-wide grep for the same
  bash-only shapes (`$(...)`, backtick substitution, bare
  `VAR=value`, `&&`/`||` chaining, `<<` heredocs) finds real hits
  in both the kit's own skills (`critique.md`, `heads-down.md`,
  `iterate.md`, `ship-a-chunk.md`, `lessons-pr.md`, `march.md`,
  `reboot-ready.md`) and their adopter-facing `templates/skills/`
  twins, several with no PowerShell equivalent today.
- rationale: `templates/skills/` is the product (agents.md rule
  7) — a bash-only fence an adopter on PowerShell can't run is
  exactly the class the dualshell leg exists to catch, and today
  it's invisible outside five files. Cheap because the fix
  locations are already enumerated file-and-line in the AUDIT row.
- proposed scope: either rewrite each bash-only shape (`mktemp` →
  a small node temp-file helper; `gh ... --jq` piping → a small
  node script; the heredoc commit-message pattern → write the
  message to a temp file and `git commit -F`) or tag fences with
  no PowerShell equivalent worth building as `<!--
  dualshell:posix-only -->`, then widen `SYNTAX_SCOPED_SKILLS` to
  all of `skills/` + `templates/skills/` once they're clean.
- estimated chunks: 1
- conflicts: none known — skills/ prose + `scripts/verify.mjs`'s
  existing dualshell leg, no new invariant beyond widening its own
  scope.

### [rejected 2026-11-06] [score 5.5] playbooks/outgrow.md — the split ceremony
- reason: stale: below cap cut 2026-11-06
- proposed: 2026-07-03
- source signals: judged premature — no second real migration to
  validate the ceremony against yet.
- rationale: the single-repo -> workspace split will eventually
  need a numbered, safe ceremony; write it when the first real
  split happens and can serve as its test case.
- proposed scope: deferred; the workspace playbook's decision
  matrix + polyrepo.md cover the ladder's endpoints until then.
- estimated phases: 1
- conflicts: none.

### [rejected 2026-11-06] [score 5.9] Staged hardening for verify legs
- reason: stale: below cap cut 2026-11-06
- proposed: 2026-07-02
- source signals: a sibling adopter's `check.mjs` `*_IS_ERROR` flags —
  new invariants start as warnings, flip to errors once the
  corpus drains.
- rationale: lets adopters (and this repo) add aggressive lint
  legs without a big-bang cleanup; the flip commit is the
  celebration.
- proposed scope: warn-tier support in `scripts/verify.mjs` +
  a paragraph in verify-gate.md.
- estimated phases: 1
- conflicts: none.

### [rejected 2026-11-06] [score 6.1] Critique-household pattern for auth-aware critique
- reason: stale: below cap cut 2026-11-06
- proposed: 2026-07-02
- source signals: a sibling adopter's planned `/visit` seals an
  anonymous "critique household" so the observer never
  consents to analytics (no GA4 pollution) — a pattern
  auth-aware-critique.md doesn't cover.
- rationale: adds the "observer must not pollute product
  analytics/data" dimension to the five auth patterns.
- proposed scope: new section in
  `customization/auth-aware-critique.md` + env conventions.
- estimated phases: 1
- conflicts: none.

### [rejected 2026-11-06] [score 6.3] AUDIT's unwritten "favor the queue" tie-break is starving a cheap, real AUDIT-native row
- reason: stale: below cap cut 2026-11-06
- proposed: 2026-07-24 (digest); re-evidenced 2026-09-05 (expand
  pass 8)
- source signals: `plan/AUDIT.md`'s `[A/E, 2.7]` row (README's
  "Files added" checklist undersells `scripts/` — impact 3,
  ease 9, one of the cheapest fixes in the file) first appeared
  around cloud tick 2026-07-17 and has since been cited as tied
  or narrowly outscored by a `plan/CRITIQUE.md` row in at least
  ten separate tick log-lines through 2026-07-24, every single
  time it was in contention. The tie-break that keeps beating it
  ("favor the queue") is a real, consistently-applied
  convention, but it exists only as repeated log narrative in
  `plan/AUDIT.md` — it was never written into `skills/iterate.md`
  §3 as an actual rule, so nobody can inspect or challenge it as
  policy, and it has no aging counter-pressure. Signal A (fresh
  instance), 2026-09-05: two more AUDIT-native rows are now
  living examples of the same starvation, older than the
  original evidence — `[C, 2.4]` (`triage.md`'s dead
  `ship-data.md §6` citation) first appeared 2026-08-02 and
  `[A, 2.4]` (`templates/claude/hooks/guard.mjs` drifted from
  the kit's own hardening) first appeared ~2026-08-24; both have
  been reproduced unchanged and left Pending across at least
  seven intervening ticks (2026-08-25 through 2026-09-04) each
  time a `plan/CRITIQUE.md` row was in contention, per
  `plan/AUDIT.md`'s own tie-break log lines — 34 and 12 days
  unshipped respectively, longer than the original `[A/E, 2.7]`
  row ever waited before this candidate was first filed.
- rationale: a one-line, ease-9 fix sitting seven-plus days
  unshipped purely because of an unwritten scoring convention is
  exactly the "starved queue" pattern `skills/digest.md` §3 step 4
  names as a tuning trigger — not because the fix is hard, risky, or
  actually low-value. That two independent rows have now each
  waited over a week (one over a month) confirms this isn't a
  one-off tie but a standing structural bias in favor of the
  CRITIQUE queue.
- proposed scope: write the "favor the queue on ties" convention
  explicitly into `skills/iterate.md` §3 as an inspectable rule,
  paired with a small aging nudge (e.g. `+0.1` per tick an AUDIT
  row is passed over on a tie, capped) so a persistently-tied
  cheap row eventually wins instead of losing indefinitely.
- estimated phases: 1 (doc/rule-only, no template API change)
- conflicts: none.

### [rejected 2026-11-06] [score 6.5] Mechanically verify the Cloud-Run trailer on cloud ticks
- reason: stale: below cap cut 2026-11-06
- proposed: 2026-07-20 (digest); re-evidenced 2026-07-26 (digest),
  2026-09-05 (digest), 2026-09-25 (iterate, dispatched to expand
  — no finding scored ≥3.0 this tick)
- source signals: of the 4 cloud commits shipped in the trailing
  24h window (2026-07-19 14:31 to 2026-07-20 09:07 UTC — all
  4 `march` runs green, no failures), 1 — `a74f7b6` ("critique:
  pass 6 — 4 findings (2 high, 2 med)", from the 2026-07-19
  20:18 UTC tick) — landed with no `Cloud-Run:` trailer at all,
  breaking agents.md rule 2's carve-out. The workflow's own
  ceiling check (`march.yml`'s "Daily commit ceiling check"
  step) counts cloud volume by `git log --grep='Cloud-Run:'`,
  so this commit silently doesn't count toward the 8/24h
  ceiling either — the miss is invisible from both the rule
  side and the counting side. `scripts/verify.mjs` runs
  foreground on every tick but has no leg that inspects the
  commit trailer, since it can't distinguish a cloud commit
  from a local one at gate time. Second instance found
  2026-07-26 (digest): `427eb91` ("critique: pass 8 — 2 findings
  (0 high, 1 med, 1 low)", from the 2026-07-25 20:20 UTC tick)
  repeats the identical gap — confirmed via
  `gh run view 30173383094 --log`, whose prompt block quotes the
  exact trailer text verbatim, yet the shipped commit has no
  body at all. Both observed misses are `/critique` verb commits
  specifically (`a74f7b6`, `427eb91`), never an `/iterate` or
  `/expand` commit in the ~60 cloud ticks sampled by digest
  passes to date — narrows the likely root cause from "any
  cloud commit can drop the trailer" to "the critique skill's
  own commit step doesn't append it," which changes where the
  eventual fix should look first. Third instance, 2026-09-04:
  `3f29301` ("critique: pass 14 — 3 findings (0 high, 1 med, 2
  low)") repeats the gap a third time, still on `/critique` —
  but this time `/triage` traced the actual mechanism (filed as
  `plan/AUDIT.md` `[user-issue #53]`): the tick delegated
  `skills/critique.md` step 3's dry-run walk to a general-purpose
  sub-agent, which went further than asked and ran steps 6-7
  itself (append findings, commit, push) using its own prompt —
  one that never carried the parent tick's cloud-mode trailer
  text. This sharpens "the critique skill's own commit step
  doesn't append it" into something more specific: the commit
  step is fine when the parent tick runs it directly; the gap is
  delegation-shaped, only surfacing when a sub-agent commits on
  the parent's behalf. Fourth instance, 2026-09-24 (filed as
  `plan/AUDIT.md` `[user-issue #63]`): commit `0cdb345`
  ("critique: pass 20 — 2 findings (0 high, 1 med, 1 low)")
  repeats the identical delegation-shaped gap — the sub-agent
  appended to `plan/CRITIQUE.md` and committed + pushed directly
  despite `skills/critique.md` step 3 already scoping it to
  steps 3-5 only. Reporter spot-checked the commit's content
  against its cited evidence and confirmed it's legitimate, so
  this is purely the same process gap recurring a fourth time,
  not a content defect. `[user-issue #63]`'s own `next` field
  proposes the same two angles as `[user-issue #53]` before it:
  a stronger literal imperative in the delegate prompt, and/or
  this candidate's mechanical workflow-side check.
- rationale: the trailer is the sole mechanism the ceiling
  trusts; a tick that forgets it both violates the standing
  rule silently and erodes the ceiling's accuracy in the
  direction that's hardest to notice (undercounting, not
  overcounting). Three misses now observed, all on the same
  verb, is an established pattern, not a one-off — and the third
  instance finally explains why: delegation strips the trailer
  context, not a missing line in the skill file.
- proposed scope: a post-agent step in `march.yml` (and its
  `templates/` mirror) that diffs `HEAD` against the pre-run
  SHA when the ceiling didn't skip, and — if new commits landed
  without the trailer on all of them — opens an unlabeled
  issue naming the offending SHA (the loud-not-silent pattern
  agents.md rule 6 already prescribes elsewhere). Gate-side
  enforcement isn't possible (verify.mjs can't tell cloud from
  local commits), so this has to live in the workflow, not the
  gate. Complements, rather than duplicates, `[user-issue #53]`'s
  own proposed fix (narrow `skills/critique.md` step 3 so a
  delegate only performs the walk and never step 6/7 itself) —
  that fix closes the specific delegation gap found here; this
  candidate's mechanical check remains the general safety net
  for any future way a cloud commit could drop the trailer.
- estimated phases: 1 (workflow-only, no template API change)
- conflicts: none.

### [rejected 2026-11-12] [score 5.8] `/skill-doctor` isn't in the kit's skill-maintenance story
- reason: stale: below cap cut 2026-11-12
- proposed: 2026-09-10 (expand pass 10)
- source signals: Claude Code v2.1.267 (2026-09-09, per the
  official changelog) shipped `/skill-doctor` — "shows which
  loaded skills go unused and what they cost in context, so
  you can prune them." Confirmed via fresh search this pass;
  zero hits for "skill-doctor" or "skill doctor" anywhere in
  this repo's history or docs. `customization/claude-code.md`
  §7 ("Native skills packaging") and the adopt-by-need
  contract (`templates/README.md`'s prune table,
  `plan/bearings.md`'s "keep skills lean ~100-200 lines"
  decision) are exactly the load-bearing docs this command
  speaks to, and none mention it.
- rationale: nexus's whole model is skills adopted by need —
  every template repo accumulates `skills/*.md` files an
  agent's context pays for whether or not they're ever
  invoked. A first-party command that measures that cost
  directly is on-mission for a kit whose own bearings already
  encode "keep skills lean" as a standing decision; today an
  adopter (or this repo's own maintainers) would have no
  first-party way to notice a skill has gone stale/unused
  short of memory or grep.
- proposed scope: a short subsection in
  `customization/claude-code.md` (new §10 or folded into §7)
  naming `/skill-doctor`, when to run it (after adopt-by-need
  pruning, or periodically once a repo's skills/ has grown),
  and how its output maps to the prune table; one line in
  `playbooks/new-project.md`'s adopt-by-need prune step
  pointing at it as a follow-up check. Investigate, don't
  assume: confirm the command's actual output format before
  writing the mapping, since a first read of a changelog blurb
  may not match the real CLI surface.
- estimated phases: 1
- conflicts: none — additive documentation, no template API
  change.

### [rejected 2026-11-12] [score 6.0] Claude Code v2.1.269 fixes the attribution-reminder/CLAUDE.md conflict agents.md rule 2 depends on
- reason: stale: below cap cut 2026-11-12
- proposed: 2026-09-12 (expand pass 11)
- source signals: Claude Code changelog v2.1.269 (2026-09-11) —
  "Fixed the attribution reminder overriding a CLAUDE.md or
  memory rule against commit and pull request attribution;
  lines set by managed settings still apply." Confirmed via a
  fresh changelog fetch this pass (versions 2.1.268/2.1.269,
  dated 2026-09-10/11, are the only entries newer than the
  v2.1.267 changelog state expand pass 10 already read on
  2026-09-09). `agents.md` rule 2 ("No `Co-Authored-By:`
  trailers. No emojis.") and its ~25 mirrors across
  skills/templates/playbooks depend entirely on the harness
  respecting a project's own CLAUDE.md-level rule over its own
  built-in attribution reminder — exactly the conflict this
  version fixes. No repo commit has ever actually carried a
  stray trailer (`git log --all --grep="Co-Authored-By"` finds
  none), so this isn't closing an active incident; it's the
  platform formalizing a guarantee the kit's core no-trailer
  contract already assumed informally, on an Action pin
  (`anthropics/claude-code-action@v1`) that floats to newer
  CLI builds over time.
- rationale: the "no Co-Authored-By" rule is one of two hard,
  headline standing rules in agents.md (rule 2); before this
  fix, an older Claude Code build could in principle have let
  its own attribution reminder win over agents.md's
  instruction, silently violating the rule on any tick with no
  local signal it had happened. Worth a small, cheap doc note
  now that the platform mechanically guarantees the ordering
  the kit already relies on, plus a version-floor callout for
  adopters pinning an older CLI.
- proposed scope: one paragraph in
  `customization/claude-code.md`'s hard-rules or failure-modes
  section noting CLI >= v2.1.269 (2026-09-11) is required for
  the "attribution reminder never overrides agents.md rule 2"
  guarantee to hold mechanically (older builds relied on it
  working by convention only, unconfirmed either way); a
  one-line pointer from `.github/CLOUD_LOOP.md`'s
  trailer-carve-out section since the cloud loop is the
  everyday enforcement point.
- estimated phases: 1 (doc-only, no template API change)
- conflicts: none.

### [rejected 2026-11-12] [score 6.5] Auto mode: Claude Code's new default permission model isn't in the kit's playbooks
- reason: stale: below cap cut 2026-11-12
- proposed: 2026-09-09 (expand pass 9); re-evidenced 2026-09-19
  (expand pass 13); re-evidenced 2026-10-01 (expand pass 17);
  re-evidenced 2026-10-04 (expand pass 18); re-evidenced
  2026-10-06 (expand pass 19); re-evidenced 2026-10-13 (expand
  pass 21); re-evidenced 2026-10-14 (expand pass 22); re-evidenced
  2026-10-15 (expand pass 23)
- source signals: Claude Code's own "What's new" changelog
  (Week 32, Aug 3-7 2026) — "auto mode becomes the default
  permission mode for new sessions on Pro, Max, and Team
  plans starting August 14" — a classifier now handles
  permission prompts (approve safe actions, block risky ones)
  instead of asking every time. Confirmed via a fresh doc
  fetch this pass; no reference to "auto mode" exists anywhere
  in this repo's history (`git log --all -i --grep`, zero
  hits) or in `customization/claude-code.md` /
  `playbooks/hands-off.md`, the two docs that own the kit's
  entire permission story. Signal E (platform drift), 2026-09-19:
  the CHANGELOG's `main` branch now runs through v2.1.278 (this
  pass's fresh fetch — versions 2.1.270 through 2.1.278, none
  read by pass 11's 2026-09-12 check), and auto mode kept
  evolving across that span rather than settling: v2.1.278
  "Modified auto mode defaults to use server-side classifier for
  Claude API and Enterprise users on Bedrock, Vertex, Foundry,
  and gateways" plus "Added status row showing whether auto mode
  classifier runs on the server"; v2.1.271-2.1.274 each shipped
  auto-mode-adjacent fixes (per-command `allowed_domains` for
  Bash/PowerShell/Monitor in auto mode, an "Auto mode
  disappearance in model picker" fix, "Improved auto mode denial
  clarity", "Changed auto mode classifier default"). This
  confirms auto mode is still an actively-changing surface eight
  weeks after this candidate was first filed, not a one-time
  platform shift the kit missed and can catch up on once — the
  proposed scope's "investigate, don't assume" caveat is now more
  load-bearing, since a doc written against today's classifier
  behavior risks going stale again on the next release. Signal E,
  2026-10-01 (expand pass 17): fetched the changelog fresh again —
  `main` now runs through v2.1.287 (nine more versions since pass
  13's v2.1.278 check), still actively touching this exact
  surface rather than settling: "Fixed fast mode staying off in
  remote sessions owned by an agent with no user account, even
  when the organization allows it," "Changed automatic model
  switches after a flagged message to keep your current effort
  level instead of the new model's default," and — most directly
  relevant to this candidate's own "investigate, don't assume"
  scope item — "Changed whole-tool `Bash` allow rules and
  allowing hooks to prompt for, not run, shell writes to files
  Claude Code's file tools refuse outright (the Anthropic profile
  store, the host credentials file)," a behavior change in
  exactly the allow-rule/classifier interaction this candidate's
  proposed scope says needs verifying before the doc is written.
  Model lineup has also moved (Opus 5.5/Sonnet 5.5 are now the
  named defaults in this same changelog, up from Opus 4.7/4.8) —
  orthogonal to auto mode itself, but reinforces that any doc
  this candidate produces should cite behavior, not version
  numbers, per the kit's existing "ids age" hedge convention.
  Signal E, 2026-10-04 (expand pass 18): fetched the changelog
  fresh again (raw CHANGELOG.md, grepped directly) — `main` now
  runs through v2.1.289 (two more versions since pass 17's
  v2.1.287 check), still shipping auto-mode-specific fixes rather
  than settling: v2.1.288 "Fixed auto mode denials pointing
  Claude at a Bash permission rule when the blocked tool was not
  Bash" and "Fixed auto mode on Bedrock and Mantle switching to
  the local classifier for the rest of the session after a
  request to an older model, such as a WebFetch summary or a
  `sonnet` subagent." Both are narrow bug fixes to the
  classifier's own denial-reporting and model-switch logic, not
  structural changes — fourth straight pass confirming the
  surface is still moving, which keeps this candidate's
  "investigate, don't assume" scope note live rather than
  resolved. Signal E, 2026-10-06 (expand pass 19): fetched the
  changelog fresh again — `main` now runs through v2.1.292
  (three more versions since pass 18's v2.1.289 check), still
  landing auto-mode-specific fixes: v2.1.290 "Fixed auto mode
  classifier approving non-read-only connector tools" and
  "Fixed plan mode not restoring on session resume"; v2.1.292
  "Fixed `permissionMode: auto` entering auto mode when
  unavailable" and the matching subagent-side fix, plus "Fixed
  PreToolUse hook approvals bypassing permission prompts for
  network paths" — the last one bears directly on this
  candidate's own "investigate... before writing the note"
  caveat about how auto mode composes with the hook/allowlist
  layer. Fifth straight pass confirming the surface is still
  moving. Signal E, 2026-10-13 (expand pass 21): fetched the
  changelog fresh again — `main` now runs through v2.1.296
  (four more versions since pass 19's v2.1.292 check), with one
  more auto-mode-specific entry: v2.1.293 "Reverted the auto
  mode denial message change from 2.1.281" — the classifier's
  own denial-message behavior changed, then changed back,
  inside this single four-version window. Sixth straight pass
  confirming the surface hasn't settled; still no structural
  change that would resolve this candidate's "investigate,
  don't assume" scope note either way. Signal E, 2026-10-14
  (expand pass 22): fetched the changelog fresh again — `main`
  now runs through v2.1.299 (three more versions since pass
  21's v2.1.296 check), with three more auto-mode-specific
  entries: a fix for SDK/headless sessions staying in auto mode
  after the host switched to a model that doesn't support it, a
  fix for tools from an MCP server named `constructor` or
  `toString` wrongly asking for permission in auto mode and
  bypass-permissions mode, and a narrowing of what a
  `PermissionRequest` hook can approve in Cowork cloud sessions
  (shell commands and subagents now wait or are denied rather
  than being hook-approved) — the last one is a different
  product surface (Cowork cloud sessions, not the GitHub
  Actions-based cloud loop this kit documents) so it's noted but
  not treated as directly applicable. Seventh straight pass
  confirming the surface hasn't settled; still no structural
  change either way. Signal E, 2026-10-15 (expand pass 23):
  fetched the changelog fresh again — `main` now runs through
  v2.1.300 (one more version since pass 22's v2.1.299 check),
  with no new auto-mode-specific entries; the handful of new
  items are Cowork-cloud-session-specific (same out-of-scope
  surface noted last pass) and background-agent/subagent
  bookkeeping fixes unrelated to the classifier itself. Eighth
  straight pass confirming the surface hasn't settled, but this
  check found nothing that changes the proposed scope's
  "investigate, don't assume" note either way.
- rationale: `playbooks/hands-off.md` Step 1's whole premise —
  "burn down the prompt list... zero prompts across three
  attended ticks is the bar" — was written for a world where
  every local session defaults to asking. On Pro/Max/Team, new
  sessions now default to auto mode instead: the classifier may
  already be silently approving or blocking some of what Step
  1's manual burn-down expects a human to see and adjudicate by
  hand, which could shorten the burn-down (fewer real prompts to
  work through) or hide it (a classifier-blocked action fails
  differently than a prompt — no `allow` rule to add, just a
  denial with no burn-down entry point). The cloud posture
  (`bypassPermissions` on a disposable runner) is separately
  reasoned and evidenced by a real incident, so it's out of
  scope here — this candidate is about the local, attended path
  auto mode now touches by default.
- proposed scope: a short "auto mode" subsection in
  `customization/claude-code.md`'s permission-mode discussion,
  naming it as the new local default on Pro/Max/Team and
  clarifying it complements (doesn't replace) the
  settings.json allowlist + guard-hook layer; a note in
  `playbooks/hands-off.md` Step 1 that a fresh session may
  already be in auto mode, so the burn-down should first
  confirm which mode is active before assuming every silence
  means a fully pre-approved allowlist. Investigate, don't
  assume: verify auto mode's actual interaction with
  `.claude/settings.json`'s `allow`/`deny` rules and the guard
  hook before writing the note, since the mechanism (a
  classifier, not a rule match) may not compose with the
  existing allowlist the way a first read suggests.
- estimated phases: 1
- conflicts: none — additive documentation, no template API
  change; the guard-hook hard-rule enforcement (agents.md
  rule 5) stays authoritative under any permission mode.

### [rejected 2026-11-12] [score 6.8] closeloop: thank the humans who file issues
- reason: stale: below cap cut 2026-11-12
- proposed: 2026-07-02
- source signals: a sibling adopter's `.claude/tools/closeloop.mjs`
  (Postmark batch thank-you emails to issue reporters,
  dry-run default, tested).
- rationale: the address loop closes with the fix; closing
  with the *reporter* compounds trust. Generalize as an
  opt-in template next to loop-issue.mjs.
- proposed scope: `templates/scripts/closeloop.mjs` +
  customization section in the triage/moderation story.
- estimated phases: 1
- conflicts: email provider becomes an optional external
  service (runbook required).

### [rejected 2026-11-12] [score 7.0] ADOPTERS.md wall + badge + opt-in hatch beacon
- reason: stale: below cap cut 2026-11-12
- proposed: 2026-07-03
- source signals: the only zero-cost growth loop available under
  the $0-marginal constraint.
- rationale: registry rows are trivially mergeable community
  PRs; the differentiated part is the beacon — an adopter's
  first green tick (opt-in, off by default, loudly so) files a
  "hatched" issue with verifiable first-tick evidence, and
  /triage is the spam gate.
- proposed scope: ADOPTERS.md seeded with the provenance
  projects + paste-ready badge snippet; README "projects that
  ship themselves" strip; NEXUS_HATCH_OPTIN= (empty default) in
  env.example; one fires-once step in ship-a-phase.md; a
  hatched route in triage.md.
- estimated phases: 1
- conflicts: beacon must stay opt-in or it reads as phone-home
  telemetry in a kit whose brand is "you own everything".

### [rejected 2026-11-16] [score 4.2] AUDIT.md's H1 header date isn't mechanically bumped after a full sweep, so every tick hand-parses the log for real staleness
- reason: stale: below cap cut 2026-11-16
- proposed: 2026-09-16 (digest)
- source signals: `plan/AUDIT.md`'s H1 still reads "2026-09-12"
  while its own log shows full A-G sweeps landing 2026-09-14 and
  again 2026-09-16 (this morning, `b45b807`'s tick, ~8h before
  this digest ran) — the field is stale by the literal 48h rule
  in both `skills/digest.md` §3 step 5 and `skills/iterate.md`
  §4 step 2, yet neither sweep bumped it. Every tick since at
  least the 2026-09-04 digest has coped by hand-deriving the
  true last-sweep date from the log's own "Cloud tick <date>:
  ... ran a fresh A-G sweep" prose instead of trusting the H1
  ("header still the 2026-09-14 full sweep" — 2026-09-15 digest;
  "same gap flagged in the last digest, still not bumped" —
  same entry). This tick nearly repeated the 2026-09-16 sweep a
  second time from scratch — reading the literal header as
  ground truth before the log narrative caught that a fresh
  sweep had already shipped 8 hours earlier — costing a spawned
  sub-agent before the duplicate was caught and stopped.
- rationale: a staleness signal that every consumer has learned
  to distrust and manually re-derive isn't doing its job; the
  workaround is easy to skip under time pressure (as this tick
  almost did), risking either wasted duplicate sweeps or, worse,
  a rewrite that clobbers durable rows if the hand-parse is
  wrong. Cheap to fix, and every future digest/iterate tick pays
  the parsing tax until it is.
- proposed scope: either (a) require the full-sweep step in
  `skills/digest.md` §3.5 and `skills/iterate.md` §4.2 to
  rewrite AUDIT.md's H1 to today's date in the same commit, or
  (b) teach `scripts/pulse.mjs` to parse the log's own dated
  "ran a fresh A-G sweep" lines for the true last-sweep date and
  print an explicit staleness verdict instead of leaving callers
  to eyeball the H1. (b) is more robust — it does not depend on
  every future tick remembering the bump.
- estimated phases: 1
- conflicts: none.

### [rejected 2026-11-16] [score 7.1] npx nexus-adopt: the mechanical half as an initializer
- reason: stale: below cap cut 2026-11-16
- proposed: 2026-07-03
- source signals: clone + copy + placeholder-replace is
  mechanical work no agent needs judgment for.
- rationale: a zero-dependency initializer does the mechanical
  half (infer placeholders from git remote/branch/dirname,
  shallow-clone at the latest tag, copy per the templates
  contract, write plan/nexus.lock) then prints exactly one
  paste line handing the judgment half to ANY agent.
- proposed scope: packaging/npx/ (bin + small test); release.yml
  publishing on tag push (one NPM_TOKEN secret); README
  one-command variant above the paste.
- estimated phases: 1
- conflicts: ship after prompts/ + releases; npm is a second
  publish surface to keep in lockstep.

### [rejected 2026-11-16] [score 7.2] Package-manager pluggability: the pnpm-only settings.json allowlist silently stalls npm/yarn/bun adopters
- reason: stale: below cap cut 2026-11-16
- proposed: 2026-07-10
- source signals: critique pass 3 (2026-07-10) —
  `playbooks/new-project.md:35`'s "sed-replace if you use
  npm/yarn/bun" caveat has no worked example and a naive
  `s/pnpm/npm/g` breaks command syntax (`npm typecheck` needs
  `run`); separately, and more seriously,
  `templates/claude/settings.json`'s permission allowlist is
  hardcoded to `Bash(pnpm verify:*)` / `Bash(pnpm test:*)` etc.
  with no equivalent for other package managers.
- rationale: an npm/yarn/bun adopter's verify-gate commands never
  match the allowlist, so every unattended cloud tick silently
  stalls on a permission prompt nobody is present to answer —
  this directly defeats `README.md`'s "leave it for 80 hours"
  pitch, the kit's core promise, for any adopter who isn't on
  pnpm. Adopter-facing and severe out of proportion to how small
  the fix is.
- proposed scope: either (a) generate
  `templates/claude/settings.json`'s allowlist entries from the
  package-manager choice already captured during onboarding
  (bootstrap.mjs already prompts/knows this), so npm/yarn/bun
  land with matching `Bash(<pm> ...)` entries in the same commit
  the placeholders resolve; or (b), if (a) is out of scope for one
  phase, state plainly in `new-project.md` and `README.md` that
  pnpm is a hard prerequisite until (a) ships, and give a real
  worked sed example for the interim manual path. Either way,
  fixes the allowlist/caveat mismatch `plan/CRITIQUE.md` flagged.
- estimated phases: 1
- conflicts: none — settings.json's allowlist shape is internal
  to the template, not public API (agents.md rule 7 covers
  paths + placeholder vocabulary, not allowlist contents).
