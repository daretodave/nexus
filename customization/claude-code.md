# Customization: the Claude Code layer

> nexus is deliberately client-agnostic — `agents.md` and
> `skills/*.md` are readable by any capable agent. This doc is
> the opt-in layer for projects that run the loop on **Claude
> Code specifically**: permission pre-approval, hook-enforced
> hard rules, notifications, model routing, and the pointer
> file that makes Claude Code auto-load the rule book. Adopt
> it and the standing rules stop being promises the agent
> makes and start being walls the harness enforces.

The kit's hard rules — no `--no-verify`, no force-push, no
destructive resets, never background the gate, commit-and-push
atomic — are prose. Prose enforcement fails in exactly the
situations that matter: hour 40 of an unattended run, a
context-compacted session, a model having a bad tick. Claude
Code has three native mechanisms that turn each rule into a
mechanical gate. None of them require changing a single skill
file.

---

## When to adopt this

- You run the loop in Claude Code (local `/loop /march`, cloud
  `claude-code-action`, or headless `claude -p`).
- You want Level 3–4 of the intervention spectrum — the
  unattended levels — with mechanical guarantees instead of
  model discipline.
- You're tired of permission prompts interrupting Level 0–2
  sessions.

When not:

- You drive the loop from Cursor / Aider / a raw SDK. The
  skills still work; this layer doesn't apply. Enforce the
  equivalent rules with git hooks + branch protection instead.

---

## The three enforcement altitudes

Every standing rule should exist at the highest altitude that
can hold it:

| Altitude | Mechanism | Catches |
|---|---|---|
| Prose | `agents.md`, `skills/*.md` | The 99% case — the agent follows the recipe. |
| Harness | `.claude/settings.json` permissions + hooks | The 1% case — a confused or compacted agent tries the forbidden thing. |
| Provider | Branch protection, PAT scopes, read-only DSNs | The 0.1% case — anything local goes wrong at once. |

Mapping the standing rules to their backstops:

| Standing rule | Prose | Harness backstop | Provider backstop |
|---|---|---|---|
| No `--no-verify` | every skill §Hard rules | `guard.mjs` denies the string | required CI check on the branch |
| No force-push | every skill §Hard rules | `guard.mjs` + permissions deny | branch protection: no force pushes |
| No destructive resets | every skill §Hard rules | `guard.mjs` denies `reset --hard`, `clean -fd` | reflog + branch protection |
| Never background the gate | `agents.md` §3 | `guard.mjs` denies `run_in_background` on gate commands | CI re-runs the gate anyway |
| Commit + push atomic | every skill §Procedure | Stop hook warns on dirty tree / unpushed commits | — |
| Loop stops are surfaced | skills §Failure modes | Stop/Notification hook fires `notify.mjs` | cloud crash issue (`march.yml`) |

The rest of this doc walks each harness mechanism.

---

## 1. Permissions — `.claude/settings.json`

Without a permission allowlist, every `git push`, `pnpm
verify`, and `gh issue list` waits for a human "yes". Locally
that's friction; in an unattended window it's a wall the loop
hits on tick one. The template at
[`templates/claude/settings.json`](../templates/claude/settings.json)
pre-approves exactly the commands the skills run and
pre-denies the ones they must never run.

The shape (see the template for the full list):

```json
{
  "permissions": {
    "allow": [
      "Bash(git status:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push origin <DEFAULT_BRANCH>)",
      "Bash(pnpm verify:*)",
      "Bash(pnpm deploy:check:*)",
      "Bash(gh issue list:*)",
      "Bash(node scripts/loop-issue.mjs:*)"
    ],
    "deny": [
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git commit --no-verify:*)",
      "Bash(git commit -n:*)",
      "Bash(git reset --hard:*)",
      "Bash(git clean -fd:*)",
      "Read(.env)",
      "Read(.env.*)"
    ]
  }
}
```

Rules that matter:

