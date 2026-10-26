# Playbook: upgrade (one command keeps a repo on the current kit)

> `npx @usenexus/cli upgrade` moves a v1 repo (a phase plan) to
> v2 (specs and chunks), and brings any v2 repo up to the kit
> the CLI carries. It is a dry run until you say `--write`; it
> works from a fresh fetch of your origin, never your checkout;
> it carries a live loop's own steps across unchanged; it lands
> between two ticks; one revert rolls it back. Nothing moves on
> its own: a repo stays where it is until someone types the
> command. The by-hand route is at the end, for a repo the
> command cannot reach.

---

## Which version am I on

| You have | You're on | The command does |
|---|---|---|
| `plan/steps/01_build_plan.md` and `plan/phases/`, no `plan/nexus.lock` | v1 (phases) | the upgrade, v1 to v2 |
| `plan/nexus.lock` with `shape: phases` | v1, pinned | the upgrade, v1 to v2 |
| `plan/nexus.lock` with `shape: chunks` beside `plan/steps/` or `PHASE_CANDIDATES.md` | half-done | finishes [Step 5](#step-5--retire-the-v1-files) only |
| `plan/nexus.lock` with `shape: chunks` | v2 | the sync, to the kit the CLI carries |

The `v1.0.0` tag is the last phase-shape release:
`https://github.com/daretodave/nexus/tree/v1.0.0`. Everything
a v1 repo copied (skills, templates, playbooks) is there,
unchanged, for as long as you want to stay.

## Quick reference

| Command | Does |
|---|---|
| `npx @usenexus/cli upgrade` | Dry run on the repo in this folder: the report, nothing written. |
| `... upgrade --repo <dir>` | The same for another folder. |
| `... upgrade --repo owner/name` | The same for a repo on GitHub, no checkout (a URL works too). |
| `... upgrade --verify` | Also run the repo's own verify (its frozen install first). |
| `... upgrade --keep-workflow` | Leave `march.yml` as it is; report what the merge would keep. |
| `... upgrade --json` | The report as JSON. |
| `... upgrade --write` | With the gate green, one commit on a branch; nothing pushed. |
| `... upgrade --land owner` | `--write`, then land it between two ticks and watch the first. |
| `... upgrade --land pr` / `--pr` | `--write`, push the branch, open a pull request whose body is the report. |
| `... upgrade --repo owner/name --pr` | The pull request, from a temporary clone (a fork without push access). |
| `... upgrade --no-assist` | Sync only: leave a conflicting file as the repo's, listed. |
| `... upgrade --rollback` | Revert the upgrade commit; the lock back to `v1.0.0`. |

Exit 0: the report printed (or committed, landed, opened).
Exit 1: the gate failed; the worktree is kept and its path
printed. Exit 2: not a nexus repo, no origin, or flags that do
not go together. Both shells run every line the same.

## The dry run

```bash
npx @usenexus/cli upgrade
```

It writes nothing anywhere you look. Your checkout can be
months stale and dirty, so the command never reads it: it
fetches origin's default branch and works in a temporary
worktree cut from it, checked out with origin's line endings.
There it:

1. **Detects** the shape (the table above).
2. **Copies the v2 kit**: the [manual copy list](#manual-copy-list),
   the CLI's bundled copy of it.
3. **Merges the roadmap**: `plan/README.md` gains the v2
   lanes and spec table; your own sections stay where they
   are; `<PROJECT>` is filled from `package.json` `name`, else
   the `agents.md` title.
4. **Converts** the build plan (the [table in Step 4](#step-4--convert-the-build-plan)).
5. **Carries the train** and **merges the workflow** (below).
6. **Writes the conservative knobs** (below).
7. **Flips the lock** to `version: 2.0.0`, `shape: chunks`.
8. **Gates**: plan-check, its test and workflow-lint, in the
   worktree. `--verify` adds your own verify command; without
   it the report names the command and skips it.
9. **Predicts the first dispatch**: march's pick order played
   forward over the result, lanes included.

Then it prints the report and removes the worktree.

### Reading the report

| Part | What to check |
|---|---|
| Files | Every file it touched, one row each: `added`, `replaced`, `seeded`, `merged`, `converted`, `retired`, `renamed`, `rewritten (N refs)`, `moved-to-lane (N)`, `moved-to-skill`, `kept-custom`. A `kept-custom` you expected to be kit text, or a `replaced` you had edited, is the row to read first. |
| Archive lines | One line per shipped phase. Count them against your `[x]` rows; a sha shown as `unknown` needs yours. |
| Warnings | Unparsed status rows, an open suffixed phase's new number, carry-overs to place by hand. |
| Gate | Green or red, leg by leg. A workflow-lint problem your origin already had, in a file only rewritten, is a warning. |
| Knobs | What it wrote and at what value (below). |
| First dispatch | What the first v2 tick will pick. **Idle on a repo whose v1 loop was live is a red warning**: fix it before you write. |
| Loop mode | The `gh variable set NEXUS_LOOP_MODE --body owner` line, when the v1 loop pushed the default branch. |

Run it again after any fix; it starts from origin every time.

## Carrying a live loop across

The rule: nothing you wrote is dropped; kit text is replaced;
anything unrecognised is kept. The worked example is a v1 repo
whose cloud loop runs an editorial content queue: its
`march.md` carries a weekly snapshot gate, the queue itself
and an empty-queue refill, and every content commit of the
last week came from them.

- **Your steps become lanes.** The CLI carries every header
  and paragraph the kit's `march.md` and `iterate.md` ever
  held, so a fork from long before `v1.0.0` still reads as
  kit text. A section the kit never had moves verbatim into
  `skills/march.lanes.md` or `skills/iterate.lanes.md`
  ([project lanes](../customization/project-lanes.md)), one
  lane per section: ahead of the v1 phase pick a `pre` lane,
  after it a `queue` lane, both ending the tick (v1 dispatch
  was first match wins); iterate's are `dimensions`. Your
  paragraphs inside a kit step become one `<step>-notes` lane
  that continues. Words outside the procedure move under one
  notes header, never as a lane. The kit never overwrites a
  lanes file.
- **Your skills and commands stay.** One the kit never shipped
  is kept; a command with no skill becomes `skills/<name>.md`.
- **v1 references are rewritten** across the repo, workflow
  prompts included: `01_build_plan`, `plan/phases`,
  `plan/steps`, `ship-a-phase`, `plan-a-phase`,
  `PHASE_CANDIDATES`. History files (`ARCHIVE.md`,
  `DIGEST.md`, changelogs, dated logs) are left alone.
- **The workflow is merged, not replaced.** `march.yml` takes
  the v2 owner-job shape and keeps your cron, ceiling number,
  model pin, every extra `env:` entry (deploy tokens by name),
  concurrency group, any step the kit never shipped and any
  prompt line no kit version held. The toolchain steps move
  into `.github/actions/setup/action.yml`; a step that reads a
  secret stays in the job. Other workflows change only by the
  reference rewrites. `--keep-workflow` skips the merge.

### Conservative knobs

Every knob the kit added since v1 is written at the value that
keeps today's behaviour, so the train runs unchanged; turn
them up later, one at a time.

| Knob | Written |
|---|---|
| `Improve:` (bearings) | `gentle` |
| `Support:` / `NEXUS_SUPPORT` | `triage-only` / unset |
| `Promote:` | `owner` |
| `## Generators` | empty |
| `stall_action` | `alert` |
| `loop` (iterate dimension) | `off` |
| `UI:` | `none` |
| `NEXUS_CADENCE`, `NEXUS_CHAIN_MAX` | unset, `0` |
| `NEXUS_IDLE_BACKOFF` | `0` (never skip) |
| `NEXUS_QUOTA_MAX` | unset (the kit default) |

The bearings knobs go in a `## Loop knobs` block of
`plan/bearings.md`; a knob line you already have is kept. The
repo variables are printed as `gh variable set` lines, never
set by the dry run.

## Write, land, watch

```bash
npx @usenexus/cli upgrade --write
```

With the gate green, one commit, `plan: upgrade to nexus v2
(specs + chunks)`, on branch `nexus/upgrade-v2`. Nothing is
pushed. How it reaches the default branch:

- **`--land owner`** (the default when the v1 history shows
  `Cloud-Run` commits on the default branch): waits for an
  idle window (no march run queued or running, the next cron
  ten minutes or more away), pauses march, sets
  `NEXUS_LOOP_MODE=owner`, pushes, resumes march, dispatches
  the first v2 tick and watches it, printing its dispatch and
  its commit. March is always resumed once paused. A tick
  that no-ops where the report predicted work prints the
  `--rollback` line. `--no-pause` and `--no-watch` skip those
  two steps.
- **`--land pr`** (else): pushes the branch and opens a pull
  request whose body is the report. Its merge is the
  cut-over.

### A repo on GitHub, no checkout

```bash
npx @usenexus/cli upgrade --repo owner/name
npx @usenexus/cli upgrade --repo owner/name --pr
```

`--repo` takes `owner/name` or its URL: a blobless clone into
a temporary folder, the same path, the same report, the clone
removed after. `--pr` commits, pushes `nexus/upgrade-<version>`
and opens the pull request (from a fork when you cannot push).
An open upgrade pull request from an earlier run is updated in
place, never a second one. A red gate opens nothing and keeps
the clone. `--pr` on a local checkout does the same, and
`--write` on a GitHub repo without `--pr` is refused.

## On v2: the same command syncs to latest

```bash
npx @usenexus/cli upgrade
npx @usenexus/cli upgrade --write
```

On a v2 repo the command brings the kit up to the one the CLI
carries. The lock's `ref:` names the kit commit the repo
follows, so every kit file has three versions: the kit at
`ref:`, the kit now, and your copy.

| Your copy | The sync |
|---|---|
| untouched since `ref:` | replaced with the kit now |
| changed, and so is the kit | a three-way merge; a conflict goes to an assisted merge (one headless turn per file on your own Claude Code login), shown as a diff, applied only with your gate green |
| new kit content of a kind you take | added; a new knob at its conservative value |
| a lanes file, a skill the kit never shipped | never touched |

`--write` makes one commit, `plan: sync to nexus <version>`,
on `nexus/upgrade-<version>`; `--land` and `--pr` carry it as
above. A CLI older than the repo's kit refuses before any
write. Run it again whenever the kit moves.

## Refining the stub specs

The converter writes each pending phase as a stub spec
(`Not chunked yet.`). Refine the next one or two before the
loop needs them. Keep the phase number as the spec number, so
history lines up: phase 12's spec is `plan/12-<slug>.md` and
its chunks are `12.1`, `12.2`, ….

**A brief becomes a spec.** The brief's sections map across:

| Brief section | Spec section |
|---|---|
| Outcome / Scope | the `>` one-line outcome, and `## Why` |
| Routes, reads, components, composition, states, responsive, "Decisions made upfront" | `## Design` |
| Stack pins, schemas, output formats | `## Contracts` |
| Outputs, the tests matrix, the DoD | `## Acceptance`: one `- **A<n>**` bullet per observable outcome |
| Follow-ups (out of scope) | a candidate in `plan/CANDIDATES.md`, or nothing |

Then chunk it: S/M/L vertical slices (L = one session at
most), each `closes` the A-IDs it finishes, every A-ID
covered, `needs` chaining them, and a true `Measure:` line
(`N open · 0 closed · next A<N+1>`). The model, with every
rule: [`concepts/plan-shape.md`](../concepts/plan-shape.md).

## Rolling back

```bash
npx @usenexus/cli upgrade --rollback
npx @usenexus/cli upgrade --rollback --land owner
```

The upgrade is one commit. `--rollback` reverts it on a fresh
fetch of origin in one commit, the lock pinned back to
`v1.0.0`, on `nexus/rollback-v2`; with `--land` it reaches the
default branch the same way (no dispatch: the v1 cron runs).
By hand, `git revert <sha>` does the same. The kit at the
`v1.0.0` tag still matches the v1 files.

## Half-done upgrades

A lock that says `shape: chunks` beside a live `plan/steps/`
or `PHASE_CANDIDATES.md` is an upgrade stopped part way. The
command finishes [Step 5](#step-5--retire-the-v1-files) only:
retires `steps/`, renames the candidates file, rewrites the
references. A build queue kept on purpose (`plan/settle.json`
`queue` under `plan/steps/`) is v2, not half-done.

## Before upgrading: the v1 quota patch

A v1 cloud loop has no quota governor: it spends the shared
weekly quota with no gate and fires at minute :00, the
busiest slot. To fix that before (or instead of) upgrading,
run nexus's patcher against a fresh clone of your origin,
never your working checkout:

```bash
git clone <your origin> ../v1-patch
node ../nexus/scripts/cloud/patch-v1.mjs --repo ../v1-patch          # dry run: the diff
node ../nexus/scripts/cloud/patch-v1.mjs --repo ../v1-patch --write  # apply; never commits
```

It adds the Quota gate, Quota read and pause steps (and
`scripts/cloud/quota.mjs`) to `march.yml` and `night.yml`,
moves each cron minute off :00 with the hours kept, and
leaves every other line alone. Review, commit and push from
that clone.

---

## By hand

For a repo the command cannot reach, or to see each move. The
command does all six steps in one; these are the same steps,
one at a time, from your repo root with nexus at `../nexus`.

## Step 1 — pin v1 (do this either way)

Write the lock before changing anything, so every skill and
every person knows which kit this plan follows:

```bash
cat > plan/nexus.lock <<'EOF'
# plan/nexus.lock: the nexus kit version this repo follows.
kit: nexus
version: 1.0.0
ref: v1.0.0
shape: phases
adopted: 2026-10-20
EOF
git add plan/nexus.lock
git commit -m "plan: pin nexus v1.0.0 (phases)"
git push origin main
```

The PowerShell twin, Windows native:

```powershell
@'
# plan/nexus.lock: the nexus kit version this repo follows.
kit: nexus
version: 1.0.0
ref: v1.0.0
shape: phases
adopted: 2026-10-20
'@ | Set-Content plan\nexus.lock
git add plan/nexus.lock
git commit -m "plan: pin nexus v1.0.0 (phases)"
git push origin main
```

(Use today's date and your default branch.) If you are staying
on v1, you're done: keep reading the kit at the `v1.0.0` tag.

## Step 2 — copy the v2 files in

Copy every file in the [manual copy list](#manual-copy-list)
from `../nexus/templates/` into your repo. The list is
computed, not hand-kept: the import closures of plan-check,
the converter, claims, the cloud tick, workflow-lint and every
script a skill or the v2 `march.yml` calls, plus every skill,
every command and the shared toolchain action
(`scripts/upgrade-files.mjs` in nexus; the CLI bundles the
same set). It overwrites the kit's skills, so first move any
section you added to `march.md` or `iterate.md` into a project
lane, as [Carrying a live loop across](#carrying-a-live-loop-across)
describes; a skill or command of your own is left alone. A
test your repo already carries for a kit script (an older
copy of the kit's own) is replaced by the kit's, or the new
script fails it; the list's closing note names them. Sweep
the eight placeholders over the new files exactly as
[`new-project.md`](./new-project.md) §4 does.

Two fill-ins were renamed: `<PHASE_N>` → `<SPEC_N>` and
`<PHASE_M>` → `<SPEC_M>`, in `setup/00_files.md`'s index, whose
"Phases that touch it" column is now "Specs that touch it". If
your copy still holds either old name, rename it (or fill in the
spec number).

## Step 3 — write the roadmap

Add the v2 lanes and the spec table from
`../nexus/templates/plan/README.md` to your `plan/README.md`,
keeping your own sections where they are, and fill
`<PROJECT>`. Leave the Asap and Held lanes empty for now.

## Step 4 — convert the build plan

`templates/scripts/upgrade-plan.mjs` does the mechanical half.
Read what it would write, then write it:

```bash
node ../nexus/templates/scripts/upgrade-plan.mjs
node ../nexus/templates/scripts/upgrade-plan.mjs --write
```

It is a dry run unless you pass `--write`; it runs
`plan-check` over the result first and writes nothing if that
is red; it never deletes the v1 files (Step 5 does) and a
second run adds nothing. It walks
`plan/steps/01_build_plan.md` top to bottom like this:

| v1 row | becomes |
|---|---|
| `[x] Phase N — <title> (commit <sha>)` | one `plan/ARCHIVE.md` line: `- <date> · <NN> · <title, ≤ 10 words> · <sha>` (the date from `git show -s --format=%as <sha>`; a `(this commit)` row takes the commit that ticked it; `NN` is N zero-padded to two digits). A `[-]` partial row too. The sha may also be a trailing `` `<sha>` ``, a range `a..b` or `a → b`, or a ship pair `a + b` (archived `a..b`); the title stops at the first ` — `, `. ` or ` (`, and a trailing `` `<sha>` `` never joins it. |
| `[x] Phase Na — <title>` (a letter suffix: `4b`, `15a`) | an archive line under the parent number, the suffix leading the title: `- <date> · 15 · 15a: <title> · <sha>` |
| `[ ] Phase N — <title>` with a brief | a stub spec `plan/<NN>-<slug>.md` (the brief folded into Design, one acceptance ID, `Not chunked yet.`) and a roadmap row; refine it as [above](#refining-the-stub-specs) |
| `[ ] Phase N — <title>` with no brief | a stub spec with its Why (from the build plan's per-phase scope), the row's own text past the title in Design, one acceptance ID, and `Not chunked yet.` |
| `[ ] Phase Na — <title>` | a stub spec as above at the next free spec number (its parent's may already be a spec), with a warning |
| `[blocked: <reason> <date>] Phase N` | a spec as above, plus a Held line `- **<NN>** · blocked: <reason> · since: <date> · until: the owner unblocks it · max_age: 14d` (a lock that times out) |
| `[skipped] Phase N` | one archive line `- <date> · <NN> · dropped: <reason> · (this commit)` |
| Carry-overs / known gaps | by hand: an acceptance ID in the spec it belongs to, or a `plan/AUDIT.md` row |
| Phase log (bulleted `- phase N — <sha> — <summary>` or bare `phase N — …` lines) | an archive line for any phase the status block lacks; otherwise its shas date the rows above. No phase is archived twice. |

No `plan/ARCHIVE.md` yet is fine: it starts one. What it
leaves to you is in its warnings: carry-overs, a `[-]` partial
row's gaps, a shipped row whose commit it could not find
(archived as `unknown`; put the sha in), an open suffixed
phase's new number, and any Status row it could not parse
(named, with the listed and parsed counts).

## Step 5 — retire the v1 files

```bash
git rm -r plan/steps plan/phases
git rm skills/ship-a-phase.md skills/plan-a-phase.md
git rm .claude/commands/ship-a-phase.md .claude/commands/plan-a-phase.md
git mv plan/PHASE_CANDIDATES.md plan/CANDIDATES.md
```

PowerShell runs the same `git` commands unchanged. Already
on v2 with a `plan/PHASE_CANDIDATES.md`? Run just that last
`git mv` (`scripts/pulse.mjs` reads the old name until you do).

```bash
grep -rlE "01_build_plan|plan/phases|ship-a-phase|plan-a-phase" --exclude-dir=.git .
```

The PowerShell twin:

```powershell
Get-ChildItem -Recurse -File | Where-Object FullName -notmatch '\\.git\\' |
  Select-String -Pattern '01_build_plan|plan/phases|ship-a-phase|plan-a-phase' -List |
  Select-Object -ExpandProperty Path
```

Fix every hit. The usual ones: `agents.md`'s skill table and
"Where to look" (what ships next is now `plan/README.md`; a
chunk's requirements are in `plan/<NN>-<slug>.md`; what
shipped is `plan/ARCHIVE.md`), `CLAUDE.md`'s pointer, and
`.github/workflows/march.yml` (the ceiling's ship
discriminator and the skill list: copy both from
`../nexus/templates/.github/workflows/march.yml`, keeping
your cron, ceiling number, model pin and env).

## Step 6 — gate it and flip the lock

Add the plan check to your verify composition (for a pnpm
project, append `&& node scripts/plan-check.mjs --since HEAD`
to the `verify` script), then:

```bash
node scripts/plan-check.mjs
node --test scripts/__tests__/plan-check.test.mjs
```

Both run the same in PowerShell. When they're green, rewrite
the lock to v2 (`version:` and `ref:` from
`../nexus/templates/plan/nexus.lock`, `shape: chunks`, today's
date), write the conservative knobs by hand, and commit
everything as one atomic act:

```bash
git add -A plan skills .claude scripts agents.md CLAUDE.md
git commit -m "plan: upgrade to nexus v2 (specs + chunks)"
git push origin main
```

A live loop: push between two ticks, and set
`NEXUS_LOOP_MODE` to `owner` first when it pushed main.

## You're done when

- [ ] `plan/nexus.lock` says `shape: chunks`.
- [ ] `plan/steps/` and `plan/phases/` are gone; every shipped
      phase is one line in `plan/ARCHIVE.md`.
- [ ] Every pending phase is a spec with a row in
      `plan/README.md`; the next one or two are chunked.
- [ ] Every step your loop ran on v1 is in a lanes file or a
      skill of its own, and the predicted first dispatch is
      the work you expected.
- [ ] `node scripts/plan-check.mjs` is green, and it runs in
      your verify gate.
- [ ] Nothing in the repo still names `01_build_plan`,
      `plan/phases`, `ship-a-phase` or `plan-a-phase`.
- [ ] The first v2 tick picks what the report predicted and
      lands a commit.

## Manual copy list

Generated from the kit (`node scripts/upgrade-files.mjs
--write` in nexus); the gate fails when it drifts.

<!-- upgrade-files:begin (generated by node scripts/upgrade-files.mjs --write; do not edit by hand) -->

111 files in 11 folders, plus 2 lanes files.

| Folder in your repo | Files (from `nexus/templates/`) |
|---|---|
| `.claude/commands/` | `bootstrap.md`, `bug.md`, `critique.md`, `design.md`, `digest.md`, `expand.md`, `heads-down.md`, `iterate.md`, `jot.md`, `march.md`, `messy.md`, `moderate.md`, `next.md`, `oversight.md`, `plan-a-spec.md`, `plot.md`, `reboot-ready.md`, `reboot-resume.md`, `rebooting.md`, `ship-a-chunk.md`, `ship-asset.md`, `ship-data.md`, `ship-migration.md`, `tidy.md`, `triage.md` |
| `.github/actions/setup/` | `action.yml` |
| `scripts/` | `announce.mjs`, `claims-codec.mjs`, `claims.mjs`, `ledger.mjs`, `lint-migration.mjs`, `loop-issue.mjs`, `notify.mjs`, `owner.mjs`, `plan-check.mjs`, `pulse.mjs`, `secrets-audit.mjs`, `secrets-keychain.mjs`, `secrets-run.mjs`, `secrets-scan.mjs`, `secrets-sinks.mjs`, `secrets-vault.mjs`, `secrets.mjs`, `ui-walk.mjs`, `upgrade-plan.mjs`, `workflow-lint.mjs`, `worktree.mjs` |
| `scripts/__tests__/` | `plan-check.test.mjs` |
| `scripts/cloud/` | `cadence.mjs`, `chain.mjs`, `idle.mjs`, `lost.mjs`, `quota.mjs`, `tick.mjs` |
| `scripts/design/` | `board-runtime.js`, `compare.mjs`, `ingest.mjs`, `png.mjs`, `port-map.mjs`, `port.workflow.js`, `prompt.mjs`, `render.mjs` |
| `scripts/generators/` | `research.mjs` |
| `scripts/plan/` | `config.mjs`, `footguns.mjs`, `improve.mjs`, `lanes.mjs`, `locks.mjs`, `loop-rows.mjs`, `motion.mjs`, `order.mjs`, `pending.mjs`, `progress.mjs`, `promote.mjs`, `refill.mjs`, `secrets-manifest.mjs`, `settle.mjs`, `settled.mjs`, `state.mjs`, `support.mjs`, `triage-match.mjs` |
| `skills/` | `bootstrap.md`, `bug.md`, `critique.md`, `design.md`, `digest.md`, `expand.md`, `heads-down.md`, `iterate.md`, `jot.md`, `march.md`, `messy.md`, `moderate.md`, `next.md`, `oversight.md`, `plan-a-spec.md`, `plot.md`, `reboot-ready.md`, `reboot-resume.md`, `rebooting.md`, `ship-a-chunk.md`, `ship-asset.md`, `ship-data.md`, `ship-migration.md`, `tidy.md`, `triage.md` |
| `skills/design/` | `ingest.md`, `port.md`, `render.md` |
| `skills/next/` | `build.md`, `land.md` |

The copy, from your repo root with nexus at `../nexus`:

```bash
mkdir -p .claude/commands
cp ../nexus/templates/claude/commands/bootstrap.md \
   ../nexus/templates/claude/commands/bug.md \
   ../nexus/templates/claude/commands/critique.md \
   ../nexus/templates/claude/commands/design.md \
   ../nexus/templates/claude/commands/digest.md \
   ../nexus/templates/claude/commands/expand.md \
   ../nexus/templates/claude/commands/heads-down.md \
   ../nexus/templates/claude/commands/iterate.md \
   ../nexus/templates/claude/commands/jot.md \
   ../nexus/templates/claude/commands/march.md \
   ../nexus/templates/claude/commands/messy.md \
   ../nexus/templates/claude/commands/moderate.md \
   ../nexus/templates/claude/commands/next.md \
   ../nexus/templates/claude/commands/oversight.md \
   ../nexus/templates/claude/commands/plan-a-spec.md \
   ../nexus/templates/claude/commands/plot.md \
   ../nexus/templates/claude/commands/reboot-ready.md \
   ../nexus/templates/claude/commands/reboot-resume.md \
   ../nexus/templates/claude/commands/rebooting.md \
   ../nexus/templates/claude/commands/ship-a-chunk.md \
   ../nexus/templates/claude/commands/ship-asset.md \
   ../nexus/templates/claude/commands/ship-data.md \
   ../nexus/templates/claude/commands/ship-migration.md \
   ../nexus/templates/claude/commands/tidy.md \
   ../nexus/templates/claude/commands/triage.md \
   .claude/commands/
mkdir -p .github/actions/setup
cp ../nexus/templates/.github/actions/setup/action.yml \
   .github/actions/setup/
mkdir -p scripts
cp ../nexus/templates/scripts/announce.mjs \
   ../nexus/templates/scripts/claims-codec.mjs \
   ../nexus/templates/scripts/claims.mjs \
   ../nexus/templates/scripts/ledger.mjs \
   ../nexus/templates/scripts/lint-migration.mjs \
   ../nexus/templates/scripts/loop-issue.mjs \
   ../nexus/templates/scripts/notify.mjs \
   ../nexus/templates/scripts/owner.mjs \
   ../nexus/templates/scripts/plan-check.mjs \
   ../nexus/templates/scripts/pulse.mjs \
   ../nexus/templates/scripts/secrets-audit.mjs \
   ../nexus/templates/scripts/secrets-keychain.mjs \
   ../nexus/templates/scripts/secrets-run.mjs \
   ../nexus/templates/scripts/secrets-scan.mjs \
   ../nexus/templates/scripts/secrets-sinks.mjs \
   ../nexus/templates/scripts/secrets-vault.mjs \
   ../nexus/templates/scripts/secrets.mjs \
   ../nexus/templates/scripts/ui-walk.mjs \
   ../nexus/templates/scripts/upgrade-plan.mjs \
   ../nexus/templates/scripts/workflow-lint.mjs \
   ../nexus/templates/scripts/worktree.mjs \
   scripts/
mkdir -p scripts/__tests__
cp ../nexus/templates/scripts/__tests__/plan-check.test.mjs \
   scripts/__tests__/
mkdir -p scripts/cloud
cp ../nexus/templates/scripts/cloud/cadence.mjs \
   ../nexus/templates/scripts/cloud/chain.mjs \
   ../nexus/templates/scripts/cloud/idle.mjs \
   ../nexus/templates/scripts/cloud/lost.mjs \
   ../nexus/templates/scripts/cloud/quota.mjs \
   ../nexus/templates/scripts/cloud/tick.mjs \
   scripts/cloud/
mkdir -p scripts/design
cp ../nexus/templates/scripts/design/board-runtime.js \
   ../nexus/templates/scripts/design/compare.mjs \
   ../nexus/templates/scripts/design/ingest.mjs \
   ../nexus/templates/scripts/design/png.mjs \
   ../nexus/templates/scripts/design/port-map.mjs \
   ../nexus/templates/scripts/design/port.workflow.js \
   ../nexus/templates/scripts/design/prompt.mjs \
   ../nexus/templates/scripts/design/render.mjs \
   scripts/design/
mkdir -p scripts/generators
cp ../nexus/templates/scripts/generators/research.mjs \
   scripts/generators/
mkdir -p scripts/plan
cp ../nexus/templates/scripts/plan/config.mjs \
   ../nexus/templates/scripts/plan/footguns.mjs \
   ../nexus/templates/scripts/plan/improve.mjs \
   ../nexus/templates/scripts/plan/lanes.mjs \
   ../nexus/templates/scripts/plan/locks.mjs \
   ../nexus/templates/scripts/plan/loop-rows.mjs \
   ../nexus/templates/scripts/plan/motion.mjs \
   ../nexus/templates/scripts/plan/order.mjs \
   ../nexus/templates/scripts/plan/pending.mjs \
   ../nexus/templates/scripts/plan/progress.mjs \
   ../nexus/templates/scripts/plan/promote.mjs \
   ../nexus/templates/scripts/plan/refill.mjs \
   ../nexus/templates/scripts/plan/secrets-manifest.mjs \
   ../nexus/templates/scripts/plan/settle.mjs \
   ../nexus/templates/scripts/plan/settled.mjs \
   ../nexus/templates/scripts/plan/state.mjs \
   ../nexus/templates/scripts/plan/support.mjs \
   ../nexus/templates/scripts/plan/triage-match.mjs \
   scripts/plan/
mkdir -p skills
cp ../nexus/templates/skills/bootstrap.md \
   ../nexus/templates/skills/bug.md \
   ../nexus/templates/skills/critique.md \
   ../nexus/templates/skills/design.md \
   ../nexus/templates/skills/digest.md \
   ../nexus/templates/skills/expand.md \
   ../nexus/templates/skills/heads-down.md \
   ../nexus/templates/skills/iterate.md \
   ../nexus/templates/skills/jot.md \
   ../nexus/templates/skills/march.md \
   ../nexus/templates/skills/messy.md \
   ../nexus/templates/skills/moderate.md \
   ../nexus/templates/skills/next.md \
   ../nexus/templates/skills/oversight.md \
   ../nexus/templates/skills/plan-a-spec.md \
   ../nexus/templates/skills/plot.md \
   ../nexus/templates/skills/reboot-ready.md \
   ../nexus/templates/skills/reboot-resume.md \
   ../nexus/templates/skills/rebooting.md \
   ../nexus/templates/skills/ship-a-chunk.md \
   ../nexus/templates/skills/ship-asset.md \
   ../nexus/templates/skills/ship-data.md \
   ../nexus/templates/skills/ship-migration.md \
   ../nexus/templates/skills/tidy.md \
   ../nexus/templates/skills/triage.md \
   skills/
mkdir -p skills/design
cp ../nexus/templates/skills/design/ingest.md \
   ../nexus/templates/skills/design/port.md \
   ../nexus/templates/skills/design/render.md \
   skills/design/
mkdir -p skills/next
cp ../nexus/templates/skills/next/build.md \
   ../nexus/templates/skills/next/land.md \
   skills/next/
```

The PowerShell twin:

```powershell
New-Item -ItemType Directory -Force .claude\commands | Out-Null
Copy-Item -Destination .claude\commands -Path ..\nexus\templates\claude\commands\bootstrap.md,
  ..\nexus\templates\claude\commands\bug.md,
  ..\nexus\templates\claude\commands\critique.md,
  ..\nexus\templates\claude\commands\design.md,
  ..\nexus\templates\claude\commands\digest.md,
  ..\nexus\templates\claude\commands\expand.md,
  ..\nexus\templates\claude\commands\heads-down.md,
  ..\nexus\templates\claude\commands\iterate.md,
  ..\nexus\templates\claude\commands\jot.md,
  ..\nexus\templates\claude\commands\march.md,
  ..\nexus\templates\claude\commands\messy.md,
  ..\nexus\templates\claude\commands\moderate.md,
  ..\nexus\templates\claude\commands\next.md,
  ..\nexus\templates\claude\commands\oversight.md,
  ..\nexus\templates\claude\commands\plan-a-spec.md,
  ..\nexus\templates\claude\commands\plot.md,
  ..\nexus\templates\claude\commands\reboot-ready.md,
  ..\nexus\templates\claude\commands\reboot-resume.md,
  ..\nexus\templates\claude\commands\rebooting.md,
  ..\nexus\templates\claude\commands\ship-a-chunk.md,
  ..\nexus\templates\claude\commands\ship-asset.md,
  ..\nexus\templates\claude\commands\ship-data.md,
  ..\nexus\templates\claude\commands\ship-migration.md,
  ..\nexus\templates\claude\commands\tidy.md,
  ..\nexus\templates\claude\commands\triage.md
New-Item -ItemType Directory -Force .github\actions\setup | Out-Null
Copy-Item -Destination .github\actions\setup -Path ..\nexus\templates\.github\actions\setup\action.yml
New-Item -ItemType Directory -Force scripts | Out-Null
Copy-Item -Destination scripts -Path ..\nexus\templates\scripts\announce.mjs,
  ..\nexus\templates\scripts\claims-codec.mjs,
  ..\nexus\templates\scripts\claims.mjs,
  ..\nexus\templates\scripts\ledger.mjs,
  ..\nexus\templates\scripts\lint-migration.mjs,
  ..\nexus\templates\scripts\loop-issue.mjs,
  ..\nexus\templates\scripts\notify.mjs,
  ..\nexus\templates\scripts\owner.mjs,
  ..\nexus\templates\scripts\plan-check.mjs,
  ..\nexus\templates\scripts\pulse.mjs,
  ..\nexus\templates\scripts\secrets-audit.mjs,
  ..\nexus\templates\scripts\secrets-keychain.mjs,
  ..\nexus\templates\scripts\secrets-run.mjs,
  ..\nexus\templates\scripts\secrets-scan.mjs,
  ..\nexus\templates\scripts\secrets-sinks.mjs,
  ..\nexus\templates\scripts\secrets-vault.mjs,
  ..\nexus\templates\scripts\secrets.mjs,
  ..\nexus\templates\scripts\ui-walk.mjs,
  ..\nexus\templates\scripts\upgrade-plan.mjs,
  ..\nexus\templates\scripts\workflow-lint.mjs,
  ..\nexus\templates\scripts\worktree.mjs
New-Item -ItemType Directory -Force scripts\__tests__ | Out-Null
Copy-Item -Destination scripts\__tests__ -Path ..\nexus\templates\scripts\__tests__\plan-check.test.mjs
New-Item -ItemType Directory -Force scripts\cloud | Out-Null
Copy-Item -Destination scripts\cloud -Path ..\nexus\templates\scripts\cloud\cadence.mjs,
  ..\nexus\templates\scripts\cloud\chain.mjs,
  ..\nexus\templates\scripts\cloud\idle.mjs,
  ..\nexus\templates\scripts\cloud\lost.mjs,
  ..\nexus\templates\scripts\cloud\quota.mjs,
  ..\nexus\templates\scripts\cloud\tick.mjs
New-Item -ItemType Directory -Force scripts\design | Out-Null
Copy-Item -Destination scripts\design -Path ..\nexus\templates\scripts\design\board-runtime.js,
  ..\nexus\templates\scripts\design\compare.mjs,
  ..\nexus\templates\scripts\design\ingest.mjs,
  ..\nexus\templates\scripts\design\png.mjs,
  ..\nexus\templates\scripts\design\port-map.mjs,
  ..\nexus\templates\scripts\design\port.workflow.js,
  ..\nexus\templates\scripts\design\prompt.mjs,
  ..\nexus\templates\scripts\design\render.mjs
New-Item -ItemType Directory -Force scripts\generators | Out-Null
Copy-Item -Destination scripts\generators -Path ..\nexus\templates\scripts\generators\research.mjs
New-Item -ItemType Directory -Force scripts\plan | Out-Null
Copy-Item -Destination scripts\plan -Path ..\nexus\templates\scripts\plan\config.mjs,
  ..\nexus\templates\scripts\plan\footguns.mjs,
  ..\nexus\templates\scripts\plan\improve.mjs,
  ..\nexus\templates\scripts\plan\lanes.mjs,
  ..\nexus\templates\scripts\plan\locks.mjs,
  ..\nexus\templates\scripts\plan\loop-rows.mjs,
  ..\nexus\templates\scripts\plan\motion.mjs,
  ..\nexus\templates\scripts\plan\order.mjs,
  ..\nexus\templates\scripts\plan\pending.mjs,
  ..\nexus\templates\scripts\plan\progress.mjs,
  ..\nexus\templates\scripts\plan\promote.mjs,
  ..\nexus\templates\scripts\plan\refill.mjs,
  ..\nexus\templates\scripts\plan\secrets-manifest.mjs,
  ..\nexus\templates\scripts\plan\settle.mjs,
  ..\nexus\templates\scripts\plan\settled.mjs,
  ..\nexus\templates\scripts\plan\state.mjs,
  ..\nexus\templates\scripts\plan\support.mjs,
  ..\nexus\templates\scripts\plan\triage-match.mjs
New-Item -ItemType Directory -Force skills | Out-Null
Copy-Item -Destination skills -Path ..\nexus\templates\skills\bootstrap.md,
  ..\nexus\templates\skills\bug.md,
  ..\nexus\templates\skills\critique.md,
  ..\nexus\templates\skills\design.md,
  ..\nexus\templates\skills\digest.md,
  ..\nexus\templates\skills\expand.md,
  ..\nexus\templates\skills\heads-down.md,
  ..\nexus\templates\skills\iterate.md,
  ..\nexus\templates\skills\jot.md,
  ..\nexus\templates\skills\march.md,
  ..\nexus\templates\skills\messy.md,
  ..\nexus\templates\skills\moderate.md,
  ..\nexus\templates\skills\next.md,
  ..\nexus\templates\skills\oversight.md,
  ..\nexus\templates\skills\plan-a-spec.md,
  ..\nexus\templates\skills\plot.md,
  ..\nexus\templates\skills\reboot-ready.md,
  ..\nexus\templates\skills\reboot-resume.md,
  ..\nexus\templates\skills\rebooting.md,
  ..\nexus\templates\skills\ship-a-chunk.md,
  ..\nexus\templates\skills\ship-asset.md,
  ..\nexus\templates\skills\ship-data.md,
  ..\nexus\templates\skills\ship-migration.md,
  ..\nexus\templates\skills\tidy.md,
  ..\nexus\templates\skills\triage.md
New-Item -ItemType Directory -Force skills\design | Out-Null
Copy-Item -Destination skills\design -Path ..\nexus\templates\skills\design\ingest.md,
  ..\nexus\templates\skills\design\port.md,
  ..\nexus\templates\skills\design\render.md
New-Item -ItemType Directory -Force skills\next | Out-Null
Copy-Item -Destination skills\next -Path ..\nexus\templates\skills\next\build.md,
  ..\nexus\templates\skills\next\land.md
```

The lanes files (`skills/iterate.lanes.md`, `skills/march.lanes.md`) are copied only when your repo has none: they hold your own steps, and nothing overwrites them.

The kit's tests of the scripts above go only over a copy your repo already has (an older copy fails the new script): `scripts/__tests__/announce.test.mjs`, `scripts/__tests__/claims-codec.test.mjs`, `scripts/__tests__/claims.test.mjs`, `scripts/__tests__/ledger.test.mjs`, `scripts/__tests__/loop-issue.test.mjs`, `scripts/__tests__/secrets-audit.test.mjs`, `scripts/__tests__/secrets-run.test.mjs`, `scripts/__tests__/secrets-sinks.test.mjs`, `scripts/__tests__/secrets-vault.test.mjs`, `scripts/__tests__/secrets.test.mjs`, `scripts/__tests__/ui-walk.test.mjs`, `scripts/__tests__/workflow-lint.test.mjs`, `scripts/__tests__/worktree.test.mjs`.

<!-- upgrade-files:end -->

## See also

- [`prompts/upgrade.md`](../prompts/upgrade.md): the same
  upgrade handed to any agent.
- [`packages/cli/README.md`](../packages/cli/README.md): the
  command's full reference.
- [`customization/project-lanes.md`](../customization/project-lanes.md):
  where your loop's own steps live.
- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  model.
- [`new-project.md`](./new-project.md) §3: the v2 plan, from
  scratch.
