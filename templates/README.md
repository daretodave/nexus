# Templates

Copy these into your target repo per the playbook
(`../playbooks/new-project.md` or
`../playbooks/existing-project.md`).

## Layout

```
templates/
├── agents.md                          → repo root
├── design-prompt.md                   → optional, copy to <repo>/claude-design.prompt.md
│                                        when commissioning a visual system
├── plan/                              → repo's plan/
│   ├── README.md                      (the roadmap: lanes + one row per spec)
│   ├── 01-bootstrap.md                (starter spec: the bootstrap)
│   ├── 02-canonical-sibling.md        (starter spec: the first feature surface)
│   ├── ARCHIVE.md                     (one line per finished chunk; append-only)
│   ├── pending/README.md              (plan changes waiting to settle: what a branch writes instead of shared plan files)
│   ├── nexus.lock                     (the kit version + plan shape this repo follows)
│   ├── bearings.md
│   ├── AUDIT.md
│   ├── CRITIQUE.md
│   ├── CANDIDATES.md
│   ├── reflexes.md                    (omit unless the lessons layer is adopted; see below)
│   ├── lessons.md                     (omit unless the lessons layer is adopted; see below)
│   └── CURRENT-STATE.md               (brownfield retrofit only; see existing-project.md)
├── identity/                          → repo's identity/ (adopt-by-need: the identity layer + footgun ladder)
│   ├── README.md                      (the rules: principles, decisions, glossary, the footgun ladder)
│   ├── principles.md                  (P# promises, ≤ 40 active)
│   ├── decisions/README.md            (the D# format; settle writes decisions/<year>.md)
│   ├── glossary.md                    (the project's words)
│   └── footguns.md                    (Open / Watch / Guarded, one line per trap; merge=union)
├── skills/                            → repo's skills/
│   ├── next.md                        (one chunk, done fully: pick, claim, delegated build, gate, pending close, land per owner mode)
│   ├── next/build.md                  (/next's delegated build: worktree, builder brief, Workflow shape, harvest)
│   ├── next/land.md                   (/next's close and land: settle, pending file, owner main vs contributor PR)
│   ├── heads-down.md                  (ask up front, claim a list, loop /next assuming defaults, ASCII progress)
│   ├── plot.md                        (a task into the plan with its place in line; `and do` builds it now)
│   ├── bug.md                         (reproduce, then fix now via /plot … and do, or plot it)
│   ├── messy.md                       (a raw dump, saved untracked, clustered and refined into specs via a pending file; the GUI's explode)
│   ├── tidy.md                        (clear dead claims; offer idle worktrees and merged branches in one question)
│   ├── rebooting.md                   (reboot train, owner's terminal: announce, ack, one resume line per loop)
│   ├── reboot-ready.md                (reboot train, inside a loop: stop children, keep work and claims, park the ledger)
│   ├── reboot-resume.md               (reboot train, after the restart or a crash: take the ledger, carry on)
│   ├── ship-a-chunk.md
│   ├── ship-data.md                   (omit if no structured data layer)
│   ├── ship-migration.md              (omit unless Structured data: pure-db / hybrid-with-managed-postgres)
│   ├── ship-asset.md                  (omit unless Surface: site/hybrid AND branding in scope)
│   ├── moderate.md                    (omit unless the project has UGC; see customization/moderation-loop.md)
│   ├── design.md                      (omit unless the owner designs in Claude Design: the paste prompt and its addenda from the plan; ingest the artifact, plot the port)
│   ├── design/ingest.md               (/design ingest in full: the Artifact calls, the manifest, the port chunk, a package handoff)
│   ├── design/render.md               (the boards rendered in Chrome, an app screenshot compared against one; what a static render misses)
│   ├── design/port.md                 (the port chunk run as a Workflow, scripts/design/port.workflow.js; the port map, port.json, and its check)
│   ├── plan-a-spec.md
│   ├── iterate.md
│   ├── critique.md
│   ├── triage.md
│   ├── expand.md
│   ├── march.md
│   ├── oversight.md
│   ├── jot.md
│   ├── digest.md                      (the night shift; pairs with .github/workflows/night.yml)
│   └── bootstrap.md                   (opt-in executor; see customization/bootstrap-automation.md)
├── claude/                            → repo's .claude/ (+ CLAUDE.md → repo root)
│   ├── CLAUDE.md                      (short pointer at agents.md; copy to repo ROOT)
│   ├── settings.json                  (permission allowlist + hook wiring; see customization/claude-code.md)
│   ├── hooks/guard.mjs                (mechanical hard rules: PreToolUse + Stop)
│   ├── hooks/steer.mjs                (an owner line to one session, at its next tool boundary; see customization/sessions.md)
│   ├── commands/                      (one terse pointer per skill)
│   └── agents/                        (sub-agent definitions)
├── data/                              → repo's data/ (if using gh-as-db or hybrid)
│   ├── README.md
│   ├── BACKLOG.md
│   └── AUDIT.md
├── setup/                             → repo's setup/ (one runbook per external
│   │                                    service; index in 00_files.md)
│   ├── 00_files.md                    (the manifest template)
│   ├── NN_service.md                  (per-service runbook template)
│   └── bootstrap.example.json         (manifest for /bootstrap; copy to setup/bootstrap.local.json, gitignored)
├── .github/                           → repo's .github/ (opt-in; cloud loops)
│   ├── workflows/march.yml            (the dispatcher: owner job, or PR mode's pick/build/land/release by NEXUS_LOOP_MODE)
│   ├── workflows/pr-flow.yml          (PR mode: a closed PR's claims leave the claims branch)
│   ├── workflows/pr-resolve.yml       (PR mode: main merged into conflicted PRs; union driver, then a model)
│   ├── workflows/claims-board.yml     (optional: one issue showing the live claims, behind NEXUS_CLAIMS_BOARD)
│   ├── actions/setup/action.yml       (the project's toolchain, one place for every tick job)
│   ├── workflows/night.yml            (the night shift — /digest daily)
│   ├── workflows/heartbeat.yml        (model-free watchdog for the other two)
│   ├── workflows/nightly-smoke.yml    (model-free SMOKE_SAMPLE=full walk; omit if night.yml owns breadth checks)
│   ├── ISSUE_TEMPLATE/bug_report.yml  (form: something's broken)
│   ├── ISSUE_TEMPLATE/friction.yml    (form: docs confused or misled)
│   ├── ISSUE_TEMPLATE/idea.yml        (form: propose a feature)
│   ├── ISSUE_TEMPLATE/needs_user.yml  (form: needs a human decision)
│   ├── ISSUE_TEMPLATE/config.yml      (blank issues off; routes to friction)
│   └── CLOUD_LOOP.md
├── scripts/                           → repo's scripts/
│   ├── deploy-check.mjs               (the deploy gate)
│   ├── loop-issue.mjs                 (GitHub issue mirror)
│   ├── notify.mjs                     (the pager — blocked is loud)
│   ├── pulse.mjs                      (offline instrument panel: queue/plan/candidate counts, no network)
│   ├── bootstrap.mjs                  (provider-CLI executor, opt-in)
│   ├── lint-migration.mjs             (additive-migration linter, pairs with ship-migration.md)
│   ├── refresh-critique-session.mjs   (Pattern B session refresh, omit unless Auth: is set)
│   ├── check-secrets-liveness.mjs     (GH_TOKEN + CRITIQUE_* liveness probe, omit unless Auth: is set)
│   ├── stack-lifecycle.mjs            (Pattern B port/health/state helpers, omit unless hermetic e2e is Pattern B)
│   ├── new-skill.mjs                  (skill scaffolder: emits skills/<name>.md + claude/commands/<name>.md)
│   ├── install-hooks.mjs              (adoption runs it: pnpm verify as pre-commit, the push policy as pre-push)
│   ├── plan-check.mjs                 (the plan-shape gate, read as settled; add it to your verify composition)
│   ├── owner.mjs                      (effective owner mode: .owner + .nexus/local.json; who settles and lands on main)
│   ├── git/push-policy.mjs            (pre-push: a push to main on origin or upstream outside owner mode is refused; the claims ref passes)
│   ├── plan/pending.mjs               (reads plan/pending/<id>.md; a pending close counts as closed)
│   ├── plan/settle.mjs                (the owner's settle: pending files -> spec, roadmap, archive, decisions, footguns)
│   ├── plan/settled.mjs               (the plan as it reads once pending edits settle, in memory)
│   ├── plan/config.mjs                (what settle may differ on per repo; overrides in plan/settle.json)
│   ├── plan/footguns.mjs              (the footgun list's format and budget lint)
│   ├── plan/progress.mjs              (ASCII progress per spec: the bar, closed struck, <--- [here], ETAs from sizes; --json for a GUI)
│   ├── plan/order.mjs                 (the plan in /next's pick order, simulated: /plot's before and after, the GUI's next up)
│   ├── plan/triage-match.mjs          (/triage: the open spec an issue belongs to, by scored keywords; an open PR's pending files that already cover it)
│   ├── plan/secrets-manifest.mjs      (nexus.secrets.json's shape and the .env.example import; plan-check imports it)
│   ├── secrets.mjs                    (secrets by name: status, set from stdin, import names or --store a real .env, list, check, push to sinks, audit, request; never prints a value)
│   ├── secrets-vault.mjs              (the vault: .env in the repo, .env.workspace at the workspace root, the opt-in keychain; values to code only)
│   ├── secrets-keychain.mjs           (the OS keychain through its own command line: security, PowerShell, secret-tool; values on stdin only)
│   ├── secrets-sinks.mjs              (sinks push a value through stdin: gh secret set, vercel env add, wrangler secret put; the push record in .nexus/secrets-audit.jsonl)
│   ├── secrets-audit.mjs              (set and rotation in that record, by name, never a value; the 90-day rotation nudge)
│   ├── secrets-run.mjs                (secrets run: a command with the declared values in its environment only, its output masked)
│   ├── secrets-scan.mjs               (secrets scan: refuse a diff that adds a vault value, by file, line and name; add to your gate)
│   ├── design/prompt.mjs              (/design prompt and addendum: the Claude Design paste prompt from the plan, stored as design/prompts/NNN-<date>.md; omit unless you design in Claude Design)
│   ├── claims-codec.mjs               (the claims rules as pure functions: any claimant imports them)
│   ├── claims.mjs                     (who builds what: the orphan claims branch, compare-and-swap; --json)
│   ├── claims-board.mjs               (the claims board: draws the table, creates or edits its one issue; claims-board.yml runs it)
│   ├── announce.mjs                   (the notice board: .announcements.md; owner lines outrank the command, REBOOT preempts)
│   ├── ledger.mjs                     (each session's live ledger in .nexus/sessions/: star names; a stale beat reads fallen)
│   ├── worktree.mjs                   (close a worktree without deleting through its links; list them for /tidy)
│   ├── workflow-lint.mjs              (cloud-loop workflow rules: secrets on hosted runners, no secret in a job env; add to your gate)
│   ├── cloud/tick.mjs                 (PR-mode cloud tick: pick + claim, fence the diff, land the PR, release)
│   ├── pr/resolve.mjs                 (pr-resolve.yml's resolver: merge main into conflicted PRs, never forced)
│   ├── design/ingest.mjs              (/design ingest: an export folder -> design/handoff/<date>/ with manifest.json, a sha256 per file, and a README; check, rehash; --into for a package)
│   ├── design/render.mjs              (a handoff's boards as PNGs at their own size, night or dawn, through the installed Chrome's --screenshot; needs Chrome)
│   ├── design/board-runtime.js        (the stand-in for the design tool's runtime that render.mjs runs in Chrome: x-dc, holes, sc-if, sc-for, dc-import)
│   ├── design/compare.mjs             (a board PNG against the app's: the percent of pixels that differ, a diff PNG; --threshold, --max)
│   ├── design/png.mjs                 (just enough PNG for the two: decode a browser's screenshot, encode RGBA; node:zlib)
│   ├── design/port-map.mjs            (a handoff's port.json: every board ported to a file, skipped with a reason, or pending a chunk; check, status; add to your gate)
│   ├── design/port.workflow.js        (the port recipe as a Workflow script: foundation, one agent per canvas page, integrate, one fidelity reviewer per theme, land)
│   ├── upgrade-plan.mjs               (v1 to v2 plan converter, run once from nexus by playbooks/upgrade.md Step 4; omit otherwise)
│   ├── __tests__/loop-issue.test.mjs  (unit tests, node:test, no devDeps)
│   ├── __tests__/plan-check.test.mjs  (unit tests for plan-check.mjs)
│   ├── __tests__/pending.test.mjs     (pending files, the config, the settled view)
│   ├── __tests__/settle.test.mjs      (settle's pure functions)
│   ├── __tests__/settle-run.test.mjs  (settle end to end in a scratch git repo; slower, offline)
│   ├── __tests__/claims-codec.test.mjs  (the claims rules, pure)
│   ├── __tests__/claims-board.test.mjs  (the board's table and its one issue, with a fake gh; pure)
│   ├── __tests__/push-policy.test.mjs  (the push policy, pure)
│   ├── __tests__/progress.test.mjs    (the progress view, pure)
│   ├── __tests__/progress-run.test.mjs  (progress main(), text and --json, from a path with a space; over git, offline)
│   ├── __tests__/announce.test.mjs    (the notice board)
│   ├── __tests__/steer.test.mjs       (the steer hook: the addressed session only, once)
│   ├── __tests__/ledger.test.mjs      (the live ledger)
│   ├── __tests__/order.test.mjs       (the simulated pick order, pure)
│   ├── __tests__/triage-match.test.mjs  (an issue to its spec, ambiguous, none, already in an open PR; pure: the PR lister injected)
│   ├── __tests__/workflow-lint.test.mjs  (the workflow rules, pure)
│   ├── __tests__/tick.test.mjs        (the PR-mode tick: fence, candidates, PR text; pure)
│   ├── __tests__/resolve.test.mjs     (the resolver's pure parts)
│   ├── __tests__/tick-run.test.mjs    (the PR-mode tick's pick, release and fence over git; slower, offline)
│   ├── __tests__/upgrade-plan.test.mjs  (the v1 to v2 converter, pure)
│   ├── __tests__/upgrade-plan-run.test.mjs  (the converter over git: dry run writes nothing, --write passes plan-check; slower, offline)
│   ├── __tests__/plot-run.test.mjs    (a plot unsettled and settled: settle, plan-check and order agree; slower, offline)
│   ├── __tests__/secrets.test.mjs     (the secrets manifest: its shape, the import, the CLI; names only, pure)
│   ├── __tests__/secrets-vault.test.mjs  (the vault's rings, the keychain through a stubbed runner, the CLI's names-only output)
│   ├── __tests__/secrets-sinks.test.mjs  (the sinks through a recording runner, never gh, vercel or wrangler; push refuses a contributor; the audit by name only)
│   ├── __tests__/secrets-audit.test.mjs  (set and rotation by name only, the rotation nudge, the secret request; temp dirs)
│   ├── __tests__/secrets-run.test.mjs  (secrets run and the diff scan: declared values only, masked output, hits by name)
│   ├── __tests__/secrets-scan-run.test.mjs  (secrets scan end to end in a scratch git repo; spawns git)
│   ├── __tests__/design-prompt.test.mjs  (scope, the prompt's numbering, the addendum continuing it, the item-hash diff; temp dirs)
│   ├── __tests__/design-ingest.test.mjs  (the ingest over a fixture export of tiny boards: manifest, README, the check, rehash; temp dirs)
│   ├── __tests__/design-compare.test.mjs  (the PNG round trip and row filters, the diff's threshold, alpha and sizes, the CLI; pure)
│   ├── __tests__/design-render.test.mjs  (the board index, imports, theme twins, the staged page, finding Chrome; pure)
│   ├── __tests__/design-render-run.test.mjs  (tiny boards rendered in Chrome and read back pixel by pixel; skips without Chrome)
│   ├── __tests__/design-port.test.mjs  (the port map over fixture handoffs; the Workflow script's pure meta, its module parse, its steps under stand-in agents)
│   ├── __tests__/bootstrap.test.mjs   (bootstrap's cloud-loop plan: the loop mode, the PR-mode files, the placeholders; pure)
│   ├── __tests__/worktree.test.mjs    (worktree close and list in scratch repos; slower, offline)
│   ├── __tests__/push-policy-hook.test.mjs  (the pre-push hook end to end in a scratch git repo; slower, offline)
│   └── __tests__/claims.test.mjs      (claims over git in scratch repos; slower, offline)
├── env/
│   ├── env.example                    → repo's .env.example
│   └── nexus.secrets.json             → repo root (secrets by name, never a value; nexus/customization/secrets.md)
└── workspace/                          → workspace ROOT, not any repo (adopt-by-need; see below)
    ├── CLAUDE.md                       (agent-facing root pointer)
    ├── AGENTS.md                       (same content, non-Claude-Code agents)
    ├── README.md                       (human-facing root orientation)
    └── REPOS.md                        (sibling-repo clone manifest)
```

