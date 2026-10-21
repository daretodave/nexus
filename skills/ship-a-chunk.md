# Skill: ship-a-chunk (nexus)

> **Full autonomy, no review checkpoint.** Ship one chunk of
> the kit's plan end-to-end: docs written, templates landed,
> cross-links wired, gate taught, verify green, the chunk
> closed, commit + land. A docs kit's chunk is prose and
> templates, not pages — the procedure reflects that.

## 1. Purpose

Turn the next ready chunk in `plan/README.md` into shipped kit
content and close it in the same commit: its line and A-IDs
leave the spec, one line lands in `plan/ARCHIVE.md`. One chunk
per invocation. The spec (`plan/<NN>-<slug>.md`) carries the
decisions; this skill executes them. The shape:
`concepts/plan-shape.md`.

## 2. Invocation

```
/ship-a-chunk                # next ready chunk
/ship-a-chunk 32.1           # that chunk
/ship-a-chunk 32             # spec 32's next ready chunk
```

## 3. Autonomy contract

Decide, ship, document. Specifically:

- Doc structure/wording ambiguities → follow the voice rules
  in `plan/bearings.md` and the exemplar docs it names.
- Where a new doc lives (playbooks vs customization vs
  concepts) → playbooks = runbooks (do X end-to-end),
  customization = opt-in layers, concepts = mental models.
  Decide and note in the commit body.
- Scope creep discovered mid-chunk → ship the chunk's A-IDs;
  file the extra as an AUDIT row or a candidate.
- A chunk bigger than its size → ship the first vertical
  slice; split the rest into new chunks (`NN.ka`, `NN.kb`)
  that divide its A-IDs, in the same commit.
- Anything contradicting `plan/bearings.md` → bearings wins;
  surface the conflict in the commit body.

## 4. The procedure

### Step 0 — Sync

```bash
git pull --ff-only
```

### Step 1 — Pick the chunk

`plan/nexus.lock` must say `shape: chunks`. Then, from
`plan/README.md`: an explicit argument wins; else the **Asap**
lane in order; else the spec table in order. Within a spec,
the first chunk whose `needs` are done (gone from every spec).
Never a chunk in the **Held** lane. A spec that says `Not
chunked yet.` → chunk it first (S/M/L slices covering every
A-ID, a true Measure line), commit that alone
(`plan: chunk spec <NN>`), then proceed.

### Step 2 — Mirror the spec (best-effort)

```bash
issue_body=$(mktemp)
# the helper titles it "Spec <NN> — <spec title>"
node templates/scripts/loop-issue.mjs spec-open \
  --spec <NN> --title "<spec title>" --body-file "$issue_body"
```

Failure = warn and continue (rule: the mirror never gates).

### Step 3 — Read the spec and the exemplars

Read `plan/<NN>-<slug>.md` end to end: Design and Contracts
are decided; Acceptance says what done means for the A-IDs
this chunk closes; its sub-bullets are requirements. Before
writing a new doc, re-read the voice exemplars named in
`plan/bearings.md`.

### Step 4 — Build

Write/edit the docs and templates the chunk names. Hard-wrap
~62–64 cols; blockquote thesis; sentence-case headings; the
recurring stems. Templates get placeholders from the
documented vocabulary only.

### Step 5 — Wire

Every new doc: linked from ≥1 existing doc, added to the
README tree, added to `templates/README.md` if it's a
template. New placeholder → `PLACEHOLDER_VOCABULARY` in
`scripts/verify.mjs`. New invariant → a gate leg learns it in
this same commit.

### Step 6 — Close the chunk

In the same working tree, before the gate:

1. Remove the chunk's line and sub-bullets from the spec.
2. Remove the A-IDs it `closes`; fix the `Measure:` line
   (`open` down, `closed` up, `next` unchanged).
3. Drop it from other chunks' `needs` and from the lanes;
   update the spec's `N left` in `plan/README.md`.
4. Append `- <date> · <NN.k> · <what now works, ≤ 10 words> ·
   (this commit)` to `plan/ARCHIVE.md`.
5. Spec now empty → move what should outlive it into
   `plan/bearings.md` (standing decisions) or the doc it
   shipped, delete the spec and its row, and archive
   `- <date> · <NN> · spec complete: <title> · deleted in
   (this commit)`.

### Step 7 — Verify gate

```bash
node scripts/verify.mjs
```

Foreground. The `chunks` leg checks Step 6 against HEAD. Red →
fix root cause; ≤3 iterations on the same root cause, then §6
failure modes.

### Step 8 — Commit + land (atomic)

```bash
git add <explicit files>
git commit -m "<feat|docs|templates|playbook|ci>: <subject> (<NN.k>)"
# land per owner mode: skills/next/land.md §6
```

Body: 4–8 bullets + `Decisions:` section + `Closes #<mirror>`
on the spec's last chunk. Then post the chunk's comment on the
mirror (best-effort):

```bash
node templates/scripts/loop-issue.mjs spec-close \
  --spec <NN> --commit <sha> --deploy-url https://github.com/daretodave/nexus
```

### Step 9 — Done

Return cleanly.

## 5. Hard rules

1. Verify gate foreground, non-negotiable, no `--no-verify`.
2. Commit + land atomic; no dirty tree at turn end.
3. No `Co-Authored-By`, no emojis (cloud `Cloud-Run:` trailer
   is the one carve-out).
4. Templates are public API (`agents.md` rule 7).
5. Voice rules are law; when in doubt, match the exemplars.
6. The mirror is best-effort, never gating.
7. The plan only shrinks: no ticked boxes, no "done" notes;
   A-IDs, chunk ids and spec numbers are never reused.

## 6. Failure modes

Before any stop: surface it loud per `agents.md` rule 6 (issue
or mirror comment, best-effort).

Repo-shaped — stop the tick:

1. **Gate red ≥3 times on the same root cause.**
2. **`git pull` divergence.**

Chunk-shaped — add `- **<NN.k>** · blocked: <reason> <date>`
to the Held lane in `plan/README.md`, commit that state
change, return cleanly:

3. **The spec contradicts bearings irreconcilably.**
4. **Chunk scope stays genuinely ambiguous** after reading the
   spec + bearings + README. (Make the spec's Design more
   decisive first; hold only if even that fails.)
5. **The chunk needs a workflow-file push from a cloud tick**
   (the cloud token can't push `.github/workflows/`; see
   `agents.md` "Operational secrets"). Hold it with
   `blocked: needs a local session`.

Everything else: decide, ship, document.

## 7. Quick reference

```bash
# Reads
plan/nexus.lock                      # shape: chunks
plan/README.md                       # lanes + spec table: what ships next
plan/<NN>-<slug>.md                  # the spec: design, acceptance, chunks
plan/bearings.md                     # voice + contracts

# Writes
<the docs/templates the chunk names>
plan/<NN>-<slug>.md + plan/README.md # the close, same commit
plan/ARCHIVE.md                      # one line per closed chunk
scripts/verify.mjs                   # when a new invariant lands

# Commands
git pull --ff-only
node scripts/verify.mjs
git add <explicit> && git commit   # then land per owner mode (next/land.md §6)
node templates/scripts/loop-issue.mjs spec-open|spec-close ...
```
