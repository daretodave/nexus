# Concepts: reboot train

> What this harness's own session calls restore when a loop
> comes back — by id, by list, by fork — against what the
> reboot train's ledger restores by file. One row per ledger
> field, naming the gap plainly where there is one.

---

`/rebooting`, `/reboot-ready` and `/reboot-resume` exist
because a restart used to lose every running loop. Each
session parks its state into a ledger file
(`.nexus/sessions/<id>.json`, `scripts/ledger.mjs`) before it
stops, and a fresh session reads the file back
(`plan/76-native-session-primitives.md`). This harness — the
Claude Agent SDK surface the reboot skills already name
(`TaskStop`, `ScheduleWakeup`, `CronList`/`CronDelete`,
`Monitor`, the GUI's SDK resume) — also offers a few
session-shaped calls of its own. This doc compares the two,
field by field, and says which one stays a file.

## The runtime's own calls, briefly

- **`ListAgents`** lists every agent reachable right now:
  in-process subagents this session spawned, teammates, other
  local sessions, this account's cloud and Remote Control
  sessions. A live roster, not a history — a crashed or
  finished session with nothing left running simply isn't a
  row.
- **`Agent` with `subagent_type: "fork"`** forks this session,
  inheriting its whole conversation. `ListAgents` calls a fork
  "in-process" — tied to the parent process. Nothing says a
  fork outlives the parent, or is reachable once it's gone.
- **`SendMessage` to a name** resumes that agent from its own
  transcript — the nearest thing here to resume-by-id. It
  restores conversational memory, but only for an agent
  `ListAgents` still lists; a session that has fully
  disappeared (a crash with no listed survivor) "cannot be
  looked up" at all. It also only reaches session-to-session,
  never into a subagent from outside its own parent.
- **Delete** has no standalone call. `TaskStop` stops a
  *running* task or agent by id or name — a kill, not an
  archival delete — and only reaches what's still running.
- **Context-window usage by category** has no call here at
  all. This comparison found none, and the ledger has no
  substitute for it either — it's simply not a thing a file
  can report back.
- **`CronCreate`/`CronList`/`CronDelete`** schedule this
  session's own recurring re-firing — explicitly session-only:
  "nothing is written to disk, and the job is gone when Claude
  exits," `durable` has no effect, and jobs expire after 30
  days. The opposite of durable: a crash or restart takes it
  with it. `ScheduleWakeup` (a dynamic `/loop`'s self-pacing)
  is the same, one session's own wakeup, nothing more.
  `RemoteTrigger`'s cloud scheduled tasks are the durable
  sibling — stored server-side, each fire a tracked run session
  `list_runs`/`get_run_log` can read back — but that's a
  different product (cloud-scheduled), not this loop's
  in-session reboot train.
- **`Monitor`** streams a running script's events; like
  `TaskStop`, it's live process control, not resume. Neither
  restores anything after a crash.

## The comparison

One row per field `/reboot-ready`'s Step 4 writes
(`scripts/ledger.mjs`'s `fresh()` carries the session's base
shape; `kind`, `work`, `children`, `done` and `left` are set
by the same step on top of it).

| Ledger field | What it holds | Native call? | Condition |
|---|---|---|---|
| `loop` | the exact command/prompt that started this loop; re-run verbatim on resume minus the chunks already `done` | no | a still-listed agent's own transcript (`SendMessage`) carries this informally, in the model's memory, never as a replayable field; gone once the agent drops off `ListAgents` |
| `kind` | the loop's shape: `heads-down`, dynamic `/loop`, `/loop <interval>`, or a single `/next` | no | nothing here models this category at all |
| `chunk` | the plan chunk in flight | no | plan state; no runtime concept of a chunk exists |
| `step` | where in the chunk (`orient`, `building`, `review`, `gate`, `closing`, `landing`) | no | same as `chunk` |
| `next_step` | the concrete next action for a fresh session | no | same caveat as `loop`: a still-listed agent remembers it informally; nothing structured survives disappearance |
| `notes` | what only this session knows: a decision, an owner answer, a half-applied step | no | same caveat as `loop` |
| `work` | each worktree's path, branch, HEAD, base, ahead count, pushed state, uncommitted files, stash snapshot, mid-git state | no | git state; no primitive here models a worktree at all |
| `children` | this session's subagents/Workflows: id, label, state, what each covered | partial | `ListAgents` lists a live one and `TaskStop` can stop it, but only same process, same session, while both are still running; nothing lists or restores one after the parent ends |
| `workflow` | the active Workflow's run id, script path, phase, transcript dir | no | outside this chunk's researched primitives; the skill's own `resumeFromRunId` fallback (`skills/reboot-resume.md` Step 2.4) needs the same Claude session and its own cache, not a crash-durable call |
| `claimed` | chunk ids this session holds (`scripts/claims.mjs`) | no | git-branch state; no runtime concept of a claim exists |
| `done` | chunk ids finished so far | no | plan state |
| `left` | chunk ids still to do | no | plan state |

## Two findings

**(a) Nothing here is durable across a crash**, except
`RemoteTrigger`'s cloud scheduled tasks — and those are a
different product (a server-side cron that starts a fresh run
session), not this loop's in-session reboot train. Every other
primitive above — `ListAgents`, a fork, `SendMessage`,
`TaskStop`, `CronCreate`, `ScheduleWakeup`, `Monitor` — is
scoped to a process or a session that is still running. A
crash that takes the process with it takes all of them too.
That is why the ledger is a *file*: it is the one thing in
this comparison a crash cannot touch.

**(b) Worktrees, claims and plan state have no native model
at all** — not partially, not under some condition. `work`,
`claimed`, `done`, `left`, `chunk` and `step` are this kit's
own state, kept in git and in `scripts/ledger.mjs`'s own file;
the runtime has no call that even names a worktree or a claim,
let alone restores one. This answers the spec's own open
question: a native resume does not, and structurally cannot,
carry a session's worktree or claims id, because those were
never session state to begin with — they're this kit's.

A pattern is named here, never a product: nothing above
recommends building toward a native call that doesn't exist
yet. It's a report of what exists today, so the reboot skills
can say, truthfully, why claims and worktrees stay in a file.

## See also

- [`architecture.md`](./architecture.md) — the layers a tick
  passes through; the ledger is this loop's own durable memory
  (Layer 1, "State in files, not memory").
- [`../skills/rebooting.md`](../skills/rebooting.md),
  [`../skills/reboot-ready.md`](../skills/reboot-ready.md),
  [`../skills/reboot-resume.md`](../skills/reboot-resume.md) —
  the reboot train this comparison backs.
- [`../plan/ARCHIVE.md`](../plan/ARCHIVE.md) — spec 76's line,
  the spec that asked for this comparison.
