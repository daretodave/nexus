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

## Surface

**Surface:** `<site | service | library | cli | hybrid>`

This single line is the hard gate for the opt-in branding
capability (`/ship-asset` + the `brander` sub-agent — see
`nexus/customization/branding.md`).

| Value | Meaning |
|---|---|
| `site` | Renders pages for humans (web app, blog, docs site). Asset capability available. |
| `service` | API, daemon, worker, scheduled job. No human UI. Asset capability disabled. |
| `library` | Code consumed by other code. Asset capability disabled. |
| `cli` | Terminal-only program. Asset capability disabled. |
| `hybrid` | Library/service that *also* has a docs/marketing site. Asset capability available, scoped to the site portion. |

If you adopt the optional branding skills, this gate is
unconditional. There is no override flag — set the surface to
match reality and the skills behave correctly. If the value is
missing, branding skills exit with `[needs-user-call]` rather
than guessing.

## Auth (for Surface: site / hybrid)

**Auth:** `<none | test-user | session-cookie | bearer-token | shared-secret | preview-env | magic-link>`

Tells `reader` (and therefore `/critique`) how to establish a
session before walking the page set. Without this, critique
runs anonymous against an authenticated app and every finding
becomes "the home page is a login form."

| Value | Pattern | When to pick |
|---|---|---|
| `none` | No auth wall (or pure marketing-site critique) | Default for public sites |
| `test-user` | Real login flow, test user creds in `.env` | True E2E fidelity matters more than operational simplicity |
| `session-cookie` | Pre-baked session cookie in `.env`; no login flow runs | **Recommended default** — works in both Chrome tools and WebFetch (cloud-loop friendly) |
| `bearer-token` | Same as session-cookie but `Authorization: Bearer <token>` | Apps with a token-based auth instead of cookies |
| `shared-secret` | Dev-mode impersonation header (`X-Critique-Bot: <secret>`) | Apps you control end-to-end; safest separation |
| `preview-env` | Reader walks a preview URL with relaxed auth | Projects with a real preview pipeline |
| `magic-link` | Mailbox poll for the magic link | Passwordless-only apps |

Same gate posture as `Surface:` — unconditional, no
`--force`, no silent default. If the value is missing,
`reader` exits with `[needs-user-call]`. If the auth handshake
fails at runtime, the pass exits loudly rather than falling
back to anonymous.

See `nexus/customization/auth-aware-critique.md` for the full
design — patterns, env vars per pattern, hardening, failure
modes, and the recommended starting point. For
`Surface: service | library | cli`, set `Auth: none` or omit
the field entirely (no critique surface to walk).

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
| Structured data | <slug from customization/data-layer.md: gh-as-db / hybrid-with-managed-postgres / pure-db / saas-cms / none> | <reason> |
| Schemas | <e.g. Zod, generated to JSON Schema> | <reason> |
| Test (unit) | <e.g. Vitest> | <reason> |
| Test (e2e) | <e.g. Playwright> | <reason> |
| Lint | <e.g. ESLint + Prettier> | <reason> |
| Pkg mgr | <e.g. pnpm 9> | <reason> |
| Hosting | <HOSTING_PROVIDER> with <plugin if any> | <reason> |

<!-- optional: fill in if your project has external services
     beyond hosting. See nexus/customization/external-services.md
     for the convention. -->

## External services (optional)

For every external service the project depends on, write a
`setup/NN_<service>.md` runbook *before* phase 1 ships. The
runbook covers every dashboard click for every phase that
will ever touch the service. The loop reads
`setup/00_files.md` every `/oversight` tick and surfaces
drift before it becomes a stall.

| # | Service | Runbook | Status | Last verified | Dashboard |
|---|---|---|---|---|---|
| 01 | GitHub | `setup/01_github.md` | <OK/PARTIAL/STUB> | <ISO date> | <URL> |
| 02 | <HOSTING_PROVIDER> | `setup/02_<hosting>.md` | <status> | <date> | <URL> |
| 03 | <DB_PROVIDER> | `setup/03_<db>.md` | <status> | <date> | <URL> |
| 04 | <AUTH_PROVIDER> | `setup/04_<auth>.md` | <status> | <date> | <URL> |
| 05 | <EMAIL_PROVIDER> | `setup/05_<email>.md` | <status> | <date> | <URL> |
| 06 | <AI_PROVIDER> | `setup/06_<ai>.md` | <status> | <date> | <URL> |

Drop rows that don't apply. Add rows as the build plan
grows. The minimum is GitHub + hosting; everything else is
project-specific.

See `nexus/customization/external-services.md` for the
runbook shape and the loop's introspection contract.

