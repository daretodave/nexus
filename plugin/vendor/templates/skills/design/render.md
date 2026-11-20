# Board renders and the screenshot compare

> `skills/design.md`'s render and compare in full. A board is
> the design tool's document, not a web page; these two
> commands draw it the way the tool does and say how far a
> screen of the app sits from it. The port's fidelity step
> (`nexus/playbooks/design-handoff.md` Step 5) runs on them, and so
> does any "does this screen match its board" question.

## 1. Render the boards

```bash
node scripts/design/render.mjs <handoff> --out <dir> [--theme night|dawn]
#   --board Board,Inbox   --page cockpit   --jobs 4   --wait 4000   --chrome <path>   --json
```

- The boards and their sizes come from the handoff's
  `canvas.json`; one without it renders every board at its
  `$preview` size. Each lands as `<dir>/<Board>.png`, or
  `<Board>.<theme>.png` with `--theme`.
- The export lacks the tool's runtime (`support.js`).
  `scripts/design/board-runtime.js` stands in for it, in a
  scratch copy: the handoff is never written to.
- `--theme` sets every board and every board it imports to
  night or dawn, and skips a board that only re-imports
  another in a theme (a `*Light` twin). Without it each board
  renders as delivered.
- It needs an installed Chrome (or Chromium, or Edge): found on
  its own, else `--chrome <path>` or `CHROME_PATH`. No Chrome:
  it says so and exits 2.
- Fonts load from the boards' own links (Google Fonts): render
  online, or the fallback faces show.
- Write to a scratch folder, never the repo: renders are
  rebuilt, not kept.

A board that renders wrong prints a `[dc]` line: a tag or a
hole the stand-in does not know. Fix the runtime in
`scripts/design/board-runtime.js` (and send the fix to nexus);
never edit the board.

## 2. Screenshot the app

The same size and theme as the board, with the fixtures the
board shows (the port's mock data, never live data). Any tool
that writes a PNG will do; Chrome's own `--headless
--screenshot --window-size=W,H <url>` is enough for a route.

## 3. Compare

```bash
node scripts/design/compare.mjs <board.png> <app.png> --out <dir>/<Board>.diff.png
#   --threshold 0.1 (per pixel, 0 to 1)   --max <percent> (exit 1 past it)   --json
```

It prints the share of pixels that differ. In the diff PNG,
red is a differing pixel over the board faded grey; yellow is
the area only one of two sizes covers.

Read it as a map, not a verdict: frozen demo states (`.is-hover`),
demo timers and the skip list's patterns differ on purpose.
Look where the red gathers, then compare those elements by eye.
`--max` makes it a check once a screen is settled.

## 4. What it cannot see

Hover, focus, motion and a narrower window: the renders are
still. A live pass in a browser covers those, as a chunk of
its own after the port.
