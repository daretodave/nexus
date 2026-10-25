# 58 — One command keeps a project on the current kit

> `npx @usenexus/cli upgrade` moves a v1 repo to specs and
> chunks, and brings any v2 repo up to the latest kit, in one
> dry-run-first command; it carries a live loop's custom task
> train across unchanged, lands between two ticks, and rolls
> back with one revert; the playbook and a README door point
> at it.

## Why

The way up today is a hand-run six-step playbook
(`playbooks/upgrade.md`), and it fails on a real v1 repo. On
a scratch clone of an adopter running an editorial loop (an
hourly cloud tick working a content queue), 2026-10-25:

- **Step 2's copy list is short.** It copies `plan-check.mjs`
  but not its imports (`plan/pending.mjs`, `plan/settled.mjs`,
  `plan/secrets-manifest.mjs`, and what they pull in:
  `owner.mjs`, `plan/config.mjs`, `plan/footguns.mjs`,
  `plan/settle.mjs`), so plan-check dies with
  `ERR_MODULE_NOT_FOUND`. It never brings `next.md`,
  `plot.md`, `claims.mjs`, `scripts/plan/*`,
  `scripts/cloud/*` or `.github/actions/setup`.
- **The converter misreads real plans.**
  `templates/scripts/upgrade-plan.mjs` (twin
  `scripts/upgrade-plan.mjs`) refuses to run before Step 2
  (`convert()`, ARCHIVE missing). Its row regex `Phase (\d+)`
  drops letter-suffixed phases (`4b`, `15a`). `shasIn` reads
  only `(commit sha)`, a lone sha or a range, so backtick
  shas and `a + b` pairs fall through and the archive gets
  the tick commit, not the ship sha. The phase log must be
  bulleted. `cleanTitle` cuts only at ` — `, so archive lines
  run on mid-sentence. The measured run wrote 50 lines where
  52 phases were done, one of them twice.
- **Step 3 drops the repo's README.** The roadmap is replaced
  by the template; the repo's own sections go and
  `<PROJECT>` stays unfilled.
- **Step 2's "re-sync the skills" erases the train.** That
  adopter's `skills/march.md` carries its own steps (a weekly
  trend-snapshot gate, the content queue, an empty-queue
  survey refill) and `iterate.md` a cross-link drain; those
  produced every content commit of the last week. Copying the
  v2 skills over them stops the loop's real work.
- **The workflow idles.** The v2 `march.yml` runs PR mode
  when `NEXUS_LOOP_MODE` is unset, and PR mode picks only
  chunks; a converted repo with zero open specs ticks and
  does nothing. The v1 cron, ceiling (60, not 12), deploy
  token, model pin and toolchain setup are not carried.
- **Half-done upgrades exist and nothing flags them**: a lock
  that says `shape: chunks` beside a live `plan/steps/` and
  `PHASE_CANDIDATES.md`.
- **No door.** The README has three doors (`README.md`
  "Three doors in") and none is for a v1 repo;
  `packages/cli/bin/nexus.mjs` dispatches only `run`.

## Design

### The command

`packages/cli/bin/nexus.mjs` gains an `upgrade` branch beside
`run`, backed by `packages/cli/server/upgrade.mjs`. The
converter's closure is bundled into the CLI's `kit/`. Flags:

| Flag | Default | Does |
|---|---|---|
| (none) | dry run | Writes nothing; prints the report. |
| `--repo <dir>` | cwd | The repo to upgrade. |
| `--write` | off | One commit, `plan: upgrade to nexus v2 (specs + chunks)`, on branch `nexus/upgrade-v2`. |
| `--land owner\|pr` | `owner` when v1 history shows `Cloud-Run` commits on the default branch, else `pr` | How the branch reaches the default branch. |
| `--no-pause` / `--no-watch` | off | Skip the workflow pause / the first-tick watch. |
| `--keep-workflow` | off | Leave `march.yml` as it is (report only). |
| `--rollback` | off | Revert the upgrade commit; lock back to `v1.0.0`. |

Nothing runs on its own: a v1 repo stays v1 until someone
types the command.

### The flow (dry and write alike)

