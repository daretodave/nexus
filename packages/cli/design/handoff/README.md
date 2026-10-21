# The Claude Design handoff

The nexus GUI's design, as delivered by Claude Design on
2026-10-21. This folder is the **source of truth for the UI**:
fidelity reviews diff the app against it, and a screen that
differs from its board is a bug in the screen, not in the board.

- `nexus.css`: every token (colour, type, space, radius,
  elevation, motion, night and dawn) and every component class.
  The app's stylesheet, `src/styles/nexus.css`, is a verbatim copy;
  change both together, or neither.
- `canvas.json`: the index of boards, grouped into pages
  (design system, fleet, cockpit, views, onboarding).
- `*.dc.html`: one board each. A `*Light.dc.html` board only
  re-imports its dark board with `theme="light"`.

The boards are the design tool's documents, not app code. Their
`<x-dc>`, `<helmet>`, `{{holes}}`, `<sc-for>`, `<sc-if>` and
`<dc-import>` tags are its runtime; the app translates them to
React (`src/ui/`, `src/screens/`) and never ships them. The
boards link `./support.js` and Google Fonts, neither of which is
here: the app bundles its fonts offline (`@fontsource`).

This folder is not in the npm package (`package.json` `files`).

## Changes from the delivered files

One edit, so the kit's emoji gate holds: two glyphs in
`HeadsDown.dc.html` have emoji presentations on some systems, so
they are swapped for look-alikes without one (the gate now rejects
the originals; `scripts/verify.mjs`, the emoji leg).

| Was | Now | Where |
|---|---|---|
| U+25C0 (black left-pointing triangle) | U+25C2 (the small one) | the "has 4 questions waiting" pointer |
| U+25AA (black small square) | U+25A0 (black square) | the context legend swatches |

Everything else is byte for byte as delivered.
