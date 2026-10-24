# Playbook: new project (greenfield)

> Adopt the autonomous-loop methodology in a fresh repo with a
> spec but little or no code. Estimated time: **2–3 hours** of
> setup before your first `/next` invocation, worked
> manually, section by section, at human reading pace. An
> autonomous agent delegated the whole playbook in one paste
> (README's TL;DR) has no read-and-decide pauses and typically
> finishes in well under an hour — that's the faster figure
> quoted there.
>
> By the end, you'll have:
> - A `spec.md` everyone trusts
> - A `plan/bearings.md` that locks the stack and conventions
> - A `plan/README.md` roadmap with one row per spec
> - Two specs ready to ship, chunked (the bootstrap + the
>   canonical sibling)
> - The skill set in `skills/` (count varies with which
>   adopt-by-need files you keep)
> - Slash-command pointers in `.claude/commands/`
> - 2–4 sub-agent definitions
> - A working verify gate (locally)
> - A working deploy gate (post-push)
> - `/next` ready to run

---

## Prerequisites

- A repo (empty or near-empty) initialized with `git init`.
- A `spec.md` describing what you're building. **One page is
  enough.** It needs: who the user is, what the product does,
  what's in scope for v1, what's deliberately out of scope.
  - If you have a pitch but no spec, run
    [`pre-spec.md`](./pre-spec.md) first — a 30-minute
    interactive session that produces `spec.md` and a
    `bearings.md` stub.
- A hosting provider you've picked (Netlify, Vercel, Fly.io,
  etc.). See [`ci-providers.md`](./ci-providers.md).
