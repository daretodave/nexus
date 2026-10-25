# Playbook: upgrade (v1 phases → v2 chunks)

> nexus v2 replaced the phase plan (a build-plan status block
> plus one brief per phase) with specs, chunks and acceptance
> IDs. That is a breaking change, so nothing moves on its own:
> a repo stays on v1 until someone runs this playbook. Pin
> first, convert second, gate third. About an hour by hand for
> a plan of twenty phases; an agent handed this file does it in
> one sitting.

---

## Which version am I on

| You have | You're on | Read the kit at |
|---|---|---|
| `plan/steps/01_build_plan.md` and `plan/phases/`, no `plan/nexus.lock` | v1 (phases) | the `v1.0.0` tag |
| `plan/nexus.lock` with `shape: phases` | v1, pinned | the lock's `ref:` |
| `plan/nexus.lock` with `shape: chunks` | v2 | the lock's `ref:` |

The `v1.0.0` tag is the last phase-shape release:
`https://github.com/daretodave/nexus/tree/v1.0.0`. Everything
a v1 repo copied (skills, templates, playbooks) is there,
unchanged, for as long as you want it.

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
the converter, claims, the cloud tick and every script a
skill calls, plus every skill, every command and the shared
toolchain action (`scripts/upgrade-files.mjs` in nexus; the
CLI bundles the same set). It overwrites the kit's skills,
so first move any local edit you'd made to `march.md` or
`iterate.md` into a project lane
(`skills/march.lanes.md`, `skills/iterate.lanes.md`), which a
re-sync never overwrites
([`../customization/project-lanes.md`](../customization/project-lanes.md));
a skill or command of your own that the kit never shipped is
left alone. Sweep the eight placeholders over the new files
exactly as [`new-project.md`](./new-project.md) §4 does.

Two fill-ins were renamed: `<PHASE_N>` → `<SPEC_N>` and
`<PHASE_M>` → `<SPEC_M>`, in `setup/00_files.md`'s index, whose
"Phases that touch it" column is now "Specs that touch it". If
your copy still holds either old name, rename it (or fill in the
spec number).

## Step 3 — write the roadmap

Replace `plan/README.md` with the v2 roadmap,
`../nexus/templates/plan/README.md` (its layout notes, audit
format and lessons section carry over; the lanes and spec
table are new). Leave the Asap and Held lanes empty for now.

## Step 4 — convert the build plan

`templates/scripts/upgrade-plan.mjs` does the mechanical half.
From your repo root, read what it would write, then write it:

```bash
node ../nexus/templates/scripts/upgrade-plan.mjs
node ../nexus/templates/scripts/upgrade-plan.mjs --write
```

Both run the same in PowerShell. It is a dry run unless you
pass `--write`; it runs `plan-check` over the result first and
writes nothing if that is red; it never deletes the v1 files
(Step 5 does) and a second run adds nothing. It walks
`plan/steps/01_build_plan.md` top to bottom like this:

| v1 row | becomes |
|---|---|
| `[x] Phase N — <title> (commit <sha>)` | one `plan/ARCHIVE.md` line: `- <date> · <NN> · <title, ≤ 10 words> · <sha>` (the date from `git show -s --format=%as <sha>`; a `(this commit)` row takes the commit that ticked it; `NN` is N zero-padded to two digits). A `[-]` partial row too. The sha may also be a trailing `` `<sha>` ``, a range `a..b` or `a → b`, or a ship pair `a + b` (archived `a..b`); the title stops at the first ` — `, `. ` or ` (`, and a trailing `` `<sha>` `` never joins it. |
| `[x] Phase Na — <title>` (a letter suffix: `4b`, `15a`) | an archive line under the parent number, the suffix leading the title: `- <date> · 15 · 15a: <title> · <sha>` |
| `[ ] Phase N — <title>` with a brief | a stub spec `plan/<NN>-<slug>.md` (the brief folded into Design, one acceptance ID, `Not chunked yet.`) and a roadmap row; refine it as below |
| `[ ] Phase N — <title>` with no brief | a stub spec with its Why (from the build plan's per-phase scope), the row's own text past the title in Design, one acceptance ID, and `Not chunked yet.` |
| `[ ] Phase Na — <title>` | a stub spec as above at the next free spec number (its parent's may already be a spec), with a warning |
| `[blocked: <reason> <date>] Phase N` | a spec as above, plus a Held line `- **<NN>** · blocked: <reason> <date>` |
| `[skipped] Phase N` | one archive line `- <date> · <NN> · dropped: <reason> · (this commit)` |
| Carry-overs / known gaps | by hand: an acceptance ID in the spec it belongs to, or a `plan/AUDIT.md` row |
| Phase log (bulleted `- phase N — <sha> — <summary>` or bare `phase N — …` lines) | an archive line for any phase the status block lacks; otherwise its shas date the rows above. No phase is archived twice. |

No `plan/ARCHIVE.md` yet is fine: it starts one. What it
leaves to you is in its warnings: carry-overs, a `[-]` partial
row's gaps, a shipped row whose commit it could not find
(archived as `unknown`; put the sha in), an open suffixed
phase's new number, and any Status row it could not parse
(named, with the listed and parsed counts). Then refine each
stub spec it wrote, as below.

Keep the phase number as the spec number, so history lines up:
phase 12's spec is `plan/12-<slug>.md` and its chunks are
`12.1`, `12.2`, ….

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
`../nexus/templates/.github/workflows/march.yml`).

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
date) and commit everything as one atomic act:

```bash
git add -A plan skills .claude scripts agents.md CLAUDE.md
git commit -m "plan: upgrade to nexus v2 (specs + chunks)"
git push origin main
```

## Rolling back

The upgrade is one commit. `git revert <sha>` returns the v1
plan, skills and lock; the kit at the `v1.0.0` tag still
matches them.

