# Skill: rebooting

> **The reboot train, from the owner's terminal.** Announce a
> reboot to every loop on this machine, wait for each to park,
> check nothing will be lost, then hand back one resume line
> per loop. Every claim is kept. Runs in the owner's own
> session, never inside a loop.

## 1. Purpose

The owner is about to restart the machine (or every Claude
session). Each loop parks itself with `/reboot-ready`, writing
its state into its live ledger (`.nexus/sessions/<id>.json`,
`scripts/ledger.mjs`), and after the restart each one is picked
up with `/reboot-resume`. This skill is the conductor: it
announces, checks, and prints the resume lines. The train's own
file is `.nexus/reboot/<slug>.md` at the primary checkout's root
(the first `worktree` in `git worktree list --porcelain`):
untracked, never committed.

## 2. Invocation

```
/rebooting [<slug>]        # announce (slug: MMDD-HHMM plus a word of the reason)
/rebooting status [<slug>] # who has parked, who hasn't (read-only)
/rebooting ack [<slug>]    # everyone parked: check, then print the resume lines
```

With no slug, `status` and `ack` take the newest train that
isn't `resumed`.

## 3. Procedure

### Announce

1. **Slug:** the argument, else `MMDD-HHMM` in local time plus
   one word of the reason (`1020-2230-update`); lowercase,
   `[a-z0-9-]` only. A train with that slug that isn't
   `resumed` is reused (a second announce of one reboot).
2. Write `.nexus/reboot/<slug>.md`: the slug, the ISO time, the
   reason, `state: announced`, and this session's star.
3. **Snapshot who's running:** `node scripts/ledger.mjs list`,
   `node scripts/claims.mjs list` and `git worktree list
   --porcelain`. Write the expected loops into the train file:
   every `live` or `fallen` ledger, and every session holding a
   claim or a locked worktree that has no ledger.
4. **Post the notice** as the owner: `node scripts/announce.mjs
   --owner "REBOOT <slug>: the machine reboots shortly. Every
   loop: stop now and run /reboot-ready <slug>, then stop
   looping. Keep every claim."` Loops read the board at orient
   and before they land, so a busy one may see it late.
5. **Print the paste line** for each loop's terminal, fenced:
   `REBOOT <slug>: run /reboot-ready <slug> now (or read
   skills/reboot-ready.md in <primary root> and follow it).`
   Then say `/rebooting ack <slug>` comes once every loop has
   posted `REBOOT-SAFE <slug>`.

### Status

Read-only: the train's state, the expected loops, which have
parked (`ledger.mjs list --train <slug>`), which haven't, and
the `REBOOT-SAFE <slug>` lines on the board (`announce.mjs
list`).

### Ack

1. Read every ledger of the train (`ledger.mjs list --train
   <slug> --json`). Parked = `state: parked` and its
   `REBOOT-SAFE <slug> <star>` line is on the board.
2. **Check nothing will be lost**, per ledger:
   - Each worktree it names still exists, and its uncommitted
     files and commits ahead match what it recorded. A
     worktree that changed after parking means that loop
     didn't stop: say so.
   - Its claims are still on the claims branch under its
     session: renew each (`node scripts/claims.mjs renew <ids…>
     --session <its claims session>`), so each has a fresh 24 h
     clock across the reboot. Never release one.
   - Its children are recorded as stopped or left to finish.
3. **Expected loops with no parked ledger:** list what they
   hold. Don't block on them: a `live` one's ledger is already
   on disk and resumes like a crash (`fallen` after the
   restart); a session with claims but no ledger gets one
   written for it (`state: parked`, its claims and worktree
   from the snapshot, `loop: unknown`).
4. Set the train to `state: acked`; post `node
   scripts/announce.mjs --owner "REBOOT <slug>: acked; safe to
   reboot."`
5. **Print one resume line per ledger**, each fenced, for a
   fresh terminal (`claude` in the primary checkout):
   `/reboot-resume <slug> <star>   # <what it was doing, ≤ 8
   words>`. Then: "Safe to reboot. After the restart, open one
   terminal per line and paste it. Claims hold for 24 h."

## 4. Hard rules

1. Never kill a loop, close a worktree, delete a branch or
   release a claim from here. Loops park themselves.
2. Nothing under `.nexus/` is ever committed.
3. No tracked file changes; no worktree, no gate.

## 5. Failure modes

- **A loop never parks:** `ack` lists it; its live ledger
  still lets `/reboot-resume` pick it up as `fallen`.
- **No ledger script in this repo:** the train still works on
  the board and claims alone; say the resume will rebuild
  state from claims and worktrees.

## 6. Quick reference

```bash
node scripts/announce.mjs --owner "REBOOT <slug>: ..."
node scripts/announce.mjs list
node scripts/ledger.mjs list [--train <slug>] [--json]
node scripts/claims.mjs renew <ids…> --session <session>
```
