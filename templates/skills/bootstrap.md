# Skill: bootstrap

> **Authorized executor.** When invoked (manually, via
> `/bootstrap`, `/bootstrap <service>`, `/bootstrap with manifest`,
> or `/bootstrap rotate <service>`), you have authority to
> provision external resources (GitHub repos, hosting projects,
> database projects), write secrets to `.env` / GitHub Actions /
> hosting env vars, and trigger the first deploy. The user
> reviews the state after, not before.
>
> **AskUserQuestion IS allowed in this skill.** Bootstrap is one
> of two skills that may pause for user input mid-run (the other
> being `/oversight`). The carve-out exists because bootstrap
> collects tokens, confirms destructive-feeling actions, and
> orchestrates browser-based handoffs. Use it sparingly — the
> manifest flavor exists precisely so you can avoid most
> questions.

## 1. Purpose

`setup/00_files.md` enumerates external services the project
depends on. `setup/NN_<service>.md` runbooks document the
intent and human-only steps. **This skill is the executor**:
it brings the project from "tokens in hand" to "green deploy +
ticking cloud loop" by orchestrating provider CLIs, propagating
secrets, and pausing only on inherently human handoffs.

The full spec lives at
[`../../customization/bootstrap-automation.md`](../../customization/bootstrap-automation.md).
Read it once before this skill.

## 2. Invocation

```
/bootstrap status                # discovery + plan, read-only
/bootstrap                       # walk every gap (interactive)
/bootstrap with manifest         # use setup/bootstrap.local.json
/bootstrap <service>             # one service (e.g. /bootstrap vercel)
/bootstrap rotate <service>      # re-propagate one token
/bootstrap cloud-loop            # install workflow + tokens only
/bootstrap continue              # resume from last incomplete state
```

Bootstrap is **not** invoked under `/loop` or `/march`. It runs
on explicit user request only.

## 3. Autonomy contract

The user's standing instruction: **"give me tokens-in, deploy-
out; pause only when you genuinely need me."**

- **CLI auth missing → pause.** Print the login command; wait.
- **Token missing (non-CLI) → pause.** Print dashboard URL +
  scopes; wait for paste.
- **Resource already exists → link to it, never recreate.**
- **Action ambiguity → check the manifest, then bearings.md,
  then prompt.** Don't guess.
- **Provider API error → stop with the full error printed.**
  Don't retry blindly.
- **Handoff (DNS, OAuth approval, App install) → pause + verify
  + continue.**
- **All optional steps when the manifest doesn't decide them →
  use the documented defaults and narrate the choice.**

The only conditions that warrant stopping (not pausing) are §10.

## 4. The three phases — every invocation runs all three

### Phase 1 — Discovery (read-only)

Read state from every source:

| Source | What to read |
|---|---|
| `git remote -v` | is there a remote? what's its URL? |
| `git rev-parse --is-inside-work-tree` | is this a git repo? |
| `.env` | which keys are populated? |
| `.env.example` | which keys are expected? |
| `setup/00_files.md` | which services apply? what's each status? |
| `gh auth status` | is `gh` CLI authed? |
| `gh repo view <owner>/<repo>` | does the GitHub repo exist? |
| `gh secret list` | which Actions secrets are set? |
| `gh variable list` | which Actions variables are set? |
| `gh api /repos/<repo>/installations` | is the Claude Code App installed? |
| `vercel whoami` | is `vercel` CLI authed? |
| `vercel ls` | is there a project for this repo? |
| `vercel env ls production` | which prod env vars are set? |
| `vercel env ls preview` | which preview env vars are set? |
| `vercel env ls development` | which dev env vars are set? |
| `supabase projects list` | is there a Supabase project? |
| `.github/workflows/march.yml` | does the cloud-loop workflow exist? |
| `setup/bootstrap.local.json` | does the manifest exist? what's in it? |

Produce a **state report** of the form:

```
Bootstrap state report — <PROJECT>
═══════════════════════════════════════════
Repository:
  git repo:               yes
  default branch:         main
  GitHub remote:          <owner>/<repo>          ✓
  Claude Code App:        installed                ✓
Hosting (Vercel):
  CLI authed:             yes (<user>)
  project linked:         <project>                ✓
  region:                 pdx1
  env vars (prod):        14 / 14                  ✓
  env vars (preview):     14 / 14                  ✓
  env vars (development): 11 / 14                  PARTIAL
Database (Supabase):
  CLI authed:             yes
  project linked:         <project-id>             ✓
  region:                 us-west-1
Cloud loop:
  workflow file:          present                  ✓
  CLAUDE_CODE_OAUTH:      set                      ✓
  ACTIONS_PAT:            set                      ✓
  last run:               2026-05-12T18:00Z        ✓
───────────────────────────────────────────
Gaps to close:            1 (Vercel development env vars)
```

If invocation is `status`, stop here and return.

### Phase 2 — Plan

Diff discovery against desired state. Desired state is the
union of:

