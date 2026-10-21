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

## How the app departs from the delivered render

Two places where the app draws what the handoff means rather than what
its own render shows, both found in the night fidelity review:

- **The element resets' cascade.** `nexus.css` resets
  `.nx button, .nx input, .nx textarea, .nx select` to `font: inherit;
  color: inherit` and draws `.nx :focus-visible` with an outline. Both
  outrank single-class component rules that follow them, so in the
  boards a `<button class="btn btn-primary">` loses its ink and weight
  (pale text on the aurora gradient), `.btn-s`, `.pause-btn`,
  `.switcher`, `.tug-opt` and `.tool-btn` buttons lose their type size,
  a `.field` input its 14px, and the composer's textarea draws a focus
  box inside the composer's own focus glow. The handoff patches the
  `<a>` cases by hand (`.nx a.btn`, `.nx a.btn-primary`,
  `.nx a.btn-ghost`), which says what it means. `nexus.css` still ships
  verbatim; `vite.config.mjs` wraps those two selectors in `:where()`
  at build time (`repairCascade`, tested), so every component rule wins
  as written.
- **Box-drawing glyphs.** The boards load JetBrains Mono from Google
  Fonts with a `text=` list that includes the box-drawing, block,
  geometric and arrow ranges. The `@fontsource` subsets leave those
  out, and a fallback mono with another advance width pulled the
  heads-down canvas's 120-column rows off their frame.
  `src/styles/mono-symbols.css` serves only those ranges from the full
  JetBrains Mono webfonts (`jetbrains-mono@1.0.6`, OFL-1.1).
