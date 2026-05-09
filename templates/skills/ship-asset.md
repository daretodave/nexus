# Skill: ship-asset

> **Demand-pull only.** Render and ship **one** brand asset
> (OG image, favicon, social card, SVG → PNG, hero
> illustration). Spawn `brander` to render, verify, commit,
> push, confirm deploy, return.
>
> **Hard-gated on `Surface:` field in `plan/bearings.md`.**
> If the project's surface isn't `site` or `hybrid`, the skill
> exits 0 immediately. Cron-job, library, and CLI projects
> have no asset code path.
>
> **Adopt-by-need.** Same shape as `ship-data.md` — ships in
> the standard skills/ folder but only meaningful for projects
> that adopt it. Omit this file if `Surface:` is not
> `site`/`hybrid` or branding is out of scope. See
> `nexus/customization/branding.md` for the design rationale.

## 1. Purpose

Asset generation that doesn't drift. The skill ships exactly
**one** asset per invocation, scored against the same
impact × ease rubric `/iterate` uses. Findings reach this skill
via four demand-pull paths only:

1. `/critique` filed an SEO/visual finding the `reader` agent
   surfaced (e.g. missing `og:image`, broken favicon).
2. `/iterate`'s "asset hygiene" audit flagged a missing
   per-route OG handler, a 404'd image ref, a favicon gap.
3. A phase brief explicitly named an asset deliverable;
   `/ship-a-phase` delegates the asset chunk inline.
4. The user invoked `/ship-asset` directly with an explicit
   target.

There is **no** `/march` step that calls `/ship-asset`
proactively. The capability sits dormant until pulled.

## 2. Invocation

```
/ship-asset                            # next asset finding from CRITIQUE/AUDIT
/ship-asset og <route-path>            # render OG for one route
/ship-asset favicon                    # (re)render the favicon set
/ship-asset social <route-path>        # render social card variants
/ship-asset svg2png <design-path>      # convert one SVG → PNG (+ provenance)
/ship-asset audit                      # audit-only; emit asset findings, no ship
```

## 3. The hard surface gate

**Step 0 of every invocation:** read
`plan/bearings.md`'s `Surface:` line.

| `Surface:` value | Skill behavior |
|---|---|
| `site` | proceed |
| `hybrid` | proceed (assets land in the site portion) |
| `service` `library` `cli` | exit 0 with a one-line note: `ship-asset: surface=<x>, no asset path — exiting cleanly`. Do not commit. |
| missing / unparseable | exit with `[needs-user-call]` row appended to `plan/AUDIT.md`. Do not default to `site`. |

This gate is unconditional. There is no `--force` flag.

## 4. Autonomy contract

- **Pick the highest-scoring asset finding** when invoked
  without arguments. Score the same way `/iterate` does.
- **Render, don't deliberate.** If the brief is clear, spawn
  `brander` and ship. Don't ask the user. For taste calls,
  the user runs `/oversight` — see §10.
- **One asset per invocation.** No batching. No "while we're
  in here, also do the favicon."
- **Provenance JSON sibling required** for every generated
  raster. The PNG never ships alone.
- **Never overwrite a hand-authored asset** (one without a
  provenance sibling). Refuse and flag `[needs-user-call]`.

## 5. Delegation

- **`brander`** — renders the asset. Always delegated.
  `ship-asset` does not call `satori`/`resvg` directly; that's
  the brander's job. Receives a brief, returns paths.
- **`scout`** — only if the asset task needs an external fact
  (e.g. correct color of a vendor logo). Rare.
- **No parallel calls within one ship-asset invocation** —
  one asset, one render.

## 6. The procedure

### Step 0 — Surface gate + re-sync

```bash
git pull --ff-only
```

Then read `plan/bearings.md`'s `Surface:` line per §3. Exit
clean if not `site`/`hybrid`.

### Step 1 — Pick the work

- No argument → read `plan/CRITIQUE.md` Pending and
  `plan/AUDIT.md` for findings with `category: seo` or
  `category: visual` whose suggested fix is an asset render.
  Score by impact × ease. Pick the top one.
- Explicit argument (`og <route>`, `favicon`, etc.) → use it.

If no findings and no argument: run §8 audit pass and exit 0.

### Step 2 — Build the brief

A brander brief is a small JSON object:

```json
{
  "kind": "og" | "favicon" | "social-card" | "svg2png" | "wordmark" | "custom",
  "target": "<output path under public/ or app/>",
  "source": "<source SVG/JSX path, or null if generating from template>",
  "template": "<template name from design/ or null>",
  "size": [<w>, <h>] or null,
  "title": "<text content if applicable>",
  "subtitle": "<text content if applicable>",
  "tokens": "<path to design/tokens.css for palette>",
  "fonts": ["<font family names already available locally>"]
}
```

Resolve every field from `bearings.md` + `design/` + the
finding. Don't ask the user.

### Step 3 — Spawn `brander`

```
Agent({ subagent_type: "brander", prompt: "<brief JSON + acceptance criteria>" })
```

Brander returns paths to the rendered file(s) + the provenance
JSON sibling(s). It does **not** commit.

### Step 4 — Wire (only if first instance of this asset type)

Examples of "wiring":
- First per-route OG → add `app/<route>/opengraph-image.tsx`
  pointing at the rendered template.
