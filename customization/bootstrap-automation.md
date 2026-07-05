# Customization: bootstrap automation

> The executor layer that sits above `setup/`. Takes a
> project name and a few CLI logins as inputs, drives
> provider CLIs and APIs as outputs, and reaches a green
> deploy + a ticking cloud loop without dashboard
> archaeology.
>
> Where `setup/NN_<service>.md` runbooks are the *audit
> trail* (what was configured and why, including the human
> rationale for deferrals), the bootstrap layer is the
> *executor* (what actually gets configured and verified).
> Both coexist; the runbooks remain the source of truth for
> intent, and the bootstrap script remains the source of
> truth for state.

This is the difference between "spec.md → 90 minutes of
dashboard clicking → a half-wired project" and "spec.md →
`/bootstrap` → a deployed app whose cloud loop is ticking
before lunch."

---

## Before you start (pre-flight checklist)

Before invoking `/bootstrap` the first time, have these
ready. Missing any one of them will pause the script on a
handoff — they're not blockers, but they slow the first
run. If you have all of them up front, the manifest flavor
runs end-to-end in ~10 minutes.

**Local environment:**

- [ ] `gh`, `vercel`, `supabase` CLIs installed and on
      `PATH` (`gh 2.40+`, `vercel 53+`, `supabase 2.90+`).
- [ ] Each CLI authenticated: `gh auth status`,
      `vercel whoami`, `supabase orgs list` all succeed.
- [ ] Your gh auth's git protocol matches your remote URL.
      If `gh auth status` says `Git operations protocol:
      ssh`, your local git remote will need the
      `git@github.com:` URL form. Bootstrap detects this
      but you save a step by checking up front.
- [ ] `git init` has run and the working tree has at least
      `spec.md` + `agents.md` (the nexus adoption
      artifacts) — or run the adoption playbook first.

**Tokens / approvals you'll be prompted for (paste flow):**

- [ ] **`VERCEL_TOKEN`** — generate at
      https://vercel.com/account/tokens. Scope: full
      (covers deploy gate + cloud-loop verify).
- [ ] **`CLAUDE_CODE_OAUTH_TOKEN`** — run
      `claude setup-token` in a separate terminal. Output
      starts with `sk-ant-oat01-…`. Bills against your
      Claude Pro/Max subscription.
- [ ] **`ACTIONS_PAT`** (only if `cloud_loop.identity:
      user`) — fine-grained PAT at
      https://github.com/settings/personal-access-tokens/new.
      Resource owner: your account/org. Repository: the
      one bootstrap is about to create. Permissions
      (R/W): Contents, Issues, Actions, Workflows, Pull
      requests, Variables, Secrets, Administration.
      Expiration: 90 days recommended.

**Browser-only actions you'll be told to do:**

- Install the Claude Code GitHub App at
  https://github.com/apps/claude after the repo exists.
