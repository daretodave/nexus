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
│   ├── PHASE_CANDIDATES.md
│   ├── reflexes.md                    (omit unless the lessons layer is adopted; see below)
│   ├── lessons.md                     (omit unless the lessons layer is adopted; see below)
│   └── CURRENT-STATE.md               (brownfield retrofit only; see existing-project.md)
├── skills/                            → repo's skills/
│   ├── next.md                        (one chunk, done fully: pick, claim, delegated build, gate, pending close, land per owner mode)
│   ├── next/build.md                  (/next's delegated build: worktree, builder brief, Workflow shape, harvest)
│   ├── next/land.md                   (/next's close and land: settle, pending file, owner main vs contributor PR)
│   ├── heads-down.md                  (ask up front, claim a list, loop /next assuming defaults, ASCII progress)
│   ├── tidy.md                        (clear dead claims; offer idle worktrees and merged branches in one question)
│   ├── rebooting.md                   (reboot train, owner's terminal: announce, ack, one resume line per loop)
│   ├── reboot-ready.md                (reboot train, inside a loop: stop children, keep work and claims, park the ledger)
│   ├── reboot-resume.md               (reboot train, after the restart or a crash: take the ledger, carry on)
│   ├── ship-a-chunk.md
│   ├── ship-data.md                   (omit if no structured data layer)
│   ├── ship-migration.md              (omit unless Structured data: pure-db / hybrid-with-managed-postgres)
│   ├── ship-asset.md                  (omit unless Surface: site/hybrid AND branding in scope)
│   ├── moderate.md                    (omit unless the project has UGC; see customization/moderation-loop.md)
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
│   ├── workflows/march.yml            (the dispatcher)
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
│   ├── pulse.mjs                      (offline instrument panel: queue/build-plan/candidate counts, no network)
│   ├── bootstrap.mjs                  (provider-CLI executor, opt-in)
│   ├── lint-migration.mjs             (additive-migration linter, pairs with ship-migration.md)
│   ├── refresh-critique-session.mjs   (Pattern B session refresh, omit unless Auth: is set)
│   ├── check-secrets-liveness.mjs     (GH_TOKEN + CRITIQUE_* liveness probe, omit unless Auth: is set)
│   ├── stack-lifecycle.mjs            (Pattern B port/health/state helpers, omit unless hermetic e2e is Pattern B)
│   ├── new-skill.mjs                  (skill scaffolder: emits skills/<name>.md + claude/commands/<name>.md)
│   ├── install-hooks.mjs              (opt-in: arms pnpm verify as pre-commit, the push policy as pre-push)
│   ├── plan-check.mjs                 (the plan-shape gate; add it to your verify composition)
│   ├── owner.mjs                      (effective owner mode: .owner + .nexus/local.json; who settles and lands on main)
│   ├── git/push-policy.mjs            (pre-push: a push to main outside owner mode is refused; the claims ref passes)
│   ├── plan/pending.mjs               (reads plan/pending/<id>.md; a pending close counts as closed)
│   ├── plan/settle.mjs                (the owner's settle: pending files -> spec, roadmap, archive, decisions, footguns)
│   ├── plan/settled.mjs               (the plan as it reads once pending edits settle, in memory)
│   ├── plan/config.mjs                (what settle may differ on per repo; overrides in plan/settle.json)
│   ├── plan/footguns.mjs              (the footgun list's format and budget lint)
│   ├── plan/progress.mjs              (ASCII progress per spec: the bar, closed struck, <--- [here], ETAs from sizes)
│   ├── claims-codec.mjs               (the claims rules as pure functions: any claimant imports them)
│   ├── claims.mjs                     (who builds what: the orphan claims branch, compare-and-swap; --json)
│   ├── announce.mjs                   (the notice board: .announcements.md; owner lines outrank the command, REBOOT preempts)
│   ├── ledger.mjs                     (each session's live ledger in .nexus/sessions/: star names; a stale beat reads fallen)
│   ├── worktree.mjs                   (close a worktree without deleting through its links; list them for /tidy)
│   ├── __tests__/loop-issue.test.mjs  (unit tests, node:test, no devDeps)
│   ├── __tests__/plan-check.test.mjs  (unit tests for plan-check.mjs)
│   ├── __tests__/pending.test.mjs     (pending files, the config, the settled view)
│   ├── __tests__/settle.test.mjs      (settle's pure functions)
│   ├── __tests__/settle-run.test.mjs  (settle end to end in a scratch git repo; slower, offline)
│   ├── __tests__/claims-codec.test.mjs  (the claims rules, pure)
│   ├── __tests__/push-policy.test.mjs  (the push policy, pure)
│   ├── __tests__/progress.test.mjs    (the progress view, pure)
│   ├── __tests__/announce.test.mjs    (the notice board)
│   ├── __tests__/ledger.test.mjs      (the live ledger)
│   ├── __tests__/worktree.test.mjs    (worktree close and list in scratch repos; slower, offline)
│   ├── __tests__/push-policy-hook.test.mjs  (the pre-push hook end to end in a scratch git repo; slower, offline)
│   └── __tests__/claims.test.mjs      (claims over git in scratch repos; slower, offline)
├── env/
│   └── env.example                    → repo's .env.example
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
| `<PROJECT>` | Your product name | `thock` |
| `<PROJECT_LOWER>` | Lowercase variant | `thock` |
| `<PROJECT_TAGLINE>` | One-line description | `keyboards, deeply.` |
| `<HOSTING_URL>` | Live site URL | `https://thock.xyz` |
| `<HOSTING_PROVIDER>` | Hosting provider | `Netlify` |
| `<REPO_SLUG>` | GitHub repo slug | `daretodave/thock` |
| `<DEFAULT_BRANCH>` | Default branch | `main` |
| `<PROJECT_PKG_PREFIX>` | Workspace package prefix | `@thock` (or empty if not a monorepo) |

For the full bash and PowerShell one-liners that replace all
eight in one pass, see
[`playbooks/new-project.md`](../playbooks/new-project.md) §4 —
copy-paste from there rather than hand-rolling a partial
version here.

### Workspace placeholders (adopt-by-need)

`workspace/` is copied separately from the eight above — see
[`playbooks/workspace.md`](../playbooks/workspace.md) for the
replace step.

| Placeholder | Replace with | Example |
|---|---|---|
| `<WORKSPACE_ORG>` | GitHub org holding every sibling repo | `daretodave` |

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
  non-substrate page-family / feature-surface
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
| `.github/workflows/nightly-smoke.yml` | Hermetic e2e is adopted and `night.yml` doesn't already run `SMOKE_SAMPLE=full` as its breadth step — run one or the other, never both. See `nexus/customization/hermetic-e2e.md` + `nexus/concepts/loop-shapes.md`. |
| `workspace/CLAUDE.md` + `workspace/AGENTS.md` + `workspace/README.md` + `workspace/REPOS.md` | You've outgrown polyrepo into a 3+-repo workspace (an un-versioned local root holding `plan/` and every product as siblings). Copy all four to the workspace root, not into any single repo. See `nexus/playbooks/workspace.md`. |
| `scripts/stack-lifecycle.mjs` | Hermetic e2e uses Pattern B (service with stateful dependencies). See `nexus/customization/hermetic-e2e.md`. |
| `design-prompt.md` (copy to `<repo>/claude-design.prompt.md`) | The project has a deliberate visual identity worth a system layer (not just assets). See `nexus/customization/visual-system.md`. |
| `scripts/install-hooks.mjs` | You want `pnpm verify` to run automatically on hand commits made outside the loop, and (with `scripts/git/push-policy.mjs`) a push to main refused outside owner mode. Opt-in — run it once per checkout (`node scripts/install-hooks.mjs`; `--only pre-push` for just the policy) to arm the `pre-commit` and `pre-push` hooks; `--uninstall` removes them. See `nexus/customization/verify-gate.md` + `nexus/playbooks/owner-mode.md`. |
| `scripts/announce.mjs` + `scripts/ledger.mjs` + `scripts/worktree.mjs` + `skills/tidy.md` + `skills/rebooting.md` + `skills/reboot-ready.md` + `skills/reboot-resume.md` (+ their commands) | More than one session runs on one machine (two `/heads-down` loops, the GUI): a notice board, a live ledger per session, safe worktree closes. See `nexus/customization/sessions.md`. |
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

Two real projects you can copy from instead of (or alongside)
these templates:

- **thock** (editorial content site, monorepo, Next.js +
  MDX-in-repo + JSON-as-DB) — `https://github.com/daretodave/thock`
- **tickpedia** (data-heavy site with weekly automation) — see
  the project's own repo if accessible.

If you're building something close to one of these shapes, copy
that project's `skills/`, `plan/`, `.claude/` and adapt names —
faster than starting from these templates.
