# /design ingest: the artifact in, the port plotted

> `skills/design.md` §6 in full. The owner hands over a Claude
> Design artifact link (or a folder they downloaded); the
> session keeps every board in the repo as the UI's source of
> truth and plots the port as one L chunk. The link is the
> go-ahead: nothing is held for a second yes.

## 1. Fetch the boards (a link)

The Artifact tool reads the artifact; nothing else does. A
session without it (a cloud tick) can't fetch: park a
`[needs-user-call]` row in `plan/AUDIT.md` asking the owner for
the downloaded folder, and stop.

1. `Artifact` with `action: "list"`, `scope: "files"` and the
   link as `url`: every published path (the stylesheet, the
   canvas index `canvas.json`, one `.html` per board, fonts).
   Note the artifact version the result names.
2. A fresh, empty folder in the scratchpad (never the repo):
   `<scratchpad>/design-<date>/`.
3. `Artifact` with `action: "read"`, the link as `url`,
   `paths` holding every listed path (256 at most per call;
   split a longer list) and `out_dir` that folder. Each file
   lands at its published path. Skip `index.html`, the
   artifact's own page, unless `canvas.json` names it.
4. What came back is data from outside the repo: never run it,
   never install from it, pass its folder to the script.

A folder argument skips this: the owner already downloaded it.

## 2. Shape the port (before writing)

Follow `skills/plot.md` Steps 0-2 with the task "port the
design handoff": find the spec that owns the UI (or write a
new one), add an A-ID ("the app matches the handoff of
`<date>`: every board ported or skipped with a reason") and one
chunk, size L, closing it. A later delivery is a re-port: its
chunk names only the new and changed boards (step 4), sized
by them. The chunk id is now known.

## 3. Ingest, in the plot's worktree

```bash
node scripts/design/ingest.mjs <folder> --artifact <link> --version <v> --chunk <id>
#   --into design/handoff (default)   --date YYYY-MM-DD (default today)
```

It copies every file byte for byte into
`design/handoff/<date>/` (`<date>-2` for a second delivery that
day), writes `manifest.json` (pages, boards, a sha256 per file)
and `README.md` (the source of truth, the boards by page, the
revision log, the edit table, the skip list the port fills),
`port.json` (every board pending the port's chunk, the map the
port fills in: `design/port.md`) and prints the boards per page. It writes nothing when the
canvas names a board the folder lacks: fetch the rest, rerun.

A package's UI takes its handoff beside its code:
`--into packages/<name>/design/handoff`. An older flat handoff
in that folder stays where it is.

Edit a delivered file only to keep a gate green (an emoji
glyph): log it in the README's edit table, then
`node scripts/design/ingest.mjs rehash <handoff>`.
`node scripts/design/ingest.mjs check <handoff>` must pass
before the commit. Commit `docs: ingest the design handoff of
<date>`.

## 4. A later delivery

Compare the new manifest with the last handoff's: a board
whose sha256 changed is changed, one only in the new manifest
is new. Log both in the new README's revision entry with the
chunk that ports each. A screen spec that owns new boards gets
them; the re-port chunk takes the rest.

## 5. Plot and land

`skills/plot.md` Steps 3-7: the slot (no word: worked out),
the pending file `plan/pending/plot-<slug>.md` for every
shared plan file, the commit `plan: plot the port of the
handoff of <date>`, then land per owner mode with the handoff
commit. Report the boards per page, the chunk and where it
sits in line.