- (Optional) Pin Vercel function region in the dashboard
  (CLI doesn't expose this yet).
- (Optional) Enable Speed Insights / disable Vercel
  Authentication on team aliases.

**For pre-provisioned services:**

If you've already created the Vercel project, the Supabase
project, or the GitHub repo manually, add the `project_id`
/ `project_ref` / `org_id` fields to
`setup/bootstrap.local.json` so bootstrap links rather than
searching by name. See the manifest schema below.

---

## When to adopt this customization

Adopt when **any** of these apply:

- You're starting a new project and want it deployed
  end-to-end before manually touching a provider dashboard.
- You're adopting nexus on an existing repo whose services
  are half-configured and you want a deterministic way to
  fill the gaps.
- You rotate tokens regularly and want one verb for
  "re-propagate this secret to every place it lives."
- You're going to bootstrap several projects with the same
  stack shape and want the second one to take 5 minutes
  instead of 90.

Skip this customization when:

- The project depends only on services without a CLI or
  provisioning API (rare; nearly every modern provider has
  one).
- You explicitly want to walk every dashboard yourself.
  In that case, the existing `setup/` runbooks alone are
  sufficient.

---

## The mental model — state machine, never one-shot

Every `/bootstrap` invocation runs three phases, in order:

1. **Discovery (read-only).** Read git state, scan `.env`,
   check `.github/workflows/`, ping provider CLIs/APIs to
   confirm which resources exist and which env vars / GH
   Actions secrets / hosting env vars are already set.
   Produces a state report.
2. **Plan.** Diff the *desired* state — defined by
   `setup/00_files.md` plus the manifest plus standing
   defaults — against the *discovered* state. Produces an
   ordered action list grouped by service.
3. **Execute.** Walk the plan in dependency order, pausing
   at every inherently human step (browser OAuth approvals,
   DNS records, billing confirmations) for the user to
   complete and confirm.

Discovery + plan are always safe to run; they make no
writes. Execute is gated on user confirmation (interactive
flavor) or manifest presence (manifest flavor).

The state machine framing is non-negotiable. A one-shot
"do everything" script collapses the moment the user is at
a different phase of life than the script assumes — and
they always are.

---

## Invocations

| Form | Scope | Effect |
|---|---|---|
| `/bootstrap status` | discovery + plan only | read-only state report; safe inside `/oversight` |
| `/bootstrap` | discovery + plan + execute (interactive) | walks every gap one provider at a time, pausing for tokens + handoffs |
| `/bootstrap with manifest` | same, but reads `setup/bootstrap.local.json` first | non-interactive except for handoffs the manifest can't supply (OAuth, DNS) |
| `/bootstrap <service>` | scope to one row in `setup/00_files.md` | surgical; for adding a service mid-project |
| `/bootstrap rotate <service>` | re-propagate one token across `.env` + GH secrets + hosting env vars | for rotation / leak response |
| `/bootstrap cloud-loop` | install workflow + Claude OAuth + ACTIONS_PAT | the final piece; runs last in the full path |
| `/bootstrap continue` | resume from last incomplete state | same as no-args, explicit |

Re-running any form is safe. Discovery sees current state
and re-plans accordingly. A re-run on a complete bootstrap
is a no-op that prints "everything's wired; nothing to do."

---

## Phase-of-life table

The user can land at any of these starting points. The
state machine detects which row applies and acts accordingly.

| Where the user is | What `/bootstrap` does |
|---|---|
| Pre-everything (have spec.md + `git init`, nothing else) | repo create → hosting project create → DB project create → secrets → deploy → cloud loop |
| Local repo, no remote | repo create → the rest |
| Remote, nothing else | hosting + DB + secrets + deploy + cloud loop |
| Hosting wired, no DB | DB + secrets propagation + cloud loop |
| All services wired, no cloud loop | install workflow + Claude OAuth + ACTIONS_PAT |
| Adding a new service mid-project | detect new row in `00_files.md` → walk just that |
| Brownfield (existing app adopting nexus) | discovery → fill gaps without touching what works |
| Token rotation | `/bootstrap rotate <svc>` |

The discovery output tells the user where they are; the
plan tells them what comes next; they say go.

---

## Two flavors of assistance

### Interactive (default)

Walks one provider at a time. For each:

1. Prints the current state for that provider.
2. If a CLI session is missing, prints the login command
   (`gh auth login --web`, `vercel login`, etc.) and waits
   for the user to confirm.
3. If a non-CLI token is required (Anthropic OAuth,
   ACTIONS_PAT), prints the dashboard URL + scopes and waits
   for paste.
4. Runs the provider's actions, narrating each command
   before executing.
5. Verifies the result with a read API call.
6. Updates `.env`, GH secrets, hosting env vars, and the
   matching `setup/NN_<service>.md` status.
7. Moves to the next provider.

The flavor for first-time use, for the "I'm at the
keyboard" moment, and any time the user wants to see what
happens.

### Manifest

Reads `setup/bootstrap.local.json` once and uses it as the
source of every input the discovery couldn't determine
itself. Pauses only on inherently human handoffs (OAuth
approvals, DNS, billing). The flavor for repeat use, for
bootstrapping a second project with the same shape, and for
"I'll come back in 10 minutes."

The manifest holds **settings** (project name, regions,
framework, schedule cron, cloud-loop identity). It does
**not** hold provider auth — that's handled via CLI login
(`gh`, `vercel`, `supabase`). Auth-sensitive tokens that
aren't CLI sessions (Anthropic OAuth output,
`ACTIONS_PAT`) are paste-prompts even in manifest flavor;
the manifest may reference an env var or vault location,
but the value never lands in the file.

