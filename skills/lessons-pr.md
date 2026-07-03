# Skill: lessons-pr (nexus-self meta-skill)

> **Where this skill lives.** This is a meta-skill for the
> *nexus repo itself*, not an adopter skill. Adopting
> projects do not copy it. It lives at `skills/lessons-pr.md`
> in the nexus repo so a fresh Claude Code session at the
> nexus root can invoke it.
>
> **What it does.** Reads a sibling project's
> `NEXUS_LESSONS.md`, plans the additive changes against
> nexus, ships them as one bundled commit (or 3–4 themed
> commits, by judgment), pushes, and stops.
>
> This closes the loop the README License section names:
> *"The methodology improves with every honest application."*
> The lessons-pr mechanism is what makes that aspirational
> sentence operational.

---

## 1. Purpose

When a sibling project finishes a nexus adoption, it usually
discovers gaps — places where the playbook left the adopter
to figure something out, templates that didn't exist,
customization docs that should have. The
[`playbooks/new-project.md`](../playbooks/new-project.md)
step-10 checklist asks the adopter to write a
`NEXUS_LESSONS.md` capturing these.

`/lessons-pr` is how that doc turns into actual nexus
edits. The adopter doesn't have to learn the nexus repo
shape; they just write honest field notes. A separate
session — this skill — does the translation.

---

## 2. Invocation

```
/lessons-pr <project-path>      # required: path to sibling project
/lessons-pr ../shows            # example: sibling project at ../shows
/lessons-pr Z:/shows            # example: absolute path on Windows
```

The argument is the path to the sibling project's working
directory. The skill looks for `<project-path>/NEXUS_LESSONS.md`.
If it doesn't exist, the skill stops with a one-line note.

Run this at the nexus repo root, in a fresh Claude Code
session (or any capable agent). Do not invoke from inside
the sibling project — the skill needs nexus's working tree
to be the target of edits.

---

## 3. Autonomy contract

- **AskUserQuestion is allowed at the planning step only.**
  Once the plan is approved, the skill ships without further
  asks. This is the same carve-out
  [`../playbooks/pre-spec.md`](../playbooks/pre-spec.md) has
  — you're not yet in a shipping skill at planning time;
  you're shaping the work that *will* be shipped.
- **Defer is allowed.** Some lessons may be too speculative
  or too large for one session. Defer is fine and documented
  in the commit body.
- **Generalize before landing.** A sibling project's
  recommendation is often Pantheon-shaped (or thock-shaped,
  or tickpedia-shaped). The nexus repo serves many projects.
  Broaden recommendations — never let one project's specific
  shape land as the methodology's general guidance.
- **Single bundled commit by default.** 3–4 themed commits
  is acceptable if the lessons split cleanly into orthogonal
  areas. Default is one commit unless the user picks
  otherwise.
- **No emojis. No `Co-Authored-By:`.** Per nexus's
  standing rules.

---

## 4. Procedure

### Step 0 — Pre-checks

1. Confirm nexus's working tree is clean. `git status`
   should show nothing (or only untracked files outside
   tracked paths).
2. Confirm `<project-path>/NEXUS_LESSONS.md` exists and is
   readable.
3. Read [`../README.md`](../README.md),
   [`../concepts/architecture.md`](../concepts/architecture.md),
   [`../playbooks/new-project.md`](../playbooks/new-project.md),
   [`../intervention-spectrum.md`](../intervention-spectrum.md),
   and every file in [`../customization/`](../customization/)
   briefly. Skim [`../templates/`](../templates/) for shape.
   You need to know where each lesson would land before you
   can plan.

If any pre-check fails, stop and surface to the user.

### Step 1 — Read the lessons doc

Read `<project-path>/NEXUS_LESSONS.md` end to end. Most
lessons docs follow the shape:

> **Today** (current nexus state) → **What <project>
> needed** (the gap) → **Recommendation** (what to add to
> nexus).

Each lesson is numbered. There may be a synthesis section at
the bottom; read it — it usually surfaces a cross-cutting
pattern the per-lesson recommendations don't name.

### Step 2 — Plan

For every lesson:

- **Land or defer?** Some lessons may be too speculative
  for one session, or contradict another nexus principle.
  Defer is fine; document why.
- **What files change?** New playbook? Edit existing? New
  template? New customization doc? Append to README?
  Concrete file paths, not categories.
