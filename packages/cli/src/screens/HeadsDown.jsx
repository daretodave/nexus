// STUB (41.3 foundation). Screen agent: build the heads-down terminal view
// from design/handoff/HeadsDown.dc.html (+ Light) with TuiWrap, Tui, G.
// The handoff's two emoji-presentation glyphs are already swapped there
// (U+25C0 to U+25C2, U+25AA to U+25A0; design/handoff/README.md).
import { TuiWrap, Tui } from '../ui/index.js';

const LINES = [
  [['b', '╭─ '], ['a', 'nexus'], ['k', ' heads-down'], ['b', ' ─╮']],
  [['b', '│  '], ['d', 'arrives with the heads-down screen'], ['b', '  │']],
  [['b', '╰────────────────────────────────────────╯']],
];

export default function HeadsDown() {
  return (
    <TuiWrap>
      <Tui label="Heads-down view" lines={LINES} />
    </TuiWrap>
  );
}
