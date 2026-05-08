# Playbook: new project (greenfield)

> Adopt the autonomous-loop methodology in a fresh repo with a
> spec but little or no code. Estimated time: **2–3 hours** of
> setup before your first `/ship-a-phase` invocation.
>
> By the end, you'll have:
> - A `spec.md` everyone trusts
> - A `plan/bearings.md` that locks the stack and conventions
> - A `plan/steps/01_build_plan.md` with 10–20 phases
> - Two phase briefs ready to ship (phase 1 + the canonical
>   sibling)
> - Six skill files in `skills/`
> - Slash-command pointers in `.claude/commands/`
> - 2–4 sub-agent definitions
> - A working verify gate (locally)
> - A working deploy gate (post-push)
> - `/ship-a-phase` ready to run

---

## Prerequisites

- A repo (empty or near-empty) initialized with `git init`.
- A `spec.md` describing what you're building. **One page is
  enough.** It needs: who the user is, what the product does,
  what's in scope for v1, what's deliberately out of scope.
- A hosting provider you've picked (Netlify, Vercel, Fly.io,
  etc.). See [`ci-providers.md`](./ci-providers.md).
- Node 20+ installed. Whatever package manager you prefer (the
  templates assume pnpm; sed-replace if you use npm/yarn/bun).
- A GitHub repo (or GitLab/equivalent) — push to `main`
  triggers deploy.

---

## The plan

You'll work through this top to bottom. Estimated time per
section in brackets.

1. Lock the spec [15 min]
2. Choose your stack and write `bearings.md` [30 min]
3. Choose your phases and write the build plan [30 min]
4. Copy templates and replace placeholders [15 min]
5. Write phase 1 brief in detail [20 min]
6. Wire the verify gate [20 min]
7. Wire the deploy gate [20 min]
8. Author 2–4 sub-agents [15 min]
9. Smoke-test by running `/ship-a-phase` once [15 min]
10. Ratchet up the autonomy [variable]

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

Copy `nexus/templates/plan/bearings.md` to your repo's
`plan/bearings.md`.

Replace these placeholders:

- `<PROJECT>` → your product name (lowercase if applicable, e.g.
  `thock`)
- `<PROJECT_TAGLINE>` → one-line description
- `<HOSTING_URL>` → e.g. `https://thock.netlify.app`
- `<HOSTING_PROVIDER>` → Netlify / Vercel / etc.
- `<REPO_SLUG>` → e.g. `daretodave/thock`

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
- Comments / login / payments — out of scope at every phase.

Add a row every time you find yourself answering the same
question twice during the build.

### Hard rules

Carry over from `nexus/templates/agents.md` Standing Rules. These
are universal:

1. Commit and push as a single atomic act.
2. No `Co-Authored-By:` trailers, no emojis.
3. Verify gate non-negotiable; deploy gate runs after every push.
4. No `--no-verify`, no force-push.
5. Tests alongside code.