- Node 20+ installed, plus **pnpm**. The templates aren't just
  a naming convention: `templates/claude/settings.json`'s
  permission allowlist hardcodes `Bash(pnpm verify:*)`,
  `Bash(pnpm test:*)`, etc., so an unattended loop running
  npm/yarn/bun scripts stalls on a permission prompt every tick
  — the opposite of the walk-away pitch. If you must use a
  different package manager, sed-replace `pnpm` throughout the
  copied templates (mind `npm` needing `run` where `pnpm`
  doesn't) **and** add matching `Bash(<manager> <script>:*)`
  entries to `settings.json`'s `allow` list before your first
  unattended tick.
- A GitHub repo (or GitLab/equivalent) — push to `main`
  triggers deploy.

---

## The plan

You'll work through this top to bottom. Estimated time per
section in brackets.

1. Lock the spec [15 min]
2. Choose your stack and write `bearings.md` [30 min]
3. Choose your specs and write the roadmap [30 min]
4. Copy templates and replace placeholders [15 min]
5. Write the bootstrap spec in detail [20 min]
6. Wire the verify gate [20 min]
7. Wire the deploy gate [20 min]
8. Author 2–4 sub-agents [15 min]
9. (Optional) Run `/bootstrap` to provision external services [10–20 min]
10. Smoke-test by running `/next` once [15 min]
11. Ratchet up the autonomy [variable]

---

## 1. Lock the spec

Your `spec.md` is the anchor. Read it once now and ask yourself:

- **Is the v1 scope clear?** If you can't list 5–10 features that
  v1 must have, the spec is too vague.
- **Is the stack implied?** If the spec says "static editorial
  site," that's enough — bearings will fill in the framework.
  If it says "real-time collab tool," the stack matters more.
- **Is the audience specific?** "Developers" is too broad.
  "Backend engineers evaluating Postgres" is specific.
- **Are non-goals listed?** Explicit non-goals save 50 hours
  later.

Edit the spec until those four pass. Commit it.

---

## 2. Stack + bearings

Every `nexus/...` path below assumes the README's recommended
sibling clone (`../nexus`, next to your project root) —
adjust if you put your checkout somewhere else (e.g. `./.nexus`
if submoduled).

`plan/` doesn't exist yet at this point, so create it before
copying `bearings.md` in:

```bash
mkdir -p plan
cp ../nexus/templates/plan/bearings.md plan/bearings.md
```

The PowerShell twin, Windows native:

```powershell
New-Item -ItemType Directory -Force plan | Out-Null
Copy-Item ..\nexus\templates\plan\bearings.md plan\bearings.md
```

Replace these placeholders:

- `<PROJECT>` → your product name (lowercase if applicable, e.g.
  `acme`)
- `<PROJECT_TAGLINE>` → one-line description
- `<HOSTING_URL>` → e.g. `https://acme.dev`
- `<HOSTING_PROVIDER>` → Netlify / Vercel / etc.
- `<DEFAULT_BRANCH>` → usually `main`

Then fill in these sections:

### Stack pins

The "Stack (locked — do not re-litigate)" table. Pick:

- Framework (Next.js / SvelteKit / Astro / Remix / Django / etc.)
- Language (TypeScript strict / Python / Go)
- Styling (Tailwind / CSS modules / Vanilla / Emotion)
- Content layer (MDX-in-repo / headless CMS / database / none)
- Test runner (Vitest / Jest / Playwright / pytest)
- E2E (Playwright / Cypress)
- Lint + format (ESLint + Prettier / Biome / Ruff / etc.)
- Package manager (pnpm / npm / yarn / poetry / cargo)

Pick by what your team already knows. Don't optimize for the
methodology — the methodology is stack-agnostic.

### URL contract / API contract / output contract

The product's external contract — every URL the site serves,
every API endpoint, every CLI command. **Lock these on day one;
they're harder to change later than you think.**

For an editorial site: list every route.
For an API: list every endpoint with method + path.
For a CLI: list every subcommand.

### Visual / tonal defaults

If you have design exports, point at them. If not, write the
defaults: dark mode default? type families? palette intent?
Voice tone (knowledgeable peer / breezy / formal)?

### Standing decisions

The "the loop will never ask you about these" list. Sample:

- Pagination: none until N items.
- Sort: newest first.
- Empty-state copy template.
- Error-state styling.
- Top-N count for lists.
- Comments / login / payments — out of scope in every spec.

Add a row every time you find yourself answering the same
question twice during the build.

### Hard rules

Carry over from `../nexus/templates/agents.md` Standing Rules. These
are universal:

1. Land per owner mode: the owner's checkout (`.owner`) commits
   and pushes main as one act; every other checkout lands
   through pull requests ([`owner-mode.md`](./owner-mode.md)).
2. No `Co-Authored-By:` trailers, no emojis.
3. Verify gate non-negotiable; deploy gate runs after every push.
4. No `--no-verify`, no force-push.
5. Tests alongside code.
6. Ask before the first write, or not at all; loops take
   defaults and log them.

Choose the mode now, owner or contributor, before the first
write (the adopt prompt asks it with its other questions;
owner is the default when you own the repo). Either way,
`.owner` and `.nexus/` go in `.gitignore` (step 3 writes it);
the owner's checkout also gets an untracked `.owner`. With no
`.owner`, every change lands as a pull request. Before the
first push (§4 copies the script), run
`node scripts/install-hooks.mjs`
in either mode to arm the hooks
([`owner-mode.md`](./owner-mode.md) Step 2).

Add project-specific ones (e.g. "site name lowercase", "content
stays in MDX").

Commit `bearings.md` separately. It's the most-read file in the
loop after the roadmap.

---

## 3. Specs + roadmap

The plan is specs, chunks and acceptance IDs: one spec per
initiative, each ending in chunks sized to one session (the
model: [`concepts/plan-shape.md`](../concepts/plan-shape.md)).
Copy the roadmap, the archive, the lock and the two starter
specs in:

```bash
mkdir -p plan/pending
cp ../nexus/templates/plan/README.md ../nexus/templates/plan/ARCHIVE.md \
  ../nexus/templates/plan/nexus.lock \
  ../nexus/templates/plan/01-bootstrap.md \
  ../nexus/templates/plan/02-canonical-sibling.md plan/
cp ../nexus/templates/plan/pending/README.md plan/pending/README.md
```

The PowerShell twin, Windows native:

```powershell
New-Item -ItemType Directory -Force plan\pending | Out-Null
Copy-Item ..\nexus\templates\plan\README.md, ..\nexus\templates\plan\ARCHIVE.md, `
  ..\nexus\templates\plan\nexus.lock, `
  ..\nexus\templates\plan\01-bootstrap.md, `
  ..\nexus\templates\plan\02-canonical-sibling.md plan\
Copy-Item ..\nexus\templates\plan\pending\README.md plan\pending\README.md
```

Set `adopted:` in `plan/nexus.lock` to today's date: the lock
records which kit version (and plan shape) this repo follows,
and [`upgrade.md`](./upgrade.md) is how it ever changes.

### Git plumbing: `.gitattributes` + `.gitignore`

`plan/ARCHIVE.md` needs `merge=union` so concurrent chunk
closes append rather than conflict (its own header says so);
and a greenfield repo has no `.gitignore` yet either. Write
both now, while you're already touching `plan/`:

```bash
cat > .gitattributes <<'EOF'
* text=auto eol=lf
plan/ARCHIVE.md merge=union
EOF
cat > .gitignore <<'EOF'
node_modules/
.env
.env.workspace
.env.local
.env.*.local
.owner
.nexus/
.announcements.md
EOF
```

The PowerShell twin, Windows native:

```powershell
Set-Content .gitattributes @(
  '* text=auto eol=lf'
  'plan/ARCHIVE.md merge=union'
)
Set-Content .gitignore @(
  'node_modules/'
  '.env'
  '.env.workspace'
  '.env.local'
  '.env.*.local'
  '.owner'
  '.nexus/'
  '.announcements.md'
)
```

`plan/README.md` is what the loop reads: its lanes (Asap,
Held) and one row per spec, in build order. Specs group into:

- **Substrate**: bootstrap, content/data layer, URL contract
  scaffolding.
- **Feature surfaces**: the bulk of the build; the first one
  is the canonical sibling every later one mirrors.
- **Cross-cutting** (last): polish, perf, a11y.

For your project, work backward from the spec:

1. List every distinct surface the v1 has (pages, screens,
   commands, endpoints).
2. Group them. Each group is one spec, `plan/NN-<slug>.md`,
   numbered in build order; the number is its id for life.
3. Keep `01-bootstrap.md` first and make
   `02-canonical-sibling.md` your first feature surface
   (rename it to its real slug and fix its row's link).
4. Add cross-cutting specs at the end.
5. A spec you won't build soon can stay a one-paragraph Why +
   a few acceptance IDs + `Not chunked yet.` under its
   `## Chunks`: the first build that picks it chunks it.

Every spec ends with a `Measure:` line and its chunks (S, M or
L; L is one session at most). Step 5 fills in the two starters.
Commit the roadmap and the specs.

---

## 4. Copy the rest of the templates

One sequence, three sub-steps, run in order: copy, then sweep
placeholders over what you just copied, then prune what your
project doesn't need. Running them out of order is the one
reliable way to leave stale tokens or dead files behind —
sweep before prune, prune after sweep, never the reverse.

### Copy

Run from your repo root. This is one `node` command (Node
20+, already a prerequisite) so it runs identically in
bash/zsh, PowerShell, or `cmd.exe` — no shell twin needed:

```bash
node -e "const fs=require('fs');for(const [s,d] of [['templates/skills','skills'],['templates/claude','.claude'],['templates/claude/CLAUDE.md','CLAUDE.md'],['templates/scripts','scripts'],['templates/agents.md','agents.md'],['templates/env/env.example','.env.example'],['templates/env/nexus.secrets.json','nexus.secrets.json'],['templates/plan/AUDIT.md','plan/AUDIT.md'],['templates/plan/CRITIQUE.md','plan/CRITIQUE.md'],['templates/plan/CANDIDATES.md','plan/CANDIDATES.md']]) fs.cpSync('../nexus/'+s,d,{recursive:true})"
```

(The `CLAUDE.md` line is deliberate, not redundant with the
`.claude` copy above it: Claude Code auto-loads `CLAUDE.md`
from the repo root, not from `.claude/`, so the pointer file
needs both copies to actually fire.)

(If using GitHub-as-DB, also copy `../nexus/templates/data/` to
`./data/`. See [`customization/data-layer.md`](../customization/data-layer.md)
to decide.

```bash
cp -r ../nexus/templates/data ./data
```

The PowerShell twin, Windows native:

```powershell
Copy-Item -Recurse ..\nexus\templates\data .\data
```

If you copy it, add `./data` to the search-and-replace
scope below — both one-liners already include it, so nothing
else to change.)

### Replace placeholders

Now do a global search-and-replace across the copied files:

| Find | Replace with |
|---|---|
| `<PROJECT>` | your project name (e.g. `acme`) |
| `<PROJECT_LOWER>` | lowercase variant if different |
| `<PROJECT_TAGLINE>` | one-line description |
| `<HOSTING_URL>` | `https://your-site.netlify.app` |
| `<HOSTING_PROVIDER>` | `Netlify` / `Vercel` / etc. |
| `<REPO_SLUG>` | `your-org/your-repo` |
| `<DEFAULT_BRANCH>` | usually `main` |
| `<PROJECT_PKG_PREFIX>` | workspace package prefix, e.g. `@acme` (empty if not a monorepo) |
| `<PACKAGE_MANAGER>` | your package manager, e.g. `pnpm` / `npm` / `yarn` |

A one-liner that replaces all nine, bash/zsh/WSL/macOS.
Uses `-i.bak` (suffix attached, no space) rather than bare
`-i` — stock macOS `sed` is BSD sed, which requires a backup
suffix argument and otherwise misparses the following `-e` as
that argument and errors out; `-i.bak` is the one spelling
both BSD and GNU sed accept identically, so the trailing
`find` just cleans up the backups it forces:

```bash
grep -rl '<PROJECT>\|<PROJECT_LOWER>\|<PROJECT_TAGLINE>\|<HOSTING_URL>\|<HOSTING_PROVIDER>\|<REPO_SLUG>\|<DEFAULT_BRANCH>\|<PROJECT_PKG_PREFIX>\|<PACKAGE_MANAGER>' \
    ./skills ./.claude ./plan ./agents.md ./scripts ./.env.example ./data \
  2>/dev/null | xargs sed -i.bak \
      -e 's/<PROJECT_LOWER>/acme/g' \
      -e 's/<PROJECT>/acme/g' \
      -e 's/<PROJECT_TAGLINE>/keyboards, deeply./g' \
      -e 's/<HOSTING_URL>/https:\/\/acme.dev/g' \
      -e 's/<HOSTING_PROVIDER>/Netlify/g' \
      -e 's/<REPO_SLUG>/you\/acme/g' \
      -e 's/<DEFAULT_BRANCH>/main/g' \
      -e 's/<PROJECT_PKG_PREFIX>/@acme/g' \
      -e 's/<PACKAGE_MANAGER>/pnpm/g' \
  && find . -name '*.bak' -delete
```

The PowerShell twin, Windows native (see
[`windows-notes.md`](./windows-notes.md) for the hazards page
this pairs with):

```powershell
$repl = @{
  '<PROJECT>'             = 'acme'
  '<PROJECT_LOWER>'       = 'acme'
  '<PROJECT_TAGLINE>'     = 'keyboards, deeply.'
  '<HOSTING_URL>'         = 'https://acme.dev'
  '<HOSTING_PROVIDER>'    = 'Netlify'
  '<REPO_SLUG>'           = 'you/acme'
  '<DEFAULT_BRANCH>'      = 'main'
  '<PROJECT_PKG_PREFIX>'  = '@acme'
  '<PACKAGE_MANAGER>'     = 'pnpm'
}
Get-ChildItem -Recurse -File .\skills, .\.claude, .\plan, .\agents.md, .\scripts, .\.env.example, .\data -ErrorAction SilentlyContinue |
  ForEach-Object {
    $text = Get-Content $_.FullName -Raw
    foreach ($k in $repl.Keys) { $text = $text -replace [regex]::Escape($k), $repl[$k] }
    Set-Content $_.FullName $text -NoNewline
  }
```

### Prune adopt-by-need files

The bulk copy above lands every skill unconditionally,
including ones only useful for capabilities you may not have
adopted. Cross-check against
[`templates/README.md`](../templates/README.md)'s "Adopt-by-need
files" table using the `Surface` / `Structured data` / `Auth` /
hermetic-e2e decisions you locked in step 2, plus whether UGC,
the cloud loop, and `/bootstrap` are in scope, and remove what
doesn't apply — leaving them present is misleading, per that
table:

- `skills/ship-data.md` + `.claude/commands/ship-data.md` —
  remove unless `Structured data` is `gh-as-db` /
  `hybrid-with-managed-postgres` / `pure-db` / `saas-cms`.
- `skills/ship-migration.md` + `.claude/commands/ship-migration.md`
  + `scripts/lint-migration.mjs` — remove unless
  `Structured data` is `pure-db` or `hybrid-with-managed-postgres`.
- `skills/ship-asset.md` + `.claude/commands/ship-asset.md` +
  `.claude/agents/brander.md` — remove unless `Surface` is
  `site` or `hybrid` AND branding is in scope.
- `skills/moderate.md` + `.claude/commands/moderate.md` —
  remove unless the project has UGC.
- `skills/digest.md` + `.claude/commands/digest.md` — remove
  unless the cloud loop is live and you want the daily
  morning-briefing genus (`.github/workflows/night.yml` +
  `heartbeat.yml` ship separately, per
  [`playbooks/cloud-loop.md`](./cloud-loop.md)'s "Optional: the
  other shapes"; step 4 never copies `.github/`, so only the
  skill + command file are at stake here).
- `skills/bootstrap.md` + `.claude/commands/bootstrap.md` +
  `scripts/bootstrap.mjs` (and its test) — remove unless you plan to run
  `/bootstrap` as the setup executor.

For every one of the six above you remove, also strip its row
from the just-copied root `agents.md`: the matching line in the
Skills table, the matching `/<skill-name>` line in the
Invocation block, and — for `ship-asset` only — the `brander`
row in the Sub-agents table. Leaving them means the kit's own
cold-start entry point still advertises a command that isn't on
disk.
- `scripts/refresh-critique-session.mjs` +
  `scripts/check-secrets-liveness.mjs` — remove unless
  `bearings.md`'s `Auth:` is anything other than `none`.
- `scripts/stack-lifecycle.mjs` — remove unless hermetic e2e
  uses Pattern B.
- `.claude/settings.json` + `.claude/hooks/guard.mjs` +
  `.claude/hooks/steer.mjs` (and its test) + `.claude/CLAUDE.md` +
  `scripts/notify.mjs` — remove unless
  you're running the loop on Claude Code and want unattended
  levels 3-4 (pre-approved permissions, hook-enforced hard
  rules, a pager). Root `CLAUDE.md` stays either way — Claude
  Code only auto-loads it from the repo root, not `.claude/`,
  and it doubles as plain project docs for any other agent.

`scripts/install-hooks.mjs` (with `scripts/owner.mjs` and
`scripts/git/push-policy.mjs`) stays in every mode: adoption
runs it to arm `pnpm verify` as pre-commit and the push
policy as pre-push (§2's mode choice;
[`owner-mode.md`](./owner-mode.md)).

`scripts/upgrade-plan.mjs` + `scripts/__tests__/upgrade-plan.test.mjs`
+ `scripts/__tests__/upgrade-plan-run.test.mjs` come out of every
new project: the script converts a v1 plan, which a new project's
own plan never is, and when an existing repo needs the conversion,
[`upgrade.md`](./upgrade.md) runs the script straight from the
nexus checkout, not from a copy living in the adopter's own
`scripts/`.

Each command file opens with "Read `skills/<name>.md` end to
end before touching anything else" — leaving it behind after
removing its skill leaves a dead pointer, the same
presence-is-misleading problem as leaving the skill itself.

Example for a `Surface: service` project with `Structured data:
none`, no UGC, no cloud loop, no `/bootstrap`, `Auth: none`, no
hermetic e2e, and not running the loop on Claude Code — none
of the nine apply, so remove them all (and the converter),
including their `agents.md` rows:

```bash
rm -f skills/ship-data.md skills/ship-migration.md scripts/lint-migration.mjs \
      skills/ship-asset.md .claude/agents/brander.md skills/moderate.md \
      skills/digest.md skills/bootstrap.md scripts/bootstrap.mjs \
      scripts/__tests__/bootstrap.test.mjs \
      scripts/refresh-critique-session.mjs scripts/check-secrets-liveness.mjs \
      scripts/stack-lifecycle.mjs scripts/upgrade-plan.mjs \
      scripts/__tests__/upgrade-plan.test.mjs scripts/__tests__/upgrade-plan-run.test.mjs \
      .claude/settings.json .claude/hooks/guard.mjs .claude/hooks/steer.mjs \
      .claude/CLAUDE.md scripts/__tests__/steer.test.mjs \
      scripts/notify.mjs \
      .claude/commands/ship-data.md .claude/commands/ship-migration.md \
      .claude/commands/ship-asset.md .claude/commands/moderate.md \
      .claude/commands/digest.md .claude/commands/bootstrap.md
sed -i.bak \
    -e '/skills\/ship-data\.md/d' -e '/^\/ship-data\s/d' \
    -e '/skills\/ship-migration\.md/d' -e '/^\/ship-migration\s/d' \
    -e '/skills\/ship-asset\.md/d' -e '/^\/ship-asset\s/d' -e '/`brander`/d' \
    -e '/skills\/moderate\.md/d' -e '/^\/moderate\s/d' \
    -e '/skills\/digest\.md/d' -e '/^\/digest\s/d' \
    -e '/skills\/bootstrap\.md/d' -e '/^\/bootstrap\s/d' \
    agents.md && rm -f agents.md.bak
```

```powershell
Remove-Item -ErrorAction SilentlyContinue skills\ship-data.md, skills\ship-migration.md, `
  scripts\lint-migration.mjs, skills\ship-asset.md, .claude\agents\brander.md, skills\moderate.md, `
  skills\digest.md, skills\bootstrap.md, scripts\bootstrap.mjs, `
  scripts\__tests__\bootstrap.test.mjs, `
  scripts\refresh-critique-session.mjs, scripts\check-secrets-liveness.mjs, `
  scripts\stack-lifecycle.mjs, scripts\upgrade-plan.mjs, `
  scripts\__tests__\upgrade-plan.test.mjs, scripts\__tests__\upgrade-plan-run.test.mjs, `
  .claude\settings.json, .claude\hooks\guard.mjs, .claude\hooks\steer.mjs, .claude\CLAUDE.md, `
  scripts\__tests__\steer.test.mjs, scripts\notify.mjs, `
  .claude\commands\ship-data.md, .claude\commands\ship-migration.md, `
  .claude\commands\ship-asset.md, .claude\commands\moderate.md, `
  .claude\commands\digest.md, .claude\commands\bootstrap.md
(Get-Content agents.md) | Where-Object {
  $_ -notmatch 'skills/ship-data\.md' -and $_ -notmatch '^/ship-data\s' -and
  $_ -notmatch 'skills/ship-migration\.md' -and $_ -notmatch '^/ship-migration\s' -and
  $_ -notmatch 'skills/ship-asset\.md' -and $_ -notmatch '^/ship-asset\s' -and $_ -notmatch '`brander`' -and
  $_ -notmatch 'skills/moderate\.md' -and $_ -notmatch '^/moderate\s' -and
  $_ -notmatch 'skills/digest\.md' -and $_ -notmatch '^/digest\s' -and
  $_ -notmatch 'skills/bootstrap\.md' -and $_ -notmatch '^/bootstrap\s'
} | Set-Content agents.md
```

A different removal set needs the matching `sed`/`Where-Object`
clauses swapped in — the pattern per skill is one `skills/<name>.md`
line-match plus one `^/<name>\s` line-match, plus `` `brander` ``
for `ship-asset`. Commit the templates as a single commit: `chore:
nexus templates copied`.

(nexus checks this walkthrough mechanically, on itself, with
`node scripts/adopt-dryrun.mjs` — see `skills/critique.md`.)

---

## 5. The bootstrap spec

`plan/01-bootstrap.md` is the first thing the loop ships. It
needs to be **detailed**.

Step 3 landed `plan/01-bootstrap.md` and
`plan/02-canonical-sibling.md` locally, and step 4's sweep
already replaced their placeholders (both sit under `./plan`,
in the sweep's scope). Edit `plan/01-bootstrap.md` in place to
match your stack:

- **Design:** every file the bootstrap produces (for a Next.js
  project: `package.json`, `next.config.mjs`,
  `tailwind.config.ts`, `apps/web/src/app/layout.tsx`, …), the
  stack pins, design tokens if you have them, and every "the
  loop will not ask" decision.
- **Acceptance:** observable outcomes with stable IDs (`A1`,
  `A2`, …): the dev server runs, the verify gate is green, the
  deploy gate is green.
- **Chunks:** S/M/L slices that cover every A-ID, with
  `needs` chaining them, and a true `Measure:` line.

The bar for this spec is: **a competent agent could ship every
chunk without asking you a question**. If you find yourself
thinking "the agent will figure that out", write it down
instead.

Same for `plan/02-canonical-sibling.md`. This is the
**template** every later page-family / feature-surface spec
mirrors. Time spent here amortizes across the whole build.

Run `node scripts/plan-check.mjs` (step 4 copied it in) until
it's green, then commit both specs.

---

## 6. Wire the verify gate

The verify gate is `pnpm verify` (or your equivalent). It runs
**before every commit** and gates the push.

No `package.json` exists yet at this point in the walk — step 7
creates one (alongside the deploy gate). This section describes
the **target shape** step 7 wires in:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "your-build-cmd",
    "e2e": "playwright test",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm e2e"
  }
}
```

It will fail at first — that's fine; the rest of the bootstrap spec is
what makes it green. But the script itself is in place and
runnable as soon as step 7 lands, well before the bootstrap ships.

If your project doesn't ship a build (e.g., a CLI), drop
`pnpm build`. If no e2e yet, drop `pnpm e2e` until a substrate
spec adds the harness. The gate is **what's actually runnable
today**; it grows with the project.

See [`customization/verify-gate.md`](../customization/verify-gate.md)
for stack-specific compositions.

---

## 7. Wire the deploy gate

The deploy gate is `pnpm deploy:check`. It runs **after every
push** and polls your hosting provider until ready or error.

`./scripts/deploy-check.mjs` is already present — step 4's
bulk copy landed it with the rest of `scripts/`. If
`package.json` doesn't exist yet, create it first:

```bash
pnpm init -y
```

Then wire the deploy gate into it, alongside the verify gate
from step 6:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "your-build-cmd",
    "e2e": "playwright test",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm e2e",
    "deploy:check": "node scripts/deploy-check.mjs"
  }
}
```

Choose your provider per
[`ci-providers.md`](./ci-providers.md) and set `DEPLOY_PROVIDER`
in your local `.env` (defaults to `netlify`), plus that
provider's auth env var (e.g. `NETLIFY_AUTH_TOKEN`).

Test both:

```bash
pnpm verify
pnpm deploy:check
```

`pnpm verify` will fail — expected before the bootstrap ships (see step 6).
`pnpm deploy:check` should report the current deploy state. If
you haven't pushed anything yet, it'll say "no deploy for this
commit" — that's fine; the contract is post-push.

Commit `package.json` + `scripts/deploy-check.mjs` + `.env.example`.

**Do not commit `.env`.** Confirm `.env` and `.env.workspace` are
in `.gitignore` (`nexus/customization/secrets.md`).

---

## 8. Sub-agents

Most projects need 2–4 specialist sub-agents. Decide which apply:

- **`scout`** — open-web research. Almost every project needs
  this. Already present from step 4's bulk copy
  (`.claude/agents/scout.md`) — review and adapt.
- **`reader`** — fresh-eyes site observer (used by `/critique`).
  If your project produces a website. Already present from
  step 4 (`.claude/agents/reader.md`) — review and adapt.
- **One or two domain specialists** — your project's "what does
  the agent need to be expert at?" If editorial: a copy editor.
  If data-heavy: a schema steward. If API: an OpenAPI checker.
  See [`customization/sub-agents.md`](../customization/sub-agents.md)
  for the design pattern.

Each sub-agent goes in `.claude/agents/<name>.md` with the
correct frontmatter (name, description, tools).

---

## 9. (Optional) Run `/bootstrap` to provision external services

If your project depends on a hosted database, hosting
provider, auth provider, or other external services, you
have two paths to wire them:

- **Manual.** Walk each `setup/NN_<service>.md` runbook
  yourself. Best when you want maximal control or you're
  using providers without a stable CLI / API. Step 4's bulk
  copy never lands `templates/setup/`, so start with
  [`../customization/external-services.md`](../customization/external-services.md)'s
  "Per-service runbook authoring" step 1 — it has the
  `setup/00_files.md` copy command this path needs first.
- **Automated.** Run `/bootstrap` (see
  [`../customization/bootstrap-automation.md`](../customization/bootstrap-automation.md)).
  Takes tokens in, drives provider CLIs out, ends with a
  green deploy + a ticking cloud loop. Handoffs (DNS,
  OAuth approvals, App installs) pause for the user;
  everything else is scripted.

For the automated path, `./setup` doesn't exist yet — step
4's bulk copy never lands `templates/setup/` — so create it
before copying the manifest in:

```bash
mkdir -p setup
cp ../nexus/templates/setup/bootstrap.example.json \
  setup/bootstrap.local.json