## Placeholders

After copying, search-and-replace across the new files:

| Placeholder | Replace with | Example |
|---|---|---|
| `<PROJECT>` | Your product name | `acme` |
| `<PROJECT_LOWER>` | Lowercase variant | `acme` |
| `<PROJECT_TAGLINE>` | One-line description | `keyboards, deeply.` |
| `<HOSTING_URL>` | Live site URL | `https://acme.dev` |
| `<HOSTING_PROVIDER>` | Hosting provider | `Netlify` |
| `<REPO_SLUG>` | GitHub repo slug | `you/acme` |
| `<DEFAULT_BRANCH>` | Default branch | `main` |
| `<PROJECT_PKG_PREFIX>` | Workspace package prefix | `@acme` (or empty if not a monorepo) |

For the full bash and PowerShell one-liners that replace all
eight in one pass, see
[`playbooks/new-project.md`](../playbooks/new-project.md) §4 —
copy-paste from there rather than hand-rolling a partial
version here.

`setup/00_files.md`'s index also carries two fill-ins, `<SPEC_N>`
and `<SPEC_M>`: the numbers of the specs that touch a service
(its "Specs that touch it" column). v1 used other names
([`playbooks/upgrade.md`](../playbooks/upgrade.md) Step 2).

### Workspace placeholders (adopt-by-need)