1. **Detect.** No `plan/nexus.lock` and a
   `plan/steps/01_build_plan.md` is v1. A lock saying
   `chunks` beside `plan/steps/` or `PHASE_CANDIDATES.md` is
   half-done: the command finishes Step 5 only (retire
   `steps/`, rename the candidates file, rewrite references).
   A clean v2 repo goes to the sync (below) instead.
2. **Fresh origin, never the local tree.** `git fetch` the
   origin's default branch and work in a temporary worktree
   from it. A local checkout can be months stale and dirty;
   the command never reads or writes it.
3. **Copy the closure** (below).
4. **Merge the roadmap.** `plan/README.md` gains the v2
   lanes and the Specs table; the repo's own sections stay,
   in place; `<PROJECT>` is filled from `package.json`
   `name`, else the `agents.md` title.
5. **Convert** with the fixed converter.
6. **Carry the train** (below).
7. **Merge the workflow** (below).
8. **Write the conservative knobs** (below).
9. **Flip the lock** to `version: 2.0.0`, `shape: chunks`,
   `adopted:` today.
10. **Gate:** plan-check and its test, the repo's own verify
    command, and workflow-lint, all in the worktree.
11. **Predict the first dispatch:** march's pick order played
    forward (`scripts/plan/order.mjs`, lanes included). For a
    repo whose v1 loop was live, "idle" is a warning in red.
12. **Report** (below). In dry mode the worktree is removed.

### The converter

`templates/scripts/upgrade-plan.mjs` and its byte-identical
twin change together:

- Row regex `Phase (\d+)([a-z]?)`. A done suffixed phase
  archives under its parent number with the suffix leading
  its title (`· 15 · 15a: …`); an open one becomes a stub
  spec at the next free number, with a warning.
- The parsed row count is checked against the `- [` rows in
  Status; a mismatch is a warning naming the unparsed rows.
- `shasIn` also accepts a trailing backtick sha and an
  `a + b` ship pair (archived as `a..b`).
- The phase log accepts the unbulleted
  `phase N[a] — sha — summary` form.
- `cleanTitle` also cuts at the first `. ` and the first
  ` (`.
- A phase's inline scope goes into the stub spec's Design.
- `convert()` no longer throws when `ARCHIVE.md` is missing:
  it starts from an empty archive.
- A fixture modelled on the measured format (backtick shas,
  `4b`/`15a`, an unbulleted log, titles with `. `) joins
  `templates/scripts/__tests__/upgrade-plan.test.mjs`.

### One computed file list

`scripts/upgrade-files.mjs` computes the v2 kit file set from
the import closures (static, dynamic and `new URL(..,
import.meta.url)`) of `plan-check`, `upgrade-plan`, `claims`,
`cloud/tick.mjs` and every script a listed skill or command
calls (`next`/`plot` among them: a skill the list ships must
find its scripts), plus the fixed non-script files (skills,
commands, `.github/actions/setup`, plan-check's test; the
lanes files as `lane`, seeded only). `packages/cli`'s
`bundle-kit.mjs` reads it into `kit/upgrade/` with
`files.json`; the playbook's manual appendix is generated
from it (`--write`). A verify leg, `upgrade`, fails when a
file the playbook names does not exist, when a listed script
imports a file the list lacks or that is gone, or when the
appendix drifts.

### Carrying the train

The rule: nothing the adopter wrote is dropped; kit text is
replaced; anything unrecognised is kept.

- **What counts as kit text.** A v1 adopter forked its skills
  months before `v1.0.0` (tagged 2026-10-20), and the kit's
  `march.md` changed many times since. Diffing against
  `v1.0.0` would call that drift custom. So `bundle-kit.mjs`
  writes `kit/upgrade/kit-text.json`: every section header,
  and a hash of every paragraph, that `templates/skills/
  march.md` and `iterate.md` ever held in nexus history. A
  section whose header is in the list is kit text and is
  replaced; inside it, a paragraph matching no historical
  hash is kept as custom. A section whose header is not in
  the list is custom. The list is kept in
  `scripts/upgrade-kit-text.json` (committed: a shallow CI
  checkout has no history to read), rebuilt by
  `node scripts/upgrade-kit-text.mjs --write`; the `upgrade`
  leg fails when the current templates hold text it lacks.
  Paragraphs compare with whitespace collapsed, and one that
  held a placeholder matches with it filled in.
