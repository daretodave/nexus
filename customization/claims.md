# Customization: claims — who builds which chunk

> Several builders on one plan (your loops, a teammate's, the
> cloud tick, two or three `/heads-down` sessions at once)
> need one place that says who is building which chunk, which
> no two of them can both win, and which survives a crash. The
> claims module is that place: an orphan `claims` branch on
> origin holding one file, written by compare-and-swap. It
> replaces the hand-kept lane board in
> [`lanes.md`](./lanes.md). Learned from a mature adopter
> whose people and loops claimed chunks this way for months.

Adopt when more than one session builds from the plan at a
time, or when anyone besides the owner builds at all. A single
loop on a single checkout doesn't need it.

---

## The files

| File | What it is |
|---|---|
| `scripts/claims-codec.mjs` | The rules, as pure functions on a map: no I/O, no Node built-ins. Anything that claims (the CLI, a team bot, the local GUI) imports it, so every claimant obeys the same rules. |
| `scripts/claims.mjs` | The CLI over git. Every command prints one JSON value with `--json`. |
| `scripts/owner.mjs` | Effective owner mode, shared with settle. |
| `scripts/plan/pending.mjs` | Lets the audit count a pending close as closed. |

Copy all four from `nexus/templates/scripts/` (with
`scripts/plan/`, the [pending files](../concepts/plan-shape.md)
layer). They need Node 20+, git, and nothing else; `gh` is
used only by `prune`, `audit` (PR states) and a contributor's
`whoami` (their GitHub login), and each degrades without it.

## The branch

`claims` is an orphan branch: it shares no history with main
and holds `claims.json` (and a README the first claim
writes). Each entry maps a chunk id to one string:

```
"16.3": "sam|10.0.0.2|sam-pc|2026-10-20T14:02:11.000Z|s:9f2c41aa|pr:42|b:next/16"
```

`who | ip | host | when`, then `s:<session>`, and optionally
`pr:<n>`, `held:<github login>` and `b:<base branch>` (omitted
when it is main).

- **Compare-and-swap.** A claim builds a commit on the tip it
  just fetched, with plumbing (`hash-object`, `mktree`,
  `commit-tree`), and pushes it without force. Two machines
  racing for one chunk cannot both win: the loser's push is
  rejected, it fetches the new tip, redoes its change on it,
  and sees the winner. Up to 8 tries. Nothing is checked out,
  so any checkout or worktree can claim.
- **Unreadable throws.** A `claims.json` that doesn't parse is
  an error, never an empty map: the next write would wipe
  everyone's claims.
- **No force, ever.** Protect the branch with a ruleset that
  refuses force pushes and deletions, and nothing else. A
  pre-push hook that checks branches should skip `claims`.
- **Open or protected.** Open is the default: anyone who can
  push the `claims` branch claims and releases. Protected is
  an option: the owner's ruleset also restricts updates, with
  the owner's bypass, and a contributor's claim then fails
  cleanly with "claims are protected: ask the owner" (ask
  through an issue; the owner `assign`s). Both rulesets are in
  [`owner-mode.md`](../playbooks/owner-mode.md) Step 3.

## The rules

- **Session-scoped.** A claim belongs to the session that made
  it: `NEXUS_SESSION`, else the Claude Code session id, or
  `--session <id>`. Two loops of one person never share a
  chunk, and one loop's renew or release never touches
  another's. A claim with a PR is also its author's on that
  machine in any session, so a later session can carry the
  review.