- **Order?** Some lessons depend on others (e.g. a
  `setup/` paradigm should land before a `lessons-pr`
  skill that references it).
- **Generalize.** Re-state each lesson's recommendation in
  generic terms that work for many projects, not just the
  project that wrote the lessons doc. If a lesson says
  "add a Supabase block," generalize to "add a hybrid
  managed-Postgres variant with Supabase / Neon / Turso /
  PlanetScale as examples."

Use [`../concepts/asking-well.md`](../concepts/asking-well.md)
for the question shape if you need to surface taste calls to
the user — typically:

1. **Commit grouping** — single bundled commit, or 3–4
   themed commits?
2. **Push posture** — directly to `origin/main`, or open a
   PR?
3. **Specific lessons that read as philosophically off** —
   surface for defer/redirect.

Surface the plan to the user as prose: each lesson, decision
(land / defer / partial-land), files touched, rationale.
Wait for confirmation.

### Step 3 — Implement

For every lesson the user confirmed:

- Write the actual files. Real content, not placeholders.
- Match the existing nexus voice: terse, opinionated, no
  emojis, present-tense, second-person sparingly, lots of
  worked examples.
- Cross-link liberally — every new doc points to at least
  one other nexus doc with a relative-path markdown link
  (the existing customization docs are a good model).
  Preserve that habit.
- New customization docs go in
  [`../customization/<name>.md`](../customization/).
- New playbooks go in
  [`../playbooks/<name>.md`](../playbooks/).
- New concept docs go in
  [`../concepts/<name>.md`](../concepts/).
- New template files go under
  [`../templates/`](../templates/).
- New nexus-self meta-skills (rare) go in
  [`../skills/`](../skills/) at the nexus root, *not*
  under `templates/skills/` (which is for adopter skills).
- Edits to existing files preserve the file's current voice
  and structure. Don't restructure unless the lesson
  explicitly asks for it.
- **A lesson that's a small behavioral reminder, not a
  structural gap** — no missing file, no undocumented step,
  just "the loop should remember to X" — doesn't need a new
  doc or playbook edit at all. Route it as a seed example
  entry in
  [`../templates/plan/lessons.md`](../templates/plan/lessons.md)
  (or `reflexes.md` if the sibling reports it bit them
  weekly) under the nearest `@domain:` anchor, so adopting
  projects inherit the example instead of nexus growing an
  ad-hoc doc per one-liner. See
  [`../customization/lessons-layer.md`](../customization/lessons-layer.md)
  for the two-tier model this routes into.

### Step 4 — Verify

Before committing:

1. **Link sanity.** Walk every new doc. Every relative
   link should resolve. Use `Bash` with a quick
   `for f in <changed>; do …` pattern, or a markdown
   link-checker if available.
2. **Voice consistency.** Read every new doc once more.
   Terse? Opinionated? No emojis? Cross-linked? Present-tense?
3. **No breaking change.** Confirm no existing file's
   behavior changed in a way an adopting project depends on.
   Renames and removals = breaking. New sections, new files
   = additive (fine).
4. **README directory tree current.** If you added a new
   directory (`setup/`, `skills/`), the README's "What's in
   this kit" tree shows it. Same for the
   `customization/` and `playbooks/` indices in the README.

### Step 5 — Commit and push

Per nexus's standing rules:

- **Atomic commit-and-push as a single act.** No unpushed
  commits between operations.
- **No emojis. No `Co-Authored-By:`.**
- **No `--no-verify`. No force-push.**
- Commit messages: lowercase first word, imperative mood,
  present-tense ("add pre-spec playbook," not "Added").
- If shipping multiple commits, each has a self-contained
  message body listing the files touched and the lesson(s)
  it addresses.

Bundled single-commit shape:

```bash
git commit -m "$(cat <<'EOF'
docs,templates: land NEXUS_LESSONS from <project-name>

Lessons addressed:

- <#>: <one-line summary>
- <#>: <one-line summary>
- <#>: <one-line summary>

Lessons deferred:

- <#>: <one-line summary> — <reason>

Files added:

- <path>
- <path>

Files edited:

- <path> — <one-line summary of edit>
- <path> — <one-line summary of edit>

Source: <project-path>/NEXUS_LESSONS.md
EOF
)"
```

Themed multi-commit shape — one commit per area:

