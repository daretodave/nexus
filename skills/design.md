# Skill: design (nexus)

> **The Claude Design round trip, opt-in.** A prompt goes out,
> addenda follow as the plan moves, the artifact comes back.
> Runs only when the owner designs in Claude Design. The script
> drafts what is mechanical; the model writes the words.

## 1. Purpose

Claude Design cannot read the repo: it reads only what is
pasted into it. `/design prompt` writes that paste from the
plan, and `/design addendum` writes only what changed since,
numbered to continue it, for a session already running. Every
prompt and addendum is stored in the repo, so the next addendum
knows where the last one left off.

This is not the in-repo design session
(`templates/design-prompt.md`):
that one is a Claude Code session working in a copy of the
repo. `playbooks/design-handoff.md` is the round trip
step by step; `concepts/design-round-trip.md` is the why.

## 2. Invocation

```
/design prompt               # every spec item naming UI work
/design prompt 41,42         # those specs, whole
/design prompt vault         # the specs holding the word
/design addendum             # what changed since the last stored file
/design ingest <link|folder> # arrives in 43.3
```

## 3. Autonomy contract

- No scope: every Design bullet and Acceptance line that names
  the GUI, the UI, a screen, a view, a page, a board, a panel,
  a dialog or onboarding (`UI_WORDS` in the script).
- The scope selects nothing: say so, name the specs with UI
  work, stop. No file.
- A prompt while others are stored: a new Claude Design
  session. Its file number goes on; its sections restart at 1.
- An addendum with nothing changed: say so. No file, no commit.
- An item that is not a screen (a script, a workflow): cut it
  from the text while polishing. Its hash stays in the front
  matter, so the next addendum names it only if it changes.
- Under a loop: never ask; take the scope as given.

## 4. `prompt`

1. `git pull --ff-only`.
2. Draft: `node scripts/design/prompt.mjs prompt [<scope>]`
   prints it; read it. Then `--write` stores it as
   `design/prompts/NNN-<date>.md` and prints the path.
3. Polish the stored file, in the voice of the drafts in
   `design/prompts/` (short, plain, what the screen shows):
   - fill the `<!-- fill: ... -->` note: tokens (colour, type,
     space, radius, elevation, motion), both themes if the
     product has two, then the component classes; from
     `plan/bearings.md`, `design/` if it exists, the product's
     voice;
   - turn plan wording into what each screen shows: chunk
     numbers, file paths and script names out; states and
     roles kept;
   - keep every section number and the front matter as
     written; no emoji, real copy.
4. Commit `docs: design prompt NNN` and land per owner mode
   (`next/land.md` §6).
5. Hand the owner everything below the file's `---` line, to
   paste into Claude Design.

## 5. `addendum`

1. `git pull --ff-only`.
2. `node scripts/design/prompt.mjs addendum --write`: it reads
   the newest stored file, keeps its scope, and writes only the
   items that are new or changed (by the hash per item in the
   front matter) and names the dropped ones. Sections number on
   from that file's last; the file says which prompt it
   continues.
3. Polish as in §4 step 3, writing only the change: "the vault
   screen now shows each secret's age", never the whole screen
   again.
4. Commit `docs: design addendum NNN`, land, hand it over.

## 6. `ingest`

Arrives in 43.3: the artifact link or a downloaded folder in,
`design/handoff/<date>/` with a manifest and README out, the
port plotted as an L chunk. Until then, playbook step 4.

## 7. Hard rules

1. No `Co-Authored-By:`. No emojis, in the files or the paste.
2. Never renumber: an addendum's sections continue the last
   stored file's; a stored file is never edited after it is
   pasted. A correction is the next addendum.
3. The front matter is the script's: never hand-edit it.
4. Opt-in: never run unless the owner designs in Claude
   Design.
5. Commit and land; no dirty tree at turn end.

## 8. Failure modes

1. **No plan specs** (`plan/NN-*.md`): nothing to draft from;
   say so, stop.
2. **A stored file with no front matter:** the script refuses;
   report the file. Never guess its numbering.
3. **Addendum before any prompt:** the script refuses; run
   `/design prompt` first.
4. `git pull` divergence: rebase your own commits, retry.

## 9. Quick reference

```bash
# Reads
plan/NN-*.md                          # Design + Acceptance
design/prompts/NNN-<date>.md          # the newest stored file's front matter

# Commands
node scripts/design/prompt.mjs prompt [<scope>] [--write]
node scripts/design/prompt.mjs addendum [--write]
#   --dir design/prompts  --plan plan  --date YYYY-MM-DD

# Writes
design/prompts/NNN-<date>.md          # one per prompt or addendum
git commit -m "docs: design prompt NNN"   # then land per owner mode (next/land.md §6)
```
