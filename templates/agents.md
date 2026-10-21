# agents.md

> The entry point for any AI agent landing in this repo cold
> (Claude Code, Cursor, Aider, anything else). Read this top to
> bottom; it's short, and the rules at the top are non-negotiable.

## Standing rules

These apply to every command, every skill, every session. They
are not optional. The skill files repeat them; this is the
canonical source.

### 1. Land per owner mode. Always committed, always pushed.

Shipped work that isn't committed is rolled-back work waiting to
happen. Shipped work that's committed but not pushed is invisible
to <HOSTING_PROVIDER> and to future loop ticks. The autonomous
loop assumes `origin/<DEFAULT_BRANCH>` is the source of truth.

How work lands depends on the checkout, never on the skill
(`node scripts/claims.mjs whoami` prints which):

- **Owner mode** — an untracked `.owner` file at the checkout
  root, not switched off in `.nexus/local.json`
  (`scripts/owner.mjs`). Every shipping skill ends with `git
  commit` **immediately followed by** `git push origin
  <DEFAULT_BRANCH>`. A rejected push: rebase your own unpushed
  commits onto `origin/<DEFAULT_BRANCH>`, rerun the gate, push
  again. The owner settles `plan/pending/`
  (`node scripts/plan/settle.mjs`).
- **Contributor mode** — no `.owner`; what every fresh clone
  gets. Never push `<DEFAULT_BRANCH>`. Each chunk lands on its
  own branch `next/<id>`, pushed, as a pull request (a
  `/heads-down` package: one `pkg/<slug>` branch and one pull
  request; a plot: `plot/<slug>`). Stack at
  most two deep (a branch off an open PR's branch, its PR onto
  that branch). Review fixes are new commits: never amend or
  force-push a pushed branch. Plan changes go only through
  `plan/pending/<id>.md`, never the shared plan files.

A skill's "push `<DEFAULT_BRANCH>`" step means "land per this
rule". The pre-push hook (`scripts/git/push-policy.mjs`, armed
by `node scripts/install-hooks.mjs`) refuses a push to
`<DEFAULT_BRANCH>` outside owner mode: a leg trip, not a lock.
The lock is the host's branch ruleset; see
`nexus/playbooks/owner-mode.md`. Never commit `.owner`. Either
way: no commits unpushed between ticks, no dirty tree at turn
end.

### 2. No `Co-Authored-By:` trailers. No emojis.

Plain commit message bodies. **Never** add a `Co-Authored-By:`
line, a "Generated with…" footer, or any emoji — in commits,
in code, in content, in design notes. If your harness injects
one of these by default (some Claude Code environments add a
`Co-Authored-By:` trailer automatically), strip it before every
commit — this rule overrides that convention in this repo.

### 3. The verify gate is non-negotiable.

`pnpm verify` runs **before** every commit:

```
typecheck → test:run → data:validate → build → e2e
```

The canonical composition, with two variance rules: `data:validate`
runs iff the project has a data layer (GitHub-as-DB, DB
migrations, etc.) — drop the leg otherwise; `lint` is an
optional leg, wired into `verify` or left as a standalone
script, per stack. See `nexus/customization/verify-gate.md` for
stack-specific compositions.

Every check is a hard gate. **Hermetic e2e is part of the gate.**
A red e2e is a blocked push. Never `--no-verify`. Fix the root
cause.

**Never run the gate in the background.** Run every leg as a
foreground, blocking call and wait for it. `run_in_background:
true` on the gate (or any leg) is forbidden — in a
non-interactive run (cloud `/march`) the agent SDK ends the turn
while the gate is still alive, the background-task resume
notification is unreliable, and the process cannot exit because
the gate's children (dev server, headless browser, DB
containers) keep the tree alive. That is the cloud post-result
exit hang. If the gate has outgrown a single foreground budget,
**shrink the gate, do not background it** — split it into
sequential foreground legs and move any O(content) breadth
(per-record crawls) off the per-commit path onto a nightly job.
A page template is not more correct for being rendered 2,700
times instead of 30; prove archetypes per commit, prove the
exhaustive set nightly.