- **Custom text moves verbatim** into `skills/march.lanes.md`
  and `skills/iterate.lanes.md` (spec 57's lanes extension
  point), under its original header, with the v1 references
  rewritten. The kit never overwrites the lanes files. Each
  custom section is one lane: a march section ahead of the
  v1 phase pick (`3a. Pending phase?`) is `pre`, one after
  it `queue`, both `end-tick` (v1 dispatch was first match
  wins); custom paragraphs inside a kit step are one
  `<step>-notes` lane that continues; iterate's are
  `dimensions`. `when` is prose: the moved text says when.
- **Custom skills and commands stay.** A skill or command the
  kit never shipped is kept as it is; a `.claude/commands/`
  entry with no skill becomes a skill (`skills/<name>.md`)
  with its command file pointing at it. Only v1 references
  in them change.
- **v1 references are rewritten** across the repo, workflow
  prompt text included: `01_build_plan`, `plan/phases`,
  `plan/steps`, `ship-a-phase`, `plan-a-phase`,
  `PHASE_CANDIDATES`. History files (`ARCHIVE.md`,
  `DIGEST.md`, `CHANGELOG*`, dated logs) are left alone. The
  build plan and any `plan/steps` or `plan/phases` path
  become `plan/README.md` (the roadmap lists every spec, and
  a rewritten link never breaks); the kit's own files are not
  rewritten (the converter reads v1 names on purpose).
- `git mv PHASE_CANDIDATES.md CANDIDATES.md`, header
  compacted to the v2 template's.

### The workflow merge

`march.yml` is merged into the v2 owner-job shape, not
replaced:

- kept: the cron line, the ceiling number, the model pin,
  every extra `env:` entry (deploy tokens by name), the
  concurrency group; also extra checkout inputs, job
  permissions and `claude_args` flags, any step the kit
  never shipped (ahead of the model step), and each prompt
  line no kit version held (the kit-text list gains a
  `march.yml` entry: every line its prompt ever had). The pin
  and env go to the owner job only; a secret from a job or
  workflow `env:` moves to the model step (workflow-lint);
- the v1 toolchain steps (package manager, browser install)
  become `.github/actions/setup/action.yml`; a step that
  reads a secret stays in the job, in v1 order just ahead of
  the setup action (a private registry's `.npmrc` still lands
  before the install), and a repo's own action is kept;
- the file list ships every script the merged `march.yml`
  calls, and `workflow-lint` (the gate runs it);
- `NEXUS_LOOP_MODE`: when the v1 loop pushed to the default
  branch, the report prints
  `gh variable set NEXUS_LOOP_MODE --body owner`, and
  `--land owner` runs it. PR mode would idle a repo with no
  chunks.
- other workflows change only by reference rewrites;
  `--keep-workflow` skips the merge and reports what it
  would have done.

### Conservative knobs

Every knob specs 54-57 add is written at the value that keeps
today's behaviour, so the train runs unchanged and the owner
turns knobs up later, one at a time:

| Knob | Written |
|---|---|
| `Support:` (bearings) / `NEXUS_SUPPORT` | `triage-only` / unset (triage on cron, no nudge) |
| `Promote:` | `owner` |
| `## Generators` | empty |
| `stall_action` | `alert` |
| `loop` (iterate dimension I) | `off` |
| `UI:` | `none` |
| `NEXUS_CADENCE`, `NEXUS_CHAIN_MAX` | unset, `0` |
| `NEXUS_IDLE_BACKOFF` | `0` (never skip) |
| `NEXUS_QUOTA_MAX` | unset (the kit default) |

The values come from a registry in `upgrade.mjs`, one row per
knob with its conservative value; a test fails when a kit
template names a knob the registry lacks.

### Landing between ticks

`--land owner`:

1. wait for an idle window: no `in_progress` or `queued`
   march run, and the next cron at least 10 minutes away
   (measured gaps on a live editorial loop are 2-5 h);
