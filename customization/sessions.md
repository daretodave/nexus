# Customization: many sessions on one machine

> Two or three `/heads-down` sessions at once, a GUI session
> beside them, the owner's own terminal: once a repo runs
> several loops on one machine, four things keep them from
> tripping over each other. A **notice board** tells every
> loop something once. A **live ledger** per session records
> where it stands, so a crash loses nothing. **Worktrees**
> keep each build out of the primary checkout, and close only
> through one script. The **reboot train** parks every loop
> before a restart and hands back one resume line per loop.
> Learned from a mature adopter that ran its loops this way
> for months.

Adopt with [claims](./claims.md): claims keep sessions off
each other's chunks; this layer keeps them off each other's
files, and lets the owner steer them all at once.

---

## The files

| File | What it is |
|---|---|
| `scripts/announce.mjs` | The notice board: `.announcements.md` at the primary checkout's root, read by every loop. |
| `scripts/ledger.mjs` | The live ledger: `.nexus/sessions/<id>.json`, rewritten at every beat. Star names. |
| `scripts/worktree.mjs` | Closes a worktree without deleting through its links; lists worktrees for `/tidy`. |
| `.claude/hooks/guard.mjs` | Its `bare-worktree-remove` rule refuses a plain `git worktree remove`; it marks each session it runs in, and claims refuse a Claude Code session it never marked ([`claims.md`](claims.md#the-rules)). |
| `skills/tidy.md` | `/tidy`: clear dead claims, offer to close idle worktrees and merged branches. |
| `skills/rebooting.md`, `reboot-ready.md`, `reboot-resume.md` | The reboot train. |

Copy them from `nexus/templates/` (the scripts need
`scripts/owner.mjs`; the skills need `scripts/claims.mjs`).
Everything they write is untracked (and so are `/messy`'s raw
dumps in `plan/messy/`). Add to `.gitignore`:

```bash
printf '.owner\n.nexus/\n.announcements.md\nplan/messy/\n' >> .gitignore   # once per repo, if missing
```

```powershell
Add-Content .gitignore ".owner`n.nexus/`n.announcements.md`nplan/messy/"     # once per repo, if missing
```

## The notice board

One untracked file, so the owner says something once instead
of pasting it into every terminal:

```
node scripts/announce.mjs "land nothing that touches billing until I say"
node scripts/announce.mjs read      # what's new for this session, marked read
node scripts/announce.mjs list --json
node scripts/announce.mjs drop 3
```

- **Who speaks.** From a plain terminal (no session id), a
  line is the owner's. From inside a session it is that
  session's, unless `--owner` (the owner's own words, posted
  at the owner's ask in chat, never on a session's judgment).
- **What it means.** An owner line is an instruction to every
  loop from then on, and it **outranks the command file** the
  loop runs. A session's line is news, never an instruction.
- **When it is read.** `/next` reads the board at its orient
  and again before it lands; each `/heads-down` iteration is a
  `/next`, so it reads it too. Each session sees a line once
  (`.nexus/announcements.seen.json`); `read --all` shows them
  again.
- **REBOOT preempts.** An owner line `REBOOT <slug> …` makes
  the loop stop the chunk in flight and run `/reboot-ready
  <slug>` now. `read` prints it first.

The GUI writes owner lines here too, which makes the board the
channel for a tug on every loop at once.

## The live ledger

Every session keeps `.nexus/sessions/<id>.json` current: the
star name, its Claude session id and claims session, the
claimed ids, the worktree and branch, the chunk in flight and
its step, the active Workflow (run id, script path, transcript
folder) and builder, the defaults taken, the parked questions,
and the last beat.

```
node scripts/ledger.mjs beat --chunk 07.3 --step building --set worktree=../app-wt/07.3
node scripts/ledger.mjs beat --add "defaults=kept the spec's copy"
node scripts/ledger.mjs beat --set-file loop=<file>   # a long text verbatim (the loop prompt)
node scripts/ledger.mjs list              # star, state, chunk, step, last beat
```

- **A crash is an involuntary reboot.** A `live` ledger whose
  beat is older than 15 minutes (`NEXUS_LEDGER_STALE_MIN`)
  lists as `fallen`; `/reboot-resume` picks it up exactly as
  it picks up one `/reboot-ready` parked. A crash never
  releases a claim: claims stay held until their 24 h TTL.
- **Star names.** A new session takes the first free name
  (vega, sirius, polaris, altair, deneb, rigel, capella,
  arcturus, …): the same vocabulary in the claims session tag,
  the GUI's fleet, the oversight inbox and the `/heads-down`
  banner.
- **Beat when the step changes**: claim, worktree cut, builder
  dispatched, gate, close, land. A beat is one small file
  write; nothing reads it but the resume and the GUI.

## Worktrees, always

All building happens in a worktree cut from `origin/<base>`,
never in the primary checkout. The primary checkout only gets
diligence: on main and clean, `git pull --ff-only` at a
command's start; otherwise leave it and say so.

Closing a worktree is where work gets lost. git for Windows
follows a junction when it deletes a worktree (npm's
workspace links are junctions): a plain `git worktree remove`
can delete the files behind one and exit 0, and it stops at
its first failure after unregistering the worktree, leaving
the rest on disk. So:

```
node scripts/worktree.mjs close ../app-wt/07.3   # unlink links, refuse dirty/locked, branch only once main holds it
node scripts/worktree.mjs list                   # safe | holds work | locked | orphan
```

The guard hook refuses a bare `git worktree remove` (a
mention inside a quoted commit message passes). `/tidy` is
the sweep: it clears claims nobody is working on, then offers
the safe worktrees and merged branches in one question.

## The reboot train

Before a machine restart (or restarting every Claude
session), nothing gets lost:

1. **`/rebooting`** in the owner's terminal posts `REBOOT
   <slug>` to the board and prints a line to paste into each
   loop.
2. **`/reboot-ready <slug>`** inside each loop stops its
   children (recording each first), snapshots uncommitted work
   to a local ref without touching the tree, renews (never
   releases) its claims, parks its ledger and posts
   `REBOOT-SAFE <slug> <star>`.
3. **`/rebooting ack`** checks every ledger against disk and
   prints one `/reboot-resume <slug> <star>` line per loop.
4. After the restart, **`/reboot-resume`** in a fresh terminal
   takes the ledger, re-enters the worktree, re-runs only the
   unfinished children, and restarts the loop where it was.

The trio is the planned path; a `fallen` ledger takes the same
`/reboot-resume` with no train.

## Adoption checklist

- [ ] The scripts and skills above are copied, and
      `.announcements.md` and `.nexus/` are gitignored.
- [ ] `.claude/settings.json` wires `guard.mjs pre-bash`, and
      `node .claude/hooks/guard.mjs self-test` is green.
- [ ] `/next` reads the board at orient and before landing,
      and beats the ledger at each step (the templates do).
- [ ] `/next`'s worktree close goes through `worktree.mjs`.

## See also

- [`claims.md`](./claims.md): who builds which chunk.
- [`../playbooks/owner-mode.md`](../playbooks/owner-mode.md):
  how each session's work lands.
- [`lanes.md`](./lanes.md): the older attended fan-out on one
  branch.