Both flavors share the same state machine. The only
difference is whether discovery pauses to collect input or
reads it from the manifest.

---

## The manifest format

`setup/bootstrap.local.json` is **gitignored** (the bootstrap
script refuses to run if it's tracked). The shape:

```json
{
  "project": {
    "name": "<PROJECT>",
    "tagline": "<one line>",
    "github_owner": "<user-or-org>",
    "github_repo": "<PROJECT_LOWER>",
    "visibility": "public",
    "default_branch": "main",
    "description": "<repo description for GitHub homepage>"
  },
  "providers": {
    "vercel": {
      "framework": "nextjs",
      "region": "pdx1",
      "team_id": "",
      "project_id": ""
    },
    "supabase": {
      "region": "us-west-1",
      "org_id": "",
      "project_ref": "",
      "db_password": ""
    }
  },
  "cloud_loop": {
    "enabled": true,
    "identity": "user",
    "schedule_cron": "0 */2 * * *",
    "git_author_name": "",
    "git_author_email": ""
  }
}
```

Field semantics:

- **`project_id` / `project_ref` / `org_id`** — for
  pre-provisioned services. When set, the script
  *verifies* the resource exists and is accessible, then
  links to it. When empty, the script searches by name,
  and creates if not found.
- **`team_id`** — Vercel team slug (`team_*`). Find via
  `vercel teams ls`. Empty = personal account.
- **`org_id`** — Supabase organization id. Find via
  `supabase orgs list`. Required when the auth has access
  to multiple orgs.
- **`db_password`** — Supabase DB password. Empty for
  new-project create flow (script generates a 32-char
  random and stores in `.env`). Required as paste for
  pre-provisioned projects (the password is set at create
  time and not retrievable via CLI).
- **`git_author_name` / `git_author_email`** — used by
  the decorated-march workflow when
  `cloud_loop.identity: user`. Empty = bootstrap prompts
  for them. Email should match your verified GitHub
  email so the avatar resolves on github.com.

A starter file is committed at `setup/bootstrap.example.json`
with embedded `_help` keys describing each field. The user
copies it to `setup/bootstrap.local.json` and fills in
their values.

JSON is chosen over YAML to avoid a parser dependency in
`scripts/bootstrap.mjs`. Comments are encouraged via `_help`,
`_comment`, and `_purpose` keys (the script ignores any key
starting with `_`).

Every manifest field has a sensible default. Missing fields
fall back to a prompt (interactive) or a default (manifest).
Missing required fields stop the run with a clear error,
never proceed with a guess.

---

## Idempotency contract

The bootstrap script MUST satisfy these invariants:

1. **Never overwrite an existing `.env` value silently.**
   If `.env` has `VERCEL_TOKEN` already, the script verifies
   it with a cheap API call. If valid, skip. If invalid,
   prompt the user to rotate.
2. **Never recreate an existing remote resource.** If the
   GitHub repo exists, link to it. If the Vercel project
   exists, link to it. Never `422 already exists` from the
   provider — detect first.
3. **Never delete.** No teardown logic. A separate
   `/bootstrap teardown` verb is the only destructive verb,
   and it's a deferred future addition.
4. **Discovery is authoritative.** Manifest values are
   merged on top of discovery, never replace it. If
   discovery says "Vercel project `ember` exists in team
   X," the manifest's claim that it should be in team Y
   triggers a clear error, not a re-provision.
5. **Verify after every write.** Every action ends with a
   read call confirming the write took effect. No silent
   "fire and forget."

---

## Handoff protocol

When bootstrap reaches a step that cannot be automated, it
prints a handoff block and pauses:

```
─── HANDOFF ──────────────────────────────────────────────
What it needs:  Claude Code GitHub App installed on the repo
Why:            The cloud-loop workflow can't authenticate
                without it; the App grants the action
                permission to act as you against the repo.
Do this:        1. Open https://github.com/apps/claude
                2. Click Install
                3. Select "Only select repositories" → <REPO>
                4. Click Install
Verify with:    gh api /repos/<REPO>/installations/<id>
─────────────────────────────────────────────────────────

  Press Enter when done (or type 'skip' to defer).
```

After the user presses Enter, bootstrap runs the verify
command. On success, the bootstrap continues. On failure,
it re-prints the handoff and re-waits — up to 3 retries
before logging the handoff as a `[needs-user-call]` in
`plan/AUDIT.md` and continuing past it.

Typing `skip` defers the handoff: it lands as a
`[needs-user-call]` row in `plan/AUDIT.md` so `/march`
won't dispatch into a phase that depends on it, and the
bootstrap moves on to whatever's parallel to the handoff.
The user can resume later via `/bootstrap continue`.

Handoffs are inherently human steps; they include:

- Claude Code GitHub App installation
- Anthropic OAuth token generation (`claude setup-token`)
- ACTIONS_PAT fine-grained PAT generation
- DNS records for custom domains (SPF / DKIM / DMARC)
- Email service domain verification
- Billing threshold confirmations
- Granting collaborator access to specific users

Anything that needs a browser session (OAuth approval) or
a system the bootstrap doesn't have access to (DNS
registrar) is a handoff.