2. `gh workflow disable march`;
3. set `NEXUS_LOOP_MODE=owner` (when the v1 loop pushed to
   the default branch);
4. push the upgrade commit;
5. `gh workflow enable march`, then
   `gh workflow run march`;
6. watch that tick; print its dispatch and its commit.

A tick that no-ops where the report predicted work prints the
`--rollback` line. `--land pr` opens a pull request; its
merge is the cut-over. `--rollback` reverts the upgrade sha
in one commit and restores the lock to `v1.0.0`.

### The report

A table of every file the command touched: `replaced`,
`kept-custom`, `moved-to-lane`, `retired`, `rewritten (N
refs)`. Then the archive-line diff, the warnings, the
predicted first dispatch, and the loop-mode line.

### v2 to latest: the sync

The same command on a v2 repo brings it to the current kit.
The lock's `ref:` names the kit commit the repo follows, so
every kit file has three versions: the kit at `ref:` (base),
the kit now (theirs), the repo's copy (ours).

- **Untouched** (ours equals base): replaced with theirs.
- **Customised** (ours differs from base): a three-way merge.
  A clean merge applies; a conflict goes to an assisted merge,
  a helper-model session given base, theirs and ours that
  returns a merged file and a one-line reason per hunk it
  kept from ours. The dry run shows each merged file as a
  diff, marked `assisted`; `--write` applies it only after
  the repo's gate is green, else it leaves the file as ours
  and lists it.
- **New kit content** (a skill, prompt, workflow, gate leg or
  script that did not exist at `ref:`) is listed and added;
  a new knob arrives at its conservative value (the registry
  above), so behaviour does not change until the owner turns
  it up.
- **Lanes files and custom skills** are never touched.
- The lock's `ref:` and `version:` move to the kit commit
  the CLI was built from, in one commit,
  `plan: sync to nexus <version>`.

Running it again later picks up whatever shipped since; the
GUI's banner reads "nexus <version> is out — Sync" when the
lock's ref is behind the CLI's bundled kit.

### The GUI

`packages/cli/server/repo.mjs` detects the shape (lock, else
`plan/steps/01_build_plan.md`), and the repo view shows "This
repo is on nexus v1 — Upgrade"; the button runs the dry run
and shows the report. The banner keeps the GUI's motion and
colour.

### The docs

- `playbooks/upgrade.md` is rewritten around the command:
  what you have; the dry run and reading the report;
  carrying a live loop across; write, land, watch; refining
  stub specs; rollback; half-done upgrades; the generated
  manual appendix.
- `prompts/upgrade.md`: the paste prompt for door 2.
- `README.md` gains a "Used v1?" section beside the three
  doors: `npx @usenexus/cli upgrade` (dry run), then
  `--write`, linking `playbooks/upgrade.md`. It merges only
  with the `cli-v*` release that carries the subcommand; the
  owner tags it, never a cloud tick.
- The worked example is "a v1 repo whose cloud loop runs an
  editorial content queue". No public text names an adopter
  repo.

### Proofs

Every proof runs on a fresh clone of the adopter's origin in
a scratch directory, never on a local checkout. Public text
says "a scratch clone". The owner's live cut-over of their
own editorial loop is outside this spec: it follows 58.7,
owner-run, in an idle window.

### Remote: a pull request without a checkout

`--repo` also takes a GitHub repo (`owner/name` or its URL).
The command makes a blobless clone into a temporary folder,
runs the same path (detect, convert or sync, gate, report),
and removes the clone after. With `--pr` it pushes
`nexus/upgrade-<version>` and opens a pull request whose body
is the report (per-file table, assisted-merge diffs with
their reasons, new content, knobs written, predicted first
tick).

- No push access: it forks (`gh repo fork`) and opens the
  pull request from the fork.
- An open upgrade pull request from an earlier run is
  updated in place (its branch force-updated with the new
  result, a comment saying what changed), never a second one.
- The gate runs in the temporary clone before the push; a red
  gate opens nothing and prints the clone's path, kept.
- `--pr` works on a local `--repo` too, and is what
  `--land pr` does.

