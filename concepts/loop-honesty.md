# Concepts: loop honesty

> Which step of the cycle a machine checks, and which step
> still runs on the builder's word. Three failure modes, seven
> steps, one table.

---

Nexus's own loop claims a chunk, builds it, gates it, closes
it and lands it in one tick, with one model (`skills/next.md`).
Nobody outside the tick has looked yet. Field research
(2026-11-13) names three ways a build loop like that fools
itself:

- **self-approval** — the loop approving its own work with
  nothing outside checking.
- **spec gaming** — meeting the letter of an acceptance bullet
  instead of its intent.
- **misreported outcomes** — a commit or a report claiming
  something that isn't true.

This doc is an honest accounting, step by step, of what
mechanically catches each and what still rests on the lead's
or the builder's word. A **mechanical** cell names a real check
in this repo today: a gate leg, a hook rule, a script. A
**trust** cell names the skill sentence the loop is trusted to
follow, with nothing outside confirming it did. (Spec:
`plan/75-loop-failure-modes.md`.)

## The table

Rows are `skills/next.md`'s own steps, in order. "The lead"
is the orchestrating session; "the builder" is the delegated
sub-agent it reads back against the acceptance bullets.

| Step | Self-approval | Spec gaming | Misreported outcomes |
|---|---|---|---|
| **Pick** (Step 1) | trust: Step 1 — "the next chunk is the first listed whose `needs` are all done," picked in Asap → priority → table order; nothing outside confirms the order was actually followed. | trust: Step 1's skip rules ("Skip the Held lane, `plan only` specs, … and every chunk someone else claims or holds") are prose the lead applies to itself; nothing catches a lead that quietly favors the easy chunk. | trust: Step 1 — "Say in ≤ 5 lines: chunk, size, A-IDs, build mode …"; the stated id and A-IDs aren't cross-checked against the spec until gate time. |
| **Claim** (Step 1) | mechanical, adjacent: `scripts/claims.mjs` `claim()` is a compare-and-swap push to the orphan `claims` branch (`claims-codec.mjs`) that refuses an id another live claim already holds — it stops two sessions from both "approving" the same chunk, which is not the same as an outside reviewer (named as such in the spec itself). | trust: Step 1 — a chunk is claimed only once its `needs` are all done; `claims.mjs claim` checks ownership conflicts only, never readiness, so a stale or wrong read of `needs` isn't caught here. | mechanical: `claims-codec.mjs`'s `idsProblem()` enforces one chunk per call for a non-owner, non-package session (`skills/next.md` §3's "Contributor: one chunk per run") — a claim can't silently cover more than the session reports. |
| **Build** (Step 3) | trust: Step 3 — "The lead reads the returned diff against every A-ID; a miss goes back once, then the lead finishes it." The reviewer and the builder are the same model; nothing outside re-reads the diff. | trust: same Step 3 sentence, plus `skills/next/build.md` §2.3 ("Contract first, tests first for anything stateful") — a test that technically passes without covering the acceptance's intent is caught only by that one re-read. | trust: `skills/next/build.md` §2.5 — "Return: the commits … each A-ID with the file and test that meets it, the defaults it took …" is taken at the builder's word, checked only by the same lead's diff read. |
| **Gate** (Step 4.1) | mechanical: `node scripts/verify.mjs` itself — a hard, non-negotiable exit 0/1 (`agents.md` rule 3); `.claude/hooks/guard.mjs`'s `no-verify` rule blocks `--no-verify`/`-n` outright, so the gate can't be silently skipped. | mechanical, partial: the `chunks` leg (`scripts/verify.mjs` → `templates/scripts/plan-check.mjs`) enforces that every A-ID is covered, the `Measure:` line is true and every `needs` resolves — it catches a close with no structural cover for what it claims, but it cannot read whether the code honors an acceptance bullet's intent. | mechanical: `.claude/hooks/guard.mjs`'s `no-verify` rule and its `backgroundedGate` check (blocks running `verify`/`deploy:check`/`e2e`/`test:run` with `run_in_background: true`) — a report of "gate green" can't rest on a gate that was dodged or backgrounded away. |
| **Close** (Step 4.3-4.4) | trust: Step 3's diff-read sentence again — the only check that a closed chunk truly meets its A-IDs is the same lead's own earlier read; the spec's own Open question says it plainly: "Whether a closed A-ID is really met is the likely hardest and least likely pick." | mechanical, partial: the `chunks` leg re-runs after the pending file is written (Step 4.4's "Gate again") and validates the close structurally — same caveat as the Gate row: shape, not intent. | trust: `skills/next/land.md` §2 — "`says`: ≤ 10 words, what now works (the archive line)"; `scripts/plan/pending.mjs` only requires the field to be non-empty ("a close needs `says:`"), never that it's true. |
| **Land** (Step 5) | trust: `agents.md` rule 1 ("the cloud loop pushes main on the owner's token") and `playbooks/owner-mode.md` §3 — the main ruleset itself sets `required_approving_review_count: 0`, and the owner's checkout (nexus's own) bypasses even that by admin role; nothing reviews a chunk before it lands on main. | trust: Step 5 — "A run is not done until main (or the PR) holds every commit"; landing confirms the commits arrived, not that what arrived honors the acceptance bullets' intent. | mechanical: `.claude/hooks/guard.mjs`'s Stop hook (`stopCheck`) warns (or blocks under `NEXUS_STRICT_STOP=1`) when a turn ends with a dirty tree or unpushed commits — a session can't end claiming "landed" while the work never reached origin. |
| **Report** (Step 6) | trust: Step 6.2 — "Retro (always, even for `peek`): failed commands, edits that didn't apply, wrong assumptions, what review caught … Nothing to learn: 'retro: clean.'" Nothing outside checks the retro is honest or complete. | trust: Step 6.3 — "Report: what works now (1-3 lines), the defaults, what the retro changed, the next pick, and the progress as it is." The narrative is prose; only the printed progress counts (`scripts/plan/progress.mjs`). | mechanical: `.claude/hooks/guard.mjs`'s `mirror-not-closed` rule — a commit whose message says "Mirrored as #N" without a `Closes #N` (or `Fixes #N` / `Resolves #N`) for that same number is blocked outright, so the phrase that only names the mirror can no longer stand in for the one that closes it (the 2026-11-21 gap this table's own Report cell used to name as a trust cell; `plan/75-loop-failure-modes.md` chunk 75.2). |

