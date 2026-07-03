# Skill: critique (nexus)

> **The dry-run adoption.** A methodology kit's "live site" is
> the adoption experience. This skill walks the README's own
> TL;DR into a scratch directory as a stranger would — follows
> the instructions literally, copies the templates, replaces
> the placeholders — and files every friction point. Findings
> only; never fixes.

## 1. Purpose

The kit's authors can't feel first-contact friction; a
fresh-eyes pass can. This is the exact analog of the product
`/critique` (stranger visits the live site), aimed at the
kit's real surface: its instructions.

## 2. Invocation

```
/critique                    # full dry-run adoption + stranger-read
/critique read               # stranger-read only (README + one playbook)
```

Rate-limited by `/march` (≥12 commits or >72h since last
pass). Runs fine in the cloud — it needs only files and
`mktemp -d`, no browser.

## 3. The procedure

1. **Pre-flight:** `git pull --ff-only`. Read the metadata
   header of `plan/CRITIQUE.md`.
2. **Stage:** `scratch=$(mktemp -d)` — a fictional adopter
   project (name: pick something neutral, e.g. `halcyon`;
   hosting: netlify; branch: main).
3. **Walk the TL;DR literally.** From `README.md` "clone +
   delegate" downward, executing what an adopter's agent
   would: copy the files `templates/README.md` says to copy,
   run the placeholder replacements the README shows, check
   every file the playbooks reference exists at the stated
   path, follow `playbooks/new-project.md` step numbers in
   order. Delegate the walk to a fresh sub-agent when
   available — its ignorance is the instrument.
4. **Stranger-read.** Read `README.md` top to bottom as
   someone who has never seen the kit: where does
   comprehension stumble? What promise is unclear? What order
   confuses?
5. **Self-assess to ≤6 findings.** Severity HIGH (an adopter
   is blocked/misled) / MED (friction, workaroundable) / LOW
   (polish). Categories: `instruction-drift | missing-file |
   comprehension | ordering | voice | placeholder`.
6. **Append** to `plan/CRITIQUE.md` Pending (standard row
   schema: `### [SEV] <where> — <one-line>` + `- category:` /
   `- observation:` / `- evidence:` (file:line or the exact
   failing command) / `- suggested fix:` / `- source:
   dry-run`). Update the metadata header (`Last pass`, `Pass
   count`).
7. **Clean up** the scratch dir. **Commit + push:**
   `critique: pass <N> — <K> findings (<H> high, <M> med,
   <L> low)`. Findings-only commits skip the mirror; `/iterate`
   mirrors when it picks one up.

## 4. Hard rules

1. **Findings only.** This skill never edits docs, templates,
   or state beyond `plan/CRITIQUE.md`.
2. Every finding carries evidence an `/iterate` tick can act
   on without re-deriving the walk.
3. Cap 6 per pass — a 20-finding dump drowns the queue.
4. The scratch dir never touches the repo tree and is always
   removed.
5. No fabricated friction: if the walk was smooth, say so
   (`critique: pass <N> — clean`) and record the pass.

## 5. Failure modes

1. **`mktemp` unavailable** (exotic runner) — fall back to
   `.scratch/critique-<date>/` (gitignored), note it, proceed.
2. **The walk itself crashes on a kit bug** — that IS the
   finding (HIGH, instruction-drift); file it and end the
   pass early.
3. **`git pull` divergence** — stop.

## 6. Quick reference

```bash
plan/CRITIQUE.md                     # output + rate-limit metadata
README.md                            # the surface under test
templates/README.md                  # the copy contract
playbooks/new-project.md             # the walked playbook
scratch=$(mktemp -d)                 # the fictional adopter
git commit -m "critique: pass <N> — <K> findings" && git push origin main
```
