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

From your repo root, with nexus at `../nexus` on a v2 ref:

```bash
cp ../nexus/templates/plan/ARCHIVE.md plan/ARCHIVE.md
cp ../nexus/templates/scripts/plan-check.mjs scripts/plan-check.mjs
mkdir -p scripts/__tests__
cp ../nexus/templates/scripts/__tests__/plan-check.test.mjs scripts/__tests__/
cp ../nexus/templates/skills/ship-a-chunk.md ../nexus/templates/skills/plan-a-spec.md skills/
cp ../nexus/templates/claude/commands/ship-a-chunk.md ../nexus/templates/claude/commands/plan-a-spec.md .claude/commands/
```

The PowerShell twin:

```powershell
Copy-Item ..\nexus\templates\plan\ARCHIVE.md plan\ARCHIVE.md
Copy-Item ..\nexus\templates\scripts\plan-check.mjs scripts\plan-check.mjs
New-Item -ItemType Directory -Force scripts\__tests__ | Out-Null
Copy-Item ..\nexus\templates\scripts\__tests__\plan-check.test.mjs scripts\__tests__\
Copy-Item ..\nexus\templates\skills\ship-a-chunk.md, ..\nexus\templates\skills\plan-a-spec.md skills\
Copy-Item ..\nexus\templates\claude\commands\ship-a-chunk.md, ..\nexus\templates\claude\commands\plan-a-spec.md .claude\commands\
```

Then re-sync the skills that read the plan (`march`,
`oversight`, `expand`, `triage`, `digest`) and
`scripts/pulse.mjs` from `../nexus/templates/`, and re-apply
any local edits you'd made to them (a `git diff` against your
previous copy shows what those were). Sweep the eight
placeholders over the new files exactly as
[`new-project.md`](./new-project.md) §4 does.

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
| `[x] Phase N — <title> (commit <sha>)` | one `plan/ARCHIVE.md` line: `- <date> · <NN> · <title, ≤ 10 words> · <sha>` (the date from `git show -s --format=%as <sha>`; a `(this commit)` row takes the commit that ticked it; `NN` is N zero-padded to two digits). A `[-]` partial row too. |
| `[ ] Phase N — <title>` with a brief | a stub spec `plan/<NN>-<slug>.md` (the brief folded into Design, one acceptance ID, `Not chunked yet.`) and a roadmap row; refine it as below |
| `[ ] Phase N — <title>` with no brief | a stub spec with its Why (from the build plan's per-phase scope), one acceptance ID, and `Not chunked yet.` |
| `[blocked: <reason> <date>] Phase N` | a spec as above, plus a Held line `- **<NN>** · blocked: <reason> <date>` |
| `[skipped] Phase N` | one archive line `- <date> · <NN> · dropped: <reason> · (this commit)` |
| Carry-overs / known gaps | by hand: an acceptance ID in the spec it belongs to, or a `plan/AUDIT.md` row |
| Phase log | an archive line for any phase the status block lacks; otherwise its shas date the rows above |

What it leaves to you is in its warnings: carry-overs, a `[-]`
partial row's gaps, and a shipped row whose commit it could
not find (archived as `unknown`; put the sha in). Then refine
each stub spec it wrote, as below.

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

## See also

- [`concepts/plan-shape.md`](../concepts/plan-shape.md): the
  model.
- [`new-project.md`](./new-project.md) §3: the v2 plan, from
  scratch.