### 4. The deploy gate runs **after** every push.

`pnpm deploy:check` polls <HOSTING_PROVIDER> for the deploy
matching the just-pushed commit. Prints state transitions. Exits
non-zero on `error` / `failed` / timeout.

Every shipping skill calls it as Step 12 (or equivalent). A red
deploy is treated identically to a red verify gate: read the log,
patch, push again. Repeated failures escalate per failure modes.

### 5. No `--no-verify`. No force-push. No destructive resets.

If a hook fails, fix the underlying issue. If `git pull
--ff-only` diverges, rebase only your own unpushed commits
(`git pull --rebase`), rerun the gate, and retry; anything else,
stop and report. Tests alongside code, never "add tests later".

### 6. <PROJECT-SPECIFIC RULE — e.g. site name lowercase>

<Customize per the project. For thock: site name is lowercase
"thock" always. For tickpedia: image alt text required on every
image. Etc.>

### 7. Content stays in <CONTENT_LOCATION>. Data stays in
       <DATA_LOCATION>.

No hardcoded copy in components. No hardcoded data records.

### 8. Blocked is loud.

Before stopping on any failure-mode condition, run
`node scripts/notify.mjs --title "<skill>: stopped"
--body "<reason>" --priority high` (best-effort — a failed
notification never becomes its own stop). Applies to every
skill; see `nexus/playbooks/hands-off.md`.

### 9. Ask before the first write, or not at all.

A skill run by a person may ask (`AskUserQuestion`) only before
its first write: the claim, a file, a commit. All its questions
go in that one batch (`nexus/concepts/asking-well.md`). Once it
has written, it decides and ships. Under a loop (`/loop`, a
cloud tick, `/heads-down`) it never asks: it takes the default
and logs each one it took (the commit body, the PR description,
the close). A question that outlives the run (a product call, a
taste call, a default the owner should confirm) goes to the
`/oversight` queue as a `[needs-user-call]` row in
`plan/AUDIT.md` (a contributor, who never edits shared plan
files, lists it in the pull request description for the owner
to queue), and the work continues. `/oversight` remains
the skill that asks anything, any time.

---

## Project

**<PROJECT>** — <one-line description>. Lives at <HOSTING_URL>.

The product spec is `spec.md` at the repo root. Read it once.

## Repo shape

```
<your app paths>     <one-line per top-level group>
plan/                Roadmap, specs + chunks, archive, audit findings.
skills/              Source-of-truth skill files invoked by slash commands.
.claude/             Claude Code config — slash commands, sub-agents,
                     settings.json (permission allowlist), hooks/ (guard).
design/              Design exports.
data/                Structured data, if applicable.
```

## How work happens

This project is **driven autonomously** by a small set of skills.
You don't normally write code by manually editing files; you
invoke a skill that does the right thing end-to-end.

### Skills (the verbs)

| Skill | Source of truth | What it does |
|---|---|---|
| `ship-a-chunk` | `skills/ship-a-chunk.md` | Ship one chunk of the plan and close it. |
| `ship-data` | `skills/ship-data.md` | Ship one data record (if data layer exists). |
| `ship-migration` | `skills/ship-migration.md` | Ship one DB migration (if Structured data: pure-db / hybrid-with-managed-postgres). |
| `ship-asset` | `skills/ship-asset.md` | Ship one brand asset (if Surface: site/hybrid and branding is in scope). |
| `plan-a-spec` | `skills/plan-a-spec.md` | Write, refine or chunk one spec, no code. |
| `iterate` | `skills/iterate.md` | Audit + ship one improvement. |
| `critique` | `skills/critique.md` | External-observer pass; writes to `CRITIQUE.md`. |
| `triage` | `skills/triage.md` | Issue review; routes to backlogs. |
| `moderate` | `skills/moderate.md` | Drain the moderation queues, one item per tick (if the project has UGC). |
| `expand` | `skills/expand.md` | Plan-expansion pass; proposes candidates (future specs) from accumulated signals. Posture-controlled (bold/strict/autonomous). |
| `march` | `skills/march.md` | Outer dispatcher: triage → critique → chunk → data → expand → iterate. |
| `oversight` | `skills/oversight.md` | **User-in-the-loop.** The general-purpose skill that asks anything (`bootstrap` carries the one narrow provisioning exception). Promotes candidates into specs. |
| `jot` | `skills/jot.md` | User quickfire → one row in `CRITIQUE.md`, seconds flat. |
| `digest` | `skills/digest.md` | The night shift — daily briefing to `DIGEST.md` (if the cloud loop is adopted). |
| `bootstrap` | `skills/bootstrap.md` | Authorized executor — provisions external services (opt-in; see `customization/bootstrap-automation.md`). |