<!-- optional: fill in if your project has its own auth
     beyond `/critique`'s reader-session. -->

## Auth provider (optional)

**Auth provider:** `<none | Auth0 | Clerk | Supabase Auth |
next-auth | Lucia | Better Auth | Iron Session | custom>`

Tells every auth-touching phase which integration to wire.
Pin on day one to prevent re-litigation. If the provider
needs dashboard configuration, every phase that touches it
gets a section in `setup/NN_<auth>.md` per
`nexus/customization/external-services.md`.

<!-- optional: fill in if your project has user accounts. -->

## Identity tiers (optional)

What can anonymous users do? What can authenticated do?

- **Anonymous:** `<can-read | can-read-and-write | cannot-access>`
- **Authenticated:** `<base permissions, e.g. comment, vote,
  flag>`
- **Account age requirement for write:** `<none | 1h | 24h |
  7d>`
- **Email-verification requirement:** `<not required |
  required for write | required for read>`
- **Anonymous voting / commenting (if applicable):**
  `<not allowed | rate-limited by IP | allowed with hidden
  weight>`

These are policy decisions and belong in bearings, not in
skills. Every skill that gates by identity reads from here.

<!-- optional: fill in if your project has user-generated
     content (comments, votes, submissions, flags). -->

## Anti-abuse posture (optional)

- **Vote weighting:** `<flat | by-account-age | by-account-age-and-login-frequency>`
- **Comment rate-limit:** `<N per user per hour, M per IP
  per hour>`
- **Submission rate-limit:** `<N per user per day>`
- **IP-hash retention:** `<30d | 90d | 365d>`
- **CAPTCHA threshold:** `<never | after N flagged actions
  in window | always for new accounts>`
- **Account-age gate before write:** `<none | 1h | 24h>`

The loop respects these limits; every write-skill reads them.
See `nexus/customization/moderation-loop.md` for how the
mod queues that these limits produce get drained.

<!-- optional: fill in if your project has UGC and a
     moderation surface. -->

## Moderation flow (optional)

- **Mod flow:** `<ai-pre-filter | post-mod | pre-mod>`
- **Mod queue location:** `<data/mod/*.md | DB columns on
  the content table | setup/04_<auth>.md RBAC-gated>`
- **AI pre-filter model:** `<openai:omni-moderation-latest
  | anthropic:moderation | local-classifier | none>`
- **`/oversight` escalation thresholds:**
  - Flagged spike: `<N items in M hours>`
  - New-account age: `<24h default>`
  - Repeat-flag pattern: `<N flags on same user in M days>`
- **Mod audit log:** `<plan/MOD_AUDIT.md | DB table>`
- **Mod role membership:** `<role name + how granted>`

The loop drains the queues and respects the thresholds.
See `nexus/customization/moderation-loop.md`.

<!-- optional: fill in if your project has AI-generated
     content, AI-assisted moderation, AI-suggested ranking,
     or any other AI-in-the-product surface beyond the build
     loop itself. -->

## AI usage map (optional)

Which surfaces use AI, and how. Distinguishes the *product's*
use of AI from the *build loop's* use (which is universal in
nexus projects).

| Surface | AI's role | Human gate | Model |
|---|---|---|---|
| <e.g. article summaries> | generated | post-edit by `/iterate` | <model> |
| <e.g. comment moderation pre-filter> | filter (verdict in / out) | manual review on hold queue | <model> |
| <e.g. tag suggestions> | suggest | author accepts/rejects | <model> |
| <e.g. mod actions (remove, ban)> | none — human only | — | — |
| <e.g. spec writing> | none — human only | — | — |

Be explicit about what is *not* AI. The audit trail for
content trustworthiness depends on this distinction. See
`customization/data-layer.md` § Provenance for the
record-level `source: ai-generated` rigor.

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

## Plan expansion posture

`/expand` reads accumulated signals (audit findings, critique
findings, GH issues, spec drift, design landings, data growth)
and proposes new phase candidates. The posture controls how
aggressive it is.

- **Mode: bold** (default) — `/expand` runs at standard cadence
  and files candidates to `plan/PHASE_CANDIDATES.md`.
  `/oversight` promotes them to the build plan.
- **Mode: strict** — `/expand` is a no-op. Build plan grows
  only via manual `/plan-a-phase` or `/oversight`. Use this if
  you want the project to stay exactly true to its original
  spec.
- **Mode: autonomous** — `/expand` writes phase rows directly
  to `plan/steps/01_build_plan.md`. No `/oversight` review.
  Most aggressive; document in Hard Rules below if you choose
  this.

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
