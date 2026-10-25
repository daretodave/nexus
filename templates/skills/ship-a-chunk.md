# Skill: ship-a-chunk

> **Full autonomy.** When invoked (manually, via `/ship-a-chunk`,
> or under `/loop` / `/march`), you have authority to ship one
> chunk of the plan end-to-end with **no review checkpoint**:
> build, write tests, run the verify gate, close the chunk,
> commit, push, confirm deploy. The user reads the diff after,
> not before.
>
> **The bar for asking is high.** If you would have asked, decide
> instead and document the call in the commit body. Stop only on
> §10 below.

## 1. Purpose

`plan/README.md` lists <PROJECT>'s specs; each spec
(`plan/NN-<slug>.md`) ends in chunks sized S, M or L, where L
is one session at most. A chunk is one self-contained slice
that ships end-to-end: code + unit tests + e2e + commit + land
(deploy follows), and in the same commit it leaves the plan as
one line in `plan/ARCHIVE.md`. The shape is in
`nexus/concepts/plan-shape.md`.

This skill drives the build **autonomously, in a loop**, so a
single overnight run can move the project forward by several
chunks.

## 2. Invocation

```
/ship-a-chunk                       # next ready chunk (pick order, Step 1)
/ship-a-chunk 08.2                  # that chunk
/ship-a-chunk 08                    # the next ready chunk of spec 08
/ship-a-chunk 08.2 dry-run          # read + plan, no code commit
/loop 30m /ship-a-chunk             # autonomous, every 30 min
/loop /ship-a-chunk                 # autonomous, self-paced
/march                              # outer dispatcher (preferred)
/loop /march                        # the autonomous-beast endgame
```

When invoked from `/loop` or `/march`, **do not pause for
review**. After commit + land + deploy:check, return cleanly.

## 3. Autonomy contract

The user's standing instruction: **"more get-it-done, less ask
me questions."** Internalize this:

- **Design / scope ambiguity → decide.** Pick the choice most
  consistent with the spec's Design, the canonical sibling
  spec, and `bearings.md`.
  Document the call in the commit body under "Decisions". Never
  block.
- **Empty / missing content → render the empty state and ship.**
- **Spec not chunked yet → chunk it** per
  `skills/plan-a-spec.md` §5. Commit the chunks separately
  (`plan: chunk spec <NN>`), then build the first one.
- **Chunk bigger than its size → split it.** Build the first
  vertical slice; the rest become new chunks (`NN.ka`,
  `NN.kb`) that divide its A-IDs. The split rides in the same
  commit, stated in the body.
- **Verify failure → read the log + patch.** Iterate up to 3
  times on the same root cause.
- **Deploy failure → same as verify.** Up to 3 same-root-cause
  iterations.
- **External research needed → spawn a sub-agent.** Don't pollute
  main context with citations and source pages.

The only conditions that warrant stopping are §10.

## 4. Delegation

Spawn sub-agents aggressively. They protect main-agent context
and parallelize independent work.

- **`scout`** — every external research need.
- **Domain specialists** — for prose drafting, schema work,
  observation. See `.claude/agents/`.
- **Parallel calls** when work is independent.

The main agent's job is wiring, code, decisions. Delegate prose
and research.

## 5. The page-family / feature-surface shape

Every page-family / feature-surface spec ships **all** of these
across its chunks, mirroring the canonical sibling spec
(`plan/02-*.md` in the starter plan):

```
<your-app-path>/<route-or-surface>/
├── <main entry>                     # the page / endpoint / command
├── <sub-entries>                    # detail pages, sub-routes, sub-commands
└── <test-files>                     # colocated unit tests

<components-or-handlers>/<family>/
├── <Family>Section.tsx              (or equivalent for your stack)
├── <OtherSection>.tsx
└── __tests__/

<lib-or-utils>/<family>/
├── queries.ts | seo.ts | etc.
└── __tests__/

<e2e>/<family>.spec.ts               # canonical render + cross-link checks
<e2e>/mobile/<family>.mobile.spec.ts # for web projects: 375px viewport
```

Use the canonical sibling's directory as the literal template —
copy structure, swap names + queries.

### Already-built primitives

After the substrate specs ship, these exist and are reused:

- Layout primitives (Header, Footer, Container, …)
- Editorial atoms / UI atoms (cards, chips, etc.)
- Content / data loaders (in shared packages)
- SEO helpers / metadata builders
- Design tokens