### Invocation

```
/ship-a-chunk                # ship the next ready chunk
/ship-data                   # ship next data backlog row
/ship-migration              # ship next DB migration
/ship-asset                  # ship one brand asset
/plan-a-spec                 # chunk or refine the next spec
/iterate                     # audit + ship one improvement
/critique                    # external-observer pass
/triage                      # review unlabeled issues
/moderate                    # drain the moderation queues
/expand                      # propose new candidates (future specs)
/march                       # do the right thing
/oversight                   # course-correct
/jot                         # quickfire a note to CRITIQUE.md
/digest                      # morning briefing (cloud loop)
/bootstrap                   # provision an external service
/loop 30m /march             # autonomous loop
```

### Sub-agents

| Agent | Use for |
|---|---|
| `scout` | Open-web research with citations. |
| `reader` | Fresh-eyes site observer. |
| `brander` | Asset rendering — only present when `/ship-asset` is adopted. |
| <DOMAIN_SPECIALIST> | <when> |

The main agent writes wiring, code, decisions. Spawn sub-agents
aggressively for everything else.

---

## Operational secrets

The autonomous loop is hermetic for shipping; the awareness layer
needs tokens. Both live in `.env` (gitignored). Configure once
per machine.

### `<PROVIDER_AUTH_TOKEN>` — deploy gate

Used by `pnpm deploy:check` to read deploy state.

```
<PROVIDER_AUTH_TOKEN>=<token-format-prefix>...
```

Get one: <provider's token URL>

If missing, `pnpm deploy:check` exits 3 with a clear error.

### `GH_TOKEN` — issue triage

Used by `/triage` to review and label open GitHub issues. The
`gh` CLI auto-reads `GH_TOKEN`.

```
GH_TOKEN=github_pat_...
GH_REPO=<REPO_SLUG>
```

Get one: https://github.com/settings/tokens

### `NOTIFY_NTFY_TOPIC` / `NOTIFY_WEBHOOK_URL` — pager (optional)

Used by `scripts/notify.mjs` (standing rule 8). Either works;
ntfy is the zero-setup path. Optional at Level 0–2; required
before an unattended window per the hands-off pre-flight.

### No other secrets

If a feature ever requires more, the relevant skill stops at its
failure-mode condition rather than inventing a placeholder.

---

## Where to look

| If you need… | Read |
|---|---|
| What <PROJECT> is | `spec.md` |
| Stack, conventions, defaults | `plan/bearings.md` |
| What ships next | `plan/README.md` (lanes + specs; the first ready chunk) |
| What a chunk must do | `plan/<NN>-<slug>.md` (Design, Acceptance, Chunks) |
| What already shipped | `plan/ARCHIVE.md` |
| Which kit version | `plan/nexus.lock` |
| How a skill works | `skills/<skill>.md` |
| What a sub-agent does | `.claude/agents/<name>.md` |
| Latest weaknesses | `plan/AUDIT.md`, `data/AUDIT.md` |
| Backlog of pending data work | `data/BACKLOG.md` |
| Critique queue | `plan/CRITIQUE.md` |