---

## Integration with `setup/` runbooks

Each `setup/NN_<service>.md` runbook gets a new top section
under the title:

```markdown
## Automated by /bootstrap

The bootstrap layer scripts these sections:

- Section A (project creation) — `gh repo create` / `vercel project add` / etc.
- Section B (env var propagation) — `gh secret set` / `vercel env add`
- Section H (env-var values in deploy environments) — auto via CLI

These sections require human action and pause as handoffs:

- Section D (custom domain) — needs DNS access
- Section G (webhook secret rotation) — needs dashboard click

When `/bootstrap <service>` completes, the per-section
checkboxes below are ticked in place. Re-running is
idempotent.
```

The status in `setup/00_files.md` flips to `OK` only when
both auto sections and human-handoff sections are done.
While handoffs are pending, the row is `PARTIAL` with the
handoff annotated.

The bootstrap script writes status changes back to the
runbooks; the human writes the deferral rationale in
prose. Neither blocks the other.

---

## Relationship to `/oversight`

`/oversight` already reads `setup/00_files.md` and surfaces
`PARTIAL` / `STUB` rows as flags. The bootstrap layer
writes to `setup/00_files.md` (status changes) and to
`plan/AUDIT.md` (deferred handoffs as `[needs-user-call]`).
The two never collide because:

1. Bootstrap only runs on explicit user invocation.
2. `/bootstrap status` is safe inside `/oversight` — it
   makes no writes.
3. Handoff deferrals from bootstrap are written *before*
   bootstrap exits, so the next `/oversight` sees them.

`/oversight` may suggest the user run `/bootstrap <svc>`
when it detects a STUB row whose phase is coming up — this
is the natural place to surface "you have an unbootstrapped
service blocking phase N."

---

## Relationship to nexus adoption

The bootstrap layer is **structured to work standalone** on
any repo (nexus-adopted or not), and the nexus playbooks
**recommend it** as the next step after adoption:

- `playbooks/pre-spec.md` ends with: "now run `/bootstrap`."
- `playbooks/new-project.md` ends with: "Day-1 checklist
  passed → run `/bootstrap`."
