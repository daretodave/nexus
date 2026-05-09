# Branding & assets — the demand-pull capability

> **Adopt-by-need capability** (same pattern as
> `customization/data-layer.md` — projects that don't need it
> simply don't copy the skill). A nexus project can generate
> brand assets (OG images, favicons, social cards, SVG → PNG
> renders) through a `brander` sub-agent and a single
> demand-pull skill, **`/ship-asset`** — autonomous, one asset
> per tick, drains findings the same way `/iterate` drains
> audit findings.
>
> When branding needs a taste call (mood, palette accent,
> wordmark treatment), the user runs **`/oversight`** — that's
> already the user-in-the-loop exception. `/oversight`
> captures the brief into `bearings.md` and appends concrete
> asset-render rows to `plan/AUDIT.md`; `/ship-asset` drains
> from there. There is no second interactive skill; hard rule
> #6 (only `/oversight` asks questions) stands.
>
> Together the demand-pull skill + the `/oversight`-driven
> brief keep a cron-job project from drifting into "let's
> make a logo" while letting an editorial site close the
> obvious gaps when `/critique` notices them.

## When this is the right fit

You want this when your project's `bearings.md` declares
`Surface: site` (or `Surface: hybrid` with a public web face)
**and** the project has a real visual identity worth rendering
into shareable assets — OG previews, favicons, hero
illustrations, conference one-pagers.

You **don't** want this when:

- `Surface: library | service | cli` — there is no surface that
  needs branded assets. The skill no-ops; the agent never spawns.
- The project hasn't picked a visual identity yet. Skip until
  the design has landed; rendering placeholders just gives the
  loop something to drift toward.
- Asset work happens out-of-loop in a design tool (Figma,
  Affinity) and lands in the repo as static files. The skill
  is for *generated* assets; static drops don't need it.

## The core lever — demand-pull, not supply-push

The skill is **never wired into `/march`'s default tick**. The
only entry points are:

1. **`/critique` filed a finding.** The `reader` sub-agent's
   §7 (SEO & meta hygiene) catches a missing or default OG
   image, broken favicon, social-share preview that defaults to
   the host's generic card. The finding lands in
   `plan/CRITIQUE.md` with `category: seo` or `category: visual`.
   `/iterate` scores it like any other finding; if it wins, it
   spawns `/ship-asset` to address it.
2. **`/iterate`'s audit pass found one.** The audit's
   "asset hygiene" check (added by this customization, gated on
   `Surface: site`) flags missing per-route OG handlers, broken
   image references, favicon 404s. Same scoring path as above.
3. **`/oversight` filed asset-render rows.** When the user
   runs `/oversight` for a branding pass, the locked brief
   produces concrete `category: asset` rows in `plan/AUDIT.md`
   that the loop drains.
4. **A phase brief explicitly named an asset deliverable.** A
   phase shipping a public-facing surface (launch page, share
   modal, podcast episode page) lists the asset in its scope.
   `/ship-a-phase` delegates the asset chunk to `brander`
   inline rather than ship a half-rendered placeholder.
5. **The user invoked `/ship-asset` directly.** Manual
   intervention — same as `/ship-data`. Falls through to the
   same skill path.

That's it. There is **no** `/march` step that says "any
branding work to do?" The capability sits dormant until one of
the five pulls fires.

## Three trajectory guards (encoded, not vibes)

### 1. The `Surface:` field in `bearings.md`

Every nexus project's `bearings.md` declares a single line near
the top:

```
Surface: site | service | library | cli | hybrid
```

| Value | Meaning | Asset capability |
|---|---|---|
| `site` | Renders pages for humans (web app, blog, docs site) | enabled |
| `service` | API, daemon, worker, scheduled job — no human UI | disabled |
| `library` | Code consumed by other code | disabled |
| `cli` | Terminal-only program | disabled |
| `hybrid` | Library/service that *also* has a docs/marketing site | enabled, scoped to the site portion |

`/ship-asset` reads this on entry. If the value isn't `site` or
`hybrid`, the skill exits 0 immediately with a one-line note —
no commit, no work. Same for the `brander` agent: if spawned
under the wrong surface, it returns the same one-liner.

This is the hard gate. A cron-job project literally cannot
produce a branded asset through the loop.

### 2. The capability is opt-in by deliberate copy

`templates/skills/ship-asset.md` and
`templates/claude/agents/brander.md` ship in the standard
nexus templates, but the templates README marks them
**"omit unless `Surface: site`/`hybrid`"** — the same pattern
`ship-data.md` uses ("omit if no GitHub-as-DB"). Adopting
projects choose at copy time. `/march` does not reference
`/ship-asset`, so absence is silent.

A project that adopts nexus and never copies the file has no
asset code path at all. Removing it is a `git rm`.

### 3. Asset work is never its own phase

The build plan doesn't get a phase like "phase 7: branding
pass." Asset work rides along with whatever public-facing phase
needs it (the launch phase, the share-card phase, the
about-page phase). The `/expand` skill should not propose
phase candidates whose primary deliverable is "make better
brand assets" — if it does, that's the trajectory smell to
correct.

`ship-asset` is for *one* asset at a time, scored by impact ×
ease against every other audit finding. It competes; it doesn't
get a reserved slot.

## Tooling — Node-only, no headless browser

The default toolchain for the `brander` agent and `/ship-asset`
skill is:

| Tool | Purpose |
|---|---|
| **`satori`** (vercel/satori) | JSX → SVG. The same engine Next.js's `ImageResponse` uses. |
| **`@resvg/resvg-js`** | SVG → PNG (and other raster formats). Pure Node, no system deps. |
| **`sharp`** | Format conversion, resizing, optimization, multi-resolution favicons. Already in most Next.js projects. |

**Why not headless Chrome (Puppeteer/Playwright):** the verify
gate is hermetic. Adding a browser dep for asset rendering
balloons the install size, slows CI, and is overkill for the
shapes a brander produces (headlines + wordmark over a
gradient, occasional small illustrations). resvg + satori cover
≥95% of what asset generation actually needs and run in the
same Node process as the rest of `pnpm verify`.

**When you legitimately need a browser:** complex CSS, web
fonts you can't embed, JS-rendered SVG. In that case the skill
documents an escape hatch that uses Playwright (already
installed for e2e), spawning a single page render under the
existing browser. Document the choice in the skill's
`provenance` field (see below) so future ticks know which path
ran.

## Where the assets live

By default, generated assets land in:

```
<repo>/
├── apps/web/public/og/<route-slug>.png        # per-route OG
├── apps/web/public/favicon.{ico,svg}          # favicons
├── apps/web/public/brand/<asset-name>.{svg,png}  # everything else
└── apps/web/src/app/opengraph-image.tsx       # Next.js dynamic OG handler (preferred for content sites)
```

For frameworks that don't have a built-in dynamic OG route
(non-Next), prefer the `public/og/` static-render path so
deploys stay fast.

**Provenance:** every generated PNG carries a sibling
`<file>.json` with `{ generated_by: "brander", at: <ISO>, source: <jsx path>, commit: <sha> }`.
This is the same trust pattern `/ship-data` uses for AI-generated
records — future ticks can tell what was hand-authored vs
loop-rendered, and which assets need re-rendering after a
template change.

## How `/critique` and `/iterate` light up the demand path

The default `reader` sub-agent's §7 SEO & meta hygiene check
already inspects `<head>` for OG image presence. No code change
required there — a missing or default OG already produces a
finding.

`/iterate`'s audit gets one new line under "asset hygiene"
(gated on `Surface: site`):

> **Asset hygiene.** Walk the canonical URL set. For each
> route, check for an `og:image` meta tag pointing to a real
> asset (not a 404, not the host's default placeholder). Flag
> missing favicons. Flag image refs in MDX/JSX whose target
> file doesn't exist. Score normally.

That's it. The same audit/score/ship loop addresses asset
findings as ships any other improvement. No new state files,
no new commands.

## What `brander` returns vs what `/ship-asset` does

The split mirrors `scout`/`/ship-data`:

- **`brander`** is a sub-agent. It accepts a brief
  (`render an OG image for /article/<slug>`, `make a 32×32 +
  64×64 favicon from this SVG`, `convert design/wordmark.svg
  to PNG at 2x`). It writes the asset file to disk under
  `public/og/` (or wherever the brief specifies), writes the
  sibling provenance JSON, and returns the path(s). It does
  **not** modify any other source code.

- **`/ship-asset`** is the orchestrating skill. It picks the
  next asset task (from CRITIQUE/AUDIT findings or the
  invocation argument), spawns `brander` to render, runs
  `pnpm verify` (the new asset must not break the build), then
  commits the asset + its provenance + any wiring (e.g. an
  `opengraph-image.tsx` route that the asset feeds into) and
  pushes.

This split keeps assets out of the main agent's context (PNGs
are big, the agent doesn't need to "see" them) and gives the
loop a clean rollback story (revert one commit, asset and
wiring vanish together).

## When branding needs a taste call — use `/oversight`

`/ship-asset` is excellent at draining one asset finding. It
is **deliberately bad** at being the entry point when the
project has no brand identity yet — there's no finding to
drain because there are no expectations to violate.

For "the project needs a real brand setup" or "we need a
brand refresh," the human-driven entry is the existing
`/oversight` skill. `/oversight` already holds the
`AskUserQuestion` exception; branding fits its remit (pause,
brief, ask targeted questions, adjust the plan). The flow:

1. User runs `/oversight` with a branding focus.
2. `/oversight` audits the lay of the land — reads
   `plan/bearings.md`, `design/tokens.css`,
   `design/decisions.*`, `<public>/` for existing favicon /
   OG / wordmark files, current metadata wiring.
3. `/oversight` asks targeted questions (mood, accent,
   wordmark treatment, favicon source, OG template) with
   audit-derived defaults.
4. `/oversight` updates `plan/bearings.md`'s
   "Visual & tonal defaults" section + appends concrete
   asset-render rows to `plan/AUDIT.md` under
   `category: asset` so they score and ship through the
   normal `/iterate` → `/ship-asset` flow.
5. The next `/march` (or a directly-invoked `/ship-asset`
   per row) drains the audit rows one asset at a time.

This way the brand brief lives in durable repo state
(bearings + audit), assets ship through the same demand-pull
path as every other improvement, and the "only `/oversight`
asks questions" rule stands without exception.

**No second interactive skill.** An earlier draft of this
customization proposed a `/brand-me` skill with its own
`AskUserQuestion` exception. It was dropped — once a rule has
two exceptions, it has three, and `/oversight` already
covers the use case cleanly.

## Hard rules carried by the capability

1. **`Surface:` gate is unconditional.** No `--force`, no
   override flag. If you want assets, set the surface; if you
   don't want assets, the gate stays closed.
2. **No proactive asset shipping.** The skill will not produce
   an asset just because it could. Demand only.
3. **Provenance JSON sibling required** for every generated
   raster. Hand-authored static assets are fine without — they
   only need provenance if the loop generated them.
4. **One asset per `/ship-asset` invocation.** Same shape as
   `/ship-data`. Batching is for a phase, not for the iterate
   loop.
5. **No external upload destinations** (no S3, no CDN, no
   image-hosting SaaS). Assets ship in the repo, served by the
   same host as the rest of the project. Anything else needs
   a new customization doc.
6. **No second `AskUserQuestion` exception.** If you need a
   taste call, run `/oversight`. Hard rule #6 (only
   `/oversight` asks questions) stands.

## Failure modes

- **`Surface:` field missing from `bearings.md`.** Skill exits
  with a one-line note asking the user to declare it.
  `/oversight` is the right place to resolve. Do not default to
  `site` silently — the absence is meaningful.
- **`brander` returns a render error** (font missing, JSX
  invalid, satori unsupported CSS). Skill captures the error in
  `plan/AUDIT.md` and exits without committing. The next
  `/iterate` re-scores; usually the fix is a small JSX tweak.
- **Generated PNG is >1 MB.** Skill rejects, asks brander to
  re-render with the optimization flag. If still oversized,
  flag `[needs-user-call]` — likely the source SVG is doing
  something wasteful.
- **Asset would overwrite a hand-authored file** (no provenance
  sibling on the existing file). Skill refuses; the existing
  file was put there by a human and the loop doesn't get to
  clobber it. Flag as `[needs-user-call]`.

## Adopting the capability — checklist

For a project that already runs nexus and wants to add
branding:

1. Add the `Surface:` line to `plan/bearings.md`. Set
   appropriately. Commit.
2. Copy `nexus/templates/skills/ship-asset.md` →
   `<repo>/skills/ship-asset.md`. Replace placeholders.
3. Copy `nexus/templates/claude/agents/brander.md` →
   `<repo>/.claude/agents/brander.md`. Replace placeholders.
4. Add a one-line pointer at
   `<repo>/.claude/commands/ship-asset.md` matching the other
   commands.
5. Note in `agents.md` Sub-agents table that `brander`
   exists.
6. Install render deps when the first asset task fires:
   `pnpm add -w satori @resvg/resvg-js sharp` (or in the
   workspace package that owns `public/`). Don't pre-install
   for projects that may never need it.
7. **For brand setup / taste calls**: run `/oversight` with a
   branding focus when you're ready. It captures the brief
   into `bearings.md` + `plan/AUDIT.md` rows; `/ship-asset`
   then drains them one at a time.

That's the full adoption. No other plumbing — `/ship-asset`
sits dormant until pulled by a finding or by an
`/oversight`-emitted audit row.

## Why this customization exists at all

The methodology should make it easy to *not* care about
branding when branding doesn't matter, and easy to close the
loop when it does. The opposite outcomes — a cron-job project
that grew a logo phase, an editorial site whose share previews
were Netlify's default for six months — both happened in real
projects and are the friction this doc resolves.

Demand-pull + a hard surface gate is the design. Everything
else is encoding.