- Every row in `setup/00_files.md` whose phase is `≤ next 5
  pending phases` (or the row's status row is `OK`-expected).
- Every field in `setup/bootstrap.local.json` (manifest flavor)
  or interactive defaults (interactive flavor).
- Standing bearings (e.g., `bearings.md` says `Hosting:
  Vercel` → Vercel must exist).

For each gap, emit one action with:

- **Provider:** github / vercel / supabase / cloud-loop / ...
- **Verb:** create / link / set-secret / set-env / install-app / ...
- **Inputs:** what's needed to execute (tokens, IDs, values)
- **Verify:** the read command that confirms it worked
- **Handoff:** if the action requires a human step, what it is

Order actions by dependency:

1. GitHub repo creation / link (everything else needs it)
2. Hosting project create / link
3. Database project create / link
4. Cross-cutting secret propagation (DB URLs into hosting env vars)
5. Cloud loop install
6. First deploy verification

Print the plan as a numbered list:

```
Plan: 7 actions
───────────────────────────────────────────
[github]      1. Create repo daretodave/ember (public, no issues yet)
[vercel]      2. Create project ember, link to repo, region pdx1
[supabase]    3. Create project ember, region us-west-1
[secrets]     4. Propagate Supabase URL + service key to Vercel env (prod/preview/dev)
[secrets]     5. Propagate Anthropic OAuth to GH Actions secret
[cloud-loop]  6. Install .github/workflows/march.yml + ACTIONS_PAT secret
[verify]      7. Trigger first deploy + watch deploy gate
───────────────────────────────────────────
Pending handoffs:
  - claude setup-token output (after step 6)
  - ACTIONS_PAT fine-grained PAT (after step 6)
  - Claude Code GitHub App install (after step 1)
```

If invocation is interactive, ask:

> Proceed with this plan? [y / n / edit]

If `n`: print "ok, exiting" and stop.
If `edit`: surface which actions the user wants to drop (e.g.,
"skip cloud-loop for now") and re-plan.
If `y`: proceed to Phase 3.

In manifest flavor, the plan prints and execution begins
immediately without asking.

### Phase 3 — Execute

Walk the plan in order. For each action:

1. Narrate: print the literal CLI command or API call that's
   about to run.
2. Run it. Capture stdout + stderr.
3. If it errors: print the full output, exit with the error
   code. **Do not retry blindly.** The user re-runs the
   bootstrap after fixing the cause.
4. Verify: run the read command. Confirm the write took.
5. Update state files in place:
   - `setup/NN_<service>.md` — tick the checkboxes for sections
     that were automated.
   - `setup/00_files.md` — flip status to `OK` (if no
     handoff pending) or `PARTIAL` (if handoff pending) or
     leave at current status (if action was a no-op).
   - `.env` — append the new key=value with a comment pointing
     to the runbook section that emitted it.
6. Move to the next action.

When a handoff is reached, pause per §6 below.

After the last action, run a final summary:

```
Bootstrap complete.
═══════════════════════════════════════════
Actions run:      7
Handoffs resolved: 3
Time:             4m 12s
First deploy:     https://ember.vercel.app  ✓ ready
Cloud loop:       scheduled (next: 2026-05-13T20:00Z)

Next: invoke /ship-a-phase to ship phase 1.
```

Commit the bootstrap's changes as a single commit:

```
bootstrap: provision <PROJECT> end-to-end

Provisioned:
  - GitHub repo <owner>/<repo>
  - Vercel project <PROJECT> (pdx1)
  - Supabase project <PROJECT> (us-west-1)
  - <N> env vars propagated across prod/preview/dev
  - .github/workflows/march.yml installed
  - <M> GH Actions secrets set

Handoffs resolved:
  - Claude Code GitHub App installed
  - claude setup-token OAuth provisioned
  - ACTIONS_PAT fine-grained PAT created

Decisions:
  - <each decision the bootstrap made, one line each>
```

## 5. Discovery quick-start commands

When in doubt about state, run these and read the output:

```bash
# Local state
git remote -v
ls .env 2>/dev/null && cat .env | grep -c '^[A-Z]'   # how many keys
cat setup/00_files.md | head -50

# GitHub
gh auth status
gh repo view --json name,owner,visibility 2>/dev/null
gh secret list 2>/dev/null
gh variable list 2>/dev/null

# Vercel
vercel whoami 2>/dev/null
vercel ls 2>/dev/null
vercel env ls production 2>/dev/null

# Supabase
supabase projects list 2>/dev/null

# Cloud loop
test -f .github/workflows/march.yml && echo "march.yml present"
```

Failure of any of these is a signal: not authed, not installed,
or resource missing. Map each to a discovery output row.

## 6. The handoff pause pattern

When the plan hits a handoff:

1. Print the handoff block (see template in
   `customization/bootstrap-automation.md` §"Handoff protocol").
2. Pause via `AskUserQuestion`:
   - Question: "Handoff: <name>. Done?"
   - Options: `"yes, done — verify and continue"`,
     `"skip — defer this handoff to /oversight"`.
3. If `yes`: run the verify command. If it succeeds, continue.
   If it fails: re-print the handoff with the verify output as
   the reason; ask again. Three failures → fall through to
   skip.
4. If `skip`: append a `[needs-user-call]` row to
   `plan/AUDIT.md` with the handoff's instructions verbatim,
   and continue with the next action.

The pause is short (one question, two options). Don't draft
multi-question flows mid-bootstrap.

## 7. Hard rules

1. **`setup/bootstrap.local.json` MUST be gitignored.** If
   `git ls-files setup/bootstrap.local.json` returns it,
   refuse to run. Print:
   > Refusing to run. `setup/bootstrap.local.json` is tracked
   > in git. This file holds settings that should not be
   > committed. Add it to `.gitignore`, untrack it
   > (`git rm --cached setup/bootstrap.local.json`), and
   > re-run.
2. **Never overwrite an existing `.env` value silently.**
   Verify the existing value with a cheap API call first.
3. **Never recreate an existing remote resource.** Discover
   → if present, link → if absent, create.
4. **Never delete.** No teardown logic in this skill.
5. **Verify after every write.** No fire-and-forget.
6. **Failure is loud.** Print full response bodies / stderr.
   No silent retries.
7. **No `--no-verify`, no force-push, no destructive resets**
   on git operations.
8. **The bootstrap's own commits respect the project's
   `agents.md`** — no Co-Authored-By, no emojis, the right
   trailers.

## 8. Delegation

This skill is mostly serial CLI orchestration, not a
context-heavy job. **Don't** spawn sub-agents for the main
flow.

The one exception: if the user invokes `/bootstrap` on a
brownfield project with significant pre-existing config and
the discovery output is unclear, spawn a `scout`-style
agent to map the existing state into the bootstrap's schema.
This is rare; default to the main agent doing discovery.

## 9. Quick reference

### Files this skill reads

```
git remote                          # remote URL
.env                                # current keys
.env.example                        # expected keys
setup/00_files.md                   # service index
setup/NN_<service>.md (each)        # per-service status
setup/bootstrap.local.json          # manifest (if present)
.github/workflows/march.yml         # cloud-loop presence
plan/bearings.md                    # stack / hosting pin
```

### Files this skill writes

```
.env                                # new keys appended
setup/NN_<service>.md (each)        # checkbox state
setup/00_files.md                   # row status updates
plan/AUDIT.md                       # [needs-user-call] for deferred handoffs
.github/workflows/march.yml         # cloud-loop install (if invoked)
agents.md                           # cloud-loop trailer carve-out (if invoked)
```

### External services this skill calls

```
gh                                  # GitHub CLI
gh secret set <NAME> -b "<value>"   # set Actions secret
gh variable set <NAME> -b "<value>" # set Actions variable
gh repo create <slug> --public      # create repo
gh repo edit <slug> --description "..." --homepage "..."
vercel                              # Vercel CLI
vercel link                         # link repo to project
vercel env add <name> production    # set prod env var
vercel env add <name> preview
vercel env add <name> development
supabase                            # Supabase CLI
supabase projects create <name> --org <org> --region <region>
```

### Always-pause moments

```
1. CLI not authed   → "run `<cli> login`; press Enter when done"
2. claude setup-token output paste
3. Fine-grained PAT generation (ACTIONS_PAT)
4. Claude Code GitHub App install
5. DNS records (custom domain)
6. Billing threshold confirmation
```

## 10. Failure modes (stop conditions)

- **Refusing to run:** `setup/bootstrap.local.json` is git-
  tracked. → Print the gitignore instruction. Exit.
- **Refusing to run:** the project has no `setup/00_files.md`.
  → Print "this project hasn't adopted the external-services
  customization; either add `setup/00_files.md` from
  `nexus/templates/setup/00_files.md` or invoke
  `/bootstrap with explicit-services github,vercel` to
  bypass." Exit.
- **CLI missing:** `gh`, `vercel`, or `supabase` not on PATH.
  → Print the install command for the user's platform. Exit.
- **CLI not authed:** `gh auth status` or equivalent fails.
  → Pause (not stop). Print the login command. Wait.
- **Token rejected:** any API call returns 401. → Pause.
  Print the response. Prompt for re-paste or rotation.
- **Quota / billing:** API returns 402 or 429. → Stop. Print
  the message + dashboard URL. The user resolves billing,
  then re-runs.
- **Resource conflict:** repo / project name exists but is not
  accessible to the current token. → Stop. Print "rename
  in manifest or claim access; re-run."
- **Network partition:** any call times out > 30s. → Stop.
  Print "network issue; re-run when connectivity is
  restored." State is flushed; re-run is safe.

Every stop prints a one-line "re-run to continue" hint
showing the exact invocation that resumes from the current
state — typically `/bootstrap continue`.

---

## See also

- [`../../customization/bootstrap-automation.md`](../../customization/bootstrap-automation.md)
  — the full convention, mental model, and design.
- [`../../customization/external-services.md`](../../customization/external-services.md)
  — the runbook layer the bootstrap executes against.
- [`../scripts/bootstrap.mjs`](../scripts/bootstrap.mjs) —
  the orchestrator script.
- [`../setup/bootstrap.example.json`](../setup/bootstrap.example.json)
  — the manifest schema.
