# Customization: the plot report — prose for people, a block for the GUI

> `/plot` reports in prose: the task, what is built, where the
> work would go, when `/next` builds it, the questions only the
> owner can answer, how to move it. Read in a terminal that is
> fine; in the `@usenexus/cli` cockpit it is a wall of text. So
> the report ends with the same facts as data: one fenced block
> tagged `nexus-plot`, holding JSON, which the cockpit draws as a
> card with one-click actions. The prose stays; the block is
> additive, and a terminal reader can skip it.

Nothing to adopt: the block is part of `/plot`'s Step 7
(`skills/plot.md`). This page is its contract.

---

## The block

The last fenced block of the report, opened with
`` ```nexus-plot `` and closed with `` ``` ``. Its body is one JSON
object:

```nexus-plot
{
  "task": "Every board card shows how long ago its chunk last moved",
  "mode": "peek",
  "built": [{ "what": "The card's time label", "where": "src/ui/plan.jsx" }],
  "notBuilt": [{ "what": "A relative clock on the card", "where": "A4" }],
  "notPlanned": [{ "what": "A tooltip with the exact time" }],
  "spec": { "file": "plan/12-board.md", "joined": true },
  "chunks": [{ "id": "12.?ago", "title": "Relative age on board cards", "size": "S",
               "closes": ["A?ago"], "needs": [], "files": ["src/ui/plan.jsx"] }],
  "order": { "before": ["9.2-9.4", "11 (2)", "12.3"],
             "after": ["9.2-9.4", "11 (2)", "12.3", "12.?ago"],
             "lit": ["12.?ago"], "ahead": 5 },
  "questions": [{ "q": "On every card, or only the claimed ones?",
                  "options": ["every card", "claimed only"], "default": "every card" }],
  "move": { "plot": "/plot \"relative age on board cards\"",
            "asap": "/plot asap \"relative age on board cards\"",
            "doNow": "/plot \"relative age on board cards\" and do" }
}
```

| Key | Type | What it holds |
|---|---|---|
| `task` | string, required | The task restated, in the asker's terms. |
| `mode` | `peek` \| `plotted` \| `done`, required | `peek` changed nothing; `plotted` landed the plan; `done` also built it (`and do`). |
| `built`, `notBuilt`, `notPlanned` | lists of `{ what, where? }` | Step 1's research: already built (`where` a file), planned but not built (`where` a spec or an A-ID), neither. |
| `spec` | `{ file, joined }` or absent | The spec it extends (`joined: true`) or the new spec it adds. |
| `chunks` | list of `{ id, title, size, closes, needs, files? }` | Placeholder ids (`NN.?slug`, `A?slug`) before the plot settles. `size` is `S`, `M` or `L`; `closes` and `needs` are id lists (a string splits on commas, `—` is none). |
| `order` | `{ before, after, lit, ahead }` or absent | The build-order pictures as id lists (`order.mjs`'s groups as written); `lit` the new ids; `ahead` how many chunks `/next` builds first. |
| `questions` | list of `{ q, options, default }` | Only questions the owner can answer; `default` is one of `options`, the one taken if nobody answers. |
| `move` | `{ plot?, asap?, doNow? }` | The exact lines that move it, each a single `/plot` or `/next` command. Plotted: `doNow` is `/next <id>`. |

Every list may be absent (it is empty); unknown keys are
ignored. A block that is not JSON or breaks a type is no card:
the cockpit shows it as the code block it is, so a report never
fails to show.

## What the cockpit does with it

- The prose above the block folds behind **Full report**; the
  card takes its place.
- The card: the task and a mode badge; the three research rows,
  tinted; the chunk cards; the build order as a lane of ids,
  the new chunk lit, "behind N chunks" under it; each question
  as an answer card, its default chosen.
- The actions, by mode: `peek` offers **Plot it**, **Plot
  asap** and **Plot and build now** (`move.plot`, `move.asap`,
  `move.doNow`); `plotted` offers **Build now**; `done` none.
  An action sends its command into the same session, followed
  by the chosen answers on the same line:
  `/plot asap "relative age on board cards" Answers: 1) every card 2) seconds`.
  `/plot` reads a trailing `Answers:` as the owner's answers to
  the open questions it asked last, numbered in order.

The validator lives in
[`packages/cli/src/ui/plot-report.js`](../packages/cli/src/ui/plot-report.js);
its tests in `packages/cli/test/plot-card.test.mjs`.