- **24 hours.** A claim lives 24 h from its time; `renew`
  restarts the clock. A stale claim may be reclaimed by
  anyone, except a privileged (owner's) claim, which only the
  owner takes over.
- **A PR's claim never goes stale.** It ends when `prune`
  finds the PR merged or closed.
- **Held never goes stale.** The owner can `assign` chunks to a
  person by their GitHub login. A hold is that person's from
  any session or machine, and only they or the owner's
  `--force` take it off. A hold whose PR closes unmerged stays
  held.
- **A spec and its chunks exclude each other.** A claim on
  `16` (the spec, while it is being chunked or held whole) and
  a claim on `16.3` by someone else refuse each other.
- **The owner claims many, a contributor one.** The owner
  (`scripts/owner.mjs`: an untracked `.owner` at the primary
  checkout, owner mode not switched off in
  `.nexus/local.json`) claims as `privileged_agent_session`
  and may claim a group in one call. A contributor claims one
  id per call, except a **package**: `--package` claims a
  heads-down session's batch of chunks in one call, built on
  one branch and landed as one pull request. Every multi-id
  claim is all or nothing.
- **A crash never releases.** A session that dies keeps its
  claims until they go stale; its resume renews them. Only an
  explicit `release`, `prune` or `audit --release` frees a
  chunk early.

## The commands

```
node scripts/claims.mjs whoami                  # owner or contributor, who, session, host
node scripts/claims.mjs list                    # every claim: state live|stale|pr|held, mine?
node scripts/claims.mjs free 16.3               # may I claim it? (exit 1 when not)
node scripts/claims.mjs claim 16.3              # claim (all or nothing); --base <b>, --force (owner)
node scripts/claims.mjs claim 16.3 16.4 --package   # a contributor's heads-down package
node scripts/claims.mjs renew                   # restart the clock on this session's claims
node scripts/claims.mjs pr 16.3 42              # attach the PR: the claim now lives until it closes
node scripts/claims.mjs release 16.3            # this session's; --force (owner) for anyone's
node scripts/claims.mjs prune                   # drop claims whose PR merged or closed
node scripts/claims.mjs assign 16 --to "Sam Lee" --login samlee   # owner: hold for a person
node scripts/claims.mjs audit [--release]       # why each claim may go: archived | gone | stale | pr-closed
```

Every command takes `--session <id>` and `--json`. With
`--json` it prints one JSON value on stdout (an error prints
`{ "ok": false, "error": "…" }`), which is what the GUI reads.
Exit codes: 0 done, 1 refused (nothing written), 2 usage.

`audit` reads each claim against its base's plan on origin: a
chunk with an archive line, or a close waiting in
`plan/pending/`, is `archived`; a chunk no spec lists is
`gone`; a spec claim is gone only when its file is, and a bare
number no spec holds yet (`/plot`'s reservation of a new spec's
number) only once it is also stale. With
`--release` it drops what may go that is this session's, this
machine's owner claims, or (archived, gone, pr-closed)
anyone's. A held claim is never `stale`.

| Variable | Meaning |
|---|---|
| `NEXUS_SESSION` | This session's claims id (the GUI sets one per session). |
| `NEXUS_CONTRIBUTOR=1` | Run as a contributor in the owner's checkout (rehearse the PR path). |
| `NEXUS_GH_LOGIN` | This machine's GitHub login; else asked of `gh`. |
| `NEXUS_CLAIMS_REMOTE` | The remote holding `claims` (default `origin`). |
| `NEXUS_MAIN_BRANCH` | The branch the audit reads by default (default `main`). |
| `NEXUS_CLAIMS_BOARD` | A workflow file to dispatch after any write (a board that redraws the claims as a chart); off when unset. |

## Where the loop calls it

- **Pick, then claim.** The build verb's first write is the
  claim. A refused claim means someone has it: pick the next
  ready chunk. Readers skip chunks claimed live by anyone
  else.
- **Renew** at each beat of a long session (`/heads-down`
  between chunks), so a live session never looks stale.
- **Close.** The owner releases after landing; a contributor
  runs `pr <id> <n>` once the PR is open, and the claim ends
  when `prune` sees it merge (a CI job on PR close can run
  `prune`).
- **Tidy.** `audit --release` clears what is done; run it
  before picking when the list looks crowded.

## Adoption checklist

- [ ] The four scripts copied; `node scripts/claims.mjs whoami`
      prints owner on the owner's checkout.
- [ ] `.owner` and `.nexus/` are gitignored; the owner's
      checkout has `.owner`.
- [ ] A ruleset on `claims`: no force push, no deletion.
- [ ] Any pre-push hook skips the `claims` ref
      (`scripts/git/push-policy.mjs` drops it; see
      [`owner-mode.md`](../playbooks/owner-mode.md)).
- [ ] The build skill claims before its first write, renews,
      and releases (owner) or attaches the PR (contributor).

## See also

- [`../playbooks/owner-mode.md`](../playbooks/owner-mode.md):
  how the owner's work and a contributor's land, and the
  rulesets on main and `claims`.
- [`lanes.md`](./lanes.md): parallel sessions on one branch;
  claims are its board.
- [`sessions.md`](./sessions.md): many sessions on one
  machine: the notice board, the live ledger, worktrees and
  the reboot train.
- [`../concepts/plan-shape.md`](../concepts/plan-shape.md):
  chunks, and the pending files a branch closes them with.
