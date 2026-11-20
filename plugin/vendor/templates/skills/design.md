# Skill: design

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
knows where the last one left off. `/design ingest` brings the
finished artifact back: every board kept byte for byte with a
manifest, the UI's source of truth, the port plotted.

This is not the in-repo design session
(`nexus/templates/design-prompt.md`):
that one is a Claude Code session working in a copy of the
repo. `nexus/playbooks/design-handoff.md` is the round trip
step by step; `nexus/concepts/design-round-trip.md` is the why.
`design/render.md` renders the boards and compares the app.

## 2. Invocation

```
/design prompt               # every spec item naming UI work
/design prompt 41,42         # those specs, whole
/design prompt vault         # the specs holding the word
/design addendum             # what changed since the last stored file
/design ingest <link|folder> # the artifact in, the port plotted
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
- An artifact link is the go-ahead for ingest: never ask.
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

1. A link: list and read every file through the Artifact tool
   into a fresh scratch folder (no Artifact tool, as on a cloud
   tick: park a `[needs-user-call]` row for the downloaded
   folder, stop). A folder: use it as given.
2. Shape the port chunk through `/plot` (Steps 0-2), so its id
   is known; then, in the plot's worktree,
   `node scripts/design/ingest.mjs <folder> --artifact <link>
   --version <v> --chunk <id>` writes `design/handoff/<date>/`:
   the files verbatim, `manifest.json`, `README.md`.
3. `check` passes; commit `docs: ingest the design handoff of
   <date>`, plot the L port chunk, land as `/plot` does.

`design/ingest.md` has each step in full; `design/port.md`, the port.

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
4. **The fetch stopped short:** ingest names the boards the
   canvas holds and the folder lacks, writes nothing; refetch.
5. `git pull` divergence: rebase your own commits, retry.

## 9. Quick reference

```bash
# Reads
plan/NN-*.md                          # Design + Acceptance
design/prompts/NNN-<date>.md          # the newest stored file's front matter

# Commands
node scripts/design/prompt.mjs prompt [<scope>] [--write]
node scripts/design/prompt.mjs addendum [--write]   # --dir design/prompts --plan plan --date YYYY-MM-DD
node scripts/design/ingest.mjs <folder> --artifact <link> --version <v> --chunk <id>
node scripts/design/ingest.mjs check|rehash <handoff>   # --into packages/<name>/design/handoff
node scripts/design/render.mjs <handoff> --out <dir> [--theme night|dawn] [--board <name>]
node scripts/design/compare.mjs <board.png> <app.png> [--threshold 0.1] --out diff.png
node scripts/design/port-map.mjs check|status [<handoff>]   # every board mapped, skipped or pending
Workflow({ scriptPath: "scripts/design/port.workflow.js", args: { handoff, worktree, chunk } })

# Writes
design/prompts/NNN-<date>.md          # one per prompt or addendum
design/handoff/<date>/                # one per delivery: the files, manifest.json, README.md, port.json
git commit -m "docs: design prompt NNN"   # then land per owner mode (next/land.md §6)
```