1. **Allow narrowly, deny broadly.** `Bash(git push origin
   <DEFAULT_BRANCH>)` — not `Bash(git push:*)`. The loop only
   ever pushes one branch; approve exactly that.
2. **Deny rules beat allow rules.** `git commit:*` is allowed;
   `git commit --no-verify:*` is denied. The deny wins. This
   pairing is the whole trick.
3. **`Read(.env)` is denied.** The skills that need env values
   extract single keys via `awk` / the scripts' own `.env`
   loaders. The agent never needs the whole secrets file in
   context, so deny it — one less way for a token to leak into
   a transcript or a commit.
4. **Anything not matched still prompts.** That's the correct
   default. Don't reach for `bypassPermissions` /
   `--dangerously-skip-permissions` to make prompts go away on
   a machine that holds real tokens; the allowlist is the
   sanctioned path. Reserve bypass modes for throwaway
   containers.
5. **File placement.** `.claude/settings.json` is shared
   (commit it — it IS methodology). Per-machine overrides go
   in `.claude/settings.local.json` (gitignored by Claude Code
   automatically).
6. **The compound-command gotcha.** Every operation in a
   pipe / `&&` / `||` chain needs its own allow rule. The
   skills' canonical snippet `gh issue list … || echo 0`
   prompts even with `gh issue list:*` allowed, unless
   `echo:*` is allowed too — the harness reports "this
   command contains multiple operations." The template
   allowlist carries the utility set (`echo`, `cat`, `wc`,
   `mktemp`, …) for exactly this reason; when a prompt
   surprises you on an allowlisted command, look for the
   un-allowed half of the chain.

**The cloud posture is different.** On a CI runner there is
no human to approve, so default mode doesn't degrade to
prompts — it degrades to a silently starved tick that reads
everything and ships nothing (nexus's own first two cloud
ticks did exactly this). The workflow template therefore runs
`permissionMode: bypassPermissions`: the runner is the
disposable, repo-scoped container that hard rule 2 carves
out, the `GITHUB_TOKEN` bounds the blast radius, and the
guard hooks run in **every** permission mode — the hard rules
stay walls even with permissions bypassed. Never copy that
mode back to a machine that holds real secrets; locally, the
allowlist is the sanctioned path.

Expect to grow the allowlist during Level 0–2 (the attended
levels): each time a prompt interrupts you for a command the
skills legitimately run, add that command — narrowly — to
`allow`. By Level 3 the prompts should be zero. A permission
prompt during an unattended window is a wall; audit for them
before walking away (see the pre-flight in
[`../playbooks/hands-off.md`](../playbooks/hands-off.md)).

---

## 2. Hooks — mechanical hard rules

