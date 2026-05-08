# Bearings — <PROJECT>

> Standing context for every command invocation. Read this
> alongside the relevant skill file (`skills/<name>.md`) and
> the matching phase brief. If anything here changes, update in
> the same commit.

## What we're building

`spec.md` at the repo root is the product spec — the canonical
description of <PROJECT>. Read once at session start. The TL;DR:

> <ONE-LINE PRODUCT DESCRIPTION>

<2–4 SENTENCE PRODUCT SUMMARY — audience, core feature, voice>

**<BRANDING DECISION, e.g. "Site name is lowercase, always.">**

**Live at:** <HOSTING_URL>

## Stack (locked — do not re-litigate)

These were decided at project bootstrap. Revisit only if a
phase genuinely cannot ship without changing one of these — and
then stop and ask.

| Layer | Choice | Why |
|---|---|---|
| Repo | <e.g. pnpm workspaces monorepo> | <reason> |
| Framework | <e.g. Next.js 15 App Router> | <reason> |
| Language | <e.g. TypeScript strict> | <reason> |
| Styling | <e.g. Tailwind CSS> | <reason> |
| Content | <e.g. MDX-in-repo, headless CMS, none> | <reason> |
| Structured data | <pattern A/B/C/D/E from customization/data-layer.md> | <reason> |
| Schemas | <e.g. Zod, generated to JSON Schema> | <reason> |
| Test (unit) | <e.g. Vitest> | <reason> |
| Test (e2e) | <e.g. Playwright> | <reason> |
| Lint | <e.g. ESLint + Prettier> | <reason> |
| Pkg mgr | <e.g. pnpm 9> | <reason> |
| Hosting | <HOSTING_PROVIDER> with <plugin if any> | <reason> |

## URL / API / CLI contract (locked)

Every <surface> below is a permanent contract. Add new ones via
new phases; don't change existing shapes.

```
<Enumerate every public surface the project exposes. For a web
project: every URL. For an API: every endpoint with method +
path. For a CLI: every subcommand.>
```

## Repository shape

```
<repo-root>/
├── spec.md
├── README.md
├── agents.md
├── package.json (or equivalent)
├── ...
├── .claude/
│   ├── commands/<verb>.md
│   └── agents/<name>.md
├── skills/
│   ├── ship-a-phase.md
│   ├── ...
├── plan/
│   ├── README.md
│   ├── bearings.md                      # this file
│   ├── AUDIT.md
│   ├── CRITIQUE.md
│   ├── steps/01_build_plan.md
│   └── phases/phase_<N>_<topic>.md
├── design/                              # design exports (user-emitted, async)
├── data/                                # if using GitHub-as-DB; otherwise omit
└── <your app paths>
```

## The `design/` folder

The user emits design exports asynchronously. Format varies by
tool (claude design produces flat `*.jsx`; Figma exports JSON;
manual sketches PNGs). Authoritative reads:

- `design/INDEX.md` — file → family map, if present.
- `design/decisions.<ext>` — design's own brief; **wins over
  bearings on conflict**.
- `design/tokens.<ext>` — finalized design tokens, if present.

**The loop does not wait for design.** Ship from sibling +
bearings if absent; integrate when it lands.

## Sub-agents

Defined under `.claude/agents/`. Spawn aggressively — they
parallelize and protect main-agent context.

| Agent | When to spawn | Returns |
|---|---|---|
| `scout` | External fact, spec, URL, date, signal | Structured findings with citations |
| `reader` | Fresh-eyes critique of the live site | JSON findings array |
| <DOMAIN_SPECIALIST_1> | <when> | <output> |
| <DOMAIN_SPECIALIST_2> | <when> | <output> |

## Visual & tonal defaults

<If design has landed, point at design/tokens.css and
design/decisions.<ext> as authoritative. Otherwise list the
working defaults.>

- **Mode (dark / light / both):** <choice>
- **Type families:** <serif, sans, mono>
- **Palette / accent:** <key colors>
- **Spacing scale:** <base + ramp>
- **Voice:** <tone in 1–2 sentences>

## Decisions standing for the autonomous loop

(These exist so the loop never asks the user. Add to this list
any time you encounter a recurring class of ambiguity.)

- **Pagination:** <e.g. none until N items>
- **Sort default:** <e.g. newest first by publishedAt>
- **Empty state copy template:** `"<template>"`
- **Loading state:** <e.g. skeleton via <Skeleton>; no spinners>
- **Error state:** <e.g. red mono with retry>
- **Top-N count for any leaderboard / trending list:** <N>
- **Comments / community / login:** <decision — usually "out of scope">
- <PROJECT-SPECIFIC DECISIONS>

## Hard rules

(Mirrors `agents.md` Standing Rules. Update there first; this
echoes.)

1. **Commit and push as a single atomic act.**
2. **No `Co-Authored-By:` trailers, no emojis.**
3. **No `--no-verify`, no force-push, no destructive resets.**
4. **The verify gate is non-negotiable** — see "Verify gate"
   below.
5. **Tests alongside code.**
6. **Small focused components in folders.**
7. **Content stays in <CONTENT_LOCATION>. Data stays in
   <DATA_LOCATION>.**
8. **Never commit secrets.**
9. <PROJECT-SPECIFIC RULES>

## Verify gate (hermetic, mandatory) + deploy gate

Every shipping skill runs **two** gates around a commit.

### Pre-commit: `pnpm verify`

```
<your project's verify composition>
```

For a typical web stack:

```
pnpm typecheck      # tsc --noEmit
pnpm test:run       # unit tests
pnpm data:validate  # if using GitHub-as-DB
pnpm build          # production build
pnpm e2e            # hermetic e2e against the production build on a separate port
```

Each leg is a hard gate. **Hermetic e2e** is critical — it
catches "tests pass but built site is broken." See
`customization/verify-gate.md` for stack-specific compositions.

### Post-push: `pnpm deploy:check`

After `git push origin <DEFAULT_BRANCH>`:

```
pnpm deploy:check
```

Polls <HOSTING_PROVIDER> for the deploy at HEAD. Exits 0
ready, 1 error, 2 timeout, 3 config/auth.

Implementation: `scripts/deploy-check.mjs`. Provider-specific
block enabled for <HOSTING_PROVIDER>.

**Red deploy = blocked tick.** Read log, patch root cause,
push again. Up to 3 same-root-cause iterations; otherwise stop
per the skill's failure modes.

## Operational notes

- **Auto-deploys**: every push to `<DEFAULT_BRANCH>` deploys.
  Previews on PRs (provider-specific).
- **A red `<DEFAULT_BRANCH>` = a red site.** Verify gate is
  pre-flight; deploy gate is post-flight.
- **Operational secrets** in `.env` (gitignored). See
  `agents.md` "Operational secrets" section.

## Useful commands

```bash
<your project's commands — pnpm dev, pnpm test, etc.>
pnpm verify           # the full gate
pnpm deploy:check     # post-push deploy gate
```