```

The PowerShell twin, Windows native:

```powershell
New-Item -ItemType Directory -Force setup | Out-Null
Copy-Item ..\nexus\templates\setup\bootstrap.example.json `
  setup\bootstrap.local.json
```

Fill in your project settings, then run `/bootstrap status`
(read-only) to preview the plan, then `/bootstrap` for the
interactive walk.

The manifest ships with the same `<PROJECT>` /
`<PROJECT_LOWER>` tokens step 4's placeholder table covers,
but step 4's sed ran before `./setup` existed, so it never
touched this file. Sweep it the same way before running
`/bootstrap`:

```bash
sed -i.bak -e 's/<PROJECT_LOWER>/acme/g' -e 's/<PROJECT>/acme/g' \
  setup/bootstrap.local.json && rm -f setup/bootstrap.local.json.bak
```

The PowerShell twin:

```powershell
(Get-Content setup\bootstrap.local.json -Raw) `
  -replace '<PROJECT_LOWER>', 'acme' -replace '<PROJECT>', 'acme' |
  Set-Content setup\bootstrap.local.json -NoNewline
```

The bootstrap layer is opt-in and standalone — skipping it
doesn't break anything; the rest of nexus works the same.

## 10. Smoke test

Run:

```
/next
```

(In Claude Code. Or read `skills/next.md` and follow the
procedure manually if using a different tool; its builder
follows `skills/ship-a-chunk.md`.)

Expected:

1. Reads `plan/README.md`, picks chunk 01.1 (the first ready
   chunk) and claims it.
2. A builder reads `plan/01-bootstrap.md` and builds the
   slice per the spec, in a worktree.
3. Runs `pnpm verify` — fails the first time, iterates.
4. Closes the chunk through a pending file: its line and A-IDs
   out, the Measure line fixed, one line in `plan/ARCHIVE.md`.
5. Lands per owner mode: the owner's checkout commits and
   pushes; any other lands a pull request.
6. Runs `pnpm deploy:check` — may be red the first time
   (Netlify rebuilds the workspace; expected if the previous
   state was a stub).
7. Releases the claim and reports done.

If any step misbehaves: stop, read the relevant skill file
section, fix the spec or the gate, retry. **Don't soldier on
through a wonky bootstrap.** It poisons every later chunk.

---

## 11. Ratchet up the autonomy

Once the bootstrap spec ships green:

- Run `/next` manually for the next few chunks. Watch
  the agent work.
- At the canonical sibling spec, spend extra care — every
  later page family copies its structure.
- After it: `/loop /march` for an evening session. Watch it
  ship 3–5 chunks. Intervene with `/oversight` if needed.
- Once you trust 3 unattended chunks in a row: walk away for
  an afternoon.
- Once you trust an afternoon: read [`intervention-spectrum.md`](../intervention-spectrum.md)
  for the 80-hour beast pattern.

The progression is days, not minutes. Don't skip levels.

---

## Common pitfalls

- **Plan too shallow.** Substrate specs ship fast; feature
  surfaces ship slowly. If your roadmap holds only two or three
  specs, you'll run out of work in 2 days. Write every v1
  surface as a spec, even unchunked.
- **Bearings vague.** If `bearings.md` doesn't enumerate
  standing decisions, the loop will ask you (= stop) on every
  ambiguity. Add to bearings every time you catch yourself
  re-deciding.
- **No canonical sibling.** Its spec is the template every
  later page-family spec mirrors. If you skip the detail there,
  every later spec has to re-derive structure. 1 hour there
  saves 4 hours across the rest.
- **Chunks too big.** A chunk that can't ship in one session
  stalls the loop mid-slice. L is the ceiling; split anything
  bigger into vertical slices.
- **Deploy gate ignored.** "I'll add it later." No. Wire it on
  day one even if it's red until the bootstrap ships. The gate's first job
  is keeping the loop honest.
- **No `/oversight` checkpoint.** You'll need it. Set a
  reminder to run it every 12 hours during unattended runs.

---

## You're ready when (the Day 1 checklist)

This is the "you're about to invoke `/next` for the
first time on a fresh adoption — here's what should be true"
checklist. Distinct from the Level-4 pre-flight (see
[`../intervention-spectrum.md`](../intervention-spectrum.md)),
which assumes a working loop and is about leaving for 80 hours.

- [ ] `spec.md` is one page or more, scope is clear, persona
      named.
- [ ] `plan/bearings.md` locks stack + URL contract + standing
      decisions + the `Surface:` line. If your project has
      user accounts, also: identity tiers, anti-abuse posture,
      moderation flow (see the optional sections in the
      bearings template).
- [ ] `plan/bearings.md` has an entry for `Auth provider` (or
      "none, v1"). If `Auth provider` is pinned, the matching
      `setup/NN_<auth>.md` runbook exists (even as a STUB).
- [ ] If your project depends on external services beyond
      hosting, `setup/00_files.md` index exists with one row
      per service. See
      [`../customization/external-services.md`](../customization/external-services.md).
- [ ] `plan/README.md` lists every v1 surface as a spec.
- [ ] `plan/01-bootstrap.md` is detailed enough to ship
      without asking, and chunked.
- [ ] The canonical sibling spec is detailed and chunked.
- [ ] `node scripts/plan-check.mjs` is green.
- [ ] At least one design artifact (visual system, design
      tokens, or a `claude-design.prompt.md` for commissioning
      one) is either committed or has a written brief. See
      [`../customization/visual-system.md`](../customization/visual-system.md).
- [ ] `pnpm verify` runs (may fail; runs).
- [ ] The mode is set: `node scripts/claims.mjs whoami`
      prints the one you chose, and `node
      scripts/install-hooks.mjs` has armed both hooks.
- [ ] `pnpm deploy:check` runs and reads your provider's state.
- [ ] `.env` has all secrets. `.env.example` documents every
      key, with a comment pointing back to the `setup/`
      runbook section that emits it.
- [ ] Sub-agents are in `.claude/agents/` and tested.
- [ ] You've read `skills/next.md` and
      `skills/ship-a-chunk.md` end to end.
- [ ] **Optional, pick up once the loop's been running a
      while:** once the project accumulates real recurring
      lessons (not day-1 setup), copy
      `plan/reflexes.md` + `plan/lessons.md` in per
      [`../customization/lessons-layer.md`](../customization/lessons-layer.md) —
      a scratch `NEXUS_LESSONS.md` doesn't scale past a
      handful of entries.
- [ ] **Optional but high-leverage:** if during this adoption
      you noticed nexus gaps (places where the playbook left
      you to figure something out yourself, or templates you
      wished existed), write a `NEXUS_LESSONS.md` in your
      project root. A separate Claude session can run
      `/lessons-pr <project-path>` against the nexus repo
      later (see
      [`../skills/lessons-pr.md`](../skills/lessons-pr.md)).
      The methodology improves with every honest application.

When all checks pass: invoke `/next` for the first time.