If a primitive doesn't exist, build it inside the appropriate
shared package; tests colocated.

## 6. The procedure

### Step 0 — Re-sync state

```bash
git pull --ff-only
```

If divergence, stop per §10.

### Step 1 — Pick the chunk

Read `plan/nexus.lock` first: `shape: chunks` is this skill's
plan; `shape: phases` (or no lock) means the repo is on kit v1,
so stop and say so (see `nexus/playbooks/upgrade.md`).

Then pick, from `plan/README.md`:

1. An explicit argument wins: a chunk id ships that chunk; a
   spec number ships that spec's first ready chunk.
2. Otherwise the **Asap** lane, in its written order.
3. Otherwise the spec table, in table order.

Within a spec, take the first chunk whose `needs` are done (a
need is done when its line is gone from every spec). Skip
anything in the **Held** lane. A spec that says `Not chunked
yet.` is chunked first (§9).

### Step 2 — Read the spec

`plan/NN-<slug>.md`, end to end. Design and Contracts are
decided; Acceptance says what done means for the A-IDs this
chunk `closes` (or `partial`s). The chunk's sub-bullets are
requirements, not suggestions.

### Step 2.5 — Mirror the spec to GitHub (best-effort)

Open (or reuse, or reopen) the spec's mirror issue so the
Issues tab shows the work the moment it begins. The helper is
**idempotent**: find-or-create-or-reopen keyed on the title
prefix `Phase <N> — ` (the helper's title contract, kept from
kit v1; `<N>` is the spec number), so re-runs reuse the same
number instead of spamming duplicates.

```bash
issue_body=$(mktemp)
cat > "$issue_body" <<EOF
**Goal:** <the spec's one-line outcome>

**Spec:** [\`plan/<NN>-<slug>.md\`](https://github.com/<REPO_SLUG>/blob/<DEFAULT_BRANCH>/plan/<NN>-<slug>.md)

---
_Tracked by the autonomous loop. The commit that closes the spec's last chunk closes this issue via a \`Closes #<this-issue>\` trailer._
EOF

SPEC_ISSUE=$(node scripts/loop-issue.mjs spec-open \
    --spec "<NN>" \
    --title "<spec title>" \
    --body-file "$issue_body")
echo "spec mirror: #$SPEC_ISSUE"
```

On **any failure** (auth, rate limit, network): print stderr
to the run log and continue. The mirror is best-effort, never
gating (Hard rule 10). If it succeeded, keep `$SPEC_ISSUE` for
Step 10 (a `Closes` trailer only when this chunk is the spec's
last) and Step 12.5.

### Step 3 — Read the design + canonical sibling

```bash
# Design (may not exist or be partial — that's OK)
cat design/INDEX.md                      # if a design layer exists
cat design/page-<family>.<ext>           # if family-specific design exists
cat design/decisions.<ext>               # if a decisions doc exists

# Canonical sibling: the first feature-surface spec's code
ls <repo-root>/<your-app-path>/<canonical-family>/
```

If `design/` is empty or missing for this family, proceed using
the spec + canonical sibling + bearings. Note in commit-body
Decisions.

### Step 4 — Build

Mirror the canonical sibling's structure into the new family.
Reads via shared loaders (`<PROJECT_PKG_PREFIX>/content`,
`<PROJECT_PKG_PREFIX>/data` if applicable); never reach into
the filesystem from a leaf component.

For each new content / data read pattern, add a helper to the
appropriate shared package with colocated tests.

### Step 5 — Wire the routes / surface

Wire the new entries per the framework's convention (Next.js
App Router auto-discovers; Express / Fastify need explicit
mounting; CLI commands need registration). Update sitemap /
manifest / index files as needed.

### Step 6 — SEO / metadata (where applicable)

Use shared SEO helpers. `generateMetadata`, JSON-LD per the
spec's chosen type, OG image route handlers.

### Step 7 — Tests

- **Unit:** colocated `__tests__/`. Mock content / data loaders
  at module boundaries.
- **E2E (web):** render H1 + canonical + at least one cross-link
  + global footer. At 375px: `scrollWidth - innerWidth ≤ 1`,
  H1 within viewport.
- **E2E (non-web):** equivalent end-to-end test for your domain
  (e.g. CLI snapshot, API contract test).

