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
| Scripts | Node ≥18, zero dependencies, ESM `.mjs` | No `node_modules`, no lockfile; paths through `fileURLToPath` (the gate refuses `URL.pathname`); shared `.nexus/` state written under a lock, renamed into place |
| Verify gate | `node scripts/verify.mjs` | 13 legs, 3 opt-in more; see `agents.md` rule 3 |
| Secrets | `nexus.secrets.json` + `scripts/secrets.mjs` | The model sees names, never values; values move only between the vault, a sink and a child process (`secrets run`); the guard and the `secrets` leg keep them out |
| Diagrams | `node scripts/diagrams.mjs` | SVG under `assets/`, one style table; never hand-drawn; `--check` (the `diagrams` leg) fails on drift |
| README GIFs | `npm run record -- <scenario>` in `packages/cli` | Recorded from a demo scenario under `assets/gifs/`, a `.png` poster beside each; the `gifs` leg holds 5–8 s, 3 MB, alt text and the poster link, never the bytes |
| GUI | `packages/cli` (`@usenexus/cli`) | One server, many sessions; it runs the repo's own scripts (claims, plan, announce, worktree), never reimplements them; plan changes only as `plan/pending/` files; tests reach gh and the model only through injected seams; `design/handoff/` is the source of truth, ported rigidly with every skip logged |
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
8. Mermaid `flowchart` is the accepted idiom for one thing
   only: branching decision-routing (README's playbook picker,
   `customization/data-layer.md`'s variant picker). Prose and
   tables stay the default everywhere else — don't reach for
   mermaid for anything that isn't a "which path do I take"
   decision tree.

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

## Commit verb vocabulary (locked)

Every commit's first line is `<verb>: <subject>` (or
`<verb>(<scope>): <subject>` — the parenthetical scope is
stripped before matching, so `fix(cloud):` matches as `fix`).
`.claude/hooks/guard.mjs`'s `commit-verb` rule blocks anything
else at commit time; a block firing is itself a finding
(agents.md rule 6).

| Verb | Fires from |
|---|---|
| `critique` | `/critique` |
| `digest` | `/digest` |
| `expand` | `/expand` |
| `jot` | `/jot` |
| `oversight` | `/oversight` |
| `triage` | `/triage` |
| `feat` | new capability (doc, script, template) |
| `fix` | correcting a prior mistake |
| `docs` | doc-only edit, no new capability |
| `templates` | `templates/` content only |
| `playbook` | new/edited `playbooks/*.md` |
| `plan` | `plan/README.md`, specs, `plan/ARCHIVE.md`, `plan/CANDIDATES.md` state changes |
| `ci` | `.github/workflows/` only |
| `cloud` | cloud-loop-specific code/doc changes |

New verb → add the row here and to `VERBS` in
`.claude/hooks/guard.mjs` (plus its `self-test` cases) in the
same commit — the gate-teaching rule (agents.md rule 3) applies
to the guard hook too.

## Plan expansion posture

**bold** — `/expand` files candidates to
`plan/CANDIDATES.md`; promotion happens in `/oversight`.

## Decisions standing for the loop

1. Adopter-facing improvements outrank kit-internal polish at
   equal score.
2. A doc that promises a file the kit doesn't ship is a HIGH
   finding — either ship the file or fix the promise; never
   leave the gap.
3. Lessons from real adopters (sibling repos beside the kit,
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
7. Anything the GUI commits for a person lands from a
   temporary worktree of origin, never their checkout, and
   runs the repo's own hooks through wrappers that unset the
   GIT_* a linked worktree leaks (GIT_DIR, the index, and
   GIT_CONFIG_PARAMETERS); kit hooks unset them too. A gate's
   own scratch repos otherwise write the real one (spec 47).

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
