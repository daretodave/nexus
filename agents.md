# agents.md

> The entry point for any AI agent landing in this repo cold.
> This repo is nexus — the methodology + template kit — and it
> runs on itself: the same loop the kit teaches ships the kit.
> Read this top to bottom; the rules at the top are
> non-negotiable.

## Standing rules

### 1. Commit and push. Always. As a single atomic act.

The loop assumes `origin/main` is the source of truth. Every
shipping skill ends with `git commit` immediately followed by
`git push origin main`. No unpushed commits between ticks; no
dirty tree at turn end.

### 2. No `Co-Authored-By:` trailers. No emojis.

Plain commit bodies. The single carve-out: cloud ticks append
the `Cloud-Run: <run-url>` trailer (see
`.github/CLOUD_LOOP.md`). Nothing else, ever. The `✓` and `❌`
dingbats used in docs are fine; pictographic emoji are not —
the verify gate enforces this mechanically.

### 3. The verify gate is non-negotiable.

```
node scripts/verify.mjs
```

Legs: `links → tree → discover → placeholders → anatomy →
emoji`. Every leg is a hard gate; red = blocked commit. Run it
**foreground and wait** — never `run_in_background`. No
`--no-verify`, ever. When a change introduces a new invariant
(a new placeholder, a new required section), the same commit
teaches the gate about it.

### 4. There is no deploy gate.

For this repo, the push IS the deploy — adopters read the kit
straight from GitHub. `npm run deploy:check` exists for
command symmetry and always exits 0 with a note. Skills skip
deploy-confirmation steps.

### 5. No force-push. No destructive resets. No `--no-verify`.

If `git pull --ff-only` diverges, stop and report. The
`.claude/hooks/guard.mjs` hook enforces this class of rule
mechanically; a guard block firing is itself a finding.

### 6. Blocked is loud.

Before stopping on any failure-mode condition, surface it as a
GitHub issue (`gh issue create`, unlabeled — the next `/triage`
classifies it) or a comment on the phase's mirror issue.
Best-effort; a failed notification never becomes its own stop.

### 7. Templates are the product. Guard their contracts.

Everything under `templates/` is copied into real repos. Two
consequences: template file paths and the placeholder
vocabulary are **public API** (renames are breaking changes —
update `templates/README.md`, the root `README.md` tree, and
`scripts/verify.mjs` in the same commit), and template content
never references kit-internal paths except as documented
`nexus/...` pointers.

---

## Project

**nexus** — a methodology + template kit that turns a repo
into a project that ships itself. Lives at
https://github.com/daretodave/nexus. The product spec is
`README.md` (what the kit promises) plus
`concepts/architecture.md` (how it works). There is no
`spec.md`; for a kit, the README is the spec.

## Repo shape

```
README.md            The spec + entry point.
concepts/            The mental model (architecture, skills, asking).
playbooks/           Adoption + operations runbooks.
customization/       Opt-in layers per project shape.
templates/           THE PRODUCT — files adopters copy.
skills/              nexus's OWN skills (the loop that ships the kit).
plan/                nexus's OWN state files (build plan, queues).
scripts/             The kit's verify gate (verify.mjs).
.claude/             nexus's OWN Claude Code config (commands,
                     settings.json allowlist, guard hook).
.github/             nexus's OWN cloud loop (march.yml).
```

Note the split: `templates/skills/` is what adopters get;
`skills/` is what this repo runs. Same shapes, different
verbs — a docs kit ships docs, not pages.

## How work happens

| Skill | Source of truth | What it does |
|---|---|---|
| `march` | `skills/march.md` | Dispatch: triage → critique → phase → expand → iterate. |
| `ship-a-phase` | `skills/ship-a-phase.md` | Ship one phase of the kit's build plan. |
| `iterate` | `skills/iterate.md` | Audit the kit, ship one improvement. |
| `critique` | `skills/critique.md` | Dry-run adoption as a stranger; file friction findings. |
| `triage` | `skills/triage.md` | Route incoming GitHub issues. |
| `expand` | `skills/expand.md` | Propose new phases from accumulated signals. |
| `oversight` | `skills/oversight.md` | **User-in-the-loop.** The only skill that asks. |
| `jot` | `skills/jot.md` | User quickfire → `plan/CRITIQUE.md`. |
| `digest` | `skills/digest.md` | **The night shift.** Daily morning briefing → `plan/DIGEST.md`; tuning proposals as candidates. Own workflow, never dispatched by march. |
| `lessons-pr` | `skills/lessons-pr.md` | Fold a sibling project's lessons into the kit. |

```
/march                       # do the right thing
/loop 45m /march             # autonomous loop, local
/oversight                   # course-correct
```

## Operational secrets

- **`GH_TOKEN`** — optional locally (`gh auth login` works);
  the cloud loop uses the Actions `GITHUB_TOKEN`. Used for
  `/triage` and the issue mirror. `GH_REPO=daretodave/nexus`.
- **`CLAUDE_CODE_OAUTH_TOKEN`** — repo secret for the cloud
  loop only. Mint with `claude setup-token`.
- No other secrets. The kit's gate is hermetic and offline.

## Where to look

| If you need… | Read |
|---|---|
| What nexus is | `README.md` |
| Conventions, voice, contracts | `plan/bearings.md` |
| What ships next | `plan/steps/01_build_plan.md` |
| Open findings | `plan/AUDIT.md` |
| Critique queue | `plan/CRITIQUE.md` |
| Phase candidates | `plan/PHASE_CANDIDATES.md` |
| How a skill works | `skills/<skill>.md` |
| What adopters copy | `templates/` + `templates/README.md` |
