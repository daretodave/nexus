# Kit audit — 2026-09-22

> Bias: none

Cloud tick 2026-07-12 (first): picked [2.1] over the
higher-scoring [user-issue #12] because #12's fix touches
`.github/workflows/march.yml`, which `ACTIONS_PAT` cannot push
(no `workflows` scope, by design — see its own evidence). Left
#12 pending for a human or locally-run `/iterate` with a
workflow-scoped token, per its `next`.

Cloud tick 2026-07-12 (second): #12 still the only AUDIT row
and still blocked for the same reason, so this tick shipped the
next highest-scoring queue item instead — `plan/CRITIQUE.md`'s
MED "sed one-liner's scope misses files" row (queue rows
compete with AUDIT rows on the same scale, per `skills/iterate.md`
§3). AUDIT block otherwise unchanged; still <24h old.

Cloud tick 2026-07-12 (third): #12 still the sole AUDIT row,
still blocked (no `workflows`-scoped token in this environment).
Shipped `plan/CRITIQUE.md`'s remaining MED row — the blanket
`skills/` copy contradicting the adopt-by-need contract. AUDIT
block otherwise unchanged; still <24h old.

Cloud tick 2026-07-13: #12 still the only AUDIT row, still
blocked (no `workflows`-scoped token in this environment).
Re-scored `plan/CRITIQUE.md`'s pending queue (five MED, four
LOW rows) and shipped the highest-scoring one — the README /
playbook estimated-time contradiction (agent-paced vs
human-paced figures reading as flatly incompatible) — over the
prune-table-coverage and bootstrap-manifest-placeholder MED
rows, both larger edits for a similar score. Not a fresh A-G
sweep; last full sweep still 2026-07-11 (below).

Cloud tick 2026-07-14: #12 still the only AUDIT row, still
blocked for the same reason. Re-scored `plan/CRITIQUE.md`'s
remaining queue (three MED, four LOW) and shipped the
bootstrap-manifest-placeholder MED row — cheapest fix of the
three MEDs (a one-line note + scoped sed, vs. the prune-table
row's five new worked examples and the npm/yarn/bun row's
settings.json-allowlist redesign). Not a fresh A-G sweep; last
full sweep still 2026-07-11.

Second full dimension sweep (A-G) since phase 18 ended the
build plan. Re-verified the two rows still pending from the
2026-07-09 pass (both confirmed real) and swept fresh for new
drift: templates/ vs. both tree diagrams, verify.mjs's own leg
coverage, model-id freshness, and placeholder-sample accuracy.
Sibling lessons files (`../kintilla`, `../semilayer`) still not
present in this checkout — dimension G came up empty, not
skipped. No stale/invented model ids found; placeholder table
still correctly 8 entries.

Third full dimension sweep (A-G), cloud tick 2026-07-14 — first
full A-G sweep since 2026-07-11 (the intervening four ticks
only re-scored `plan/CRITIQUE.md`'s pending queue, per their own
log lines above). Dimension G still empty (no sibling lessons
files present). Top finding shipped this tick (below); four more
queued to Pending, ranked below `[user-issue #12]` which stays
the oldest row but remains blocked on a workflows-scoped token.

Cloud tick 2026-07-14 (second): #12 still the only blocked row.
Verified and shipped the next-highest scorer — the
`thock.netlify.app` link rot (score 4.8) — over the two
remaining A-class rows (4.2, 3.2) which score lower. Not a fresh
A-G sweep; last full sweep still today's third sweep above.

Cloud tick 2026-07-14 (third): #12 still the only blocked row.
Shipped the next-highest scorer — the README command-table
completeness row (score 4.2) — but narrowed its scope: added
`/digest` (main table) and `/moderate` (opt-in table), skipped
`/lessons-pr`. `skills/lessons-pr.md` documents itself as a
nexus-self meta-skill adopters never copy (confirmed: no
`templates/skills/lessons-pr.md` exists), so listing it beside
adopter-facing commands in "What you get" would misrepresent it
as something adopters run in their own repo. The existing
forward-reference at README.md:237 (capture lessons during
adoption, land them via a later `/lessons-pr` pass *against the
nexus repo*) already covers it accurately.

Cloud tick 2026-07-15: #12 still the only blocked row (same
`ACTIONS_PAT` scope constraint). Shipped the next-highest
scorer — the "six skill files" stale count (score 3.2, [A,
3.2] below) — over the `scripts/` checklist row (2.7). Not a
fresh A-G sweep; last full sweep still cloud tick 2026-07-14
(third).

Cloud tick 2026-07-17: fresh sweep of C (link rot — no new dead
links beyond the already-fixed `thock.netlify.app`, which now
only appears in historical AUDIT/DIGEST log prose, not live
docs), F (model-id freshness — `claude-sonnet-5`,
`claude-haiku-4-5`, `claude-opus-4-8` all current, none stale),
and G (sibling lessons — `../kintilla/plan/lessons.md` and any
`NEXUS_LESSONS.md` still absent from this checkout, dimension
empty). A/B/D leaned on `verify.mjs`'s green tree and emoji
legs rather than a manual re-derive. #12 still the only blocked
AUDIT row. Shipped `plan/CRITIQUE.md`'s top-scoring pending row
— the `.claude/commands/*.md` dead-pointer gap in the
adopt-by-need prune instructions (MED, reproduced and
confirmed real) — over the remaining MED (pnpm/npm allowlist
conflict, larger redesign-shaped fix) and six LOW rows.

Cloud tick 2026-07-17 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (one MED, six
LOW) and shipped the MED — the npm/yarn/bun sed-replace row —
over the AUDIT block's own `[A/E, 2.7]` row (lower score) and the
prune-coverage MED (larger edit, similar impact). Took the
suggested fix's cheaper option: state pnpm as a hard prerequisite
for the unattended path instead of building an unmaintained
worked npm/yarn/bun example. Not a fresh A-G sweep; last full
sweep still today's first tick (above).

Cloud tick 2026-07-17 (third): #12 still the only blocked AUDIT
row. Shipped the last remaining MED in `plan/CRITIQUE.md`'s
queue — the prune-coverage row deferred by the previous tick —
over the AUDIT block's own `[A/E, 2.7]` row (lower score) and six
remaining LOW rows. Extended `playbooks/new-project.md`'s prune
subsection to the five files the finding reproduced as surviving
(`skills/digest.md`, `skills/bootstrap.md`,
`scripts/refresh-critique-session.mjs`,
`scripts/check-secrets-liveness.mjs`, `scripts/stack-lifecycle.mjs`)
and closed a related gap surfaced while fixing it: `templates/README.md`'s
adopt-by-need table never had a row for `skills/bootstrap.md` in
the first place. `plan/CRITIQUE.md`'s pending queue is now six
LOW rows only. Not a fresh A-G sweep; last full sweep still
today's first tick (above).

Cloud tick 2026-07-18: #12 still the only blocked AUDIT row.
Re-scored `plan/CRITIQUE.md`'s remaining queue (all six LOW rows)
and shipped the highest scorer — the step-2 `bearings.md`
placeholder-list mismatch (score ~3.2) — over the AUDIT block's
own `[A/E, 2.7]` row and the other five LOW rows (2.4 and under).
Reproducing the finding surfaced a second, deeper bug in the same
root cause: `<PROJECT_TAGLINE>` was never an actual literal token
in `templates/plan/bearings.md` either (it used a freeform
`<ONE-LINE PRODUCT DESCRIPTION>` placeholder instead), so the
canonical 8-placeholder contract silently no-opped on the tagline
for every adopter — fixed alongside the originally-reported
`<REPO_SLUG>`/`<DEFAULT_BRANCH>` swap. Not a fresh A-G sweep; last
full sweep still 2026-07-17 (above).

Cloud tick 2026-07-18 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (five LOW
rows) and shipped the highest scorer — the README TL;DR vs "How
to use this kit" missing cross-reference (score ~3.6) — over the
AUDIT block's own `[A/E, 2.7]` row and the four remaining LOW
rows (2.4 and under). Not a fresh A-G sweep; last full sweep
still 2026-07-17 (above).

Cloud tick 2026-07-18 (third): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (four LOW
rows) against the AUDIT block's own `[A/E, 2.7]` row (tied
score) and shipped the CRITIQUE row — the step-7
`deploy-check.mjs` redundant-copy instruction (score ~2.7,
oldest pending queue row, dry-run-sourced) — as the cheaper,
more confidently-scoped single-line reword. Not a fresh A-G
sweep; last full sweep still 2026-07-17 (above).

Cloud tick 2026-07-19: #12 still the only blocked AUDIT row.
Re-scored `plan/CRITIQUE.md`'s remaining queue (three LOW rows)
against the AUDIT block's own `[A/E, 2.7]` row (tied score) and
shipped the CRITIQUE row — the step-6 package.json-doesn't-
exist-yet ordering row, oldest pending queue row — over the two
other LOW rows and the tied AUDIT row, continuing the pattern of
favoring the queue on ties (cheaper, single-section edit). Not a
fresh A-G sweep; last full sweep still 2026-07-17 (above).