- `playbooks/existing-project.md` ends with: "overlay
  applied → run `/bootstrap status` to see what's already
  wired; then `/bootstrap` to fill the gaps."
- `playbooks/cloud-loop.md` notes that
  `/bootstrap cloud-loop` is the streamlined alternative to
  the manual 10-step walkthrough.

Bootstrap itself does not require nexus. The script
`scripts/bootstrap.mjs` runs on any repo with a `setup/`
directory + a manifest (or interactive prompts). The
nexus-specific integration is the runbook status
write-back and the `[needs-user-call]` deferral pattern —
both gracefully degrade to "skip" if the directories don't
exist.

---

## Provider adapters

Bundled adapters in v1, each implemented as a thin wrapper
around the provider's CLI plus a few REST calls for things
the CLI doesn't cover:

| Service | CLI used | Manual fallback if CLI unavailable |
|---|---|---|
| GitHub | `gh` | REST API via `GH_TOKEN` (classic PAT, `repo` + `workflow`) |
| Vercel | `vercel` | REST API via `VERCEL_TOKEN` |
| Supabase | `supabase` | REST API via `SUPABASE_ACCESS_TOKEN` |
| Anthropic | `claude setup-token` (handoff only) | n/a — paste required |
| OpenAI | none — `.env` only | n/a — paste required |
| Cloud loop | composed of GitHub + Anthropic | n/a |

Each adapter exports three functions:

```js
export async function discover(ctx) { /* returns state slice */ }
export async function plan(state, manifest, ctx) { /* returns actions[] */ }
export async function execute(actions, ctx) { /* writes; returns summary */ }
```

The top-level `scripts/bootstrap.mjs` orchestrates: load
manifest + env, call `discover()` on each adapter, compose
plans, walk execute in dependency order (github → vercel →
supabase → cloud-loop).

Adding a new adapter (Netlify, Cloudflare Pages, Fly.io,
Resend, Stripe) is ~150 lines and an entry in
`scripts/bootstrap/adapters.mjs`.

---

## The decorated march (cloud-loop user-author identity)

The default `templates/.github/workflows/march.yml` ships
in **bot-author mode** — cloud-shipped commits attribute to
`github-actions[bot]`. That's zero-config and works fine,
but it fragments the git log if the user also commits
locally as themselves.

The **decorated march** pattern (used in production by
both `thock` and `pantheon`) makes every cloud-shipped
commit attribute to the human user, producing a uniform
git log indistinguishable from local work. It's a small
edit on top of the default workflow, but it's load-bearing
enough to warrant its own section.

When `cloud_loop.identity: user` is set in the manifest,
`/bootstrap cloud-loop` makes these changes to the
template before installing it:

1. **Checkout step uses ACTIONS_PAT**, not `GITHUB_TOKEN`:
   ```yaml
   - uses: actions/checkout@v4
     with:
       fetch-depth: 0
       token: ${{ secrets.ACTIONS_PAT }}
   ```
   Without this, `git push` from the workflow attributes
   to `github-actions[bot]`, regardless of any subsequent
   env-var changes.

2. **The Claude Code Action env block carries GIT_AUTHOR_*
   and GIT_COMMITTER_***:
   ```yaml
   env:
     GIT_AUTHOR_NAME:     "<Real Name>"
     GIT_AUTHOR_EMAIL:    "<verified-github-email>"
     GIT_COMMITTER_NAME:  "<Real Name>"
     GIT_COMMITTER_EMAIL: "<verified-github-email>"
   ```
   These four env vars take precedence over any
   `git config user.*` value at `git commit` time,
   including the action's own internal "Set git user as
   claude[bot]" step. Email must match a verified GitHub
   address for the avatar to resolve on github.com.