Add project-specific ones (e.g. "site name lowercase", "content
stays in MDX").

Commit `bearings.md` separately. It's the most-read file in the
loop after the build plan.

---

## 3. Phases + build plan

Copy `nexus/templates/plan/steps/01_build_plan.md` to your repo's
`plan/steps/01_build_plan.md`.

The "Status (at-a-glance)" block at the top is what the loop
reads. Each row is one phase. Phases group into:

- **Substrate** (1–4): bootstrap, content/data layer, URL
  contract scaffolding.
- **Page families / feature surfaces** (5–N): the bulk of the
  build.
- **Cross-cutting** (last few): polish, perf, a11y.

For your project, work backward from the spec:

1. List every distinct surface the v1 has (pages, screens,
   commands, endpoints).
2. Group them. Each group is one phase.
3. Add 4 substrate phases at the front (bootstrap, data,
   content, URL contract).
4. Add 2–3 cross-cutting phases at the end (search, polish,
   perf).
5. Aim for **10–20 phases total**. Less than 10 = phases too
   big. More than 20 = phases too small (combine).

For each phase, write a 1–2 line scope description in the
"Per-phase scope" section. That's enough for the loop to ship
the substrate phases. Phase 5 (the canonical sibling) gets a
detailed brief in step 5 of this playbook.

Commit the build plan.

---

## 4. Copy the rest of the templates

Run from your repo root:

```bash
cp -r nexus/templates/skills/ ./skills/
cp -r nexus/templates/claude/ ./.claude/
cp -r nexus/templates/scripts/ ./scripts/
cp nexus/templates/agents.md ./agents.md
cp nexus/templates/env/env.example ./.env.example
cp nexus/templates/plan/AUDIT.md ./plan/AUDIT.md
cp nexus/templates/plan/CRITIQUE.md ./plan/CRITIQUE.md
cp nexus/templates/plan/README.md ./plan/README.md
```

(If using GitHub-as-DB, also copy `nexus/templates/data/` to
`./data/`. See [`customization/data-layer.md`](../customization/data-layer.md)
to decide.)

Now do a global search-and-replace across the copied files:

| Find | Replace with |
|---|---|
| `<PROJECT>` | your project name (e.g. `thock`) |
| `<PROJECT_LOWER>` | lowercase variant if different |
| `<HOSTING_URL>` | `https://your-site.netlify.app` |
| `<HOSTING_PROVIDER>` | `Netlify` / `Vercel` / etc. |
| `<REPO_SLUG>` | `your-org/your-repo` |
| `<DEFAULT_BRANCH>` | usually `main` |

A one-liner that handles most of it on Linux/WSL/macOS:

```bash
grep -rl '<PROJECT>' ./skills ./.claude ./plan ./agents.md \
  | xargs sed -i 's/<PROJECT>/thock/g'
```

(Adjust per platform — on Windows native, use a PowerShell
loop or just edit by hand; the surface is small.)

Commit the templates as a single commit: `chore: nexus
templates copied`.

---

## 5. Phase 1 brief

`plan/phases/phase_1_bootstrap.md` is the first thing the loop
ships. It needs to be **detailed**.

Use `nexus/templates/plan/phases/phase_1_bootstrap.md` as the
starting point. Edit it to match your stack:

- **Outputs section:** list every file phase 1 should produce.
  For a Next.js project: `package.json`, `next.config.mjs`,
  `tailwind.config.ts`, `apps/web/src/app/layout.tsx`,
  `apps/web/src/app/page.tsx`, etc.
- **Stack pins:** specific package versions.
- **Tokens / theme:** if you have design tokens, paste them.
- **Tests:** what unit + e2e the phase ships.
- **Decisions made upfront:** every "the loop will not ask"
  decision, written here.

The bar for this brief is: **a competent agent could ship it
without asking you a question**. If you find yourself thinking
"the agent will figure that out" — write it down instead.

Same for `plan/phases/phase_canonical_sibling.md` (renamed to
match your phase number — usually phase 4 or 5). This is the
**template** every later page-family / feature-surface phase
mirrors. Time spent here amortizes across the whole build.

Commit both briefs.

---

## 6. Wire the verify gate

The verify gate is `pnpm verify` (or your equivalent). It runs
**before every commit** and gates the push.

In your repo's root `package.json`:

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

Test it:

```bash
pnpm verify
```

It will fail at first — that's fine; phase 1 is what makes it
green. But the script itself should be in place and runnable.

If your project doesn't ship a build (e.g., a CLI), drop
`pnpm build`. If no e2e yet, drop `pnpm e2e` until phase 4
adds the harness. The gate is **what's actually runnable
today**; it grows with the project.

See [`customization/verify-gate.md`](../customization/verify-gate.md)
for stack-specific compositions.

---

## 7. Wire the deploy gate

The deploy gate is `pnpm deploy:check`. It runs **after every
push** and polls your hosting provider until ready or error.

Copy `nexus/templates/scripts/deploy-check.mjs` to
`./scripts/deploy-check.mjs`.

Add to `package.json`:

```json
{
  "scripts": {
    "deploy:check": "node scripts/deploy-check.mjs"
  }
}
```

Choose your provider per
[`ci-providers.md`](./ci-providers.md) and uncomment the
matching block in the script. Set the env var (e.g.
`NETLIFY_AUTH_TOKEN`) in your local `.env`.

Test it:

```bash
pnpm deploy:check
```

It should report the current deploy state. If you haven't pushed
anything yet, it'll say "no deploy for this commit" — that's
fine; the contract is post-push.

Commit `package.json` + `scripts/deploy-check.mjs` + `.env.example`.

**Do not commit `.env`.** Confirm `.env` is in `.gitignore`.

---

## 8. Sub-agents

Most projects need 2–4 specialist sub-agents. Decide which apply:

- **`scout`** — open-web research. Almost every project needs
  this. Copy from `nexus/templates/claude/agents/scout.md`.
- **`reader`** — fresh-eyes site observer (used by `/critique`).
  If your project produces a website. Copy from
  `nexus/templates/claude/agents/reader.md`.
- **One or two domain specialists** — your project's "what does
  the agent need to be expert at?" If editorial: a copy editor.
  If data-heavy: a schema steward. If API: an OpenAPI checker.
  See [`customization/sub-agents.md`](../customization/sub-agents.md)
  for the design pattern.

Each sub-agent goes in `.claude/agents/<name>.md` with the
correct frontmatter (name, description, tools).

---

## 9. Smoke test

Run:

```
/ship-a-phase
```

(In Claude Code. Or read `skills/ship-a-phase.md` and follow
the procedure manually if using a different tool.)

Expected:

1. Reads the build plan, picks phase 1 (the first `[ ]`).
2. Reads phase 1's brief.
3. Builds the substrate per the brief.
4. Runs `pnpm verify` — fails the first time, iterates.
5. Commits.
6. Pushes.
7. Runs `pnpm deploy:check` — may be red the first time
   (Netlify rebuilds the workspace; expected if the previous
   state was a stub).
8. Reports done.

If any step misbehaves: stop, read the relevant skill file
section, fix the brief or the gate, retry. **Don't soldier on
through a wonky phase 1.** It poisons every later phase.

---

## 10. Ratchet up the autonomy

Once phase 1 ships green:

- Run `/ship-a-phase` manually for phases 2–4. Watch the agent
  work.
- At phase 5 (the canonical sibling), spend extra care — every
  later page family copies its structure.
- After phase 5: `/loop /march` for an evening session. Watch
  it ship 2–3 phases. Intervene with `/oversight` if needed.
- Once you trust 3 unattended phases in a row: walk away for an
  afternoon.
- Once you trust an afternoon: read [`intervention-spectrum.md`](../intervention-spectrum.md)
  for the 80-hour beast pattern.

The progression is days, not minutes. Don't skip levels.

---

## Common pitfalls

- **Build plan too shallow.** Phases 1–4 ship fast; phases 5+
  ship slowly. If your plan is only 6 phases, you'll run out
  of work in 2 days. Aim for 12–17.
- **Bearings vague.** If `bearings.md` doesn't enumerate
  standing decisions, the loop will ask you (= stop) on every
  ambiguity. Add to bearings every time you catch yourself
  re-deciding.
- **No canonical sibling.** Phase 5 is the template every later
  page-family phase mirrors. If you skip the brief detail
  there, every later phase has to re-derive structure. 1 hour
  in phase 5 saves 4 hours across phases 6–13.
- **Deploy gate ignored.** "I'll add it later." No. Wire it on
  day one even if it's red until phase 1. The gate's first job
  is keeping the loop honest.
- **No `/oversight` checkpoint.** You'll need it. Set a
  reminder to run it every 12 hours during unattended runs.

---

## You're ready when

- [ ] `spec.md` is one page or more, scope is clear.
- [ ] `plan/bearings.md` locks stack + URL contract + standing
      decisions.
- [ ] `plan/steps/01_build_plan.md` has 10–20 phases.
- [ ] Phase 1 brief is detailed enough to ship without asking.
- [ ] Canonical sibling brief (usually phase 4 or 5) is detailed.
- [ ] `pnpm verify` runs (may fail; runs).
- [ ] `pnpm deploy:check` runs and reads your provider's state.
- [ ] `.env` has all secrets. `.env.example` documents what's
      needed.
- [ ] Sub-agents are in `.claude/agents/` and tested.
- [ ] You've read `skills/ship-a-phase.md` end to end.

When all 10 pass: invoke `/ship-a-phase` for the first time.