## You're done when

- [ ] `plan/nexus.lock` says `shape: chunks`.
- [ ] `plan/steps/` and `plan/phases/` are gone; every shipped
      phase is one line in `plan/ARCHIVE.md`.
- [ ] Every pending phase is a spec with a row in
      `plan/README.md`; the next one or two are chunked.
- [ ] `node scripts/plan-check.mjs` is green, and it runs in
      your verify gate.
- [ ] Nothing in the repo still names `01_build_plan`,
      `plan/phases`, `ship-a-phase` or `plan-a-phase`.
- [ ] One `/ship-a-chunk` (or `/march`) tick picks the chunk
      you expected and closes it with an archive line.

## Manual copy list

Generated from the kit (`node scripts/upgrade-files.mjs
--write` in nexus); the gate fails when it drifts.

<!-- upgrade-files:begin (generated by node scripts/upgrade-files.mjs --write; do not edit by hand) -->

99 files in 10 folders, plus 2 lanes files.

| Folder in your repo | Files (from `nexus/templates/`) |
|---|---|
| `.claude/commands/` | `bootstrap.md`, `bug.md`, `critique.md`, `design.md`, `digest.md`, `expand.md`, `heads-down.md`, `iterate.md`, `jot.md`, `march.md`, `messy.md`, `moderate.md`, `next.md`, `oversight.md`, `plan-a-spec.md`, `plot.md`, `reboot-ready.md`, `reboot-resume.md`, `rebooting.md`, `ship-a-chunk.md`, `ship-asset.md`, `ship-data.md`, `ship-migration.md`, `tidy.md`, `triage.md` |
| `.github/actions/setup/` | `action.yml` |
| `scripts/` | `announce.mjs`, `claims-codec.mjs`, `claims.mjs`, `ledger.mjs`, `lint-migration.mjs`, `loop-issue.mjs`, `notify.mjs`, `owner.mjs`, `plan-check.mjs`, `pulse.mjs`, `secrets-audit.mjs`, `secrets-keychain.mjs`, `secrets-run.mjs`, `secrets-scan.mjs`, `secrets-sinks.mjs`, `secrets-vault.mjs`, `secrets.mjs`, `upgrade-plan.mjs`, `worktree.mjs` |
| `scripts/__tests__/` | `plan-check.test.mjs` |
| `scripts/cloud/` | `quota.mjs`, `tick.mjs` |
| `scripts/design/` | `board-runtime.js`, `compare.mjs`, `ingest.mjs`, `png.mjs`, `port-map.mjs`, `port.workflow.js`, `prompt.mjs`, `render.mjs` |
| `scripts/plan/` | `config.mjs`, `footguns.mjs`, `lanes.mjs`, `motion.mjs`, `order.mjs`, `pending.mjs`, `progress.mjs`, `promote.mjs`, `refill.mjs`, `secrets-manifest.mjs`, `settle.mjs`, `settled.mjs`, `triage-match.mjs` |
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
   ../nexus/templates/scripts/upgrade-plan.mjs \
   ../nexus/templates/scripts/worktree.mjs \
   scripts/
mkdir -p scripts/__tests__
cp ../nexus/templates/scripts/__tests__/plan-check.test.mjs \
   scripts/__tests__/
mkdir -p scripts/cloud
cp ../nexus/templates/scripts/cloud/quota.mjs \
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
mkdir -p scripts/plan
cp ../nexus/templates/scripts/plan/config.mjs \
   ../nexus/templates/scripts/plan/footguns.mjs \
   ../nexus/templates/scripts/plan/lanes.mjs \
   ../nexus/templates/scripts/plan/motion.mjs \
   ../nexus/templates/scripts/plan/order.mjs \
   ../nexus/templates/scripts/plan/pending.mjs \
   ../nexus/templates/scripts/plan/progress.mjs \
   ../nexus/templates/scripts/plan/promote.mjs \
   ../nexus/templates/scripts/plan/refill.mjs \
   ../nexus/templates/scripts/plan/secrets-manifest.mjs \
   ../nexus/templates/scripts/plan/settle.mjs \
   ../nexus/templates/scripts/plan/settled.mjs \
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
  ..\nexus\templates\scripts\upgrade-plan.mjs,
  ..\nexus\templates\scripts\worktree.mjs
New-Item -ItemType Directory -Force scripts\__tests__ | Out-Null
Copy-Item -Destination scripts\__tests__ -Path ..\nexus\templates\scripts\__tests__\plan-check.test.mjs
New-Item -ItemType Directory -Force scripts\cloud | Out-Null
Copy-Item -Destination scripts\cloud -Path ..\nexus\templates\scripts\cloud\quota.mjs,
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
New-Item -ItemType Directory -Force scripts\plan | Out-Null
Copy-Item -Destination scripts\plan -Path ..\nexus\templates\scripts\plan\config.mjs,
  ..\nexus\templates\scripts\plan\footguns.mjs,
  ..\nexus\templates\scripts\plan\lanes.mjs,
  ..\nexus\templates\scripts\plan\motion.mjs,
  ..\nexus\templates\scripts\plan\order.mjs,
  ..\nexus\templates\scripts\plan\pending.mjs,
  ..\nexus\templates\scripts\plan\progress.mjs,
  ..\nexus\templates\scripts\plan\promote.mjs,
  ..\nexus\templates\scripts\plan\refill.mjs,
  ..\nexus\templates\scripts\plan\secrets-manifest.mjs,
  ..\nexus\templates\scripts\plan\settle.mjs,
  ..\nexus\templates\scripts\plan\settled.mjs,
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

<!-- upgrade-files:end -->

## See also

- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  model.
- [`new-project.md`](./new-project.md) §3: the v2 plan, from
  scratch.