- First favicon set → update `<head>`/metadata in the root
  layout to reference the new files.
- First social card variant → register meta tags in the page
  metadata.

Subsequent assets of the same type re-use the existing wiring.

### Step 5 — Verify

```bash
pnpm verify
```

The new asset must not break the build, the e2e walker, or any
unit test. If the asset wiring touched code, that code path is
covered by verify automatically.

If verify fails: read the log, patch (likely the wiring, not
the asset), re-run. Up to 3 same-root-cause iterations.

### Step 6 — Commit + push

```bash
git add <asset path> <asset>.json <wiring file if any>
git commit -m "asset: <kind> <slug>

Brief: <one-line summary>
Source: <source path>
Provenance: <generated_by, source, commit-at-render>
"
git push origin <DEFAULT_BRANCH>
```

**Always commit the provenance JSON in the same commit** as
the raster. They live and die together.

### Step 7 — Confirm deploy

```bash
pnpm deploy:check
```

If the deploy doesn't go ready: same failure path as any other
shipping skill — read log, patch, push, retry up to 3.

### Step 8 — Drain the finding

If this invocation addressed a finding from
`plan/CRITIQUE.md` or `plan/AUDIT.md`, move it to the Done
section in a follow-up amendment to the same commit (or skip
if already drained inline).

### Step 9 — Done

Return cleanly.

## 7. Audit pass (Surface: site/hybrid only)

Score 0–10 by impact × ease:

1. **Missing per-route OG.** Walk canonical URL set; flag any
   route whose `<head>` lacks `og:image` (or points to a
   default).
2. **Default OG everywhere.** All routes share one OG with no
   per-route content — likely the project never set up a
   dynamic handler.
3. **Broken image refs.** MDX/JSX references an image file
   that doesn't exist on disk.
4. **Favicon 404 or missing.** No `.ico`, no `.svg`, or the
   referenced file 404s.
5. **Social card variants missing** when the project declares
   they should exist (Twitter/X, LinkedIn cards in metadata).
6. **Provenance hygiene.** Generated assets without a sibling
   provenance JSON. Provenance pointing at a deleted source.
7. **Stale renders.** Provenance commit is older than the
   referenced template/source's last edit.

Write findings to `plan/AUDIT.md` under category `asset`.

## 8. Hard rules

1. **`Surface:` gate is unconditional.** No override, no
   force, no exception.
2. **One asset per invocation.** Batching is for an explicit
   phase, not for the iterate loop.
3. **Provenance JSON sibling required** for every generated
   raster. Hand-authored static assets are exempt.
4. **Never overwrite a hand-authored asset.** Refuse + flag.
5. **No external upload destinations.** Assets land in the
   repo, served by the project's own host.
6. **No `Co-Authored-By:`. No emojis.**
7. **Atomic commit** — asset + provenance + wiring in one.

## 9. Failure modes

1. **`Surface:` field missing.** Exit, flag
   `[needs-user-call]`. Do not default.
2. **`brander` returns a render error.** Capture in audit;
   exit without committing.
3. **Generated PNG > 1 MB.** Re-render with optimization. If
   still oversized, flag as `[needs-user-call]`.
4. **Asset would clobber a hand-authored file.** Refuse.
5. **`pnpm verify` fails ≥3 times on same root cause.** Stop.
6. **`pnpm deploy:check` fails ≥3 times.** Stop.
7. **Render dependencies missing** (`satori`, `@resvg/resvg-js`).
   Install once with `pnpm add -w` in the same commit; if
   install fails, flag as `[needs-user-call]`.
8. **Source SVG references a font not available locally.**
   Either inline the font or flag `[needs-user-call]` — do not
   silently substitute.

## 10. When taste calls are needed — use `/oversight`

`/ship-asset` is **autonomous**: drains **one** finding,
never asks the user.

When the project has no brand setup yet or needs a refresh,
the user runs `/oversight` (the existing user-in-the-loop
skill). `/oversight` audits the lay of the land, asks
targeted questions about mood / accent / wordmark / OG
template, captures the locked brief into
`plan/bearings.md`'s "Visual & tonal defaults" section, and
appends concrete asset-render rows to `plan/AUDIT.md` under
`category: asset`. `/ship-asset` then drains those rows one
at a time on subsequent ticks.

This keeps the brand brief in durable repo state, ships
assets through the same demand-pull path as every other
improvement, and preserves the rule that `/oversight` is the
**only** skill allowed to use `AskUserQuestion`.

## 11. Quick reference

```bash
# Read
plan/bearings.md            # Surface: line, design defaults
plan/CRITIQUE.md            # asset findings filed by /critique
plan/AUDIT.md               # asset findings filed by /iterate
design/tokens.css           # palette
design/<template>.jsx       # render templates if present

# Write (rendered by brander, committed by ship-asset)
<public-asset-path>.png     # or .svg, .ico, etc.
<public-asset-path>.json    # provenance sibling
<wiring-file>               # opengraph-image.tsx, layout metadata, etc.

# Validate + commit + push + deploy
pnpm verify
git add <explicit files>
git commit -m "asset: ..."
git push origin <DEFAULT_BRANCH>
pnpm deploy:check
```