### Step 8 — Cross-link retrofit

When this family ships, retro-fit incoming links from
already-shipped families. Keep retro-fits **scoped** — modify
the chip / nav / new section, not whole pages. One retro-fit
commit per family.

### Step 9 — Verify gate

```bash
pnpm verify    # or your stack's equivalent
```

Runs `typecheck → test:run → data:validate → build → e2e` (or
your project's gate composition), plus `node
scripts/plan-check.mjs --since HEAD` once Step 9.5 has closed
the chunk. All hard. Iterate up to 3
times on the same root cause; otherwise stop per §10.

### Step 9.5 — Close the chunk (same commit)

The plan only shrinks. In the spec and the roadmap:

1. Remove the chunk's line and its sub-bullets.
2. Remove the A-IDs it `closes` from `## Acceptance`, and fix
   the `Measure:` line (`open` down, `closed` up, `next`
   unchanged). A `partial` ID stays; say in the body what's
   left of it.
3. Remove the chunk from other chunks' `needs` and from the
   Asap lane; update the spec's `N left` in `plan/README.md`.
4. Append one line to `plan/ARCHIVE.md`:
   `- <ISO date> · <NN.k> · <what now works, ≤ 10 words> ·
   (this commit)`. Git knows the hash; a later archive edit
   may swap it in.
5. If the spec now has nothing left: move its lasting rules
   and decisions into `identity/` (or `bearings.md`'s standing
   decisions if there's no `identity/`), delete the spec,
   remove its row, and archive
   `- <date> · <NN> · spec complete: <title> · absorbed into
   identity · deleted in (this commit)`.

Then run `node scripts/plan-check.mjs --since HEAD`.

### Step 10 — Commit + land (atomic)

Stage explicitly. Conventional subject; body in 4–8 bullets
describing what shipped + what the user can now do. Add
"Decisions" section listing autonomous design calls.

**If Step 2.5 captured a spec issue number** (`$SPEC_ISSUE`)
and this chunk was the spec's last, add a `Closes #<N>`
trailer to the commit body. GitHub auto-closes the spec mirror
when the commit pushes to <DEFAULT_BRANCH>.

```bash
git add <explicit files>
git commit -m "$(cat <<'EOF'
feat: <family> page family (<NN.k>)

- <bullet 1>
- <bullet 2>

Decisions:
- <design call 1 — picked X over Y because <reason>>

Closes #<spec-issue-number>   (only on the spec's last chunk)
EOF
)"
# land per owner mode: skills/next/land.md §6
```

**No `Co-Authored-By:` trailer. No emojis.**

### Step 11 — No separate tick

The close (Step 9.5) rode in the Step 10 commit; there is no
separate plan commit. If you chunked a spec in Step 1, that was
its own prior commit (`plan: chunk spec <NN>`).

### Step 12 — Confirm deploy

```bash
pnpm deploy:check
```

Outcomes:

- **Exit 0 (ready)** — site green at the pushed commit.
  Continue to Step 13.
- **Exit 1 (error)** — read the log + admin URL. Patch root
  cause. Re-run from Step 9. Up to 3 same-root-cause iterations;
  otherwise stop per §10.
- **Exit 2 (timeout)** — surface the timeout; continue.
- **Exit 3 (config)** — `<PROVIDER_AUTH_TOKEN>` missing or
  unreachable. Stop per §10.

### Step 12.5 — Spec mirror comment

If Step 2.5 captured `$SPEC_ISSUE` and Step 12 was green:

```bash
node scripts/loop-issue.mjs spec-close \
  --spec "<NN>" \
  --commit "<commit-sha>" \
  --deploy-url <DEPLOY_URL>
```

This posts the chunk's ship comment (and the deploy URL) on the
spec's issue. Failures here are warnings, not blockers.

### Step 13 — Done

Return cleanly. The loop's next tick picks up the next chunk.
If you ran outside the loop, summarize what shipped + what's
next in 2–3 lines.

## 7. Hard rules

1. **No `Co-Authored-By:` in commits.** Plain message bodies.
2. **No emojis** anywhere in code, content, or commit messages.
3. **No `--no-verify`, no force-push, no destructive resets.**
4. **Don't drag in stray working-tree changes.** `git status
   --short` first; stage explicitly.
5. **Don't restart the user's dev servers.** They keep dev up;
   the e2e harness uses a separate port.
6. **Tests alongside code** — never "add tests later".
7. **Small, focused components in folders.** Prefer 5 small
   files over 1 dense file.
8. **Content stays in <CONTENT_LOCATION>.** Data stays in
   `<DATA_LOCATION>`. No hardcoded copy/records in components.
9. <PROJECT-SPECIFIC RULES — e.g., site name lowercase>
10. **Spec issue mirror is best-effort, not gating.** If
    `loop-issue.mjs spec-open` fails, the chunk still ships;
    log the stderr and continue. The mirror is a public
    timeline, not a verification step.
11. **The plan only shrinks.** A closed chunk leaves no ticked
    box, no "done" note, no struck-through line: its record is
    the archive line. A-IDs are never renumbered or reused.

## 8. Cross-link retrofit policy

When shipping family X, retro-fit links from already-shipped
families to X. The retro-fit is part of the *same* chunk
commit.
Keep edits scoped. Do not rewrite an already-shipped page's
structure to make room — that's a follow-up commit, not a
retro-fit.

## 9. Chunking (when a spec isn't chunked)

If the picked spec says `Not chunked yet.`, follow
`skills/plan-a-spec.md` §5: cut it into S/M/L vertical slices
that cover every A-ID, write the Measure line, and commit that
alone (`plan: chunk spec <NN>`) before building the first one.

## 10. Failure modes — when to actually stop

These are the only conditions that warrant stopping the loop
and asking the user. Everything else: decide, ship, document.

Before any stop: if `scripts/notify.mjs` exists, fire it with
the stop reason (`--priority high`). Best-effort — a failed
notification never becomes its own failure.

Stops come in two shapes. **Repo-shaped** failures (the whole
loop is unsafe to continue) end the tick entirely.
**Chunk-shaped** failures (this one chunk can't ship; the rest
of the plan is fine) additionally add the chunk to the **Held**
lane in `plan/README.md` as `- **<NN.k>** · blocked: <short
reason> · since: <ISO-date> · until: <what unblocks it> ·
max_age: 14d` (a lock that times out:
`nexus/concepts/plan-shape.md`), commit + land that state
change, and return cleanly. The next `/march` tick picks past
it into still-shippable work, and `/oversight` owns
unblocking; past `max_age` the lock sweep asks the owner once.

Repo-shaped — stop the tick:

1. **`pnpm verify` fails ≥3 times on the same root cause.**
2. **`pnpm deploy:check` fails ≥3 times on the same root cause**
   after `pnpm verify` passes locally.
3. **`<PROVIDER_AUTH_TOKEN>` missing or rejected**
   (deploy:check exit 3). Stop and ask the user to populate
   `.env`.
4. **A `git pull` produces a divergence.** Don't `--rebase`
   blind; stop and report.
5. **A deploy fails for an infrastructure reason** (env var
   missing, plugin incompatibility) and the fix isn't local
   code. Stop and report.

Chunk-shaped — hold it with `blocked: …`, notify, return:

6. **The chunk requires a paid service or API key that isn't
   configured.** Note which env var / runbook is missing in
   the blocked reason.
7. **The design contradicts the URL / API / CLI contract** in a
   way you can't reconcile by trusting the contract.
8. **Chunk scope is genuinely ambiguous after reading the spec
   + bearings + spec.md.** Make the spec's Design more
   decisive (its own commit) and proceed; hold only if even
   that fails.

For everything else: **decide, ship, document.**

## 11. Quick reference

```bash
# Where you read
plan/nexus.lock                              # shape: chunks
plan/README.md                               # lanes + spec table (pick order)
plan/<NN>-<slug>.md                          # the spec: design, acceptance, chunks
plan/ARCHIVE.md                              # one line per closed chunk
plan/bearings.md                             # stack + conventions
design/                                      # design exports (optional)
spec.md                                      # product spec
<your-app-path>/<canonical-family>/          # canonical sibling

# Sub-agents
Agent({ subagent_type: "scout", prompt: "..." })
# + your domain specialists

# Verify + close + commit + land + deploy
pnpm verify
node scripts/plan-check.mjs --since HEAD
git add <explicit files>
git commit -m "<subject>"
# land per owner mode: skills/next/land.md §6
pnpm deploy:check
```