## What this leaves honest

Read down the Self-approval column: two mechanical cells
(Claim, Gate) and one partial pair (Gate/Close's `chunks`
leg), against five trust cells. The gate is real — it is a
hard, hermetic, non-negotiable check, and nothing in this repo
lets a chunk skip it. But the gate checks *shape*: that the
plan parses, that the A-IDs are covered, that the docs link
up. It was never built to read whether a diff actually honors
an acceptance bullet's intent, or whether a commit's prose is
true. Those are the same model's word, read back by the same
model, in the same tick.

A one-model loop cannot fully check itself. That is not a bug
in this table; it's the reason the kit also runs checks that
are not the loop:

- **`/critique`** — a fresh-eyes sub-agent dry-runs adoption as
  a stranger, outside the build-and-close tick that just ran.
- **The owner's `/oversight`** — the one skill a human actually
  drives: brief, ask, apply, commit. A cloud tick's end-of-run
  `/oversight audit` is read-only and still the same model; it
  is not a substitute for the owner's own interactive pass.
- **A pull-request review** — a contributor's every chunk lands
  this way already (`agents.md` rule 1); the owner's own
  checkout is where self-approval is least checked, since it
  lands on main directly.

Naming the gap is this chunk's whole job. Closing one trust
cell is `plan/75-loop-failure-modes.md` chunk 75.2's; filing
the rest as candidates is chunk 75.3's.

## See also

- [`architecture.md`](./architecture.md) — the layers a tick
  passes through; Layer 3 is where the gate sits.
- [`plan-shape.md`](./plan-shape.md) — the chunk shape the
  `chunks` leg holds to.
- [`../plan/75-loop-failure-modes.md`](../plan/75-loop-failure-modes.md)
  — the spec this table closes.
