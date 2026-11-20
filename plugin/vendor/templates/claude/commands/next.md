---
description: Do the next thing on the plan. One chunk, done fully -- picked, claimed, built by a delegated builder, gated, closed, landed per owner mode
argument-hint: "[top | <NN> | <NN.k> | chunk <NN> | batch <NN> | peek | status [NN…] | <free text>] [base <branch>] [--agents | --workflow] [then expand | then build]"
---

You are invoked under the `next` skill: march with no
assumptions, one chunk done fully. Read `skills/next.md` end to
end before touching anything else; it is the single source of
truth. Read `skills/next/build.md` when you cut the worktree or
brief the builder, `skills/next/land.md` when you close and land.

Argument handling:
- No argument → pick the next ready chunk (a contributor is
  asked which, before the first write).
- `top` → the first ready, unclaimed chunk, no question.
- `<NN>` / `<NN.k>` → that spec's next ready chunk / that chunk.
- `chunk <NN>` → only chunk the spec. `batch <NN>` → owner only.
- `peek` → say what is next and why, change nothing.
- `status [NN…]` → print `node scripts/plan/progress.mjs` as is.
- `base <branch>` → build on that branch, land a PR onto it.
- `--agents` / `--workflow` → override the build mode by size.
- `then expand` / `then build` (a loop's tail) → when nothing is
  ready, one `/expand` pass (`build`: `/expand promote`, then keep
  building what it adds); `skills/expand.md` §2.
- Anything else → that text is the run's work.

The lead never builds: S and M chunks go to one builder
subagent, in the background (foreground when headless), L
chunks to a Workflow (build, adversarial verify, fix). While
a builder runs, the lead acts on a board `REBOOT` line. The
lead runs the gate, writes the pending close, lands per owner
mode, releases the claim and runs the retro.

Under `/loop`, `/march` or `/heads-down` the user is not
present: never ask, take the recommended default and list each
one in the close.

Argument: $ARGUMENTS
