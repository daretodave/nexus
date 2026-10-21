// A fixed-width character canvas for the heads-down view (HeadsDown board).
// The board is a 120-column box drawn in JetBrains Mono: every row is a run
// of coloured spans (.tui .b .k .d .h .a .v .ok .no .ask .ask-b .tl .th .wr
// .id) and each glyph that must hold a 1ch cell sits in <i class="g">.
// Screens write text at a column; render() folds equal cells into spans, and
// links (react-router), buttons and inline styles into their own wrappers.
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export const WIDTH = 120;

/** The glyphs the board wraps in .g (box-drawing and block elements are not). */
const G_CHARS = new Set([...'·↑↓●✓◂○–◑◔◌◆◜◎✗■↳›§−…']);

const chars = (s) => [...String(s ?? '')];
export const len = (s) => chars(s).length;

/** Pad or cut `s` to exactly `n` columns (an ellipsis marks a cut). */
export function fit(s, n) {
  const c = chars(s);
  if (n <= 0) return '';
  if (c.length > n) return c.slice(0, Math.max(0, n - 1)).join('') + '…';
  return c.join('') + ' '.repeat(n - c.length);
}

/** Cut `s` to at most `n` columns, no padding. */
export function cut(s, n) {
  const c = chars(s);
  return c.length > n ? c.slice(0, Math.max(0, n - 1)).join('') + '…' : c.join('');
}

/**
 * One row of the canvas. put(col, text, cls, wrap) writes and returns the
 * column after the text; `wrap` is { to, label } (a Link) or { onClick, label }
 * (a button), shared by reference across cells; `st` an inline span style.
 */
export function row(width = WIDTH) {
  const cells = Array.from({ length: width }, () => ({ ch: ' ', cls: '', wrap: null, st: null }));
  const r = {
    cells,
    isNew: false,
    key: undefined,
    put(col, text, cls = '', wrap = null, st = null) {
      chars(text).forEach((ch, i) => { if (col + i >= 0 && col + i < width) cells[col + i] = { ch, cls, wrap, st }; });
      return col + len(text);
    },
    /** Write segments [cls, text, wrap?, style?] one after another from `col`. */
    seq(col, segs) {
      let c = col;
      for (const s of segs) if (s) c = r.put(c, s[1], s[0], s[2] || null, s[3] || null);
      return c;
    },
    fill(from, to, ch, cls = 'b') { for (let i = from; i < to; i += 1) r.put(i, ch, cls); return r; },
  };
  return r;
}

/** A framed row: │ at both edges. */
export function framed(width = WIDTH) {
  const r = row(width);
  r.put(0, '│', 'b');
  r.put(width - 1, '│', 'b');
  return r;
}

/** A framed row split at `mid` (the board's two panes): │ … │ … │. */
export function split(mid, width = WIDTH) {
  const r = framed(width);
  r.put(mid, '│', 'b');
  return r;
}

/** A horizontal rule: left, fill, optional junction at `mid`, right. */
export function rule(l, r, mid, j, width = WIDTH) {
  const x = row(width);
  x.fill(0, width, '─', 'b');
  x.put(0, l, 'b');
  x.put(width - 1, r, 'b');
  if (mid != null) x.put(mid, j, 'b');
  return x;
}

function withG(text, key) {
  const out = [];
  let buf = '';
  let n = 0;
  for (const ch of text) {
    if (G_CHARS.has(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push(<i key={`${key}g${n += 1}`} className="g">{ch}</i>);
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function spans(cells, key) {
  const out = [];
  let i = 0;
  while (i < cells.length) {
    const cls = cells[i].cls;
    const style = cells[i].st;
    let text = '';
    let j = i;
    while (j < cells.length && cells[j].cls === cls && cells[j].st === style) { text += cells[j].ch; j += 1; }
    out.push(<span key={`${key}s${i}`} className={cls || undefined} style={style || undefined}>{withG(text, `${key}s${i}`)}</span>);
    i = j;
  }
  return out;
}

/** Render rows as the board's <div> lines inside .tui. */
export function renderRows(rows) {
  return rows.map((r, n) => {
    const parts = [];
    let i = 0;
    while (i < r.cells.length) {
      const w = r.cells[i].wrap;
      let j = i;
      while (j < r.cells.length && r.cells[j].wrap === w) j += 1;
      const inner = spans(r.cells.slice(i, j), `${n}-${i}`);
      if (!w) parts.push(<Fragment key={i}>{inner}</Fragment>);
      else if (w.to) parts.push(<Link key={i} to={w.to} aria-label={w.label}>{inner}</Link>);
      else parts.push(<button key={i} type="button" onClick={w.onClick} aria-label={w.label} style={{ background: 'none', border: 0, padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>{inner}</button>);
      i = j;
    }
    return <div key={r.key ?? n} className={r.isNew ? 'is-new' : undefined}>{parts}</div>;
  });
}
