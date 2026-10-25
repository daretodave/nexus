# Concepts: architecture

> The whole methodology in one read. ~10 minutes.

The autonomous loop is built from five layers, stacked. Each
layer adds capability the layer below makes possible. You can
adopt the bottom three and stay at "supervised" intervention;
the top two enable unattended runs.

```
┌──────────────────────────────────────────────────────────┐
│ Layer 5 — User-in-loop (oversight)                       │
│  Pause autonomy. Brief. Ask. Adjust. Resume.             │
│  Promotes /expand candidates into specs.                 │
├──────────────────────────────────────────────────────────┤
│ Layer 4 — External signals (critique, triage, expand)    │
│  Live-site observer + GitHub issue inbox + plan grower.  │
│  Findings flow into AUDIT / BACKLOG / CRITIQUE /         │
│  CANDIDATES queues.                                      │
├──────────────────────────────────────────────────────────┤
│ Layer 3 — Awareness (verify gate, deploy gate)           │
│  Pre-commit hermetic check + post-push CI/CD poll.       │
│  Both are hard gates; red = blocked.                     │
├──────────────────────────────────────────────────────────┤
│ Layer 2 — Dispatcher (march)                             │
│  Picks the right verb each tick:                         │
│  triage → critique → chunk → data → expand → iterate     │
├──────────────────────────────────────────────────────────┤
│ Layer 1 — Skills + state files                           │
│  ship-a-chunk, ship-data, plan-a-spec, iterate,          │
│  critique, triage, expand, oversight + the plan/ tree    │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 1: skills + state files

### Skills

Skill files in `skills/` are the source of truth. Each describes
**one verb** the agent can perform: ship-a-chunk, ship-data,
iterate, critique, etc. They're heavyweight (300–500 lines each),
opinionated, and decisive.

Slash commands in `.claude/commands/` are **terse pointers** at
each skill. The command says "you are invoked under the X skill
— read `skills/X.md`." This separation matters because:

- The slash command is what the user types; it stays short.
- The skill file is what the agent reads; it stays
  comprehensive.
- Other AI clients (Cursor, Aider) can follow the skill files
  directly without slash-command infrastructure.

A skill file always has these sections (in order):

1. **Purpose** — why this verb exists.
2. **Invocation** — how it's called, including under `/loop`.
3. **Autonomy contract** — what the skill decides without
   asking; what it stops on.
4. **Procedure** — step-by-step what to do.
5. **Hard rules** — non-negotiable invariants.
6. **Failure modes** — the only conditions that warrant stopping.
7. **Quick reference** — bash commands + file paths the agent
   can copy.

The "decide vs. ask" line is the heart of the methodology.
Every skill says: **decide, document the call in the commit
body, ship.** The user reads after, not before.

### State files

State files in `plan/` and `data/` are the loop's working
memory across context loss. The agent can be respawned at any
moment; the state files survive.

The five canonical state files:

| File | Holds | Read by |
|---|---|---|
| `plan/README.md` + `plan/NN-<slug>.md` | The roadmap (lanes + one row per spec) and the specs, each ending in chunks with acceptance IDs. The first ready chunk is what ships next; a closed chunk leaves as one line in `plan/ARCHIVE.md`. See [`plan-shape.md`](plan-shape.md). | `march`, `ship-a-chunk`, `oversight` |
| `plan/AUDIT.md` | Open audit findings (scored, categorized). The Pending section is `iterate`'s queue. | `iterate`, `oversight` |
| `data/BACKLOG.md` | Pending data work (records to add/repair). | `ship-data`, `march`, `oversight` |
| `plan/CRITIQUE.md` | External-observer findings. Pending section is `iterate`'s second queue. | `critique`, `iterate`, `march`, `oversight` |
| `plan/bearings.md` | Stack pins, URL contract, standing decisions, hard rules. | All skills, all sub-agents. |

One more file is canonical: `agents.md` at the repo root — the
**rule book**. Standing rules apply across every skill. New
projects copy the template and add domain-specific rules.

---

## Layer 2: dispatcher (march)

`march` is the outer skill that decides which verb runs each
tick. The dispatch order matters:

```
1. unlabeled GitHub issues exist  →  triage (cheapest check)
2. critique due (rate-limited)    →  critique
3. ready chunk                    →  ship-a-chunk
4. pending data                   →  ship-data
5. expand due + bold/autonomous   →  expand
6. else                           →  iterate
```

Why this order:

- **Triage first** because issues from users are the highest-
  leverage signal — addressing one before it accumulates costs
  is usually right.
- **Critique second** because external observation breaks
  local-optimum thinking. Rate-limited so it doesn't dominate.
- **Chunks third** because the plan is what the project is
  *for*.
- **Data fourth** because data work is usually less critical
  than feature work.
- **Expand fifth** because growing the plan only matters once
  nothing pending is waiting to ship; posture-gated (bold or
  autonomous only) and rate-limited so it doesn't dominate.
- **Iterate last** because iteration is the catch-all — when
  there's nothing scheduled, audit + improve.

A project's own steps sit at fixed hooks around that order:
`pre` lanes before triage (yielding to a ready Asap chunk),
`queue` lanes between ready chunks and pending data, and
extra `/iterate` dimensions after the stock ones. They live in
`skills/march.lanes.md` and `skills/iterate.lanes.md`, which a
re-sync of the kit's skills never overwrites; see
[`../customization/project-lanes.md`](../customization/project-lanes.md).

`/loop /march` is the autonomous entry point. Each tick
re-dispatches; the loop self-balances.

---

## Layer 3: awareness (verify + deploy gates)

### Verify gate (pre-commit, hermetic)

`pnpm verify` runs **before every commit**:

```
typecheck → test:run → data:validate → build → e2e
```

Each check is hard. No `--no-verify` ever. The e2e leg is
hermetic: it boots the production build on a separate port and
walks every URL the project serves, with no external network.

The hermetic e2e is the most-skipped piece in real
implementations and the most-valuable. It catches the failure
class "tests pass but the built site is broken" — common in
SSG/SSR projects.

### Deploy gate (post-push, CI/CD-aware)

`pnpm deploy:check` runs **after every push**:

- Polls the hosting provider's API for the deploy at HEAD.
- Waits for terminal state (ready / error).
- Exits non-zero on error.

The shipping skills treat a red deploy identically to a red
verify: read log, patch, push. Up to 3 same-root-cause
iterations.

**These two gates are why unattended runs work.** Without them,
the loop ships red main + lies about it. With them, the loop
either ships green or stops cleanly.

### Enforcement (opt-in hardening)

Both gates — and the hard rules around them — are prose until
you mechanize them. Projects running on Claude Code can adopt
a third piece of Layer 3: a permission allowlist that
pre-approves exactly the commands the skills run (and
pre-denies force-pushes and `--no-verify`), guard hooks that
block the forbidden commands at the harness, and a pager so
"stopped cleanly" also means "told the human". See
[`../customization/claude-code.md`](../customization/claude-code.md);
the walk-away assembly is
[`../playbooks/hands-off.md`](../playbooks/hands-off.md).

---

## Layer 4: external signals (critique + triage + expand)

The autonomous loop ships what `plan/` describes. The external
signals layer brings in **what the loop wouldn't notice on its
own**:

- **`critique`** — sends a fresh-eyes sub-agent (`reader`) to
  visit the live site as a stranger. Findings about voice
  fidelity, mobile reflow, comprehension, navigation honesty.
  Filed to `plan/CRITIQUE.md`. Drained by `iterate`.
- **`triage`** — reads incoming GitHub issues. Classifies
  (bug, feature, content, data, docs, perf, a11y, seo).
  Routes (loop-queued, needs-user, closed). Comments. Drains
  to `plan/AUDIT.md` or `data/BACKLOG.md`.
- **`expand`** — reads accumulated signals (pending AUDIT /
  CRITIQUE rows, sibling-project lessons, platform drift) and
  proposes new specs to `plan/CANDIDATES.md`.
  Posture-gated (bold or autonomous only); promoted into the
  plan only by `/oversight`.

All three are **rate-limited or fast-exit by design** so they
don't dominate the loop:

- Critique: ≥12 commits + ≥24h spacing, green-deploy required.
- Triage: cheap when idle (one API call counts unlabeled
  issues; if zero, fall through in <1s).
- Expand: ≥20 commits + ≥48h spacing, posture ≠ strict.

All three **write only to state files**. They never modify
code. The shipping skills (iterate, ship-data) consume the
queues and ship the actual fixes.

---

## Layer 5: user-in-loop (oversight)

`oversight` is the **primary skill that asks the user
anything** — `bootstrap` carries the one narrow, documented
exception (see rule 6 below). `oversight` is the user's
interface to the autonomous loop.

The procedure:

1. **Audit** — read every state file, recent commits, deploy
   state.
2. **Brief** — print a tight ~25-line synthesis. Velocity,
   pending counts, deploy state, flags for unusual patterns.
3. **Questionnaire** — 1–4 targeted questions via
   `AskUserQuestion`, computed from observed flags. Not
   pre-canned.
4. **Apply** — modify plan files based on answers. Drop a
   stuck chunk. Bias the iterate loop. Refresh a spec.
5. **Commit** — single `oversight: <summary>` commit with the
   literal Q&A in the body. Audit trail.
6. **Done** — return cleanly. User re-invokes `/march` to
   resume.

`oversight` runs when the user wants to. It's the emergency
brake, the calibration touch, the "what did I come back to"
brief. **Skipping `/oversight` is the #1 anti-pattern**; it's
how unattended runs go off the rails.

---

## Sub-agents (orthogonal)

Sub-agents in `.claude/agents/` are specialists the main agent
delegates to during a skill. They're not a separate layer;
they're a parallelization mechanism that keeps the main agent's
context window clean.

Common sub-agents:

- **`scout`** — open-web research with WebSearch + WebFetch.
  Used by `ship-data` (record sourcing), `iterate` (trend
  research), anyone needing a fact from outside the repo.
- **`reader`** — fresh-eyes site observer with browser tools.
  Used by `critique`. The "first-time visitor" persona.
- **Domain specialists** — your project's "what does the agent
  need to be expert at?" Examples: `content-curator` (prose),
  `data-steward` (schema), `copy-editor` (voice), `api-checker`
  (OpenAPI compliance).

Each sub-agent file declares:
- `name` — match the filename.
- `description` — when to spawn it.
- `tools` — which tools it has (subset of main agent's).
- A system prompt — the persona + output format.

The main agent should **delegate aggressively**. The split:

- Main agent: wiring, code, architecture, decisions.
- Sub-agents: research, prose, schema, observation.

Sub-agents parallelize *inside* a session. For attended
parallelism *across* sessions — three agents, one branch —
see [`../customization/lanes.md`](../customization/lanes.md).

---

## How the layers compose

A single `/march` tick traverses every layer:

1. **Layer 2 (march)** decides which verb runs.
2. **Layer 1 (skill)** is invoked with full procedure.
3. **Sub-agents** spawn for delegated subtasks (research,
   observation, prose).
4. **Layer 3 (verify gate)** runs before commit. Red = stop or
   patch.
5. The skill commits + pushes (atomic).
6. **Layer 3 (deploy gate)** runs after push. Red = stop or
   patch.
7. The skill updates state files (Layer 1) — chunk archived,
   audit row moved to Done, etc.
8. Skill returns. Next tick re-dispatches.

If at any point the user says `/oversight`, **Layer 5** kicks
in: pause, brief, ask, adjust, commit, return. The next
`/march` tick resumes against the corrected plan.

If a critique pass runs (Layer 4): findings land in
CRITIQUE.md. The next iterate tick reads them as a finding
source alongside the regular audit.

If triage runs (Layer 4): findings land in AUDIT.md or
BACKLOG.md (depending on category). The next iterate or
ship-data tick drains them.

---

## What makes this work

The methodology is opinionated about a few non-obvious things:

### 1. State in files, not memory.

The agent can be respawned cold at any moment. Memory state
loss is the norm, not the exception. **Every important fact
lives in a file.** This is why `bearings.md`, the build plan
status block, AUDIT.md, etc. are so prescriptive — they're
the agent's only durable memory.

### 2. Decisions written upfront in specs.

Specs say "DO NOT ASK" and list every judgment call
already made. This is the difference between the loop running
unattended and the loop stopping every 20 minutes for a
clarification.

### 3. Atomic commit + push.

If the loop commits without pushing, the next loop tick
doesn't see the commit (it pulls from origin). If it pushes
without committing, there's nothing to push. **Always together.**

### 4. The verify gate is real.

Many projects have a "verify" target that's actually a subset
of CI. The methodology requires verify ≈ what production runs.
Hermetic e2e against the production build is the load-bearing
piece.

### 5. The deploy gate doesn't replace CI; it observes CI.

`pnpm deploy:check` is read-only. It reads the provider's
deploy state for HEAD and reports it. It doesn't trigger
deploys (the push does that) or judge the deploy beyond
ready/error. This makes it cheap to add to any project.

### 6. Ask before the first write, or not at all.

`/oversight` asks anything, any time. Any other skill run by a
person may ask once, in one batch, before its first write (the
claim, a file, a commit), and then decides and ships. Under a
loop (`/loop`, a cloud tick, `/heads-down`) nothing asks: each
skill takes the default and logs it where the work lands (the
commit body, the PR description, the close). `bootstrap` and
`lessons-pr` keep their documented carve-outs: bootstrap
collects tokens and confirms destructive-feeling provisioning
actions; lessons-pr asks only at its planning step. If you
find yourself wanting to ask the user mid-skill anywhere else,
**you're using the wrong skill**. The right move is to surface
the question in oversight (write to AUDIT.md as
`[needs-user-call]`), take the default, and continue.

### 6a. Owner mode decides how work lands.

The same verbs run in every checkout; an untracked `.owner`
file decides where their work goes. The owner's checkout
pushes main and settles the plan; any other checkout lands
through pull requests, and its pre-push hook refuses main (a
leg trip; the host's ruleset is the lock). See
[`../playbooks/owner-mode.md`](../playbooks/owner-mode.md).

### 7. Bias the loop, don't paper-over it.

`/oversight reset` writes a `> Bias: <category>` line to
AUDIT.md. `/iterate` reads it and weights findings 1.5x. This
is how you direct the loop without breaking its autonomy. Don't
edit AUDIT.md by hand; use oversight.

### 8. External signals are bounded.

Critique caps findings per pass. Triage skips already-labeled
issues. Both have rate limits in march. Without these, external
signals would dominate the loop and starve the build plan.

---

## What makes this fail

Three classes of failure:

### A. Substrate is wrong.

If `bearings.md` is vague, the build plan is shallow, or the
canonical sibling isn't authored well, the loop produces
plausible commits that ship the wrong thing. **The fix is
upstream**: better bearings, better briefs.

### B. Gates are bypassed.

The first time someone adds `--no-verify` "just to ship," the
methodology breaks. The verify and deploy gates are
load-bearing; never bypass.

### C. Oversight skipped.

Without `/oversight`, drift compounds. After 10 hours of
unattended runs, the loop will have made 30 small decisions
that quietly add up to a different product than you'd ship.
Always run oversight on return.

---

## What's portable

Everything in this methodology is portable across stacks. The
layer-by-layer description above doesn't reference Next.js,
Tailwind, or any specific framework. The verb names are
project-agnostic. The state file shapes are universal.

What's **not** portable:

- The exact verify-gate composition (depends on stack).
- The deploy gate's API calls (depend on provider).
- The plan's specs and chunks (depend on the product).
- The sub-agent specialists (depend on the domain).

Those are the customization points. Everything else is the same
methodology applied to a different shape.

---

## Topology

Everything above describes one repo: `plan/` and the product
live together, one `git pull`, one commit-and-push per tick.
This is the default, and it's right until a project outgrows
one shippable unit.

The **polyrepo variant** splits `plan/` into its own repo — a
private ledger — with each shippable unit a sibling repo
beside it. Two of the kit's own real-world ancestors run this
shape: multiple products under one backlog, a plan that stays
private while the products are public, or plan history that
shouldn't share a log with product history. The skills and
state-file shapes don't change; a tick's atomic act now spans
two repos instead of one, pushed product-first so the ledger
never references unpushed work.

See [`../playbooks/polyrepo.md`](../playbooks/polyrepo.md) for
the layout, the `additionalDirectories` bridge, and the
push-order rule in full.

Past two repos, the same shape generalizes to a **workspace**:
an un-versioned local root — never its own git repo — holding
`plan/` and every product as peers under one GitHub org. See
[`../playbooks/workspace.md`](../playbooks/workspace.md).

---

## Where to go next

- [`loop-shapes.md`](./loop-shapes.md) — this doc describes
  one tick; that one describes the genus of loops a project
  can grow (night shift, heartbeat, concierge, and beyond).
- [`skills-anatomy.md`](./skills-anatomy.md) — how to read or
  write a skill file in detail.
- [`../playbooks/new-project.md`](../playbooks/new-project.md)
  — concrete adoption steps for a fresh repo.
- [`../playbooks/hands-off.md`](../playbooks/hands-off.md) —
  rigging the layers for genuinely unattended windows.
- [`../templates/`](../templates/) — copy-paste artifacts.