3. **The Claude Code Action env block sets `GH_TOKEN` to
   ACTIONS_PAT** so the agent's own `gh` calls within the
   tick attribute as the user:
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.ACTIONS_PAT }}
   ```

4. **The `Cloud-Run:` trailer carve-out in `agents.md`**
   becomes critical, because the daily-ceiling check
   can't distinguish cloud commits from local ones by
   author anymore — both are the user. Every cloud-
   shipped commit MUST end with:
   ```
   Cloud-Run: <run-url>
   ```
   The ceiling step in `march.yml` greps the trailer to
   count cloud-shipped commits in the last 24h.

`ACTIONS_PAT` scope: fine-grained PAT on the target repo
with Contents R/W, Issues R/W, Actions R/W, Workflows
R/W, Pull requests R/W, Variables R/W, Secrets R/W,
Administration R/W. 90-day expiry recommended.

When `cloud_loop.identity: bot`, none of this applies —
the workflow runs with `GITHUB_TOKEN` and commits show as
`github-actions[bot]`. Switching modes later is
`/bootstrap rotate cloud-loop` (deferred to v2).

---

## Hard rules

1. **`setup/bootstrap.local.json` is gitignored.** Even
   though it holds settings (not tokens), it can hold
   sensitive defaults (regions, internal team IDs) and may
   evolve to hold more. Bootstrap **refuses to run** if
   the file is git-tracked.
2. **Discovery is read-only.** No matter the flavor or
   args, `discover()` makes only read API calls.
3. **No silent overwrites.** Existing `.env` values, GH
   secrets, and Vercel env vars are verified, not replaced.
   Rotation is a separate verb (`/bootstrap rotate`).
4. **Handoffs are explicit.** The script never silently
   logs "you'll need to do X later." Every handoff pauses
   or fires `[needs-user-call]`.
5. **Failure is loud.** A provider API or CLI error stops
   the bootstrap with the full response body / stderr
   printed. No silent retries beyond the standard
   idempotent "is-it-done-yet" poll for resource
   provisioning.
6. **Every action narrates before executing.** Even in
   manifest flavor, the user sees `> gh repo create
   daretodave/ember --public` before it runs. This is the
   "no surprise" contract.

---

## Failure modes

- **Token rejected (401).** Print the response body, the
  dashboard URL to issue a new one, and re-prompt. Don't
  partial-write.
- **Resource exists but not owned by us.** E.g., GitHub
  repo `daretodave/ember` already exists but the token
  can't see it. Bootstrap prints a clear error: "repo
  exists but not accessible; check the owner + visibility."
- **Quota / billing.** Provider returns 402/429. Print the
  message, link to the billing dashboard, exit. No retry
  loop — billing is a human handoff.
- **CLI not installed.** Print the install command for the
  user's OS (`npm i -g vercel`, `brew install supabase/tap/supabase`,
  `gh` from `cli.github.com`) and exit. Bootstrap doesn't
  install CLIs for the user.
- **Discovery says one thing, execute fails on the same
  thing.** Race condition (user changed dashboard mid-run).
  Re-run discovery before retry.
- **Network down mid-run.** Bootstrap is idempotent;
  re-run from the start. State writes are flushed after
  every action, not at the end.

---

## Pre-flight before walking away

Before invoking `/bootstrap with manifest` and stepping
away for the duration of the run:

1. Run `/bootstrap status` first to confirm discovery
   succeeds (no auth issues, network is up, all CLIs
   installed and logged in).
2. Confirm `setup/bootstrap.local.json` has every setting
   the providers in `setup/00_files.md` need.
3. Confirm `.gitignore` includes `setup/bootstrap.local.json`.
4. Have a browser tab open for the inevitable handoffs
   (OAuth approvals, App installs, DNS).
5. Confirm `claude setup-token` is ready to run (your
   Claude Code session is logged in).
6. Confirm any custom-domain DNS records you intend to
   add are pre-staged in your registrar's dashboard (the
   bootstrap will tell you the values, but adding them is
   on you).

If the manifest is complete and no DNS work is queued, the
walk-away time is ~5-15 minutes depending on Vercel /
Supabase provisioning speed.

---

## Lessons from the first end-to-end bootstrap (Ember, 2026-05-13)

These were discovered by running the layer against a real
greenfield project (Ember). Fold them into the script and
runbooks; each is a one-line "gotcha that costs a tick if
ignored."

### CLI auth protocol governs git remote URL form

If `gh auth status` reports `Git operations protocol: ssh`,
the script's `git remote add origin <url>` MUST use
`git@github.com:<owner>/<repo>.git`, not the `https://`
form. Otherwise `git push` hangs on a credential-manager
prompt the script can't satisfy. The script should detect
the protocol and pick the right URL form.