`workspace/` is copied separately from the eight above — see
[`playbooks/workspace.md`](../playbooks/workspace.md) for the
replace step.

| Placeholder | Replace with | Example |
|---|---|---|
| `<WORKSPACE_ORG>` | GitHub org holding every sibling repo | `daretodave` |

### Per-capability placeholders (adopt-by-need)

A few more placeholders live inside specific templates, not
the tables above. Each is explained where it appears; this
table is the index — copy it over only if the project adopts
that capability.

| Placeholder | Lives in | Fill in with |
|---|---|---|
| `<CONTENT_LOCATION>` | `agents.md`, `bearings.md`, `ship-a-chunk.md` | Where copy/content lives, e.g. `content/*.mdx` |
| `<DATA_LOCATION>` | same three | Where structured data lives, e.g. `data/*.json` |
| `<PROVIDER_AUTH_TOKEN>` | `agents.md` "Operational secrets" | Your hosting provider's real token env var, e.g. `VERCEL_TOKEN` — only if the project has a deploy gate (`pnpm deploy:check`) |
| `<DOMAIN_SPECIALIST>` / `<SPECIALIST_NAME>` | `agents.md`'s and `bearings.md`'s sub-agent tables; `claude/agents/generic-specialist.md` | Copy `generic-specialist.md`, name it, add the table row — only if the project needs a domain specialist |
| `<CANONICAL SIBLING>` | `plan/02-canonical-sibling.md`, `plan/README.md` | Your project's first non-substrate feature surface — see "Don't copy these as-is" below |