Cloud tick 2026-07-19 (second): #12 still the only blocked AUDIT
row. Re-scored `plan/CRITIQUE.md`'s remaining queue (two LOW
rows) against the AUDIT block's own `[A/E, 2.7]` row (tied
score). Reproducing the `PROJECT_PKG_PREFIX` row found it
already resolved — an earlier commit (`[x] [2.1]` above) had
already replaced `templates/README.md`'s truncated worked
example with a pointer to `playbooks/new-project.md` §4, whose
one-liners fully cover the placeholder; left it in Pending
rather than closing without a `/critique` pass re-confirming
(this skill doesn't author CRITIQUE rows, per iterate.md §5.4).
Shipped the step-8 sub-agent redundant-copy row instead — tied
score, same ordering-bug class as the already-fixed step-6/
step-7 rows, cheaper single-section edit. Not a fresh A-G sweep;
last full sweep still 2026-07-17 (above).

Digest tick 2026-07-19: fresh A-G sweep (header was 50h old,
past the digest's 48h threshold). A/B (doc-drift,
completeness), C (link + tree hygiene beyond the gate), D
(voice), E (adopter friction), and F (model-id freshness) all
manually re-derived rather than leaning on a <24h-old block.
G stays empty (no sibling lessons files present in this
checkout). #12 still the only blocked AUDIT row. Confirmed
`[A/E, 2.7]` (README's "Files added" checklist undersells
`scripts/`) still reproduces unchanged at `README.md:170-171`.
Found two new rows: README's own kit-tree omits
`PHASE_CANDIDATES.md` and `CURRENT-STATE.md` under
`templates/plan/` (both exist on disk and both are correctly
listed in `templates/README.md`'s own tree — `scripts/verify.mjs`'s
tree-reverse-check doesn't cover `templates/plan`, so the gap is
invisible to the gate), and a fictional example URL in
`templates/skills/bootstrap.md:217` now resolving to an
unrelated live site (plain text in a code block, not a
hyperlink, so the gate's links leg correctly skips it — low
severity). Audit only; digest ships nothing — see
`skills/digest.md` rule 2.

Cloud tick 2026-07-19 (third): #12 still the only blocked AUDIT
row. Shipped the next-highest scorer — the digest-sourced
`[A/C, 3.2]` row (README's kit-tree omitting `PHASE_CANDIDATES.md`
and `CURRENT-STATE.md`) — over the `[A/E, 2.7]` and `[C/F, 1.6]`
rows, both lower-scoring. Not a fresh A-G sweep; last full sweep
still today's digest tick (above).

Cloud tick 2026-07-20: #12 still the only blocked AUDIT row.
`/critique` pass 6 (previous tick) landed two fresh HIGH rows in
`plan/CRITIQUE.md`, both outscoring this block's own `[A/E, 2.7]`
and `[C/F, 1.6]` rows on the shared scale. Shipped the
higher-impact of the two — the `<PROJECT_PKG_PREFIX>` double-`@`
corruption (`templates/skills/ship-a-phase.md:206-207`,
`customization/verify-gate.md:56`) — over the sibling HIGH row
(`playbooks/new-project.md:515-516`'s nonexistent `pnpm
bootstrap:status` command), reasoning the double-`@` bug fails
silently (a plausible-looking but wrong package specifier lands
in an adopter's docs) where the sibling row fails loud ("missing
script", immediately visible and easy to recover from) — same
impact/ease numerically, higher true cost from harder detection.
Not a fresh A-G sweep; last full sweep still the 2026-07-19
digest tick (above).

Cloud tick 2026-07-20 (second): #12 still the only blocked
AUDIT row. Shipped the remaining `plan/CRITIQUE.md` HIGH row —
`playbooks/new-project.md:515-516`'s nonexistent `pnpm
bootstrap:status`/`pnpm bootstrap` commands, deferred by the
previous tick in favor of the `<PROJECT_PKG_PREFIX>` double-`@`
fix — over the AUDIT block's own `[A/E, 2.7]` and `[C/F, 1.6]`
rows, both lower-scoring. `plan/CRITIQUE.md`'s pending queue is
now three LOW/MED rows, no HIGH. Not a fresh A-G sweep; last
full sweep still the 2026-07-19 digest tick (above).

Cloud tick 2026-07-20 (third): #12 still the only blocked
AUDIT row. Re-scored `plan/CRITIQUE.md`'s remaining queue (one
LOW, two MED). The LOW row (`<PROJECT_PKG_PREFIX>` worked
example) reproduced as already resolved (prior tick pointed
`templates/README.md` at `playbooks/new-project.md` §4, which
covers the token) — left in Pending per iterate.md §5.4 (this
skill doesn't author CRITIQUE rows; a `/critique` pass
re-confirms and closes it). Of the two MED rows, both scored
about even; shipped the step-9 `setup/` missing-directory row
over the step-7 "uncomment the matching block" row — its
evidence showed a literal reproduced command failure (`cp:
... No such file or directory`, exit 1) versus step 7's softer
stale-guidance drift, and the fix was a single self-contained
paragraph. Both outscored the AUDIT block's own `[A/E, 2.7]`
and `[C/F, 1.6]` rows. Not a fresh A-G sweep; last full sweep
still the 2026-07-19 digest tick (above).

Cloud tick 2026-07-20 (fourth): #12 still the only blocked
AUDIT row. Shipped the remaining `plan/CRITIQUE.md` MED row —
`playbooks/new-project.md:455-456`'s stale "uncomment the
matching block" instruction, which no longer matches
`deploy-check.mjs`'s live `if (PROVIDER === ...)` branches
selected via `DEPLOY_PROVIDER` — scoring higher (impact 6,
ease 8) than the AUDIT block's own `[A/E, 2.7]` and `[C/F, 1.6]`
rows. The remaining CRITIQUE row (`<PROJECT_PKG_PREFIX>` worked
example, LOW) reproduced as already resolved in a prior tick;
left in Pending per iterate.md §5.4. Not a fresh A-G sweep;
last full sweep still the 2026-07-19 digest tick (above).

Cloud tick 2026-07-21: fresh A-G sweep (header 2 days old, past
iterate.md's 24h threshold). F (model-id freshness) and G
(sibling lessons) re-confirmed clean without a manual re-derive
— ids current, no `../kintilla`/`../semilayer`/`NEXUS_LESSONS.md`
in this checkout. A/B/C/D/E swept fresh: reproduced the
documented copy + placeholder-sweep flow in a scratch repo and
found the sweep's grep/`Get-ChildItem` scope (both one-liners,
`playbooks/new-project.md` §4) omits `./data` even though the
same section's preceding paragraph documents copying
`templates/data/` there for GitHub-as-DB adopters —
`templates/data/README.md` carries live `<PROJECT>`/
`<PROJECT_PKG_PREFIX>` tokens that survive the sweep as written.
Same bug class as two already-fixed CRITIQUE.md rows (`./scripts`,
`./.env.example` scope gaps). Also found `plan/CRITIQUE.md`'s one
pending row (`<PROJECT_PKG_PREFIX>` worked example) already
resolved by a prior tick — left in Pending per iterate.md §5.4.
Shipped the `./data` scope fix (below) over the AUDIT block's own
`[A/E, 2.7]` and `[C/F, 1.6]` rows (both scored lower) and three
new lower-scoring rows found this sweep, now queued to Pending:
`playbooks/existing-project.md`'s empty `plan/phases/` overlay
gap, `README.md:309`'s two unwrapped bullets, and
`playbooks/cloud-loop.md:66`'s stale "three new files" count.

Cloud tick 2026-07-22: fresh A-G sweep (header 1 day old, past
iterate.md's 24h threshold). F and G re-confirmed clean (model
ids current across the repo bar one exception below; no sibling
lessons files in this checkout). Found two new rows, both
scoring below this tick's pick: `playbooks/cloud-loop.md:62`
citing "Sonnet 4.6" where every other model-id reference in the
repo (`march.yml`, `customization/claude-code.md`) says
`claude-sonnet-5`, and `templates/skills/triage.md:137`
hardcoding `blob/main` in a GitHub link instead of
`blob/<DEFAULT_BRANCH>` like its sibling skill templates use.
#12 still the sole blocked row. Shipped the highest-scoring
open row — `[B, 4.5]` `existing-project.md`'s empty
`plan/phases/` gap — over both new rows (4.0 and 3.6) and the
three carried-over LOW/lower-MED rows.

Cloud tick 2026-07-23: #12 still the only blocked AUDIT row
(same `ACTIONS_PAT` scope constraint). Header still <24h old
(last full sweep 2026-07-22), so re-scored rather than
re-swept: this block's own highest scorer,
`[A/E, 4.0]` (triage.md's `blob/main`), tied `[F/A, 3.6]` and
the AUDIT block's other rows, but scored below
`plan/CRITIQUE.md`'s MED sed-backup-suffix row once ease was
weighed in (impact 6, ease 8 -> 4.8) — a reproduced, loud
breaking bug on a claimed-supported platform (stock macOS)
versus a cosmetic wrong-link edge case. Shipped that CRITIQUE
row instead; this block's rows are unchanged and still
Pending.

Cloud tick 2026-07-23 (second): #12 still the only blocked
AUDIT row, unchanged. Header still <24h old, so re-scored:
`[A/E, 4.0]` (triage.md's `blob/main`) is now this block's own
top scorer with no competing CRITIQUE HIGH/MED row pending
(both remaining CRITIQUE rows are LOW). Shipped it.

Cloud tick 2026-07-23 (third): #12 still the only blocked AUDIT
row, unchanged. Re-scored: `[F/A, 3.6]` (cloud-loop.md's stale
"Sonnet 4.6") is now this block's own top scorer, beating
`plan/CRITIQUE.md`'s two remaining LOW rows (~2.4 and ~2.1,
both cosmetic instruction-drift with cheap fixes but lower
impact than a wrong model-id reference on the kit's headline
$0-cost pitch) and the AUDIT block's other rows (2.7, 1.8,
1.6, 1.35). Shipped it.

Cloud tick 2026-07-23 (fourth): #12 still the only blocked AUDIT
row, unchanged. Header still <24h old, so re-scored rather than
re-swept: `plan/CRITIQUE.md`'s `./data`-scope LOW row tied this
block's own `[A/E, 2.7]` (README's "Files added" checklist).
Followed the established tie-break (favoring the queue — see
the 2026-07-19 (second) log line above) and shipped the
`./data` row: a reproduced loud shell error (`grep: ./data: No
such file or directory`, exit 2) on the documented one-liner
for the common no-data-layer case, versus a purely cosmetic doc
undercount. This block's rows are unchanged and still Pending.

Cloud tick 2026-07-24: header 2 days old, past the 24h
threshold, so ran a targeted fresh check rather than a full
manual A-G re-derive: F (model-id freshness, grepped the whole
tree for stale patterns) and G (sibling lessons — still absent)
confirmed clean/empty except one new hit. Found `templates/.github/CLOUD_LOOP.md`
still citing "Sonnet 4.6"/"Opus 4.7" in two sections (the cost
table and "Upgrading the model") — the exact bug class fixed in
`playbooks/cloud-loop.md:62` two ticks ago (2026-07-23 third),
but that fix only touched the internal playbook copy and missed
this template counterpart, which is the one adopters actually
receive (`agents.md` rule 7: templates are the product).
Shipped it over `plan/CRITIQUE.md`'s sole remaining LOW row
(`.claude/` prune-list gap) and this block's own carried-over
rows (2.7, 1.8, 1.6, 1.35) — higher impact (adopter-facing
template, not internal docs) at similar ease (four line edits).
Not a full A-G sweep; A/B/C/D/E leaned on prior sweeps and
`verify.mjs`'s green tree/link/emoji legs.

Cloud tick 2026-07-24 (second): #12 still the only blocked AUDIT
row. Header 2 days old (last full sweep 2026-07-22); ran a
targeted fresh check instead of a full re-derive: F (grepped the
whole tree for stale model-id patterns — the only hits left are
historical prose in `plan/AUDIT.md`/`plan/DIGEST.md`, no live
docs) and G (sibling lessons dirs still absent from this
checkout) both confirmed clean/empty. `plan/CRITIQUE.md`'s sole
remaining LOW row (`.claude/` prune-list gap) tied this block's
own `[A/E, 2.7]` row exactly (impact 3, ease 9). Followed the
established tie-break (favor the queue — see the 2026-07-19
(second) and 2026-07-23 (fourth) log lines above) and shipped
the CRITIQUE row. `plan/CRITIQUE.md`'s pending queue is now
empty. Not a full A-G sweep; A/B/C/D leaned on prior sweeps and
`verify.mjs`'s green tree.

Digest tick 2026-07-24: header was 2 days old, past
`skills/digest.md` §3's 48h staleness threshold, so ran a full
A-G sweep (dispatched to a dedicated audit agent; verify.mjs's
green links/tree/emoji legs covered the mechanical half).
Spot-checked all 4 non-durable Pending rows below — all still
reproduce. Sharpened two: `[C/F, 1.6]` now cites a live `curl`
200 confirming the fictional URL resolves to a real unrelated
site, not just a parked domain; `[A, 1.35]` now has a settled
`next` — `git log --follow -p` on `cloud-loop.md` shows the
"Three new files" header and its 2-entry tree have coexisted
since the doc's first commit, so the fix is correcting the
count to "Two," not restoring a lost file. Widened `[D, 1.8]`'s
evidence to include a third unwrapped bullet at `README.md:324`
found during the same pass. Added three new findings: `[A,
4.8]` (highest score this sweep) — `customization/claude-code.md:310`
teaches the `claude_args: {"model": "..."}` JSON form as the
Cloud-loop model-routing lever, but `.github/workflows/march.yml`
(both nexus's own and the `templates/` mirror) documents from a
real incident that this JSON form silently drops
`permissionMode`, and ships the CLI-flag string form instead —
an adopter following the customization doc's table literally
reintroduces the exact bug the kit already paid to discover;
`[A, 2.4]` — README's own collapsed `skills/` tree
(`README.md:510-511`) omits `skills/digest.md`, even though it
exists on disk and `templates/README.md:41` lists its templated
twin correctly; `[A, 1.6]` — `plan/steps/01_build_plan.md`'s
"Carry-overs" section cites stale queue counts (AUDIT "seeded
with 9" vs. today's 5 Pending rows; PHASE_CANDIDATES.md "holds
4 candidates" vs. today's 20). C (external links, beyond
verify.mjs's relative-link leg), F (model ids), and G (sibling
lessons, still absent) swept clean otherwise. Audit only —
shipped nothing, per digest.md rule 2.

Cloud tick 2026-07-25: #12 still the only blocked AUDIT row.
Header <24h old (last full sweep 2026-07-24 digest tick), so
re-scored rather than re-swept: `plan/CRITIQUE.md`'s Pending
queue is empty (no competing row), so shipped this block's own
top scorer — `[A/E, 2.7]` (README's "Files added" checklist
undersells `scripts/`) — over the four remaining lower-scoring
rows (2.4, 1.8, 1.6, 1.6, 1.35).

Cloud tick 2026-07-25 (second): #12 still the only blocked
AUDIT row (same `workflows`-scope constraint). `[A/E, 2.7]`
now shipped, so this tick took the new top scorer —
`[A, 2.4]` (README's collapsed `skills/` tree omits
`skills/digest.md`) — over the three remaining rows (1.8, 1.6,
1.6, 1.35).

Cloud tick 2026-07-25 (third): #12 still the only blocked AUDIT
row. Header was 27h old (past the 24h threshold), so ran a
targeted fresh check instead of a full manual re-derive: F
(grepped the whole tree for stale model-id patterns — only
historical prose hits in this file and `plan/DIGEST.md`, no
live docs) and G (sibling lessons dirs still absent from this
checkout) both confirmed clean/empty; verify.mjs green
(links/tree/discover/placeholders/anatomy/emoji). Reproduced all
four non-durable Pending rows below — all still current, none
resolved. Shipped this block's own top scorer, `[D, 1.8]`
(README.md's three unwrapped bullets) — `plan/CRITIQUE.md`'s
queue is empty, so no competing row. Not a full A-G sweep; A/B/C/E
leaned on the reproduction pass above and verify.mjs's green
tree.

Cloud tick 2026-07-26: header 2 days old; ran a targeted fresh
check rather than a full manual re-derive: F (grepped the whole
tree for stale model-id patterns — none live), G (sibling
lessons dirs still absent from this checkout) both confirmed
clean/empty; verify.mjs green. Reproduced all three non-blocked
Pending rows below — all still current. `plan/CRITIQUE.md`'s
sole Pending row (LOW, "GitHub-as-DB" unglossed in README's
`/ship-data` row) scored ~2.7 (impact 3, ease 9 — a one-clause
addition), beating this block's own top row (`[A, 1.6]` at 1.6).
Shipped the CRITIQUE row instead.

Digest tick 2026-07-27: header was 3 days old (last full sweep
the 2026-07-24 digest tick), past `skills/digest.md`'s 48h
threshold, so ran a full A-G sweep. Reproduced all three
non-blocked Pending rows below byte-for-byte: `[C/F, 1.6]`
(`ember.vercel.app`) and `[A, 1.35]` ("three new files") are
unchanged; `[A, 1.6]`'s own cited counts had gone stale a
second time since it was last written (it said "5 Pending" /
"20 candidates" — yesterday's digest already flagged this drift
in prose but never edited the row — today's actuals are 4
Pending and 21 candidates), evidence sharpened below.
`plan/CRITIQUE.md`'s Pending queue confirmed empty (all rows
closed as of `34fe6d1`). F: grepped the whole tree for stale
model-id patterns — none live, every hit is
`claude-sonnet-5`/`claude-opus-4-8`/`claude-haiku-4-5`. G:
`../kintilla`, `../semilayer`, and any `NEXUS_LESSONS.md` still
absent from this checkout — dimension checked, not skipped, per
this task's instructions. C: curled every non-vendor external
URL in the tree (`thock.xyz`, `github.com/daretodave/thock`
both 200; `ember.vercel.app` 200, already tracked as `[C/F,
1.6]`; `thock.netlify.app` only survives in this file's own
historical log prose, not live docs) — no new rot. D: leaned on
verify.mjs's green emoji leg plus a manual heading-case and
title-case spot-check across README/playbooks/customization —
no new hits. E: reconfirmed README's command table lists all 15
`templates/claude/commands/` files with correct rows,
`/lessons-pr` correctly excluded (no template counterpart, per
the 2026-07-19 (third) log line above). B: no new
promised-but-missing files found. Found one new row: `[C, 3.6]`
— `scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` array omits
`templates/plan`, the exact directory whose disk/doc mismatch
(`PHASE_CANDIDATES.md` + `CURRENT-STATE.md` missing from
README's kit tree) an earlier tick had to catch by hand
(2026-07-19 digest, `[A/C, 3.2]` in Done below) because the gate
had no reverse-check there. Tested locally: adding
`'templates/plan'` to the array and re-running
`node scripts/verify.mjs` passes clean (35 files
reverse-checked, up from 24, zero new failures) — the
"adopt-by-need annotations would need new handling" concern
noted when that Done-row gap was first spotted no longer holds;
`templates/README.md`'s `plan/` tree block already uses the same
`(omit unless ...)` comment style the other four reverse-checked
dirs use, which the parser already handles. Reverted the local
probe edit before writing this file (verified `git diff
scripts/verify.mjs` clean). Scores above this block's three
carried-over rows (3.6 vs. 1.6 / 1.6 / 1.35); `#12` stays the
durable top row of Pending, still blocked on the same
`workflows`-scope constraint (`ACTIONS_PAT` has no `workflows`
scope). Audit only — shipped nothing, per `skills/digest.md`
rule 2.

Cloud tick 2026-07-28: header <24h old (last full sweep the
2026-07-27 digest tick), so re-scored rather than re-swept:
`plan/CRITIQUE.md`'s Pending queue confirmed empty. #12 stays
the durable blocked row (same `workflows`-scope constraint).
Shipped this block's own top scorer, `[C, 3.6]`
(`scripts/verify.mjs`'s `REVERSE_CHECK_DIRS` omitting
`templates/plan`) — over the three remaining lower-scoring
rows (1.6, 1.6, 1.35).

Cloud tick 2026-07-28 (second): header now 27h old (past the
24h threshold), so ran a targeted fresh check rather than a
full manual re-derive: F (grepped the whole tree for stale
model-id patterns — none live) and G (sibling lessons dirs
still absent from this checkout) both confirmed clean/empty;
verify.mjs green (links/tree/discover/placeholders/anatomy/
emoji, 35 files reverse-checked). `plan/CRITIQUE.md`'s Pending
queue confirmed empty. Reproduced all three non-blocked
Pending rows below — all still current, including `[A, 1.6]`'s
own point: its cited counts ("9"/"4") have drifted again since
last written (today's actuals are 4 AUDIT Pending rows, 21
PHASE_CANDIDATES Pending rows). `[A, 1.6]` and `[C/F, 1.6]`
tied on score; shipped `[A, 1.6]` over `[C/F, 1.6]` and
`[A, 1.35]` — its fix removes the hardcoded counts entirely
(points at the live files instead), so this exact row can't
recur, where `[C/F, 1.6]`'s fix only swaps one string that
could drift again the same way. Not a full A-G sweep; A/B/D/E
leaned on verify.mjs's green tree and prior sweeps.

Cloud tick 2026-07-29: header now >24h old, ran a fresh A-G
sweep (delegated the read-only pass to an agent to protect
context, then verified its top candidate by hand before
shipping). B/C/D/E/F re-confirmed clean (templates/ vs. both
tree diagrams match exactly disk-for-disk both directions;
skills/*.md path references all resolve; voice/wrap sampling
on recently-touched docs clean; model ids all carry the
standing caveat, none stale). G still empty — no sibling
lessons dirs present in this checkout. New A finding: README's
own "What's in this kit" tree lists `agents.md` then jumps
straight to `package.json`, skipping root `CLAUDE.md` — a real
file (`ls` confirms) that's load-bearing (Claude Code only
auto-loads `CLAUDE.md` from repo root, not `.claude/`) and
already named explicitly in this same doc's "Files added"
line 170. `templates/README.md`'s own tree already lists the
templated twin (`claude/CLAUDE.md`) — this was the one root
substrate file the kit's own tree of itself omitted. Scored
[A, 4.5] (impact 5, ease 9) — beats all three standing Pending
rows below, so shipped it this tick instead. Re-verified the
three standing Pending rows are all still current (still
blocked / still accurate); not re-derived from scratch.

Cloud tick 2026-07-29 (second): header <24h old (last full sweep
this same day's first tick, above), so no re-sweep. Neither of
this block's own two Pending rows (`[C/F, 1.6]`, `[A, 1.35]`)
outscored `plan/CRITIQUE.md`'s pending queue, which had one LOW
row not yet re-scored by this file's log:
`concepts/skills-anatomy.md:121`'s "canonical 12 steps" undercount
(impact 3, ease 9 -> 2.7, cheapest and clearest of the three —
reproduced, one-word fix). Mirrored as issue #29 and shipped;
`plan/CRITIQUE.md`'s Pending queue is now empty again. #12 stays
the durable blocked row. This block's own two rows are unchanged
and still Pending.

Cloud tick 2026-07-29 (third): header still <24h old (last full
sweep this same day's first tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue confirmed empty. Reproduced
this block's own top scorer, `[C/F, 1.6]` — `curl` unnecessary,
the domain match at `templates/skills/bootstrap.md:217` still
reads `https://ember.vercel.app` — and shipped it over `[A, 1.35]`
(lower score). #12 stays the durable blocked row.

Cloud tick 2026-07-30: header was ~24h old (last edit
2026-07-29T14:49Z), at the staleness threshold, so ran a fresh
A-G sweep (delegated the read-only pass to an agent to protect
context, then verified the top candidate by hand before
shipping). `node scripts/verify.mjs` green throughout. F (model
ids — only `claude-sonnet-5`/`claude-opus-4-8`/`claude-haiku-4-5`
appear, all correctly captioned) and G (sibling lessons — still
absent from this checkout) both clean/empty. Re-verified `[A,
1.35]` (cloud-loop.md's "three new files" header) still
reproduces unchanged. Found seven new rows, ranked below;
top scorer `[B/E, 6.3]` shipped this tick (below) — a real
functional gap, not cosmetic: `playbooks/existing-project.md`'s
brownfield overlay copied only `templates/scripts/deploy-check.mjs`
where `playbooks/new-project.md` copies the whole `templates/scripts/`
directory, so brownfield adopters silently missed
`loop-issue.mjs`, `notify.mjs`, `bootstrap.mjs`,
`lint-migration.mjs`, `stack-lifecycle.mjs`,
`refresh-critique-session.mjs`, and `check-secrets-liveness.mjs`
— scripts the bulk-copied `templates/skills/` and
`templates/claude/settings.json` (Bash allowlist) already assume
exist. Reproduced in a scratch dir before fixing. The remaining
six new rows are queued to Pending, all lower-scoring:
`[A, 5.4]` (skills-anatomy.md's stale "seven (or eight) skills"
count vs. 15 shipped), `[C, 4.0]` (iterate.md's `ship-data.md §6`
citation should be `§7`), `[D, 3.6]` (three docs' H1s missing
their sibling family's `# Playbook:`/`# Customization:` prefix),
`[A, 2.7]` (three docs describe/quote `templates/claude/CLAUDE.md`
as its old, shorter form), `[C, 2.4]` (two docs cite
`skills/digest.md §4` for content that's actually in `§3` item 4),
and `[A, 2.4]` (`templates/plan/README.md`'s layout tree omits
`CURRENT-STATE.md`).

Cloud tick 2026-07-30 (second): header <24h old (last full sweep
this same day's first tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue confirmed empty. Reproduced
this block's own top scorer, `[A, 5.4]` — `concepts/skills-anatomy.md:374`
still reads "seven (or eight)" against 15 files actually shipped
in `templates/skills/` — and shipped it over the five remaining
lower-scoring rows (4.0, 3.6, 2.7, 2.4, 2.4). #12 stays the
durable blocked row.

Cloud tick 2026-07-31: header <24h old (last full sweep
2026-07-30's first tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue confirmed empty. Shipped
this block's own top scorer, `[C, 4.0]` (`templates/skills/iterate.md`'s
wrong `ship-data.md` section citation) — over the four
remaining lower-scoring rows (3.6, 2.7, 2.4, 2.4). #12 stays
the durable blocked row.

Cloud tick 2026-07-31 (second): header still <24h old (last full
sweep 2026-07-30's first tick, above — now ~24h old but under
the threshold), so no re-sweep. `plan/CRITIQUE.md`'s Pending
queue confirmed empty. Reproduced this block's own top scorer,
`[A, 2.7]` (three docs describe/quote the old, shorter
`templates/claude/CLAUDE.md`) — confirmed the file is 8 lines/2
paragraphs while `README.md:556` and `templates/README.md:44`
both still said "two-line pointer," and
`customization/claude-code.md:287-294` quoted a stale 3-line
block missing the build-plan-pointer line and the second
paragraph — and shipped it over the two remaining rows
(`[C, 2.4]`, `[A, 2.4]`, both lower-scoring) and `[A, 1.35]`.
#12 stays the durable blocked row.

Cloud tick 2026-07-31 (third): header still <24h old (last full
sweep 2026-07-30's first tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue confirmed empty. Two rows
tied at the top, `[C, 2.4]` and `[A, 2.4]`; picked the
adopter-facing one per `bearings.md` decision 1 —
`templates/plan/README.md` ships to every adopter, `plan/DIGEST.md`
/ `plan/PHASE_CANDIDATES.md` are kit-internal — and shipped
`[A, 2.4]` (`templates/plan/README.md`'s layout tree omits
`CURRENT-STATE.md`) over `[C, 2.4]` and `[A, 1.35]`. #12 stays
the durable blocked row.

Cloud tick 2026-08-02: header 3 days old (last full sweep
2026-07-30's first tick, above), past the ~24-72h threshold this
log has used elsewhere, so ran a fresh A-G sweep (delegated the
read-only pass to an agent to protect context). `/march` routed
here via `/iterate` (no pending build-plan phase, critique gate
not due, expand gate already ran this same tick's earlier pass).
Top of queue was `[user-issue #12]` (4.0) but it stays blocked —
`ACTIONS_PAT` still lacks `workflows` scope, confirmed durable
per its own row. Picked the next-highest actionable row instead:
`[user-issue #33]` (3.5) — verified `.claude/hooks/guard.mjs`'s
four `RULES` entries all used `[^|;&]*`, a JS regex negated
class that (unlike `.`) matches newlines, letting the pattern
span logical Bash command boundaries; reproduced live (a
multi-line test command false-blocked as `no-verify` while I was
composing the reproduction case for this very row) before
shipping the fix. F (model ids — only `sonnet-5`/`opus-4-8`/
`haiku-4-5`, all hedged "ids age — check `/model`") and G
(sibling lessons — still absent from this checkout) both
clean/empty. Re-verified `[A, 1.35]` and `[C, 2.4]` still
reproduce unchanged. Found one new row, queued to Pending below
the existing two: `[C, 2.4]` (`templates/skills/triage.md`'s
follow-up-comment citation half-points at `ship-data.md` §6,
which has zero matching content). #12 stays the durable blocked
row.

Digest tick 2026-08-25: header was 23 days old (last full sweep
2026-08-02, above) — far past the 48h refresh threshold
`skills/digest.md` §3 step 5 sets, so ran a fresh A-G sweep
(delegated the read-only pass to an agent to protect context;
`/digest` never ships, so audit-only). `[user-issue #35]` (opened
2026-08-23, cloud push token still lacks `workflows` scope)
confirmed still the durable blocked row — unchanged, untouched.
Re-verified the three open rows from the 2026-08-02 sweep: all
three still reproduce unchanged in substance (only line numbers
drifted, from intervening phases 21-22 growing the cited files) —
`[A, 1.35]` (`playbooks/cloud-loop.md` "three new files" header,
now line 67), `[C, 2.4]` (digest.md §4 mis-citation, now
`plan/DIGEST.md:109` / `plan/PHASE_CANDIDATES.md:533`), `[C, 2.4]`
(triage.md's dead `ship-data.md §6` citation, unchanged at
`templates/skills/triage.md:217-218`). F swept clean except one
new row below; G still empty (no sibling lessons file in this
checkout). Phases 21 (`prompts/`) and 22
(`playbooks/workspace.md`) — the two newest, least-audited
surfaces — checked clean: placeholder table, time estimates,
cross-links, and external links all verified. New row queued:
`[F, 3.6]` — `templates/.github/CLOUD_LOOP.md` hedges "Sonnet 5"
mentions with "(ids age — check `/model`)" but leaves the
adjacent "Opus 4.8" mentions in the same two spots unhedged,
same bug class as two prior Done rows in this file. Per digest's
own rail (`skills/digest.md` §4.2): audit refreshed, nothing
shipped — this is a proposal-and-record tick only.

Digest tick 2026-08-27: header was 51h old (last full sweep the
2026-08-25 digest tick, above), past the 48h threshold, so ran a
fresh A-G sweep (delegated the read-only pass to an agent to
protect context; `/digest` never ships, so audit-only). Both
durable rows confirmed still open and blocked via `gh issue
view`: `[user-issue #40]` and `[user-issue #35]`, unchanged.
Reproduced all four non-durable Pending rows: three unchanged —
`[F, 3.6]` (CLOUD_LOOP.md's Opus-4.8 hedge gap, same lines
34-36/230-232), `[C, 2.4]` (triage.md's dead `ship-data.md §6`
citation, unchanged at lines 217-218), `[A, 1.35]`
(cloud-loop.md's "three new files" header, unchanged at line
67) — and one half-resolved: `plan/DIGEST.md:107`'s half of the
`skills/digest.md §4` mis-citation was already fixed by an
intervening tick (now correctly reads "§3 step 4"), narrowing
the row to `plan/PHASE_CANDIDATES.md:533` alone and re-scoring
it `[C, 2.7]` (impact 3, ease 9 — a single-line reword, cheaper
than the two-file fix it replaces). A-F swept fresh: verify.mjs
green throughout (including `adopt-dryrun.mjs`'s mechanized
check, 56 files swept, 0 unresolved tokens); every non-vendor
external URL in the tree curled 200; README's 15-row command
table cross-checked 1:1 against `templates/claude/commands/`;
both bash/PowerShell placeholder-sweep scopes in
`playbooks/new-project.md` identical (8 tokens × 8 paths each);
whole-repo model-id grep clean bar the standing CLOUD_LOOP hedge
gap above; phases 24-25's newest surfaces
(`scripts/pulse.mjs`, `scripts/adopt-dryrun.mjs`) checked clean
on doc/tree/wiring cross-references. G still empty — no sibling
lessons files (`../kintilla`, `NEXUS_LESSONS.md`) present in
this checkout. No new findings beyond the four rows above — a
genuine clean sweep, not an incomplete pass. Audit only —
shipped nothing, per `skills/digest.md` rule 2.

Cloud tick 2026-09-01: `plan/CRITIQUE.md`'s Pending queue held
one HIGH row (score well above every AUDIT row here, including
the two 4×2/10=0.8 blocked user-issues and the 3.6-scoring `[F]`
row) — the "AskUserQuestion only in /oversight" hard rule
contradicting `templates/skills/bootstrap.md`'s own documented
carve-out. Shipped it: reworded the absolute claim to
"`/oversight` and `/bootstrap`" everywhere it appeared (13
files total, both this repo's own docs and their `templates/`
twins — `templates/` is public API per `agents.md` rule 7, so
its copies needed the identical fix, not just the kit's own
docs). Full rationale and file list in `plan/CRITIQUE.md`'s
Done section. AUDIT block otherwise unchanged; four Pending
rows below not re-verified this tick (queue row took priority
per `skills/iterate.md` §3's shared scoring scale).

Digest tick 2026-09-01: header was 5 days old (last full sweep
the 2026-08-27 digest tick, above), well past the 48h
threshold, so ran a fresh A-G sweep (delegated the read-only
pass to a foreground agent to protect context — `run_in_background:
false` explicitly, since this is a cloud tick and a backgrounded
agent's result would never land before the job exits; see the
`[promoted → phase 20]` candidate in `plan/PHASE_CANDIDATES.md`
this exact trap is scored against). All three durable rows
(`[user-issue #40]`, `[user-issue #35]`, `[user-issue #49]`) still
open — same cloud-push-token workflows-scope gap, unchanged.
Reproduced all five non-durable Pending rows: unchanged in
substance, two with line drift from intervening commits —
`[F, 3.6]` (CLOUD_LOOP.md's Opus-4.8 hedge gap, still lines
33-36/228-232), `[C, 2.7]` (PHASE_CANDIDATES.md's digest.md §4
mis-citation, now line 591), `[C, 2.4]` (triage.md's dead
`ship-data.md §6` citation, now lines 222-223), `[A, 2.4]`
(guard.mjs template drift, unchanged). One new row found and
queued: `[A, 3.2]` — README.md's "What's in this kit" templates
tree (lines 441-501) never picked up `templates/workspace/`,
the 4-file adopt-by-need family phase 33 shipped the same day;
`templates/README.md`'s own tree and README's playbooks section
both already list it correctly, only the templates-tree mirror
missed it — same bug class as this file's prior
PHASE_CANDIDATES/CURRENT-STATE Done row. Six non-durable
candidates now compete for five Top-5 slots; `[A, 1.35]`
(cloud-loop.md's "three new files" header) is still genuinely
valid but the lowest scorer, so it drops from the tracked Top 5
this rewrite — re-discoverable on a future sweep if it's still
open then. A-F otherwise swept clean: verify.mjs green across
all seven legs; no stale model-id strings anywhere in the tree;
external links all resolved; README's placeholder table and
command table both checked 1:1 against disk. G still empty — no
sibling lessons files present in this checkout. `plan/CRITIQUE.md`'s
Pending queue holds 4 LOW dry-run rows not folded into this
file (separate queue, same scoring scale, left for whoever ships
next). Audit only — shipped nothing, per `skills/digest.md` rule 2.

Cloud tick 2026-09-02: header was 26h old (last full sweep the
2026-09-01 digest tick, above), past the 24h threshold, so ran a
targeted fresh check rather than a full manual re-derive:
reproduced `templates/.github/CLOUD_LOOP.md`'s Opus-4.8 hedge
gap (`[F, 3.6]`, below) unchanged at lines 34-36/230-232 — the
top scorer, beating this block's own `[A, 3.2]` (workspace tree
gap, which duplicates `plan/CRITIQUE.md`'s open LOW row of the
same name — left that CRITIQUE row untouched per iterate.md
§5.4, since this skill doesn't author CRITIQUE rows and a
`/critique` pass should confirm+close it) and the three durable
blocked user-issues (#40/#35/#49, same workflows-scope gap,
unchanged). Shipped `[F, 3.6]`. Not a full A-G sweep.

Cloud tick 2026-09-02 (second): header still the 2026-09-01
sweep; re-read the Pending block rather than re-deriving. Top
non-blocked scorer was `[A, 3.2]` (workspace tree gap) — the
three user-issue rows (#40/#35/#49) score impact 4 x ease 2 / 10
= 0.8, well below it, and stay blocked on the same
workflows-scope gap a cloud tick can't fix. Shipped `[A, 3.2]`:
added a collapsed `workspace/` tree entry to README.md's "What's
in this kit" templates block, matching `templates/README.md:84`'s
phrasing. This is the same finding `plan/CRITIQUE.md`'s open LOW
row describes, so that row also moves Pending to Done this tick
per iterate.md §8. Not a full A-G sweep.

Cloud tick 2026-09-02 (third): header still the 2026-09-01
sweep; no re-derive. `plan/CRITIQUE.md`'s Pending queue held four
LOW rows; the highest-scoring, `[LOW, 2.7]` (README.md:242's
"2-4 hours of setup" vs. the reconciled "2-3 hours" figure at
`playbooks/new-project.md:4`), tied this block's own top scorer
`[C, 2.7]` (PHASE_CANDIDATES.md's `digest.md §4` mis-citation).
Followed the established tie-break (favor the queue — see the
2026-07-19 (second), 2026-07-23 (fourth), and 2026-07-24 (second)
log lines above) and shipped the CRITIQUE row. Verified the
comparison point still held even though the row's originally-cited
README.md:161 line had since been reworded away by an intervening
fix (README's line numbers had also drifted 341 -> 242).
`plan/CRITIQUE.md`'s Pending queue is now three LOW rows. This
block's own rows (`[C, 2.7]`, `[C, 2.4]`, `[A, 2.4]`) and the
three durable blocked user-issues are unchanged and still Pending.
Not a full A-G sweep.

Cloud tick 2026-09-03: header still the 2026-09-01 sweep (now
~2 days old); no re-derive. `plan/CRITIQUE.md`'s remaining
Pending queue held three LOW rows; the highest-scoring,
`[LOW, 2.7]` (README.md:189's "Posture-gated" used with no
definition or link), tied this block's own top scorer
`[C, 2.7]` (PHASE_CANDIDATES.md's `digest.md §4`
mis-citation). Followed the established tie-break (favor the
queue — see the 2026-07-19 (second), 2026-07-23 (fourth),
2026-07-24 (second), and 2026-09-02 (third) log lines above)
and shipped the CRITIQUE row: linked "Posture-gated" in
README.md's `/expand` command-table row to
`templates/plan/bearings.md#plan-expansion-posture`, matching
the same table's existing `/ship-data` →
`customization/data-layer.md` link pattern.
`plan/CRITIQUE.md`'s Pending queue is now two LOW rows. This
block's own rows (`[C, 2.7]`, `[C, 2.4]`, `[A, 2.4]`) and the
three durable blocked user-issues (#40, #35, #49) were not
re-verified this tick — not a full A-G sweep.

Cloud tick 2026-09-03 (second): header still the 2026-09-01
sweep; no re-derive. `plan/CRITIQUE.md`'s remaining Pending
queue holds two LOW rows (`README.md:48`'s undefined "canonical
sibling" and `README.md:603-605`'s 2-of-8 placeholder list),
both scoring ~2.4 (impact 3, ease 8) — below this block's own
top scorer, `[C, 2.7]` (`plan/PHASE_CANDIDATES.md:591`'s stale
`digest.md §4` citation). Reproduced: the "starved queue"
language the row describes lives in `skills/digest.md` at line
66, inside step 4 of `## 3. The procedure` (the numbered list
runs lines 28-76), not under `## 4. Hard rules` (lines 77-96,
confirmed empty of that phrase). Shipped the fix. This block's
remaining rows (`[C, 2.4]`, `[A, 2.4]`) and the three durable
blocked user-issues (#40, #35, #49) unchanged and still Pending.
Not a full A-G sweep.

Cloud tick 2026-09-04: header still the 2026-09-01 sweep (now ~3
days old); ran a targeted fresh check rather than a full manual
re-derive: reproduced all four non-durable Pending rows —
`[C, 2.4]` (triage.md's dead `ship-data.md §6` citation, still
lines 222-223) and `[A, 2.4]` (guard.mjs template drift, still
missing the `\n` exclusion in all four `RULES` regexes) both
unchanged; `plan/CRITIQUE.md`'s two LOW rows also both unchanged
(only line drift: "canonical sibling" now at README.md:48,
placeholder-undercount row now at README.md:529-530). All four
non-durable candidates tied at ~2.4 (impact 3, ease 8). Followed
the established tie-break (favor the queue — see the 2026-07-19
(second), 2026-07-23 (fourth), 2026-07-24 (second), and
2026-09-02 (third) log lines above) and, between the two tied
CRITIQUE rows, picked "canonical sibling" over the placeholder
row: it sits earlier in the reader's path (the second thing a
stranger reads, right after the opening pitch, versus a step-5
instruction that already hedges "per the playbook"), and the fix
is self-consistent with the same sample transcript's own "phase
8" references rather than introducing new prose. Shipped:
changed README.md's sample `/march` transcript from "Read brief,
canonical sibling" to "Read brief, phase 8".
`plan/CRITIQUE.md`'s Pending queue is now one LOW row. This
block's own two rows (`[C, 2.4]`, `[A, 2.4]`) and the three
durable blocked user-issues (#40, #35, #49) unchanged and still
Pending. Not a full A-G sweep.

Cloud tick 2026-09-04 (second): header still the 2026-09-01
sweep (now ~3 days old); no re-derive. `plan/CRITIQUE.md`'s
last remaining LOW row (step 5's 2-of-8 placeholder undercount,
score ~2.4) tied this block's own two rows (`[C, 2.4]` triage.md
citation, `[A, 2.4]` guard.mjs template drift). Followed the
established tie-break (favor the queue — see the 2026-07-19
(second), 2026-07-23 (fourth), 2026-07-24 (second), and
2026-09-02 (third) log lines above) and shipped the CRITIQUE
row: reworded README.md step 5 to "Replace all 8 placeholders
(see `templates/README.md`)" instead of naming 2 of 8.
`plan/CRITIQUE.md`'s Pending queue is now empty. This block's
own two rows (`[C, 2.4]`, `[A, 2.4]`) and the three durable
blocked user-issues (#40, #35, #49) unchanged and still Pending.
Not a full A-G sweep.

Digest 2026-09-04: header was ~3 days stale (>48h); ran the full
A-G sweep this time. Durable rows (#40, #35, #49) reconfirmed
unchanged and still blocked. Reconfirmed both non-durable rows
still accurate and unfixed: `[C, 2.4]` (triage.md's dead
`ship-data.md §6` citation) and `[A, 2.4]` (guard.mjs template
missing the `\n`-exclusion hardening). Fresh sweep across A-G
found one new row: README.md:565-568's "nexus runs on nexus"
section says `verify.mjs` runs "six hermetic legs" and lists
six, but the gate has shipped seven since phase 29 (`dualshell`
added, uncounted here) — `[A, 3.6]` (impact 4, ease 9).
B/D/E/F came back clean this pass (checked scripts/ vs README's
tree, emoji/wrap/voice spot-check, placeholder table incl. the
phase-33 workspace placeholders, model-id greps). G stayed empty
— no sibling checkouts or `NEXUS_LESSONS.md` present locally.
Also noted, sub-threshold: `CLAUDE.md`'s "next pending work is
the first `[ ]` row" line is now stale prose (zero `[ ]` rows
remain in the build plan, all phases `[x]` or `[blocked:]`) but
`/march`'s real dispatch already falls through to `/iterate`
correctly, so this is wording drift, not a functional gap — left
unscored, worth folding into a future CLAUDE.md pass rather than
a dedicated row. Top score is now `[A, 3.6]`; picked up next by
whichever skill claims the queue.

Cloud tick 2026-09-05: header <24h old (last full sweep the
2026-09-04 digest tick, above), so no re-sweep. `plan/CRITIQUE.md`'s
Pending queue held one MED row (score ~5.4, impact 6 x ease 9 —
a single self-contained playbook fix) beating this block's own
top scorer `[A, 3.6]` and `[user-issue #53]` (impact 4, ease 8 ->
3.2), so shipped the CRITIQUE row: `playbooks/new-project.md`
step 6 claimed `package.json` doesn't exist until phase 1
scaffolds it, but step 7 already creates one (wiring
`deploy:check`) before phase 1 ships — so the Day-1 checklist's
`pnpm verify` runs (may fail; runs)` item had nothing to run
against. Reproduced: step 7's json snippet indeed omitted the
`verify` script step 6 describes. Fixed by having step 7 wire
both the step-6 verify-gate scripts and `deploy:check` into the
same `package.json` edit, and repointed step 6's forward
reference from "phase 1 scaffolds it" to "step 7 creates it".
`plan/CRITIQUE.md`'s Pending queue is now two LOW rows. This
block's own three rows (`[A, 3.6]`, `[C, 2.4]`, `[A, 2.4]`) and
the four durable blocked/process user-issues (#40, #35, #49,
#53) unchanged and still Pending. Not a full A-G sweep.

Cloud tick 2026-09-05 (second): header still <24h old (last full
sweep the 2026-09-04 digest tick, above), so no re-sweep. An
intervening tick shipped one of `plan/CRITIQUE.md`'s two LOW
rows (the "working `pnpm verify`" pre-phase-1 claim), leaving one
LOW (~2.7, README's shorthand-terms forward reference) — below
this block's own top scorer, `[A, 3.6]` (README's verify-gate leg
undercount) and `[user-issue #53]` (3.2), so shipped `[A, 3.6]`:
reproduced via `node scripts/verify.mjs` (prints seven legs,
README said six) and fixed the count + leg list. This block's
remaining two rows (`[C, 2.4]`, `[A, 2.4]`) and the four durable
blocked/process user-issues (#40, #35, #49, #53) unchanged and
still Pending. Not a full A-G sweep.

Cloud tick 2026-09-06: header now ~2 days old (last full sweep
the 2026-09-04 digest tick) but no re-sweep this tick either —
`plan/CRITIQUE.md`'s one remaining LOW row (~2.7, README's
shorthand-terms forward reference) and this block's two
remaining scored rows (`[C, 2.4]`, `[A, 2.4]`) all sit below
`[user-issue #53]` (impact 4, ease 8 -> 3.2), the top scorer now
that `[A, 3.6]` shipped last tick. Shipped `[user-issue #53]`:
added the scope sentence to `skills/critique.md` step 3 per its
own `next` field. `[user-issue #40]`, `#35`, `#49` (0.8 each,
same cloud-push-token-workflows-scope root cause, still blocked
pending a human/local session) unchanged and still Pending.

Cloud tick 2026-09-06 (second, header >24h old — fresh A-G
sweep): freshness (F) checked for stale model ids across `*.md`
— none found. B/D/E came back clean (no new unshipped promises,
no fresh wrap/voice/emoji spot-check hits, placeholder table
still 8 entries). G stayed empty — no sibling checkouts present.
Promoted the sub-threshold note from the 2026-09-04 sweep
(above): `CLAUDE.md`'s "next pending work is the first `[ ]`
row" line has read as stale prose since the build plan drained
to zero `[ ]` rows, and two prior sweeps left it unscored
hoping a bigger CLAUDE.md pass would absorb it — it never came,
so scored it properly this time: `[A, 3.6]` (impact 4 — a cold
agent's very first pointer file gives a dead instruction; ease
9 — one-line edit), beating both this block's remaining rows
(`[C, 2.4]`, `[A, 2.4]`) and `plan/CRITIQUE.md`'s sole pending
LOW row (~2.7). Shipped: reworded the line to name `/iterate`'s
audit queue as the fallback once `[ ]` rows run out, citing
`skills/march.md` §3 for the real dispatch logic. `[C, 2.4]`
and `[A, 2.4]` unchanged and still Pending; the three blocked
user-issues (#40, #35, #49) unchanged.

Cloud tick 2026-09-06 (third): header still <24h old (last full
sweep this same day's second tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s one remaining LOW row (~2.7, README's
shorthand-terms forward reference at README.md:43-53) beat
this block's own two remaining scored rows (`[C, 2.4]`
triage.md citation, `[A, 2.4]` guard.mjs template drift) and
the three durable blocked user-issues (#40, #35, #49, 0.8
each). Shipped the CRITIQUE row: added a one-line pointer right
after the `/march` tick transcript naming `Triage`/`Critique`/
`Expand`/`Dispatch` as the slash commands defined in "What you
get," below — reproduced the gap first (the table lives at
README.md:187-190, well after the transcript at :43-53).
`plan/CRITIQUE.md`'s Pending queue is now empty. This block's
remaining rows (`[C, 2.4]`, `[A, 2.4]`) and the three durable
blocked user-issues (#40, #35, #49) unchanged and still
Pending. Not a full A-G sweep.

Cloud tick 2026-09-06 (fourth): header still <24h old (last full
sweep this same day's second tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue confirmed empty (previous
tick drained it). This block's own two remaining rows,
`[C, 2.4]` (triage.md's dead `ship-data.md §6` citation) and
`[A, 2.4]` (guard.mjs template drift), tied on score. Reproduced
both before picking: `[A, 2.4]` is a functional bug, not just a
doc mismatch — `templates/claude/hooks/guard.mjs`'s `RULES`
regexes still lacked the `\n`-exclusion that the kit's own
`.claude/hooks/guard.mjs` gained fixing `[user-issue #33]`
(2026-08-02), so adopters using the templated guard hook could
hit the exact same false-positive (a multi-line Bash command
false-blocked as `no-verify`/`force-push`/etc. via a coincidental
later line) already fixed and self-tested here. Ranked that above
the triage.md citation's cosmetic wrong-link impact and shipped
it: ported the `\n`-exclusion to all nine `[^|;&]*` occurrences in
`templates/claude/hooks/guard.mjs` and added the matching
multi-line self-test case; both files' `self-test` green
afterward. `[C, 2.4]` and the three durable blocked user-issues
(#40, #35, #49) unchanged and still Pending. Not a full A-G
sweep.

Cloud tick 2026-09-07: header ~19h old (last full sweep
2026-09-06's second tick, above), under the 24h threshold, so no
re-sweep. `plan/CRITIQUE.md`'s Pending queue confirmed empty.
This block's own sole remaining scored row, `[C, 2.4]`
(triage.md's dead `ship-data.md §6` citation), was the only
actionable candidate — the three durable blocked user-issues
(#40, #35, #49) score 0.8 each and stay blocked on the same
cloud-push-token workflows-scope gap a cloud tick can't fix.
Reproduced: `templates/skills/triage.md:222-223` still cited
`skills/ship-data.md §6`; grepped that file's §6 for
"trailer"/"Closes"/"commit body"/"issue" — zero hits, confirming
the citation points at content that doesn't exist there.
Confirmed the kit's own `skills/triage.md` never had this line
(template-only drift). Shipped: dropped the dead half of the
citation, leaving `skills/iterate.md §5` alone. `plan/AUDIT.md`'s
Pending queue is now three durable blocked user-issues only.

Digest tick 2026-09-08: header was ~51h old (last full sweep
2026-09-06's second tick, above), past `skills/digest.md` §3's
48h threshold, so ran a fresh A-G sweep (delegated the
read-only pass to a foreground agent to protect context;
`node scripts/verify.mjs` confirmed green throughout, all seven
legs). A/B/C/D/E/F all swept clean: README's kit tree and
15-row command table both cross-checked 1:1 against disk;
`CLAUDE.md`'s build-plan pointer and `<WORKSPACE_ORG>`'s
replace-step (both prior AUDIT fixes) confirmed holding; no
dead external links beyond historical log prose; no heading-case
or wrap outliers on recently-touched files; no stale model-id
strings anywhere live. G still empty — no `../kintilla`,
`../semilayer`, or `NEXUS_LESSONS.md` in this checkout. One
finding re-surfaced: `playbooks/cloud-loop.md:66`'s "Three new
files" header still sits atop a 2-entry tree (`march.yml`,
`CLOUD_LOOP.md`) — first found 2026-07-19/scored `[A, 1.35]`,
reproduced clean through 2026-08-27, then dropped off the
tracked Top 5 in the 2026-09-01 digest tick for scoring lowest
among six competing candidates (never fixed, just deprioritized).
Re-scored `[A, 1.8]` (impact 2, ease 9 — a one-word "Three" ->
"Two" edit) and re-added below. All four durable rows
(`#54`, `#40`, `#35`, `#49`) reconfirmed open and unchanged via
`gh issue view`. `plan/CRITIQUE.md` holds two fresh Pending rows
from today's `/critique` pass 15 (one HIGH, one MED) that will
compete with this block on the shared scale next tick — not
duplicated here, per `skills/iterate.md` §3. Audit only —
shipped nothing, per `skills/digest.md` rule 2.

Cloud tick 2026-09-08 (second): header still <24h old (last full
sweep today's digest tick, above), so no re-sweep.
`plan/CRITIQUE.md`'s Pending queue held one fresh HIGH row from
today's `/critique` pass 15 (score ~7.2, impact 9 x ease 8 —
`playbooks/existing-project.md:79`'s bad path + missing dir),
beating this block's own top scorer `[A, 1.8]` (cloud-loop.md's
"Three new files" header) and all four durable blocked/process
rows (`#54` at 0.4, `#40`/`#35`/`#49` at 0.8 each). Shipped the
CRITIQUE row; full rationale in `plan/CRITIQUE.md`'s Done
section. `plan/CRITIQUE.md`'s Pending queue is now one MED row.
This block's own row (`[A, 1.8]`) and the four durable rows
unchanged and still Pending. Not a full A-G sweep.

Cloud tick 2026-09-09: header still <24h old (~13h since the
2026-09-08 digest sweep), so no re-sweep. `plan/CRITIQUE.md`'s
one remaining Pending row (MED, `playbooks/new-project.md`
steps 2/3's prose "Copy X to Y" instructions failing on a
fresh repo — no `plan/`/`plan/steps/` yet) scored ~5.4 (impact
6 x ease 9 — a two-line prose-to-fenced-command swap, same
pattern already used for step 9's `setup/` gap), beating this
block's own `[A, 1.8]` row and the four durable blocked
user-issue rows (`#54` at 0.4, `#40`/`#35`/`#49` at 0.8 each,
all still needing a local/human session per their own `next`).
Shipped the CRITIQUE row; full rationale in `plan/CRITIQUE.md`'s
Done section. `plan/CRITIQUE.md`'s Pending queue is now empty.
This block's own row (`[A, 1.8]`) and the four durable rows
unchanged and still Pending. Not a full A-G sweep.

Cloud tick 2026-09-09 (second): header ~22h old (last full sweep
the 2026-09-08 digest tick, above), under the 24h threshold, so
no re-sweep. `plan/CRITIQUE.md`'s Pending queue confirmed empty.
This block's own sole scored row, `[A, 1.8]`
(`playbooks/cloud-loop.md:66`'s "Three new files" header sitting
atop a 2-entry tree), was the only actionable candidate — the
four durable rows (`#54` at 0.4, `#40`/`#35`/`#49` at 0.8 each)
stay blocked on the same cloud-push-token workflows-scope gap a
cloud tick can't fix. Reproduced: line 66 unchanged. Shipped it:
"Three" -> "Two". Mirrored as issue #55. `plan/AUDIT.md`'s
Pending queue is now the four durable blocked/process rows only.

Cloud tick 2026-09-09 (third): header was ~31h old (last full
sweep the 2026-09-08 digest tick, above), past the 24h threshold,
so ran a fresh A-G sweep (delegated the read-only pass to a
foreground agent to protect context; `node scripts/verify.mjs`
confirmed green throughout, all seven legs). B/C/D swept clean:
README-vs-`templates/` tree cross-check matched disk-for-disk
both directions (verify's `tree` leg already mechanizes this); no
dead external links beyond historical log prose; no heading-case/
wrap/emoji outliers on recently-touched files. F (freshness)
checked, not skipped — no stale model-id strings anywhere live;
separately confirmed the Aug-14 Claude Code auto-mode permission
gap is already tracked as `plan/PHASE_CANDIDATES.md:639` (score
6.5, awaiting `/oversight` promotion), not a new finding. G
stayed empty — no `../kintilla`, `../semilayer`, or
`NEXUS_LESSONS.md` anywhere on disk. The four durable rows (`#54`,
`#40`, `#35`, `#49`) reconfirmed unchanged, all still below the
3.0 actionability threshold (0.4/0.8 each). One new finding:
`[E, 4.0]` — `playbooks/existing-project.md`'s step-1
`CURRENT-STATE.md` copy (`mkdir -p plan && cp ...`, kept as inline
code by the 2026-09-08 fix specifically to dodge the `dualshell`
leg) had zero PowerShell twin, unlike the identical "target dir
doesn't exist yet" bug class in `new-project.md` steps 2/3 fixed
one commit earlier today (`64bf2e9`) — that fix instead used
fenced bash+PowerShell twin blocks, the newer and now-established
pattern for this bug class. Reproduced the gap (no Windows-native
guidance anywhere in this file or `windows-notes.md`'s "See also"
list, which only covers §3's overlay step, not §1's copy) and
shipped the fix (below), converting the inline dodge to the same
fenced-twin pattern. `node scripts/verify.mjs` green after
(`dualshell` leg now checks 9 blocks, up from 8). This block's
Pending queue unchanged — four durable blocked/process rows only.

Cloud tick 2026-09-10: header was ~24h old (last full sweep the
above 2026-09-09 third tick), so ran a fresh A-G sweep (delegated
the read-only pass to a foreground agent to protect context).
`node scripts/verify.mjs` confirmed green throughout (all seven
legs). `plan/CRITIQUE.md` Pending confirmed empty. G stayed empty
(no sibling lessons files reachable). F clean (no stale model
ids). C clean (every live external URL curled 200). The four
durable rows (`#54`, `#40`, `#35`, `#49`) reconfirmed unchanged,
not re-verified in depth. One new finding scored above threshold:
`[A/B, 7.2]` — `templates/claude/hooks/guard.mjs`'s commit-verb
`VERBS` allowlist was missing `critique` and `phases`, the commit
verbs `templates/skills/critique.md` and
`templates/skills/plan-a-phase.md` (both core, unconditionally-
shipped per `templates/README.md`'s tree, no `(omit unless...)`
annotation) document and use. An adopter installing the guard
hook (the recommended default) and running either skill exactly
as documented would have every such commit blocked by the hook's
own rule — confirmed by reading both skill files' commit-message
lines and the `VERBS` array; `scripts/verify.mjs` never inspects
`guard.mjs`, so nothing mechanical caught it. Same drift class as
a prior Done row that flagged the kit's own `.claude/hooks/
guard.mjs` vs. the template's diverging, but explicitly scoped
that finding away from this exact gap. Shipped the fix (below):
added both verbs plus matching self-test cases to
`templates/claude/hooks/guard.mjs` (mirroring the kit's own
`.claude/hooks/guard.mjs`, which already carried both), and added
the two rows to `templates/plan/bearings.md`'s commit-verb table.
`node templates/claude/hooks/guard.mjs self-test` green after.
Mirrored as issue #56. A second, lower-confidence `E`-dimension
finding (`playbooks/hands-off.md` Step 1 phrasing re-copying
already-adopted files) was left unshipped — one finding per tick.
This block's Pending queue unchanged — four durable blocked rows
only.

Cloud tick 2026-09-12: header was >24h old (last full sweep the
2026-09-10 tick above), so re-checked freshness (F) and
placeholder/link spot-checks rather than a full re-delegated
sweep. F: `templates/.github/CLOUD_LOOP.md`'s "Opus 4.8" /
"Sonnet 5" cost-table and upgrade-path mentions are both already
hedged inline ("ids age — check `/model`"), so left as-is rather
than chasing a moving id string a second time in the same tick.
The four durable AUDIT rows (`#54`, `#40`, `#35`, `#49`) all
still blocked on the same cloud-token `workflows`-scope gap, none
actionable from this tick. `plan/CRITIQUE.md` Pending held one
actionable MED row — README.md's `<your-fork-or-mirror>`
adopt-prompt placeholder with no inline replace instruction —
scoring above the durable rows' ~0.4-0.8 (all blocked regardless
of score). Shipped it: added a one-line callout above each of
the three occurrences (step-1 clone block, adopt-prompt paste
block, pitch-prompt paste block) telling the reader to swap the
token for their own fork/mirror URL. `node scripts/verify.mjs`
green (all seven legs). One LOW CRITIQUE row (`bearings.md` used
before defined) left unshipped — one finding per tick.

Cloud tick 2026-09-12 (second): header still the 2026-09-10 full
sweep (~2 days old); no re-derive. The four durable AUDIT rows
(`#54`, `#40`, `#35`, `#49`) all re-confirmed still open via `gh
issue view` and still blocked on the same cloud-token
`workflows`-scope gap — none actionable from a cloud tick,
scoring well under 3.0 regardless (impact 2-4 x ease 2 / 10).
`plan/CRITIQUE.md`'s Pending queue held its one remaining row,
`[LOW]` (`bearings.md` used before defined) — the only
actionable finding this tick, so shipped it over manufacturing
new churn: the term's real first reader-facing use is
README.md:288 (`bearings.md` stub), not the URL-only hit at old
line 193, which reads as "Posture-gated" not "bearings.md."
Added a defining parenthetical there. `node scripts/verify.mjs`
green (all seven legs). `plan/CRITIQUE.md`'s Pending queue is
now empty.

Cloud tick 2026-09-12 (third): header was 2 days past the last
full sweep (2026-09-10) and `plan/CRITIQUE.md`'s queue is empty,
so ran a fresh A-G sweep via delegated sub-agent rather than
another freshness-only spot-check. Found three new, non-
duplicate findings (all score 3.6), cross-checked against the
four durable Pending rows (`#54`/`#40`/`#35`/`#49`, all still
blocked, unchanged) and the Done log to rule out re-flagging
recent fixes. Shipped the cleanest: `CONTRIBUTING.md`'s
new-playbook step cited "Two paths to start," a README heading
renamed to "Three paths to start" when the `pre-spec.md` path
was added — no ambiguity, no counter-context. Left two for a
future tick (below): `intervention-spectrum.md`'s dispatcher
verb list undercounts to five, and a `customization/
claude-code.md` model-id table cell initially flagged as
missing the "ids age" hedge — re-checked and downgraded: the
same doc already carries a doc-wide hedge ("including this
one") 15 lines below the table, so it's weaker evidence than
the other two and likely not worth a tick on its own merit.

Cloud tick 2026-09-14: header was 2 days old (last full sweep
2026-09-12 (third), above), past the 24h threshold, so ran a
fresh A-G sweep (delegated to a foreground sub-agent to protect
context). Confirmed clean: model ids consistent throughout
(`claude-sonnet-5`/`claude-opus-4-8`/`claude-haiku-4-5`, no
stale hits); README/`templates/README.md` tree diagrams match
disk exactly both ways; `guard.mjs`/`settings.json`/the
commit-verb table's nexus-vs-generic split is the intentional
self-vs-template divergence, not drift; every local anchor link
resolves; every external URL curled 200 except a Cloudflare
dashboard link that 403s behind its own login wall (not link
rot — a signed-in user reaches it fine); no new wrap violations
beyond the long-standing single-unbreakable-token overflows
`plan/bearings.md`'s wrap rule already exempts.
`plan/CRITIQUE.md`'s Pending queue confirmed empty. The five
standing Pending rows below (`[F, ~2]`, `#54`, `#40`, `#35`,
`#49`) all reproduce unchanged; none scores >= 3.0 (the three
durable blocked issues sit at impact 4 x ease 2 / 10 = 0.8,
`#54` at 0.4, `[F, ~2]` already downgraded to marginal). Per
`skills/iterate.md` §6 failure mode 1 (no finding >= 3.0,
posture bold), dispatched to `skills/expand.md` instead of
manufacturing churn — see `plan/PHASE_CANDIDATES.md`'s pass 12
entry for what that pass found.

Cloud tick 2026-09-15: header still the 2026-09-14 full sweep
(<24h old relative to that sweep's own findings), and
`/critique` pass 17 (2026-09-14 23:01, after the sweep) filed
exactly one new Pending row in `plan/CRITIQUE.md` — a MED
instruction-drift finding: `templates/env/env.example`'s
`DEPLOY_PROVIDER` "Supported:" comment and commented `.env`
blocks covered 5 of the 8 providers `deploy-check.mjs`
implements, missing Cloudflare Pages/Render/Fly.io despite
`playbooks/ci-providers.md` already documenting their exact var
names. The five standing AUDIT rows below (`[F, ~2]`, `#54`,
`#40`, `#35`, `#49`) all re-confirmed unchanged and still score
under 1 (three durable issues blocked on the same cloud-token
workflows-scope gap, `#54` a closeable non-recurrence note,
`[F, ~2]` already downgraded) — none actionable or competitive
against the new MED. Shipped the CRITIQUE row: widened the
"Supported:" line to all 8 values and added three new commented
blocks matching the existing dash-header style, using
`ci-providers.md`'s var names and get-token URLs verbatim.
`node scripts/verify.mjs` green (all seven legs).
`plan/CRITIQUE.md`'s Pending queue is empty again.

Cloud tick 2026-09-16: header was 2 days old (last full sweep
2026-09-14, above), past the 24h threshold, so ran a fresh A-G
sweep (delegated to a foreground sub-agent to protect context).
`plan/CRITIQUE.md`'s Pending queue confirmed empty. The five
standing Pending rows below (`[F, ~2]`, `#54`, `#40`, `#35`,
`#49`) all re-confirmed unchanged, still under 1. Found one new
finding: `templates/agents.md`'s Skills table and Invocation
list — the file this repo's own `agents.md` calls "the entry
point for any AI agent landing in this repo cold" — omitted 6
of the 15 skills `templates/skills/` ships, including `jot`,
which carries no "(omit unless...)" annotation in
`templates/README.md`'s tree (i.e. every adopter gets it
unconditionally) yet was entirely missing from its own
rulebook. The other five (`ship-migration`, `ship-asset`,
`moderate`, `digest`, `bootstrap`) are conditional, but
`ship-data` — equally conditional ("omit if no structured data
layer") — was already listed, so the omission was an
inconsistency, not an intentional opt-in gate. Shipped: added
all six rows to both the Skills table and the Invocation block
in `templates/agents.md`, each annotated with its adoption
condition to match `ship-data`'s existing style.
`node scripts/verify.mjs` green (all seven legs).

Cloud tick 2026-09-17: header was 3 days old (last full sweep
2026-09-14; the 2026-09-16 tick above ran fresh but shipped a
CRITIQUE-sourced row, not this block's own), past the 24h
threshold, so ran a fresh A-G sweep (delegated to a foreground
sub-agent to protect context). `plan/CRITIQUE.md`'s Pending
queue confirmed empty. The four standing blocked/low-value rows
below (`[F, ~2]`, `#54`, `#40`, `#35`, `#49`) not re-verified
this tick — none scored competitively against the sweep's fresh
finds. Verify gate green throughout (all seven legs, plus
`adopt-dryrun` clean). Found three new rows; top scorer shipped
this tick: `[A, 4.8]` — `templates/claude/commands/march.md`
was the sole command file in `templates/claude/commands/` that
duplicates its skill's dispatch chain inline instead of pointing
to it (every sibling command file — `iterate.md`, `expand.md`,
`critique.md`, `ship-a-phase.md` — uses a "Procedure: §N of
skill" pointer). That duplication is exactly why it silently
missed the `/expand` step: `templates/skills/march.md` gained
step 3c on 2026-07-02, but the command file's frontmatter
description and five-step inline list were never updated,
still reading "triage → critique → phase → data → iterate" two
months later. Confirmed via `git log` the command file hasn't
changed since its original scaffold. Fixed by replacing the
duplicated list with the same pointer pattern every sibling
command file already uses (matching this kit's own
`.claude/commands/march.md`, which already does this correctly
and already lists expand) — this closes the finding and removes
the class of bug, not just this one instance. Two more rows
queued to Pending below, both lower-scoring: `[A/B, 4.5]`
(`templates/agents.md`'s Sub-agents table omits the shipped
`brander` agent) and `[A/E, 3.0]` (`playbooks/ci-providers.md`'s
self-hosted health-check section never tells the reader to set
`DEPLOY_PROVIDER=health-check`, plus a misleading
`HEALTH_CHECK_EXPECT=200` example — it's matched as a body-text
substring, not a status code). Not a full re-verification of the
standing blocked rows; A-G otherwise swept fresh per the
sub-agent's report (anchor links, external links, model-id
hedges, and dimension G — still no sibling lessons files — all
checked clean).

Cloud tick 2026-09-17: header 5 days old (last full sweep
2026-09-12, above); neither the critique gate (62h/7 commits
since last pass) nor the expand gate (~3 days/7 commits since
last pass) was due, so `/march` routed here via `/iterate`.
`plan/CRITIQUE.md`'s Pending queue confirmed empty — no
competing row. Reproduced this block's own top scorer,
`[A/B, 4.5]` (`templates/agents.md`'s Sub-agents table omitting
the shipped `brander` agent) — still missing, confirmed against
`templates/claude/agents/` (4 files on disk) and README.md's
correct phrasing — and shipped it over the remaining three
lower-scoring rows (`[A/E, 3.0]`, `[F, ~2]`, plus the durable
blocked/low-value user-issue rows). Not a full A-G sweep.

Digest tick 2026-09-17: header was 5 days old (last full sweep
2026-09-12, above), past `skills/digest.md`'s 48h threshold, so
ran a fresh A-G sweep (delegated the read-only pass to an agent
to protect context; `/digest` never ships, so audit-only).
`node scripts/verify.mjs` green throughout (links 281 ok, tree
196 entries/42 reverse-checked, discover 30 docs, placeholders
543 tokens, anatomy 25 skills/25 command pointers, emoji 146
files, dualshell 9 blocks). Re-verified both non-durable Pending
rows: `[A/E, 3.0]` (ci-providers.md health-check gap) and
`[F, ~2]` (claude-code.md hedge gap) both still reproduce
unchanged, only minor line drift on the former. Recently-shipped
fixes (brander agent table, march.md dispatch list, Skills
table) confirmed fully propagated everywhere they're
cross-referenced — no fresh drift found there. Found one new
row, now this block's top scorer: `[A, 4.0]`
(`templates/env/env.example:58` carries the identical misleading
`HEALTH_CHECK_EXPECT=200` example as the ci-providers row, but in
the file adopters actually copy and fill in, so higher-impact).
All four durable rows (`[user-issue #54]`, `[user-issue #40]`,
`[user-issue #35]`, `[user-issue #49]`) confirmed still open via
`gh issue view`, unchanged. C (external links — curled every
non-vendor URL in the tree, all 200 or expectedly bot-blocked), D
(voice — doc-family H1 prefixes all consistent), F (model ids —
no stale patterns beyond the two tracked rows), and G (sibling
lessons — still absent from this checkout, dimension checked not
skipped) all swept clean otherwise. Audit only — shipped
nothing, per `skills/digest.md` rule 2.

Cloud tick 2026-09-17 (second): header still today's digest
sweep (above), so no re-derive. `plan/CRITIQUE.md`'s Pending
queue confirmed empty. No pending build-plan phase (`plan/steps/01_build_plan.md`
has zero `[ ]` rows, only the two durable `[blocked: ...]` ones),
critique gate not due (7 commits / ~67h since pass 17), and
expand gate not due (9 commits / ~3.5 days since candidates pass
12, both under threshold), so `/march` routed here via
`/iterate`. Shipped this block's own top scorer, `[A, 4.0]`
(`templates/env/env.example:58`'s misleading
`HEALTH_CHECK_EXPECT=200` example) — over `[A/E, 3.0]`,
`[F, ~2]`, and the four durable/low-value user-issue rows, all
lower-scoring. Not a full A-G sweep.

Cloud tick 2026-09-17 (third): header still today's digest sweep
(above), so no re-derive. `plan/CRITIQUE.md`'s Pending queue
confirmed empty. No pending build-plan phase, critique gate not
due (8 commits / ~71h47m since pass 17, both under threshold),
and expand gate not due (10 commits / ~3.6 days since candidates
pass 12, both under threshold), so `/march` routed here via
`/iterate`. Shipped this block's own new top scorer, `[A/E, 3.0]`
(ci-providers.md's self-hosted section never saying to set
`DEPLOY_PROVIDER=health-check`) — over `[F, ~2]` and the four
durable/low-value user-issue rows, all lower-scoring. Reproducing
it found the row's other cited bug (misleading
`HEALTH_CHECK_EXPECT=200` example) already fixed by the prior
tick's commit (`b2c2fec`), so this tick's diff covered only the
remaining gap: the missing `Set DEPLOY_PROVIDER=health-check`
line and the intro list's undercount. Not a full A-G sweep.

Cloud tick 2026-09-18: `/critique` pass 18 (previous tick) landed
two fresh `plan/CRITIQUE.md` rows. The MED one — step 7 of
`playbooks/new-project.md` describes `package.json` as created
"step 7 creates one" per step 6, but step 7's body only shows the
target JSON under "wire it into" language, with no `pnpm init`/
`cat > package.json` anywhere — outscored this block's own
`[F, ~2]` row and the four blocked/external-issue durable rows
(all impact 2-4 x ease 2-5 / 10, well under 2). Reproduced: a
literal read confirms no creation command exists between step 6's
promise and step 7's "Test both: `pnpm verify`." Shipped: added
`pnpm init -y` before the "wire it into `package.json`" JSON
block. Mirrored as issue #58 and closed via commit trailer. This
block's own rows unchanged and still Pending. Not a full A-G
sweep.

Cloud tick 2026-09-18 (second): header still the 2026-09-17
digest sweep (<24h old relative to that sweep — last updated
2026-09-18T12:43:39Z by the prior tick's commit, ~4h47m ago),
so no re-derive. No pending build-plan phase, critique gate not
due (2 commits since pass 18, same day), and expand gate not
due (13 commits / ~4 days since candidates pass 12, both under
threshold), so `/march` routed here via `/iterate`. This
block's five durable rows (`[F, ~2]`, `#54`, `#40`, `#35`,
`#49`) all reproduce unchanged and score under 1 except the
already-downgraded `[F, ~2]` (~2) — none actionable, matching
the 2026-09-14 tick's exact state. Unlike that tick, though,
`plan/CRITIQUE.md`'s Pending queue was not empty: one fresh LOW
row from pass 18 (README's "Three paths to start" / "How to use
this kit" cross-link gap), the only actionable finding in
either queue, so shipped it rather than dispatching to
`skills/expand.md` — `skills/iterate.md` §6 failure mode 1's
expand-fallback is for when nothing is left to ship, not merely
for scores under 3.0 (see the 2026-09-12 and 2026-09-15 ticks,
which likewise shipped sub-3.0 CRITIQUE rows over invoking
expand). Added a forward one-liner at the end of "Three paths
to start" and turned "How to use this kit"'s existing "TL;DR
sections above" blockquote into an explicit backlink. `node
scripts/verify.mjs` green (all seven legs). This block's own
rows unchanged and still Pending. Not a full A-G sweep.

Cloud tick 2026-09-18 (third): last full sweep (the 2026-09-17
digest tick) now ~31h old, past the 24h threshold, so dispatched
a fresh A-G sweep to an agent to protect context (verified its
top candidate by hand before shipping). This block's five
durable rows (`[F, ~2]`, `#54`, `#40`, `#35`, `#49`) all
confirmed unchanged and out of scope for a cloud tick (same
workflows-scope gap / already-downgraded). `plan/CRITIQUE.md`'s
Pending queue confirmed empty. G still empty (no
`../kintilla/plan/lessons.md` or `NEXUS_LESSONS.md` in this
checkout). F, external links, and model ids all swept clean.
One new row found and verified: `[C/A, 3.2]` — `README.md`'s
"What's in this kit" tree independently re-lists
`templates/scripts/` (lines 503-514) and omits
`install-hooks.mjs`, even though the file exists on disk and is
correctly documented in `templates/README.md:80,162` (which is
why `scripts/verify.mjs`'s tree leg stayed green — the
reverse-check only needs the entry in the union of both fenced
trees, and `templates/README.md` already supplied it). Shipped
the one-line addition to README.md's tree, matching
`templates/README.md:80`'s phrasing. `node scripts/verify.mjs`
green (197 tree entries, up from 196).

Cloud tick 2026-09-19: header (this sweep) ~14h old, under the
24h threshold, so no re-derive. `plan/CRITIQUE.md`'s Pending
queue confirmed empty. No pending build-plan phase, critique
gate not due (4 commits / ~14h since pass 18), and expand gate
not due (17 commits / ~5 days since candidates pass 12, both
under threshold), so `/march` routed here via `/iterate`. This
block's five durable rows (`[F, ~2]`, `#54`, `#40`, `#35`,
`#49`) all reproduced unchanged, none scoring >= 3.0, and
`plan/CRITIQUE.md` had nothing pending either — the same
"nothing actionable" shape as 2026-09-14 and 2026-09-18
(second), which per `skills/iterate.md` §6 failure mode 1 would
normally route to `skills/expand.md`. Before dispatching there,
ran a fresh dimension-F check against the live Claude Code
changelog (`raw.githubusercontent.com/anthropics/claude-code/
main/CHANGELOG.md`) as expand's own signal E would — found
v2.1.277 shipped "Added AGENTS.md support: in a project with no
CLAUDE.md, Claude Code reads AGENTS.md instead", newer than the
v2.1.269 changelog state pass 11/12 already read. This directly
contradicts `customization/claude-code.md:284-285`'s blanket
claim "It does not auto-load `agents.md`" — true for nexus in
practice (the kit always ships a `CLAUDE.md` pointer, so the
fallback never triggers) but no longer an accurate general
statement about the platform, and worth correcting before a
future reader without this changelog context takes the old
sentence at face value. Scored `[F, 4.0]` (impact 5 — corrects
the stated rationale for a hard rule adopters read to decide
whether they need the pointer file — x ease 8 — one paragraph)
— clears the >= 3.0 bar the five durable rows can't, so shipped
this instead of an expand candidate. Corrected the paragraph to
state the CLAUDE.md-presence-gated fallback accurately and kept
the pointer's rationale intact (nexus's own `agents.md` is a
separate, lowercase, client-agnostic convention from the
platform's native `AGENTS.md` fallback file). Reproduced: grepped
the repo for the same claim elsewhere (`auto-load`/`auto-loads`)
— every other hit is about root-vs-`.claude/` load location, a
different and still-accurate claim; this was the only stale one.
`node scripts/verify.mjs` green. This block's own five rows
unchanged and still Pending. Not a full A-G sweep.

Cloud tick 2026-09-20: header (the 2026-09-18 sweep) now ~2
days old, past the 24h threshold, so dispatched a fresh A-G
sweep to an agent to protect context (verified its top
candidates by hand before shipping). This block's five durable
rows (`[F, ~2]`, `#54`, `#40`, `#35`, `#49`) all confirmed
unchanged and out of scope for a cloud tick (same
workflows-scope gap / already-downgraded). `plan/CRITIQUE.md`'s
Pending queue confirmed empty. G still empty (no sibling
lessons files in this checkout). F swept clean through the live
Claude Code changelog (v2.1.278 — nothing new past the
already-fixed AGENTS.md item). Two new rows found and verified
by hand: `[A/B, 4.2]` — `playbooks/cloud-loop.md`'s Step 1 copy
command never lands `night.yml`, `heartbeat.yml`,
`nightly-smoke.yml`, or `ISSUE_TEMPLATE/*.yml`, even though
`playbooks/new-project.md` explicitly defers adopters to this
playbook for them ("ship separately") — no doc anywhere
actually gave the copy command, confirmed by grepping both
`playbooks/cloud-loop.md` and `templates/.github/CLOUD_LOOP.md`
for "night"/"heartbeat"/"ISSUE_TEMPLATE" (zero hits in either);
and `[C/A, 3.2]` — README.md's "What's in this kit" tree omits
`templates/.github/ISSUE_TEMPLATE/` (5 files, on disk since
2026-08-27, already correctly listed in
`templates/README.md:63-67`), invisible to the mechanical gate
because `templates/.github` isn't in `scripts/verify.mjs`'s
`REVERSE_CHECK_DIRS`. Shipped the higher scorer: added a new
"Optional: the other shapes" section to `playbooks/cloud-loop.md`
(bash + PowerShell copy commands for the four deferred
files/dirs, plus per-file adoption notes and placeholder calls),
and updated `new-project.md`'s "ship separately" aside to point
at it. `node scripts/verify.mjs` green (seven legs). Left the
ISSUE_TEMPLATE tree-omission row queued below for the next tick.

Cloud tick 2026-09-22: header (the 2026-09-20 sweep) ~2 days
old, past the 24h threshold, but `plan/CRITIQUE.md`'s Pending
queue confirmed empty and only 2 commits landed since the last
critique pass (2026-09-21), so ran a targeted fresh check rather
than a full manual re-derive: reproduced this block's own top
scorer, `[C/A, 3.2]` (README.md's "What's in this kit" tree
still omitting `templates/.github/ISSUE_TEMPLATE/`, confirmed
the 5 files still on disk and still absent from
`README.md:497-502` while `templates/README.md:63-67` lists them
correctly) — unchanged from the prior tick's sweep. Shipped it
over `[F, ~2]` (already-downgraded, low priority) and the four
durable blocked user-issue rows (`#54`, `#40`, `#35`, `#49`, all
still out of cloud-tick scope: same workflows-scope gap or
transient-crash low score). Not a full A-G sweep.

Cloud tick 2026-09-22 (second): header (the 2026-09-20 sweep)
past the 24h threshold, so dispatched a fresh A-G sweep to an
agent to protect context (verified its top candidate by hand
before shipping). This block's five durable rows (`[F, ~2]`,
`#54`, `#40`, `#35`, `#49`) all confirmed unchanged and out of
cloud-tick scope. `plan/CRITIQUE.md`'s Pending queue confirmed
empty. G still empty (no sibling lessons files in this
checkout). F swept clean (model ids current; Claude Code
changelog drift belongs to `/expand`, not `/iterate`). D turned
up nothing above score 2.0. Four new C/A/B rows found; shipped
the top scorer (below) — `scripts/verify.mjs`'s
`REVERSE_CHECK_DIRS` missed four dirs (`templates/.github`,
`templates/data`, `templates/setup`, `templates/env`) that are
expanded per-file in `templates/README.md`'s tree, the exact
structural blind spot that let the ISSUE_TEMPLATE gap (shipped
the prior tick, commit `3eaf61d`) go undetected by the gate
itself rather than just fixing that one instance. Verified: all
four dirs' files confirmed on disk and already correctly listed
in `templates/README.md`; `node scripts/verify.mjs` green after
the change (198 tree entries, 59 files reverse-checked, up from
50). Three more rows left queued below for future ticks: a
doc-drift row (`customization/bootstrap-automation.md`'s
"Provider adapters" section describes a modular adapter-file
architecture `templates/scripts/bootstrap.mjs` doesn't actually
have), a completeness row (`setup/00_files.md` is referenced as
already existing by two docs but no documented step ever copies
it), and a tree-hygiene row (README.md's kit tree omits the root
`CONTRIBUTING.md`).

Cloud tick 2026-09-22 (third): the two remaining unblocked A/B
rows tied at score 4.2 (durable rows `#54`, `#40`, `#35`, `#49`
all still out of cloud-tick scope, same reasons as above).
Shipped the completeness row (`setup/00_files.md`, ease 7) over
the doc-drift row (`bootstrap-automation.md`'s "Provider
adapters" section, ease 6) — equal score, cheaper fix wins on a
tie. Not a fresh A-G sweep; last full sweep still today's
second tick (above). Two rows left in Pending below: the
adapter-drift row and the `CONTRIBUTING.md` tree-omission row
(3.2).

## Pending

### [A, 4.2] customization/bootstrap-automation.md's "Provider adapters" section describes an architecture the shipped bootstrap.mjs doesn't have
- category: doc-drift
- impact: 7, ease: 6
- evidence: `customization/bootstrap-automation.md:463-493`
  ("Provider adapters") documents a modular design — "Each
  adapter exports three functions: `discover(ctx)`,
  `plan(state, manifest, ctx)`, `execute(actions, ctx)`" — and
  tells a contributor adding a new provider to add "an entry in
  `scripts/bootstrap/adapters.mjs`". But
  `templates/scripts/bootstrap.mjs` is a single 1009-line
  monolith with no `bootstrap/` subdirectory and no such file;
  providers are inline functions with a different
  naming/signature convention entirely (`discoverGithub(git)`,
  `execGithub(a, state, manifest)`, `discoverVercel`,
  `execVercel`, `discoverSupabase`, `execSupabase`, dispatched
  from a shared `execAction`/`composePlan`).
  `templates/skills/bootstrap.md` doesn't reconcile the two
  either. A contributor following CONTRIBUTING.md's explicit
  invitation ("a deploy-check provider block for a host nexus
  doesn't cover yet" is in-scope) would look for a file and
  export contract that don't exist.
- next: rewrite `customization/bootstrap-automation.md:478-493`
  to describe the real pattern — add `discoverX`/`execX`
  functions inline in `templates/scripts/bootstrap.mjs`,
  register the provider in `composePlan`'s action list — rather
  than the modular adapter file that was never built.

### [C/A, 3.2] README.md's "What's in this kit" tree omits the root CONTRIBUTING.md
- category: link + tree hygiene / doc-drift
- impact: 4, ease: 8
- evidence: `README.md:400-524`'s tree lists `README.md`,
  `intervention-spectrum.md`, `agents.md`, `CLAUDE.md`,
  `package.json` as root files but never `CONTRIBUTING.md`, even
  though it's a real 182-line root file that predates this
  repo's first commit (`b27d21f`) and is directly linked from
  the README's own "PRs welcome" badge (`README.md:16`).
  Invisible to `verify.mjs`'s tree leg because the gate only
  forward-checks entries that appear in a tree and reverse-checks
  specific `templates/` subdirs — it never asserts a root file
  must appear in the tree at all.
- next: add a `├── CONTRIBUTING.md  # how to contribute` row to
  `README.md`'s tree, near the other root files (before or after
  `agents.md`/`CLAUDE.md`).

### [F, ~2] customization/claude-code.md:315's model-id table cell has no inline "ids age" hedge
- category: freshness
- impact: 4, ease: 5 (weaker than the raw score suggests — see
  evidence)
- evidence: the `claude-sonnet-5` mention in the Model routing
  table (`customization/claude-code.md:315`) has no inline
  caveat, unlike `templates/.github/CLOUD_LOOP.md`'s matching
  cells. But the same doc already states, 15 lines below the
  table (`customization/claude-code.md:330`), "Model ids age.
  Check `/model` ... rather than trusting any id you find
  hardcoded in a doc — including this one" — an explicit,
  doc-wide catch-all that already covers the table cell.
  Downgraded on discovery; may not be worth a tick at all.
  Reproduced unchanged this sweep (2026-09-17), no line drift.
- next: low priority — only act if a future sweep finds the
  doc-wide hedge itself removed or weakened; otherwise this row
  can be dropped rather than shipped.

### [user-issue #54] [LOW] cloud march tick crashed on a transient Bun-download 504, not a code defect
- category: external-issue
- impact: 2, ease: 2
- evidence: run 34130300338 (2026-09-07T13:57:41Z) failed inside
  the Claude Code Action's own `Install Bun` step —
  `oven-sh/setup-bun` hit `Unexpected HTTP response: 504`
  downloading `bun-linux-x64.zip` from GitHub's release CDN,
  retried twice more (18s/12s backoff, the action's own built-in
  retry), then gave up and failed the job before the agent turn
  ever started. The job's crash-alarm step then correctly filed
  this issue per `.github/workflows/march.yml`'s own
  dead-man's-switch. No nexus code or workflow config is
  implicated — this is a third-party CDN transient, not a repo
  defect. Confirmed self-healed: the very next scheduled run
  (34152492907, this tick) started and progressed normally with
  no retry or config change needed.
- next: no code fix available from inside this repo — the
  failure point is `oven-sh/setup-bun`'s own retry loop hitting a
  transient GitHub release-asset 504, outside `march.yml`'s
  control. Close if it doesn't recur; if this class of crash
  starts repeating, that would be a signal worth a
  `plan/PHASE_CANDIDATES.md` entry (e.g. pinning a Bun version
  known to be cached, or widening the action's retry window), but
  a single occurrence isn't evidence of a pattern yet.

### [user-issue #40] [MED] apply phase 23's crash-alarm patch to nexus's own march.yml + night.yml by hand
- category: external-issue
- impact: 4, ease: 2
- evidence: a phase-23 cloud tick landed the durable-alarm fix
  (GITHUB_TOKEN instead of ACTIONS_PAT for the crash-alarm step,
  plus named failed-step reporting) in
  `templates/.github/workflows/march.yml` and `night.yml`
  (commit `8dc2080`) but could not apply the identical patch to
  this repo's own `.github/workflows/march.yml` / `night.yml`:
  the push was rejected because that tick's git credential was
  the Claude Code Action's own GitHub App installation token, not
  `ACTIONS_PAT`, and GitHub refuses non-`workflows`-scoped tokens
  touching top-level `.github/workflows/*.yml`. This directly
  confirms root-cause (a) in `[user-issue #35]`'s evidence below
  (the Action overwrites the checkout-configured credential with
  its own App token before the agent's turn starts) — same
  blocked class, not yet root-caused to a fix, just newly
  evidenced. The issue body carries a ready-to-apply unified diff
  for both files plus a matching `.github/CLOUD_LOOP.md` doc
  update.
- next: same resolution pattern as the now-closed
  `[user-issue #12]` — apply from a local/human `/oversight`
  session (`git apply` the diff in issue #40, or hand-edit to
  match), run `node scripts/verify.mjs`, then push directly (a
  human push carries normal repo-write permissions, not the App
  token's workflow restriction). Closes #40 when done.

### [user-issue #35] [MED] cloud push token still lacks workflows scope despite the 2026-08-23 re-mint
- category: external-issue
- impact: 4, ease: 2
- evidence: phase 20's cloud ship attempt (run 32663251226,
  2026-08-23) built and verified all three deliverables, then
  `git push` was rejected: "refusing to allow a GitHub App to
  create or update workflow `.github/workflows/march.yml`
  without `workflows` permission." `gh auth status` in that run
  reported `claude[bot]` (the Claude Code Action's own GitHub
  App installation token), not the `ACTIONS_PAT` secret — even
  though `march.yml`'s `Run /march` step sets
  `GH_TOKEN: ${{ secrets.ACTIONS_PAT }}` explicitly and the
  checkout step sets `token: ${{ secrets.ACTIONS_PAT }}`.
  Non-workflow-file pushes on the same run (this issue's mirror,
  #34, and the phase-20-blocked commit itself) succeeded fine,
  isolating the gap to `.github/workflows/*.yml` writes only —
  consistent with either (a) the Claude Code Action overwriting
  the checkout-configured git credentials with its own App
  token before the agent's turn starts, or (b) `ACTIONS_PAT`
  not actually carrying `workflows` scope despite the re-mint
  note in `agents.md`.
- next: needs a local session to inspect the actual `ACTIONS_PAT`
  scope grants in GitHub's token settings UI and to test whether
  a plain `git push` (bypassing `gh`/the Action's credential
  helper) succeeds against `.github/workflows/*.yml` with that
  token. Same class of environment constraint that blocked
  #12 pre-rescope — cannot be root-caused further from inside a
  cloud tick, since any cloud tick reproduces the same
  credential wiring. Phase 20 stays `[blocked: cloud push token
  lacks workflows scope 2026-08-23]` until this resolves.

### [user-issue #49] [MED] phase 32 blocked — same cloud push token workflows-scope gap as #35/#40
- category: external-issue
- impact: 4, ease: 2
- evidence: phase 32's cloud ship attempt (2026-08-30) built and
  verified `.github/workflows/heartbeat.yml` and
  `templates/.github/workflows/heartbeat.yml` changes in full,
  then `git push` was rejected for the same reason as #35/#40:
  "refusing to allow a GitHub App to create or update workflow
  `.github/workflows/heartbeat.yml` without `workflows`
  permission." `git remote -v` in that run showed the GitHub App
  installation token (`ghs_...`) authenticating git push, not
  `ACTIONS_PAT` — third confirmed occurrence of the same root
  cause (phase 20, #40, now phase 32). The diff was built and
  verified green then discarded per agents.md rule 1 (no dirty
  tree at turn end) rather than left half-committed; full brief
  at `plan/phases/phase_32_scheduled_workflow_disable_watch.md`.
- next: same resolution as #35/#40 — a local/human session runs
  `/ship-a-phase` (or hand-applies the brief) for phase 32,
  pushing with normal repo-write credentials instead of the
  cloud tick's App token. Closes #49 when done; also flips phase
  32 from `[blocked: ...]` to `[x]` in
  `plan/steps/01_build_plan.md`.

## Done

### [x] [B, 4.2] setup/00_files.md is never actually created by any documented step — this commit
- category: completeness
- impact: 6, ease: 7
- evidence: `customization/external-services.md:184-193`'s
  "Per-service runbook authoring" workflow opened with "1. Add
  the row to `setup/00_files.md`" as though the file already
  existed, and `playbooks/new-project.md:715-718`'s Day-1
  checklist likewise assumed "`setup/00_files.md` index exists".
  But `playbooks/new-project.md` §4's bulk copy never copies
  `templates/setup/`; the only documented `setup/` bootstrap was
  the `/bootstrap`-specific `mkdir -p setup && cp
  .../bootstrap.example.json setup/bootstrap.local.json`, which
  never touched `00_files.md`. No path in the kit ever got an
  adopter from zero to a first `setup/00_files.md`.
- fix: added a new step 1 to
  `customization/external-services.md`'s "Per-service runbook
  authoring" workflow — copy `templates/setup/00_files.md` to
  `setup/00_files.md` and sweep the `<PROJECT>` token, bash +
  PowerShell twins, same precedent as the bootstrap-manifest
  placeholder fix. Renumbered the rest of the list (1-7 → 2-8);
  no other doc referenced the old numbers.
- source: audit sweep

### [x] [C, 4.8] scripts/verify.mjs's REVERSE_CHECK_DIRS misses four dirs that ARE expanded per-file in both trees — this commit
- category: link + tree hygiene
- impact: 6, ease: 8
- evidence: `scripts/verify.mjs:176-180`'s `REVERSE_CHECK_DIRS`
  listed only `templates/scripts`, `templates/skills`,
  `templates/claude/commands`, `templates/claude/agents`,
  `templates/plan`, `templates/workspace`. But
  `templates/README.md` expands `templates/.github/` (5
  ISSUE_TEMPLATE files + 4 workflows + CLOUD_LOOP.md),
  `templates/data/` (3 files), `templates/setup/` (3 files), and
  `templates/env/` (1 file) fully per-file — none of these four
  dirs were in the reverse-check array, so a file silently added
  to (or removed from) any of them would never trip the gate.
  This was exactly the blind spot that let the just-fixed
  `templates/.github/ISSUE_TEMPLATE/` gap (commit `3eaf61d`,
  README.md's tree) go undetected — and that fix touched only
  `README.md`, not `scripts/verify.mjs`, leaving the structural
  gap it exposed still open.
- fix: added `'templates/.github', 'templates/data',
  'templates/setup', 'templates/env'` to `REVERSE_CHECK_DIRS`.
  Confirmed all four dirs' files are already correctly listed in
  `templates/README.md`, so this closes the blind spot without
  fixing any current drift. `node scripts/verify.mjs` green (198
  tree entries, 59 files reverse-checked, up from 50).
- source: audit sweep

### [x] [C/A, 3.2] README.md's "What's in this kit" tree omits `templates/.github/ISSUE_TEMPLATE/` — this commit
- category: link + tree hygiene / doc-drift
- impact: 4, ease: 8
- evidence: `README.md:453-502`'s "What's in this kit" tree
  independently re-expands `templates/.github/` (workflows +
  `CLOUD_LOOP.md`) but never lists `ISSUE_TEMPLATE/` (5 files:
  `bug_report.yml`, `friction.yml`, `idea.yml`,
  `needs_user.yml`, `config.yml`), even though the files exist
  on disk (added 2026-08-27, `feat: .github/ISSUE_TEMPLATE`)
  and `templates/README.md:63-67` already lists all five
  correctly. Same bug shape as the just-shipped
  `install-hooks.mjs` tree gap (commit `ec5cedc`) — invisible to
  `node scripts/verify.mjs`'s tree leg because its reverse-check
  only requires an entry in the union of both fenced trees, and
  `templates/README.md` already supplies it; `templates/.github`
  is also absent from `REVERSE_CHECK_DIRS`.
- fix: added an `ISSUE_TEMPLATE/` collapsed entry to README.md's
  `templates/.github/` tree block, between the `nightly-smoke.yml`
  row and `CLOUD_LOOP.md`, matching the block's existing
  collapsed-vs-per-file granularity (other entries in this same
  block are per-file for workflows but this repo's own `.github/`
  tree three lines up already collapses `ISSUE_TEMPLATE/` the same
  way).

### [x] [A/B, 4.2] playbooks/cloud-loop.md's Step 1 never lands night.yml/heartbeat.yml/nightly-smoke.yml/ISSUE_TEMPLATE/*.yml — this commit
- category: doc-drift / completeness
- impact: 7, ease: 6
- evidence: `playbooks/new-project.md`'s adopt-by-need table
  defers `night.yml`/`heartbeat.yml` to
  `playbooks/cloud-loop.md` ("ship separately"), but that
  playbook's Step 1 only copies `march.yml` + `CLOUD_LOOP.md`;
  `nightly-smoke.yml` and `ISSUE_TEMPLATE/*.yml` weren't
  mentioned anywhere in the playbook either. `templates/.github/CLOUD_LOOP.md`
  (the operator guide adopters actually receive) has no
  matching "other shapes" section, unlike this repo's own
  `.github/CLOUD_LOOP.md:108-130`. An adopter following the
  documented path end-to-end never learns how to get the night
  shift or heartbeat, despite README.md:593-601 marketing them
  as core capabilities ("its own cloud loops — plural").
- fix: added a new "Optional: the other shapes" section to
  `playbooks/cloud-loop.md` (between Step 10 and "What changes
  in your local workflow") with bash + PowerShell copy commands
  for `night.yml`, `heartbeat.yml`, `nightly-smoke.yml`, and
  `ISSUE_TEMPLATE/*.yml`, plus a per-file note on its skill
  dependency, placeholder, and mutual-exclusivity conditions
  (matching `templates/README.md`'s adopt-by-need table),
  pointing to `concepts/loop-shapes.md` for what each shape
  does. Updated `playbooks/new-project.md`'s "ship separately"
  aside to link the new section instead of leaving the reader to
  find it. `node scripts/verify.mjs` green.

### [x] [F, 4.0] customization/claude-code.md's CLAUDE.md-pointer rationale claims Claude Code "does not auto-load agents.md" — no longer true in general — this commit
- category: freshness
- impact: 5, ease: 8
- evidence: `customization/claude-code.md:284-285` stated
  flatly "Claude Code auto-loads `CLAUDE.md` into context. It
  does not auto-load `agents.md`" as the justification for
  shipping a `CLAUDE.md` pointer. A live changelog fetch
  (`raw.githubusercontent.com/anthropics/claude-code/main/
  CHANGELOG.md`) found v2.1.277 — newer than the v2.1.269 state
  expand pass 11/12 last read — shipped "Added AGENTS.md
  support: in a project with no CLAUDE.md, Claude Code reads
  AGENTS.md instead." The blanket "does not auto-load" claim is
  now false as a general platform statement; it happens to
  still hold for nexus specifically only because the kit always
  ships a `CLAUDE.md` pointer, so the new conditional fallback
  never has an empty-`CLAUDE.md` project to trigger on.
- fix: rewrote the paragraph to state the CLAUDE.md-presence-
  gated fallback accurately (cites v2.1.277), explains why
  nexus's pointer is still needed despite it (the fallback never
  triggers when `CLAUDE.md` is present, which nexus guarantees),
  and distinguishes the kit's own lowercase, client-agnostic
  `agents.md` convention from the platform's native `AGENTS.md`
  fallback file — two similarly-named but distinct things.
  Grepped the repo for the same claim elsewhere; every other
  `auto-load`/`auto-loads` hit is the unrelated, still-accurate
  root-vs-`.claude/` load-location claim. `node scripts/verify.mjs`
  green.

### [x] [C/A, 3.2] README.md's "What's in this kit" tree omits `templates/scripts/install-hooks.mjs` — this commit
- category: link + tree hygiene / doc-drift
- impact: 4, ease: 8
- evidence: `README.md`'s "What's in this kit" tree independently
  re-expands `templates/scripts/` (lines 503-514) and lists 10
  `.mjs` files plus `__tests__/`, but `install-hooks.mjs` — which
  exists on disk (`templates/scripts/install-hooks.mjs`) and is
  correctly documented in `templates/README.md:80,162` — is
  missing from this specific enumeration. `node scripts/verify.mjs`'s
  tree leg stayed green throughout because its reverse-check only
  requires an entry in the union of both fenced trees, and
  `templates/README.md` already supplied it — so this drift was
  invisible to the gate. Found via a fresh A-G sweep (last full
  sweep was 31h old, past the 24h threshold).
- fix: added `├── install-hooks.mjs          # opt-in: arms pnpm
  verify as a pre-commit hook` to README.md's `templates/scripts/`
  block, matching `templates/README.md:80`'s phrasing. `node
  scripts/verify.mjs` green (197 tree entries, up from 196).

### [x] [A/E, 3.0] playbooks/ci-providers.md's self-hosted section never says to set `DEPLOY_PROVIDER=health-check` — this commit
- category: doc-drift / adopter friction
- impact: 5, ease: 6
- evidence: the "Self-hosted → B. Health-check the live URL"
  section showed the matching env vars (`HEALTH_CHECK_URL`,
  `HEALTH_CHECK_EXPECT`, `DEPLOY_WAIT_BUFFER_S`) but never told
  the reader to set `DEPLOY_PROVIDER=health-check`, unlike the
  Cloudflare Pages/Render/Fly.io sections in the same doc. The
  intro's "handles X out of the box" list also undercounted —
  `deploy-check.mjs` implements `health-check` as a full provider
  branch (not just a doc afterthought), but the intro line never
  named it. The row's other cited bug — a misleading
  `HEALTH_CHECK_EXPECT=200` example — had already been fixed by
  the prior tick (commit `b2c2fec`); this tick's diff confirmed
  that half already resolved and shipped only the remaining gap.
- fix: added "Set `DEPLOY_PROVIDER=health-check`." to the
  self-hosted section, matching the sibling sections' pattern,
  and widened the intro list from 6 to 7 named providers
  (`..., Render, Fly.io, and health-check`). Left `none` out of
  the intro list on purpose — it's a no-op fallback ("no deploy
  gate configured, skipping"), not a wired integration like the
  other 7, so calling it "handled out of the box" would misstate
  what it does. `node scripts/verify.mjs` green.

### [x] [A, 4.0] templates/env/env.example:58 carries the same misleading `HEALTH_CHECK_EXPECT` example as the ci-providers.md row below — this commit
- category: doc-drift / adopter friction
- impact: 8, ease: 5
- evidence: `templates/env/env.example:57-58` read
  `HEALTH_CHECK_URL=...` /
  `HEALTH_CHECK_EXPECT=200  # or a sentinel string` — the file
  adopters actually copy and fill in (not just prose), so the
  misleading comment there outranked the playbook copy: an
  adopter setting `HEALTH_CHECK_EXPECT=200` literally would have
  had `deploy-check.mjs` search the response body for the
  substring "200" rather than check an HTTP status, per
  `templates/scripts/deploy-check.mjs:275-294`'s real semantics
  (status 200 is checked separately; `EXPECT` matches body
  text). A prior fix (commit `3a14e48`) had already widened this
  same file's `DEPLOY_PROVIDER` matrix to all 8 providers but
  left this adjacent comment untouched.
- fix: reworded both `templates/env/env.example:58` and the
  matching example in `playbooks/ci-providers.md:252` to
  `HEALTH_CHECK_EXPECT=ready  # sentinel substring in body, not
  an HTTP status`.

### [x] [A/B, 4.5] templates/agents.md's Sub-agents table omits the shipped `brander` agent — this commit
- category: doc-drift / completeness
- impact: 5, ease: 9
- evidence: `templates/agents.md`'s Sub-agents table listed only
  `scout`, `reader`, and `<DOMAIN_SPECIALIST>` — but
  `templates/claude/agents/` ships a fourth real agent,
  `brander.md` (asset rendering, spawned by `/ship-asset`),
  referenced in 11 other files including `templates/README.md`'s
  adopt-by-need table and `templates/skills/ship-asset.md`.
  `README.md:216` already documents it correctly ("brander (asset
  rendering — only present when `/ship-asset` is adopted)") —
  `templates/agents.md` just never got the matching row. Same bug
  shape as the already-shipped Skills-table fix (commit b45b807).
- fix: added a `brander` row to the Sub-agents table, annotated
  with its adoption condition, matching README.md's existing
  phrasing.
- source: audit sweep

### [x] [4.8] templates/claude/commands/march.md duplicated its skill's dispatch chain inline and drifted, missing `/expand` — this commit
- category: doc-drift
- impact: 6, ease: 8
- evidence: every sibling command file in
  `templates/claude/commands/` (`iterate.md`, `expand.md`,
  `critique.md`, `ship-a-phase.md`) points to its skill file
  with a "Procedure: §N of skill" line rather than duplicating
  the procedure. `march.md` was the one exception — it inlined
  a five-step numbered list ("triage → critique → phase → data
  → iterate") that never picked up `/expand` when
  `templates/skills/march.md` gained that step on 2026-07-02.
  `git log` confirms the command file untouched since its
  original scaffold. This kit's own `.claude/commands/march.md`
  already uses the pointer pattern and already lists expand
  correctly, confirming which side had drifted.
- fix: replaced the duplicated frontmatter description and
  inline procedure list with a pointer to `skills/march.md` §3
  (procedure), §4 (hand-off honesty), §5 (failure modes) —
  removing the duplication that caused the drift, not just
  patching this one instance.
- source: audit sweep

### [x] [4.5] templates/agents.md's Skills table omits 6 of the 15 shipped skills, including the unconditional `jot` — this commit
- category: doc-drift / completeness
- impact: 5, ease: 9
- evidence: `templates/agents.md`'s Skills table and Invocation
  block listed only 9 of the 15 skills under
  `templates/skills/`. `jot.md` carries no "(omit unless...)"
  annotation in `templates/README.md`'s tree — every adopter
  gets it — yet it was absent from the doc `agents.md` itself
  bills as the cold-start entry point. `ship-migration`,
  `ship-asset`, `moderate`, `digest`, `bootstrap` are
  conditional, same tier as the already-listed `ship-data`
  ("omit if no structured data layer"), so their omission read
  as an inconsistency rather than a deliberate opt-in gate.
- fix: added all six rows to both the Skills table and the
  Invocation block, each annotated with its adoption condition
  matching `ship-data`'s existing style (`ship-migration`,
  `ship-asset` gated on `plan/bearings.md` fields; `moderate` on
  UGC; `digest` on cloud-loop adoption; `bootstrap` opt-in per
  `customization/bootstrap-automation.md`).

### [x] [A, 3.6] intervention-spectrum.md:38 undercounts /march's dispatcher verbs, omitting "expand" — this commit
- category: doc-drift
- fix: `intervention-spectrum.md:38` read "(triage / critique /
  phase / data / iterate)" — five verbs. README's canonical
  adopter-facing dispatcher description (`README.md:199`) lists
  six: "triage → critique → phase → data → expand → iterate."
  `intervention-spectrum.md` is the generic methodology doc
  (not nexus-self, which correctly omits `data`), so added
  "expand" to match README's six-verb list.

### [x] [A, 3.6] CONTRIBUTING.md's new-playbook step cites a renamed README heading — this commit
- category: doc-drift
- fix: `CONTRIBUTING.md:71` said to add a section under "Two
  paths to start" — stale since README's start-paths heading
  became "Three paths to start" (README.md:272) when the
  `pre-spec.md` path was added. Changed the quoted heading name
  to match.

### [x] [E, 4.0] playbooks/existing-project.md's step-1 CURRENT-STATE.md copy has no PowerShell twin — this commit
- category: adopter-friction
- fix: converted the inline `mkdir -p plan && cp ...` one-liner
  (kept inline by the 2026-09-08 fix specifically to dodge the
  `dualshell` leg) to a fenced `bash` block with an adjacent
  `powershell` twin, matching the pattern
  `playbooks/new-project.md` steps 2/3 established one commit
  earlier today (`64bf2e9`) for the same "target dir doesn't
  exist yet" bug class. `node scripts/verify.mjs` green after
  (`dualshell` leg now checks 9 blocks, up from 8).

### [x] [A, 1.8] playbooks/cloud-loop.md:66 — "Three new files" header sits atop a 2-entry tree — this commit (closes #55)
- category: doc-drift
- fix: changed "Three new files" to "Two new files" at line 66 —
  the fenced tree immediately below has always listed only
  `march.yml` and `CLOUD_LOOP.md`. Mirrored as issue #55.

### [x] [C, 2.4] triage.md's follow-up-comment citation points half at unrelated content — this commit
- category: link-hygiene
- fix: dropped the dead `skills/ship-data.md §6` half of
  `templates/skills/triage.md`'s citation — `ship-data.md` §6 is
  a generic data-entity CRUD walkthrough with zero matching
  content on trailers/Closes/comment flow — leaving
  `skills/iterate.md §5` alone, which does cover the flow.

### [x] [A, 2.4] `templates/claude/hooks/guard.mjs` drifted from `.claude/hooks/guard.mjs`'s own hardening — this commit
- category: doc-drift
- fix: ported the `\n`-exclusion to all nine `[^|;&]*`
  occurrences across `templates/claude/hooks/guard.mjs`'s
  `extractCommitMessage` helper and the four `RULES` entries
  (`no-verify`, `force-push`, `destructive-reset`,
  `trailer-or-emoji-in-commit`), and added the matching
  multi-line regression case to its `self-test` cases array.
  Both files' `self-test` now green with identical coverage for
  this bug class (the template's `VERBS`/commit-verb self-test
  cases still differ from the kit's own — that's separate drift,
  not part of this finding's scope).

### [x] [A, 3.6] CLAUDE.md's "next pending work is the first `[ ]` row" line is stale now the build plan has zero — this commit
- category: doc-drift
- fix: `CLAUDE.md`'s pointer line now names `/iterate`'s audit
  queue as the fallback once no `[ ]` rows remain, citing
  `skills/march.md` §3 for the real dispatch logic, instead of
  implying a `[ ]` row always exists.

### [x] [user-issue #53] [MED] critique's sub-agent delegation can commit without the cloud-mode trailer — this commit (closes #53)
- category: external-issue
- fix: `skills/critique.md` step 3's delegation note now says
  explicitly that a delegated sub-agent's scope is steps 3-5
  only (stage, walk, self-assess) and it returns findings,
  nothing more — the dispatching agent stays responsible for
  step 6 (append to `plan/CRITIQUE.md`) and step 7 (commit +
  push), so cloud-mode trailer discipline never depends on a
  sub-agent prompt the parent doesn't fully control.

### [x] [A, 3.6] README's "nexus runs on nexus" section undercounts the verify gate's legs — this commit
- category: doc-drift
- fix: changed README.md:566's "six hermetic legs" to "seven",
  and appended "dual-shell parity checked" to the parenthetical
  leg list — phase 29's `dualshell` leg had never been folded
  into this paragraph's count. Confirmed via `node
  scripts/verify.mjs`: seven legs print (`links, tree, discover,
  placeholders, anatomy, emoji, dualshell`).

### [x] [C, 2.7] plan/PHASE_CANDIDATES.md still cites skills/digest.md §4 for content that's in §3 — this commit
- category: link-hygiene
- fix: reworded `plan/PHASE_CANDIDATES.md:591` from
  `` `skills/digest.md` §4 `` to `` `skills/digest.md` §3 step 4 ``,
  matching `plan/DIGEST.md:107`'s already-fixed phrasing —
  confirmed the cited "starved queue" language lives at
  `skills/digest.md:66`, inside step 4 of `## 3. The procedure`,
  not `## 4. Hard rules`.

### [x] [A, 3.2] README.md's kit tree omits templates/workspace/ — this commit
- category: doc-drift
- fix: added a collapsed `workspace/` tree entry (4 files:
  `CLAUDE.md`, `AGENTS.md`, `README.md`, `REPOS.md`) to
  README.md's "What's in this kit" templates block, matching
  `templates/README.md:84`'s phrasing. Also closes
  `plan/CRITIQUE.md`'s open LOW row describing the same gap.

### [x] [F, 3.6] CLOUD_LOOP.md hedges "Sonnet 5" mentions but not the adjacent "Opus 4.8" ones — this commit
- category: freshness
- fix: added "(ids age — check `/model`)" as its own line after
  the Opus 4.8 row in the cost table
  (`templates/.github/CLOUD_LOOP.md:34-37`) and folded the same
  hedge into the "Upgrading the model" section's "To upgrade to
  Opus 4.8" sentence (line 232, "same hedge applies") — matching
  the existing Sonnet-5 hedge already present in both spots.
  Confirmed no matching gap in the root `.github/CLOUD_LOOP.md`
  (nexus's own copy, not the template) — it only mentions
  `claude-sonnet-5` once, no paired Opus line.

### [x] [user-issue #12] [MED] nexus's own march.yml needs phase 17's weighted-ceiling patch applied by hand — this commit (closes #12)
- fix: applied exactly as the row's `next` prescribed, from the
  2026-08-23 local `/oversight` session (Q2 authorized it —
  this was the human-credentialed session the row waited 7
  weeks for; the session's own pushes to `.github/workflows/`
  confirmed the local credential clears the `workflows`-scope
  wall `ACTIONS_PAT` cannot). Replaced the flat `Daily commit
  ceiling check` step in `.github/workflows/march.yml` with the
  weighted version from `templates/.github/workflows/march.yml`
  (phase=3 / churn=1, minus the bootstrap.local.json comment
  block — nexus has none), keeping `ceiling=8`, and aligned
  `.github/CLOUD_LOOP.md`'s "Daily operation" -> Ceiling bullet
  with the template's "The daily ceiling" section.

### [x] [user-issue #33] [MED] guard.mjs's no-verify regex false-positives across unrelated multi-line bash text — this commit (closes #33)
- fix: all four `RULES` entries in `.claude/hooks/guard.mjs`
  used `[^|;&]*`, a negated character class that (unlike `.`)
  matches newlines in JS regex, letting the pattern span
  logical command boundaries in a multi-line Bash string.
  Reproduced live: a command with `git log` on one line, an
  unrelated `echo "...commit..."` on a second, and an unrelated
  `-n` flag on a third false-blocked as `no-verify` with no
  actual `git commit --no-verify` anywhere — this happened
  organically while verifying the finding. Changed `[^|;&]*` to
  `[^|;&\n]*` (`\\n` inside the one template-literal rule) across
  all 8 occurrences in the 4 rules, and added the reproducing
  case to `selfTest()`'s cases array so it can't regress
  silently. `node .claude/hooks/guard.mjs self-test` green.

### [x] [A, 2.4] templates/plan/README.md's layout tree omits CURRENT-STATE.md — this commit
- fix: added a `CURRENT-STATE.md` row to the Layout tree in
  `templates/plan/README.md`, annotated "adopt-by-need:
  brownfield retrofit only" to match how `templates/README.md`
  and `playbooks/existing-project.md` already describe it.

### [x] [A, 2.7] three docs describe/quote the old, shorter templates/claude/CLAUDE.md — this commit
- fix: reworded the tree-comment labels in `README.md:556` and
  `templates/README.md:44` from "two-line pointer" to "short
  pointer" (non-numeric, can't drift again), and refreshed
  `customization/claude-code.md`'s quoted block to match
  `templates/claude/CLAUDE.md` verbatim — added the missing
  build-plan-pointer line and the second "pointer, not a rule
  book" paragraph.

### [x] [D, 3.6] three doc H1s are missing their sibling family's prefix — this commit
- fix: `playbooks/cloud-loop.md:1` now reads `# Playbook: cloud
  loop (opt-in) — run /march on GitHub Actions`;
  `customization/auth-aware-critique.md:1` now reads
  `# Customization: auth-aware critique`;
  `customization/branding.md:1` now reads `# Customization:
  branding & assets — the demand-pull capability`. No anchor
  links or title-quoting cross-refs found pointing at the old
  H1 text, so no other doc needed a matching edit.

### [x] [C, 4.0] templates/skills/iterate.md cites the wrong ship-data.md section — this commit
- fix: changed `templates/skills/iterate.md:85` from "Run
  `skills/ship-data.md` §6 audit inline" to "§7" — `ship-data.md`'s
  `## 6. The procedure` is the commit workflow; "Stale time-bound
  entries" / "Coverage gaps" are actually items 3 and 4 under
  `## 7. Audit pass`.

### [x] [A, 5.4] concepts/skills-anatomy.md's "seven (or eight) skills" count is stale ~2x — this commit
- fix: reworded `concepts/skills-anatomy.md:374` from "The seven
  (or eight) in the nexus templates cover most projects" to "The
  skills already in the nexus templates cover most projects" —
  drops the hardcoded number (currently 15 files in
  `templates/skills/`) that kept drifting instead of trying to
  keep a second count in sync.

### [x] [B/E, 6.3] existing-project.md's overlay copies only `deploy-check.mjs` from `templates/scripts/`, not the whole directory — this commit
- fix: changed the overlay's `fs.cpSync` array entry in
  `playbooks/existing-project.md` §3 from
  `['templates/scripts/deploy-check.mjs','scripts/deploy-check.mjs']`
  to `['templates/scripts','scripts']`, matching
  `new-project.md`'s bulk copy, and dropped the now-redundant
  `fs.mkdirSync('scripts', ...)` call (`cpSync` creates it).
  Brownfield adopters now get `loop-issue.mjs`, `notify.mjs`,
  `bootstrap.mjs`, `lint-migration.mjs`, `stack-lifecycle.mjs`,
  `refresh-critique-session.mjs`, and
  `check-secrets-liveness.mjs` alongside the bulk-copied
  `templates/skills/` and `.claude/settings.json` that already
  assume they exist. `new-project.md`'s existing "Prune
  adopt-by-need files" section (already pointed to by
  `existing-project.md`) already covers pruning the unneeded
  ones, so no new pruning instructions needed.

### [x] [C/F, 1.6] Fictional example deploy URL in `templates/skills/bootstrap.md` now resolves to an unrelated site — this commit
- fix: swapped the sample terminal-output block's example
  hostname at `templates/skills/bootstrap.md:217` from
  `https://ember.vercel.app` (now a real, unrelated live site)
  to `https://your-app.vercel.app`, matching the placeholder
  style already used elsewhere (`https://your-site.netlify.app`
  in `playbooks/new-project.md:242`).

### [x] [A, 4.5] README's own kit tree omits root `CLAUDE.md` — this commit
- fix: added `├── CLAUDE.md` (with a one-line comment on why it
  matters — Claude Code only auto-loads it from repo root) to
  README.md's "What's in this kit" tree, between `agents.md`
  and `package.json` — the one root substrate file the tree
  omitted despite the doc's own "Files added" list (line 170)
  and `templates/README.md`'s tree both already treating it as
  real.

### [x] [A, 1.6] plan/steps/01_build_plan.md's "Carry-overs" section cites stale queue counts — this commit
- fix: reworded both `plan/steps/01_build_plan.md` Carry-overs
  bullets (`plan/AUDIT.md`, `plan/PHASE_CANDIDATES.md`) to point
  at each file's live Pending section instead of a hardcoded
  count, so the two numbers can't go stale between audit passes
  again — the recurring failure mode this row itself kept
  re-triggering.

### [x] [C, 3.6] scripts/verify.mjs's REVERSE_CHECK_DIRS omits templates/plan — this commit
- fix: added `'templates/plan'` to `REVERSE_CHECK_DIRS` in
  `scripts/verify.mjs:165-168`. Re-ran the gate: green, 35 files
  reverse-checked (up from 24), no new failures — closes the
  blind spot that let the `PHASE_CANDIDATES.md`/`CURRENT-STATE.md`
  gap (2026-07-19 digest tick, `[A/C, 3.2]` below) go uncaught by
  the mechanical gate.

### [x] [D, 1.8] README.md:309, 310, 324 has unwrapped bullets breaking the locked wrap rule — this commit (closes #28)
- fix: hard-wrapped the Verify-gate/Deploy-gate bullets
  (`README.md:309-313`) and the `plan/AUDIT.md` state-files
  bullet (`README.md:323-324`) to ~62-64 cols, matching the
  multi-line bullet continuation style already used at
  `README.md:613-624` (2-space-indented continuation lines).

### [x] [A, 2.4] README's own kit tree omits `skills/digest.md` from the collapsed `skills/` enumeration — this commit
- fix: added `skills/digest.md` as its own leaf line in
  `README.md:509-512`'s collapsed `skills/` tree, noting
  "never dispatched by march" (matching `agents.md`'s skill
  table), instead of folding it into the `march.md`
  parenthetical it isn't actually part of.

### [x] [A/E, 2.7] README's "Files added" checklist undersells `scripts/` — this commit (closes #27)
- fix: changed `README.md:170-171`'s "Files added" checklist
  entry from `scripts/deploy-check.mjs` to `scripts/`, matching
  how `plan/` and `skills/` are already collapsed — step 4's
  bulk copy (`['templates/scripts','scripts']`) lands all 8
  scripts, not just `deploy-check.mjs`.

### [x] [A, 4.8] customization/claude-code.md teaches the exact claude_args JSON form march.yml documents as broken — this commit (closes #26)
- fix: changed `customization/claude-code.md:310`'s Model
  routing lever cell from `` claude_args: {"model": "..."} ``
  to the CLI-flag string form, and added a guidance bullet
  citing the production incident where the JSON form silently
  dropped `permissionMode` (model applied; permission mode
  stayed `default`), pointing at `.github/workflows/march.yml`'s
  working `claude_args: >-` block.

### [x] [F, 4.5] templates/.github/CLOUD_LOOP.md cites stale model names "Sonnet 4.6"/"Opus 4.7" — this commit
- fix: changed "Sonnet 4.6" -> "Sonnet 5" and "Opus 4.7" ->
  "Opus 4.8" in both the cost-estimate table and "Upgrading the
  model" section of `templates/.github/CLOUD_LOOP.md`, matching
  the id pinned in `templates/.github/workflows/march.yml:164`
  (`claude-sonnet-5`) and the standing "ids age — check
  `/model`" caveat used elsewhere in the kit. This is the
  template counterpart of the `playbooks/cloud-loop.md:62` fix
  two ticks ago — that fix touched only the internal doc; this
  one is the file adopters actually copy.

### [x] [F/A, 3.6] playbooks/cloud-loop.md:62 cites a stale model name "Sonnet 4.6" — this commit
- fix: changed "Sonnet 4.6" to "Sonnet 5" at
  `playbooks/cloud-loop.md:62`, matching the model id pinned in
  `.github/workflows/march.yml`, `templates/.github/workflows/march.yml`,
  and `customization/claude-code.md`, and added the kit's
  standing "ids age — check `/model`" caveat inline.

### [x] [A/E, 4.0] templates/skills/triage.md hardcodes `blob/main` instead of `<DEFAULT_BRANCH>` — this commit
- fix: replaced `blob/main` with `blob/<DEFAULT_BRANCH>` at
  `templates/skills/triage.md:137`, matching the placeholder
  already used by `templates/skills/plan-a-phase.md:150` and
  `templates/skills/ship-a-phase.md:157,260`. An adopter on a
  non-`main` default branch now gets the same self-healing
  placeholder sweep as those two templates instead of a
  permanently wrong link.

### [x] [B, 4.5] existing-project.md's overlay creates an empty `plan/phases/` with no brief inside it — this commit
- fix: added a paragraph right after the overlay's GitHub-as-DB
  note in `playbooks/existing-project.md` explaining that
  `plan/phases/` lands empty (unlike `new-project.md`'s bulk
  `templates/plan` → `plan` copy) and pointing the reader at
  `new-project.md` §5's brief format, or copying
  `templates/plan/phases/phase_1_bootstrap.md` in as a starting
  point — before §6's "commit the build plan and the first
  phase brief" step assumes one exists.

### [x] [A/E, 4.5] playbooks/new-project.md's placeholder-sweep one-liners omit `./data`, leaving GitHub-as-DB adopters' tokens unresolved — this commit
- fix: added `./data` to both the bash `grep -rl` scope and the
  PowerShell `Get-ChildItem -Recurse` scope in
  `playbooks/new-project.md` §4 (the latter also gets
  `-ErrorAction SilentlyContinue` since `./data` only exists for
  adopters who opted into GitHub-as-DB), and a one-line note in
  the preceding GitHub-as-DB copy paragraph confirming both
  one-liners already cover it. Reproduced in a scratch repo
  before fixing: `templates/data/README.md`'s `<PROJECT>`/
  `<PROJECT_PKG_PREFIX>` tokens survived the documented sweep as
  written. Same bug class as the already-fixed `./scripts`/
  `./.env.example` scope gaps (`plan/CRITIQUE.md` Done log).
  `existing-project.md` doesn't carry its own copy of this
  one-liner — it points to `new-project.md` §4 — so no duplicate
  fix needed there.

### [x] [A/C, 3.2] README's kit-tree omits two real files under `templates/plan/` — this commit
- fix: added `PHASE_CANDIDATES.md` and `CURRENT-STATE.md` (with
  a matching one-line annotation each) to README.md's
  `templates/plan/` tree block, closing the gap against
  `templates/README.md`'s own tree (lines 19, 22) and actual
  disk contents. Left `scripts/verify.mjs`'s
  `REVERSE_CHECK_DIRS` untouched — the suggested mechanical
  catch is a separate, larger change (would need to teach the
  reverse-checker `templates/plan`'s adopt-by-need annotations,
  which its current dirs don't have) and this tick is scoped to
  the one finding.

### [x] [A, 3.2] README.md:381 repeats the stale "six skill files" count — this commit
- fix: reworded both stale occurrences — `README.md:381`-383
  ("the six skill files" → "the skill set") and
  `playbooks/new-project.md:18` ("Six skill files in
  `skills/`" → "The skill set in `skills/` (count varies with
  which adopt-by-need files you keep)"). Closes the matching
  `plan/CRITIQUE.md` LOW row on the same root cause.

### [x] [A, 4.2] README's command table omits `/digest`, `/lessons-pr`, `/moderate` — this commit
- fix: added a `/digest` row to the main command table
  (`README.md`'s "What you get" section) and a `/moderate` row
  to the opt-in table alongside `/ship-asset`. Deliberately
  skipped `/lessons-pr` — it's a nexus-self meta-skill with no
  `templates/skills/` counterpart, never copied to adopter
  repos, so it doesn't belong beside commands adopters actually
  run; the existing forward-reference at `README.md:237` already
  covers it correctly.

### [x] [C, 4.8] `https://thock.netlify.app` 404s — this commit
- fix: replaced all five occurrences of
  `https://thock.netlify.app` with `https://thock.xyz` in
  `README.md:53`, `templates/README.md:87`, and
  `playbooks/new-project.md:98,245,261` — confirmed live via
  curl (netlify domain 404s, `.xyz` returns 200) before editing.

### [x] [A/B, 7.2] existing-project.md's overlay never copies plan/steps/01_build_plan.md, but §6 tells the reader to open it — this commit
- fix: added
  `['templates/plan/steps/01_build_plan.md', 'plan/steps/01_build_plan.md']`
  to the overlay's `cpSync` array in
  `playbooks/existing-project.md`'s §3 command (the
  `mkdirSync('plan/steps')` call next to it only ever made an
  empty directory), and reworded §6's "Open
  `plan/steps/01_build_plan.md` (the template)" to say the
  overlay step already copied it in — same bug class as the
  already-fixed `plan/phases/`/`CLAUDE.md` gaps in
  `new-project.md`, just never mirrored to this brownfield
  playbook.

### [x] [2.1] templates/README.md's sample placeholder one-liner uses variable names that don't match its own 8-entry table — this commit
- fix: deleted the abbreviated, partially-wrong bash sample
  (declared `PROVIDER`/`REPO` vars but the table uses
  `HOSTING_PROVIDER`/`REPO_SLUG`, and it only covered 2 of 8
  placeholders behind an `# ...etc` comment) and pointed
  `templates/README.md` straight at
  `playbooks/new-project.md` §4's exhaustive, correct bash +
  PowerShell one-liners instead of maintaining two copies that
  can drift.

### [x] [3.2] data-layer mermaid diagram is a style outlier — this commit
- fix: both mermaid flowcharts in the kit (README's playbook
  picker, `customization/data-layer.md`'s variant picker) are
  the same shape — a branching decision tree — used
  consistently, not two unrelated one-offs. Kept both as-is and
  formalized the pattern as voice rule 8 in `plan/bearings.md`:
  mermaid `flowchart` is the accepted idiom for decision-routing
  only, prose/tables stay default for everything else.

### [x] [5.6] verify.mjs's tree leg never parses templates/README.md — this commit
- fix: generalized `legTree()`'s fence parser into
  `parseTreeBlock(text, rootLabel, prefix)`, called once for
  `README.md`/`nexus/` (prefix `''`, root IS disk root) and once
  for `templates/README.md`/`templates/` (prefix `'templates'`,
  a real subdirectory). The comment stripper (`stripTreeComment`)
  now cuts at whichever comes first, a bare `#` or a run of 2+
  spaces — needed because `README.md` mixes both single-space-
  before-`#` and double-space-before-`#` styles while
  `templates/README.md` uses `→`/`(...)` after 2+ spaces only.
  Added a reverse disk→tree check (`REVERSE_CHECK_DIRS`:
  `templates/scripts`, `templates/skills`,
  `templates/claude/commands`, `templates/claude/agents`) that
  walks each dir's real files and fails if one is missing from
  both diagrams' entry sets — but only for dirs a diagram
  actually expands per-file; `claude/commands/` and
  `claude/agents/` stay intentionally collapsed to one entry in
  both docs, so they're correctly skipped rather than false-
  flagged. Verified both directions catch induced gaps (an
  untracked probe file under `templates/scripts/`, and a renamed
  tree entry) before reverting the probes.

### [x] [1.8] templates/scripts/__tests__/loop-issue.test.mjs isn't in either layout tree — this commit
- fix: added `│   └── __tests__/loop-issue.test.mjs` to
  `templates/README.md`'s `scripts/` tree block, and the
  equivalent leaf to `README.md`'s own kit tree (a second,
  previously-unreported instance of the identical gap found
  during the 2026-07-11 re-sweep) — both now list the file every
  bulk `scripts/` copy already silently includes.

### [x] [3.5] cloud-loop reference implementation is an external link — this commit
- fix: `playbooks/cloud-loop.md`'s "Reference implementation"
  section now points primarily at this repo's own `.github/`
  (the ouroboros — nexus runs the loop on itself), keeping
  `thock` as the secondary reference instead of the sole link.

### [x] [3.6] plan/steps/01_build_plan.md's Phase log is missing 6 of 18 phases — this commit
- fix: appended phases 9, 10, 11, 13, 15, 17 to the Phase log
  in `plan/steps/01_build_plan.md`, commit order, matching the
  existing one-line style — closing the gap against the 18
  phases the Status block already marks `[x]`.

### [x] [4.2] three onboarding docs claim "six placeholders," templates/README.md's canonical table has eight — this commit
- fix: added `<PROJECT_TAGLINE>` and `<PROJECT_PKG_PREFIX>` to
  `README.md`'s TL;DR placeholder list, `new-project.md`'s §4
  mapping table, both one-liners (bash `grep -rl`/`sed -i` and
  the PowerShell `$repl` hashtable), relabeled "all six" → "all
  eight" in `new-project.md` and `windows-notes.md`, and fixed
  the same stale "all six" in `existing-project.md`'s §3 (same
  root cause, outside the original three-doc citation but
  caught while fixing the others).

### [x] [4.8] heartbeat.yml's alarm text hardcodes a cadence that doesn't match the template's default march.yml cron — this commit
- fix: `templates/.github/workflows/heartbeat.yml:64` no longer
  hardcodes "cadence is 6h" (only true of nexus's own instance
  cron, not the template's mostly-2h default in
  `templates/.github/workflows/march.yml:15`); reworded
  cadence-agnostic: "alarm threshold 14h — check your march cron
  schedule". This repo's own `.github/workflows/heartbeat.yml`
  left untouched (accurate as-is; `ACTIONS_PAT` also cannot push
  `.github/workflows/*.yml` here anyway — same constraint as
  user-issue #12).

### [x] [4.8] templates/README.md's Adopt-by-need table omits two conditional files its own tree comments call out — this commit
- fix: added rows for `.github/workflows/nightly-smoke.yml`
  (adopt when hermetic e2e is in use and `night.yml` doesn't
  already run `SMOKE_SAMPLE=full`) and `scripts/stack-lifecycle.mjs`
  (adopt when hermetic e2e uses Pattern B) to the "Adopt-by-need
  files" table in `templates/README.md`, matching the tree
  comments at lines 62 and 72.

### [x] [3.8] generic-specialist template omits the model: lever — this commit
- fix: added a commented `model:` frontmatter line + a one-line
  guidance comment to
  `templates/claude/agents/generic-specialist.md`, matching the
  per-agent routing lever `customization/claude-code.md` §5
  documents. Used a concrete example id
  (`claude-haiku-4-5`, with the standing "ids age — check
  /model" caveat) instead of a new bracket token, keeping the
  placeholder vocabulary unchanged.

### [x] [4.8] cloud_loop.schedule_cron field is inert, same gap daily_ceiling had — this commit
- fix: added `applyScheduleCron` to
  `templates/scripts/bootstrap.mjs`, same anchor-and-warn
  pattern as `applyDailyCeiling`, wired into `install-workflow`
  right after it. Updated
  `customization/bootstrap-automation.md`'s "GitHub Actions
  workflow quirks" note to describe both fields as wired
  instead of citing the cron line as the still-literal
  precedent.

### [x] [4.9] verify-gate composition drifts across three docs — this commit (closes #16)
- fix: declared the canonical composition + two variance rules
  ("data:validate iff data layer; lint optional leg") once in
  `templates/agents.md`, echoed the lint rule in
  `templates/plan/bearings.md` (also fixing a bare
  `customization/...` path to `nexus/customization/...`), and
  applied both rules explicitly in `customization/verify-gate.md`'s
  web-stack example (data:validate dropped, lint left standalone).

### [x] [6.3] deploy-check.mjs covers 4 of 8 documented providers — this commit (closes #15)
- fix: added `cloudflare-pages`, `render`, and `fly` blocks to
  `templates/scripts/deploy-check.mjs`, porting the patterns
  already documented in `playbooks/ci-providers.md` into the
  same `pollLoop`/`configFail`/`apiFail` contract the other
  providers use. Updated the script's "Supported:" list and the
  playbook's intro line + per-provider snippets to point at the
  template instead of prose-only patterns.

### [x] [6.6] template user-author mechanic teaches a config the action overrides — this commit (closes #14)
- fix: this repo's next few cloud ticks landed authored as
  `nexus` (multiple commits since 2026-07-03), validating the
  env-var mechanic on @v1. `templates/.github/CLOUD_LOOP.md`
  step 3 and `templates/.github/workflows/march.yml` (the
  `Configure git author` step, the `Run /march` env block, and
  prompt item 5) now teach `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env
  vars instead of `git config user.*`.

### [x] [4.2] existing-project audit snippet is crude — commit 1cfab4b
- fix: phase 9 rebuilt the snippet on `git rev-list --count
  HEAD` / `git rev-list --count --since=... HEAD` (cross-shell
  git primitives) instead of `git log | grep -c '^Author:'`.

### [x] [5.4] bootstrap.mjs mixes findstr (Windows) and awk (POSIX) — this commit
- fix: `handoff()`'s `verify` is now `{ describe, check }`;
  `check()` runs `gh api` and tests `stdout.includes(...)` in
  JS instead of piping through `findstr`/`grep`. Same fix
  applied to the Supabase-keys handoff's doc-only verify
  string (no shell pipe at all now).

### [x] [7.2] data-layer.md cites an invented model id — this commit
- fix: `customization/data-layer.md`'s provenance schema
  comment now reads a real id (`claude-opus-4-8`) with the
  kit's standing "ids age — check /model" caveat, matching
  `.github/CLOUD_LOOP.md` and `customization/claude-code.md`.

### [x] [7.2] guard.mjs's commit-verb allowlist blocks critique/plan-a-phase's own documented verbs — this commit (closes #56)
- fix: added `critique` and `phases` to
  `templates/claude/hooks/guard.mjs`'s `VERBS` array plus two
  matching `self-test` cases, and added the corresponding rows
  to `templates/plan/bearings.md`'s commit-verb table —
  bringing the template in line with the kit's own
  `.claude/hooks/guard.mjs`, which already carried both verbs.
