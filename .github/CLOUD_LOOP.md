# The cloud loop (nexus on nexus)

> Operator's guide for `workflows/march.yml` — the ouroboros.
> The kit that turns repos into self-shipping projects is
> itself a self-shipping project: four times a day, a cloud
> tick reads `plan/`, dispatches one verb, runs the verify
> gate, and pushes. This file is the 2-minute operator manual;
> the full generic story lives in
> [`playbooks/cloud-loop.md`](../playbooks/cloud-loop.md) and
> the walk-away rigging in
> [`playbooks/hands-off.md`](../playbooks/hands-off.md).

## Setup (one app install + one secret)

1. **Install the Claude Code GitHub App** on this repo:
   https://github.com/apps/claude → Install → select
   `daretodave/nexus`. The action exchanges its OIDC token for
   an app token; without the app the run dies at
   `401 — Claude Code is not installed on this repository`
   before Anthropic auth ever runs. (The kit knew this — see
   the template's setup step 1 and the bootstrap handoff; this
   manual learned it from crash issue #1.)
2. `claude setup-token` → copy the OAuth token → Repo →
   Settings → Secrets and variables → Actions → new secret
   `CLAUDE_CODE_OAUTH_TOKEN`.
3. Validate once by hand: `gh workflow run march`, watch the
   run end green, read the closing `/oversight audit` block.

That's all. `GITHUB_TOKEN` is automatic; the kit's gate needs
no other secrets (zero dependencies, no deploy provider).

## Daily operation

- **Cadence:** 02:00 / 08:00 / 14:00 / 20:00 UTC, plus manual
  `gh workflow run march` whenever curious.
- **Ceiling:** 8 cloud-shipped commits per 24h, counted by the
  `Cloud-Run:` trailer. Local commits don't count.
- **Model:** `claude-sonnet-5` (set in the workflow; ids age —
  verify against current ids before changing).
- **Pause / resume:** `gh workflow disable march` /
  `gh workflow enable march`. Do this before driving the local
  loop for a session (one writer at a time).
- **Remote steering:** file an issue — that's remote `/jot`;
  the next tick's `/triage` routes it with user-source weight.

## What a tick does

`skills/march.md` dispatch: unlabeled issues → `/triage`;
critique due → `/critique` (the dry-run adoption — it runs
fully in CI); pending phase → `/ship-a-phase`; expand due →
`/expand`; else `/iterate`. Every shipping path runs
`node scripts/verify.mjs` foreground and ends with an
`/oversight audit` briefing in the run log.

## The trailer carve-out

`agents.md` rule 2 (plain commit bodies) has exactly one
exception: cloud commits end with
`Cloud-Run: <run-url>`. It's how the ceiling distinguishes
cloud volume from local work. Nothing else — no
`Co-Authored-By`, no other trailers.

## When something breaks

- **`401 — Claude Code is not installed on this repository`**
  in the app-token exchange — the GitHub App isn't installed
  (setup step 1). Install it, `gh run rerun`, done.
- **Green run, no commit, transcript full of `This command
  requires approval`** — the permission wall: the action ran
  without `permissionMode: bypassPermissions` (or a workflow
  edit dropped it) and starved. See the `claude_args` comment
  in `workflows/march.yml` and
  [`customization/claude-code.md`](../customization/claude-code.md)
  for why bypass-on-a-disposable-runner is the sanctioned
  posture (guard hooks enforce the hard rules in every mode).
- **`Cloud march tick crashed` issue appears** — read the run
  link. One-off infra flake → `gh run rerun`. Repeated →
  disable and debug locally per
  [`playbooks/recovery.md`](../playbooks/recovery.md) §H.
- **A run wedges `in_progress`** — cancel it; if the log
  stalls right after a green gate, that's the post-result exit
  hang: the gate was backgrounded, which agents.md rule 3
  forbids. Full story in
  [`playbooks/cloud-loop.md`](../playbooks/cloud-loop.md).
- **Ticks no-op forever** — the plan may be out of `[ ]` rows
  and the queues drained (a good problem: run `/oversight`
  locally and promote candidates), or GitHub paused the cron
  after 60 days without repo activity (push anything or re-run
  manually to revive).

## Reviewing the loop's work

The commit log is the deliverable. Cloud commits carry the
run-URL trailer; each phase has a mirror issue that opened
when work started and closed on the shipping commit. The
`/oversight audit` block at the end of every run log is the
instrument panel — queues, blocked rows, flags — skimmable
from a phone.
