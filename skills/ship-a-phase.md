# Skill: ship-a-phase (nexus)

> **Full autonomy, no review checkpoint.** Ship one phase of
> the kit's build plan end-to-end: docs written, templates
> landed, cross-links wired, gate taught, verify green,
> commit + push, plan ticked. A docs kit's phase is prose and
> templates, not pages — the procedure reflects that.

## 1. Purpose

Turn the next `[ ]` row of `plan/steps/01_build_plan.md` into
shipped kit content. One phase per invocation. The phase's
brief (`plan/phases/phase_<N>_<topic>.md`) carries the
decisions; this skill executes them.

## 2. Invocation

```
/ship-a-phase                # next [ ] phase
/ship-a-phase phase 10       # a specific phase
```

## 3. Autonomy contract

Decide, ship, document. Specifically:

- Doc structure/wording ambiguities → follow the voice rules
  in `plan/bearings.md` and the exemplar docs it names.
- Where a new doc lives (playbooks vs customization vs
  concepts) → playbooks = runbooks (do X end-to-end),
  customization = opt-in layers, concepts = mental models.
  Decide and note in the commit body.
- Scope creep discovered mid-phase → ship the brief's scope;
  file the extra as an AUDIT row or phase candidate.
- Anything contradicting `plan/bearings.md` → bearings wins;
  surface the conflict in the commit body.

## 4. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Pick the work

First `[ ]` row (skip `[skipped]`, `[blocked: …]`). Read its
brief in `plan/phases/`. **No brief → generate one first**
(one-screen: deliverables, non-goals, decisions), commit it
separately (`phases: brief for phase <N>`), then proceed.

### Step 2 — Mirror the phase (best-effort)

```bash
issue_body=$(mktemp)
# title MUST be "Phase <N> — <topic>"
node templates/scripts/loop-issue.mjs phase-open \
  --phase <N> --title "Phase <N> — <topic>" --body-file "$issue_body"
```

Failure = warn and continue (rule: the mirror never gates).

### Step 3 — Read the exemplars

Before writing a new doc, re-read the voice exemplars named in
`plan/bearings.md`. New docs must be indistinguishable in
voice from the ones adopters already trust.

### Step 4 — Build

Write/edit the docs and templates the brief names. Hard-wrap
~62–64 cols; blockquote thesis; sentence-case headings; the
recurring stems. Templates get placeholders from the
documented vocabulary only.

### Step 5 — Wire

Every new doc: linked from ≥1 existing doc, added to the
README tree, added to `templates/README.md` if it's a
template. New placeholder → `PLACEHOLDER_VOCABULARY` in
`scripts/verify.mjs`. New invariant → a gate leg learns it in
this same commit.

### Step 6 — Verify gate

```bash
node scripts/verify.mjs
```

Foreground. Red → fix root cause; ≤3 iterations on the same
root cause, then §6 failure modes.

### Step 7 — Commit + push (atomic)

```bash
git add <explicit files>
git commit -m "<feat|docs|templates|playbook>: <subject>"
git push origin main
```

Body: 4–8 bullets + `Decisions:` section + `Closes #<mirror>`
when a mirror exists.

### Step 8 — Tick the plan

Flip `[ ]` → `[x] (commit <hash>)` in the build plan — in the
same commit when possible, else an immediate
`plan: phase <N> shipped` follow-up. Post the phase-close
comment (best-effort):

```bash
node templates/scripts/loop-issue.mjs phase-close \
  --phase <N> --commit <sha> --deploy-url https://github.com/daretodave/nexus
```

### Step 9 — Done

Return cleanly.

## 5. Hard rules

1. Verify gate foreground, non-negotiable, no `--no-verify`.
2. Commit + push atomic; no dirty tree at turn end.
3. No `Co-Authored-By`, no emojis (cloud `Cloud-Run:` trailer
   is the one carve-out).
4. Templates are public API (`agents.md` rule 7).
5. Voice rules are law; when in doubt, match the exemplars.
6. The mirror is best-effort, never gating.

## 6. Failure modes

Before any stop: surface it loud per `agents.md` rule 6 (issue
or mirror comment, best-effort).

Repo-shaped — stop the tick:

1. **Gate red ≥3 times on the same root cause.**
2. **`git pull` divergence.**

Phase-shaped — mark `[blocked: <reason> <date>]`, commit that
state change, return cleanly:

3. **The brief contradicts bearings irreconcilably.**
4. **Phase scope stays genuinely ambiguous** after reading the
   row + brief + bearings + README. (Generate a more decisive
   brief first; block only if even that fails.)

Everything else: decide, ship, document.

## 7. Quick reference

```bash
# Reads
plan/steps/01_build_plan.md          # what ships next
plan/phases/phase_<N>_<topic>.md     # the brief
plan/bearings.md                     # voice + contracts

# Writes
<the docs/templates the brief names>
plan/steps/01_build_plan.md          # tick in same commit
scripts/verify.mjs                   # when a new invariant lands

# Commands
git pull --ff-only
node scripts/verify.mjs
git add <explicit> && git commit && git push origin main
node templates/scripts/loop-issue.mjs phase-open|phase-close ...
```