## Contracts

- `npx @usenexus/cli upgrade [--repo <dir>] [--write]
  [--land owner|pr] [--no-pause] [--no-watch]
  [--keep-workflow] [--rollback] [--pr]` where `--repo` is a
  folder or a GitHub `owner/name` / URL. Exit 0: dry run printed,
  or written and gated. Exit 1: the gate failed (worktree
  kept, path printed). Exit 2: not a v1 or half-done repo.
- The upgrade commit's first line:
  `plan: upgrade to nexus v2 (specs + chunks)`; branch
  `nexus/upgrade-v2`.
- `kit/upgrade/kit-text.json`:
  `{ "march.md": { "headers": [..], "paras": [sha1..] },
  "iterate.md": { .. } }`.

## Acceptance

- **A6** The upgrade writes every spec 54-57 knob at its conservative value (Support triage-only, Promote owner, Generators empty, stall_action alert, dimension I off, UI none, cadence unset, chain 0, idle backoff 0), and a test fails when a kit template names a knob the registry lacks.
- **A7** On a scratch clone of an editorial v1 origin, `--write` yields 52 archive lines (50 + 2 suffixed), 0 open specs, the weekly snapshot gate, content queue and survey refill verbatim in `march.lanes.md` and the cross-link drain in `iterate.lanes.md`, `march.yml` keeping cron `0 * * * *` and ceiling 60, plan-check and the repo's verify green, and a predicted lane dispatch, not an idle tick; a half-done clone and a 40-minute-cron clone also pass.
- **A8** `--land owner` lands only in an idle window, disables and re-enables march around the push, dispatches and watches the first v2 tick, and `--rollback` restores v1 in one revert commit (tests with a stubbed `gh`).
- **A11** On a v2 repo the command syncs to the latest kit: untouched kit files are replaced, customised ones three-way merged (a conflict goes to an assisted merge shown as a diff and applied only with a green gate), new kit content is listed and added with knobs at their conservative values, lanes files and custom skills are untouched, and the lock's `ref:` moves in one `plan: sync to nexus <version>` commit (fixtures: an untouched file, a clean merge, a conflict, a new skill).
- **A13** `upgrade --repo owner/name` works with no local checkout: a blobless temporary clone, the same report as a local run, and with `--pr` a pushed `nexus/upgrade-<version>` branch and a pull request whose body is the report; without push access it forks; a second run updates the open pull request instead of opening another; a red gate opens nothing (tests with a stubbed `gh` and a local bare remote).
- **A12** The GUI banner offers Sync when a v2 repo's lock is behind the CLI's bundled kit, and the README door and playbook say the same command keeps a v2 repo current.
- **A10** `playbooks/upgrade.md` is rewritten around the command with a generated manual appendix, `prompts/upgrade.md` exists, and README.md has a "Used v1?" section with the dry-run command and `--write`, linking the playbook; none of them names an adopter repo; the README section ships in the same release as the subcommand.

## Open questions

(None.)

## Chunks
Measure: 7 open · 6 closed · next A14

- [ ] **58.6** Conservative knobs from a registry · S · closes A6 · needs 54.8, 56.7, 57.8
- [ ] **58.7** Scratch proof on an editorial v1 clone · M · closes A7 · needs 58.6
  - Fresh clone of the adopter's origin in the scratchpad only; the local checkout is stale and dirty and is never touched. Gaps become fixes in 58.3-58.6's functions plus fixtures.
- [ ] **58.8** `--write`, `--land`, `--rollback` and the first-tick watch · M · closes A8 · needs 58.7
- [ ] **58.10** Runbook rewrite, upgrade prompt and the README door · M · closes A10 · needs 58.8
  - The README section merges with the `cli-v*` release that carries 58.3-58.9; the owner tags it.
- [ ] **58.11** v2 to latest: the three-way sync and the assisted merge · L · closes A11 · needs 58.6
- [ ] **58.12** The Sync banner and the "already on v2" door · S · closes A12 · needs 58.10, 58.11
- [ ] **58.13** Upgrade a repo on GitHub as a pull request, no checkout · M · closes A13 · needs 58.11