`<DEPLOY_URL>` isn't search-replaced in a file — it's a CLI
argument inside example commands (`--deploy-url <DEPLOY_URL>`
in `ship-a-chunk.md`, `iterate.md`, `ship-data.md`): pass your
`<HOSTING_URL>` value there when you run the command, not when
you adopt the template.

## Don't copy these as-is

A few files in templates intentionally have project-specific
shape that you must fill in:

- `plan/bearings.md` — needs your stack, URL contract, voice,
  and the `Surface:` declaration (gates the optional branding
  capability).
- `plan/README.md` — needs your specs, one row each (ours
  lists the two starters; replace and extend)
- `plan/01-bootstrap.md` — needs your stack's bootstrap
  (Next.js, Django, Rails, etc.): design, acceptance IDs,
  chunks
- `plan/02-canonical-sibling.md` — needs your project's first
  non-substrate page-family / feature-surface in place of its
  `<CANONICAL SIBLING>` title (also appears in
  `plan/README.md`'s roadmap row)
- `plan/ARCHIVE.md` — delete the example lines; real lines
  arrive as chunks close

The plan shape (specs, chunks, acceptance IDs, the Measure
line, the archive) is explained in
[`concepts/plan-shape.md`](../concepts/plan-shape.md);
`scripts/plan-check.mjs` checks it.

For these, the templates are **scaffolds** showing the shape;
adapt content to your reality.

## Adopt-by-need files

A few files are part of the standard kit but only useful for
projects that actually need them. Copy them only when adopting
the corresponding capability:

| File | Adopt when |
|---|---|
| `skills/ship-data.md` + `claude/commands/ship-data.md` | The project has a structured data layer (`gh-as-db`, `hybrid-with-managed-postgres`, `pure-db`, `saas-cms`). See `nexus/customization/data-layer.md`. |
| `skills/ship-migration.md` + `claude/commands/ship-migration.md` + `scripts/lint-migration.mjs` | `Structured data` is `pure-db` or `hybrid-with-managed-postgres` — the project has a managed-Postgres (or compatible) DB. See `nexus/customization/data-layer.md` Patterns B and D. |
| `skills/ship-asset.md` + `claude/commands/ship-asset.md` + `claude/agents/brander.md` | `Surface: site` or `hybrid` AND you want the loop to render brand assets (OG images, favicons, social cards, SVG → PNG, wordmarks). Demand-pull only — drains findings filed by `/critique`, `/iterate`, or an `/oversight` brand pass. See `nexus/customization/branding.md`. |
| `skills/moderate.md` + `claude/commands/moderate.md` | The project has UGC (comments, submissions, votes, flags) and needs a dedicated queue-drain skill (Option A). See `nexus/customization/moderation-loop.md`. |
| `plan/CURRENT-STATE.md` | This is a brownfield retrofit, not a greenfield start. See `nexus/playbooks/existing-project.md` §1. |
| `setup/00_files.md` + `setup/NN_service.md` | The project depends on any external service beyond hosting (auth provider, managed DB, email service, AI API). See `nexus/customization/external-services.md`. |
| `claude/settings.json` + `claude/hooks/guard.mjs` + `claude/CLAUDE.md` + `scripts/notify.mjs` | You run the loop on Claude Code and want unattended levels (3–4): pre-approved permissions, hook-enforced hard rules, and a pager. See `nexus/customization/claude-code.md` + `nexus/playbooks/hands-off.md`. |
| `scripts/refresh-critique-session.mjs` + `scripts/check-secrets-liveness.mjs` | `bearings.md`'s `Auth:` is anything other than `none` — Pattern B session refresh + the GH_TOKEN/`CRITIQUE_*` liveness probe for hands-off pre-flight. See `nexus/customization/auth-aware-critique.md`. |
| `skills/digest.md` + `claude/commands/digest.md` + `.github/workflows/night.yml` + `.github/workflows/heartbeat.yml` | The cloud loop is live and you want the rest of the genus: a daily morning briefing (`plan/DIGEST.md`), nightly breadth checks, and a model-free watchdog. See `nexus/concepts/loop-shapes.md`. |
| `skills/bootstrap.md` + `claude/commands/bootstrap.md` + `scripts/bootstrap.mjs` | You plan to run `/bootstrap` as the setup executor (tokens-in to deployed app + ticking cloud loop). See `nexus/customization/bootstrap-automation.md`. |
| `.github/workflows/pr-flow.yml` + `.github/workflows/pr-resolve.yml` + `scripts/cloud/tick.mjs` + `scripts/pr/resolve.mjs` | The cloud loop lands as pull requests (`NEXUS_LOOP_MODE` unset): ticks claim one chunk as `cloud-<run id>`, build with no token, land a PR; a closed PR's claims are released and conflicted PRs get main merged in. Needs the claims module. See `.github/CLOUD_LOOP.md` "Owner mode or pull requests" and `nexus/playbooks/cloud-loop-existing-actions.md`. |
| `.github/workflows/claims-board.yml` + `scripts/claims-board.mjs` | More than the loop's builders want to see who builds what: one issue shows the live claims, redrawn hourly and on each claims write. Off until the repo variable `NEXUS_CLAIMS_BOARD` is `claims-board.yml`. Needs the claims module. See `nexus/customization/claims.md` "The board (optional)". |
| `.github/workflows/nightly-smoke.yml` | Hermetic e2e is adopted and `night.yml` doesn't already run `SMOKE_SAMPLE=full` as its breadth step — run one or the other, never both. See `nexus/customization/hermetic-e2e.md` + `nexus/concepts/loop-shapes.md`. |
| `workspace/CLAUDE.md` + `workspace/AGENTS.md` + `workspace/README.md` + `workspace/REPOS.md` | You've outgrown polyrepo into a 3+-repo workspace (an un-versioned local root holding `plan/` and every product as siblings). Copy all four to the workspace root, not into any single repo. See `nexus/playbooks/workspace.md`. |
| `scripts/stack-lifecycle.mjs` | Hermetic e2e uses Pattern B (service with stateful dependencies). See `nexus/customization/hermetic-e2e.md`. |
| `design-prompt.md` (copy to `<repo>/claude-design.prompt.md`) | The project has a deliberate visual identity worth a system layer (not just assets). See `nexus/customization/visual-system.md`. |
| `skills/design.md` + `skills/design/ingest.md` + `skills/design/render.md` + `skills/design/port.md` + `claude/commands/design.md` + `scripts/design/` (prompt, ingest, render, compare, port-map, port.workflow.js) | The owner designs whole screens in Claude Design and the repo takes the artifact back: `/design prompt` and `/design addendum` write the paste from the plan, stored in `design/prompts/`; `/design ingest` keeps the artifact in `design/handoff/<date>/` with a manifest and plots the port; `render.mjs` and `compare.mjs` draw the boards in an installed Chrome and score the app against them; `port.workflow.js` runs the port as a Workflow, and `port-map.mjs check` keeps every board ported, skipped with a reason, or pending (add it to your gate). See `nexus/playbooks/design-handoff.md`. |
| `scripts/announce.mjs` + `scripts/ledger.mjs` + `scripts/worktree.mjs` + `skills/tidy.md` + `skills/rebooting.md` + `skills/reboot-ready.md` + `skills/reboot-resume.md` (+ their commands) | More than one session runs on one machine (two `/heads-down` loops, the GUI): a notice board, a live ledger per session, safe worktree closes. See `nexus/customization/sessions.md`. |
| `identity/` (all five files) + `identity/footguns.md merge=union` in `.gitattributes` | Specs close often and more than one person or loop builds: lasting rules need a home, and a trap seen twice should become automation (settle runs the ladder). The alternative to `plan/reflexes.md` + `plan/lessons.md`; adopt one. See `nexus/customization/identity-layer.md`. |
| `plan/reflexes.md` + `plan/lessons.md` | The loop has run long enough to accumulate real recurring lessons and a single `NEXUS_LESSONS.md` scratch file no longer scales. See `nexus/customization/lessons-layer.md`. |

If your `bearings.md` declares `Surface: service / library /
cli`, do not copy `ship-asset.md` / `brander.md` — the skill
would no-op anyway and the presence is misleading.

Branding does not get its own `AskUserQuestion`-allowed
skill. When the project needs taste calls (mood, accent,
wordmark treatment), the user runs `/oversight` — that's
already the user-in-the-loop exception (`/bootstrap` carries
the only other one, for provisioning), and it's plenty.

## Reference implementations

The real projects in the root README's
[Provenance](../README.md#provenance) section (an editorial
content site on Next.js + MDX-in-repo + JSON-as-DB, and a
data-heavy site with weekly automation) are reference
implementations you can copy from instead of (or alongside)
these templates.

If you're building something close to one of these shapes, copy
that project's `skills/`, `plan/`, `.claude/` and adapt names —
faster than starting from these templates.
