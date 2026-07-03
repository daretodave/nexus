# Skill: jot (nexus)

> **The user's quickfire.** One free-text observation → one
> row in `plan/CRITIQUE.md` Pending → commit → push. Under ten
> seconds, no questions back. The next `/iterate` scores it
> with the +0.5 user bump.

## 1. Purpose

Friction the user spots ("the TL;DR's second command is wrong
on Windows") gets captured at zero ceremony, exactly where the
loop already looks.

## 2. Invocation

```
/jot <free text>
/jot --severity high <free text>
```

Remote equivalent: file a GitHub issue — `/triage` routes it
with the same user-source weight.

## 3. The procedure

1. `git pull --ff-only`.
2. Build the row (severity default MED unless flagged;
   category inferred: link/tree → hygiene, README/playbook
   comprehension → comprehension, template behavior →
   doc-drift, else observation):

   ```markdown
   ### [<SEV>] <where-or-"general"> — <≤60-char summary>
   - category: <inferred>
   - observation: <user text, verbatim>
   - evidence: user-spotted at <ISO>
   - suggested fix: [user has not specified — iterate to determine]
   - source: user
   ```

3. Append to `plan/CRITIQUE.md` `## Pending`.
4. Commit + push: `jot: <≤70-char summary>`. Push rejected →
   pull + re-append + retry, ≤3.

No verify gate (state-file-only append), no mirror (iterate
mirrors on pickup), no questions ever — input arrives via the
slash argument.

## 4. Hard rules

1. Verbatim user text — never paraphrase the observation.
2. One row per invocation.
3. Empty argument → print usage, exit 0, no commit.
4. Never touch anything but `plan/CRITIQUE.md`.

## 5. Failure modes

1. **Push rejected 3×** — stop; report the divergence.
2. **`plan/CRITIQUE.md` missing Pending section** — stop
   (state corruption; recovery.md §G), don't improvise
   structure.

## 6. Quick reference

```bash
plan/CRITIQUE.md                     # the one file this touches
git commit -m "jot: <summary>" && git push origin main
```
