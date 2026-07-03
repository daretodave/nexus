# Bearings

> Standing context for every skill and every tick. This file is
> law; when a brief contradicts it, this file wins (and the
> conflict gets surfaced, not silently resolved).

## What we're building

nexus — the methodology + template kit for autonomous-loop
projects. The product is prose and templates; the users are
adopters (humans and their agents) turning repos into
self-shipping projects.

**Surface:** `kit` — a docs/templates repo. No site, no
service, no data layer. (This value is nexus-specific; adopter
projects use `site | service | library | cli | hybrid`.)

**Auth:** `none`.

## Stack (locked)

| Piece | Choice | Notes |
|---|---|---|
| Content | Markdown, hard-wrapped ~62–64 cols | Tables exempt from wrap |
| Scripts | Node ≥18, zero dependencies, ESM `.mjs` | No `node_modules`, no lockfile |
| Verify gate | `node scripts/verify.mjs` | 6 legs; see `agents.md` rule 3 |
| Deploy gate | none — push is the deploy | `npm run deploy:check` = symmetry no-op |
| Issue mirror | `node templates/scripts/loop-issue.mjs` | The kit dogfoods its own template in place |

## Voice (locked)

1. Open every doc with a `>` blockquote thesis, then `---`.
2. Sentence-case headings; numbered `§` sections in skills.
3. Terse, decisive, imperative. "Decide, ship, document."
4. Tables for schemas and matrices; checklists for gates.
5. No emojis. `✓` `✗` `❌` `→` dingbats are fine.
6. Recurring stems: "When to adopt / when not", "Hard rules",
   "Failure modes", "Quick reference", "See also",
   "You're ready when".
7. Canonical voice exemplars (read before writing a new doc):
   `concepts/architecture.md`, `playbooks/hands-off.md`,
   `customization/branding.md`.

## Public contract (locked)

- Template paths under `templates/` and the placeholder
  vocabulary (`scripts/verify.mjs` `PLACEHOLDER_VOCABULARY`)
  are public API. Breaking them requires updating
  `templates/README.md`, the README tree, and the gate in the
  same commit.
- Docs reference kit files for adopters as `nexus/<path>`
  (sibling layout) — never absolute paths.
- `.article/` is untracked personal drafts. Never reference it
  from tracked docs; never track it.

## Plan expansion posture

**bold** — `/expand` files candidates to
`plan/PHASE_CANDIDATES.md`; promotion happens in `/oversight`.

## Decisions standing for the loop

1. Adopter-facing improvements outrank kit-internal polish at
   equal score.
2. A doc that promises a file the kit doesn't ship is a HIGH
   finding — either ship the file or fix the promise; never
   leave the gap.
3. Lessons from real adopters (`../semilayer`, `../kintilla`,
   issues filed by users) outrank speculative features. When a
   sibling repo's `lessons.md` / `NEXUS_LESSONS.md` and the
   kit disagree, reality wins.
4. New docs join the README tree + get linked from at least
   one existing doc in the same commit (the `discover` leg
   enforces the second half).
5. Model ids appear in as few places as possible and always
   with a "check current ids" caveat.
6. Keep skills for THIS repo lean (~100–200 lines): a docs
   repo has simpler procedures than a product repo. Don't
   cargo-cult product steps (SEO, deploy confirmation) that
   have no meaning here.

## Hard rules

Mirrors `agents.md` — that file is canonical. Verify gate
foreground; atomic commit+push; no trailers/emojis except the
cloud `Cloud-Run:` carve-out; blocked is loud (issue mirror);
templates are public API.

## Useful commands

```bash
node scripts/verify.mjs              # the whole gate
node scripts/verify.mjs links        # one leg
npm run verify                       # same, via npm
node .claude/hooks/guard.mjs self-test
gh issue list --repo daretodave/nexus --state open
```
