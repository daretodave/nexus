# Templates

Copy these into your target repo per the playbook
(`../playbooks/new-project.md` or
`../playbooks/existing-project.md`).

## Layout

```
templates/
├── agents.md                          → repo root
├── plan/                              → repo's plan/
│   ├── README.md
│   ├── bearings.md
│   ├── AUDIT.md
│   ├── CRITIQUE.md
│   ├── steps/01_build_plan.md
│   └── phases/
│       ├── phase_1_bootstrap.md
│       └── phase_canonical_sibling.md
├── skills/                            → repo's skills/
│   ├── ship-a-phase.md
│   ├── ship-data.md                   (omit if no GitHub-as-DB)
│   ├── plan-a-phase.md
│   ├── iterate.md
│   ├── critique.md
│   ├── triage.md
│   ├── march.md
│   └── oversight.md
├── claude/                            → repo's .claude/
│   ├── commands/                      (one terse pointer per skill)
│   └── agents/                        (sub-agent definitions)
├── data/                              → repo's data/ (if using GitHub-as-DB)
│   ├── README.md
│   ├── BACKLOG.md
│   └── AUDIT.md
├── scripts/
│   └── deploy-check.mjs               → repo's scripts/
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

- `plan/bearings.md` — needs your stack, URL contract, voice
- `plan/steps/01_build_plan.md` — needs your phases (ours
  describes a generic content-site shape; replace)
- `plan/phases/phase_1_bootstrap.md` — needs your stack's
  bootstrap (Next.js, Django, Rails, etc.)
- `plan/phases/phase_canonical_sibling.md` — needs your project's
  first non-substrate page-family / feature-surface

For these, the templates are **scaffolds** showing the shape;
adapt content to your reality.

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
