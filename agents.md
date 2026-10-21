# agents.md

> The entry point for any AI agent landing in this repo cold.
> This repo is nexus — the methodology + template kit — and it
> runs on itself: the same loop the kit teaches ships the kit.
> Read this top to bottom; the rules at the top are
> non-negotiable.

## Standing rules

### 1. Land per owner mode. Always committed, always pushed.

The loop assumes `origin/main` is the source of truth. How work
lands depends on the checkout (`npm run claims -- whoami`;
`playbooks/owner-mode.md`):

- **Owner mode** (an untracked `.owner` at the checkout root,
  not switched off in `.nexus/local.json`). **nexus runs in
  owner mode:** the owner's checkout carries `.owner`, and the
  cloud loop pushes main on the owner's token. Every shipping
  skill ends with `git commit` immediately followed by `git
  push origin main`; a rejected push means `git pull
  --rebase` of your own unpushed commits, the gate again, and
  another push. The owner settles `plan/pending/`
  (`npm run settle`).
- **Contributor mode** (no `.owner`: any other clone, or the
  owner's switched off). Never push main: each chunk lands on
  `next/<id>` as a pull request (a `/heads-down` package on
  `pkg/<slug>`, a plot on `plot/<slug>`), stacked at most two deep,
  review fixes as new commits, plan changes only through
  `plan/pending/<id>.md`.

`scripts/git/push-policy.mjs` (pre-push, armed by
`node scripts/install-hooks.mjs`) refuses main on `origin` or
`upstream` outside owner mode (a fork's main is its
contributor's). `.owner` is gitignored; never commit it. No unpushed
commits between ticks; no dirty tree at turn end.

### 2. No `Co-Authored-By:` trailers. No emojis.

Plain commit bodies. The single carve-out: cloud ticks append
the `Cloud-Run: <run-url>` trailer (see
`.github/CLOUD_LOOP.md`). Nothing else, ever. If your harness
injects its own default attribution trailer (a `Co-Authored-By:`
line, a "Generated with…" footer), strip it before every commit
— this rule overrides that convention here. The `✓` and `❌`
dingbats used in docs are fine; pictographic emoji are not —
the verify gate enforces this mechanically.

### 3. The verify gate is non-negotiable.

```
node scripts/verify.mjs
```

Legs: `links → tree → discover → placeholders → anatomy →
emoji → dualshell → chunks → scripts → workflows → diagrams →
gifs → secrets`
(plus the opt-in `adopt-dryrun`, `scripts-git` and `design`). Every leg is a hard gate; red = blocked
commit. Run it
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

If `git pull --ff-only` diverges, rebase only your own unpushed
commits (`git pull --rebase`), rerun the gate, and retry;
anything else, stop and report. The
`.claude/hooks/guard.mjs` hook enforces this class of rule
mechanically; a guard block firing is itself a finding.

### 6. Blocked is loud.

Before stopping on any failure-mode condition, surface it as a
GitHub issue (`gh issue create`, unlabeled — the next `/triage`
classifies it) or a comment on the spec's mirror issue.
Best-effort; a failed notification never becomes its own stop.

### 7. Templates are the product. Guard their contracts.

Everything under `templates/` is copied into real repos. Two
consequences: template file paths and the placeholder
vocabulary are **public API** (renames are breaking changes —
update `templates/README.md`, the root `README.md` tree, and
`scripts/verify.mjs` in the same commit), and template content
never references kit-internal paths except as documented
`nexus/...` pointers.

`prompts/` carries the same contract for a narrower surface:
adopters paste its file paths directly into agents, and future
doorways (npx installer, plugin manifest) will reference the
same canonical text. Renames need the same discipline as a
`templates/` rename, even though nothing under `prompts/` is
ever copied into an adopter repo.

### 8. Ask before the first write, or not at all.

A skill run by a person may ask (`AskUserQuestion`) only before
its first write, in one batch (`concepts/asking-well.md`); after
that it decides and ships. Under a loop (`/loop`, a cloud tick,
`/heads-down`) it never asks: it takes the default and logs each
one in the commit body or the close. A question that outlives the
run goes to the `/oversight` queue (a `[needs-user-call]` row in
`plan/AUDIT.md`) and the work continues. `/oversight` remains
the skill that asks anything, any time.

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
prompts/             Canonical paste-prompts — versioned, public API.
concepts/            The mental model (architecture, skills, asking).
playbooks/           Adoption + operations runbooks.
customization/       Opt-in layers per project shape.
templates/           THE PRODUCT — files adopters copy.
skills/              nexus's OWN skills (the loop that ships the kit).
plan/                nexus's OWN state files (roadmap, specs, archive, queues).
scripts/             The kit's verify gate (verify.mjs), the
                     diagram generator (diagrams.mjs).
assets/              Generated SVG diagrams; never hand-edited.
                     gifs/ holds the README's recorded GUI GIFs.
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
| `march` | `skills/march.md` | Dispatch: triage → critique → chunk → expand → iterate. |
| `next` | `skills/next.md` | One chunk, done fully: claim, delegated build (S/M a builder, L a Workflow), gate, pending close, land per owner mode, retro. |
| `heads-down` | `skills/heads-down.md` | Questions up front, claim a list, loop `/next` on defaults with ASCII progress (`npm run progress`). |
| `plot` | `skills/plot.md` | A task into the plan with its place in line (`asap`, `anytime`, worked out, `peek`); `and do` builds it now. |
| `bug` | `skills/bug.md` | Reproduce; fix now through `/plot asap … and do`, or plot it. |
| `messy` | `skills/messy.md` | A raw dump (kept untracked in `plan/messy/`) clustered and refined into specs through a pending file. |
| `tidy` | `skills/tidy.md` | Clear dead claims; offer idle worktrees and merged branches (`npm run worktree -- list`). |
| `design` | `skills/design.md` | Opt-in Claude Design round trip: `prompt` and `addendum` from the plan (`scripts/design/prompt.mjs`). |
| `rebooting` | `skills/rebooting.md` | The reboot train (with `reboot-ready`, `reboot-resume`): park every loop, resume each from its ledger. |
| `ship-a-chunk` | `skills/ship-a-chunk.md` | Ship one chunk of the kit's plan and close it (the build steps `/next`'s builder follows). |
| `iterate` | `skills/iterate.md` | Audit the kit, ship one improvement. |
| `critique` | `skills/critique.md` | Dry-run adoption as a stranger; file friction findings. |
| `triage` | `skills/triage.md` | Route incoming GitHub issues. |
| `expand` | `skills/expand.md` | Propose new specs from accumulated signals. |
| `oversight` | `skills/oversight.md` | **User-in-the-loop.** The general-purpose skill that asks (`lessons-pr` carries the one narrow planning-step carve-out). |
| `jot` | `skills/jot.md` | User quickfire → `plan/CRITIQUE.md`. |
| `digest` | `skills/digest.md` | **The night shift.** Daily morning briefing → `plan/DIGEST.md`; tuning proposals as candidates. Own workflow, never dispatched by march. |
| `lessons-pr` | `skills/lessons-pr.md` | Fold a sibling project's lessons into the kit. |

```
/march                       # do the right thing
/next                        # one chunk, done fully
/heads-down                  # questions first, then hours of /next
/loop 45m /march             # autonomous loop, local
/oversight                   # course-correct
```

## Operational secrets

- **`GH_TOKEN`** — optional locally (`gh auth login` works);
  the cloud loop sets it from the `ACTIONS_PAT` secret. Used
  for `/triage` and the issue mirror.
  `GH_REPO=daretodave/nexus`.
- **`CLAUDE_CODE_OAUTH_TOKEN`** — repo secret for the cloud
  loop only. Mint with `claude setup-token`.
- **`ACTIONS_PAT`** — repo secret; fine-grained PAT (Contents +
  Issues + Workflows on this repo; Workflows added 2026-08-23
  so cloud ticks can push `.github/workflows/` edits
  themselves — a deliberate trade, and nothing broader: this
  token is what a prompt-injected tick would run with, so no
  Secrets/Webhooks/etc). In practice, the scope grant alone
  hasn't been enough: three confirmed cloud ticks (phase 20,
  `#40`, `#49` in `plan/AUDIT.md`) still had their
  `.github/workflows/*.yml` push rejected, because the Claude
  Code Action's own GitHub App installation token overrides
  the configured `ACTIONS_PAT` credential for workflow-file
  pushes specifically. Apply workflow-file changes from a
  local `/oversight` session until that's resolved. Cloud
  commits author as `nexus`, not `github-actions[bot]` — see
  `.github/CLOUD_LOOP.md` setup step 3.