### Vercel CLI quirks

- **`vercel link --project <name> --yes` auto-connects to
  the GitHub remote** if one is set. One command creates
  the Vercel project AND wires the GitHub integration for
  auto-deploys. The script's plan stage can assume this
  shortcut.
- **`vercel tokens add` does not exist in v53.** Token
  generation is a dashboard handoff at
  https://vercel.com/account/tokens. Treat it like
  ACTIONS_PAT — paste-prompt handoff.
- **`<project>.vercel.app` may already be claimed
  globally.** Vercel project hostnames are globally
  unique. Don't assume the manifest's project name
  produces a usable URL. Bootstrap should read
  `vercel inspect <deploy-id>` after the first deploy and
  record the actual primary URL (the auto-assigned random
  alias like `ember-rust-sigma.vercel.app` if needed).
- **Team aliases (`<project>-<team>.vercel.app`) may be
  auth-gated** by team-level "Vercel Authentication" — they
  return 401 to anonymous visitors. The script should
  surface which alias is publicly accessible.
- **`vercel env add --sensitive`** marks secrets as
  sensitive (hidden from dashboard, can't be unmasked).
  Use it for service-role keys, DB passwords.

### Supabase CLI quirks

- **New-format `sb_secret_*` key is masked after creation.**
  `supabase projects api-keys --output json` returns the
  legacy JWT (`anon` + `service_role`) in full, but the
  new-format secret key value is shown only once at create
  time and then masked. For v1, use the legacy JWT
  `service_role` for server-side auth — fully retrievable.
- **DB password is set at create time and not retrievable
  later.** Bootstrap must generate it (for new projects,
  store in `.env` + GH secret) or accept a paste (for
  pre-provisioned projects).
- **`supabase link --project-ref <ref>` works without a DB
  password** — it only writes the project ref locally.
  Migrations (`supabase db push`) need the password later.

### Pre-provisioned services need explicit refs

When a user has manually created a Supabase project / Vercel
project / GitHub repo before running `/bootstrap`,
name-match alone is insufficient — the wrong account or
team can produce false negatives. Extend the manifest:

```json
"providers": {
  "supabase": { "project_ref": "ohrbbhrodpxhdtjhbsmy", "org_id": "ganpgclcxfimwbthgqoi" },
  "vercel":   { "project_id": "prj_...", "team_id": "team_..." }
}
```

When these are set, discovery uses them directly; when
empty, it falls back to name-match within the current CLI
auth's accessible resources.

### GitHub Actions workflow quirks

- **`pnpm-lock.yaml` is required for `pnpm` cache.**
  `actions/setup-node@v4` with `cache: pnpm` fails before
  the lockfile exists. Gate with
  `cache: ${{ hashFiles('pnpm-lock.yaml') != '' && 'pnpm' || '' }}`.
- **`packageManager` in `package.json` is required for
  `pnpm/action-setup@v4`.** Without it the action errors
  with "No pnpm version specified." Bootstrap should
  ensure package.json has the field (or the workflow
  inlines `version:`).
- **Placeholders in the template march.yml are extensive:**
  `<PROJECT>`, `<PROJECT_PKG_PREFIX>`, `<DEFAULT_BRANCH>`,
  `<HOSTING_PROVIDER>`, `<HOSTING_URL>`, `<REPO_SLUG>`. The
  script must resolve every one before committing.

### The "decorated march" (user-author cloud loop)

Pantheon and thock both run the decorated pattern that
attributes cloud-shipped commits to the user, not
`github-actions[bot]`. The bootstrap layer's
`/bootstrap cloud-loop` slice must mirror this:

1. Set `ACTIONS_PAT` secret (fine-grained PAT, contents +
   issues + actions + workflows + administration + variables
   + secrets, R/W on the target repo).
2. Workflow checkout uses `token: ${{ secrets.ACTIONS_PAT }}`.
3. Claude Code Action env block sets
   `GH_TOKEN: ${{ secrets.ACTIONS_PAT }}` (for the agent's
   own `gh` calls).
4. Claude Code Action env block sets four git author
   identity env vars (`GIT_AUTHOR_NAME`,
   `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`,
   `GIT_COMMITTER_EMAIL`) — these take precedence over
   the action's internal `git config user.* "claude[bot]"`
   step at commit time.

The script currently defaults to bot-author. When
`cloud_loop.identity: user` is set in the manifest,
`/bootstrap cloud-loop` must edit the template workflow to
uncomment the four GIT_AUTHOR_* lines AND prompt for
ACTIONS_PAT.

### Script gaps observed during Ember bootstrap

These were TODOs for v2 of `scripts/bootstrap.mjs`, written
after the first live run. Kept as history — each bullet still
names the exact quirk that cost a tick:

- The script's `discoverSupabase` parses `supabase projects
  list --output json` but doesn't tolerate the stderr
  "Cannot find project ref" prefix that appears before the
  JSON when the local dir isn't linked. Fix: read stderr
  separately or grep for `[` prefix.
- The script doesn't auto-extract Supabase keys after
  linking (would need to shell out to `supabase projects
  api-keys`, parse JSON, write to `.env`). Currently the
  user does this step manually.
- The script doesn't auto-write to `setup/NN_<service>.md`
  runbooks (Sections marked Automated). The design says
  it should; v2 implements it.
- The script's `vercel env add` invocations use shell pipes
  (`printf "%s" "$value" | vercel env add ...`) which
  work but skip the `--sensitive` flag for secret values.
  Add the flag for `*_SECRET`, `*_PASSWORD`, `*_TOKEN`,
  `*_SERVICE_ROLE_KEY`.
- Cloud-loop slice: the script's current `cloud-loop`
  verbs are stubs. They need to: copy march.yml template,
  resolve placeholders, prompt for CLAUDE_CODE_OAUTH_TOKEN
  + ACTIONS_PAT, set the secrets, optionally edit the
  workflow for user-author identity.

**Status: all five closed in phase 14.** `discoverSupabase`
and the new key-extraction call both parse from the first
`[`/`{` in stdout; `create-or-link` auto-extracts the legacy
JWT pair via `projects api-keys` (manual handoff is now the
fallback, not the default); runbook write-back ticks Section
A/H checkboxes and bumps `STUB`/`—` index rows to `PARTIAL`;
a new `push-env` verb pushes `.env` to Vercel Production with
`--sensitive` on secret-shaped keys; and `install-workflow`
applies the decorated march (checkout token + GIT_AUTHOR_*/
GIT_COMMITTER_*/GH_TOKEN) whenever `cloud_loop.identity:
user` is set.

---

## See also

- [`../templates/skills/bootstrap.md`](../templates/skills/bootstrap.md)
  — the skill file the agent reads.
- [`../templates/scripts/bootstrap.mjs`](../templates/scripts/bootstrap.mjs)
  — the orchestrator + adapters.
- [`../templates/setup/bootstrap.example.json`](../templates/setup/bootstrap.example.json)
  — the manifest schema, copy to `bootstrap.local.json`.
- [`./external-services.md`](./external-services.md) — the
  runbook layer this layer executes against.
- [`../playbooks/cloud-loop.md`](../playbooks/cloud-loop.md)
  — the manual cloud-loop walkthrough that
  `/bootstrap cloud-loop` automates.