```
1. docs: add pre-spec playbook + asking-well concept (lessons 1, 5, 6, 9, 10)
2. docs(data,bearings): hybrid managed-postgres variant + bearings additions (lessons 2, 3)
3. templates: setup/ paradigm + external-services customization (lessons 8, 11)
4. skills,customization: lessons-pr + visual-system + moderation-loop (lessons 4, 7, 12)
```

Push to `origin/<default-branch>` (typically `main`) on
this fork. If the user's nexus is a submodule of upstream
nexus, push to the user's fork remote, not upstream — the
user keeps merge authority over upstream.

### Step 6 — Report and stop

Print a summary:

```
lessons-pr complete.

Source: <project-path>/NEXUS_LESSONS.md
Commits: <N> pushed to <branch>

Landed:
  <#>: <one-line>
  <#>: <one-line>

Deferred (with reasons):
  <#>: <one-line> — <reason>

Next session would pick up:
  <follow-up if obvious; "nothing" if not>
```

Then stop. **Do not invoke `/ship-a-phase`, `/march`, or
any other nexus skill** against the nexus repo. Nexus is a
methodology repo, not a built product; it has no
application-level work to ship.

---

## 5. Hard rules

1. **The nexus working tree must be clean before starting.**
   No mixing this work with unrelated edits.
2. **AskUserQuestion is allowed during Step 2 (Plan) only.**
   Once the plan is approved, the skill ships without
   further asks.
3. **Single commit and push as an atomic act.** No
   unpushed commits.
4. **No emojis. No `Co-Authored-By:`.**
5. **No `--no-verify`. No force-push. No destructive
   resets.**
6. **Generalize sibling-specific recommendations.** Nexus
   serves many projects.
7. **Defer over force-land.** If a lesson reads as
   philosophically off (contradicts another nexus
   principle), surface during the plan step and defer
   rather than land a bad pattern.
8. **No edits to `templates/skills/*.md`** unless a lesson
   explicitly requires it. These are the adopter skills;
   they have a stable contract.
9. **No rename / restructure** of existing nexus
   directories. New directories under the existing tree
   are fine.
10. **Stop after push.** Don't invoke other nexus skills.

---

## 6. Failure modes

The only conditions that warrant stopping:

- **`<project-path>/NEXUS_LESSONS.md` doesn't exist.**
  Surface to the user. Don't guess.
- **Working tree dirty.** Surface; ask to clean or stash.
- **Plan step finds the lessons doc empty or
  uninterpretable.** Stop; ask the user to redirect.
- **Push fails** (branch protection, conflict, auth).
  Surface the actual error. Don't force-push.
- **A lesson can't be generalized** (the sibling's specific
  shape is genuinely the right general shape, or the
  generalization is unclear). Surface during the plan
  step; defer rather than land a bad pattern.

---

## 7. Quick reference

```bash
# Pre-checks
git status                                    # must be clean
ls <project-path>/NEXUS_LESSONS.md            # must exist

# Read (parallel where independent)
cat <project-path>/NEXUS_LESSONS.md
README.md
concepts/architecture.md
playbooks/new-project.md
intervention-spectrum.md
customization/*.md
templates/                                    # shape only

# Plan
AskUserQuestion                               # only during planning

# Implement
Edit, Write                                   # nexus working tree only
[link sanity check]

# Commit + push (atomic)
git add <files>
git commit -m "<message>"
git push origin <DEFAULT_BRANCH>

# Stop
# Do NOT invoke /ship-a-phase, /march, etc.
```

---

## 8. When this skill is NOT the right tool

- **Inside an adopting project.** This skill runs against
  the *nexus* repo, not the adopter. The adopter writes
  `NEXUS_LESSONS.md`; a separate session at nexus runs
  `/lessons-pr`.
- **For nexus's own ongoing maintenance.** This is the
  inbound-from-adopters channel. Nexus's own evolution
  (new templates, new playbooks not driven by adopter
  feedback) happens via regular edits — not this skill.
- **For wholesale restructure.** This skill is for
  additive lessons. Changing nexus's directory layout or
  charter is a deliberate, manual editing pass.

---

## See also

- [`../playbooks/new-project.md`](../playbooks/new-project.md)
  — step 10 asks the adopter to write `NEXUS_LESSONS.md`.
- [`../concepts/asking-well.md`](../concepts/asking-well.md)
  — the question pattern for the planning step.
- [`../README.md`](../README.md) License section — names
  the inbound channel this skill implements.