- **npm publishing has no secret.** `.github/workflows/publish.yml`
  publishes `packages/cli` as `@usenexus/cli` through npm Trusted
  Publishing (OIDC, provenance automatic) on a `cli-v*` tag.
  Never add an `NPM_TOKEN`.
- No other secrets. The kit's gate is hermetic and offline.
- The names live in `nexus.secrets.json` (`GH_TOKEN`,
  `ACTIONS_PAT`; the loop's sign-in is not a project secret),
  values never (`customization/secrets.md`).

## Where to look

| If you need… | Read |
|---|---|
| What nexus is | `README.md` |
| Conventions, voice, contracts | `plan/bearings.md` |
| What ships next | `plan/README.md` (lanes + specs; the first ready chunk) |
| What a chunk must do | `plan/<NN>-<slug>.md` (Design, Acceptance, Chunks) |
| Plan changes waiting to settle | `plan/pending/` (`npm run settle`, owner only; `concepts/plan-shape.md`) |
| Who builds which chunk | `npm run claims -- list` (`customization/claims.md`) |
| What already shipped | `plan/ARCHIVE.md` (one line per chunk; phases 1–33 too) |
| The plan shape | `concepts/plan-shape.md`; `plan/nexus.lock` |
| Traps hit building the kit | `identity/footguns.md` (Open lines, before building; `customization/identity-layer.md`) |
| Open findings | `plan/AUDIT.md` |
| Critique queue | `plan/CRITIQUE.md` |
| Candidates (future specs) | `plan/CANDIDATES.md` |
| How a skill works | `skills/<skill>.md` |
| What adopters copy | `templates/` + `templates/README.md` |