Hooks are commands Claude Code runs at fixed lifecycle points.
Two of them carry this layer. The template ships one script —
[`templates/claude/hooks/guard.mjs`](../templates/claude/hooks/guard.mjs)
— that serves every hook event via a mode argument. Wiring
(inside `settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/guard.mjs pre-bash" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/guard.mjs stop" }
        ]
      }
    ]
  }
}
```

### `pre-bash` — the forbidden-command wall

Runs before every Bash tool call. Reads the tool input as JSON
on stdin, checks the command string, and **exits 2 to block**
(stderr goes back to the agent as feedback) when it sees:

| Pattern | Standing rule it enforces |
|---|---|
| `--no-verify`, `-n` on commit | The verify gate is non-negotiable. |
| `push --force`, `push -f` (incl. `--force-with-lease`) | No force-push. |
| `reset --hard`, `clean -fd`, `checkout -- .`, `branch -D` on `<DEFAULT_BRANCH>` | No destructive resets. |
| `run_in_background: true` where the command matches `verify`, `deploy:check`, or `e2e` | Never background the gate — this is the post-result exit hang (see [`../playbooks/cloud-loop.md`](../playbooks/cloud-loop.md)). |
| `Co-Authored-By` or an emoji inside a `git commit -m` body | Plain commit bodies. (`Cloud-Run:` trailers pass — the one carve-out.) |

The block message tells the agent *why* and what to do
instead, so a blocked call self-corrects rather than looping:

```
guard: git push --force is forbidden by agents.md standing
rule 5. If the push was rejected, run git pull --ff-only and
re-apply; if history is genuinely wrong, stop and file
[needs-user-call] per your skill's failure modes.
```

### `stop` — the atomic-act check

Runs when the agent finishes a turn. Checks `git status
--porcelain` and `git rev-list @{u}..HEAD`. If the tree is
dirty or commits are unpushed, it reports — because a tick
that ends dirty violates "commit and push as a single atomic
act" and the next tick's `git pull --ff-only` will trip on it.

Default behavior is **warn + notify** (fires `notify.mjs`,
exits 0): safe in every context, including `/oversight`
sessions and plan-mode chats where stopping dirty is fine.
Set `NEXUS_STRICT_STOP=1` in the loop environment to upgrade
it to a hard block (exit 2 sends the agent back to finish the
commit+push). Strict mode belongs in unattended windows only;
leave it off for interactive work.

### What hooks are not

Hooks don't replace the skills' own discipline — the agent
should never *reach* the wall. A `guard.mjs` block firing
during a run is itself a finding: note it in the commit body
or `plan/AUDIT.md`, because it means prose enforcement failed
somewhere upstream.

---

## 3. Notifications — `scripts/notify.mjs`

The kit's failure story is "stop cleanly and write it down."
For unattended runs that's necessary but not sufficient —
**blocked must not mean silently blocked.** The template at
[`templates/scripts/notify.mjs`](../templates/scripts/notify.mjs)
is a zero-dependency pusher:

```bash
node scripts/notify.mjs --title "march: stopped" \
  --body "verify failed 3x on same root cause (phase 12)" \
  --priority high
```

It reads `.env` for one of:

| Env var | Channel |
|---|---|
| `NOTIFY_NTFY_TOPIC` | [ntfy.sh](https://ntfy.sh) — free, no signup; subscribe on your phone to `ntfy.sh/<topic>`. Treat the topic name as a secret. |
| `NOTIFY_WEBHOOK_URL` | Any generic JSON webhook (Slack incoming, Discord, your own endpoint). |

Neither set → prints a one-liner and exits 0. **Always exits
0** — notification is best-effort and must never become a new
failure mode.

Where it fires:

1. **The Stop hook** (above) — dirty-tree / unpushed warnings.
2. **Skill failure modes** — the convention is one line added
   to `agents.md`: *"Before stopping on any failure mode, run
   `node scripts/notify.mjs` with the stop reason —
   best-effort, never blocking."* One rule, every skill
   inherits it.
3. **The cloud loop** — `march.yml`'s crash step already opens
   a GitHub issue; subscribe to repo notifications, or add a
   notify step next to it (the template shows it commented).

---

## 4. The `CLAUDE.md` pointer

Claude Code auto-loads `CLAUDE.md` into context. It does not
auto-load `agents.md` — the kit's rule book — which means a
fresh session only finds the standing rules if something tells
it to look. Ship the two-line pointer
([`templates/claude/CLAUDE.md`](../templates/claude/CLAUDE.md)):

```markdown
Read `agents.md` before anything else — it is the rule book
for this repo and its standing rules are non-negotiable.
Skills live in `skills/`; state lives in `plan/`.
```

Keep `agents.md` canonical (client-agnostic); keep `CLAUDE.md`
a pointer. Don't duplicate rules into it — duplicated rules
drift.

---

## 5. Model routing

Not every verb needs the same model. The dispatch tick of
`/march` is a classification problem; shipping a phase is not.
Routing levers, in order of usefulness:

| Where | Lever | Use for |
|---|---|---|
| Cloud loop | `claude_args: --model <id>` (CLI-flag string, not JSON) in `march.yml` | The whole cloud tick. Default in the template: `claude-sonnet-5` — strong enough to ship phases, cheap enough to tick 7x/day. |
| Local session | `/model` | Whatever you're driving by hand. |
| Sub-agents | `model:` frontmatter in `.claude/agents/<name>.md` | Downshift mechanical specialists (a formatting-only `copy-editor` runs fine on a small model); keep `scout`/`reader` on the session default — observation quality is the product. |

Guidance, not law:

- **Dispatch + triage are cheap verbs.** They read state and
  classify. Any current model handles them.
- **`ship-a-phase` earns the strongest model you can afford.**
  A bad phase costs more to unwind than the tokens saved.
- **Upgrade the cloud model only after measuring.** Run a week
  on the default, read your provider's usage page, then decide
  whether the quality delta is worth it. The cost table in
  [`../playbooks/cloud-loop.md`](../playbooks/cloud-loop.md)
  has current numbers.
- Model ids age. Check `/model` (or the provider docs) rather
  than trusting any id you find hardcoded in a doc — including
  this one.
- **Never write `claude_args` as a JSON object.** A real
  incident on this repo's own cloud loop found the JSON form
  (`{"model": "..."}`) silently drops `permissionMode` on the
  way to the SDK session — the model applies, the permission
  mode stays `default`. Use the CLI-flag string form instead
  (see `.github/workflows/march.yml`'s `claude_args: >-` block).

---

## 6. MCP servers — the reader's browser

`reader` (the `/critique` observer) prefers the Chrome MCP
(`claude-in-chrome`) — Path A in its skill file — and falls
back to `WebFetch` (Path B) when the browser isn't available.
Two consequences:

1. **Locally**, install/enable the Chrome extension once and
   Path A just works. No `.mcp.json` needed for the default
   setup.
2. **In the cloud**, there is no Chrome MCP on the runner.
   Path B still works — that's what makes the headless
   critique in the hands-off playbook possible. Findings from
   Path B carry `source: web-fetch` so you can tell the
   passes apart in `plan/CRITIQUE.md`.

If your project adds other MCP servers (a DB inspector, a
design tool), scope them in `.mcp.json` at the repo root and
grant them to specific sub-agents via their `tools:`
frontmatter — not to the main loop wholesale.

---

## 7. Native skills packaging (optional)

Claude Code also supports `.claude/skills/<name>/SKILL.md`
with auto-discovery. The kit deliberately keeps its source of
truth in `skills/*.md` + thin `.claude/commands/*.md` pointers
so that non-Claude clients can follow the same files. If you
want native packaging too, add a third doorway — a SKILL.md
whose body is one line, "Read `skills/<verb>.md` end to end
and follow it" — and set `disable-model-invocation: true` in
its frontmatter for shipping verbs (the loop should invoke
skills because `/march` dispatched them, not because the model
felt like it).

Don't move the procedure text into SKILL.md. One source of
truth; every doorway points at it.

---

## 8. Headless — the third runtime

Between "my laptop with `/loop`" and "GitHub Actions" there's
a third place the loop can live: any machine with a scheduler.

```bash
claude -p "/march" --permission-mode acceptEdits
```

- The permission allowlist (§1) and hooks (§2) apply the same
  as interactive — this is why the allowlist matters more than
  any bypass flag.
- Schedule it with Task Scheduler (Windows), launchd (macOS),
  or cron (Linux). Same cadence guidance as the cloud loop:
  every 2h is plenty; serialize runs (don't let tick N+1 start
  while N lives — a simple lockfile in the wrapper script
  does it).
- Log stdout to a file per tick; the transcript is your only
  view into a headless run. Point `notify.mjs` (§3) at your
  phone before trusting it overnight.
- Prefer the cloud loop when the repo is public and the gates
  are hermetic — Actions gives you logs, isolation, and the
  crash-issue safety net for free. Headless-on-a-spare-machine
  wins when the verify gate needs local resources (GPU, big
  DB fixtures, licensed tooling).

---

## 9. Checkpoints and `/rewind`

Claude Code checkpoints file states during a session; `/rewind`
restores them. Two rules keep it from colliding with the
methodology:

1. **Git is the rollback mechanism of record.** The loop's
   recovery procedures ([`../playbooks/recovery.md`](../playbooks/recovery.md))
   operate on commits, because commits survive session death
   and are visible to the next tick. `/rewind` is for the
   attended case — you watched a change go wrong seconds ago.
2. **Never `/rewind` across a push.** Rewinding files that
   origin already has produces exactly the divergence the
   skills stop on.

---

## Hard rules

1. **The allowlist is per-project and reviewed.** Copy the
   template, then read every line before committing it. An
   over-broad allow (`Bash(git push:*)`) quietly deletes a
   provider-level guarantee.
2. **Never `bypassPermissions` outside a disposable
   container.** The allowlist + deny list is the sanctioned
   no-prompts path.
3. **Deny rules are a backstop, not a license.** The skills
   still forbid the same things; a hook block firing is a
   finding to record, not a normal event.
4. **`notify.mjs` must never block.** Always exit 0; a dead
   notification channel must not become a new stop condition.
5. **`CLAUDE.md` stays a pointer.** Rules live in `agents.md`
   only.
6. **Hooks are committed, not local.** `guard.mjs` and the
   `hooks` block in `settings.json` are methodology, same as
   the skills. Per-machine experiments go in
   `settings.local.json`.

---

## Failure modes

1. **A hook script errors (not blocks — errors).** Claude Code
   treats a non-2 non-zero exit as a hook failure and
   continues. `guard.mjs` is dependency-free and wraps its own
   body in try/catch to make accidental failure loud in
   stderr but non-fatal. If you see repeated hook errors in a
   transcript, fix the script before the next unattended run.
2. **The allowlist is too narrow and a tick stalls on a
   prompt.** Attended: approve + add the narrow rule.
   Unattended: this is a pre-flight failure — the hands-off
   playbook's dry-run exists to catch it.
3. **`NEXUS_STRICT_STOP=1` loops the agent.** If the tree
   can't be cleaned (e.g. a gate failure left artifacts), the
   agent can't satisfy the stop hook. The guard breaks the
   cycle after 3 consecutive blocked stops in one session
   (then warns + allows). If you hit this, the underlying
   failure mode is the real bug.
4. **Model id in a config has aged out.** The provider rejects
   it; the cloud tick crashes; the crash issue fires. Fix =
   update `march.yml`. This is why ids live in one place.

---

## Adoption checklist

- [ ] `templates/claude/settings.json` copied to
      `.claude/settings.json`; every `allow` line reviewed;
      `<DEFAULT_BRANCH>` replaced.
- [ ] `templates/claude/hooks/guard.mjs` copied to
      `.claude/hooks/guard.mjs`; ran `node .claude/hooks/guard.mjs
      self-test` green.
- [ ] `templates/scripts/notify.mjs` copied to
      `scripts/notify.mjs`; `NOTIFY_NTFY_TOPIC` or
      `NOTIFY_WEBHOOK_URL` in `.env`; test ping received on
      your phone.
- [ ] `templates/claude/CLAUDE.md` copied to repo root as
      `CLAUDE.md`.
- [ ] `agents.md` gains the notify-before-stopping line
      (§3 above).
- [ ] One attended `/march` tick observed with the layer
      active: zero permission prompts, zero guard blocks.

---

## See also

- [`../playbooks/hands-off.md`](../playbooks/hands-off.md) —
  the runbook that assembles this layer into a walk-away
  window.
- [`../playbooks/recovery.md`](../playbooks/recovery.md) —
  what to do when a run went wrong anyway.
- [`../playbooks/cloud-loop.md`](../playbooks/cloud-loop.md) —
  the GitHub Actions runtime.
- [`sub-agents.md`](./sub-agents.md) — tool scoping per
  specialist.
