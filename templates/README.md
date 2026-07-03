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
│   ├── README.md
│   ├── bearings.md
│   ├── AUDIT.md
│   ├── CRITIQUE.md
│   ├── PHASE_CANDIDATES.md
│   ├── steps/01_build_plan.md
│   └── phases/
│       ├── phase_1_bootstrap.md
│       └── phase_canonical_sibling.md
├── skills/                            → repo's skills/
│   ├── ship-a-phase.md
│   ├── ship-data.md                   (omit if no structured data layer)
│   ├── ship-asset.md                  (omit unless Surface: site/hybrid AND branding in scope)
│   ├── plan-a-phase.md
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
│   ├── CLAUDE.md                      (two-line pointer at agents.md; copy to repo ROOT)
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
│   └── CLOUD_LOOP.md
├── scripts/                           → repo's scripts/
│   ├── deploy-check.mjs               (the deploy gate)
│   ├── loop-issue.mjs                 (GitHub issue mirror)
│   ├── notify.mjs                     (the pager — blocked is loud)
│   └── bootstrap.mjs                  (provider-CLI executor, opt-in)
└── env/
    └── env.example                    → repo's .env.example
```

## Placeholders

After copying, search-and-replace across the new files:

| Placeholder | Replace with | Example |
|---|---|---|
| `<PROJECT>` | Your product name | `thock` |
| `<PROJECT_LOWER>` | Lowercase variant | `thock` |
| `<PROJECT_TAGLINE>` | One-line description | `keyboards, deeply.` |
| `<HOSTING_URL>` | Live site URL | `https://thock.netlify.app` |
| `<HOSTING_PROVIDER>` | Hosting provider | `Netlify` |
| `<REPO_SLUG>` | GitHub repo slug | `daretodave/thock` |
| `<DEFAULT_BRANCH>` | Default branch | `main` |
| `<PROJECT_PKG_PREFIX>` | Workspace package prefix | `@thock` (or empty if not a monorepo) |

POSIX one-liner for the bulk of it (run from your repo root):

```bash
PROJECT=thock
HOSTING_URL=https://thock.netlify.app
PROVIDER=Netlify
REPO=daretodave/thock

grep -rl '<PROJECT>' ./skills ./.claude ./plan ./agents.md \
  | xargs sed -i "s|<PROJECT>|${PROJECT}|g"
grep -rl '<HOSTING_URL>' ./skills ./.claude ./plan ./agents.md \
  | xargs sed -i "s|<HOSTING_URL>|${HOSTING_URL}|g"
# ...etc per the table above
```

(On Windows native, edit by hand — the surface is small.
PowerShell can replicate the loop if you prefer scripts.)

## Don't copy these as-is

A few files in templates intentionally have project-specific
shape that you must fill in:

- `plan/bearings.md` — needs your stack, URL contract, voice,
  and the `Surface:` declaration (gates the optional branding
  capability).
- `plan/steps/01_build_plan.md` — needs your phases (ours
  describes a generic content-site shape; replace)
- `plan/phases/phase_1_bootstrap.md` — needs your stack's
  bootstrap (Next.js, Django, Rails, etc.)
- `plan/phases/phase_canonical_sibling.md` — needs your project's
  first non-substrate page-family / feature-surface

For these, the templates are **scaffolds** showing the shape;
adapt content to your reality.

## Adopt-by-need files

A few files are part of the standard kit but only useful for
projects that actually need them. Copy them only when adopting
the corresponding capability:

| File | Adopt when |
|---|---|
| `skills/ship-data.md` | The project has a structured data layer (`gh-as-db`, `hybrid-with-managed-postgres`, `pure-db`, `saas-cms`). See `nexus/customization/data-layer.md`. |
| `skills/ship-asset.md` + `claude/agents/brander.md` | `Surface: site` or `hybrid` AND you want the loop to render brand assets (OG images, favicons, social cards, SVG → PNG, wordmarks). Demand-pull only — drains findings filed by `/critique`, `/iterate`, or an `/oversight` brand pass. See `nexus/customization/branding.md`. |
| `setup/00_files.md` + `setup/NN_service.md` | The project depends on any external service beyond hosting (auth provider, managed DB, email service, AI API). See `nexus/customization/external-services.md`. |
| `claude/settings.json` + `claude/hooks/guard.mjs` + `claude/CLAUDE.md` + `scripts/notify.mjs` | You run the loop on Claude Code and want unattended levels (3–4): pre-approved permissions, hook-enforced hard rules, and a pager. See `nexus/customization/claude-code.md` + `nexus/playbooks/hands-off.md`. |
| `skills/digest.md` + `claude/commands/digest.md` + `.github/workflows/night.yml` + `.github/workflows/heartbeat.yml` | The cloud loop is live and you want the rest of the genus: a daily morning briefing (`plan/DIGEST.md`), nightly breadth checks, and a model-free watchdog. See `nexus/concepts/loop-shapes.md`. |
| `design-prompt.md` (copy to `<repo>/claude-design.prompt.md`) | The project has a deliberate visual identity worth a system layer (not just assets). See `nexus/customization/visual-system.md`. |

If your `bearings.md` declares `Surface: service / library /
cli`, do not copy `ship-asset.md` / `brander.md` — the skill
would no-op anyway and the presence is misleading.

Branding does not get a second `AskUserQuestion`-allowed
skill. When the project needs taste calls (mood, accent,
wordmark treatment), the user runs `/oversight` — that's
already the user-in-the-loop exception, and it's plenty.

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
